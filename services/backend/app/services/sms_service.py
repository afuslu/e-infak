"""SMS queue: length counting, template rendering, enqueueing and sending.

Every SMS an organisation sends becomes an `SmsMessage` row first (enqueue_sms) and is
sent by `process_message` (Celery task, or the every-minute dispatcher for scheduled
and retried messages). Nothing is sent without a row, so staff can see what went out.
"""
import asyncio
import base64
import hashlib
import hmac
import logging
import math
import re
import secrets
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
from app.sms import PROVIDERS, SmsError, SmsUnreachable, deliver, deliver_bulk, normalize_tr_phone
from app.utils.phone import phone_key

_ORIGINAL_DELIVER = deliver

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
    "vade": "Son ödeme tarihi (hatırlatmalarda)",
    "donem": "Dönem / taksit (2026-11, 3/12)",
    "kimin_adina": "Kimin adına",
    "kurban_no": "Kurban küpe / sıra no",
    "portal": "Bağışçı paneli adresi",
    "video": "Kurban kesim videosu bağlantısı (yoksa bağışçı paneli)",
    "kurum": "Kurum adı",
    "kurum_unvan": "Kurumun resmî unvanı / hesap sahibi",
    "kurum_telefon": "Kurum telefonu",
    "iban": "Kurum IBAN",
    "odeme_linki": "Bağış / ödeme bağlantısı",
    "yonet_linki": "Düzenli bağışı durdurma / yönetme bağlantısı",
    "ret_linki": "SMS izni iptal (RET) bağlantısı",
    "gun": "Ayın günü",
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
    "adina_bagis": (
        "Başkası adına (hediye) bağış yapıldı", "auto", "Adına Bağış / Hediye Bildirimi",
        "Sayın {kimin_adina}, {ad_soyad} tarafından sizin adınıza {bagis_kalemi} bağışı yapılmıştır. "
        "Makbuz No: {makbuz_no}. Hayırlara vesile olmasını dileriz.\n{kurum}",
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
        "kesilmiştir. Allah kabul etsin. Video: {video}",
    ),
    "aidat_hatirlatma": (
        "Aidat hatırlatması (vade günü)", "off", "Aidat Hatırlatma",
        "Sayın {ad_soyad}, {donem} dönemi {tutar} {para_birimi} üyelik aidatınızın son ödeme tarihi {vade}. "
        "Desteğiniz için teşekkür ederiz.\n{kurum}",
    ),
    "sponsor_hatirlatma": (
        "Sponsorluk / taahhüt taksiti hatırlatması (vade günü)", "off", "Sponsorluk Hatırlatma",
        "Kıymetli destekçimiz, {bagis_kalemi} için {tutar} {para_birimi} tutarındaki desteğinizi bu ay için "
        "hatırlatmak istedik. Allah kabul etsin.\n{kurum}",
    ),
    "duzenli_hatirlatma": (
        "Düzenli bağış hatırlatması (ödeme günü)", "auto", "Düzenli Bağış Hatırlatma",
        "Sayın {ad_soyad}, her ay {gun}. gün yaptığınız {tutar} {para_birimi} {bagis_kalemi} bağışınızın günü geldi: "
        "{odeme_linki} Durdurmak için: {yonet_linki}\n{kurum}",
    ),
    "duzenli_basarisiz": (
        "Düzenli bağış kartından çekilemedi", "auto", "Düzenli Bağış Çekilemedi",
        "Sayın {ad_soyad}, {tutar} {para_birimi} düzenli bağışınız kartınızdan çekilemedi. Bağışınızı buradan "
        "yapabilirsiniz: {odeme_linki} Talimat: {yonet_linki}\n{kurum}",
    ),
}
RECEIPT_EVENTS = ("bagis_alindi", "makbuz", "havale_eslesti")
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


def site_url(org) -> str:
    if settings.ENVIRONMENT == "production" and getattr(org, "primary_domain", None):
        return f"https://{org.primary_domain}"
    return settings.PUBLIC_WEB_URL.rstrip("/")


def _opt_out_sig(payload: str) -> str:
    secret = (settings.SECRET_KEY or "e-infak-sms").encode("utf-8")
    digest = hmac.new(secret, payload.encode("utf-8"), hashlib.sha256).digest()[:12]
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def opt_out_token(org_id: UUID, phone: str, donor_id: Optional[UUID] = None) -> str:
    raw = f"{org_id}|{phone}|{donor_id or ''}"
    body = base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{body}.{_opt_out_sig(body)}"


def verify_opt_out_token(token: str) -> Optional[tuple[UUID, str, Optional[UUID]]]:
    try:
        body, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _opt_out_sig(body)):
            return None
        padded = body + "=" * (-len(body) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        org_s, phone, donor_s = raw.split("|", 2)
        return UUID(org_s), phone, (UUID(donor_s) if donor_s else None)
    except Exception:  # noqa: BLE001
        return None


async def build_context(db: AsyncSession, org_id: UUID, *, donor=None, donation=None, transfer=None,
                        campaign_id: Optional[UUID] = None, extra: Optional[dict] = None) -> dict:
    """Values for template variables, from the organisation and the records the SMS is about."""
    from app.models.campaign import Campaign
    from app.models.organization import Organization

    org = await db.get(Organization, org_id)
    context = {"tarih": _date(None), "para_birimi": "TL"}
    if org:
        base = site_url(org)
        context.update(kurum=org.name, kurum_unvan=org.account_holder or org.legal_name or org.name,
                       kurum_telefon=org.phone or "", iban=org.iban or "",
                       portal=f"{base}/bagisci", video=f"{base}/bagisci", odeme_linki=base)
        if campaign_id:
            camp = await db.get(Campaign, campaign_id)
            if camp and camp.slug:
                context["odeme_linki"] = f"{base}/kampanyalar/{camp.slug}"
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


async def event_template(db: AsyncSession, org_id: UUID, event_key: str, campaign_id: Optional[UUID] = None,
                         ) -> tuple[str, str, Optional[UUID]]:
    """(body, mode, template id) for an event: the organisation's template, else the built-in default.

    A template bound to the campaign replaces the text (the event still decides whether it is sent).
    """
    template = (await db.execute(select(SmsTemplate).where(
        SmsTemplate.organization_id == org_id, SmsTemplate.event_key == event_key,
    ))).scalar_one_or_none()
    if template:
        body, mode, template_id = template.body, (template.auto_mode if template.is_active else "off"), template.id
    else:
        _label, mode, _name, body = SMS_EVENTS[event_key]
        template_id = None
    if campaign_id:
        own = (await db.execute(select(SmsTemplate).where(
            SmsTemplate.organization_id == org_id, SmsTemplate.campaign_id == campaign_id,
            SmsTemplate.is_active.is_(True),
        ))).scalar_one_or_none()
        if own:
            body, template_id = own.body, own.id
    return body, mode, template_id


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
    source: str = "auto", dedupe_key: Optional[str] = None, campaign_id: Optional[UUID] = None,
) -> Optional[SmsMessage]:
    """Queue the SMS of an event if the organisation sends it automatically; once per related record.

    When the organisation sends the event on WhatsApp the WhatsApp message is returned instead
    (callers only check that something was queued).
    """
    if not phone:
        return None
    if campaign_id is None and donation is not None and event_key in RECEIPT_EVENTS:
        campaign_id = donation.campaign_id
    body, mode, template_id = await event_template(db, org_id, event_key, campaign_id)
    context: Optional[dict] = None

    async def context_factory() -> dict:
        nonlocal context
        if context is None:
            context = await build_context(db, org_id, donor=donor, donation=donation, transfer=transfer, extra=extra)
        return context

    # WhatsApp first: the organisation may send this event on WhatsApp instead of, or next to, the SMS.
    whatsapp_message, send_sms = None, True
    try:
        from app.models.organization import Organization
        from app.services.whatsapp_events import route_event

        org = await db.get(Organization, org_id)
        if org is not None:
            whatsapp_message, send_sms = await route_event(
                db, org, event_key, phone, donor=donor, context_factory=context_factory,
                sms_body_factory=lambda ctx: (render_template(body, ctx) if mode == "auto" else None, template_id),
                related=related, dedupe_key=dedupe_key, source=source,
            )
    except Exception:  # noqa: BLE001 - WhatsApp trouble never stops the SMS
        logger.exception("%s WhatsApp bildirimi kuyruğa alınamadı", event_key)
        whatsapp_message, send_sms = None, True
    if not send_sms or mode != "auto":
        return whatsapp_message
    context = await context_factory()
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
            result = await asyncio.to_thread(deliver, message.phone, message.body, account, bool(message.commercial))
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
    from app.models.donation import Donor

    message = (await session.execute(
        select(SmsMessage).where(SmsMessage.id == UUID(str(message_id))).with_for_update(skip_locked=True)
    )).scalar_one_or_none()
    if not message or message.status not in SMS_OPEN_STATUSES:
        return "skipped"
    if message.send_after > datetime.now(timezone.utc):
        return "not_due"
    if message.commercial and message.donor_id:
        allow = (await session.execute(select(Donor.allow_sms).where(Donor.id == message.donor_id))).scalar_one_or_none()
        if allow is False:
            message.status = "cancelled"
            message.error = "Alıcı SMS iznini iptal etti"
            await session.commit()
            return "cancelled"
    if message.commercial or message.batch_id:
        from app.services.sms_audience import opted_out_phones

        if phone_key(message.phone) in await opted_out_phones(session, message.organization_id):
            message.status = "cancelled"
            message.error = "Alıcı SMS almak istemiyor"
            await session.commit()
            return "cancelled"
    await send_message(session, message)
    await session.commit()
    return message.status


# --- Bulk ----------------------------------------------------------------------------

QUIET_FROM, QUIET_UNTIL = 21, 8  # no bulk SMS between 21:00 and 08:00 (Istanbul)
BULK_MAX_RECIPIENTS = 100_000


def after_quiet_hours(moment: datetime) -> datetime:
    """`moment`, or the next 08:00 when it falls into the night."""
    local = moment.astimezone(TZ)
    if QUIET_UNTIL <= local.hour < QUIET_FROM:
        return moment
    morning = local.replace(hour=QUIET_UNTIL, minute=0, second=0, microsecond=0)
    if local.hour >= QUIET_FROM:
        morning += timedelta(days=1)
    return morning.astimezone(timezone.utc)


def _is_personal_body(body: str) -> bool:
    return bool(_VARIABLE.search(body))


def render_bulk(body: str, base_context: dict, recipients: list, *, org_id: Optional[UUID] = None,
                base_url: Optional[str] = None, preview_only: bool = False) -> list[tuple]:
    """(recipient, text, length info) per recipient; raises SmsError when a text is unusable."""
    needs_ret = "{ret_linki}" in (body or "") and org_id is not None and base_url
    needs_pay = "{odeme_linki}" in (body or "") and base_url
    personal = _is_personal_body(body)
    if not personal and not needs_ret:
        shared = render_template(body, base_context)
        info = segment_info(shared)
        if not info["parts"]:
            raise SmsError("Mesaj metni boş")
        if info["parts"] > MAX_PARTS:
            raise SmsError(f"Mesaj çok uzun ({info['parts']} SMS); en fazla {MAX_PARTS} SMS boyunda olabilir")
        return [(recipient, shared, info) for recipient in recipients]
    out = []
    for recipient in recipients:
        ctx = {**base_context, "ad_soyad": recipient.name, "ad": recipient.first_name}
        if needs_ret:
            ctx["ret_linki"] = (
                f"{base_url}/sms-iptal/onizleme"
                if preview_only
                else f"{base_url}/sms-iptal/{opt_out_token(org_id, recipient.phone, recipient.donor_id)}"
            )
        if needs_pay and preview_only:
            ctx["odeme_linki"] = f"{base_url}/s/ornek123"
        text_ = render_template(body, ctx)
        info = segment_info(text_)
        if not info["parts"]:
            raise SmsError("Mesaj metni boş")
        if info["parts"] > MAX_PARTS:
            raise SmsError(f"Mesaj çok uzun ({info['parts']} SMS); en fazla {MAX_PARTS} SMS boyunda olabilir")
        out.append((recipient, text_, info))
    return out


async def create_batch(db: AsyncSession, org_id: UUID, *, name: str, body: str, audience: dict, label: str,
                       recipients: list, commercial: bool, send_at: Optional[datetime], created_by: Optional[UUID],
                       template_id: Optional[UUID] = None, campaign_id: Optional[UUID] = None,
                       throttle_per_minute: Optional[int] = None, ab_variant_body: Optional[str] = None,
                       ab_test_percent: Optional[int] = None):
    """Create a bulk SMS and its messages (the caller commits). Sending starts after the commit."""
    from app.models.organization import Organization
    from app.models.sms_batch import SmsBatch

    if not recipients:
        raise SmsError("Bu hedef kitlede SMS gönderilebilecek kimse yok")
    if len(recipients) > BULK_MAX_RECIPIENTS:
        raise SmsError(f"Bir gönderim en fazla {BULK_MAX_RECIPIENTS:,} kişiye yapılabilir".replace(",", "."))
    clean_a = clean_sms_text(body)
    clean_b = clean_sms_text(ab_variant_body) if ab_variant_body and ab_variant_body.strip() else None
    org = await db.get(Organization, org_id)
    base_url = site_url(org) if org else settings.PUBLIC_WEB_URL.rstrip("/")
    base_context = await build_context(db, org_id, campaign_id=campaign_id)

    has_ab = bool(clean_b and len(recipients) >= 2)
    b_percent = ab_test_percent or 50
    # Split recipients between variant A and variant B when A/B testing is enabled.
    b_indices: set[int] = set()
    if has_ab:
        b_count = max(1, min(len(recipients) - 1, round(len(recipients) * b_percent / 100)))
        step = len(recipients) / b_count
        b_indices = {min(len(recipients) - 1, int(i * step)) for i in range(b_count)}

    now = datetime.now(timezone.utc)
    scheduled = bool(send_at and send_at > now + timedelta(seconds=30))
    batch_send_after = send_at if scheduled else now
    batch = SmsBatch(
        organization_id=org_id, name=name.strip(), body=clean_a, audience=audience,
        audience_label=label[:200], commercial=commercial, total=len(recipients),
        send_after=batch_send_after, created_by=created_by, campaign_id=campaign_id,
        throttle_per_minute=throttle_per_minute, ab_variant_body=clean_b,
        ab_test_percent=b_percent if has_ab else None,
    )
    db.add(batch)
    await db.flush()
    seq = await _next_seq_no(db, org_id)

    track_links = "{odeme_linki}" in clean_a or (clean_b and "{odeme_linki}" in clean_b)
    rows = []
    for index, recipient in enumerate(recipients):
        variant = ("B" if index in b_indices else "A") if has_ab else None
        tpl_body = clean_b if variant == "B" and clean_b else clean_a
        track_code = secrets.token_urlsafe(7) if track_links else None
        ctx = {**base_context, "ad_soyad": recipient.name, "ad": recipient.first_name}
        if "{ret_linki}" in tpl_body:
            ctx["ret_linki"] = f"{base_url}/sms-iptal/{opt_out_token(org_id, recipient.phone, recipient.donor_id)}"
        if track_code:
            ctx["odeme_linki"] = f"{base_url}/s/{track_code}"
        text_ = render_template(tpl_body, ctx)
        info = segment_info(text_)
        if not info["parts"]:
            raise SmsError("Mesaj metni boş")
        if info["parts"] > MAX_PARTS:
            raise SmsError(f"Mesaj çok uzun ({info['parts']} SMS); en fazla {MAX_PARTS} SMS boyunda olabilir")
        msg_send_after = batch_send_after
        if throttle_per_minute and throttle_per_minute > 0:
            msg_send_after = batch_send_after + timedelta(minutes=index // throttle_per_minute)
        is_msg_scheduled = scheduled or (msg_send_after > now + timedelta(seconds=30))
        rows.append(SmsMessage(
            organization_id=org_id, seq_no=seq + index, donor_id=recipient.donor_id, phone=recipient.phone, body=text_,
            status="scheduled" if is_msg_scheduled else "queued", source="bulk", template_id=template_id,
            batch_id=batch.id, ab_variant=variant, track_code=track_code,
            commercial=commercial, encoding=info["encoding"], parts=info["parts"], send_after=msg_send_after,
            created_by=created_by,
        ))
    for start in range(0, len(rows), 1000):
        db.add_all(rows[start:start + 1000])
        await db.flush()
    if not scheduled:
        event.listen(db.sync_session, "after_commit", lambda _session: _kick_batch(str(batch.id)), once=True)
    return batch


async def cancel_batch(db: AsyncSession, batch) -> int:
    """Stop a bulk SMS: messages not sent yet are cancelled. Returns how many."""
    from sqlalchemy import update

    batch.cancelled_at = datetime.now(timezone.utc)
    result = await db.execute(update(SmsMessage).where(
        SmsMessage.batch_id == batch.id, SmsMessage.status.in_(SMS_OPEN_STATUSES)).values(status="cancelled"))
    return result.rowcount or 0


async def _send_bulk_chunk(session: AsyncSession, messages: list[SmsMessage]) -> None:
    """Send a chunk of locked, due messages via provider.send_bulk and commit."""
    from app.models.donation import Donor
    from app.services.tenant_credentials import sms_account

    if not messages:
        return
    now = datetime.now(timezone.utc)
    org_id = messages[0].organization_id
    commercial = bool(messages[0].commercial)

    # Re-check opt-out for commercial messages with donor_id (protects scheduled/throttled batches).
    donor_ids = [m.donor_id for m in messages if m.donor_id is not None]
    if commercial and donor_ids:
        opted_out = set((await session.execute(
            select(Donor.id).where(Donor.id.in_(donor_ids), Donor.allow_sms.is_(False))
        )).scalars().all())
        if opted_out:
            still_open = []
            for m in messages:
                if m.donor_id in opted_out:
                    m.status = "cancelled"
                    m.error = "Alıcı SMS iznini iptal etti"
                else:
                    still_open.append(m)
            messages = still_open
            if not messages:
                await session.commit()
                return

    # Opted out after the batch was made (scheduled or throttled sends).
    from app.services.sms_audience import opted_out_phones

    refused = await opted_out_phones(session, org_id)
    for m in messages:
        if phone_key(m.phone) in refused:
            m.status = "cancelled"
            m.error = "Alıcı SMS almak istemiyor"
    messages = [m for m in messages if m.status != "cancelled"]
    if not messages:
        await session.commit()
        return

    account = await sms_account(session, org_id)
    provider = PROVIDERS.get(account.get("provider") or "")
    usable = bool(provider) and not account.get("disabled") and provider(account).configured
    try:
        if usable:
            pairs = [(m.phone, m.body) for m in messages]
            results = await asyncio.to_thread(deliver_bulk, pairs, account, commercial)
            for m, res in zip(messages, results):
                m.provider, m.provider_ref = res.provider, res.reference
        elif settings.ENVIRONMENT == "production":
            raise SmsError("Kurumun SMS hesabı yapılandırılmadı")
        else:
            for m in messages:
                logger.info("[dev] SMS %s: %s", m.phone, m.body)
                m.provider = "dev"
        for m in messages:
            m.status, m.sent_at, m.error = "sent", now, None
    except SmsError as exc:
        for m in messages:
            m.attempts += 1
            m.error = str(exc)[:500]
            if isinstance(exc, SmsUnreachable) and m.attempts < MAX_ATTEMPTS:
                m.status = "queued"
                m.send_after = now + timedelta(minutes=2 ** m.attempts)
            else:
                m.status = "failed"
    except Exception as exc:  # noqa: BLE001
        logger.exception("Toplu SMS kümesi beklenmedik biçimde başarısız oldu")
        for m in messages:
            m.attempts += 1
            m.error = f"Beklenmeyen hata: {exc}"[:500]
            m.status = "failed"
    await session.commit()


async def run_batch(batch_id: str, concurrency: int = 4) -> int:
    """Send the due messages of a bulk SMS, batching HTTP calls when possible."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    gate = asyncio.Semaphore(concurrency)
    handled = 0
    use_bulk_api = deliver is _ORIGINAL_DELIVER

    async def one(message_id) -> None:
        async with gate, sessions() as session:
            try:
                await process_in(session, message_id)
            except Exception:  # noqa: BLE001 - one bad row must not stop the batch
                logger.exception("Toplu SMS iletisi gönderilemedi")

    try:
        while True:
            async with sessions() as session:
                ids = (await session.execute(
                    select(SmsMessage.id).where(
                        SmsMessage.batch_id == UUID(str(batch_id)), SmsMessage.status.in_(SMS_OPEN_STATUSES),
                        SmsMessage.send_after <= datetime.now(timezone.utc),
                    ).order_by(SmsMessage.seq_no).limit(100)
                )).scalars().all()
            if not ids:
                return handled
            if use_bulk_api and len(ids) > 1:
                async with sessions() as session:
                    locked = (await session.execute(
                        select(SmsMessage).where(
                            SmsMessage.id.in_(ids), SmsMessage.status.in_(SMS_OPEN_STATUSES),
                            SmsMessage.send_after <= datetime.now(timezone.utc),
                        ).order_by(SmsMessage.seq_no).with_for_update(skip_locked=True)
                    )).scalars().all()
                    if locked:
                        await _send_bulk_chunk(session, locked)
            else:
                await asyncio.gather(*(one(message_id) for message_id in ids))
            handled += len(ids)
    finally:
        await engine.dispose()


def _hand_over_batch(batch_id: str) -> None:
    try:
        from app.tasks import send_sms_batch_task
        send_sms_batch_task.apply_async((batch_id,), retry=False, ignore_result=True)
    except Exception as exc:  # noqa: BLE001 - no broker
        logger.warning("SMS işçisine ulaşılamadı (%s); toplu gönderim bu süreçten yapılıyor", exc)
        try:
            asyncio.run(run_batch(batch_id))
        except Exception:  # noqa: BLE001 - messages stay queued for the dispatcher
            logger.exception("Toplu SMS gönderilemedi; kuyrukta bekliyor")


def _kick_batch(batch_id: str) -> None:
    threading.Thread(target=_hand_over_batch, args=(batch_id,), daemon=True, name="sms-batch").start()


async def process_message(message_id: str) -> str:
    """Worker entry for one message."""
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        return await process_in(session, message_id)


async def dispatch_due(limit: int = 200) -> dict:
    """Send scheduled messages whose time has come and queued ones no worker picked up."""
    from app.core.db import AsyncSessionLocal

    due = [SmsMessage.status.in_(SMS_OPEN_STATUSES), SmsMessage.send_after <= datetime.now(timezone.utc)]
    async with AsyncSessionLocal() as session:
        batches = (await session.execute(
            select(SmsMessage.batch_id).where(*due, SmsMessage.batch_id.is_not(None)).distinct()
        )).scalars().all()
        ids = (await session.execute(
            select(SmsMessage.id).where(*due, SmsMessage.batch_id.is_(None))
            .order_by(SmsMessage.send_after).limit(limit)
        )).scalars().all()
    outcomes: dict[str, int] = {}
    for batch_id in batches:  # scheduled bulk SMS, or one whose worker was interrupted
        outcomes["bulk"] = outcomes.get("bulk", 0) + await run_batch(str(batch_id))
    for message_id in ids:
        outcome = await process_message(str(message_id))
        outcomes[outcome] = outcomes.get(outcome, 0) + 1
    return outcomes


# --- Delivery reports and balance ----------------------------------------------------

REPORT_WINDOW = timedelta(hours=48)   # operators report within two days; after that "sent" stays
REPORT_FIRST_WAIT = timedelta(minutes=2)


async def collect_reports(db: AsyncSession, org_id: Optional[UUID] = None) -> dict:
    """Ask providers what happened to sent messages and mark them delivered or failed (the caller commits).

    Each message is asked for again with growing pauses; providers limit report queries, so one
    round handles a bounded number per organisation and the rest waits for the next round.
    """
    from app.services.tenant_credentials import sms_account

    now = datetime.now(timezone.utc)
    pending = [SmsMessage.status == "sent", SmsMessage.provider_ref.is_not(None), SmsMessage.provider.in_(PROVIDERS),
               SmsMessage.sent_at > now - REPORT_WINDOW, SmsMessage.sent_at < now - REPORT_FIRST_WAIT]
    if org_id is not None:
        pending.append(SmsMessage.organization_id == org_id)
    org_ids = [org_id] if org_id is not None else (await db.execute(select(SmsMessage.organization_id).where(*pending).distinct())).scalars().all()
    totals = {"delivered": 0, "failed": 0, "asked": 0}
    for org_id in org_ids:
        account = await sms_account(db, org_id)
        cls = PROVIDERS.get(account.get("provider") or "")
        if not cls or account.get("disabled") or not cls(account).configured:
            continue
        provider = cls(account)
        rows = (await db.execute(
            select(SmsMessage).where(*pending, SmsMessage.organization_id == org_id, SmsMessage.provider == provider.key)
            .order_by(SmsMessage.report_checked_at.asc().nulls_first(), SmsMessage.sent_at)
            .limit(provider.report_chunk * provider.report_calls * 3)
        )).scalars().all()
        # Skip those asked recently: 5, 10, 20… minutes between questions.
        due = [m for m in rows if not m.report_checked_at
               or now - m.report_checked_at >= timedelta(minutes=min(5 * 2 ** max(m.report_checks - 1, 0), 240))]
        due = due[:provider.report_chunk * provider.report_calls]
        for start in range(0, len(due), provider.report_chunk):
            chunk = due[start:start + provider.report_chunk]
            try:
                outcomes = await asyncio.to_thread(provider.reports, [m.provider_ref for m in chunk])
            except SmsError as exc:
                logger.warning("SMS iletim raporu alınamadı: %s", exc)
                break
            for message in chunk:
                message.report_checked_at, message.report_checks = now, (message.report_checks or 0) + 1
                outcome = outcomes.get(message.provider_ref)
                if not outcome:
                    continue
                message.status = outcome[0]
                if outcome[0] == "delivered":
                    message.delivered_at = now
                else:
                    message.error = outcome[1]
                totals[outcome[0]] += 1
            totals["asked"] += len(chunk)
    return totals


_balance_cache: dict = {}


async def provider_balance(db: AsyncSession, org_id: UUID) -> dict:
    """The organisation's own SMS account and its remaining credit (asked at most once a minute)."""
    from app.models.organization import Organization
    from app.services.tenant_credentials import sms_account

    account = await sms_account(db, org_id)
    org = await db.get(Organization, org_id)
    cls = PROVIDERS.get(account.get("provider") or "")
    sender = (account.get("sender") or account.get("header") or account.get("originator") or "").strip() or None
    info = {
        "provider": cls.label if cls else None,
        "own_account": False,
        "balance": None,
        "org_name": org.name if org else None,
        "sender": sender,
    }
    if not cls or account.get("disabled") or account.get("platform") or not cls(account).configured:
        return info  # the platform account's credit is not the organisation's to see
    info["own_account"] = True
    cached = _balance_cache.get(org_id)
    if cached and cached[0] > datetime.now(timezone.utc):
        info["balance"] = cached[1]
        return info
    try:
        info["balance"] = await asyncio.to_thread(cls(account).balance)
    except SmsError:
        info["balance"] = None
    _balance_cache[org_id] = (datetime.now(timezone.utc) + timedelta(seconds=60), info["balance"])
    return info
