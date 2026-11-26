"""WhatsApp Business through Meta's Cloud API: client, queue and delivery-status updates.

Each organisation brings its own Meta Business account (phone number id + system-user token) and
approved message templates. Messages are queued in `whatsapp_messages` and sent by the worker
(`dispatch_whatsapp`), so bulk sends survive restarts and show up in one log.

Meta rules that shape this module:
- Business-initiated conversations must use an approved template; free text, media and buttons
  are only allowed within 24 hours of the donor's last message (the inbox shows the window).
- Delivery statuses arrive on the webhook (sent / delivered / read / failed) keyed by the wamid.
- A message that fails may carry an SMS fallback, which is queued when Meta gives up.

Related modules: `whatsapp_inbox` (incoming messages, consent, auto replies), `whatsapp_events`
(automatic notifications on donation events) and `whatsapp_calls` (Calling API).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import httpx
from sqlalchemy import event, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"
PROVIDER = "whatsapp"
SEND_LIMIT_PER_RUN = 300
WINDOW = timedelta(hours=24)
MEDIA_KINDS = ("image", "document", "audio", "video", "sticker")
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # nginx caps request bodies at 8 MB
UPLOAD_TYPES = {
    "image/jpeg": "image", "image/png": "image",
    "application/pdf": "document", "application/msword": "document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
    "application/vnd.ms-excel": "document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
    "text/plain": "document",
    "audio/mpeg": "audio", "audio/ogg": "audio", "audio/aac": "audio", "audio/mp4": "audio",
    "video/mp4": "video", "video/3gpp": "video",
}


@dataclass
class WhatsAppResult:
    ok: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    data: Optional[dict] = None


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


def window_open(last_inbound_at: Optional[datetime], now: Optional[datetime] = None) -> bool:
    return bool(last_inbound_at and (now or datetime.now(timezone.utc)) - last_inbound_at < WINDOW)


def verify_signature(app_secret: Optional[str], raw_body: bytes, header: Optional[str]) -> bool:
    """X-Hub-Signature-256 check; without an app secret on file every body is accepted (older setups)."""
    if not app_secret:
        return True
    expected = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return bool(header) and hmac.compare_digest(expected, header.strip())


ERRORS = {
    131047: "24 saatlik konuşma penceresi kapalı: serbest metin yerine onaylı şablon gönderin",
    131026: "Numara WhatsApp kullanmıyor veya mesajı alamıyor",
    131050: "Bağışçı bu işletmeden pazarlama mesajı almayı durdurmuş",
    131049: "Meta, alıcıya bu dönemde gönderilen pazarlama mesajı sınırına takıldığı için iletmedi",
    131056: "Aynı numaraya çok hızlı mesaj gönderildi; biraz sonra tekrar deneyin",
    130429: "Meta gönderim hızı sınırı aşıldı; kuyruk biraz sonra devam eder",
    131048: "Numaranın kalite puanı nedeniyle gönderim sınırlandı (spam bildirimi)",
    132000: "Şablon değişken sayısı uyuşmuyor",
    132012: "Şablon değişken biçimi uyuşmuyor",
    368: "Hesap Meta politikası nedeniyle geçici olarak kısıtlandı",
    138006: "Bu kişiden arama izni yok: önce arama izni isteyin",
}


def _error_text(data: dict, status: int) -> str:
    err = data.get("error") or {}
    message = err.get("error_user_msg") or err.get("message") or f"HTTP {status}"
    code = err.get("code")
    if code in ERRORS:
        return ERRORS[code]
    if code in (190, 10):
        return f"Meta erişim anahtarı geçersiz veya süresi dolmuş ({message})"
    if code == 132001:
        return f"Şablon bulunamadı veya bu dilde onaylı değil ({message})"
    return f"{message}" + (f" (kod {code})" if code else "")


# --- payloads ----------------------------------------------------------------------------------

def _clip(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def interactive_payload(spec: dict) -> dict:
    """Our compact interactive spec → Meta's object.

    {type: "button", body, header?, footer?, buttons: [{id, title}]}      up to 3 reply buttons
    {type: "list", body, button, sections: [{title, rows: [{id, title, description?}]}]}
    {type: "cta_url", body, display_text, url}
    {type: "call_permission_request", body?}
    """
    kind = spec.get("type")
    if kind == "call_permission_request":
        out: dict[str, Any] = {"type": kind, "action": {"name": "call_permission_request"}}
        if spec.get("body"):
            out["body"] = {"text": _clip(spec["body"], 1024)}
        return out
    out = {"type": kind, "body": {"text": _clip(spec.get("body"), 1024)}}
    if spec.get("header"):
        out["header"] = {"type": "text", "text": _clip(spec["header"], 60)}
    if spec.get("footer"):
        out["footer"] = {"text": _clip(spec["footer"], 60)}
    if kind == "button":
        out["action"] = {"buttons": [
            {"type": "reply", "reply": {"id": _clip(b.get("id") or f"btn{i + 1}", 256), "title": _clip(b.get("title"), 20)}}
            for i, b in enumerate((spec.get("buttons") or [])[:3]) if (b.get("title") or "").strip()
        ]}
    elif kind == "list":
        out["action"] = {"button": _clip(spec.get("button") or "Seçenekler", 20), "sections": [
            {"title": _clip(s.get("title") or "Seçenekler", 24), "rows": [
                {"id": _clip(r.get("id") or f"row{j + 1}", 200), "title": _clip(r.get("title"), 24),
                 **({"description": _clip(r["description"], 72)} if r.get("description") else {})}
                for j, r in enumerate((s.get("rows") or [])[:10]) if (r.get("title") or "").strip()
            ]} for s in (spec.get("sections") or [])[:10]
        ]}
    elif kind == "cta_url":
        out["action"] = {"name": "cta_url", "parameters": {
            "display_text": _clip(spec.get("display_text") or "Aç", 20), "url": _clip(spec.get("url"), 2000)}}
    return out


def validate_interactive(spec: dict) -> Optional[str]:
    kind = spec.get("type")
    if kind not in ("button", "list", "cta_url", "call_permission_request"):
        return "Bilinmeyen etkileşimli mesaj türü"
    if kind != "call_permission_request" and not (spec.get("body") or "").strip():
        return "Mesaj metni boş olamaz"
    if kind == "button" and not any((b.get("title") or "").strip() for b in spec.get("buttons") or []):
        return "En az bir buton yazın"
    if kind == "button" and any(len((b.get("title") or "").strip()) > 20 for b in spec.get("buttons") or []):
        return "Buton yazısı en fazla 20 karakter olabilir"
    if kind == "list" and not any((r.get("title") or "").strip() for s in spec.get("sections") or [] for r in s.get("rows") or []):
        return "Listeye en az bir satır ekleyin"
    if kind == "cta_url" and not re.match(r"^https?://", spec.get("url") or ""):
        return "Buton bağlantısı http(s):// ile başlamalı"
    return None


def message_payload(to: str, *, kind: str, template_name: Optional[str] = None, language: str = "tr",
                    params: Optional[list[str]] = None, text: Optional[str] = None, media: Optional[dict] = None,
                    interactive: Optional[dict] = None, reply_to: Optional[str] = None) -> dict:
    base: dict[str, Any] = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": to}
    if reply_to:
        base["context"] = {"message_id": reply_to}
    if kind == "text":
        return {**base, "type": "text", "text": {"preview_url": True, "body": text or ""}}
    if kind in MEDIA_KINDS:
        obj: dict[str, Any] = {"id": media["id"]} if (media or {}).get("id") else {"link": (media or {}).get("link")}
        if text and kind in ("image", "document", "video"):
            obj["caption"] = text[:1024]
        if kind == "document" and (media or {}).get("filename"):
            obj["filename"] = media["filename"]
        return {**base, "type": kind, kind: obj}
    if kind == "interactive":
        return {**base, "type": "interactive", "interactive": interactive_payload(interactive or {})}
    template: dict[str, Any] = {"name": template_name, "language": {"code": language or "tr"}}
    components = []
    header = (media or {}).get("header")
    if header and header.get("type") in ("image", "document", "video") and header.get("link"):
        obj = {"link": header["link"]}
        if header["type"] == "document" and header.get("filename"):
            obj["filename"] = header["filename"]
        components.append({"type": "header", "parameters": [{"type": header["type"], header["type"]: obj}]})
    if params:
        components.append({"type": "body", "parameters": [{"type": "text", "text": str(p) or "-"} for p in params]})
    if components:
        template["components"] = components
    return {**base, "type": "template", "template": template}


# --- Graph API calls ---------------------------------------------------------------------------

async def _graph(creds: dict, method: str, path: str, client: Optional[httpx.AsyncClient] = None,
                 **kwargs) -> WhatsAppResult:
    if not (creds or {}).get("access_token"):
        return WhatsAppResult(ok=False, error="WhatsApp hesabı tanımlı değil")
    own = client is None
    client = client or httpx.AsyncClient(timeout=20.0)
    try:
        res = await client.request(method, f"{GRAPH_API_BASE}/{path.lstrip('/')}",
                                   headers={"Authorization": f"Bearer {creds['access_token']}"}, **kwargs)
        data = res.json() if res.content else {}
        if res.is_success:
            return WhatsAppResult(ok=True, data=data if isinstance(data, dict) else {"data": data})
        return WhatsAppResult(ok=False, error=_error_text(data if isinstance(data, dict) else {}, res.status_code),
                              data=data if isinstance(data, dict) else None)
    except (httpx.HTTPError, ValueError) as exc:
        return WhatsAppResult(ok=False, error=f"Meta'ya ulaşılamadı: {exc}")
    finally:
        if own:
            await client.aclose()


async def post_message(creds: dict, payload: dict, client: Optional[httpx.AsyncClient] = None) -> WhatsAppResult:
    if not configured(creds):
        return WhatsAppResult(ok=False, error="WhatsApp hesabı tanımlı değil")
    result = await _graph(creds, "POST", f"{creds['phone_number_id']}/messages", client, json=payload)
    if result.ok:
        result.message_id = ((result.data or {}).get("messages") or [{}])[0].get("id")
    return result


async def mark_read(creds: dict, wamid: str, client: Optional[httpx.AsyncClient] = None) -> bool:
    if not configured(creds) or not wamid:
        return False
    result = await _graph(creds, "POST", f"{creds['phone_number_id']}/messages", client,
                          json={"messaging_product": "whatsapp", "status": "read", "message_id": wamid})
    return result.ok


async def phone_info(creds: dict, client: Optional[httpx.AsyncClient] = None) -> dict:
    """Display number, verified name, quality and messaging tier of the number (account health)."""
    if not configured(creds):
        return {}
    result = await _graph(creds, "GET", creds["phone_number_id"], client, params={
        "fields": "display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status,throughput",
    })
    if not result.ok:
        return {"error": result.error}
    return result.data or {}


async def upload_media(creds: dict, content: bytes, mime_type: str, filename: str,
                       client: Optional[httpx.AsyncClient] = None) -> str:
    if not configured(creds):
        raise WhatsAppError("WhatsApp hesabı tanımlı değil")
    result = await _graph(creds, "POST", f"{creds['phone_number_id']}/media", client,
                          data={"messaging_product": "whatsapp", "type": mime_type},
                          files={"file": (filename, content, mime_type)})
    if not result.ok or not (result.data or {}).get("id"):
        raise WhatsAppError(result.error or "Dosya Meta'ya yüklenemedi")
    return result.data["id"]


async def download_media(creds: dict, media_id: str, client: Optional[httpx.AsyncClient] = None) -> tuple[bytes, str]:
    """Bytes and content type of an incoming media file (Meta keeps them for about 30 days)."""
    own = client is None
    client = client or httpx.AsyncClient(timeout=30.0)
    try:
        meta = await _graph(creds, "GET", media_id, client)
        if not meta.ok or not (meta.data or {}).get("url"):
            raise WhatsAppError(meta.error or "Dosya Meta'da bulunamadı (süresi dolmuş olabilir)")
        res = await client.get(meta.data["url"], headers={"Authorization": f"Bearer {creds['access_token']}"})
        if not res.is_success:
            raise WhatsAppError(f"Dosya indirilemedi (HTTP {res.status_code})")
        return res.content, meta.data.get("mime_type") or res.headers.get("content-type") or "application/octet-stream"
    except httpx.HTTPError as exc:
        raise WhatsAppError(f"Meta'ya ulaşılamadı: {exc}") from exc
    finally:
        if own:
            await client.aclose()


# --- templates ---------------------------------------------------------------------------------

def _template_row(item: dict) -> dict:
    components = item.get("components") or []
    body = next((c.get("text") or "" for c in components if c.get("type") == "BODY"), "")
    header = next((c for c in components if c.get("type") == "HEADER"), None)
    footer = next((c.get("text") for c in components if c.get("type") == "FOOTER"), None)
    buttons = next((c.get("buttons") or [] for c in components if c.get("type") == "BUTTONS"), [])
    return {
        "id": item.get("id"), "name": item.get("name"), "language": item.get("language"),
        "status": item.get("status"), "category": item.get("category"), "body": body,
        "param_count": len(set(re.findall(r"\{\{(\w+)\}\}", body))),
        "header_format": (header or {}).get("format"), "header_text": (header or {}).get("text"),
        "footer": footer, "buttons": [{"type": b.get("type"), "text": b.get("text"), "url": b.get("url"),
                                       "phone_number": b.get("phone_number")} for b in buttons],
        "rejected_reason": item.get("rejected_reason") if item.get("rejected_reason") not in (None, "NONE") else None,
        "quality": (item.get("quality_score") or {}).get("score"),
    }


async def list_templates(creds: dict, client: Optional[httpx.AsyncClient] = None, *,
                         approved_only: bool = False) -> list[dict]:
    """Templates of the WhatsApp Business account, with their body text and parameter count."""
    waba = (creds or {}).get("business_account_id")
    if not (waba and creds.get("access_token")):
        raise WhatsAppError("Şablonları listelemek için WhatsApp Business hesap kimliği (WABA ID) gerekli")
    result = await _graph(creds, "GET", f"{waba}/message_templates", client, params={
        "limit": 250, "fields": "id,name,language,status,category,components,rejected_reason,quality_score"})
    if not result.ok:
        raise WhatsAppError(result.error or "Şablonlar alınamadı")
    out = [_template_row(item) for item in (result.data or {}).get("data") or []]
    return [t for t in out if t["status"] == "APPROVED"] if approved_only else out


TEMPLATE_NAME = re.compile(r"^[a-z0-9_]{1,512}$")


def template_components(spec: dict) -> list[dict]:
    """Our template form → Meta components (BODY examples are required when it has variables)."""
    body = (spec.get("body") or "").strip()
    count = len(set(re.findall(r"\{\{(\d+)\}\}", body)))
    examples = [str(x) for x in (spec.get("examples") or [])][:count]
    examples += [f"örnek{i + 1}" for i in range(len(examples), count)]
    components: list[dict] = []
    header = spec.get("header") or {}
    if header.get("format") == "TEXT" and (header.get("text") or "").strip():
        components.append({"type": "HEADER", "format": "TEXT", "text": header["text"].strip()[:60]})
    body_component: dict[str, Any] = {"type": "BODY", "text": body}
    if count:
        body_component["example"] = {"body_text": [examples]}
    components.append(body_component)
    if (spec.get("footer") or "").strip():
        components.append({"type": "FOOTER", "text": spec["footer"].strip()[:60]})
    buttons = []
    for b in (spec.get("buttons") or [])[:10]:
        text = (b.get("text") or "").strip()[:25]
        if not text:
            continue
        if b.get("type") == "URL" and b.get("url"):
            buttons.append({"type": "URL", "text": text, "url": b["url"].strip()})
        elif b.get("type") == "PHONE_NUMBER" and b.get("phone_number"):
            buttons.append({"type": "PHONE_NUMBER", "text": text, "phone_number": "+" + normalize_phone(b["phone_number"])})
        elif b.get("type") == "QUICK_REPLY":
            buttons.append({"type": "QUICK_REPLY", "text": text})
    if buttons:
        components.append({"type": "BUTTONS", "buttons": buttons})
    return components


async def create_template(creds: dict, spec: dict, client: Optional[httpx.AsyncClient] = None) -> dict:
    waba = (creds or {}).get("business_account_id")
    if not waba:
        raise WhatsAppError("Şablon oluşturmak için WhatsApp Business hesap kimliği (WABA ID) gerekli")
    name = (spec.get("name") or "").strip().lower()
    if not TEMPLATE_NAME.match(name):
        raise WhatsAppError("Şablon adı yalnızca küçük harf, rakam ve alt çizgi içerebilir (ör. bagis_tesekkur)")
    if not (spec.get("body") or "").strip():
        raise WhatsAppError("Şablon metni boş olamaz")
    payload = {"name": name, "language": spec.get("language") or "tr",
               "category": spec.get("category") if spec.get("category") in ("UTILITY", "MARKETING") else "UTILITY",
               "components": template_components(spec)}
    result = await _graph(creds, "POST", f"{waba}/message_templates", client, json=payload)
    if not result.ok:
        raise WhatsAppError(result.error or "Şablon oluşturulamadı")
    return {"id": (result.data or {}).get("id"), "status": (result.data or {}).get("status") or "PENDING",
            "category": (result.data or {}).get("category") or payload["category"], "name": name}


async def delete_template(creds: dict, name: str, client: Optional[httpx.AsyncClient] = None) -> None:
    waba = (creds or {}).get("business_account_id")
    if not waba:
        raise WhatsAppError("WhatsApp Business hesap kimliği (WABA ID) gerekli")
    result = await _graph(creds, "DELETE", f"{waba}/message_templates", client, params={"name": name})
    if not result.ok:
        raise WhatsAppError(result.error or "Şablon silinemedi")


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


def kick_after_commit(db: AsyncSession) -> None:
    """Send the queue right after this transaction commits (the beat task is the safety net)."""
    session = db.sync_session
    if session.info.get("whatsapp_kick"):
        return
    session.info["whatsapp_kick"] = True

    def _after(sess) -> None:
        sess.info.pop("whatsapp_kick", None)
        kick_dispatch()

    event.listen(session, "after_commit", _after, once=True)


def kick_dispatch() -> None:
    try:
        from app.tasks import dispatch_whatsapp_task
        dispatch_whatsapp_task.delay()
    except Exception:  # noqa: BLE001 - the beat task picks the queue up within a minute anyway
        pass


async def run_fallback(db: AsyncSession, message) -> bool:
    """Queue the SMS that stands in for a failed WhatsApp notification (once)."""
    fb = dict(message.fallback or {})
    if not fb.get("body") or fb.get("done"):
        return False
    from app.services.sms_service import enqueue_sms
    from app.sms import SmsError

    related = fb.get("related")
    try:
        await enqueue_sms(
            db, message.organization_id, message.phone, fb["body"], donor_id=message.donor_id,
            source=fb.get("source") or "auto", related=(related[0], UUID(related[1])) if related else None,
            template_id=UUID(fb["template_id"]) if fb.get("template_id") else None, dedupe_key=fb.get("dedupe_key"),
        )
    except (SmsError, ValueError) as exc:
        logger.warning("WhatsApp yerine SMS kuyruğa alınamadı: %s", exc)
    fb["done"] = True
    message.fallback = fb
    return True


async def send_queued(db: AsyncSession, message, creds: dict, client: Optional[httpx.AsyncClient] = None) -> None:
    """Send one queued message and record the outcome (caller commits)."""
    to = normalize_phone(message.phone)
    message.attempts = (message.attempts or 0) + 1
    if len(to) < 10:
        message.status, message.error = "failed", "Geçersiz telefon numarası"
        await run_fallback(db, message)
        return
    payload = message_payload(to, kind=message.kind, template_name=message.template_name,
                              language=message.language or creds.get("default_language") or "tr",
                              params=list(message.params or []), text=message.body, media=message.media,
                              interactive=message.interactive, reply_to=message.reply_to)
    result = await post_message(creds, payload, client)
    if result.ok:
        message.status, message.provider_ref, message.error = "sent", result.message_id, None
        message.sent_at = datetime.now(timezone.utc)
        await _touch_conversation(db, message)
    else:
        message.status, message.error = "failed", result.error
        await run_fallback(db, message)


async def _touch_conversation(db: AsyncSession, message) -> None:
    """Show outgoing messages in the donor's inbox thread too."""
    from app.services.whatsapp_inbox import conversation_for

    conv = await conversation_for(db, message.organization_id, message.phone, donor_id=message.donor_id,
                                  create=message.source in ("reply", "auto_reply", "manual"))
    if not conv:
        return
    message.conversation_id = conv.id
    conv.last_message_at = message.sent_at or datetime.now(timezone.utc)
    conv.last_preview = _preview(message)


def _preview(message) -> str:
    if message.kind == "template":
        return f"Şablon: {message.template_name}"[:200]
    if message.kind in MEDIA_KINDS:
        label = {"image": "Fotoğraf", "document": "Belge", "audio": "Ses", "video": "Video", "sticker": "Çıkartma"}
        return f"[{label.get(message.kind, message.kind)}] {message.body or ''}".strip()[:200]
    return (message.body or "")[:200]


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
                    await run_fallback(db, row)
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
            if change.get("field") not in (None, "messages"):
                continue
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
                    code = errors[0].get("code")
                    msg.error = ERRORS.get(code) or errors[0].get("title") or errors[0].get("message") or "Meta iletimi başarısız"
                    await run_fallback(db, msg)
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
