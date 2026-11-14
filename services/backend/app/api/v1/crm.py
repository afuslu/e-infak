"""Bağışçı CRM ve makbuz işlemleri.

- Bağışçı arama, tek ekranda bağışçı kartı (bağışlar, notlar, özet)
- Bağışçıya personel / temsilci atama
- Bağışçıya tekli SMS (yalnız SMS izni olan bağışçılara; İYS gereği)
- Elle makbuz kesme (nakit / havale) ve elle kesilen makbuzu iptal
- Gelişmiş bağış filtreleme
"""
import re
from datetime import date, datetime, time, timedelta, timezone
from typing import List, Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import ensure_capability, get_current_user, has_capability, mask_phone, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, DonorType, PaymentMethod
from app.models.donor_note import DonorNote
from app.models.user import User
from app.utils.content import sanitize_public_text
from app.services.donation_hooks import DonationEffectsLocked, on_donation_cancelled
from app.services.offline_donation import record_offline_donation
from app.services.fx import remove_from_campaign
from app.services.receipt_books import take_number

router = APIRouter(
    prefix="/admin-features",
    tags=["crm"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
HOME_COUNTRIES = {"türkiye", "turkiye", "turkey", "tr"}
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


def _normalize_phone(value: Optional[str]) -> Optional[str]:
    if value is None or not str(value).strip():
        return None
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
    }


async def _staff_names(db: AsyncSession, org_id: UUID) -> dict:
    rows = (await db.execute(
        select(User.id, User.first_name, User.last_name).where(User.organization_id == org_id)
    )).all()
    return {r[0]: f"{r[1]} {r[2]}".strip() for r in rows}


# --- Donors -----------------------------------------------------------------

@router.get("/donors")
async def list_donors(
    request: Request,
    q: Optional[str] = Query(default=None, max_length=100),
    assigned: Optional[str] = Query(default=None, description="'me', 'none' veya personel id"),
    region: Optional[Literal["yurtici", "yurtdisi"]] = None,
    donor_type: Optional[Literal["individual", "corporate"]] = None,
    has_donation: Optional[bool] = None,
    sort: Literal["name", "recent", "total"] = "recent",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    conditions = [Donor.organization_id == org_id]
    if q:
        like = f"%{q.strip()}%"
        digits = re.sub(r"\D", "", q)
        search = [
            Donor.first_name.ilike(like), Donor.last_name.ilike(like), Donor.company_name.ilike(like),
            Donor.email.ilike(like), (Donor.first_name + " " + func.coalesce(Donor.last_name, "")).ilike(like),
        ]
        if len(digits) >= 4:
            search.append(Donor.phone.ilike(f"%{digits}%"))
        conditions.append(or_(*search))
    if not has_capability(current_user, "donors.view_all"):
        conditions.append(Donor.assigned_user_id == current_user.id)  # only donors this staff member represents
    if assigned == "me":
        conditions.append(Donor.assigned_user_id == current_user.id)
    elif assigned == "none":
        conditions.append(Donor.assigned_user_id.is_(None))
    elif assigned:
        try:
            conditions.append(Donor.assigned_user_id == UUID(assigned))
        except ValueError:
            raise HTTPException(status_code=422, detail="Geçersiz personel filtresi")
    country = func.lower(func.coalesce(Donor.country, "türkiye"))
    if region == "yurtici":
        conditions.append(country.in_(HOME_COUNTRIES))
    elif region == "yurtdisi":
        conditions.append(country.notin_(HOME_COUNTRIES))
    if donor_type:
        conditions.append(Donor.donor_type == DonorType(donor_type))
    if has_donation is True:
        conditions.append(Donor.total_donations > 0)
    elif has_donation is False:
        conditions.append(func.coalesce(Donor.total_donations, 0) == 0)

    total = (await db.execute(select(func.count(Donor.id)).where(*conditions))).scalar_one()
    order = {
        "name": (Donor.first_name.asc(), Donor.last_name.asc()),
        "recent": (Donor.last_donation_at.desc().nullslast(), Donor.created_at.desc()),
        "total": (Donor.total_donated_cents.desc().nullslast(),),
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

    @field_validator("phone", mode="before")
    @classmethod
    def check_phone(cls, value):
        return _normalize_phone(value)

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
    await _ensure_no_duplicate(db, org_id, payload.email, payload.phone)
    data = payload.model_dump()
    data["donor_type"] = DonorType(data["donor_type"])
    data["email"] = str(payload.email) if payload.email else None
    donor = Donor(organization_id=org_id, total_donations=0, total_donated_cents=0, **data)
    db.add(donor)
    await db.flush()
    if not has_capability(current_user, "donors.view_all") and not donor.assigned_user_id:
        donor.assigned_user_id = current_user.id  # otherwise its creator could not open the new card
    _audit(db, org_id, current_user, "bagisci_olustur", {"donor_id": str(donor.id)})
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
        "donations": [_donation_row(d, names) for d in donations],
        "notes": [
            {"id": str(n.id), "content": n.content, "created_at": n.created_at,
             "author": f"{n.author.first_name} {n.author.last_name}" if n.author else None}
            for n in notes
        ],
        "yearly": sorted(by_year.values(), key=lambda b: b["year"], reverse=True),
    })
    return card


@router.put("/donors/{donor_id}")
async def update_donor(request: Request, donor_id: UUID, payload: DonorUpdate, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    donor = await _get_donor(db, org_id, donor_id)
    ensure_capability(current_user, "donors.update", "Bağışçı güncelleme yetkiniz yok")
    if donor.assigned_user_id != current_user.id:
        ensure_capability(current_user, "donors.update_all", "Yalnız temsilcisi olduğunuz bağışçıları güncelleyebilirsiniz")
    await _ensure_no_duplicate(db, org_id, payload.email, payload.phone, exclude_id=donor.id)
    changes = {}
    for key in ("first_name", "last_name", "company_name", "phone", "address", "city", "country", "tax_number", "tags"):
        value = getattr(payload, key)
        if getattr(donor, key) != value:
            changes[key] = True
            setattr(donor, key, value)
    email = str(payload.email) if payload.email else None
    if donor.email != email:
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
        "donor_message": d.donor_message,
        "issued_by_id": str(d.issued_by_id) if d.issued_by_id else None,
        "issued_by_name": names.get(d.issued_by_id) if d.issued_by_id else None,
    }


@router.get("/donations")
async def search_donations(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    campaign_id: Optional[UUID] = None,
    status_filter: Optional[DonationStatus] = Query(default=None, alias="status"),
    payment_method: Optional[PaymentMethod] = None,
    currency: Optional[Literal["TRY", "USD", "EUR"]] = None,
    min_amount_cents: Optional[int] = Query(default=None, ge=0),
    max_amount_cents: Optional[int] = Query(default=None, ge=0),
    issued_by: Optional[str] = Query(default=None, description="'online', 'manual' veya personel id"),
    assigned: Optional[str] = Query(default=None, description="Bağışçı temsilcisi: 'me' veya personel id"),
    on_behalf: Optional[bool] = None,
    q: Optional[str] = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
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
    rows = (await db.execute(
        filtered.options(selectinload(Donation.campaign), selectinload(Donation.donor))
        .order_by(paid.desc()).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    names = await _staff_names(db, org_id)
    items = []
    for d in rows:
        row = _donation_row(d, names)
        row.update({
            "donor_id": str(d.donor_id),
            "donor_name": d.donor.full_name if d.donor else "—",
            "donor_phone": d.donor.phone if d.donor else None,
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
    currency: Literal["TRY", "USD", "EUR"] = "TRY"
    quantity: int = Field(default=1, ge=1, le=700)
    on_behalf_of: Optional[str] = Field(default=None, max_length=200)
    metadata: dict = Field(default_factory=dict)

    @field_validator("on_behalf_of", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) or None if value else None


class ManualDonationIn(BaseModel):
    idempotency_key: str = Field(min_length=16, max_length=100)
    donor_id: Optional[UUID] = None
    donor: Optional[ManualDonor] = None
    # One item: campaign_id + amount_cents (kept for older callers). Several: lines.
    campaign_id: Optional[UUID] = None
    amount_cents: Optional[int] = Field(default=None, gt=0, le=1_000_000_000)
    lines: Optional[list[ReceiptLine]] = Field(default=None, max_length=30)
    currency: Literal["TRY", "USD", "EUR"] = "TRY"
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
                                          quantity=self.quantity, on_behalf_of=self.on_behalf_of, metadata=self.metadata)]


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
        donation, line_effects = await record_offline_donation(
            db,
            organization_id=org_id, campaign=campaigns[line.campaign_id], donor=donor,
            amount_cents=line.amount_cents, currency=line.currency, method=method, paid_at=paid_at,
            issued_by_id=issuer_id, provider=MANUAL_PROVIDER,
            idempotency_key=idempotency_key + (f":{index}" if index else ""),
            details={**details, **({"receipt_group": str(donations[0].id), "line": index} if donations else {})},
            note=payload.note, on_behalf_of=line.on_behalf_of, is_anonymous=payload.is_anonymous,
            transaction_id=payload.bank_reference,
            # one e-mail/SMS for the whole receipt
            send_receipt=payload.send_receipt and index == 0,
            quantity=line.quantity, metadata=line.metadata, pending=payload.status == "pending",
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
    return row


@router.post("/donations/{donation_id}/mark-paid")
async def mark_manual_donation_paid(request: Request, donation_id: UUID, db: AsyncSession = Depends(get_db),
                                    current_user: User = Depends(get_current_user)):
    """A pending receipt was paid: every line of its receipt becomes confirmed."""
    from app.services.offline_donation import confirm_offline_donation

    org_id = _org_id(request)
    ensure_capability(current_user, "receipts.mark_paid", "Makbuzu ödendi yapma yetkiniz yok")
    donation = (await db.execute(select(Donation).where(
        Donation.id == donation_id, Donation.organization_id == org_id).with_for_update())).scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Bağış bulunamadı")
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
        .where(Donation.id == donation_id, Donation.organization_id == org_id).with_for_update()
    )).scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Bağış bulunamadı")
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
                line.donor.total_donations = max(0, (line.donor.total_donations or 0) - 1)
                line.donor.total_donated_cents = max(0, (line.donor.total_donated_cents or 0) - line.amount_cents)
        line.status = DonationStatus.CANCELLED
        line.payment_details = {**(line.payment_details or {}), "cancel_reason": reason, "cancelled_by": str(current_user.id)}
    _audit(db, org_id, current_user, "makbuz_iptal", {
        "donation_id": str(donation.id), "receipt_number": donation.receipt_number, "reason": payload.reason,
        "donor_id": str(donation.donor_id), "lines": len(lines), **undone,
    })
    await db.commit()
    return _donation_row(donation, await _staff_names(db, org_id))
