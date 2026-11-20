"""NetGSM Netsantral (cloud PBX): click-to-call and the PBX's call events.

Source: https://www.netgsm.com.tr/netsantraldokuman/ (read 2026-11-20).

- Click-to-call: HTTP GET https://crmsntrl.netgsm.com.tr/<santral>/originate with the santral number
  as username and an API-authorised sub-user's password. originate_order=if rings the staff
  member's extension first, then the donor.
- Call events: "URLe Yönlendirme" (Netsantral › Ayarlar › Genel Ayarlar › API Talep Ayarları)
  posts JSON for every step: Inbound_call / Outbound_call (ringing), Answer, Hangup and, after the
  call, a `cdr` record with duration, final state and the recording link. The cdr carries no
  unique_id, so it is matched to the call by phone number and time.
- The PBX does not sign its posts: the secret in our URL is the only check.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.integrations import display_phone, find_donor_by_phone, phone_key

PROVIDER = "netsantral"
BASE = "https://crmsntrl.netgsm.com.tr"
RINGING_EVENTS = {"Inbound_call", "InboundtoPBX", "Outbound_call", "Queue"}
# cdr "sondurum": 1 answered, 2 missed, 3 busy, 4 timeout, 5 failed
FINAL_STATES = {1: "ended", 2: "missed", 3: "busy", 4: "missed", 5: "failed"}


class NetsantralError(Exception):
    pass


def configured(creds: Optional[dict]) -> bool:
    return bool(creds and creds.get("pbx_number") and creds.get("username") and creds.get("password"))


def _digits(value: Optional[str]) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def pbx_number(creds: dict) -> str:
    return _digits(creds.get("pbx_number")).lstrip("0")


def originate_params(creds: dict, customer_phone: str, extension: str, crm_id: str) -> dict:
    key = phone_key(customer_phone)
    return {
        "username": _digits(creds.get("username")).lstrip("0") or pbx_number(creds),
        "password": creds.get("password") or "",
        "customer_num": f"0{key}" if len(key) == 10 else _digits(customer_phone),
        "pbxnum": pbx_number(creds),
        "internal_num": str(extension).strip(),
        "ring_timeout": 30,
        "crm_id": crm_id,
        "wait_response": 0,
        "originate_order": "if",
        "trunk": _digits(creds.get("trunk")).lstrip("0") or pbx_number(creds),
    }


async def originate(creds: dict, customer_phone: str, extension: str, crm_id: str,
                    client: Optional[httpx.AsyncClient] = None) -> dict:
    """Start a call: the extension rings first, then the donor. Returns the PBX's JSON answer."""
    if not configured(creds):
        raise NetsantralError("Netsantral hesabı tanımlı değil")
    if not str(extension or "").strip():
        raise NetsantralError("Profilinizde santral dahili numaranız yok")
    if len(phone_key(customer_phone)) < 10:
        raise NetsantralError("Geçerli bir telefon numarası yok")
    own = client is None
    client = client or httpx.AsyncClient(timeout=20.0)
    try:
        res = await client.get(f"{BASE}/{pbx_number(creds)}/originate",
                               params=originate_params(creds, customer_phone, extension, crm_id))
        try:
            data = res.json()
        except ValueError:
            data = {"status": "error", "message": (res.text or "").strip()[:200] or f"HTTP {res.status_code}"}
    except httpx.HTTPError as exc:
        raise NetsantralError(f"Santrale ulaşılamadı: {exc}") from exc
    finally:
        if own:
            await client.aclose()
    if str(data.get("status")).lower() != "success":
        message = str(data.get("message") or "Bilinmeyen hata")
        hints = {
            "No registration": "Dahili veya hat santrale bağlı değil (telefon/softphone açık mı?)",
            "Kullanıcı doğrulanamadi": "Santral kullanıcı adı veya şifresi hatalı",
            "Eksik yada yanlis parametre 2": "Dahili numarası veya trunk hatalı",
        }
        raise NetsantralError(hints.get(message.strip(), message))
    return data


def _ts(value) -> Optional[datetime]:
    try:
        number = int(str(value))
    except (TypeError, ValueError):
        return None
    if number > 10**12:  # milliseconds
        number //= 1000
    return datetime.fromtimestamp(number, tz=timezone.utc) if number > 0 else None


def _cdr_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        from zoneinfo import ZoneInfo
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("Europe/Istanbul"))
    except ValueError:
        return None


async def _attach_donor(db: AsyncSession, organization_id: UUID, call) -> None:
    if call.donor_id or not call.customer_phone:
        return
    donor = await find_donor_by_phone(db, organization_id, call.customer_phone)
    if donor:
        call.donor_id = donor.id


async def apply_event(db: AsyncSession, organization_id: UUID, event: dict):
    """Fold one PBX event into the call log (caller commits). Returns the CallLog or None."""
    from app.models.channels import CallLog

    scenario = str(event.get("scenario") or "")
    if scenario.lower() == "cdr":
        return await _apply_cdr(db, organization_id, event)
    unique_id = str(event.get("unique_id") or "").strip()
    if not unique_id or scenario not in RINGING_EVENTS | {"Answer", "Hangup", "Local_call"}:
        return None
    if scenario == "Local_call":
        return None  # extension to extension: not a donor call
    now = _ts(event.get("timestamp")) or datetime.now(timezone.utc)
    call = (await db.execute(select(CallLog).where(
        CallLog.organization_id == organization_id, CallLog.provider == PROVIDER, CallLog.unique_id == unique_id,
    ))).scalar_one_or_none()
    if call is None:
        call = CallLog(organization_id=organization_id, provider=PROVIDER, unique_id=unique_id, started_at=now,
                       direction="out" if scenario == "Outbound_call" or str(event.get("yon")) == "2" else "in")
        db.add(call)
    customer = event.get("customer_num")
    if customer and not call.customer_phone:
        call.customer_phone = display_phone(customer)[:20]
    extension = event.get("internal_num") or (event.get("pbx_num") if scenario == "Inbound_call" else None)
    if extension and len(_digits(extension)) <= 6:
        call.extension = str(extension)[:20]
    call.last_event = scenario[:20]
    if scenario in RINGING_EVENTS and call.status == "ringing":
        pass
    elif scenario == "Answer":
        call.status, call.answered_at = "answered", call.answered_at or now
    elif scenario == "Hangup":
        call.ended_at = now
        talk = event.get("talktime")
        if talk not in (None, ""):
            try:
                call.talk_seconds = int(talk)
            except (TypeError, ValueError):
                pass
        final = FINAL_STATES.get(int(event["sondurum"])) if str(event.get("sondurum") or "").isdigit() else None
        call.status = final or ("ended" if call.answered_at or (call.talk_seconds or 0) > 0 else "missed")
    await _attach_donor(db, organization_id, call)
    await db.flush()
    return call


async def _apply_cdr(db: AsyncSession, organization_id: UUID, event: dict):
    """The final record: duration, state and the recording link, matched to the call by phone and time."""
    from app.models.channels import CallLog

    direction = "out" if str(event.get("yon")) == "2" else "in"
    customer = event.get("aranan") if direction == "out" else event.get("arayan")
    key = phone_key(customer)
    started = _cdr_time(event.get("bas")) or _ts(event.get("timestamp")) or datetime.now(timezone.utc)
    call = None
    if len(key) == 10:
        candidates = (await db.execute(select(CallLog).where(
            CallLog.organization_id == organization_id, CallLog.provider == PROVIDER,
            CallLog.started_at >= started - timedelta(minutes=10), CallLog.started_at <= started + timedelta(hours=2),
            CallLog.recording_url.is_(None),
        ).order_by(CallLog.started_at))).scalars().all()
        call = next((c for c in candidates if phone_key(c.customer_phone) == key), None)
    if call is None:
        ref = str(event.get("asteriskId") or event.get("kimlik") or uuid4())
        call = (await db.execute(select(CallLog).where(
            CallLog.organization_id == organization_id, CallLog.provider == PROVIDER,
            CallLog.unique_id == f"cdr-{ref}"[:80],
        ))).scalar_one_or_none()
        if call is None:
            call = CallLog(organization_id=organization_id, provider=PROVIDER, unique_id=f"cdr-{ref}"[:80],
                           direction=direction, started_at=started,
                           customer_phone=display_phone(customer)[:20] if customer else None)
            db.add(call)
    try:
        duration = int(event.get("sure"))
    except (TypeError, ValueError):
        duration = None
    if duration is not None:
        call.talk_seconds = duration
    state = FINAL_STATES.get(int(event["sondurum"])) if str(event.get("sondurum") or "").isdigit() else None
    if state:
        call.status = state
    elif call.status in ("ringing", "answered"):
        call.status = "ended"
    if event.get("seskaydi"):
        call.recording_url = str(event["seskaydi"])[:500]
    call.ended_at = call.ended_at or (started + timedelta(seconds=duration or 0))
    call.last_event = "cdr"
    await _attach_donor(db, organization_id, call)
    await db.flush()
    return call
