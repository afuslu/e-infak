"""Veri araçları: Excel / CSV'den bağışçı ve makbuz aktarma sihirbazı, mükerrer bağışçı bulma ve birleştirme.

Aktarma iki adımlıdır: eşleme verilmezse dosyanın başlıkları, örnek satırlar ve önerilen sütun eşlemesi
döner; eşleme ile `dry_run=true` tüm satırları doğrular, `dry_run=false` geçerli satırları kaydeder.
Makbuz aktarımı dosya + satır numarasıyla idempotenttir: aynı dosyayı tekrar yüklemek çift kayıt açmaz.
"""
import csv
import hashlib
import io
import json
import re
import unicodedata
from datetime import date, datetime, time, timezone
from typing import Annotated, List, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission, require_capability, masked
from app.api.v1.crm import _normalize_phone
from app.api.v1.reconciliation import _amount_to_cents
from app.core.db import Base, get_db
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, DonorType, PaymentMethod
from app.models.membership import Member
from app.models.user import User
from app.services.offline_donation import record_offline_donation
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features",
    tags=["data-tools"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_ROWS = 5000
IMPORT_PROVIDER = "import"

DONOR_FIELDS = {
    "full_name": "Ad soyad (tek sütun)",
    "first_name": "Ad",
    "last_name": "Soyad",
    "company_name": "Kurum adı",
    "phone": "Telefon",
    "email": "E-posta",
    "tc_no": "TC kimlik no",
    "city": "Şehir",
    "country": "Ülke",
    "address": "Adres",
    "tags": "Grup / etiket",
    "notes": "Not",
    "allow_sms": "SMS izni (evet/hayır)",
    "allow_email": "E-posta izni (evet/hayır)",
}
RECEIPT_FIELDS = {
    **{k: v for k, v in DONOR_FIELDS.items() if k not in ("notes", "allow_sms", "allow_email", "tags")},
    "amount": "Tutar",
    "currency": "Para birimi",
    "paid_on": "Bağış tarihi",
    "campaign": "Kampanya / bağış türü",
    "payment_method": "Ödeme yöntemi",
    "official_receipt_no": "Matbu makbuz no",
    "on_behalf_of": "Adına bağış",
    "note": "Açıklama",
}
MEMBER_FIELDS = {
    **{k: v for k, v in DONOR_FIELDS.items() if k not in ("tags", "allow_sms", "allow_email", "company_name")},
    "member_no": "Üye no",
    "member_type": "Üyelik türü (asil/fahri/onursal)",
    "member_status": "Durum (aktif/pasif...)",
    "joined_on": "Kayıt tarihi",
    "dues": "Özel aidat (₺)",
    "dues_period": "Aidat dönemi (aylık/yıllık)",
}
# Başlık eş anlamlıları (normalize edilmiş: küçük harf, aksansız)
SYNONYMS = {
    "full_name": ["ad soyad", "adi soyadi", "isim", "isim soyisim", "bagisci", "bagisci adi", "name", "full name"],
    "first_name": ["ad", "adi", "isim", "first name"],
    "last_name": ["soyad", "soyadi", "soyisim", "last name", "surname"],
    "company_name": ["kurum", "firma", "sirket", "kurum adi", "company"],
    "phone": ["telefon", "tel", "gsm", "cep", "cep telefonu", "telefon no", "phone", "mobile"],
    "email": ["e-posta", "eposta", "email", "e-mail", "mail"],
    "tc_no": ["tc", "tc no", "tc kimlik", "tc kimlik no", "kimlik no", "tckn"],
    "city": ["sehir", "il", "city"],
    "country": ["ulke", "country"],
    "address": ["adres", "address"],
    "tags": ["grup", "etiket", "gruplar", "tags", "group"],
    "notes": ["not", "notlar", "aciklama", "notes"],
    "allow_sms": ["sms izni", "sms"],
    "allow_email": ["e-posta izni", "eposta izni", "mail izni"],
    "amount": ["tutar", "miktar", "bagis tutari", "amount"],
    "currency": ["para birimi", "doviz", "currency"],
    "paid_on": ["tarih", "bagis tarihi", "makbuz tarihi", "date"],
    "campaign": ["kampanya", "bagis turu", "bagis kalemi", "proje", "campaign"],
    "payment_method": ["odeme yontemi", "odeme sekli", "odeme", "payment method"],
    "official_receipt_no": ["makbuz no", "makbuz numarasi", "seri no", "koçan no", "kocan no", "receipt no"],
    "on_behalf_of": ["adina", "adina bagis", "kimin adina"],
    "note": ["aciklama", "not", "note"],
    "member_no": ["uye no", "uye numarasi", "sicil no", "member no"],
    "member_type": ["uyelik turu", "uye turu", "tur", "member type"],
    "member_status": ["durum", "uyelik durumu", "status"],
    "joined_on": ["kayit tarihi", "uyelik tarihi", "baslangic", "joined"],
    "dues": ["aidat", "ozel aidat", "aidat tutari", "dues"],
    "dues_period": ["aidat donemi", "donem", "periyot", "dues period"],
}
YES = {"evet", "e", "var", "1", "true", "x", "yes", "izinli"}
METHODS = {
    PaymentMethod.CASH: ("nakit", "elden", "cash", "kasa"),
    PaymentMethod.BANK_TRANSFER: ("havale", "eft", "banka", "transfer", "fast"),
    PaymentMethod.CREDIT_CARD: ("kart", "kredi", "pos", "credit"),
}


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


def _fold(value) -> str:
    folded = unicodedata.normalize("NFKD", str(value or "").strip().casefold().replace("ı", "i"))
    return re.sub(r"\s+", " ", "".join(c for c in folded if not unicodedata.combining(c)))


def _cell(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)  # Excel sayıları: 5321112233.0 -> "5321112233"
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def _decode_csv(content: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1254", "latin-1"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("CSV karakter kodlaması çözülemedi (UTF-8 veya Windows-1254 olmalı)")


def _read_table(content: bytes, filename: str, sheet_name: Optional[str] = None) -> tuple[list[str], list[list], list[str], Optional[str]]:
    name = filename.lower()
    sheet_names: list[str] = []
    active_sheet: Optional[str] = None
    if name.endswith(".xlsx"):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        sheet_names = list(wb.sheetnames)
        sheet = wb[sheet_name] if sheet_name and sheet_name in sheet_names else wb.active
        active_sheet = sheet.title if sheet else None
        rows = [list(r) for r in sheet.iter_rows(values_only=True)] if sheet else []
        wb.close()
    elif name.endswith(".csv"):
        text = _decode_csv(content)
        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
            rows = [list(r) for r in csv.reader(io.StringIO(text), dialect)]
        except csv.Error:
            first_line = sample.splitlines()[0] if sample.splitlines() else ""
            delim = ";" if ";" in first_line else ("\t" if "\t" in first_line else ",")
            rows = [list(r) for r in csv.reader(io.StringIO(text), delimiter=delim)]
    else:
        raise HTTPException(status_code=400, detail="Yalnız XLSX veya CSV yüklenebilir")
    rows = [r for r in rows if any(_cell(v) for v in r)]
    if not rows:
        raise HTTPException(status_code=422, detail="Dosya boş")
    headers = [_cell(h) or f"Sütun {i + 1}" for i, h in enumerate(rows[0])]
    data = rows[1:]
    if len(data) > MAX_ROWS:
        raise HTTPException(status_code=413, detail=f"Bir seferde en fazla {MAX_ROWS} satır aktarılabilir")
    return headers, data, sheet_names, active_sheet


def _suggest(headers: list[str], fields: dict) -> dict:
    mapping, taken = {}, set()
    for field in fields:
        for index, header in enumerate(headers):
            if index not in taken and _fold(header) in SYNONYMS.get(field, []):
                mapping[field] = index
                taken.add(index)
                break
    if "first_name" in mapping and "full_name" in mapping and mapping["first_name"] == mapping["full_name"]:
        mapping.pop("first_name")
    return mapping


async def _load(file: UploadFile, sheet_name: Optional[str] = None) -> tuple[bytes, list[str], list[list], list[str], Optional[str]]:
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Dosya en fazla 10 MB olabilir")
    try:
        headers, rows, sheet_names, active_sheet = _read_table(content, file.filename or "", sheet_name=sheet_name)
    except (UnicodeDecodeError, csv.Error, StopIteration, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Dosya okunamadı: {exc}") from exc
    return content, headers, rows, sheet_names, active_sheet


def _mapping(raw: Optional[str], headers: list[str], fields: dict) -> Optional[dict]:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Sütun eşlemesi okunamadı") from exc
    mapping = {}
    for field, index in (data or {}).items():
        if field in fields and index is not None and index != "":
            index = int(index)
            if not 0 <= index < len(headers):
                raise HTTPException(status_code=422, detail=f"Geçersiz sütun: {field}")
            mapping[field] = index
    return mapping


def _row_values(row: list, mapping: dict) -> dict:
    return {field: _cell(row[index]) if index < len(row) else None for field, index in mapping.items()}


def _clean(value: Optional[str], limit: int) -> Optional[str]:
    cleaned = sanitize_public_text(value) if value else None
    return cleaned[:limit] if cleaned else None


def _donor_data(values: dict) -> dict:
    """Satırdaki bağışçı alanlarını doğrular; hatada ValueError."""
    first, last = values.get("first_name"), values.get("last_name")
    if values.get("full_name") and not first:
        parts = values["full_name"].split()
        first, last = (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else (parts[0], last)
    company = values.get("company_name")
    if not first and not company:
        raise ValueError("Ad veya kurum adı boş")
    email = (values.get("email") or "").strip().lower() or None
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError(f"Geçersiz e-posta: {email}")
    tc = re.sub(r"\D", "", values.get("tc_no") or "") or None
    if tc and len(tc) != 11:
        raise ValueError(f"TC kimlik no 11 haneli olmalı: {values.get('tc_no')}")
    phone = _normalize_phone(values.get("phone"))
    if phone and len(phone) == 10:
        phone = "0" + phone  # 532... -> 0532...
    tags = [t.strip()[:40] for t in re.split(r"[;,]", values.get("tags") or "") if t.strip()]
    return {
        "first_name": _clean(first or company, 100), "last_name": _clean(last, 100), "company_name": _clean(company, 200),
        "donor_type": DonorType.CORPORATE if company and not first else DonorType.INDIVIDUAL,
        "phone": phone, "email": email, "tc_no": tc,
        "city": _clean(values.get("city"), 100), "country": _clean(values.get("country"), 100),
        "address": _clean(values.get("address"), 1000), "notes": _clean(values.get("notes"), 2000), "tags": tags,
        "allow_sms": _fold(values.get("allow_sms")) in YES if values.get("allow_sms") is not None else None,
        "allow_email": _fold(values.get("allow_email")) in YES if values.get("allow_email") is not None else None,
    }


class DonorResolver:
    """Telefon, e-posta veya TC ile mevcut bağışçıyı bulur; dosya içi tekrarları da yakalar."""

    def __init__(self, db: AsyncSession, org_id: UUID):
        self.db, self.org_id, self.cache = db, org_id, {}

    def _keys(self, data: dict) -> list[str]:
        return [f"{k}:{data[k]}" for k in ("tc_no", "phone", "email") if data.get(k)]

    async def find(self, data: dict) -> Optional[Donor]:
        for key in self._keys(data):
            if key in self.cache:
                return self.cache[key]
        checks = []
        if data.get("tc_no"):
            checks.append(Donor.tc_no == data["tc_no"])
        if data.get("phone"):
            checks.append(Donor.phone == data["phone"])
        if data.get("email"):
            checks.append(func.lower(Donor.email) == data["email"])
        if not checks:
            return None
        return (await self.db.execute(select(Donor).where(Donor.organization_id == self.org_id, or_(*checks))
                                      .order_by(Donor.created_at))).scalars().first()

    def remember(self, donor: Donor, data: dict) -> None:
        for key in self._keys(data):
            self.cache[key] = donor

    async def upsert(self, data: dict, write: bool) -> tuple[Optional[Donor], bool]:
        """(bağışçı, yeni mi). write=False iken yeni kayıt açılmaz."""
        donor = await self.find(data)
        if donor is not None:
            if write:
                for key in ("last_name", "company_name", "phone", "email", "tc_no", "city", "country", "address"):
                    if data.get(key) and not getattr(donor, key):
                        setattr(donor, key, data[key])  # boş alanları doldur, dolu olanı ezme
                if data["tags"]:
                    donor.tags = sorted(set(donor.tags or []) | set(data["tags"]))
                if data.get("notes"):
                    donor.notes = f"{donor.notes}\n{data['notes']}" if donor.notes else data["notes"]
                if data.get("allow_sms"):
                    donor.allow_sms = True
                if data.get("allow_email"):
                    donor.allow_email = True
            self.remember(donor, data)
            return donor, False
        if not write:
            placeholder = Donor(organization_id=self.org_id, **{k: v for k, v in data.items() if k not in ("allow_sms", "allow_email")})
            self.remember(placeholder, data)
            return placeholder, True
        donor = Donor(
            organization_id=self.org_id, total_donations=0, total_donated_cents=0,
            **{k: v for k, v in data.items() if k not in ("allow_sms", "allow_email")},
            allow_sms=bool(data.get("allow_sms")), allow_email=bool(data.get("allow_email")),
        )
        if not donor.country:
            donor.country = "Türkiye"
        self.db.add(donor)
        await self.db.flush()
        self.remember(donor, data)
        return donor, True


def _intro(headers: list[str], rows: list[list], fields: dict, sheet_names: list[str], active_sheet: Optional[str]) -> dict:
    return {
        "headers": headers, "row_count": len(rows), "fields": fields,
        "sample": [[_cell(v) for v in r] for r in rows[:10]],
        "suggested_mapping": _suggest(headers, fields),
        "sheet_names": sheet_names,
        "active_sheet": active_sheet,
    }


# --- Donor import --------------------------------------------------------------------------

@router.post("/donors/import", dependencies=[Depends(require_capability("donors.import"))])
async def import_donors(
    request: Request,
    file: UploadFile = File(...),
    mapping: Annotated[Optional[str], Form()] = None,
    dry_run: Annotated[bool, Form()] = True,
    extra_tag: Annotated[Optional[str], Form(max_length=40)] = None,
    sheet_name: Annotated[Optional[str], Form()] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    _, headers, rows, sheet_names, active_sheet = await _load(file, sheet_name=sheet_name)
    columns = _mapping(mapping, headers, DONOR_FIELDS)
    if columns is None:
        return _intro(headers, rows, DONOR_FIELDS, sheet_names, active_sheet)
    if not {"first_name", "full_name", "company_name"} & set(columns):
        raise HTTPException(status_code=422, detail="Ad, ad soyad veya kurum adı sütunu eşlenmeli")
    resolver = DonorResolver(db, org_id)
    created = matched = 0
    errors, preview = [], []
    for line, row in enumerate(rows, start=2):
        try:
            data = _donor_data(_row_values(row, columns))
        except ValueError as exc:
            errors.append({"row": line, "message": str(exc)})
            continue
        if extra_tag:
            data["tags"] = sorted({*data["tags"], sanitize_public_text(extra_tag)[:40]})
        donor, is_new = await resolver.upsert(data, write=not dry_run)
        created += is_new
        matched += not is_new
        if len(preview) < 20:
            preview.append({"row": line, "action": "yeni" if is_new else "eşleşti", "name": donor.full_name,
                            "phone": data["phone"], "email": data["email"], "tags": data["tags"]})
    if not dry_run:
        db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="bagisci_aktar",
                        details={"file": file.filename, "created": created, "matched": matched, "errors": len(errors)}))
        await db.commit()
    return {"row_count": len(rows), "created": created, "matched": matched, "error_count": len(errors),
            "errors": errors[:1000], "preview": preview, "committed": not dry_run}


# --- Receipt import ------------------------------------------------------------------------

def _parse_day(value: Optional[str]) -> date:
    if not value:
        raise ValueError("Tarih boş")
    text = value.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Geçersiz tarih: {value}")


def _method(value: Optional[str]) -> PaymentMethod:
    folded = _fold(value)
    if not folded:
        return PaymentMethod.CASH
    for method, words in METHODS.items():
        if any(w in folded for w in words):
            return method
    raise ValueError(f"Bilinmeyen ödeme yöntemi: {value}")


@router.post("/donations/import", dependencies=[Depends(require_capability("donors.import"))])
async def import_receipts(
    request: Request,
    file: UploadFile = File(...),
    mapping: Annotated[Optional[str], Form()] = None,
    dry_run: Annotated[bool, Form()] = True,
    default_campaign_id: Annotated[Optional[UUID], Form()] = None,
    sheet_name: Annotated[Optional[str], Form()] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Geçmiş makbuzları aktarır: her satır onaylı bir bağış olur; makbuz e-postası gönderilmez."""
    org_id = _org_id(request)
    content, headers, rows, sheet_names, active_sheet = await _load(file, sheet_name=sheet_name)
    columns = _mapping(mapping, headers, RECEIPT_FIELDS)
    if columns is None:
        return _intro(headers, rows, RECEIPT_FIELDS, sheet_names, active_sheet)
    if "amount" not in columns or not {"first_name", "full_name", "company_name"} & set(columns):
        raise HTTPException(status_code=422, detail="Tutar ve bağışçı adı sütunları eşlenmeli")
    campaigns = (await db.execute(select(Campaign).where(Campaign.organization_id == org_id))).scalars().all()
    by_name = {}
    for c in campaigns:
        by_name.setdefault(_fold(c.title), c)
        by_name.setdefault(_fold(c.slug), c)
    default_campaign = next((c for c in campaigns if c.id == default_campaign_id), None)
    if default_campaign_id and not default_campaign:
        raise HTTPException(status_code=404, detail="Varsayılan kampanya bulunamadı")

    file_key = hashlib.sha256(content).hexdigest()[:20]
    existing_keys = set((await db.execute(select(Donation.idempotency_key).where(
        Donation.organization_id == org_id, Donation.idempotency_key.like(f"import:{file_key}:%")))).scalars().all())
    seen_official = set()
    resolver = DonorResolver(db, org_id)
    imported = skipped = new_donors = 0
    total_cents: dict[str, int] = {}
    errors, preview = [], []
    for line, row in enumerate(rows, start=2):
        key = f"import:{file_key}:{line}"
        if key in existing_keys:
            skipped += 1
            continue
        values = _row_values(row, columns)
        try:
            data = _donor_data(values)
            amount = _amount_to_cents(values.get("amount"))
            if amount <= 0:
                raise ValueError("Tutar sıfırdan büyük olmalı")
            currency = (values.get("currency") or "TRY").upper().replace("TL", "TRY")
            if currency not in ("TRY", "USD", "EUR", "GBP", "SAR", "CHF"):
                raise ValueError(f"Desteklenmeyen para birimi: {values.get('currency')}")
            paid_on = _parse_day(values.get("paid_on")) if "paid_on" in columns else datetime.now(TZ).date()
            if paid_on > datetime.now(TZ).date():
                raise ValueError("Bağış tarihi ileri bir tarih olamaz")
            campaign = by_name.get(_fold(values.get("campaign"))) if values.get("campaign") else None
            if values.get("campaign") and not campaign and not default_campaign:
                raise ValueError(f"Kampanya bulunamadı: {values['campaign']}")
            campaign = campaign or default_campaign
            if not campaign:
                raise ValueError("Kampanya yok; varsayılan kampanya seçin")
            method = _method(values.get("payment_method"))
            official = _clean(values.get("official_receipt_no"), 40)
            if official:
                if official in seen_official or (await db.execute(select(Donation.id).where(
                        Donation.organization_id == org_id, Donation.official_receipt_no == official))).first():
                    raise ValueError(f"Makbuz no zaten kayıtlı: {official}")
                seen_official.add(official)
        except ValueError as exc:
            errors.append({"row": line, "message": str(exc)})
            continue
        donor, is_new = await resolver.upsert(data, write=not dry_run)
        new_donors += is_new
        if not dry_run:
            donation, _ = await record_offline_donation(
                db, organization_id=org_id, campaign=campaign, donor=donor, amount_cents=amount, currency=currency,
                method=method, paid_at=datetime.combine(paid_on, time(12, 0), TZ), issued_by_id=current_user.id,
                provider=IMPORT_PROVIDER, idempotency_key=key, details={"import_file": file.filename, "row": line},
                note=_clean(values.get("note"), 1000), on_behalf_of=_clean(values.get("on_behalf_of"), 200),
                send_receipt=False,
            )
            donation.official_receipt_no = official
        imported += 1
        total_cents[currency] = total_cents.get(currency, 0) + amount
        if len(preview) < 20:
            preview.append({"row": line, "donor": donor.full_name, "donor_action": "yeni" if is_new else "eşleşti",
                            "amount_cents": amount, "currency": currency, "paid_on": paid_on.isoformat(),
                            "campaign": campaign.title, "payment_method": method.value, "official_receipt_no": official})
    if not dry_run:
        db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="makbuz_aktar", details={
            "file": file.filename, "imported": imported, "skipped": skipped, "errors": len(errors), "totals": total_cents}))
        await db.commit()
    return {"row_count": len(rows), "imported": imported, "already_imported": skipped, "new_donors": new_donors,
            "totals": [{"currency": c, "total_cents": v} for c, v in total_cents.items()],
            "error_count": len(errors), "errors": errors[:1000], "preview": preview, "committed": not dry_run}


# --- Member import -------------------------------------------------------------------------

MEMBER_TYPES = {"asil": "asil", "fahri": "fahri", "onursal": "onursal"}
MEMBER_STATUSES = {
    "aktif": "active", "active": "active",
    "pasif": "passive", "passive": "passive",
    "istifa": "resigned", "ayrilmis": "resigned", "resigned": "resigned",
    "ihrac": "expelled", "expelled": "expelled",
    "vefat": "deceased", "deceased": "deceased",
}


@router.post("/members/import", dependencies=[Depends(require_capability("members.manage"))])
async def import_members(
    request: Request,
    file: UploadFile = File(...),
    mapping: Annotated[Optional[str], Form()] = None,
    dry_run: Annotated[bool, Form()] = True,
    sheet_name: Annotated[Optional[str], Form()] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Excel/CSV'den dernek üyelerini toplu aktarır; mevcut kişiyle eşleştirir veya yeni kişi açar."""
    from app.api.v1.membership import _next_member_no

    org_id = _org_id(request)
    _, headers, rows, sheet_names, active_sheet = await _load(file, sheet_name=sheet_name)
    columns = _mapping(mapping, headers, MEMBER_FIELDS)
    if columns is None:
        return _intro(headers, rows, MEMBER_FIELDS, sheet_names, active_sheet)
    if not {"first_name", "full_name"} & set(columns):
        raise HTTPException(status_code=422, detail="Ad veya ad soyad sütunu eşlenmeli")

    existing_by_no = {
        m.member_no: m
        for m in (await db.execute(select(Member).where(Member.organization_id == org_id))).scalars().all()
    }
    existing_by_donor = {m.donor_id: m for m in existing_by_no.values()}
    resolver = DonorResolver(db, org_id)
    created = matched = 0
    errors, preview = [], []
    seen_nos = set(existing_by_no.keys())

    for line, row in enumerate(rows, start=2):
        values = _row_values(row, columns)
        try:
            data = _donor_data(values)
            m_no = _clean(values.get("member_no"), 30)
            raw_type = _fold(values.get("member_type"))
            m_type = MEMBER_TYPES.get(raw_type, "asil") if raw_type else "asil"
            if raw_type and raw_type not in MEMBER_TYPES:
                raise ValueError(f"Geçersiz üyelik türü: {values.get('member_type')}")
            raw_status = _fold(values.get("member_status"))
            m_status = MEMBER_STATUSES.get(raw_status) if raw_status else "active"
            if raw_status and not m_status:
                raise ValueError(f"Geçersiz durum: {values.get('member_status')}")
            joined_on = _parse_day(values.get("joined_on")) if values.get("joined_on") else None
            dues_cents = _amount_to_cents(values.get("dues")) if values.get("dues") else None
            raw_period = _fold(values.get("dues_period"))
            dues_period = "yearly" if raw_period in ("yillik", "yearly", "yil") else ("monthly" if raw_period in ("aylik", "monthly", "ay") else None)
            if raw_period and not dues_period:
                raise ValueError(f"Geçersiz aidat dönemi: {values.get('dues_period')}")
        except ValueError as exc:
            errors.append({"row": line, "message": str(exc)})
            continue

        donor, _ = await resolver.upsert(data, write=not dry_run)
        existing = existing_by_no.get(m_no) if m_no else None
        if existing is None and donor.id in existing_by_donor:
            existing = existing_by_donor[donor.id]

        if existing:
            matched += 1
            if not dry_run:
                if not existing.joined_on and joined_on:
                    existing.joined_on = joined_on
                if existing.dues_cents is None and dues_cents is not None:
                    existing.dues_cents = dues_cents
                if not existing.dues_period and dues_period:
                    existing.dues_period = dues_period
            assigned_no = existing.member_no
        else:
            if m_no and m_no in seen_nos:
                errors.append({"row": line, "message": f"Üye no tekrar ediyor: {m_no}"})
                continue
            created += 1
            if not dry_run:
                assigned_no = m_no or await _next_member_no(db, org_id)
                member = Member(
                    organization_id=org_id,
                    donor_id=donor.id,
                    member_no=assigned_no,
                    member_type=m_type,
                    status=m_status,
                    joined_on=joined_on,
                    dues_cents=dues_cents,
                    dues_period=dues_period,
                    notes=_clean(values.get("notes"), 1000),
                )
                db.add(member)
                existing_by_donor[donor.id] = member
            else:
                assigned_no = m_no or "(otomatik)"
            if m_no:
                seen_nos.add(m_no)

        if len(preview) < 20:
            preview.append({
                "row": line,
                "action": "mevcut" if existing else "yeni",
                "member_no": assigned_no,
                "name": donor.full_name,
                "phone": data["phone"],
                "member_type": m_type,
                "status": m_status,
            })

    if not dry_run:
        db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="uye_aktar", details={
            "file": file.filename, "created": created, "matched": matched, "errors": len(errors)}))
        await db.commit()
    return {"row_count": len(rows), "created": created, "matched": matched, "error_count": len(errors),
            "errors": errors[:1000], "preview": preview, "committed": not dry_run}


# --- Templates & Import History ------------------------------------------------------------

IMPORT_TEMPLATES = {
    "donors": (
        "bagisci-sablonu.xlsx",
        ["Ad Soyad", "Telefon", "E-posta", "TC Kimlik No", "Şehir", "Adres", "Grup", "SMS İzni", "E-posta İzni"],
        ["Ahmet Yılmaz", "05321112233", "ahmet@ornek.com", "", "İstanbul", "Fatih Mah. No:1", "2026 Ramazan", "Evet", "Evet"],
    ),
    "donations": (
        "makbuz-sablonu.xlsx",
        ["Ad Soyad", "Telefon", "Tutar", "Para Birimi", "Bağış Tarihi", "Kampanya", "Ödeme Yöntemi", "Matbu Makbuz No", "Açıklama"],
        ["Ahmet Yılmaz", "05321112233", 1500, "TRY", "2026-03-15", "Genel Bağış", "Nakit", "A-00125", "Elden teslim"],
    ),
    "members": (
        "uye-sablonu.xlsx",
        ["Üye No", "Ad Soyad", "Telefon", "E-posta", "Üyelik Türü", "Durum", "Kayıt Tarihi", "Özel Aidat", "Aidat Dönemi", "Şehir"],
        ["UYE-001", "Ahmet Yılmaz", "05321112233", "ahmet@ornek.com", "asil", "aktif", "2026-01-15", 250, "aylık", "İstanbul"],
    ),
}


@router.get("/import-template/{kind}")
async def download_import_template(kind: str, request: Request):
    if kind not in IMPORT_TEMPLATES:
        raise HTTPException(status_code=404, detail="Şablon bulunamadı")
    import openpyxl
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from app.utils.excel_export import _clean_hex

    org = getattr(request.state, "organization", None)
    brand = _clean_hex(getattr(org, "theme_primary_color", None), "065F46")
    thin = Side(style="thin", color="E5E7EB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill(start_color=brand, end_color=brand, fill_type="solid")
    sample_fill = PatternFill(start_color="F9FAFB", end_color="F9FAFB", fill_type="solid")

    filename, headers, sample_row = IMPORT_TEMPLATES[kind]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Şablon"
    ws.append(headers)
    ws.row_dimensions[1].height = 24
    for cell in ws[1]:
        cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="left", vertical="center")
        cell.border = border
    ws.append(sample_row)
    ws.row_dimensions[2].height = 20
    for cell in ws[2]:
        cell.font = Font(name="Calibri", size=10, color="374151")
        cell.fill = sample_fill
        cell.alignment = Alignment(horizontal="left", vertical="center")
        cell.border = border
    ws.freeze_panes = "A2"
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=12)
        ws.column_dimensions[col[0].column_letter].width = min(max(max_len + 5, 15), 38)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/import-history", dependencies=[Depends(require_capability("donors.import"))])
async def list_import_history(request: Request, db: AsyncSession = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    rows = (await db.execute(
        select(AuditLog, User)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(AuditLog.organization_id == org_id, AuditLog.action.in_(["bagisci_aktar", "makbuz_aktar", "uye_aktar"]))
        .order_by(AuditLog.created_at.desc())
        .limit(25)
    )).all()
    return [
        {
            "id": str(log.id),
            "action": log.action,
            "details": log.details or {},
            "user_name": f"{u.first_name} {u.last_name}".strip() if u else None,
            "created_at": log.created_at,
        }
        for log, u in rows
    ]


# --- Duplicates & merge --------------------------------------------------------------------

def _donor_brief(d: Donor) -> dict:
    return {
        "id": str(d.id), "full_name": d.full_name, "phone": masked(d.phone), "email": d.email, "tc_masked":
            f"{d.tc_no[:3]}******{d.tc_no[-2:]}" if d.tc_no else None,
        "city": d.city, "total_donations": d.total_donations or 0, "total_donated_cents": d.total_donated_cents or 0,
        "last_donation_at": d.last_donation_at, "created_at": d.created_at, "tags": d.tags or [],
    }


@router.get("/donors/duplicates", dependencies=[Depends(require_capability("donors.merge"))])
async def find_duplicates(request: Request, include_names: bool = False, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """Aynı telefon, e-posta veya TC'ye sahip bağışçıları gruplar; include_names ile aynı ad soyad da."""
    org_id = _org_id(request)
    keys = {
        "phone": Donor.phone, "email": func.lower(Donor.email), "tc": Donor.tc_no,
    }
    if include_names:
        keys["name"] = func.lower(func.trim(Donor.first_name + " " + func.coalesce(Donor.last_name, "")))
    parent: dict[UUID, UUID] = {}
    reasons: dict[UUID, set] = {}

    def root(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for reason, expr in keys.items():
        groups = (await db.execute(
            select(expr, func.array_agg(Donor.id)).where(Donor.organization_id == org_id, expr.isnot(None), expr != "")
            .group_by(expr).having(func.count(Donor.id) > 1).limit(2000)
        )).all()
        for _, ids in groups:
            first = root(ids[0])
            for other in ids[1:]:
                parent[root(other)] = first
            for i in ids:
                reasons.setdefault(i, set()).add(reason)
    components: dict[UUID, list[UUID]] = {}
    for member in list(parent):
        components.setdefault(root(member), []).append(member)
    all_ids = [i for ids in components.values() for i in ids]
    donors = {d.id: d for d in (await db.execute(select(Donor).where(Donor.id.in_(all_ids)))).scalars().all()} if all_ids else {}
    labels = {"phone": "Telefon", "email": "E-posta", "tc": "TC", "name": "Ad soyad"}
    result = []
    for ids in components.values():
        members = sorted((donors[i] for i in ids if i in donors),
                         key=lambda d: (-(d.total_donations or 0), d.created_at or datetime.min.replace(tzinfo=timezone.utc)))
        if len(members) < 2:
            continue
        found = set().union(*(reasons.get(d.id, set()) for d in members))
        result.append({"reasons": [labels[r] for r in keys if r in found], "donors": [_donor_brief(d) for d in members]})
    result.sort(key=lambda g: -len(g["donors"]))
    return {"groups": result[:500], "group_count": len(result)}


class MergeIn(BaseModel):
    target_id: UUID
    source_ids: List[UUID] = Field(min_length=1, max_length=20)


def _donor_fk_columns():
    """Bağışçıya bağlı tüm tablo/sütunlar; yeni modüller otomatik kapsanır."""
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if any(fk.column.table.name == "donors" for fk in column.foreign_keys):
                yield table, column


@router.post("/donors/merge", dependencies=[Depends(require_capability("donors.merge"))])
async def merge_donors(request: Request, payload: MergeIn, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Kaynak kartları hedef karta birleştirir: bağış, not, sponsorluk vb. tüm kayıtlar taşınır, kaynaklar silinir."""
    org_id = _org_id(request)
    source_ids = list(dict.fromkeys(payload.source_ids))
    if payload.target_id in source_ids:
        raise HTTPException(status_code=422, detail="Hedef kart kaynaklar arasında olamaz")
    donors = (await db.execute(select(Donor).where(
        Donor.organization_id == org_id, Donor.id.in_([payload.target_id, *source_ids])).with_for_update())).scalars().all()
    by_id = {d.id: d for d in donors}
    if len(by_id) != len(source_ids) + 1:
        raise HTTPException(status_code=404, detail="Bağışçılardan bazıları bulunamadı")
    target = by_id[payload.target_id]
    sources = [by_id[i] for i in source_ids]
    # Geri dönüş için kaynak kartların özeti denetim kaydında kalır.
    snapshot = json.loads(json.dumps([_donor_brief(s) | {"address": s.address, "notes": s.notes} for s in sources], default=str))

    for source in sources:
        for key in ("last_name", "company_name", "email", "phone", "address", "city", "country", "tc_no", "tax_number",
                    "assigned_user_id"):
            if not getattr(target, key) and getattr(source, key):
                setattr(target, key, getattr(source, key))
        target.tags = sorted(set(target.tags or []) | set(source.tags or []))
        if source.notes:
            target.notes = f"{target.notes}\n---\n{source.notes}" if target.notes else source.notes
        target.allow_sms = bool(target.allow_sms or source.allow_sms)
        target.allow_email = bool(target.allow_email or source.allow_email)
        target.sms_opt_out = bool(target.sms_opt_out or source.sms_opt_out)
        target.email_opt_out = bool(target.email_opt_out or source.email_opt_out)

    moved = {}
    for table, column in _donor_fk_columns():
        result = await db.execute(update(table).where(column.in_(source_ids)).values({column.name: target.id}))
        if result.rowcount:
            moved[table.name] = moved.get(table.name, 0) + result.rowcount
    await db.execute(delete(Donor).where(Donor.id.in_(source_ids), Donor.organization_id == org_id))

    stats = (await db.execute(select(
        func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0),
        func.min(func.coalesce(Donation.paid_at, Donation.created_at)), func.max(func.coalesce(Donation.paid_at, Donation.created_at)),
    ).where(Donation.donor_id == target.id, Donation.status == DonationStatus.CONFIRMED))).one()
    target.total_donations, target.total_donated_cents = int(stats[0]), int(stats[1])
    target.first_donation_at, target.last_donation_at = stats[2], stats[3]

    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="bagisci_birlestir",
                    details={"donor_id": str(target.id), "target_id": str(target.id), "sources": snapshot, "moved": moved}))
    await db.commit()
    return {"donor": _donor_brief(target), "merged": len(sources), "moved": moved}
