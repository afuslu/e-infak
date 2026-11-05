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

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
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

router = APIRouter(
    prefix="/admin-features",
    tags=["crm"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
HOME_COUNTRIES = {"türkiye", "turkiye", "turkey", "tr"}
MANUAL_PROVIDER = "manual"
# Staff-entered sources that may be cancelled (online payments go through refunds)
OFFLINE_PROVIDERS = {MANUAL_PROVIDER, "money_box"}
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


def _donor_summary(donor: Donor, staff_names: dict) -> dict:
    return {
        "id": str(donor.id),
        "donor_type": donor.donor_type.value if hasattr(donor.donor_type, "value") else donor.donor_type,
        "first_name": donor.first_name,
        "last_name": donor.last_name,
        "company_name": donor.company_name,
        "full_name": donor.full_name,
        "email": donor.email,
        "phone": donor.phone,
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
    return {"total": total, "page": page, "page_size": page_size, "items": [_donor_summary(d, names) for d in rows]}


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
    await _ensure_no_duplicate(db, org_id, payload.email, payload.phone)
    data = payload.model_dump()
    data["donor_type"] = DonorType(data["donor_type"])
    data["email"] = str(payload.email) if payload.email else None
    donor = Donor(organization_id=org_id, total_donations=0, total_donated_cents=0, **data)
    db.add(donor)
    await db.flush()
    _audit(db, org_id, current_user, "bagisci_olustur", {"donor_id": str(donor.id)})
    await db.commit()
    return _donor_summary(donor, {})


@router.get("/donors/{donor_id}")
async def get_donor_card(request: Request, donor_id: UUID, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """Bağışçı kartı: kimlik, iletişim, temsilci, tüm bağışlar, notlar ve yıllık özet."""
    org_id = _org_id(request)
    donor = await _get_donor(db, org_id, donor_id)
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
    )).scalars().all()

    by_year: dict[int, dict] = {}
    for d in donations:
        if d.status != DonationStatus.CONFIRMED:
            continue
        year = (d.paid_at or d.created_at).astimezone(TZ).year
        bucket = by_year.setdefault(year, {"year": year, "count": 0, "totals": {}})
        bucket["count"] += 1
        bucket["totals"][d.currency or "TRY"] = bucket["totals"].get(d.currency or "TRY", 0) + d.amount_cents

    card = _donor_summary(donor, names)
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
    return _donor_summary(donor, await _staff_names(db, org_id))


class DonorSms(BaseModel):
    message: str = Field(min_length=2, max_length=612)


@router.post("/donors/{donor_id}/sms")
async def send_donor_sms(request: Request, donor_id: UUID, payload: DonorSms, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    donor = await _get_donor(db, org_id, donor_id)
    if not donor.phone:
        raise HTTPException(status_code=409, detail="Bağışçının kayıtlı telefonu yok")
    if not donor.allow_sms:
        raise HTTPException(
            status_code=409,
            detail="Bağışçının SMS izni yok. İzinsiz ticari ileti gönderilemez (İYS).",
        )
    message = sanitize_public_text(payload.message) or ""
    from app.tasks import send_sms_task
    try:
        send_sms_task.delay(donor.phone, message, str(org_id))
    except Exception:
        raise HTTPException(status_code=503, detail="SMS kuyruğuna ulaşılamadı, lütfen tekrar deneyin")
    db.add(DonorNote(donor_id=donor.id, author_id=current_user.id, content=f"SMS gönderildi: {message}"))
    _audit(db, org_id, current_user, "bagisci_sms", {"donor_id": str(donor.id), "length": len(message)})
    await db.commit()
    return {"status": "queued"}


# --- Donations --------------------------------------------------------------

def _donation_row(d: Donation, names: dict) -> dict:
    return {
        "id": str(d.id),
        "receipt_number": d.receipt_number,
        "campaign_id": str(d.campaign_id),
        "campaign_title": d.campaign.title if d.campaign else None,
        "amount_cents": d.amount_cents,
        "currency": d.currency,
        "status": d.status.value,
        "payment_method": d.payment_method.value,
        "payment_method_label": METHOD_LABELS.get(d.payment_method, d.payment_method.value),
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


class ManualDonationIn(BaseModel):
    idempotency_key: str = Field(min_length=16, max_length=100)
    donor_id: Optional[UUID] = None
    donor: Optional[ManualDonor] = None
    campaign_id: UUID
    amount_cents: int = Field(gt=0, le=1_000_000_000)
    currency: Literal["TRY", "USD", "EUR"] = "TRY"
    payment_method: Literal["cash", "bank_transfer"] = "cash"
    paid_on: Optional[date] = None
    bank_reference: Optional[str] = Field(default=None, max_length=100)
    on_behalf_of: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = Field(default=None, max_length=1000)
    is_anonymous: bool = False
    send_receipt: bool = True
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
        today = datetime.now(TZ).date()
        if self.paid_on and (self.paid_on > today or self.paid_on < today - timedelta(days=366)):
            raise ValueError("Bağış tarihi bugünden ileri veya bir yıldan eski olamaz")
        return self


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

    campaign = (await db.execute(
        select(Campaign).where(Campaign.id == payload.campaign_id, Campaign.organization_id == org_id).with_for_update()
    )).scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")

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

    now = datetime.now(timezone.utc)
    paid_at = datetime.combine(payload.paid_on, time(12, 0), TZ) if payload.paid_on else now
    method = PaymentMethod.CASH if payload.payment_method == "cash" else PaymentMethod.BANK_TRANSFER
    donation, module_effects = await record_offline_donation(
        db,
        organization_id=org_id, campaign=campaign, donor=donor,
        amount_cents=payload.amount_cents, currency=payload.currency, method=method, paid_at=paid_at,
        issued_by_id=current_user.id, provider=MANUAL_PROVIDER, idempotency_key=idempotency_key,
        details={"note": payload.note, "bank_reference": payload.bank_reference},
        note=payload.note, on_behalf_of=payload.on_behalf_of, is_anonymous=payload.is_anonymous,
        transaction_id=payload.bank_reference, send_receipt=payload.send_receipt,
        quantity=payload.quantity, metadata=payload.metadata,
    )
    _audit(db, org_id, current_user, "makbuz_elle_kes", {
        "donation_id": str(donation.id), "receipt_number": donation.receipt_number,
        "amount_cents": payload.amount_cents, "currency": payload.currency, "method": payload.payment_method,
        **module_effects,
    })
    await db.commit()
    donation.campaign = campaign
    return _donation_row(donation, await _staff_names(db, org_id))


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.post("/donations/{donation_id}/cancel")
async def cancel_manual_donation(request: Request, donation_id: UUID, payload: CancelIn, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    """Yalnız elle kesilmiş makbuzlar iptal edilebilir; online ödemeler iade akışından geçer."""
    org_id = _org_id(request)
    donation = (await db.execute(
        select(Donation).options(selectinload(Donation.campaign), selectinload(Donation.donor))
        .where(Donation.id == donation_id, Donation.organization_id == org_id).with_for_update()
    )).scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Bağış bulunamadı")
    if donation.payment_provider not in OFFLINE_PROVIDERS:
        raise HTTPException(status_code=409, detail="Online ödemeler iptal edilemez; iade işlemi kullanılmalıdır")
    if donation.status != DonationStatus.CONFIRMED:
        raise HTTPException(status_code=409, detail="Makbuz zaten iptal edilmiş")
    try:
        undone = await on_donation_cancelled(db, donation)
    except DonationEffectsLocked as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    donation.status = DonationStatus.CANCELLED
    donation.payment_details = {**(donation.payment_details or {}), "cancel_reason": sanitize_public_text(payload.reason),
                                "cancelled_by": str(current_user.id)}
    if donation.campaign:
        remove_from_campaign(donation, donation.campaign)
    if donation.donor:
        donation.donor.total_donations = max(0, (donation.donor.total_donations or 0) - 1)
        donation.donor.total_donated_cents = max(0, (donation.donor.total_donated_cents or 0) - donation.amount_cents)
    _audit(db, org_id, current_user, "makbuz_iptal", {
        "donation_id": str(donation.id), "receipt_number": donation.receipt_number, "reason": payload.reason,
        **undone,
    })
    await db.commit()
    return _donation_row(donation, await _staff_names(db, org_id))
