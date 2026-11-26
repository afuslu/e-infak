"""WhatsApp inbox: incoming messages, donor matching, consent keywords and automatic replies.

Settings live in `organization.settings["whatsapp"]`:

    events:      {event_key: {channel, template_name, language, params}}       (whatsapp_events)
    consent:     {require_opt_in_for_bulk, opt_out_keywords, opt_in_keywords, opt_out_reply, opt_in_reply}
    auto_reply:  {welcome: {enabled, text, buttons}, away: {enabled, text, start, end, days},
                  rules: [{keywords, text, buttons, url, url_label}]}
    notify_staff: bool

A donor's reply opens Meta's 24-hour window, inside which staff (and the auto replies) may send
free text, media and buttons. "DUR" stops every business message to that number until "BAŞLA".
"""
from __future__ import annotations

import logging
import re
import unicodedata
from datetime import datetime, time, timedelta, timezone
from typing import Any, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import whatsapp as wa

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Europe/Istanbul")
AWAY_REPEAT = timedelta(hours=12)
REF_PATTERN = re.compile(r"\(Kod:\s*([\w-]{2,80})\)", re.IGNORECASE)
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

DEFAULT_SETTINGS: dict[str, Any] = {
    "notify_staff": True,
    "display_phone": "",  # the business number for wa.me links and QR codes (read from Meta)
    "consent": {
        "require_opt_in_for_bulk": True,
        "checkout_checkbox": False,  # "WhatsApp'tan bilgilendirilmek istiyorum" on the donation form
        "opt_out_keywords": ["DUR", "STOP", "IPTAL", "RET", "ABONELIKTEN CIK"],
        "opt_in_keywords": ["BASLA", "START", "EVET", "KAYIT"],
        "opt_out_reply": "WhatsApp bilgilendirmelerinden çıkarıldınız. Yeniden almak için BAŞLA yazabilirsiniz.",
        "opt_in_reply": "Teşekkürler, {kurum} WhatsApp bilgilendirmelerine kaydoldunuz. Çıkmak için DUR yazabilirsiniz.",
    },
    "auto_reply": {
        "welcome": {"enabled": False, "text": "Merhaba, {kurum}'a hoş geldiniz. Size nasıl yardımcı olabiliriz?",
                    "buttons": ["Bağış yapmak", "Makbuz istiyorum", "Temsilciye bağlan"]},
        "away": {"enabled": False, "start": "09:00", "end": "18:00", "days": ["mon", "tue", "wed", "thu", "fri"],
                 "text": "Mesajınız bize ulaştı. Mesai saatlerimiz içinde size dönüş yapacağız. {kurum}"},
        "rules": [],
    },
}


def fold(text: Optional[str]) -> str:
    """Upper-case ASCII fold for keyword matching: "Başla" → "BASLA", "iptal" → "IPTAL"."""
    value = (text or "").replace("ı", "i").replace("İ", "I")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch)).upper()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", value)).strip()


def settings_of(org) -> dict:
    """The organisation's WhatsApp settings over the defaults (nested dicts merged one level)."""
    own = dict(((getattr(org, "settings", None) or {}).get("whatsapp")) or {})
    out: dict[str, Any] = {}
    for key, default in DEFAULT_SETTINGS.items():
        value = own.get(key, default)
        if isinstance(default, dict) and isinstance(value, dict):
            merged = {**default, **value}
            for sub, sub_default in default.items():
                if isinstance(sub_default, dict) and isinstance(value.get(sub), dict):
                    merged[sub] = {**sub_default, **value[sub]}
            value = merged
        out[key] = value
    out["events"] = dict(own.get("events") or {})
    return out


def save_settings(org, section: str, value: Any) -> None:
    current = dict(org.settings or {})
    whatsapp = dict(current.get("whatsapp") or {})
    whatsapp[section] = value
    current["whatsapp"] = whatsapp
    org.settings = current


def fill(text: str, context: dict) -> str:
    def repl(match: re.Match) -> str:
        return str(context.get(match.group(1), match.group(0)) or "")
    return re.sub(r"\{(\w+)\}", repl, text or "").strip()


# --- conversations -----------------------------------------------------------------------------

async def conversation_for(db: AsyncSession, org_id: UUID, phone: str, *, donor_id: Optional[UUID] = None,
                           create: bool = True):
    from app.models.channels import WhatsAppConversation

    number = wa.normalize_phone(phone)
    if len(number) < 10:
        return None
    conv = (await db.execute(select(WhatsAppConversation).where(
        WhatsAppConversation.organization_id == org_id, WhatsAppConversation.phone == number,
    ))).scalar_one_or_none()
    if conv or not create:
        if conv and donor_id and not conv.donor_id:
            conv.donor_id = donor_id
        return conv
    if not donor_id:
        from app.services.integrations import find_donor_by_phone
        donor = await find_donor_by_phone(db, org_id, number)
        donor_id = donor.id if donor else None
    conv = WhatsAppConversation(organization_id=org_id, phone=number, donor_id=donor_id)
    db.add(conv)
    await db.flush()
    return conv


async def opted_out(db: AsyncSession, org_id: UUID, phone: str, donor=None) -> bool:
    if donor is not None and getattr(donor, "whatsapp_opt_out", False):
        return True
    conv = await conversation_for(db, org_id, phone, create=False)
    return bool(conv and conv.opted_out)


async def set_consent(db: AsyncSession, org_id: UUID, *, phone: Optional[str], donor=None, opt_in: bool,
                      source: str) -> None:
    now = datetime.now(timezone.utc)
    if donor is not None:
        donor.whatsapp_opt_out = not opt_in
        donor.whatsapp_opt_in_at = now if opt_in else None
        donor.whatsapp_consent_source = source
    number = phone or (donor.phone if donor is not None else None)
    if number:
        conv = await conversation_for(db, org_id, number, donor_id=getattr(donor, "id", None), create=not opt_in)
        if conv:
            conv.opted_out = not opt_in


# --- incoming ----------------------------------------------------------------------------------

def parse_message(item: dict) -> dict:
    """Meta's message object → our columns (kind, body, media, interactive, reply_to)."""
    kind = item.get("type") or "unknown"
    out: dict[str, Any] = {"kind": kind[:20], "body": None, "media": None, "interactive": None,
                           "reply_to": (item.get("context") or {}).get("id")}
    if kind == "text":
        out["body"] = (item.get("text") or {}).get("body")
    elif kind in wa.MEDIA_KINDS:
        obj = item.get(kind) or {}
        out["media"] = {k: obj.get(k) for k in ("id", "mime_type", "sha256", "filename") if obj.get(k)}
        out["body"] = obj.get("caption")
        if kind == "audio" and obj.get("voice"):
            out["media"]["voice"] = True
    elif kind == "location":
        loc = item.get("location") or {}
        out["media"] = {k: loc.get(k) for k in ("latitude", "longitude", "name", "address") if loc.get(k) is not None}
        out["body"] = " · ".join(str(x) for x in (loc.get("name"), loc.get("address")) if x) or "Konum paylaşıldı"
    elif kind == "interactive":
        inter = item.get("interactive") or {}
        sub = inter.get("type")
        if sub in ("button_reply", "list_reply"):
            reply = inter.get(sub) or {}
            out["interactive"] = {"type": sub, "id": reply.get("id"), "title": reply.get("title")}
            out["body"] = reply.get("title")
        elif sub == "call_permission_reply":
            reply = inter.get("call_permission_reply") or {}
            out["interactive"] = {"type": sub, **reply}
            out["body"] = "Arama izni verildi" if reply.get("response") == "accept" else "Arama izni verilmedi"
        elif sub == "nfm_reply":
            out["interactive"] = {"type": sub, "response_json": (inter.get("nfm_reply") or {}).get("response_json")}
            out["body"] = "Form yanıtı"
        else:
            out["interactive"] = inter
    elif kind == "button":
        btn = item.get("button") or {}
        out["interactive"] = {"type": "template_button", "payload": btn.get("payload"), "title": btn.get("text")}
        out["body"] = btn.get("text")
    elif kind == "reaction":
        reaction = item.get("reaction") or {}
        out["body"] = reaction.get("emoji") or "(tepki kaldırıldı)"
        out["reply_to"] = reaction.get("message_id")
    elif kind == "contacts":
        names = [((c.get("name") or {}).get("formatted_name") or "") for c in item.get("contacts") or []]
        out["body"] = "Kişi paylaşıldı: " + ", ".join(n for n in names if n)
        out["media"] = {"contacts": item.get("contacts")}
    elif kind == "order":
        out["body"] = "Sipariş mesajı"
    else:
        out["kind"] = "unsupported"
        out["body"] = "(desteklenmeyen mesaj türü)"
    return out


async def apply_incoming(db: AsyncSession, org_id: UUID, body: dict, creds: dict) -> list:
    """Store the donors' messages from a webhook body; returns the new WhatsAppMessage rows."""
    from app.models.channels import WhatsAppMessage
    from app.models.donation import Donor
    from app.models.organization import Organization

    org = await db.get(Organization, org_id)
    conf = settings_of(org)
    created = []
    for entry in body.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") not in (None, "messages"):
                continue
            value = change.get("value") or {}
            names = {c.get("wa_id"): ((c.get("profile") or {}).get("name")) for c in value.get("contacts") or []}
            for item in value.get("messages") or []:
                ref, sender = item.get("id"), item.get("from")
                if not ref or not sender:
                    continue
                if (await db.execute(select(WhatsAppMessage.id).where(
                    WhatsAppMessage.organization_id == org_id, WhatsAppMessage.provider_ref == ref,
                ))).first():
                    continue  # Meta retries webhooks
                try:
                    at = datetime.fromtimestamp(int(item.get("timestamp")), tz=timezone.utc)
                except (TypeError, ValueError):
                    at = datetime.now(timezone.utc)
                conv = await conversation_for(db, org_id, sender)
                if conv is None:
                    continue
                is_new = conv.last_inbound_at is None
                if names.get(sender):
                    conv.contact_name = names[sender][:200]
                parsed = parse_message(item)
                msg = WhatsAppMessage(
                    organization_id=org_id, donor_id=conv.donor_id, conversation_id=conv.id, direction="in",
                    phone=conv.phone, kind=parsed["kind"], body=parsed["body"], media=parsed["media"],
                    interactive=parsed["interactive"], reply_to=parsed["reply_to"], status="received",
                    provider_ref=ref, source="incoming", created_at=at, sent_at=at,
                )
                db.add(msg)
                first_unread = (conv.unread_count or 0) == 0
                conv.unread_count = (conv.unread_count or 0) + 1
                conv.last_inbound_at = max(conv.last_inbound_at or at, at)
                conv.last_message_at = max(conv.last_message_at or at, at)
                conv.last_preview = wa._preview(msg)
                conv.status = "open"
                if parsed["kind"] == "text" and not conv.source_ref:
                    found = REF_PATTERN.search(parsed["body"] or "")
                    if found:
                        conv.source_ref = found.group(1)[:80]
                await db.flush()
                created.append(msg)
                donor = await db.get(Donor, conv.donor_id) if conv.donor_id else None
                handled = await _consent_keyword(db, org, conf, conv, donor, msg)
                if not handled and not conv.opted_out:
                    await auto_reply(db, org, conf, conv, msg, is_new=is_new)
                if first_unread and conf.get("notify_staff", True):
                    await _notify_staff(db, org_id, conv, donor, msg)
    return created


async def _consent_keyword(db, org, conf: dict, conv, donor, msg) -> bool:
    if msg.kind not in ("text", "button", "interactive"):
        return False
    word = fold(msg.body)
    consent = conf["consent"]
    if word in {fold(k) for k in consent.get("opt_out_keywords") or []}:
        await set_consent(db, org.id, phone=conv.phone, donor=donor, opt_in=False, source="keyword")
        conv.opted_out = True
        await _reply_text(db, org, conv, consent.get("opt_out_reply"), source="auto_reply", force=True)
        return True
    if word in {fold(k) for k in consent.get("opt_in_keywords") or []}:
        await set_consent(db, org.id, phone=conv.phone, donor=donor, opt_in=True, source="keyword")
        conv.opted_out = False
        await _reply_text(db, org, conv, consent.get("opt_in_reply"), source="auto_reply")
        return True
    return False


def in_hours(away: dict, now: Optional[datetime] = None) -> bool:
    local = (now or datetime.now(timezone.utc)).astimezone(TZ)
    if DAYS[local.weekday()] not in (away.get("days") or DAYS):
        return False
    try:
        start = time.fromisoformat(away.get("start") or "09:00")
        end = time.fromisoformat(away.get("end") or "18:00")
    except ValueError:
        return True
    current = local.time()
    return start <= current < end if start <= end else (current >= start or current < end)


def match_rule(rules: list[dict], msg) -> Optional[dict]:
    """A reply button pressed (id "rule:<n>") or a keyword in the donor's text."""
    inter = msg.interactive or {}
    if str(inter.get("id") or "").startswith("rule:"):
        try:
            return rules[int(inter["id"].split(":", 1)[1])]
        except (ValueError, IndexError):
            pass
    text = f" {fold(msg.body)} "
    if not text.strip():
        return None
    for rule in rules:
        for keyword in rule.get("keywords") or []:
            key = fold(keyword)
            if key and f" {key} " in text:
                return rule
    return None


def _buttons_for(rules: list[dict], titles: list[str]) -> list[dict]:
    """Welcome buttons point at the rule whose keywords contain the button text, when there is one."""
    out = []
    for i, title in enumerate([t for t in titles if (t or "").strip()][:3]):
        target = next((n for n, r in enumerate(rules)
                       if fold(title) in {fold(k) for k in r.get("keywords") or []}), None)
        out.append({"id": f"rule:{target}" if target is not None else f"welcome:{i}", "title": title.strip()[:20]})
    return out


async def auto_reply(db: AsyncSession, org, conf: dict, conv, msg, *, is_new: bool,
                     now: Optional[datetime] = None) -> Optional[Any]:
    """At most one automatic answer per incoming message: keyword rule, then welcome, then away."""
    settings = conf["auto_reply"]
    rules = [r for r in settings.get("rules") or [] if (r.get("text") or "").strip()]
    now = now or datetime.now(timezone.utc)
    rule = match_rule(rules, msg)
    if rule:
        if rule.get("url") and (rule.get("url_label") or "").strip():
            spec = {"type": "cta_url", "body": rule["text"], "display_text": rule["url_label"], "url": rule["url"]}
            return await _reply_interactive(db, org, conv, spec)
        buttons = _buttons_for(rules, rule.get("buttons") or [])
        if buttons:
            return await _reply_interactive(db, org, conv, {"type": "button", "body": rule["text"], "buttons": buttons})
        return await _reply_text(db, org, conv, rule["text"])
    welcome = settings.get("welcome") or {}
    if is_new and welcome.get("enabled") and (welcome.get("text") or "").strip():
        buttons = _buttons_for(rules, welcome.get("buttons") or [])
        if buttons:
            return await _reply_interactive(db, org, conv, {"type": "button", "body": welcome["text"], "buttons": buttons})
        return await _reply_text(db, org, conv, welcome["text"])
    away = settings.get("away") or {}
    if away.get("enabled") and (away.get("text") or "").strip() and not in_hours(away, now):
        if conv.last_auto_reply_at and now - conv.last_auto_reply_at < AWAY_REPEAT:
            return None
        return await _reply_text(db, org, conv, away["text"])
    return None


async def _context(db: AsyncSession, org, conv) -> dict:
    from app.models.donation import Donor
    from app.services.sms_service import build_context

    donor = await db.get(Donor, conv.donor_id) if conv.donor_id else None
    context = await build_context(db, org.id, donor=donor)
    if not donor and conv.contact_name:
        context.update(ad_soyad=conv.contact_name, ad=conv.contact_name.split(" ")[0])
    return context


async def _queue(db: AsyncSession, org, conv, *, kind: str, body: Optional[str] = None,
                 interactive: Optional[dict] = None, source: str = "auto_reply"):
    from app.models.channels import WhatsAppMessage

    now = datetime.now(timezone.utc)
    msg = WhatsAppMessage(organization_id=org.id, donor_id=conv.donor_id, conversation_id=conv.id, phone=conv.phone,
                          kind=kind, body=body, interactive=interactive, source=source, status="queued")
    db.add(msg)
    conv.last_auto_reply_at = now
    conv.last_message_at = now
    conv.last_preview = (body or (interactive or {}).get("body") or "")[:200]
    await db.flush()
    wa.kick_after_commit(db)
    return msg


async def _reply_text(db, org, conv, text: Optional[str], *, source: str = "auto_reply", force: bool = False):
    if not (text or "").strip() or (conv.opted_out and not force):
        return None
    return await _queue(db, org, conv, kind="text", body=fill(text, await _context(db, org, conv))[:4096],
                        source=source)


async def _reply_interactive(db, org, conv, spec: dict, *, source: str = "auto_reply"):
    context = await _context(db, org, conv)
    spec = {**spec, "body": fill(spec.get("body") or "", context)}
    if wa.validate_interactive(spec):
        return await _reply_text(db, org, conv, spec.get("body"), source=source)
    return await _queue(db, org, conv, kind="interactive", body=spec["body"], interactive=spec, source=source)


async def _notify_staff(db: AsyncSession, org_id: UUID, conv, donor, msg) -> None:
    from app.models.user import User
    from app.services import staff_notify

    try:
        if conv.assigned_to:
            user = await db.get(User, conv.assigned_to)
            staff = [user] if user and user.is_active else []
        else:
            staff = [u for u in await staff_notify._staff(db, org_id)
                     if staff_notify._can(u, "sms.send") or staff_notify._can(u, "settings.manage")]
        name = (donor.full_name if donor else None) or conv.contact_name or conv.phone
        await staff_notify.deliver(
            db, org_id, staff, kind="whatsapp_message", setting="whatsapp_inbox",
            title=f"WhatsApp · {name}", body=wa._preview(msg) or "Yeni mesaj", channel="whatsapp",
            data={"conversation_id": str(conv.id), "url": f"/admin/whatsapp?c={conv.id}"},
        )
    except Exception:  # noqa: BLE001 - a notification never blocks storing the message
        logger.exception("WhatsApp personel bildirimi gönderilemedi")
