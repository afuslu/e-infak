"""SMS queue: length counting, template rendering, enqueueing and sending.

Every SMS an organisation sends becomes an `SmsMessage` row first (enqueue_sms) and is
sent by `process_message` (Celery task, or the every-minute dispatcher for scheduled
and retried messages). Nothing is sent without a row, so staff can see what went out.
"""
import asyncio
import logging
import math
import re
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import event, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.sms_message import SMS_OPEN_STATUSES, SmsMessage
from app.models.sms_template import SmsTemplate
from app.sms import PROVIDERS, SmsError, SmsUnreachable, deliver, normalize_tr_phone

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Europe/Istanbul")
MAX_PARTS = 10
MAX_ATTEMPTS = 3

# --- Length counting -----------------------------------------------------------------

GSM_BASIC = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
GSM_EXTENDED = set("^{}\\[~]|€")  # two characters each
TURKISH_SHIFT = set("çğışĞİŞ")  # two characters each, and the message is sent with the Turkish table
# Characters word processors insert that would silently turn a message into (expensive) Unicode.
TYPOGRAPHIC = str.maketrans({
    "“": '"', "”": '"', "„": '"', "‘": "'", "’": "'", "‚": "'", "–": "-", "—": "-", "…": "...",
    " ": " ", " ": " ", "​": "", "﻿": "", "\t": " ",
})
LIMITS = {"gsm": (160, 153), "tr": (155, 149), "unicode": (70, 67)}


def clean_sms_text(value: str) -> str:
    cleaned = str(value or "").replace("\r\n", "\n").replace("\r", "\n").translate(TYPOGRAPHIC)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def segment_info(message: str) -> dict:
    """How the operator counts a message: encoding, billed characters and number of SMS."""
    units, encoding = 0, "gsm"
    for ch in message:
        if ch in GSM_BASIC:
            units += 1
        elif ch in GSM_EXTENDED:
            units += 2
        elif ch in TURKISH_SHIFT:
            units += 2
            encoding = "tr"
        else:
            encoding = "unicode"
            break
    if encoding == "unicode":
        units = len(message.encode("utf-16-le")) // 2
    single, multi = LIMITS[encoding]
    parts = 0 if not units else (1 if units <= single else math.ceil(units / multi))
    return {"encoding": encoding, "length": len(message), "units": units, "parts": parts,
            "single_limit": single, "multi_limit": multi}


# --- Templates -----------------------------------------------------------------------

SMS_VARIABLES = {
    "ad_soyad": "Bağışçının adı soyadı",
    "ad": "Bağışçının adı",
    "tutar": "Tutar (1.000,00)",
    "para_birimi": "Para birimi (TL)",
    "bagis_kalemi": "Bağış kalemi / kampanya",
    "makbuz_no": "Makbuz numarası",
    "tarih": "Tarih (gg.aa.yyyy)",
    "kimin_adina": "Kimin adına",
    "kurban_no": "Kurban küpe / sıra no",
    "portal": "Bağışçı paneli adresi",
    "kurum": "Kurum adı",
    "kurum_unvan": "Kurumun resmî unvanı / hesap sahibi",
    "kurum_telefon": "Kurum telefonu",
    "iban": "Kurum IBAN",
}
VARIABLE_ALIASES = {"donor_name": "ad_soyad", "amount_lira": "tutar", "campaign_name": "bagis_kalemi"}
_VARIABLE = re.compile(r"\{(\w+)\}")

# event key -> (label, default mode, default template name, default body)
SMS_EVENTS: dict[str, tuple[str, str, str, str]] = {
    "bagis_alindi": (
        "Online bağış alındı", "auto", "Bağış Alındı",
        "Sayın {ad_soyad}, {tutar} {para_birimi} tutarındaki {bagis_kalemi} bağışınız alınmıştır. "
        "Makbuz No: {makbuz_no}. Allah kabul etsin.\n{kurum}",
    ),
    "makbuz": (
        "Makbuz kesildi", "auto", "Makbuz SMS",
        "Değerli bağışçımız, {tutar} {para_birimi} bağışınız kurumumuza ulaşmıştır. Allah kabul etsin.\n{kurum}",
    ),
    "havale_eslesti": (
        "Gelen havale bağışa dönüştü", "auto", "Bağış Ulaştı",
        "Değerli bağışçımız, {tutar} {para_birimi} bağışınız kurumumuza ulaşmıştır. Allah kabul etsin.\n{kurum}",
    ),
    "kurban_kesildi": (
        "Kurban kesildi", "auto", "Kurban Kesildi",
        "Sayın {ad_soyad}, {kimin_adina} adına vekaletiniz yerine getirilmiş, kurbanınız ({kurban_no}) "
        "kesilmiştir. Allah kabul etsin. Video: {portal}",
    ),
}
# Offered to a new organisation next to the event templates.
EXTRA_DEFAULT_TEMPLATES = [
    ("Banka Hesap Bilgileri",
     "ALICI ADI: {kurum_unvan}\nIBAN: {iban}\nAçıklama kısmına telefon numaranızı yazmayı unutmayınız.\n{kurum}"),
]
AUTO_MODES = ("auto", "manual", "off")


def unknown_variables(body: str) -> list[str]:
    return sorted({name for name in _VARIABLE.findall(body or "")
                   if VARIABLE_ALIASES.get(name, name) not in SMS_VARIABLES})


def render_template(body: str, context: dict) -> str:
    """Fill {variables}; a known variable without a value becomes empty, an unknown one stays as written."""
    def fill(match: re.Match) -> str:
        name = VARIABLE_ALIASES.get(match.group(1), match.group(1))
        if name not in SMS_VARIABLES:
            return match.group(0)
        return str(context.get(name) or "")
    rendered = _VARIABLE.sub(fill, body or "")
    rendered = re.sub(r"[ \t]{2,}", " ", rendered)
    return clean_sms_text(re.sub(r" +([,.])", r"\1", rendered))


def format_amount(cents: Optional[int]) -> str:
    if cents is None:
        return ""
    return f"{cents / 100:,.2f}".replace(",", "#").replace(".", ",").replace("#", ".")


def _currency(code: Optional[str]) -> str:
    return "TL" if (code or "TRY").upper() == "TRY" else (code or "").upper()


def _date(value: Optional[datetime]) -> str:
    return (value or datetime.now(timezone.utc)).astimezone(TZ).strftime("%d.%m.%Y")


async def build_context(db: AsyncSession, org_id: UUID, *, donor=None, donation=None, transfer=None,
                        extra: Optional[dict] = None) -> dict:
    """Values for template variables, from the organisation and the records the SMS is about."""
    from app.models.campaign import Campaign
    from app.models.organization import Organization

    org = await db.get(Organization, org_id)
    context = {"tarih": _date(None), "para_birimi": "TL"}
    if org:
        context.update(kurum=org.name, kurum_unvan=org.account_holder or org.legal_name or org.name,
                       kurum_telefon=org.phone or "", iban=org.iban or "")
    if donor is not None:
        context.update(ad_soyad=donor.full_name or "", ad=donor.first_name or "")
    if transfer is not None:
        context.update(tutar=format_amount(transfer.amount_cents), para_birimi=_currency(transfer.currency),
                       tarih=_date(transfer.booked_at))
    if donation is not None:
        campaign = await db.get(Campaign, donation.campaign_id)
        context.update(
            tutar=format_amount(donation.amount_cents), para_birimi=_currency(donation.currency),
            bagis_kalemi=campaign.title if campaign else "",
            makbuz_no=donation.official_receipt_no or donation.receipt_number or "",
            tarih=_date(donation.paid_at or donation.created_at), kimin_adina=donation.on_behalf_of or "",
        )
    for name, value in (extra or {}).items():
        name = VARIABLE_ALIASES.get(name, name)
        if name in SMS_VARIABLES and value is not None:
            context[name] = str(value)[:200]
    return context


async def ensure_default_templates(db: AsyncSession, org_id: UUID) -> None:
    """Give the organisation an editable template for every event it does not have one for."""
    existing = (await db.execute(select(SmsTemplate).where(SmsTemplate.organization_id == org_id))).scalars().all()
    have = {t.event_key for t in existing if t.event_key}
    order = len(existing)
    for key, (_label, mode, name, body) in SMS_EVENTS.items():
        if key not in have:
            order += 1
            db.add(SmsTemplate(organization_id=org_id, name=name, body=body, event_key=key, auto_mode=mode,
                               sort_order=order))
    if not existing:
        for name, body in EXTRA_DEFAULT_TEMPLATES:
            order += 1
            db.add(SmsTemplate(organization_id=org_id, name=name, body=body, sort_order=order))
    await db.flush()


async def event_template(db: AsyncSession, org_id: UUID, event_key: str) -> tuple[str, str, Optional[UUID]]:
    """(body, mode, template id) for an event: the organisation's template, else the built-in default."""
    template = (await db.execute(select(SmsTemplate).where(
        SmsTemplate.organization_id == org_id, SmsTemplate.event_key == event_key,
    ))).scalar_one_or_none()
    if template:
        return template.body, (template.auto_mode if template.is_active else "off"), template.id
    _label, mode, _name, body = SMS_EVENTS[event_key]
    return body, mode, None


def receipt_event(payment_provider: Optional[str]) -> str:
    """Which event a donation's receipt SMS belongs to, from where the donation came."""
    if (payment_provider or "").startswith("bank:"):
        return "havale_eslesti"
    return "makbuz" if payment_provider in ("manual", "money_box", "import") else "bagis_alindi"


def receipt_key(donation_id) -> str:
    """One receipt SMS per donation, whether staff wrote it or the event template did."""
    return f"receipt:{donation_id}"


async def queue_receipt_sms(db: AsyncSession, donation, donor, body: Optional[str], created_by: Optional[UUID],
                            source: str = "receipt") -> Optional[SmsMessage]:
    """The SMS staff wrote on the receipt form; it replaces the automatic one for this donation."""
    if not body or not body.strip() or not donor.phone:
        return None
    return await enqueue_sms(
        db, donation.organization_id, donor.phone, body, donor_id=donor.id, source=source,
        related=("donation", donation.id), dedupe_key=receipt_key(donation.id), created_by=created_by,
    )


async def related_sms(db: AsyncSession, org_id: UUID, related_type: str, ids: list[UUID]) -> dict[str, dict]:
    """Latest SMS of each record, for an "SMS" column next to receipts and transfers."""
    if not ids:
        return {}
    rows = (await db.execute(
        select(SmsMessage).where(
            SmsMessage.organization_id == org_id, SmsMessage.related_type == related_type,
            SmsMessage.related_id.in_(ids),
        ).order_by(SmsMessage.created_at)
    )).scalars().all()
    latest: dict[str, dict] = {}
    for row in rows:
        entry = latest.setdefault(str(row.related_id), {"count": 0})
        entry.update(status=row.status, seq_no=row.seq_no, at=row.sent_at or row.send_after, error=row.error,
                     count=entry["count"] + 1)
    return latest


# --- Queue ---------------------------------------------------------------------------

async def _send_without_worker(message_id: str) -> None:
    """Send from this process on its own connection (the app's pool belongs to another event loop)."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as session:
            await process_in(session, message_id)
    finally:
        await engine.dispose()


def _hand_over(message_id: str) -> None:
    try:
        from app.tasks import send_sms_message_task
        send_sms_message_task.apply_async((message_id,), retry=False, ignore_result=True)
    except Exception as exc:  # noqa: BLE001 - no broker (local development, or Redis is away)
        logger.warning("SMS işçisine ulaşılamadı (%s); bu süreçten gönderiliyor", exc)
        try:
            asyncio.run(_send_without_worker(message_id))
        except Exception:  # noqa: BLE001 - the message stays queued for the dispatcher
            logger.exception("SMS gönderilemedi; kuyrukta bekliyor")


def _kick(message_id: str) -> None:
    """Hand a queued message to a worker now, without making the request wait for the broker."""
    threading.Thread(target=_hand_over, args=(message_id,), daemon=True, name="sms-kick").start()


def kick_after_commit(db: AsyncSession, message_id: UUID) -> None:
    event.listen(db.sync_session, "after_commit", lambda _session: _kick(str(message_id)), once=True)


async def _next_seq_no(db: AsyncSession, org_id: UUID) -> int:
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"sms-seq:{org_id}"})
    current = (await db.execute(
        select(func.max(SmsMessage.seq_no)).where(SmsMessage.organization_id == org_id)
    )).scalar()
    return (current or 0) + 1


def valid_phone(phone: str) -> str:
    number = normalize_tr_phone(phone)
    if not 10 <= len(number) <= 15:
        raise SmsError("Telefon numarası geçersiz")
    return number


async def enqueue_sms(
    db: AsyncSession, org_id: UUID, phone: str, body: str, *, donor_id: Optional[UUID] = None,
    source: str = "manual", related: Optional[tuple[str, UUID]] = None, template_id: Optional[UUID] = None,
    dedupe_key: Optional[str] = None, send_at: Optional[datetime] = None, created_by: Optional[UUID] = None,
    batch_id: Optional[UUID] = None, status: Optional[str] = None,
) -> Optional[SmsMessage]:
    """Add a message to the queue (the caller commits). Returns None when `dedupe_key` was already used.

    Raises SmsError for an unusable number or text. `status` is only for messages that were
    already sent outside the queue (login codes) and are merely recorded.
    """
    number = valid_phone(phone)
    message_text = clean_sms_text(body)
    info = segment_info(message_text)
    if not info["parts"]:
        raise SmsError("Mesaj metni boş")
    if info["parts"] > MAX_PARTS:
        raise SmsError(f"Mesaj çok uzun ({info['parts']} SMS); en fazla {MAX_PARTS} SMS boyunda olabilir")
    if dedupe_key and (await db.execute(select(SmsMessage.id).where(
        SmsMessage.organization_id == org_id, SmsMessage.dedupe_key == dedupe_key,
    ))).first():
        return None
    now = datetime.now(timezone.utc)
    scheduled = bool(send_at and send_at > now + timedelta(seconds=30))
    message = SmsMessage(
        organization_id=org_id, seq_no=await _next_seq_no(db, org_id), donor_id=donor_id, phone=number,
        body=message_text, status=status or ("scheduled" if scheduled else "queued"), source=source,
        related_type=related[0] if related else None, related_id=related[1] if related else None,
        dedupe_key=dedupe_key, template_id=template_id, batch_id=batch_id, encoding=info["encoding"],
        parts=info["parts"], send_after=send_at if scheduled else now, created_by=created_by,
        sent_at=now if status == "sent" else None,
    )
    db.add(message)
    await db.flush()
    if message.status == "queued":
        kick_after_commit(db, message.id)
    return message


async def send_event_sms(
    db: AsyncSession, org_id: UUID, event_key: str, phone: Optional[str], *, donor=None, donation=None,
    transfer=None, extra: Optional[dict] = None, related: Optional[tuple[str, UUID]] = None,
    source: str = "auto", dedupe_key: Optional[str] = None,
) -> Optional[SmsMessage]:
    """Queue the SMS of an event if the organisation sends it automatically; once per related record."""
    if not phone:
        return None
    body, mode, template_id = await event_template(db, org_id, event_key)
    if mode != "auto":
        return None
    context = await build_context(db, org_id, donor=donor, donation=donation, transfer=transfer, extra=extra)
    try:
        return await enqueue_sms(
            db, org_id, phone, render_template(body, context), donor_id=getattr(donor, "id", None),
            source=source, related=related, template_id=template_id,
            dedupe_key=dedupe_key or (f"{event_key}:{related[1]}" if related else None),
        )
    except SmsError as exc:
        logger.warning("%s SMS'i kuyruğa alınamadı: %s", event_key, exc)
        return None


async def send_message(db: AsyncSession, message: SmsMessage) -> None:
    """Send one locked, due message and write the outcome on it (the caller commits)."""
    from app.services.tenant_credentials import sms_account

    now = datetime.now(timezone.utc)
    account = await sms_account(db, message.organization_id)
    provider = PROVIDERS.get(account.get("provider") or "")
    usable = bool(provider) and not account.get("disabled") and provider(account).configured
    try:
        if usable:
            result = await asyncio.to_thread(deliver, message.phone, message.body, account)
            message.provider, message.provider_ref = result.provider, result.reference
        elif settings.ENVIRONMENT == "production":
            raise SmsError("Kurumun SMS hesabı yapılandırılmadı")
        else:
            logger.info("[dev] SMS %s: %s", message.phone, message.body)
            message.provider = "dev"
        message.status, message.sent_at, message.error = "sent", now, None
    except SmsError as exc:
        message.attempts += 1
        message.error = str(exc)[:500]
        if isinstance(exc, SmsUnreachable) and message.attempts < MAX_ATTEMPTS:
            message.status = "queued"
            message.send_after = now + timedelta(minutes=2 ** message.attempts)
        else:
            message.status = "failed"
    except Exception as exc:  # noqa: BLE001 - never lose a message to an unexpected error
        logger.exception("SMS gönderimi beklenmedik biçimde başarısız oldu")
        message.attempts += 1
        message.error = f"Beklenmeyen hata: {exc}"[:500]
        message.status = "failed"


async def process_in(session: AsyncSession, message_id) -> str:
    """Send the message if it is still open and due, and commit. Safe to call twice."""
    message = (await session.execute(
        select(SmsMessage).where(SmsMessage.id == UUID(str(message_id))).with_for_update(skip_locked=True)
    )).scalar_one_or_none()
    if not message or message.status not in SMS_OPEN_STATUSES:
        return "skipped"
    if message.send_after > datetime.now(timezone.utc):
        return "not_due"
    await send_message(session, message)
    await session.commit()
    return message.status


async def process_message(message_id: str) -> str:
    """Worker entry for one message."""
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        return await process_in(session, message_id)


async def dispatch_due(limit: int = 200) -> dict:
    """Send scheduled messages whose time has come and queued ones no worker picked up."""
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        ids = (await session.execute(
            select(SmsMessage.id)
            .where(SmsMessage.status.in_(SMS_OPEN_STATUSES), SmsMessage.send_after <= datetime.now(timezone.utc))
            .order_by(SmsMessage.send_after).limit(limit)
        )).scalars().all()
    outcomes: dict[str, int] = {}
    for message_id in ids:
        outcome = await process_message(str(message_id))
        outcomes[outcome] = outcomes.get(outcome, 0) + 1
    return outcomes
