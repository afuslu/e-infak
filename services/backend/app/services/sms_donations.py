"""Operator SMS donations (short-number donations) reported by the provider, by webhook or file.

Providers differ, so records are read loosely: each field accepts the usual Turkish and English
column names. Every record becomes a confirmed donation on the campaign its keyword points to
(or the default campaign); the donor is found by phone number, or created when allowed. The
provider's id (or a hash of the row) keeps webhooks retried or files uploaded twice from
creating the donation again.

Settings live in Organization.settings["sms_donation"]:
  keywords: {"SU": "<campaign uuid>", ...}, default_campaign_id, default_amount (TL),
  create_donors (bool, default true), send_receipt (bool, default false)
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.integrations import display_phone, find_donor_by_phone, phone_key

PROVIDER = "sms_donation"
TZ = ZoneInfo("Europe/Istanbul")
FIELD_ALIASES = {
    "ref": ("ref", "id", "transaction_id", "transactionid", "txn_id", "islem_no", "işlem no", "islem id", "işlem id",
            "message_id", "mesaj_id", "referans", "reference"),
    "phone": ("phone", "msisdn", "gsm", "telefon", "tel", "numara", "number", "gonderen", "gönderen", "sender"),
    "amount": ("amount", "tutar", "price", "fiyat", "ucret", "ücret", "bagis_tutari", "bağış tutarı"),
    "keyword": ("keyword", "anahtar_kelime", "anahtar kelime", "kelime", "message", "mesaj", "text", "icerik",
                "içerik", "body"),
    "operator": ("operator", "operatör", "operator_name", "carrier"),
    "date": ("date", "tarih", "created_at", "timestamp", "zaman", "islem_tarihi", "işlem tarihi", "received_at"),
}


class SmsDonationError(ValueError):
    pass


def settings_of(org) -> dict:
    raw = ((getattr(org, "settings", None) or {}).get("sms_donation") or {})
    return {
        "keywords": {str(k).strip().upper(): str(v) for k, v in (raw.get("keywords") or {}).items() if k and v},
        "default_campaign_id": raw.get("default_campaign_id") or None,
        "default_amount": raw.get("default_amount"),
        "create_donors": raw.get("create_donors") is not False,
        "send_receipt": bool(raw.get("send_receipt")),
    }


def _norm_key(key: str) -> str:
    # Both sides fold the same way: "İ" lowercases to "i" + combining dot in Python and "ı" stays
    # dotless, so drop the dot and treat ı as i ("İşlem No", "ISLEM NO", "işlem no" all match).
    text = str(key or "").strip().lower().replace("\u0307", "").replace("ı", "i")
    return re.sub(r"\s+", " ", text.replace("_", " "))


def pick(data: dict, field: str) -> Any:
    wanted = {_norm_key(a) for a in FIELD_ALIASES[field]}
    for key, value in data.items():
        if _norm_key(key) in wanted and value not in (None, ""):
            return value
    return None


def parse_amount(value: Any) -> Optional[int]:
    """'10', '10,00', '10.00 TL', 10 → 1000 cents."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float, Decimal)):
        number = Decimal(str(value))
    else:
        text = re.sub(r"[^\d,.\-]", "", str(value))
        if "," in text and "." in text:
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", ".")
        try:
            number = Decimal(text)
        except InvalidOperation:
            return None
    cents = int((number * 100).quantize(Decimal("1")))
    return cents if cents > 0 else None


def parse_date(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=TZ)
    text = str(value).strip()
    if text.isdigit():
        number = int(text)
        if number > 10**12:
            number //= 1000
        return datetime.fromtimestamp(number, tz=timezone.utc)
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
                "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d",
                "%d.%m.%Y", "%d/%m/%Y"):
        try:
            parsed = datetime.strptime(text.replace("Z", "+0000"), fmt)
        except ValueError:
            continue
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=TZ)
    return None


def normalize(data: dict, default_amount: Optional[float] = None) -> dict:
    """Provider record → {ref, phone, amount_cents, keyword, operator, received_at}."""
    phone = pick(data, "phone")
    amount = parse_amount(pick(data, "amount"))
    if amount is None and default_amount:
        amount = parse_amount(default_amount)
    keyword_raw = str(pick(data, "keyword") or "").strip()
    keyword = keyword_raw.split()[0].upper()[:60] if keyword_raw else None
    received = parse_date(pick(data, "date")) or datetime.now(timezone.utc)
    ref = pick(data, "ref")
    if not ref:
        basis = f"{phone_key(phone)}|{amount}|{keyword}|{received.isoformat()}"
        ref = "h-" + hashlib.sha256(basis.encode()).hexdigest()[:32]
    if amount is None:
        raise SmsDonationError("Tutar okunamadı")
    return {"ref": str(ref)[:120], "phone": display_phone(phone)[:20] if phone else None, "amount_cents": amount,
            "keyword": keyword, "operator": (str(pick(data, "operator") or "").strip()[:40] or None),
            "received_at": received}


async def _campaign_for(db: AsyncSession, org_id: UUID, cfg: dict, keyword: Optional[str],
                        campaign_id: Optional[UUID] = None):
    from app.models.campaign import Campaign

    candidates = [campaign_id, cfg["keywords"].get((keyword or "").upper()), cfg["default_campaign_id"]]
    for cid in candidates:
        if not cid:
            continue
        try:
            camp = await db.get(Campaign, UUID(str(cid)))
        except ValueError:
            continue
        if camp and camp.organization_id == org_id:
            return camp
    return None


async def _donor_for(db: AsyncSession, org_id: UUID, phone: Optional[str], create: bool):
    from app.models.donation import Donor

    if not phone:
        return None
    donor = await find_donor_by_phone(db, org_id, phone)
    if donor or not create:
        return donor
    key = phone_key(phone)
    donor = Donor(organization_id=org_id, first_name="SMS Bağışçısı", last_name=f"…{key[-4:]}" if key else None,
                  phone=display_phone(phone)[:20], tags=["sms-bagis"])
    db.add(donor)
    await db.flush()
    return donor


async def _make_donation(db: AsyncSession, org_id: UUID, record, campaign, donor, send_receipt: bool) -> None:
    from app.models.donation import PaymentMethod
    from app.services.offline_donation import record_offline_donation

    donation, _ = await record_offline_donation(
        db, organization_id=org_id, campaign=campaign, donor=donor, amount_cents=record.amount_cents,
        currency="TRY", method=PaymentMethod.BANK_TRANSFER, paid_at=record.received_at, issued_by_id=None,
        provider=PROVIDER, idempotency_key=f"smsd:{org_id}:{record.external_ref}"[:120],
        details={"channel": "sms", "method_label": "SMS bağışı", "keyword": record.keyword,
                 "operator": record.operator, "sms_ref": record.external_ref},
        transaction_id=record.external_ref[:100], send_receipt=send_receipt,
    )
    record.donation_id, record.campaign_id, record.donor_id = donation.id, campaign.id, donor.id
    record.status, record.error = "recorded", None


async def record(db: AsyncSession, org, data: dict, source: str = "webhook") -> tuple[Any, bool]:
    """Store one provider record and book its donation (caller commits). Returns (record, created)."""
    from app.models.channels import SmsDonationRecord

    cfg = settings_of(org)
    item = normalize(data, cfg["default_amount"])
    existing = (await db.execute(select(SmsDonationRecord).where(
        SmsDonationRecord.organization_id == org.id, SmsDonationRecord.external_ref == item["ref"],
    ))).scalar_one_or_none()
    if existing:
        return existing, False
    rec = SmsDonationRecord(organization_id=org.id, external_ref=item["ref"], source=source, phone=item["phone"],
                            amount_cents=item["amount_cents"], keyword=item["keyword"], operator=item["operator"],
                            received_at=item["received_at"],
                            raw={k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in data.items()})
    db.add(rec)
    await db.flush()
    campaign = await _campaign_for(db, org.id, cfg, item["keyword"])
    donor = await _donor_for(db, org.id, item["phone"], cfg["create_donors"])
    if donor:
        rec.donor_id = donor.id
    if not campaign:
        rec.status, rec.error = "unmatched", "Anahtar kelime bir bağış kalemine bağlı değil"
    elif not donor:
        rec.status, rec.error = "unmatched", "Telefon numarası yok veya bağışçı bulunamadı"
    else:
        await _make_donation(db, org.id, rec, campaign, donor, cfg["send_receipt"])
    return rec, True


async def assign(db: AsyncSession, org, rec, campaign_id: Optional[UUID], donor_id: Optional[UUID]) -> None:
    """Book an unmatched record by hand: pick the campaign and/or donor."""
    from app.models.donation import Donor

    if rec.donation_id:
        raise SmsDonationError("Bu SMS bağışı zaten kaydedildi")
    cfg = settings_of(org)
    campaign = await _campaign_for(db, org.id, cfg, rec.keyword, campaign_id)
    if not campaign:
        raise SmsDonationError("Bağış kalemi seçin")
    donor = None
    if donor_id:
        donor = await db.get(Donor, donor_id)
        if not donor or donor.organization_id != org.id:
            raise SmsDonationError("Bağışçı bulunamadı")
    else:
        donor = await _donor_for(db, org.id, rec.phone, True)
    if not donor:
        raise SmsDonationError("Bağışçı seçin")
    await _make_donation(db, org.id, rec, campaign, donor, cfg["send_receipt"])
