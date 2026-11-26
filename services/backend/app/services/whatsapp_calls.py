"""WhatsApp voice calls through Meta's Calling API.

Two ways an organisation can take WhatsApp calls:

- In the browser: Meta sends the donor's call on the "calls" webhook with a WebRTC SDP offer.
  A staff member's admin panel answers it (getUserMedia + RTCPeerConnection); the answer SDP goes
  back to Meta with `pre_accept` and then `accept`. Calls not answered in about 30-60 seconds end
  as missed. Staff can also call a donor who gave call permission (`connect` with our offer;
  Meta's answer SDP arrives on the webhook).
- Over SIP: calls are forwarded to the organisation's own PBX (settings `calling.sip`); the Graph
  calling endpoints then stop working for that number and only the call log arrives here.

Meta enables calling only for numbers with a messaging limit of 2,000 or more.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import whatsapp as wa

logger = logging.getLogger(__name__)
DAYS = ("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")


def settings_payload(spec: dict) -> dict:
    """Our calling form → Meta's `calling` settings object."""
    calling: dict[str, Any] = {
        "status": "ENABLED" if spec.get("enabled") else "DISABLED",
        "call_icon_visibility": "DEFAULT" if spec.get("show_call_icon", True) else "DISABLE_ALL",
        "callback_permission_status": "ENABLED" if spec.get("callback_permission", True) else "DISABLED",
    }
    hours = spec.get("hours") or []
    if spec.get("hours_enabled") and hours:
        calling["call_hours"] = {
            "status": "ENABLED", "timezone_id": spec.get("timezone") or "Europe/Istanbul",
            "weekly_operating_hours": [
                {"day_of_week": h["day"], "open_time": h["open"].replace(":", ""), "close_time": h["close"].replace(":", "")}
                for h in hours if h.get("day") in DAYS and h.get("open") and h.get("close")
            ],
        }
    elif "hours_enabled" in spec:
        calling["call_hours"] = {"status": "DISABLED", "timezone_id": spec.get("timezone") or "Europe/Istanbul",
                                 "weekly_operating_hours": []}
    sip = spec.get("sip") or {}
    if sip.get("enabled") and (sip.get("hostname") or "").strip():
        calling["sip"] = {"status": "ENABLED", "webhook_delivery": "ENABLED", "servers": [
            {"hostname": sip["hostname"].strip(), "port": str(sip.get("port") or "5061")}]}
    elif "sip" in spec:
        calling["sip"] = {"status": "DISABLED"}
    return {"calling": calling}


def settings_from_meta(data: dict) -> dict:
    calling = (data or {}).get("calling") or {}
    hours = calling.get("call_hours") or {}
    sip = calling.get("sip") or {}
    server = (sip.get("servers") or [{}])[0]
    return {
        "enabled": calling.get("status") == "ENABLED",
        "show_call_icon": calling.get("call_icon_visibility", "DEFAULT") != "DISABLE_ALL",
        "callback_permission": calling.get("callback_permission_status") == "ENABLED",
        "hours_enabled": hours.get("status") == "ENABLED",
        "timezone": hours.get("timezone_id") or "Europe/Istanbul",
        "hours": [{"day": h.get("day_of_week"), "open": _hhmm(h.get("open_time")), "close": _hhmm(h.get("close_time"))}
                  for h in hours.get("weekly_operating_hours") or []],
        "sip": {"enabled": sip.get("status") == "ENABLED", "hostname": server.get("hostname") or "",
                "port": server.get("port") or "5061"},
        "restrictions": [r.get("type") for r in ((calling.get("restrictions") or {}).get("restrictions_list") or [])],
    }


def _hhmm(value: Optional[str]) -> str:
    value = str(value or "")
    return f"{value[:2]}:{value[2:4]}" if len(value) == 4 else value


async def get_settings(creds: dict, client: Optional[httpx.AsyncClient] = None) -> dict:
    result = await wa._graph(creds, "GET", f"{creds['phone_number_id']}/settings", client)
    if not result.ok:
        raise wa.WhatsAppError(result.error or "Arama ayarları okunamadı")
    return settings_from_meta(result.data or {})


async def save_settings(creds: dict, spec: dict, client: Optional[httpx.AsyncClient] = None) -> None:
    result = await wa._graph(creds, "POST", f"{creds['phone_number_id']}/settings", client, json=settings_payload(spec))
    if not result.ok:
        message = result.error or "Arama ayarları kaydedilemedi"
        if "2000" in message or "messaging limit" in message.lower():
            message += " — Meta aramayı yalnızca günlük 2.000 ve üzeri mesaj limitli numaralarda açıyor"
        raise wa.WhatsAppError(message)


async def call_action(creds: dict, call_id: str, action: str, sdp: Optional[str] = None,
                      client: Optional[httpx.AsyncClient] = None) -> None:
    body: dict[str, Any] = {"messaging_product": "whatsapp", "call_id": call_id, "action": action}
    if sdp:
        body["session"] = {"sdp_type": "answer", "sdp": sdp}
    result = await wa._graph(creds, "POST", f"{creds['phone_number_id']}/calls", client, json=body)
    if not result.ok:
        raise wa.WhatsAppError(result.error or f"Arama işlemi ({action}) yapılamadı")


async def start_call(creds: dict, to: str, sdp_offer: str, client: Optional[httpx.AsyncClient] = None) -> str:
    result = await wa._graph(creds, "POST", f"{creds['phone_number_id']}/calls", client, json={
        "messaging_product": "whatsapp", "to": wa.normalize_phone(to), "action": "connect",
        "session": {"sdp_type": "offer", "sdp": sdp_offer},
    })
    call_id = ((result.data or {}).get("calls") or [{}])[0].get("id") if result.ok else None
    if not call_id:
        raise wa.WhatsAppError(result.error or "Arama başlatılamadı")
    return call_id


async def call_permission(creds: dict, phone: str, client: Optional[httpx.AsyncClient] = None) -> str:
    """no_permission | temporary | permanent"""
    result = await wa._graph(creds, "GET", f"{creds['phone_number_id']}/call_permissions", client,
                             params={"user_wa_id": wa.normalize_phone(phone)})
    if not result.ok:
        raise wa.WhatsAppError(result.error or "Arama izni sorgulanamadı")
    return ((result.data or {}).get("permission") or {}).get("status") or "no_permission"


def _at(value) -> Optional[datetime]:
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


async def apply_call_events(db: AsyncSession, org_id: UUID, body: dict) -> list:
    """Meta's "calls" webhook: build the call log; returns calls that just started ringing."""
    from app.models.channels import WhatsAppCall
    from app.services.whatsapp_inbox import conversation_for

    ringing = []
    for entry in body.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") != "calls":
                continue
            value = change.get("value") or {}
            for item in value.get("calls") or []:
                call_id = item.get("id")
                if not call_id:
                    continue
                call = (await db.execute(select(WhatsAppCall).where(
                    WhatsAppCall.organization_id == org_id, WhatsAppCall.call_id == call_id,
                ))).scalar_one_or_none()
                direction = item.get("direction") or "USER_INITIATED"
                other = item.get("from") if direction == "USER_INITIATED" else item.get("to")
                event = item.get("event")
                if call is None:
                    conv = await conversation_for(db, org_id, other or "")
                    call = WhatsAppCall(organization_id=org_id, call_id=call_id, direction=direction, status="ringing",
                                        phone=wa.normalize_phone(other or "")[:20] or "-",
                                        donor_id=conv.donor_id if conv else None,
                                        conversation_id=conv.id if conv else None,
                                        started_at=_at(item.get("timestamp")) or datetime.now(timezone.utc))
                    db.add(call)
                session = item.get("session") or {}
                if event == "connect":
                    if session.get("sdp_type") == "offer":
                        call.sdp_offer = session.get("sdp")
                        if call.status == "ringing":
                            ringing.append(call)
                    elif session.get("sdp_type") == "answer":
                        call.sdp_answer = session.get("sdp")
                        call.status = "connected"
                        call.connected_at = call.connected_at or datetime.now(timezone.utc)
                elif event == "terminate":
                    call.ended_at = _at(item.get("end_time")) or datetime.now(timezone.utc)
                    call.duration_seconds = item.get("duration")
                    if item.get("start_time"):
                        call.connected_at = call.connected_at or _at(item.get("start_time"))
                    if item.get("status") == "FAILED" and (item.get("errors") or []):
                        call.error = (item["errors"][0].get("message") or item["errors"][0].get("title"))
                    call.status = "ended" if call.duration_seconds or call.connected_at else (
                        "rejected" if call.status == "rejected" else "missed")
                await db.flush()
            for status in value.get("statuses") or []:
                if status.get("type") != "call" or not status.get("id"):
                    continue
                call = (await db.execute(select(WhatsAppCall).where(
                    WhatsAppCall.organization_id == org_id, WhatsAppCall.call_id == status["id"],
                ))).scalar_one_or_none()
                if not call:
                    continue
                state = (status.get("status") or "").upper()
                if state == "ACCEPTED":
                    call.status = "connected"
                    call.connected_at = call.connected_at or _at(status.get("timestamp"))
                elif state == "REJECTED":
                    call.status = "rejected"
    return ringing


async def notify_ringing(db: AsyncSession, org_id: UUID, calls: list) -> None:
    from app.models.donation import Donor
    from app.services import staff_notify

    if not calls:
        return
    try:
        staff = [u for u in await staff_notify._staff(db, org_id)
                 if staff_notify._can(u, "sms.send") or staff_notify._can(u, "settings.manage")]
        for call in calls:
            donor = await db.get(Donor, call.donor_id) if call.donor_id else None
            await staff_notify.deliver(
                db, org_id, staff, kind="whatsapp_call", setting="whatsapp_inbox",
                title="WhatsApp araması", body=f"{donor.full_name if donor else call.phone} arıyor",
                channel="whatsapp", data={"call_id": str(call.id), "url": "/admin/whatsapp?tab=calls"},
            )
    except Exception:  # noqa: BLE001
        logger.exception("WhatsApp arama bildirimi gönderilemedi")
