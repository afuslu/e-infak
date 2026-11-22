"""Bağışçı CRM ve makbuz işlemleri.

- Bağışçı arama, tek ekranda bağışçı kartı (bağışlar, notlar, özet)
- Bağışçıya personel / temsilci atama
- Bağışçıya tekli SMS (yalnız SMS izni olan bağışçılara; İYS gereği)
- Elle makbuz kesme (nakit / havale) ve elle kesilen makbuzu iptal
- Gelişmiş bağış filtreleme
"""
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, List, Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import ensure_capability, get_current_user, has_capability, mask_phone, require_admin_route_feature, require_admin_route_permission, ensure_receipt_visible, masked
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, DonorType, PaymentMethod
from app.models.donor_note import DonorNote
from app.models.user import User
from app.utils.content import sanitize_public_text
from app.services.donation_hooks import DonationEffectsLocked, on_donation_cancelled
from app.services.offline_donation import record_offline_donation
from app.services.fx import remove_from_campaign, remove_from_donor
from app.services.receipt_books import take_number

router = APIRouter(
    prefix="/admin-features",
    tags=["crm"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
HOME_COUNTRIES = {"türkiye", "turkiye", "turkey", "tr"}
# Donor fields from the STK PRO donor form, settable on create, update and bulk update.
PROFILE_FIELDS = ("membership_type", "blood_group", "gender", "occupation", "rating", "referral_source", "birth_date",
                  "district", "neighbourhood", "phone_code", "phone2", "phone2_code", "staff_user_id")
MANUAL_PROVIDER = "manual"
# Staff-entered sources that may be cancelled (online payments go through refunds)
OFFLINE_PROVIDERS = {MANUAL_PROVIDER, "money_box", "import"}
METHOD_LABELS = {
    PaymentMethod.CREDIT_CARD: "Kredi Kartı",
    PaymentMethod.BANK_TRANSFER: "Havale / EFT",
    PaymentMethod.CASH: "Nakit",
}


def _org_id(request: Request) -> UUID:
    org_id = getattr(request.state, "organization_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="Kurum bilgisi bulunamadı")
    return UUID(org_id)


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


MASKED_PHONE = "__masked__"


def _normalize_phone(value: Optional[str], allow_masked: bool = False) -> Optional[str]:
    if value is None or not str(value).strip():
        return None
    if "*" in str(value):
        # The staff member saw the number masked ("0532 *** ** 12") and sent it back unchanged.
        if allow_masked:
            return MASKED_PHONE
        raise ValueError("Telefon numarasını tam yazın")
    digits = re.sub(r"\D", "", str(value))
    if len(digits) < 10 or len(digits) > 15:
        raise ValueError("Telefon numarası 10-15 rakam olmalıdır")
    return digits


def _ensure_can_see(user: User, donor: Donor) -> None:
    """Staff without donors.view_all reach only the donors they represent (others look like they don't exist)."""
    if donor.assigned_user_id != user.id and not has_capability(user, "donors.view_all"):
        raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")


async def _get_donor(db: AsyncSession, org_id: UUID, donor_id: UUID) -> Donor:
    donor = (await db.execute(
        select(Donor).where(Donor.id == donor_id, Donor.organization_id == org_id)
    )).scalar_one_or_none()
    if not donor:
        raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    return donor


async def _ensure_staff(db: AsyncSession, org_id: UUID, user_id: UUID) -> User:
    user = (await db.execute(
        select(User).where(User.id == user_id, User.organization_id == org_id, User.is_active.is_(True))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Personel bulunamadı veya pasif")
    return user


def _local_date_bounds(start: Optional[date], end: Optional[date]):
    """Convert local (Istanbul) calendar dates into UTC instants."""
    lower = datetime.combine(start, time.min, TZ) if start else None
    upper = datetime.combine(end + timedelta(days=1), time.min, TZ) if end else None
    return lower, upper


def _donor_summary(donor: Donor, staff_names: dict, viewer: Optional[User] = None) -> dict:
    return {
        "id": str(donor.id),
        "donor_type": donor.donor_type.value if hasattr(donor.donor_type, "value") else donor.donor_type,
        "first_name": donor.first_name,
        "last_name": donor.last_name,
        "company_name": donor.company_name,
        "full_name": donor.full_name,
        "email": donor.email,
        "phone": mask_phone(donor.phone, viewer) if viewer else donor.phone,
        "city": donor.city,
        "country": donor.country,
        "total_donations": donor.total_donations or 0,
        "total_donated_cents": donor.total_donated_cents or 0,
        "last_donation_at": donor.last_donation_at,
        "assigned_user_id": str(donor.assigned_user_id) if donor.assigned_user_id else None,
        "assigned_user_name": staff_names.get(donor.assigned_user_id),
        "allow_sms": bool(donor.allow_sms),
        "allow_email": bool(donor.allow_email),
        "tags": donor.tags or [],
        "created_at": donor.created_at,
        "external_ref": donor.external_ref,
        "membership_type": donor.membership_type,
        "referral_source": donor.referral_source,
        "rating": donor.rating,
        "district": donor.district,
        "staff_user_id": str(donor.staff_user_id) if donor.staff_user_id else None,
        "staff_user_name": staff_names.get(donor.staff_user_id),
        "has_tc": bool(donor.tc_no),
    }


async def _staff_names(db: AsyncSession, org_id: UUID) -> dict:
    rows = (await db.execute(
        select(User.id, User.first_name, User.last_name).where(User.organization_id == org_id)
    )).all()
    return {r[0]: f"{r[1]} {r[2]}".strip() for r in rows}


# --- Donors -----------------------------------------------------------------

class DonorFilter(BaseModel):
    """Donor list filters: the search box, the advanced panel and STK PRO style per-column filters."""
    q: Optional[str] = Field(default=None, max_length=100)
    assigned: Optional[str] = None  # 'me', 'none' or a staff id
    staff: Optional[str] = None  # 'none' or a staff id ("Personel")
    region: Optional[Literal["yurtici", "yurtdisi"]] = None
    donor_type: Optional[Literal["individual", "corporate"]] = None
    has_donation: Optional[bool] = None
    allow_sms: Optional[bool] = None
    allow_email: Optional[bool] = None
    min_total_cents: Optional[int] = Field(default=None, ge=0)
    max_total_cents: Optional[int] = Field(default=None, ge=0)
    last_donation_start: Optional[date] = None
    last_donation_end: Optional[date] = None
    created_start: Optional[date] = None
    created_end: Optional[date] = None
    tag: Optional[str] = Field(default=None, max_length=40)
    no: Optional[str] = Field(default=None, max_length=64)
    name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=100)
    tc: Optional[str] = Field(default=None, max_length=11)
    city: Optional[str] = Field(default=None, max_length=100)
    membership_type: Optional[str] = Field(default=None, max_length=60)
    referral_source: Optional[str] = Field(default=None, max_length=100)


def donor_filter_query(
    q: Annotated[Optional[str], Query(max_length=100)] = None,
    assigned: Annotated[Optional[str], Query(description="'me', 'none' veya personel id")] = None,
    staff: Annotated[Optional[str], Query(description="'none' veya personel id")] = None,
    region: Optional[Literal["yurtici", "yurtdisi"]] = None,
    donor_type: Optional[Literal["individual", "corporate"]] = None,
    has_donation: Optional[bool] = None,
    allow_sms: Optional[bool] = None,
    allow_email: Optional[bool] = None,
    min_total_cents: Annotated[Optional[int], Query(ge=0)] = None,
    max_total_cents: Annotated[Optional[int], Query(ge=0)] = None,
    last_donation_start: Optional[date] = None,
    last_donation_end: Optional[date] = None,
    created_start: Optional[date] = None,
    created_end: Optional[date] = None,
    tag: Annotated[Optional[str], Query(max_length=40)] = None,
    no: Annotated[Optional[str], Query(max_length=64)] = None,
    name: Annotated[Optional[str], Query(max_length=100)] = None,
    phone: Annotated[Optional[str], Query(max_length=30)] = None,
    email: Annotated[Optional[str], Query(max_length=100)] = None,
    tc: Annotated[Optional[str], Query(max_length=11)] = None,
    city: Annotated[Optional[str], Query(max_length=100)] = None,
    membership_type: Annotated[Optional[str], Query(max_length=60)] = None,
    referral_source: Annotated[Optional[str], Query(max_length=100)] = None,
) -> DonorFilter:
    return DonorFilter(**{k: v for k, v in locals().items()})


def _staff_condition(column, value: str, current_user: User):
    if value == "me":
        return column == current_user.id
    if value == "none":
        return column.is_(None)
    try:
        return column == UUID(value)
    except ValueError:
        raise HTTPException(status_code=422, detail="Geçersiz personel filtresi")


def _donor_conditions(org_id: UUID, current_user: User, f: DonorFilter) -> list:
    conditions = [Donor.organization_id == org_id]
    if f.q:
        like = f"%{f.q.strip()}%"
        digits = re.sub(r"\D", "", f.q)
        search = [
            Donor.first_name.ilike(like), Donor.last_name.ilike(like), Donor.company_name.ilike(like),
            Donor.email.ilike(like), Donor.city.ilike(like), Donor.external_ref.ilike(like),
            (Donor.first_name + " " + func.coalesce(Donor.last_name, "")).ilike(like),
        ]
        if len(digits) >= 4:
            search.append(Donor.phone.ilike(f"%{digits}%"))
        conditions.append(or_(*search))
    if f.name and f.name.strip():
        like = f"%{f.name.strip()}%"
        conditions.append(or_(
            (Donor.first_name + " " + func.coalesce(Donor.last_name, "")).ilike(like), Donor.company_name.ilike(like),
        ))
    if f.no and f.no.strip():
        conditions.append(Donor.external_ref.ilike(f"{f.no.strip()}%"))
    if f.phone:
        digits = re.sub(r"\D", "", f.phone)
        if digits:
            conditions.append(or_(Donor.phone.ilike(f"%{digits}%"), Donor.phone2.ilike(f"%{digits}%")))
    if f.email and f.email.strip():
        conditions.append(Donor.email.ilike(f"%{f.email.strip()}%"))
    if f.tc and f.tc.strip():
        conditions.append(Donor.tc_no.ilike(f"{f.tc.strip()}%"))
    if f.city and f.city.strip():
        conditions.append(Donor.city.ilike(f"%{f.city.strip()}%"))
    if f.membership_type:
        conditions.append(Donor.membership_type.is_(None) if f.membership_type == "none" else Donor.membership_type == f.membership_type)
    if f.referral_source:
        conditions.append(Donor.referral_source.is_(None) if f.referral_source == "none" else Donor.referral_source == f.referral_source)
    if f.tag and f.tag.strip():
        conditions.append(Donor.tags.contains([f.tag.strip()]))
    if not has_capability(current_user, "donors.view_all"):
        conditions.append(Donor.assigned_user_id == current_user.id)  # only donors this staff member represents
    if f.assigned:
        conditions.append(_staff_condition(Donor.assigned_user_id, f.assigned, current_user))
    if f.staff:
        conditions.append(_staff_condition(Donor.staff_user_id, f.staff, current_user))
    country = func.lower(func.coalesce(Donor.country, "türkiye"))
    if f.region == "yurtici":
        conditions.append(country.in_(HOME_COUNTRIES))
    elif f.region == "yurtdisi":
        conditions.append(country.notin_(HOME_COUNTRIES))
    if f.donor_type:
        conditions.append(Donor.donor_type == DonorType(f.donor_type))
    if f.has_donation is True:
        conditions.append(Donor.total_donations > 0)
    elif f.has_donation is False:
        conditions.append(func.coalesce(Donor.total_donations, 0) == 0)
    if f.allow_sms is not None:
        conditions.append(Donor.allow_sms.is_(f.allow_sms))
    if f.allow_email is not None:
        conditions.append(Donor.allow_email.is_(f.allow_email))
    if f.min_total_cents is not None:
        conditions.append(func.coalesce(Donor.total_donated_cents, 0) >= f.min_total_cents)
    if f.max_total_cents is not None:
        conditions.append(func.coalesce(Donor.total_donated_cents, 0) <= f.max_total_cents)
    d_lower, d_upper = _local_date_bounds(f.last_donation_start, f.last_donation_end)
    if d_lower:
        conditions.append(Donor.last_donation_at >= d_lower)
    if d_upper:
        conditions.append(Donor.last_donation_at < d_upper)
    c_lower, c_upper = _local_date_bounds(f.created_start, f.created_end)
    if c_lower:
        conditions.append(Donor.created_at >= c_lower)
    if c_upper:
        conditions.append(Donor.created_at < c_upper)
    return conditions


@router.get("/donors")
async def list_donors(
    request: Request,
    filters: DonorFilter = Depends(donor_filter_query),
    sort: Literal["name", "recent", "total", "created", "no"] = "recent",
    direction: Literal["asc", "desc"] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    conditions = _donor_conditions(org_id, current_user, filters)
    total = (await db.execute(select(func.count(Donor.id)).where(*conditions))).scalar_one()
    desc = direction == "desc"
    order = {
        "name": (Donor.first_name.desc(), Donor.last_name.desc()) if desc else (Donor.first_name.asc(), Donor.last_name.asc()),
        "recent": (Donor.last_donation_at.desc().nullslast(), Donor.created_at.desc()) if desc
        else (Donor.last_donation_at.asc().nullslast(), Donor.created_at.asc()),
        "total": (Donor.total_donated_cents.desc().nullslast(),) if desc else (Donor.total_donated_cents.asc().nullsfirst(),),
        "created": (Donor.created_at.desc(),) if desc else (Donor.created_at.asc(),),
        # STK PRO numbers are digits: order by length first so 9 < 10.
        "no": (func.length(Donor.external_ref).desc().nullslast(), Donor.external_ref.desc(), Donor.created_at.desc()) if desc
        else (func.length(Donor.external_ref).asc().nullslast(), Donor.external_ref.asc(), Donor.created_at.asc()),
    }[sort]
    rows = (await db.execute(
        select(Donor).where(*conditions).order_by(*order).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    names = await _staff_names(db, org_id)
    return {"total": total, "page": page, "page_size": page_size, "items": [_donor_summary(d, names, current_user) for d in rows]}


class DonorIn(BaseModel):
    donor_type: Literal["individual", "corporate"] = "individual"
    first_name: str = Field(min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    company_name: Optional[str] = Field(default=None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = Field(default=None, max_length=1000)
    city: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default="Türkiye", max_length=100)
    tc_no: Optional[str] = Field(default=None, pattern=r"^\d{11}$")
    tax_number: Optional[str] = Field(default=None, max_length=20)
    tags: List[str] = Field(default_factory=list, max_length=20)
    allow_sms: bool = False
    allow_email: bool = False
    assigned_user_id: Optional[UUID] = None
    # STK PRO donor form
    membership_type: Optional[str] = Field(default=None, max_length=60)
    blood_group: Optional[Literal["0+", "0-", "A+", "A-", "B+", "B-", "AB+", "AB-"]] = None
    gender: Optional[Literal["erkek", "kadin"]] = None
    occupation: Optional[str] = Field(default=None, max_length=100)
    rating: Optional[str] = Field(default=None, max_length=60)
    referral_source: Optional[str] = Field(default=None, max_length=100)
    birth_date: Optional[date] = None
    district: Optional[str] = Field(default=None, max_length=100)
    neighbourhood: Optional[str] = Field(default=None, max_length=150)
    phone_code: Optional[str] = Field(default=None, pattern=r"^\d{1,4}$")
    phone2: Optional[str] = None
    phone2_code: Optional[str] = Field(default=None, pattern=r"^\d{1,4}$")
    staff_user_id: Optional[UUID] = None

    @field_validator("phone", mode="before")
    @classmethod
    def check_phone(cls, value):
        return _normalize_phone(value, allow_masked=True)

    @field_validator("phone2", mode="before")
    @classmethod
    def check_phone2(cls, value):
        return _normalize_phone(value, allow_masked=True)

    @field_validator("membership_type", "occupation", "rating", "referral_source", "district", "neighbourhood",
                     "blood_group", "gender", "phone_code", "phone2_code", "birth_date", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str):
            value = sanitize_public_text(value.strip()) if value.strip() else None
        return value or None

    @field_validator("first_name", "last_name", "company_name", "address", "city", "country", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) if value else value

    @field_validator("tc_no", "tax_number", mode="before")
    @classmethod
    def empty_ids(cls, value):
        return value or None

    @model_validator(mode="after")
    def corporate_name(self):
        if self.donor_type == "corporate" and not self.company_name:
            raise ValueError("Kurumsal bağışçı için kurum adı zorunludur")
        return self


class DonorUpdate(DonorIn):
    assigned_user_id: Optional[UUID] = None
    clear_assignment: bool = False


async def _ensure_no_duplicate(db: AsyncSession, org_id: UUID, email: Optional[str], phone: Optional[str],
                               exclude_id: Optional[UUID] = None) -> None:
    checks = []
    if email:
        checks.append(func.lower(Donor.email) == email.lower())
    if phone:
        checks.append(Donor.phone == phone)
    if not checks:
        return
    query = select(Donor.id, Donor.first_name, Donor.last_name).where(Donor.organization_id == org_id, or_(*checks))
    if exclude_id:
        query = query.where(Donor.id != exclude_id)
    existing = (await db.execute(query)).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "duplicate_donor", "donor_id": str(existing[0]),
                    "message": f"Bu e-posta veya telefon {existing[1]} {existing[2] or ''} kaydında kullanılıyor"},
        )


@router.post("/donors", status_code=status.HTTP_201_CREATED)
async def create_donor(request: Request, payload: DonorIn, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    ensure_capability(current_user, "donors.create", "Bağışçı ekleme yetkiniz yok")
    if MASKED_PHONE in (payload.phone, payload.phone2):
        raise HTTPException(status_code=422, detail="Telefon numarasını tam yazın")
    await _ensure_no_duplicate(db, org_id, payload.email, payload.phone)
    if payload.assigned_user_id:
        await _ensure_staff(db, org_id, payload.assigned_user_id)
    if payload.staff_user_id:
        await _ensure_staff(db, org_id, payload.staff_user_id)
    data = payload.model_dump()
    data["staff_user_id"] = payload.staff_user_id or current_user.id  # "Personel": who registered the donor
    data["donor_type"] = DonorType(data["donor_type"])
    data["email"] = str(payload.email) if payload.email else None
    donor = Donor(organization_id=org_id, total_donations=0, total_donated_cents=0, **data)
    db.add(donor)
    await db.flush()
    if not has_capability(current_user, "donors.view_all") and not donor.assigned_user_id:
        donor.assigned_user_id = current_user.id  # otherwise its creator could not open the new card
    _audit(db, org_id, current_user, "bagisci_olustur", {"donor_id": str(donor.id)})
    from app.services.webhooks import queue_webhook

    await queue_webhook(db, org_id, "donor.created", "donor", donor.id, {"donor_id": str(donor.id)})
    await db.commit()
    return _donor_summary(donor, {}, current_user)


@router.get("/donors/{donor_id}")
async def get_donor_card(request: Request, donor_id: UUID, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """Bağışçı kartı: kimlik, iletişim, temsilci, tüm bağışlar, notlar ve yıllık özet."""
    org_id = _org_id(request)
    donor = await _get_donor(db, org_id, donor_id)
    _ensure_can_see(current_user, donor)
    names = await _staff_names(db, org_id)
    donations = (await db.execute(
        select(Donation).options(selectinload(Donation.campaign))
        .where(Donation.organization_id == org_id, Donation.donor_id == donor.id)
        .order_by(func.coalesce(Donation.paid_at, Donation.created_at).desc())
        .limit(1000)
    )).scalars().all()
    notes = (await db.execute(
        select(DonorNote).options(selectinload(DonorNote.author))
        .where(DonorNote.donor_id == donor.id).order_by(DonorNote.created_at.desc()).limit(200)
    )).scalars().all() if has_capability(current_user, "donors.notes_view") else []

    by_year: dict[int, dict] = {}
    for d in donations:
        if d.status != DonationStatus.CONFIRMED:
            continue
        year = (d.paid_at or d.created_at).astimezone(TZ).year
        bucket = by_year.setdefault(year, {"year": year, "count": 0, "totals": {}})
        bucket["count"] += 1
        bucket["totals"][d.currency or "TRY"] = bucket["totals"].get(d.currency or "TRY", 0) + d.amount_cents

    card = _donor_summary(donor, names, current_user)
    card.update({
        "address": donor.address,
        "tc_no_masked": f"{donor.tc_no[:3]}*****{donor.tc_no[-2:]}" if donor.tc_no else None,
        "tax_number": donor.tax_number,
        "occupation": donor.occupation,
        "blood_group": donor.blood_group,
        "gender": donor.gender,
        "birth_date": donor.birth_date,
        "neighbourhood": donor.neighbourhood,
        "phone_code": donor.phone_code,
        "phone2": mask_phone(donor.phone2, current_user) if donor.phone2 else None,
        "phone2_code": donor.phone2_code,
        "donations": [_donation_row(d, names) for d in donations],
        "notes": [
            {"id": str(n.id), "content": n.content, "created_at": n.created_at,
             "author": f"{n.author.first_name} {n.author.last_name}" if n.author else None}
            for n in notes
        ],
        "yearly": sorted(by_year.values(), key=lambda b: b["year"], reverse=True),
    })
    card.update(await _donor_card_extras(db, org_id, donor, names))
    return card


ACTION_LABELS = {
    "bagisci_olustur": "Bağışçı oluşturuldu",
    "bagisci_guncelle": "Bağışçı güncellendi",
    "bagisci_toplu_guncelle": "Toplu güncelleme",
    "bagisci_not_ekle": "Görüşme notu eklendi",
    "bagisci_birlestir": "Mükerrer kayıt birleştirildi",
    "bagisci_sms": "SMS gönderildi",
}
FIELD_LABELS = {
    "first_name": "Ad", "last_name": "Soyad", "company_name": "Kurum adı", "phone": "Cep telefonu", "phone2": "Telefon",
    "email": "E-posta", "address": "Adres", "city": "İl", "district": "İlçe", "neighbourhood": "Mahalle",
    "country": "Ülke", "tax_number": "Vergi no", "tc_no": "T.C. kimlik", "tags": "Etiketler", "allow_sms": "SMS izni",
    "allow_email": "E-posta izni", "donor_type": "Üyelik türü", "assigned_user_id": "Temsilci",
    "staff_user_id": "Personel", "membership_type": "Üyelik tipi", "referral_source": "Referans", "rating": "Değerlendirme",
    "occupation": "Meslek", "gender": "Cinsiyet", "blood_group": "Kan grubu", "birth_date": "Doğum tarihi",
    "phone_code": "Cep kodu", "phone2_code": "Telefon kodu",
}


async def _donor_card_extras(db: AsyncSession, org_id: UUID, donor: Donor, names: dict) -> dict:
    """STK PRO card tabs: Kurban, Sponsorluk and Su Kuyusu donations, plus the record's change history."""
    from app.models.kurban import KurbanShare
    from app.models.sponsorship import Pledge, WellShare
    from app.models.water_well import WaterWell

    shares = (await db.execute(
        select(KurbanShare).options(selectinload(KurbanShare.animal), selectinload(KurbanShare.campaign),
                                    selectinload(KurbanShare.donation))
        .where(KurbanShare.organization_id == org_id, KurbanShare.donor_id == donor.id)
        .order_by(KurbanShare.created_at.desc()).limit(500)
    )).scalars().all()
    pledges = (await db.execute(
        select(Pledge).options(selectinload(Pledge.installments), selectinload(Pledge.beneficiary))
        .where(Pledge.organization_id == org_id, Pledge.donor_id == donor.id).order_by(Pledge.created_at.desc())
    )).scalars().all()
    well_shares = (await db.execute(
        select(WellShare, WaterWell.name).join(WaterWell, WaterWell.id == WellShare.water_well_id)
        .where(WellShare.organization_id == org_id, WellShare.donor_id == donor.id).order_by(WellShare.created_at.desc())
    )).all()
    own_wells = (await db.execute(
        select(WaterWell).where(WaterWell.organization_id == org_id, WaterWell.donor_id == donor.id)
    )).scalars().all()
    logs = (await db.execute(
        select(AuditLog).where(AuditLog.organization_id == org_id, AuditLog.details["donor_id"].as_string() == str(donor.id))
        .order_by(AuditLog.created_at.desc()).limit(100)
    )).scalars().all()

    def pledge_row(p):
        paid = [i for i in p.installments if i.status == "paid"]
        return {
            "id": str(p.id), "kind": p.kind, "title": p.title or (f"{p.beneficiary.first_name} {p.beneficiary.last_name or ''}".strip() if p.beneficiary else None),
            "installment_amount_cents": p.installment_amount_cents, "currency": p.currency,
            "installment_count": p.installment_count, "paid_count": len(paid), "status": p.status,
            "start_date": p.start_date,
        }

    def history_row(log):
        changed = (log.details or {}).get("changed") or {}
        return {
            "id": str(log.id), "action": ACTION_LABELS.get(log.action, log.action),
            "fields": [FIELD_LABELS.get(k, k) for k in changed] if isinstance(changed, dict) else [],
            "user": names.get(log.user_id), "created_at": log.created_at,
        }

    return {
        "kurban_shares": [{
            "id": str(sh.id), "campaign": sh.campaign.title if sh.campaign else None,
            "animal_number": sh.animal.animal_number if sh.animal else None, "share_number": sh.share_number,
            "kurban_type": sh.kurban_type, "status": sh.status.value if hasattr(sh.status, "value") else sh.status,
            "on_behalf_of": sh.on_behalf_of, "receipt_number": sh.donation.receipt_number if sh.donation else None,
            "created_at": sh.created_at,
        } for sh in shares],
        "sponsorships": [pledge_row(p) for p in pledges if p.kind != "water_well"],
        "water_wells": [pledge_row(p) for p in pledges if p.kind == "water_well"] + [{
            "id": str(ws.id), "kind": "well_share", "title": name, "share_count": ws.share_count,
            "on_behalf_of": ws.on_behalf_of, "created_at": ws.created_at,
        } for ws, name in well_shares] + [{
            "id": str(w.id), "kind": "well", "title": w.name, "created_at": w.created_at,
        } for w in own_wells],
        "history": [history_row(log) for log in logs],
    }


@router.get("/representatives")
async def representatives(request: Request, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """STK PRO "Temsilciler": staff who represent donors, with how many donors and how much they gave."""
    org_id = _org_id(request)
    stats = {r[0]: (r[1], int(r[2] or 0)) for r in (await db.execute(
        select(Donor.assigned_user_id, func.count(Donor.id), func.sum(Donor.total_donated_cents))
        .where(Donor.organization_id == org_id, Donor.assigned_user_id.isnot(None)).group_by(Donor.assigned_user_id)
    )).all()}
    users = (await db.execute(select(User).where(User.organization_id == org_id).order_by(User.first_name))).scalars().all()
    return [{
        "id": str(u.id), "name": f"{u.first_name} {u.last_name}".strip(), "email": u.email, "is_active": bool(u.is_active),
        "donor_count": stats.get(u.id, (0, 0))[0], "total_donated_cents": stats.get(u.id, (0, 0))[1],
    } for u in users if u.is_active or u.id in stats]


@router.get("/donors-options")
async def donor_options(request: Request, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Values already in use for the free-choice donor fields, for the form suggestions and column filters."""
    org_id = _org_id(request)
    out = {}
    for key, column in (("membership_type", Donor.membership_type), ("referral_source", Donor.referral_source),
                        ("rating", Donor.rating), ("occupation", Donor.occupation)):
        rows = (await db.execute(
            select(column, func.count()).where(Donor.organization_id == org_id, column.isnot(None))
            .group_by(column).order_by(func.count().desc()).limit(60)
        )).all()
        out[key] = [r[0] for r in rows]
    return out


@router.put("/donors/{donor_id}")
async def update_donor(request: Request, donor_id: UUID, payload: DonorUpdate, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    donor = await _get_donor(db, org_id, donor_id)
    ensure_capability(current_user, "donors.update", "Bağışçı güncelleme yetkiniz yok")
    if donor.assigned_user_id != current_user.id:
        ensure_capability(current_user, "donors.update_all", "Yalnız temsilcisi olduğunuz bağışçıları güncelleyebilirsiniz")
    phone_given = "phone" in payload.model_fields_set and payload.phone != MASKED_PHONE
    await _ensure_no_duplicate(db, org_id, payload.email, payload.phone if phone_given else None, exclude_id=donor.id)
    changes = {}
    if "staff_user_id" in payload.model_fields_set and payload.staff_user_id and payload.staff_user_id != donor.staff_user_id:
        await _ensure_staff(db, org_id, payload.staff_user_id)
    for key in ("first_name", "last_name", "company_name", "phone", "address", "city", "country", "tax_number", "tags",
                "allow_sms", "allow_email", *PROFILE_FIELDS):
        if key not in payload.model_fields_set or (key == "phone" and not phone_given):
            continue  # not sent (or sent back masked): keep the stored value
        if key == "phone2" and payload.phone2 == MASKED_PHONE:
            continue
        value = getattr(payload, key)
        if getattr(donor, key) != value:
            changes[key] = True
            setattr(donor, key, value)
    email = str(payload.email) if payload.email else None
    if "email" in payload.model_fields_set and donor.email != email:
        changes["email"] = True
        donor.email = email
    if payload.tc_no and payload.tc_no != donor.tc_no:
        changes["tc_no"] = True
        donor.tc_no = payload.tc_no
    donor_type = DonorType(payload.donor_type)
    if donor.donor_type != donor_type:
        changes["donor_type"] = True
        donor.donor_type = donor_type
    if payload.clear_assignment:
        if donor.assigned_user_id:
            changes["assigned_user_id"] = {"old": str(donor.assigned_user_id), "new": None}
        donor.assigned_user_id = None
    elif payload.assigned_user_id and payload.assigned_user_id != donor.assigned_user_id:
        await _ensure_staff(db, org_id, payload.assigned_user_id)
        changes["assigned_user_id"] = {
            "old": str(donor.assigned_user_id) if donor.assigned_user_id else None,
            "new": str(payload.assigned_user_id),
        }
        donor.assigned_user_id = payload.assigned_user_id
    _audit(db, org_id, current_user, "bagisci_guncelle", {"donor_id": str(donor.id), "changed": changes})
    await db.commit()
    return _donor_summary(donor, await _staff_names(db, org_id), current_user)


@router.delete("/donors/{donor_id}")
async def delete_donor(request: Request, donor_id: UUID, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Bağışı ve üyeliği bulunmayan hatalı/test bağışçı kaydını KVKK kapsamında siler."""
    from app.models.membership import Member

    org_id = _org_id(request)
    donor = await _get_donor(db, org_id, donor_id)
    ensure_capability(current_user, "donors.delete", "Bağışçı silme yetkiniz yok")
    if donor.assigned_user_id != current_user.id:
        ensure_capability(current_user, "donors.update_all", "Yalnız temsilcisi olduğunuz bağışçıları silebilirsiniz")
    if (await db.execute(select(Donation.id).where(Donation.donor_id == donor.id).limit(1))).first():
        raise HTTPException(status_code=409, detail="Bağış kaydı bulunan bağışçı silinemez")
    if (await db.execute(select(Member.id).where(Member.donor_id == donor.id).limit(1))).first():
        raise HTTPException(status_code=409, detail="Üyelik kaydı bulunan bağışçı silinemez")
    _audit(db, org_id, current_user, "bagisci_sil", {"donor_id": str(donor.id), "full_name": donor.full_name})
    await db.delete(donor)
    await db.commit()
    return {"deleted": True}


class DonorBulkUpdate(BaseModel):
    """Fields "Toplu Güncelle" may set; unset fields are left alone."""
    membership_type: Optional[str] = Field(default=None, max_length=60)
    referral_source: Optional[str] = Field(default=None, max_length=100)
    rating: Optional[str] = Field(default=None, max_length=60)
    city: Optional[str] = Field(default=None, max_length=100)
    assigned_user_id: Optional[UUID] = None
    staff_user_id: Optional[UUID] = None
    allow_sms: Optional[bool] = None
    allow_email: Optional[bool] = None
    add_tag: Optional[str] = Field(default=None, max_length=40)
    remove_tag: Optional[str] = Field(default=None, max_length=40)


class DonorBulkIn(BaseModel):
    """STK PRO "Toplu İşlemler": either picked rows (ids) or every row matching the filters (select_all)."""
    action: Literal["update", "delete", "export", "phones"]
    ids: List[UUID] = Field(default_factory=list, max_length=5000)
    select_all: bool = False
    filters: DonorFilter = Field(default_factory=DonorFilter)
    update: Optional[DonorBulkUpdate] = None
    columns: List[str] = Field(default_factory=list, max_length=40)


EXPORT_COLUMNS = {
    "no": ("No", lambda d, n, u: d.external_ref or ""),
    "donor_type": ("Üyelik Türü", lambda d, n, u: "Kurumsal" if d.donor_type == DonorType.CORPORATE else "Bireysel"),
    "full_name": ("Ad Soyad", lambda d, n, u: d.full_name or ""),
    "company_name": ("Kurum Adı", lambda d, n, u: d.company_name or ""),
    "phone_code": ("Kod", lambda d, n, u: d.phone_code or "90"),
    "phone": ("Cep Telefon", lambda d, n, u: mask_phone(d.phone, u) or ""),
    "phone2": ("Diğer Telefon", lambda d, n, u: mask_phone(d.phone2, u) or ""),
    "email": ("E-posta", lambda d, n, u: d.email or ""),
    "tc_no": ("T.C. Kimlik", lambda d, n, u: (d.tc_no or "") if has_capability(u, "donors.phone") else ("*" * 11 if d.tc_no else "")),
    "created_at": ("Üyelik Tarihi", lambda d, n, u: d.created_at.astimezone(TZ).strftime("%d.%m.%Y %H:%M") if d.created_at else ""),
    "total": ("Toplam Bağış", lambda d, n, u: round((d.total_donated_cents or 0) / 100, 2)),
    "total_donations": ("Bağış Sayısı", lambda d, n, u: d.total_donations or 0),
    "last_donation_at": ("Son Bağış", lambda d, n, u: d.last_donation_at.astimezone(TZ).strftime("%d.%m.%Y") if d.last_donation_at else ""),
    "membership_type": ("Üyelik Tipi", lambda d, n, u: d.membership_type or ""),
    "referral_source": ("Referans", lambda d, n, u: d.referral_source or ""),
    "assigned": ("Temsilci", lambda d, n, u: n.get(d.assigned_user_id, "")),
    "staff": ("Personel", lambda d, n, u: n.get(d.staff_user_id, "")),
    "rating": ("Değerlendirme", lambda d, n, u: d.rating or ""),
    "occupation": ("Meslek", lambda d, n, u: d.occupation or ""),
    "gender": ("Cinsiyet", lambda d, n, u: {"erkek": "Erkek", "kadin": "Kadın"}.get(d.gender or "", "")),
    "blood_group": ("Kan Grubu", lambda d, n, u: d.blood_group or ""),
    "birth_date": ("Doğum Tarihi", lambda d, n, u: d.birth_date.strftime("%d.%m.%Y") if d.birth_date else ""),
    "country": ("Ülke", lambda d, n, u: d.country or ""),
    "city": ("İl", lambda d, n, u: d.city or ""),
    "district": ("İlçe", lambda d, n, u: d.district or ""),
    "neighbourhood": ("Mahalle", lambda d, n, u: d.neighbourhood or ""),
    "address": ("Adres", lambda d, n, u: d.address or ""),
    "tags": ("Etiketler", lambda d, n, u: ", ".join(d.tags or [])),
    "allow_sms": ("SMS İzni", lambda d, n, u: "Evet" if d.allow_sms else "Hayır"),
    "allow_email": ("E-posta İzni", lambda d, n, u: "Evet" if d.allow_email else "Hayır"),
}
DEFAULT_EXPORT = ["no", "donor_type", "full_name", "phone_code", "phone", "email", "tc_no", "created_at", "total",
                  "membership_type", "referral_source", "assigned", "staff"]
BULK_LIMIT = 50_000


@router.post("/donors/bulk")
async def bulk_donors(request: Request, payload: DonorBulkIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Toplu Güncelle / Sil / Dışa Aktar / telefon listesi, on picked rows or on every row matching the filters."""
    from app.models.membership import Member

    org_id = _org_id(request)
    if payload.select_all:
        conditions = _donor_conditions(org_id, current_user, payload.filters)
    else:
        if not payload.ids:
            raise HTTPException(status_code=422, detail="Kayıt seçin")
        conditions = _donor_conditions(org_id, current_user, DonorFilter()) + [Donor.id.in_(payload.ids)]
    count = (await db.execute(select(func.count(Donor.id)).where(*conditions))).scalar_one()
    if count > BULK_LIMIT:
        raise HTTPException(status_code=422, detail=f"Tek seferde en çok {BULK_LIMIT:,} kayıt işlenebilir; filtreyi daraltın")

    if payload.action == "export":
        ensure_capability(current_user, "donors.export", "Bağışçıları dışa aktarma yetkiniz yok")
        keys = [c for c in (payload.columns or DEFAULT_EXPORT) if c in EXPORT_COLUMNS] or DEFAULT_EXPORT
        names = await _staff_names(db, org_id)
        donors = (await db.execute(select(Donor).where(*conditions).order_by(Donor.created_at.desc()))).scalars().all()
        _audit(db, org_id, current_user, "bagisci_disa_aktar", {"count": len(donors), "columns": keys})
        await db.commit()
        return {
            "columns": [{"key": k, "label": EXPORT_COLUMNS[k][0]} for k in keys],
            "rows": [[EXPORT_COLUMNS[k][1](d, names, current_user) for k in keys] for d in donors],
        }

    if payload.action == "phones":
        # "SMS Listesi Oluştur" / quick SMS: numbers of donors who allow SMS.
        rows = (await db.execute(
            select(Donor.id, Donor.phone).where(*conditions, Donor.phone.isnot(None), Donor.allow_sms.is_(True))
        )).all()
        return {"total": count, "with_phone": len(rows), "donor_ids": [str(r[0]) for r in rows]}

    if payload.action == "delete":
        ensure_capability(current_user, "donors.delete", "Bağışçı silme yetkiniz yok")
        if not has_capability(current_user, "donors.update_all"):
            conditions.append(Donor.assigned_user_id == current_user.id)
        has_donation = select(Donation.id).where(Donation.donor_id == Donor.id).exists()
        has_member = select(Member.id).where(Member.donor_id == Donor.id).exists()
        ids = (await db.execute(select(Donor.id).where(*conditions, ~has_donation, ~has_member))).scalars().all()
        if ids:
            from sqlalchemy import delete as sql_delete

            await db.execute(sql_delete(Donor).where(Donor.id.in_(ids)))
        _audit(db, org_id, current_user, "bagisci_toplu_sil", {"deleted": len(ids), "selected": count})
        await db.commit()
        return {"selected": count, "deleted": len(ids), "skipped": count - len(ids)}

    # update
    ensure_capability(current_user, "donors.update", "Bağışçı güncelleme yetkiniz yok")
    if not has_capability(current_user, "donors.update_all"):
        conditions.append(Donor.assigned_user_id == current_user.id)
    upd = payload.update
    if not upd or not upd.model_fields_set:
        raise HTTPException(status_code=422, detail="Güncellenecek alan seçin")
    values = {}
    for key in ("membership_type", "referral_source", "rating", "city", "allow_sms", "allow_email"):
        if key in upd.model_fields_set:
            value = getattr(upd, key)
            values[key] = value.strip() or None if isinstance(value, str) else value
    for key in ("assigned_user_id", "staff_user_id"):
        if key in upd.model_fields_set:
            if getattr(upd, key):
                await _ensure_staff(db, org_id, getattr(upd, key))
            values[key] = getattr(upd, key)
    from sqlalchemy import update as sql_update

    updated = 0
    if values:
        result = await db.execute(sql_update(Donor).where(*conditions).values(**values).execution_options(synchronize_session=False))
        updated = result.rowcount or 0
    if upd.add_tag or upd.remove_tag:
        donors = (await db.execute(select(Donor).where(*conditions))).scalars().all()
        for donor in donors:
            tags = list(donor.tags or [])
            if upd.add_tag and upd.add_tag.strip() and upd.add_tag.strip() not in tags:
                tags.append(upd.add_tag.strip())
            if upd.remove_tag and upd.remove_tag.strip() in tags:
                tags.remove(upd.remove_tag.strip())
            donor.tags = tags
        updated = max(updated, len(donors))
    _audit(db, org_id, current_user, "bagisci_toplu_guncelle",
           {"selected": count, "fields": sorted(upd.model_fields_set)})
    await db.commit()
    return {"selected": count, "updated": updated}


class DonorSms(BaseModel):
    message: str = Field(min_length=2, max_length=612)


@router.post("/donors/{donor_id}/sms")
async def send_donor_sms(request: Request, donor_id: UUID, payload: DonorSms, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    ensure_capability(current_user, "sms.send", "SMS gönderme yetkiniz yok")
    donor = await _get_donor(db, org_id, donor_id)
    _ensure_can_see(current_user, donor)
    if not donor.phone:
        raise HTTPException(status_code=409, detail="Bağışçının kayıtlı telefonu yok")
    if not donor.allow_sms:
        raise HTTPException(
            status_code=409,
            detail="Bağışçının SMS izni yok. İzinsiz ticari ileti gönderilemez (İYS).",
        )
    from app.services.sms_service import enqueue_sms
    from app.sms import SmsError
    try:
        queued = await enqueue_sms(db, org_id, donor.phone, sanitize_public_text(payload.message) or "",
                                   donor_id=donor.id, created_by=current_user.id)
    except SmsError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _audit(db, org_id, current_user, "bagisci_sms", {"donor_id": str(donor.id), "sms_no": queued.seq_no})
    await db.commit()
    return {"status": "queued", "seq_no": queued.seq_no}


# --- Donations --------------------------------------------------------------

def _donation_row(d: Donation, names: dict) -> dict:
    return {
        "id": str(d.id),
        "receipt_number": d.receipt_number,
        "official_receipt_no": d.official_receipt_no,
        "receipt_seq": d.receipt_seq,
        "created_type": created_type(d),
        "campaign_id": str(d.campaign_id),
        "campaign_title": d.campaign.title if d.campaign else None,
        "amount_cents": d.amount_cents,
        "currency": d.currency,
        "status": d.status.value,
        "payment_method": d.payment_method.value,
        "payment_method_label": (d.payment_details or {}).get("bank_account_label")
        or METHOD_LABELS.get(d.payment_method, d.payment_method.value),
        "receipt_group": (d.payment_details or {}).get("receipt_group"),
        "is_manual": d.payment_provider in OFFLINE_PROVIDERS,
        "source": d.payment_provider,
        "paid_at": d.paid_at or d.created_at,
        "on_behalf_of": d.on_behalf_of,
        "on_behalf_of_phone": (d.payment_details or {}).get("on_behalf_of_phone"),
        "donor_message": d.donor_message,
        "transaction_id": d.transaction_id,
        "issued_by_id": str(d.issued_by_id) if d.issued_by_id else None,
        "issued_by_name": names.get(d.issued_by_id) if d.issued_by_id else None,
    }


@router.get("/donations")
async def search_donations(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    campaign_id: Optional[UUID] = None,
    status_filter: Annotated[Optional[DonationStatus], Query(alias="status")] = None,
    payment_method: Optional[PaymentMethod] = None,
    currency: Optional[Literal["TRY", "USD", "EUR", "GBP", "SAR", "CHF"]] = None,
    min_amount_cents: Annotated[Optional[int], Query(ge=0)] = None,
    max_amount_cents: Annotated[Optional[int], Query(ge=0)] = None,
    issued_by: Annotated[Optional[str], Query(description="'online', 'pos', 'manual' veya personel id")] = None,
    assigned: Annotated[Optional[str], Query(description="Bağışçı temsilcisi: 'me' veya personel id")] = None,
    on_behalf: Optional[bool] = None,
    q: Annotated[Optional[str], Query(max_length=100)] = None,
    sort: Literal["date_desc", "date_asc", "amount_desc", "amount_asc"] = "date_desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detaylı bağış filtreleme; tarih filtreleri Türkiye saatine göredir."""
    org_id = _org_id(request)
    paid = func.coalesce(Donation.paid_at, Donation.created_at)
    conditions = [Donation.organization_id == org_id]
    if not has_capability(current_user, "receipts.view_all"):
        conditions.append(Donation.issued_by_id == current_user.id)  # only receipts this staff member wrote
    lower, upper = _local_date_bounds(start, end)
    if lower:
        conditions.append(paid >= lower)
    if upper:
        conditions.append(paid < upper)
    if campaign_id:
        conditions.append(Donation.campaign_id == campaign_id)
    if status_filter:
        conditions.append(Donation.status == status_filter)
    if payment_method:
        conditions.append(Donation.payment_method == payment_method)
    if currency:
        conditions.append(Donation.currency == currency)
    if min_amount_cents is not None:
        conditions.append(Donation.amount_cents >= min_amount_cents)
    if max_amount_cents is not None:
        conditions.append(Donation.amount_cents <= max_amount_cents)
    if issued_by == "online":
        conditions.append(Donation.issued_by_id.is_(None))
    elif issued_by == "manual":
        conditions.append(Donation.payment_provider.in_(OFFLINE_PROVIDERS))
    elif issued_by == "pos":
        # Sanal POS / ödeme kuruluşu üzerinden gelen kartlı tahsilatlar (manuel, kumbara, aktarım hariç).
        conditions.append(Donation.payment_provider.is_not(None))
        conditions.append(Donation.payment_provider.not_in(OFFLINE_PROVIDERS | {"stkpro"}))
    elif issued_by:
        try:
            conditions.append(Donation.issued_by_id == UUID(issued_by))
        except ValueError:
            raise HTTPException(status_code=422, detail="Geçersiz personel filtresi")
    if on_behalf is True:
        conditions.append(Donation.on_behalf_of.is_not(None))
    elif on_behalf is False:
        conditions.append(Donation.on_behalf_of.is_(None))

    query = select(Donation).join(Donor, Donor.id == Donation.donor_id)
    if assigned == "me":
        conditions.append(Donor.assigned_user_id == current_user.id)
    elif assigned:
        try:
            conditions.append(Donor.assigned_user_id == UUID(assigned))
        except ValueError:
            raise HTTPException(status_code=422, detail="Geçersiz temsilci filtresi")
    if q:
        like = f"%{q.strip()}%"
        conditions.append(or_(
            Donation.receipt_number.ilike(like),
            Donation.official_receipt_no.ilike(like),
            Donation.on_behalf_of.ilike(like),
            Donor.first_name.ilike(like), Donor.last_name.ilike(like), Donor.company_name.ilike(like),
            Donor.email.ilike(like), Donor.phone.ilike(like),
            (Donor.first_name + " " + func.coalesce(Donor.last_name, "")).ilike(like),
        ))

    filtered = query.where(*conditions)
    totals = (await db.execute(
        select(Donation.currency, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .join(Donor, Donor.id == Donation.donor_id).where(*conditions).group_by(Donation.currency)
    )).all()
    order_col = {
        "date_desc": paid.desc(),
        "date_asc": paid.asc(),
        "amount_desc": Donation.amount_cents.desc(),
        "amount_asc": Donation.amount_cents.asc(),
    }[sort]
    rows = (await db.execute(
        filtered.options(selectinload(Donation.campaign), selectinload(Donation.donor))
        .order_by(order_col).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    names = await _staff_names(db, org_id)
    from app.services.kurban_placement import kurban_numbers

    # Kurban hissesi olan bağışlarda hayvan numaraları (tek sorgu; kurban dışı bağışta boş).
    numbers = await kurban_numbers(db, [d.id for d in rows])
    items = []
    for d in rows:
        row = _donation_row(d, names)
        row.update({
            "kurban_numbers": sorted({s["animal_number"] for s in numbers.get(d.id, []) if s["animal_number"]}),
            "kurban_unassigned": sum(1 for s in numbers.get(d.id, []) if not s["animal_number"]),
            "donor_id": str(d.donor_id),
            "donor_name": d.donor.full_name if d.donor else "—",
            "donor_phone": masked(d.donor.phone) if d.donor else None,
            "is_anonymous": bool(d.is_anonymous),
        })
        items.append(row)
    return {
        "page": page,
        "page_size": page_size,
        "total": sum(int(t[1]) for t in totals),
        "totals": [{"currency": t[0], "count": int(t[1]), "total_cents": int(t[2])} for t in totals],
        "items": items,
    }


def created_type(d: Donation) -> str:
    """STK PRO "Oluşturma Tipi": Web (online), Erp - Temsilci (written by staff) or Erp - Otomatik (system)."""
    provider = d.payment_provider or ""
    if provider == "stkpro":
        return (d.payment_details or {}).get("stkpro_type") or "Erp - Temsilci"
    if provider == MANUAL_PROVIDER:
        return "Erp - Temsilci"
    if provider in ("import", "money_box", "sms_donation") or provider.startswith("bank:"):
        return "Erp - Otomatik"
    if d.payment_order_item_id is not None and d.payment_method == PaymentMethod.CREDIT_CARD:
        return "Web"
    return "Web" if d.issued_by_id is None else "Erp - Temsilci"


def _receipt_key():
    """One key per receipt: its Makbuz No, else the manual receipt group, else the donation itself."""
    from sqlalchemy import String, cast

    return func.coalesce(cast(Donation.receipt_seq, String), Donation.payment_details["receipt_group"].astext,
                         cast(Donation.id, String))


@router.get("/receipts")
async def list_receipts(
    request: Request,
    receipt_no: Annotated[Optional[str], Query(max_length=40)] = None,
    name: Annotated[Optional[str], Query(max_length=100)] = None,
    phone: Annotated[Optional[str], Query(max_length=30)] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
    created_type_filter: Annotated[Optional[Literal["web", "temsilci", "otomatik"]], Query(alias="created_type")] = None,
    min_total_cents: Annotated[Optional[int], Query(ge=0)] = None,
    max_total_cents: Annotated[Optional[int], Query(ge=0)] = None,
    payment_method: Optional[PaymentMethod] = None,
    staff: Annotated[Optional[str], Query(description="'online' veya personel id")] = None,
    referral: Annotated[Optional[str], Query(max_length=100)] = None,
    status_filter: Annotated[Optional[DonationStatus], Query(alias="status")] = None,
    campaign_id: Optional[UUID] = None,
    with_totals: bool = False,
    sort: Literal["date_desc", "date_asc", "no_desc", "no_asc", "total_desc", "total_asc"] = "date_desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 25,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """STK PRO "Makbuzlar": one row per receipt (all its lines summed), with per-column filters."""
    from sqlalchemy import String, and_, cast

    org_id = _org_id(request)
    paid = func.coalesce(Donation.paid_at, Donation.created_at)
    conditions = [Donation.organization_id == org_id]
    if not has_capability(current_user, "receipts.view_all"):
        conditions.append(Donation.issued_by_id == current_user.id)
    lower, upper = _local_date_bounds(start, end)
    if lower:
        conditions.append(paid >= lower)
    if upper:
        conditions.append(paid < upper)
    if receipt_no and receipt_no.strip():
        text_no = receipt_no.strip().lstrip("#")
        conditions.append(or_(cast(Donation.receipt_seq, String).like(f"{text_no}%"),
                              Donation.official_receipt_no.ilike(f"{text_no}%"), Donation.receipt_number.ilike(f"%{text_no}%")))
    if name and name.strip():
        like = f"%{name.strip()}%"
        conditions.append(or_((Donor.first_name + " " + func.coalesce(Donor.last_name, "")).ilike(like), Donor.company_name.ilike(like)))
    if phone:
        digits = re.sub(r"\D", "", phone)
        if digits:
            conditions.append(Donor.phone.ilike(f"%{digits}%"))
    if created_type_filter == "web":
        conditions.append(and_(
            or_(Donation.issued_by_id.is_(None),
                and_(Donation.payment_order_item_id.is_not(None), Donation.payment_method == PaymentMethod.CREDIT_CARD)),
            func.coalesce(Donation.payment_provider, "").notin_(
                ["manual", "import", "money_box", "sms_donation", "stkpro"]),
            ~func.coalesce(Donation.payment_provider, "").like("bank:%"),
        ))
    elif created_type_filter == "temsilci":
        conditions.append(Donation.payment_provider.in_(["manual", "stkpro"]))
    elif created_type_filter == "otomatik":
        conditions.append(or_(Donation.payment_provider.in_(["import", "money_box", "sms_donation"]),
                              Donation.payment_provider.like("bank:%")))
    if payment_method:
        conditions.append(Donation.payment_method == payment_method)
    if staff == "online":
        conditions.append(Donation.issued_by_id.is_(None))
    elif staff:
        try:
            conditions.append(Donation.issued_by_id == UUID(staff))
        except ValueError:
            raise HTTPException(status_code=422, detail="Geçersiz personel filtresi")
    if referral:
        conditions.append(Donor.referral_source == referral)
    if status_filter:
        conditions.append(Donation.status == status_filter)
    if campaign_id:
        conditions.append(Donation.campaign_id == campaign_id)

    key = _receipt_key().label("rkey")
    grouped = (
        select(
            key,
            func.max(Donation.receipt_seq).label("seq"),
            func.max(Donation.official_receipt_no).label("official"),
            func.min(Donation.receipt_number).label("receipt_number"),
            func.min(cast(Donation.id, String)).label("first_id"),
            func.min(cast(Donation.donor_id, String)).label("donor_id"),
            func.min(paid).label("paid_at"),
            func.sum(Donation.amount_cents).label("total_cents"),
            func.min(Donation.currency).label("currency"),
            func.count(Donation.id).label("lines"),
            func.min(cast(Donation.status, String)).label("status"),
        )
        .join(Donor, Donor.id == Donation.donor_id)
        .where(*conditions)
        .group_by(key)
    )
    if min_total_cents is not None:
        grouped = grouped.having(func.sum(Donation.amount_cents) >= min_total_cents)
    if max_total_cents is not None:
        grouped = grouped.having(func.sum(Donation.amount_cents) <= max_total_cents)
    sub = grouped.subquery()
    total = (await db.execute(select(func.count()).select_from(sub))).scalar_one()
    order = {
        "date_desc": (sub.c.paid_at.desc(),), "date_asc": (sub.c.paid_at.asc(),),
        "no_desc": (sub.c.seq.desc().nullslast(), sub.c.paid_at.desc()), "no_asc": (sub.c.seq.asc().nullslast(), sub.c.paid_at.asc()),
        "total_desc": (sub.c.total_cents.desc(),), "total_asc": (sub.c.total_cents.asc(),),
    }[sort]
    rows = (await db.execute(select(sub).order_by(*order).offset((page - 1) * page_size).limit(page_size))).all()

    firsts = {}
    if rows:
        firsts = {str(d.id): d for d in (await db.execute(
            select(Donation).options(selectinload(Donation.donor), selectinload(Donation.campaign))
            .where(Donation.id.in_([UUID(r.first_id) for r in rows]))
        )).scalars().all()}
    names = await _staff_names(db, org_id)
    items = []
    for r in rows:
        d = firsts.get(r.first_id)
        donor = d.donor if d else None
        items.append({
            "key": r.rkey, "receipt_seq": r.seq, "official_receipt_no": r.official, "receipt_number": r.receipt_number,
            "donation_id": r.first_id, "donor_id": r.donor_id,
            "donor_name": donor.full_name if donor else "—",
            "phone_code": (donor.phone_code if donor else None) or "90",
            "donor_phone": mask_phone(donor.phone, current_user) if donor else None,
            "referral": donor.referral_source if donor else None,
            "paid_at": r.paid_at, "total_cents": int(r.total_cents or 0), "currency": r.currency, "lines": r.lines,
            "status": (d.status.value if d else r.status.lower()),
            "created_type": created_type(d) if d else "—",
            "payment_method_label": ((d.payment_details or {}).get("bank_account_label")
                                     or (d.payment_details or {}).get("payment_channel")
                                     or METHOD_LABELS.get(d.payment_method, d.payment_method.value)) if d else "—",
            "staff_name": names.get(d.issued_by_id) if d and d.issued_by_id else None,
            "campaign_title": d.campaign.title if d and d.campaign else None,
        })
    out = {"total": total, "page": page, "page_size": page_size, "items": items}
    if with_totals:
        if not has_capability(current_user, "bank.totals") and not has_capability(current_user, "receipts.view_all"):
            raise HTTPException(status_code=403, detail="Toplam tutarı görme yetkiniz yok")
        sums = (await db.execute(
            select(Donation.currency, func.coalesce(func.sum(Donation.amount_cents), 0))
            .join(Donor, Donor.id == Donation.donor_id).where(*conditions).group_by(Donation.currency)
        )).all()
        out["totals"] = [{"currency": c, "total_cents": int(t)} for c, t in sums]
    return out


class ManualDonor(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    city: Optional[str] = Field(default=None, max_length=100)
    country: Optional[str] = Field(default="Türkiye", max_length=100)

    @field_validator("phone", mode="before")
    @classmethod
    def check_phone(cls, value):
        return _normalize_phone(value)


class ReceiptLine(BaseModel):
    """One donation item on a receipt (the video's "Makbuz Detay" row)."""
    campaign_id: UUID
    amount_cents: int = Field(gt=0, le=1_000_000_000)
    currency: Literal["TRY", "USD", "EUR", "GBP", "SAR", "CHF"] = "TRY"
    quantity: int = Field(default=1, ge=1, le=700)
    on_behalf_of: Optional[str] = Field(default=None, max_length=200)
    on_behalf_of_phone: Optional[str] = Field(default=None, max_length=32)
    metadata: dict = Field(default_factory=dict)

    @field_validator("on_behalf_of", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) or None if value else None

    @field_validator("on_behalf_of_phone", mode="before")
    @classmethod
    def clean_phone(cls, value):
        if value is None or not str(value).strip():
            return None
        digits = "".join(ch for ch in str(value) if ch.isdigit() or ch == "+").strip()
        return digits[:32] or None


class ManualDonationIn(BaseModel):
    idempotency_key: str = Field(min_length=16, max_length=100)
    donor_id: Optional[UUID] = None
    donor: Optional[ManualDonor] = None
    # One item: campaign_id + amount_cents (kept for older callers). Several: lines.
    campaign_id: Optional[UUID] = None
    amount_cents: Optional[int] = Field(default=None, gt=0, le=1_000_000_000)
    lines: Optional[list[ReceiptLine]] = Field(default=None, max_length=30)
    currency: Literal["TRY", "USD", "EUR", "GBP", "SAR", "CHF"] = "TRY"
    # cash | bank_transfer | credit_card (POS / card at the office); bank_account_id names the account
    payment_method: Literal["cash", "bank_transfer", "credit_card"] = "cash"
    bank_account_id: Optional[UUID] = None
    paid_on: Optional[date] = None
    paid_time: Optional[str] = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    # paid: money received · pending: written now, paid later ("Beklemede")
    status: Literal["paid", "pending"] = "paid"
    # Staff member the receipt belongs to (defaults to whoever writes it)
    issued_by_id: Optional[UUID] = None
    bank_reference: Optional[str] = Field(default=None, max_length=100)
    on_behalf_of: Optional[str] = Field(default=None, max_length=200)
    on_behalf_of_phone: Optional[str] = Field(default=None, max_length=32)
    note: Optional[str] = Field(default=None, max_length=1000)
    is_anonymous: bool = False
    send_receipt: bool = True
    # SMS text staff wrote on the form; sent instead of the automatic receipt SMS
    sms_body: Optional[str] = Field(default=None, max_length=1500)
    # Matbu koçan: numara boşsa sıradaki yaprak verilir
    receipt_book_id: Optional[UUID] = None
    official_no: Optional[int] = Field(default=None, ge=1, le=99_999_999)
    # Module details, e.g. {"kurban_type": "adak", "kurban_names": [...]} or {"pledge_installment_id": "..."}
    quantity: int = Field(default=1, ge=1, le=700)
    metadata: dict = Field(default_factory=dict)

    @field_validator("on_behalf_of", "note", "bank_reference", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) or None if value else None

    @field_validator("on_behalf_of_phone", mode="before")
    @classmethod
    def clean_phone(cls, value):
        if value is None or not str(value).strip():
            return None
        digits = "".join(ch for ch in str(value) if ch.isdigit() or ch == "+").strip()
        return digits[:32] or None

    @model_validator(mode="after")
    def donor_required(self):
        if not self.donor_id and not self.donor:
            raise ValueError("Mevcut bir bağışçı seçin veya yeni bağışçı bilgisi girin")
        if not self.lines and (not self.campaign_id or not self.amount_cents):
            raise ValueError("En az bir bağış kalemi ve tutar girin")
        today = datetime.now(TZ).date()
        if self.paid_on and (self.paid_on > today or self.paid_on < today - timedelta(days=366)):
            raise ValueError("Bağış tarihi bugünden ileri veya bir yıldan eski olamaz")
        return self

    def receipt_lines(self) -> list[ReceiptLine]:
        """The items of the receipt; the single-item fields when no lines were sent."""
        return self.lines or [ReceiptLine(campaign_id=self.campaign_id, amount_cents=self.amount_cents, currency=self.currency,
                                          quantity=self.quantity, on_behalf_of=self.on_behalf_of,
                                          on_behalf_of_phone=self.on_behalf_of_phone, metadata=self.metadata)]


@router.post("/donations/manual", status_code=status.HTTP_201_CREATED)
async def create_manual_donation(request: Request, payload: ManualDonationIn, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    """Elden / havaleyle alınan bağış için makbuz keser."""
    org_id = _org_id(request)
    idempotency_key = f"manual:{payload.idempotency_key}"
    existing = (await db.execute(
        select(Donation).options(selectinload(Donation.campaign))
        .where(Donation.organization_id == org_id, Donation.idempotency_key == idempotency_key)
    )).scalar_one_or_none()
    if existing:
        return _donation_row(existing, await _staff_names(db, org_id))

    ensure_capability(current_user, "receipts.create", "Makbuz kesme yetkiniz yok")
    if payload.paid_on and payload.paid_on < datetime.now(TZ).date():
        ensure_capability(current_user, "receipts.backdate", "Makbuz tarihini geriye dönük girme yetkiniz yok")
    receipt_lines = payload.receipt_lines()
    campaigns: dict[UUID, Campaign] = {}
    for line in receipt_lines:
        if line.campaign_id not in campaigns:
            found = (await db.execute(select(Campaign).where(
                Campaign.id == line.campaign_id, Campaign.organization_id == org_id).with_for_update())).scalar_one_or_none()
            if not found:
                raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
            campaigns[line.campaign_id] = found

    from app.services.donation_hooks import ensure_kurban_open
    try:
        await ensure_kurban_open(db, org_id, campaigns.keys())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    issuer_id = current_user.id
    if payload.issued_by_id and payload.issued_by_id != current_user.id:
        ensure_capability(current_user, "receipts.for_others", "Başka personel adına makbuz kesme yetkiniz yok")
        staff = (await db.execute(select(User).where(
            User.id == payload.issued_by_id, User.organization_id == org_id, User.is_active.is_(True)))).scalar_one_or_none()
        if not staff:
            raise HTTPException(status_code=404, detail="Personel bulunamadı")
        issuer_id = staff.id
    bank_account = None
    if payload.bank_account_id:
        from app.models.automation import BankAccount
        bank_account = (await db.execute(select(BankAccount).where(
            BankAccount.id == payload.bank_account_id, BankAccount.organization_id == org_id))).scalar_one_or_none()
        if not bank_account:
            raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")

    if payload.donor_id:
        donor = await _get_donor(db, org_id, payload.donor_id)
    else:
        info = payload.donor
        email = str(info.email) if info.email else None
        donor = None
        if email or info.phone:
            checks = []
            if email:
                checks.append(func.lower(Donor.email) == email.lower())
            if info.phone:
                checks.append(Donor.phone == info.phone)
            donor = (await db.execute(
                select(Donor).where(Donor.organization_id == org_id, or_(*checks))
            )).scalars().first()
        if not donor:
            donor = Donor(
                organization_id=org_id, donor_type=DonorType.INDIVIDUAL,
                first_name=sanitize_public_text(info.first_name), last_name=sanitize_public_text(info.last_name) if info.last_name else None,
                phone=info.phone, email=email, city=info.city, country=info.country or "Türkiye",
                total_donations=0, total_donated_cents=0,
            )
            db.add(donor)
            await db.flush()

    book, official_no = None, None
    if payload.receipt_book_id:
        book, official_no = await take_number(db, org_id, payload.receipt_book_id, payload.official_no)
    elif payload.official_no:
        raise HTTPException(status_code=422, detail="Yaprak numarası için koçan seçin")

    now = datetime.now(timezone.utc)
    clock = time(*map(int, payload.paid_time.split(":"))) if payload.paid_time else None
    if payload.paid_on:
        paid_at = datetime.combine(payload.paid_on, clock or time(12, 0), TZ)
    elif clock:
        paid_at = datetime.combine(datetime.now(TZ).date(), clock, TZ)
    else:
        paid_at = now
    method = {"cash": PaymentMethod.CASH, "credit_card": PaymentMethod.CREDIT_CARD}.get(payload.payment_method, PaymentMethod.BANK_TRANSFER)
    if bank_account:
        method = PaymentMethod.BANK_TRANSFER
    details = {"note": payload.note, "bank_reference": payload.bank_reference}
    if bank_account:
        details.update(bank_account_id=str(bank_account.id), bank_account_label=bank_account.label)
    if issuer_id != current_user.id:
        details["written_by"] = str(current_user.id)

    donations, effects = [], {}
    for index, line in enumerate(receipt_lines):
        line_phone = line.on_behalf_of_phone or payload.on_behalf_of_phone
        donation, line_effects = await record_offline_donation(
            db,
            organization_id=org_id, campaign=campaigns[line.campaign_id], donor=donor,
            amount_cents=line.amount_cents, currency=line.currency, method=method, paid_at=paid_at,
            issued_by_id=issuer_id, provider=MANUAL_PROVIDER,
            idempotency_key=idempotency_key + (f":{index}" if index else ""),
            details={
                **details,
                **({"on_behalf_of_phone": line_phone} if line_phone else {}),
                **({"receipt_group": str(donations[0].id), "line": index} if donations else {}),
            },
            note=payload.note, on_behalf_of=line.on_behalf_of, is_anonymous=payload.is_anonymous,
            transaction_id=payload.bank_reference,
            # one e-mail/SMS for the whole receipt
            send_receipt=payload.send_receipt and index == 0,
            quantity=line.quantity, metadata=line.metadata, pending=payload.status == "pending",
            receipt_seq=donations[0].receipt_seq if donations else None,  # one "Makbuz No" per receipt
        )
        if not donations and len(receipt_lines) > 1:
            donation.payment_details = {**donation.payment_details, "receipt_group": str(donation.id), "line": 0}
        donations.append(donation)
        for key, value in line_effects.items():
            effects[key] = effects.get(key, 0) + value if isinstance(value, int) else value
    if book:
        for donation in donations:
            donation.receipt_book_id, donation.official_receipt_no = book.id, official_no
    first = donations[0]
    if payload.status == "paid":
        from app.services.sms_service import queue_receipt_sms
        from app.sms import SmsError
        try:
            await queue_receipt_sms(db, first, donor, payload.sms_body, current_user.id)
        except SmsError as exc:
            raise HTTPException(status_code=422, detail=f"SMS: {exc}") from exc
    _audit(db, org_id, current_user, "makbuz_elle_kes", {
        "donation_id": str(first.id), "receipt_number": first.receipt_number, "official_receipt_no": official_no,
        "donor_id": str(donor.id), "lines": len(donations), "amount_cents": sum(d.amount_cents for d in donations),
        "currency": first.currency, "method": payload.payment_method, "status": payload.status,
        "bank_account": bank_account.label if bank_account else None, **effects,
    })
    await db.commit()
    first.campaign = campaigns[receipt_lines[0].campaign_id]
    row = _donation_row(first, await _staff_names(db, org_id))
    row["receipt_numbers"] = [d.receipt_number for d in donations]
    row["total_cents"] = sum(d.amount_cents for d in donations)
    if effects.get("kurban_shares"):
        # Kurban numarası kayıt anında belli olur (kampanyada otomatik yerleştirme açıksa).
        from app.services.kurban_placement import kurban_numbers

        numbers = await kurban_numbers(db, [d.id for d in donations])
        row["kurban_shares"] = [share for d in donations for share in numbers.get(d.id, [])]
    return row


@router.post("/donations/{donation_id}/mark-paid")
async def mark_manual_donation_paid(request: Request, donation_id: UUID, db: AsyncSession = Depends(get_db),
                                    current_user: User = Depends(get_current_user)):
    """A pending receipt was paid: every line of its receipt becomes confirmed."""
    from app.services.offline_donation import confirm_offline_donation

    org_id = _org_id(request)
    ensure_capability(current_user, "receipts.mark_paid", "Makbuzu ödendi yapma yetkiniz yok")
    donation = (await db.execute(select(Donation).options(selectinload(Donation.donor)).where(
        Donation.id == donation_id, Donation.organization_id == org_id).with_for_update(of=Donation))).scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Bağış bulunamadı")
    ensure_receipt_visible(current_user, donation)
    group = (donation.payment_details or {}).get("receipt_group")
    rows = [donation]
    if group:
        rows = (await db.execute(select(Donation).options(selectinload(Donation.campaign), selectinload(Donation.donor)).where(
            Donation.organization_id == org_id, Donation.payment_details["receipt_group"].astext == group,
            Donation.status == DonationStatus.PENDING).with_for_update())).scalars().all()
    else:
        await db.refresh(donation, ["campaign", "donor"])
    if not rows or any(r.status != DonationStatus.PENDING for r in rows):
        raise HTTPException(status_code=409, detail="Yalnız bekleyen makbuz ödendi olarak işaretlenebilir")
    now = datetime.now(timezone.utc)
    for row in rows:
        await confirm_offline_donation(db, row, row.campaign, row.donor, paid_at=now)
    _audit(db, org_id, current_user, "makbuz_odendi", {"donation_id": str(rows[0].id), "lines": len(rows),
                                                        "donor_id": str(rows[0].donor_id)})
    await db.commit()
    return {"status": "confirmed", "lines": len(rows)}


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.post("/donations/{donation_id}/cancel")
async def cancel_manual_donation(request: Request, donation_id: UUID, payload: CancelIn, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    """Yalnız elle kesilmiş makbuzlar iptal edilebilir; online ödemeler iade akışından geçer."""
    ensure_capability(current_user, "receipts.cancel", "Makbuz iptal yetkiniz yok")
    org_id = _org_id(request)
    donation = (await db.execute(
        select(Donation).options(selectinload(Donation.campaign), selectinload(Donation.donor))
        .where(Donation.id == donation_id, Donation.organization_id == org_id).with_for_update(of=Donation)
    )).scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Bağış bulunamadı")
    ensure_receipt_visible(current_user, donation)
    if donation.payment_provider not in OFFLINE_PROVIDERS:
        raise HTTPException(status_code=409, detail="Online ödemeler iptal edilemez; iade işlemi kullanılmalıdır")
    if donation.status not in (DonationStatus.CONFIRMED, DonationStatus.PENDING):
        raise HTTPException(status_code=409, detail="Makbuz zaten iptal edilmiş")
    # A receipt with several items is cancelled as a whole.
    group = (donation.payment_details or {}).get("receipt_group")
    lines = [donation]
    if group:
        lines = (await db.execute(
            select(Donation).options(selectinload(Donation.campaign), selectinload(Donation.donor)).where(
                Donation.organization_id == org_id, Donation.payment_details["receipt_group"].astext == group,
                Donation.status.in_([DonationStatus.CONFIRMED, DonationStatus.PENDING])).with_for_update()
        )).scalars().all()
    undone: dict = {}
    reason = sanitize_public_text(payload.reason)
    for line in lines:
        if line.status == DonationStatus.CONFIRMED:
            try:
                for key, value in (await on_donation_cancelled(db, line)).items():
                    undone[key] = undone.get(key, 0) + value if isinstance(value, int) else value
            except DonationEffectsLocked as exc:
                raise HTTPException(status_code=409, detail=str(exc))
            if line.campaign:
                remove_from_campaign(line, line.campaign)
            if line.donor:
                remove_from_donor(line.donor, line)
        line.status = DonationStatus.CANCELLED
        line.payment_details = {**(line.payment_details or {}), "cancel_reason": reason, "cancelled_by": str(current_user.id)}
    _audit(db, org_id, current_user, "makbuz_iptal", {
        "donation_id": str(donation.id), "receipt_number": donation.receipt_number, "reason": payload.reason,
        "donor_id": str(donation.donor_id), "lines": len(lines), **undone,
    })
    await db.commit()
    return _donation_row(donation, await _staff_names(db, org_id))
