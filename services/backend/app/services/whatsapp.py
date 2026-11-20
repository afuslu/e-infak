"""WhatsApp Business through Meta's Cloud API: client, queue and delivery-status updates.

Each organisation brings its own Meta Business account (phone number id + system-user token) and
approved message templates. Messages are queued in `whatsapp_messages` and sent by the worker
(`dispatch_whatsapp`), so bulk sends survive restarts and show up in one log.

Meta rules that shape this module:
- Business-initiated conversations must use an approved template; free text is only allowed
  within 24 hours of the donor's last message, so free text is offered for single sends only and
  Meta's error is shown when the window is closed.
- Delivery statuses arrive on the webhook (sent / delivered / read / failed) keyed by the wamid.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"
PROVIDER = "whatsapp"
SEND_LIMIT_PER_RUN = 300


@dataclass
class WhatsAppResult:
    ok: bool
    message_id: Optional[str] = None
    error: Optional[str] = None


class WhatsAppError(Exception):
    pass


def normalize_phone(phone: str) -> str:
    """International digits without +: 0532… / 532… / +90 532… → 90532…"""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = "90" + digits[1:]
    elif len(digits) == 10 and digits.startswith("5"):
        digits = "90" + digits
    return digits


def configured(creds: Optional[dict]) -> bool:
    return bool(creds and creds.get("phone_number_id") and creds.get("access_token"))


def _error_text(data: dict, status: int) -> str:
    err = data.get("error") or {}
    message = err.get("error_user_msg") or err.get("message") or f"HTTP {status}"
    code = err.get("code")
    if code == 131047:
        return "24 saatlik konuşma penceresi kapalı: serbest metin yerine onaylı şablon gönderin"
    if code in (190, 10):
        return f"Meta erişim anahtarı geçersiz veya süresi dolmuş ({message})"
    if code == 132001:
        return f"Şablon bulunamadı veya bu dilde onaylı değil ({message})"
    return f"{message}" + (f" (kod {code})" if code else "")


def message_payload(to: str, *, kind: str, template_name: Optional[str] = None, language: str = "tr",
                    params: Optional[list[str]] = None, text: Optional[str] = None) -> dict:
    if kind == "text":
        return {"messaging_product": "whatsapp", "to": to, "type": "text",
                "text": {"preview_url": True, "body": text or ""}}
    template: dict[str, Any] = {"name": template_name, "language": {"code": language or "tr"}}
    if params:
        template["components"] = [{"type": "body", "parameters": [{"type": "text", "text": str(p)} for p in params]}]
    return {"messaging_product": "whatsapp", "to": to, "type": "template", "template": template}


async def post_message(creds: dict, payload: dict, client: Optional[httpx.AsyncClient] = None) -> WhatsAppResult:
    if not configured(creds):
        return WhatsAppResult(ok=False, error="WhatsApp hesabı tanımlı değil")
    own = client is None
    client = client or httpx.AsyncClient(timeout=15.0)
    try:
        res = await client.post(
            f"{GRAPH_API_BASE}/{creds['phone_number_id']}/messages",
            headers={"Authorization": f"Bearer {creds['access_token']}"},
            json=payload,
        )
        data = res.json() if res.content else {}
        if res.is_success:
            return WhatsAppResult(ok=True, message_id=((data.get("messages") or [{}])[0]).get("id"))
        return WhatsAppResult(ok=False, error=_error_text(data, res.status_code))
    except (httpx.HTTPError, ValueError) as exc:
        return WhatsAppResult(ok=False, error=f"Meta'ya ulaşılamadı: {exc}")
    finally:
        if own:
            await client.aclose()


async def list_templates(creds: dict, client: Optional[httpx.AsyncClient] = None) -> list[dict]:
    """Approved templates of the WhatsApp Business account, with their body text and parameter count."""
    waba = (creds or {}).get("business_account_id")
    if not (waba and creds.get("access_token")):
        raise WhatsAppError("Şablonları listelemek için WhatsApp Business hesap kimliği (WABA ID) gerekli")
    own = client is None
    client = client or httpx.AsyncClient(timeout=15.0)
    try:
        res = await client.get(f"{GRAPH_API_BASE}/{waba}/message_templates",
                               params={"limit": 200, "fields": "name,language,status,category,components"},
                               headers={"Authorization": f"Bearer {creds['access_token']}"})
        data = res.json() if res.content else {}
        if not res.is_success:
            raise WhatsAppError(_error_text(data, res.status_code))
    except httpx.HTTPError as exc:
        raise WhatsAppError(f"Meta'ya ulaşılamadı: {exc}") from exc
    finally:
        if own:
            await client.aclose()
    out = []
    for item in data.get("data") or []:
        body = next((c.get("text") or "" for c in item.get("components") or [] if c.get("type") == "BODY"), "")
        out.append({
            "name": item.get("name"), "language": item.get("language"), "status": item.get("status"),
            "category": item.get("category"), "body": body, "param_count": body.count("{{"),
        })
    return out


# --- queue -------------------------------------------------------------------------------------

def render_params(params: list[str], context: dict) -> list[str]:
    """Template parameters may use the SMS variables ({ad}, {soyad}, {tutar}…)."""
    out = []
    for p in params or []:
        value = str(p)
        for key, val in context.items():
            value = value.replace("{" + key + "}", str(val or ""))
        out.append(value)
    return out


async def send_queued(db: AsyncSession, message, creds: dict, client: Optional[httpx.AsyncClient] = None) -> None:
    """Send one queued message and record the outcome (caller commits)."""
    to = normalize_phone(message.phone)
    message.attempts = (message.attempts or 0) + 1
    if len(to) < 10:
        message.status, message.error = "failed", "Geçersiz telefon numarası"
        return
    payload = message_payload(to, kind=message.kind, template_name=message.template_name,
                              language=message.language or creds.get("default_language") or "tr",
                              params=list(message.params or []), text=message.body)
    result = await post_message(creds, payload, client)
    if result.ok:
        message.status, message.provider_ref, message.error = "sent", result.message_id, None
        message.sent_at = datetime.now(timezone.utc)
    else:
        message.status, message.error = "failed", result.error


async def dispatch(session_factory) -> int:
    """Worker: send queued messages, organisation by organisation (beat task, every minute)."""
    from app.models.channels import WhatsAppMessage
    from app.services.tenant_credentials import CredentialsUnavailable, get_credentials

    sent = 0
    async with session_factory() as db:
        org_ids = (await db.execute(
            select(WhatsAppMessage.organization_id).where(WhatsAppMessage.status == "queued").distinct()
        )).scalars().all()
    for org_id in org_ids:
        async with session_factory() as db:
            try:
                creds = await get_credentials(db, org_id, PROVIDER) or {}
            except CredentialsUnavailable:
                continue
            rows = (await db.execute(
                select(WhatsAppMessage).where(WhatsAppMessage.organization_id == org_id,
                                              WhatsAppMessage.status == "queued")
                .order_by(WhatsAppMessage.created_at).limit(SEND_LIMIT_PER_RUN).with_for_update(skip_locked=True)
            )).scalars().all()
            if not configured(creds):
                for row in rows:
                    row.status, row.error = "failed", "WhatsApp hesabı tanımlı değil"
                await db.commit()
                continue
            async with httpx.AsyncClient(timeout=15.0) as client:
                for row in rows:
                    await send_queued(db, row, creds, client)
                    sent += row.status == "sent"
            await db.commit()
    return sent


# --- webhook -----------------------------------------------------------------------------------

STATUS_ORDER = {"queued": 0, "failed": 0, "sent": 1, "delivered": 2, "read": 3}


async def apply_statuses(db: AsyncSession, organization_id: UUID, body: dict) -> int:
    """Apply Meta's delivery statuses from a webhook body; returns how many messages changed."""
    from app.models.channels import WhatsAppMessage

    changed = 0
    for entry in body.get("entry") or []:
        for change in entry.get("changes") or []:
            for status in (change.get("value") or {}).get("statuses") or []:
                ref, state = status.get("id"), status.get("status")
                if not ref or state not in ("sent", "delivered", "read", "failed"):
                    continue
                msg = (await db.execute(select(WhatsAppMessage).where(
                    WhatsAppMessage.organization_id == organization_id, WhatsAppMessage.provider_ref == ref,
                ))).scalar_one_or_none()
                if not msg:
                    continue
                try:
                    at = datetime.fromtimestamp(int(status.get("timestamp")), tz=timezone.utc)
                except (TypeError, ValueError):
                    at = datetime.now(timezone.utc)
                if state == "failed":
                    errors = status.get("errors") or [{}]
                    msg.status = "failed"
                    msg.error = errors[0].get("title") or errors[0].get("message") or "Meta iletimi başarısız"
                elif STATUS_ORDER[state] > STATUS_ORDER.get(msg.status, 0):
                    msg.status = state
                if state == "delivered" and not msg.delivered_at:
                    msg.delivered_at = at
                if state == "read":
                    msg.read_at = msg.read_at or at
                    msg.delivered_at = msg.delivered_at or at
                changed += 1
    return changed


async def cancel_batch(db: AsyncSession, organization_id: UUID, batch_id: UUID) -> int:
    from app.models.channels import WhatsAppMessage

    result = await db.execute(update(WhatsAppMessage).where(
        WhatsAppMessage.organization_id == organization_id, WhatsAppMessage.batch_id == batch_id,
        WhatsAppMessage.status == "queued",
    ).values(status="failed", error="İptal edildi"))
    return result.rowcount or 0
