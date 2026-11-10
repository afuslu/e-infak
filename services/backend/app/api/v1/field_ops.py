"""Saha operasyonları: bölgeler, kumbara organizasyonu, kumanya dağıtımı ve görev/takvim."""
from datetime import date, datetime, time, timedelta, timezone
from typing import List, Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Permission, get_current_user, has_permission, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, DonorType, PaymentMethod
from app.models.field_ops import (
    AidDistribution, AidPackage, AidRecipient, MoneyBox, MoneyBoxCollection, Region, Task, TaskTemplate,
)
from app.models.staff import Department
from app.models.user import User
from app.services.offline_donation import record_offline_donation
from app.services.poverty import rescore
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features",
    tags=["field-ops"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
KUMBARA_DONOR_TAG = "sistem-kumbara"
PRIORITIES = ("low", "normal", "high", "urgent")
TASK_STATUSES = ("todo", "in_progress", "done", "cancelled")


def _org_id(request: Request) -> UUID:
    return UUID(request.state.organization_id)


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


def _clean(value):
    return sanitize_public_text(value) if value else value


async def _owned(db: AsyncSession, model, org_id: UUID, item_id: UUID, label: str, lock: bool = False):
    query = select(model).where(model.id == item_id, model.organization_id == org_id)
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"{label} bulunamadı")
    return row


async def _staff(db: AsyncSession, org_id: UUID, user_id: Optional[UUID]) -> Optional[UUID]:
    if not user_id:
        return None
    await _owned(db, User, org_id, user_id, "Personel")
    return user_id


# --- Regions -------------------------------------------------------------------------

class RegionIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    responsible_user_id: Optional[UUID] = None

    clean_text = field_validator("name", "description", mode="before")(lambda cls, v: _clean(v))


def _region_out(r: Region) -> dict:
    return {"id": str(r.id), "name": r.name, "description": r.description,
            "responsible_user_id": str(r.responsible_user_id) if r.responsible_user_id else None}


@router.get("/regions")
async def list_regions(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(select(Region).where(Region.organization_id == _org_id(request)).order_by(Region.name))).scalars().all()
    return [_region_out(r) for r in rows]


@router.post("/regions", status_code=status.HTTP_201_CREATED)
async def create_region(request: Request, payload: RegionIn, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    if (await db.execute(select(Region.id).where(Region.organization_id == org_id, func.lower(Region.name) == payload.name.lower()))).first():
        raise HTTPException(status_code=409, detail="Bu isimde bölge var")
    region = Region(organization_id=org_id, name=payload.name, description=payload.description,
                    responsible_user_id=await _staff(db, org_id, payload.responsible_user_id))
    db.add(region)
    await db.commit()
    return _region_out(region)


@router.put("/regions/{region_id}")
async def update_region(request: Request, region_id: UUID, payload: RegionIn, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    region = await _owned(db, Region, org_id, region_id, "Bölge")
    region.name, region.description = payload.name, payload.description
    region.responsible_user_id = await _staff(db, org_id, payload.responsible_user_id)
    await db.commit()
    return _region_out(region)


# --- Kumbara -------------------------------------------------------------------------

class MoneyBoxIn(BaseModel):
    code: Optional[str] = Field(default=None, max_length=32, pattern=r"^[A-Za-z0-9\-]+$")
    region_id: Optional[UUID] = None
    location_name: str = Field(min_length=2, max_length=200)
    address: Optional[str] = Field(default=None, max_length=1000)
    city: Optional[str] = Field(default=None, max_length=100)
    district: Optional[str] = Field(default=None, max_length=100)
    contact_name: Optional[str] = Field(default=None, max_length=200)
    contact_phone: Optional[str] = Field(default=None, max_length=32)
    responsible_user_id: Optional[UUID] = None
    campaign_id: Optional[UUID] = None
    status: Literal["active", "passive", "lost"] = "active"
    placed_at: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=2000)

    clean_text = field_validator("location_name", "address", "city", "district", "contact_name", "notes", mode="before")(
        lambda cls, v: _clean(v))
    empty_to_none = field_validator("code", "region_id", "responsible_user_id", "campaign_id", "placed_at", mode="before")(
        lambda cls, v: v or None)


async def _box_totals(db: AsyncSession, box_ids: list[UUID]) -> dict:
    if not box_ids:
        return {}
    rows = (await db.execute(
        select(MoneyBoxCollection.money_box_id, func.count(), func.coalesce(func.sum(MoneyBoxCollection.amount_cents), 0))
        .where(MoneyBoxCollection.money_box_id.in_(box_ids), MoneyBoxCollection.currency == "TRY")
        .group_by(MoneyBoxCollection.money_box_id)
    )).all()
    return {r[0]: (int(r[1]), int(r[2])) for r in rows}


def _box_out(b: MoneyBox, totals: tuple[int, int] = (0, 0), region_name: Optional[str] = None) -> dict:
    days = (datetime.now(timezone.utc) - b.last_collected_at).days if b.last_collected_at else None
    return {
        "id": str(b.id), "code": b.code, "region_id": str(b.region_id) if b.region_id else None, "region_name": region_name,
        "location_name": b.location_name, "address": b.address, "city": b.city, "district": b.district,
        "contact_name": b.contact_name, "contact_phone": b.contact_phone,
        "responsible_user_id": str(b.responsible_user_id) if b.responsible_user_id else None,
        "campaign_id": str(b.campaign_id) if b.campaign_id else None, "status": b.status, "placed_at": b.placed_at,
        "last_collected_at": b.last_collected_at, "days_since_collection": days, "notes": b.notes,
        "collection_count": totals[0], "total_collected_cents": totals[1],
    }


async def _apply_box(db: AsyncSession, org_id: UUID, box: MoneyBox, payload: MoneyBoxIn) -> None:
    if payload.region_id:
        await _owned(db, Region, org_id, payload.region_id, "Bölge")
    if payload.campaign_id:
        await _owned(db, Campaign, org_id, payload.campaign_id, "Bağış kalemi")
    for key in ("region_id", "location_name", "address", "city", "district", "contact_name", "contact_phone",
                "campaign_id", "status", "placed_at", "notes"):
        setattr(box, key, getattr(payload, key))
    box.responsible_user_id = await _staff(db, org_id, payload.responsible_user_id)


@router.get("/money-boxes")
async def list_money_boxes(
    request: Request,
    region_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    responsible: Optional[str] = Query(default=None, description="'me' veya personel id"),
    not_collected_days: Optional[int] = Query(default=None, ge=1, le=3650),
    q: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = select(MoneyBox, Region.name).outerjoin(Region, Region.id == MoneyBox.region_id).where(MoneyBox.organization_id == org_id)
    if region_id:
        query = query.where(MoneyBox.region_id == region_id)
    if status_filter in ("active", "passive", "lost"):
        query = query.where(MoneyBox.status == status_filter)
    if responsible == "me":
        query = query.where(MoneyBox.responsible_user_id == current_user.id)
    elif responsible:
        query = query.where(MoneyBox.responsible_user_id == UUID(responsible))
    if not_collected_days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=not_collected_days)
        query = query.where(or_(MoneyBox.last_collected_at.is_(None), MoneyBox.last_collected_at < cutoff))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(MoneyBox.code.ilike(like), MoneyBox.location_name.ilike(like), MoneyBox.address.ilike(like),
                                MoneyBox.contact_name.ilike(like), MoneyBox.district.ilike(like)))
    rows = (await db.execute(query.order_by(MoneyBox.code).limit(5000))).all()
    totals = await _box_totals(db, [b.id for b, _ in rows])
    return [_box_out(b, totals.get(b.id, (0, 0)), rn) for b, rn in rows]


@router.post("/money-boxes", status_code=status.HTTP_201_CREATED)
async def create_money_box(request: Request, payload: MoneyBoxIn, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    code = (payload.code or "").upper()
    if code:
        if (await db.execute(select(MoneyBox.id).where(MoneyBox.organization_id == org_id, MoneyBox.code == code))).first():
            raise HTTPException(status_code=409, detail="Bu kumbara kodu kullanılıyor")
    else:
        count = (await db.execute(select(func.count(MoneyBox.id)).where(MoneyBox.organization_id == org_id))).scalar_one()
        n = count + 1
        while (await db.execute(select(MoneyBox.id).where(MoneyBox.organization_id == org_id, MoneyBox.code == f"KMB-{n:04d}"))).first():
            n += 1
        code = f"KMB-{n:04d}"
    box = MoneyBox(organization_id=org_id, code=code)
    await _apply_box(db, org_id, box, payload)
    box.placed_at = payload.placed_at or date.today()
    db.add(box)
    await db.flush()
    _audit(db, org_id, current_user, "kumbara_ekle", {"money_box_id": str(box.id), "code": code})
    await db.commit()
    return _box_out(box)


@router.put("/money-boxes/{box_id}")
async def update_money_box(request: Request, box_id: UUID, payload: MoneyBoxIn, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    box = await _owned(db, MoneyBox, org_id, box_id, "Kumbara")
    await _apply_box(db, org_id, box, payload)
    _audit(db, org_id, current_user, "kumbara_guncelle", {"money_box_id": str(box.id)})
    await db.commit()
    return _box_out(box, (await _box_totals(db, [box.id])).get(box.id, (0, 0)))


class CollectionIn(BaseModel):
    idempotency_key: str = Field(min_length=16, max_length=100)
    amount_cents: int = Field(gt=0, le=100_000_000)
    currency: Literal["TRY", "USD", "EUR"] = "TRY"
    collected_on: Optional[date] = None
    campaign_id: Optional[UUID] = None
    notes: Optional[str] = Field(default=None, max_length=1000)

    clean_text = field_validator("notes", mode="before")(lambda cls, v: _clean(v))


async def _kumbara_donor(db: AsyncSession, org_id: UUID) -> Donor:
    donor = (await db.execute(
        select(Donor).where(Donor.organization_id == org_id, Donor.tags.contains([KUMBARA_DONOR_TAG]))
    )).scalars().first()
    if not donor:
        donor = Donor(organization_id=org_id, donor_type=DonorType.CORPORATE, first_name="Kumbara",
                      company_name="Kumbara Bağışları", tags=[KUMBARA_DONOR_TAG], total_donations=0,
                      total_donated_cents=0, is_anonymous=True)
        db.add(donor)
        await db.flush()
    return donor


@router.post("/money-boxes/{box_id}/collections", status_code=status.HTTP_201_CREATED)
async def collect_money_box(request: Request, box_id: UUID, payload: CollectionIn, db: AsyncSession = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    """Kumbara boşaltma: tutar sisteme bağış olarak işlenir (personel makbuz raporunda görünür)."""
    org_id = _org_id(request)
    box = await _owned(db, MoneyBox, org_id, box_id, "Kumbara", lock=True)
    key = f"kumbara:{payload.idempotency_key}"
    existing = (await db.execute(
        select(MoneyBoxCollection).join(Donation, Donation.id == MoneyBoxCollection.donation_id)
        .where(Donation.idempotency_key == key)
    )).scalar_one_or_none()
    if existing:
        return {"id": str(existing.id), "donation_id": str(existing.donation_id), "duplicate": True}
    campaign_id = payload.campaign_id or box.campaign_id
    if not campaign_id:
        raise HTTPException(status_code=422, detail="Tutarın aktarılacağı bağış kalemini seçin")
    campaign = await _owned(db, Campaign, org_id, campaign_id, "Bağış kalemi", lock=True)
    today = datetime.now(TZ).date()
    collected_on = payload.collected_on or today
    if collected_on > today:
        raise HTTPException(status_code=422, detail="Toplama tarihi ileri bir tarih olamaz")
    collected_at = datetime.combine(collected_on, time(12, 0), TZ)
    donation, _ = await record_offline_donation(
        db, organization_id=org_id, campaign=campaign, donor=await _kumbara_donor(db, org_id),
        amount_cents=payload.amount_cents, currency=payload.currency, method=PaymentMethod.CASH, paid_at=collected_at,
        issued_by_id=current_user.id, provider="money_box", idempotency_key=key,
        details={"money_box_id": str(box.id), "money_box_code": box.code}, note=f"Kumbara {box.code} — {box.location_name}",
        is_anonymous=True, send_receipt=False,
    )
    collection = MoneyBoxCollection(
        organization_id=org_id, money_box_id=box.id, collected_at=collected_at, amount_cents=payload.amount_cents,
        currency=payload.currency, collected_by_id=current_user.id, donation_id=donation.id, notes=payload.notes,
    )
    db.add(collection)
    if not box.last_collected_at or collected_at > box.last_collected_at:
        box.last_collected_at = collected_at
    _audit(db, org_id, current_user, "kumbara_topla", {
        "money_box_id": str(box.id), "amount_cents": payload.amount_cents, "donation_id": str(donation.id),
    })
    await db.commit()
    return {"id": str(collection.id), "donation_id": str(donation.id), "receipt_number": donation.receipt_number}


@router.get("/money-boxes/{box_id}/collections")
async def list_box_collections(request: Request, box_id: UUID, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    await _owned(db, MoneyBox, org_id, box_id, "Kumbara")
    rows = (await db.execute(
        select(MoneyBoxCollection, User.first_name, User.last_name, Donation.receipt_number, Donation.status)
        .outerjoin(User, User.id == MoneyBoxCollection.collected_by_id)
        .outerjoin(Donation, Donation.id == MoneyBoxCollection.donation_id)
        .where(MoneyBoxCollection.money_box_id == box_id).order_by(MoneyBoxCollection.collected_at.desc())
    )).all()
    return [
        {"id": str(c.id), "collected_at": c.collected_at, "amount_cents": c.amount_cents, "currency": c.currency,
         "collected_by": f"{f or ''} {l or ''}".strip(), "receipt_number": r,
         "cancelled": st == DonationStatus.CANCELLED, "notes": c.notes}
        for c, f, l, r, st in rows
    ]


@router.get("/money-boxes-report")
async def money_box_report(request: Request, start: Optional[date] = None, end: Optional[date] = None,
                           db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Kumbara raporu: bölge ve personel bazında toplanan tutar (yalnız TRY, iptaller hariç)."""
    org_id = _org_id(request)
    today = datetime.now(TZ).date()
    start, end = start or today.replace(month=1, day=1), end or today
    lower, upper = datetime.combine(start, time.min, TZ), datetime.combine(end + timedelta(days=1), time.min, TZ)
    base = (
        select(MoneyBoxCollection).join(MoneyBox, MoneyBox.id == MoneyBoxCollection.money_box_id)
        .join(Donation, Donation.id == MoneyBoxCollection.donation_id)
        .where(MoneyBoxCollection.organization_id == org_id, MoneyBoxCollection.currency == "TRY",
               Donation.status == DonationStatus.CONFIRMED,
               MoneyBoxCollection.collected_at >= lower, MoneyBoxCollection.collected_at < upper)
        .subquery()
    )
    by_region = (await db.execute(
        select(func.coalesce(Region.name, "Bölgesiz"), func.count(base.c.id), func.coalesce(func.sum(base.c.amount_cents), 0))
        .select_from(base).join(MoneyBox, MoneyBox.id == base.c.money_box_id).outerjoin(Region, Region.id == MoneyBox.region_id)
        .group_by(Region.name).order_by(func.sum(base.c.amount_cents).desc())
    )).all()
    by_staff = (await db.execute(
        select(User.first_name, User.last_name, func.count(base.c.id), func.coalesce(func.sum(base.c.amount_cents), 0))
        .select_from(base).outerjoin(User, User.id == base.c.collected_by_id)
        .group_by(User.first_name, User.last_name).order_by(func.sum(base.c.amount_cents).desc())
    )).all()
    counts = dict((await db.execute(
        select(MoneyBox.status, func.count()).where(MoneyBox.organization_id == org_id).group_by(MoneyBox.status)
    )).all())
    stale = (await db.execute(select(func.count()).where(
        MoneyBox.organization_id == org_id, MoneyBox.status == "active",
        or_(MoneyBox.last_collected_at.is_(None), MoneyBox.last_collected_at < datetime.now(timezone.utc) - timedelta(days=90)),
    ))).scalar_one()
    return {
        "start": start, "end": end,
        "total_cents": sum(int(r[2]) for r in by_region),
        "collections": sum(int(r[1]) for r in by_region),
        "boxes": {"active": counts.get("active", 0), "passive": counts.get("passive", 0), "lost": counts.get("lost", 0)},
        "not_collected_90_days": int(stale),
        "by_region": [{"label": r[0], "count": int(r[1]), "total_cents": int(r[2])} for r in by_region],
        "by_staff": [{"label": f"{r[0] or ''} {r[1] or ''}".strip() or "—", "count": int(r[2]), "total_cents": int(r[3])} for r in by_staff],
    }


# --- Kumanya ---------------------------------------------------------------------------

class AidPackageIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    contents: Optional[str] = Field(default=None, max_length=5000)
    unit_cost_cents: int = Field(gt=0)
    donation_campaign_id: Optional[UUID] = None
    stock: int = Field(default=0, ge=0)
    is_active: bool = True

    clean_text = field_validator("name", "contents", mode="before")(lambda cls, v: _clean(v))


async def _package_out(db: AsyncSession, p: AidPackage) -> dict:
    funded_cents = 0
    if p.donation_campaign_id:
        funded_cents = (await db.execute(
            select(func.coalesce(func.sum(Donation.amount_cents), 0)).where(
                Donation.campaign_id == p.donation_campaign_id, Donation.status == DonationStatus.CONFIRMED,
                Donation.currency == "TRY",
            )
        )).scalar_one()
    rows = dict((await db.execute(
        select(AidDistribution.status, func.coalesce(func.sum(AidDistribution.quantity), 0))
        .where(AidDistribution.package_id == p.id).group_by(AidDistribution.status)
    )).all())
    return {
        "id": str(p.id), "name": p.name, "contents": p.contents, "unit_cost_cents": p.unit_cost_cents,
        "donation_campaign_id": str(p.donation_campaign_id) if p.donation_campaign_id else None,
        "stock": p.stock, "is_active": p.is_active,
        "funded_cents": int(funded_cents), "funded_packages": int(funded_cents) // p.unit_cost_cents,
        "planned": int(rows.get("planned", 0)), "delivered": int(rows.get("delivered", 0)),
    }


@router.get("/aid-packages")
async def list_aid_packages(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(select(AidPackage).where(AidPackage.organization_id == _org_id(request)).order_by(AidPackage.name))).scalars().all()
    return [await _package_out(db, p) for p in rows]


@router.post("/aid-packages", status_code=status.HTTP_201_CREATED)
async def create_aid_package(request: Request, payload: AidPackageIn, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    if payload.donation_campaign_id:
        await _owned(db, Campaign, org_id, payload.donation_campaign_id, "Bağış kalemi")
    p = AidPackage(organization_id=org_id, **payload.model_dump())
    db.add(p)
    await db.commit()
    return await _package_out(db, p)


@router.put("/aid-packages/{package_id}")
async def update_aid_package(request: Request, package_id: UUID, payload: AidPackageIn, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    p = await _owned(db, AidPackage, org_id, package_id, "Paket")
    if payload.donation_campaign_id:
        await _owned(db, Campaign, org_id, payload.donation_campaign_id, "Bağış kalemi")
    for key, value in payload.model_dump().items():
        setattr(p, key, value)
    _audit(db, org_id, current_user, "kumanya_paket_guncelle", {"package_id": str(p.id), "stock": p.stock})
    await db.commit()
    return await _package_out(db, p)


class AidRecipientIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=32)
    national_id: Optional[str] = Field(default=None, max_length=20)
    region_id: Optional[UUID] = None
    address: Optional[str] = Field(default=None, max_length=1000)
    household_size: Optional[int] = Field(default=None, ge=1, le=50)
    needs: Optional[str] = Field(default=None, max_length=2000)
    status: Literal["active", "passive"] = "active"

    clean_text = field_validator("full_name", "address", "needs", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("region_id", "national_id", "phone", mode="before")(lambda cls, v: v or None)


def _recipient_out(r: AidRecipient, region_name: Optional[str] = None, last: Optional[datetime] = None, total: int = 0) -> dict:
    return {
        "id": str(r.id), "full_name": r.full_name, "phone": r.phone,
        "national_id_masked": f"{r.national_id[:3]}*****{r.national_id[-2:]}" if r.national_id and len(r.national_id) >= 6 else None,
        "region_id": str(r.region_id) if r.region_id else None, "region_name": region_name, "address": r.address,
        "household_size": r.household_size, "needs": r.needs, "status": r.status,
        "last_delivery_at": last, "total_received": total,
    }


@router.get("/aid-recipients")
async def list_aid_recipients(
    request: Request, region_id: Optional[UUID] = None, q: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    delivered = (
        select(AidDistribution.recipient_id, func.max(AidDistribution.delivered_at).label("last"),
               func.sum(AidDistribution.quantity).label("total"))
        .where(AidDistribution.organization_id == org_id, AidDistribution.status == "delivered")
        .group_by(AidDistribution.recipient_id).subquery()
    )
    query = (
        select(AidRecipient, Region.name, delivered.c.last, delivered.c.total)
        .outerjoin(Region, Region.id == AidRecipient.region_id)
        .outerjoin(delivered, delivered.c.recipient_id == AidRecipient.id)
        # Web başvuruları ve reddedilen haneler incelemeden önce kumanyada görünmez.
        .where(AidRecipient.organization_id == org_id, AidRecipient.review_status == "approved")
    )
    if region_id:
        query = query.where(AidRecipient.region_id == region_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(AidRecipient.full_name.ilike(like), AidRecipient.phone.ilike(like), AidRecipient.address.ilike(like)))
    rows = (await db.execute(query.order_by(AidRecipient.full_name).limit(5000))).all()
    return [_recipient_out(r, rn, last, int(total or 0)) for r, rn, last, total in rows]


@router.post("/aid-recipients", status_code=status.HTTP_201_CREATED)
async def create_aid_recipient(request: Request, payload: AidRecipientIn, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    if payload.region_id:
        await _owned(db, Region, org_id, payload.region_id, "Bölge")
    if payload.national_id and (await db.execute(select(AidRecipient.id).where(
            AidRecipient.organization_id == org_id, AidRecipient.national_id == payload.national_id))).first():
        raise HTTPException(status_code=409, detail="Bu kimlik numarasıyla kayıtlı bir hane var")
    r = AidRecipient(organization_id=org_id, **payload.model_dump())
    db.add(r)
    await db.flush()
    await rescore(db, r)
    await db.commit()
    return _recipient_out(r)


@router.put("/aid-recipients/{recipient_id}")
async def update_aid_recipient(request: Request, recipient_id: UUID, payload: AidRecipientIn, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    r = await _owned(db, AidRecipient, org_id, recipient_id, "Hane")
    if payload.region_id:
        await _owned(db, Region, org_id, payload.region_id, "Bölge")
    data = payload.model_dump()
    if not data.get("national_id"):
        data.pop("national_id")  # keep the stored id when the masked field is left blank
    for key, value in data.items():
        setattr(r, key, value)
    await rescore(db, r)
    await db.commit()
    return _recipient_out(r)


class DistributionPlan(BaseModel):
    package_id: UUID
    recipient_ids: List[UUID] = Field(min_length=1, max_length=2000)
    quantity: int = Field(default=1, ge=1, le=100)
    planned_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


@router.post("/aid-distributions", status_code=status.HTTP_201_CREATED)
async def plan_distributions(request: Request, payload: DistributionPlan, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    package = await _owned(db, AidPackage, org_id, payload.package_id, "Paket")
    recipients = (await db.execute(select(AidRecipient).where(
        AidRecipient.organization_id == org_id, AidRecipient.id.in_(payload.recipient_ids),
        AidRecipient.review_status == "approved"))).scalars().all()
    if len(recipients) != len(set(payload.recipient_ids)):
        raise HTTPException(status_code=404, detail="Seçilen hanelerden bazıları bulunamadı veya onaylı değil")
    for r in recipients:
        db.add(AidDistribution(
            organization_id=org_id, package_id=package.id, recipient_id=r.id, region_id=r.region_id,
            quantity=payload.quantity, status="planned", planned_date=payload.planned_date, notes=_clean(payload.notes),
        ))
    _audit(db, org_id, current_user, "kumanya_planla", {"package_id": str(package.id), "recipients": len(recipients)})
    await db.commit()
    return {"planned": len(recipients)}


@router.get("/aid-distributions")
async def list_distributions(
    request: Request, status_filter: Optional[str] = Query(default=None, alias="status"),
    package_id: Optional[UUID] = None, region_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = (
        select(AidDistribution, AidPackage.name, AidRecipient.full_name, AidRecipient.phone, AidRecipient.address, Region.name)
        .join(AidPackage, AidPackage.id == AidDistribution.package_id)
        .outerjoin(AidRecipient, AidRecipient.id == AidDistribution.recipient_id)
        .outerjoin(Region, Region.id == AidDistribution.region_id)
        .where(AidDistribution.organization_id == org_id)
    )
    if status_filter in ("planned", "delivered", "cancelled"):
        query = query.where(AidDistribution.status == status_filter)
    if package_id:
        query = query.where(AidDistribution.package_id == package_id)
    if region_id:
        query = query.where(AidDistribution.region_id == region_id)
    rows = (await db.execute(query.order_by(AidDistribution.created_at.desc()).limit(5000))).all()
    return [
        {"id": str(d.id), "package_id": str(d.package_id), "package_name": pn, "recipient_name": rn, "recipient_phone": rp,
         "recipient_address": ra, "region_name": reg, "quantity": d.quantity, "status": d.status,
         "planned_date": d.planned_date, "delivered_at": d.delivered_at, "notes": d.notes}
        for d, pn, rn, rp, ra, reg in rows
    ]


class DistributionUpdate(BaseModel):
    ids: List[UUID] = Field(min_length=1, max_length=2000)
    status: Literal["delivered", "cancelled", "planned"]


@router.post("/aid-distributions/status")
async def update_distributions(request: Request, payload: DistributionUpdate, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    """Toplu teslim / iptal. Teslimde paket stoğu düşer; stok yetmezse işlem yapılmaz."""
    org_id = _org_id(request)
    rows = (await db.execute(select(AidDistribution).where(
        AidDistribution.organization_id == org_id, AidDistribution.id.in_(payload.ids)).with_for_update())).scalars().all()
    if len(rows) != len(set(payload.ids)):
        raise HTTPException(status_code=404, detail="Seçilen dağıtımlardan bazıları bulunamadı")
    packages = {p.id: p for p in (await db.execute(select(AidPackage).where(
        AidPackage.id.in_({r.package_id for r in rows})).with_for_update())).scalars().all()}
    now = datetime.now(timezone.utc)
    if payload.status == "delivered":
        need: dict = {}
        for r in rows:
            if r.status != "delivered":
                need[r.package_id] = need.get(r.package_id, 0) + r.quantity
        short = [packages[pid].name for pid, qty in need.items() if packages[pid].stock < qty]
        if short:
            raise HTTPException(status_code=409, detail=f"Stok yetersiz: {', '.join(short)}")
    changed = 0
    for r in rows:
        if r.status == payload.status:
            continue
        package = packages[r.package_id]
        if payload.status == "delivered":
            package.stock -= r.quantity
            r.delivered_at, r.delivered_by_id = now, current_user.id
        elif r.status == "delivered":
            package.stock += r.quantity  # undo a delivery
            r.delivered_at, r.delivered_by_id = None, None
        r.status = payload.status
        changed += 1
    _audit(db, org_id, current_user, "kumanya_durum", {"count": changed, "status": payload.status})
    await db.commit()
    return {"updated": changed}


@router.get("/aid-report")
async def aid_report(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    packages = (await db.execute(select(AidPackage).where(AidPackage.organization_id == org_id))).scalars().all()
    by_region = (await db.execute(
        select(func.coalesce(Region.name, "Bölgesiz"), func.count(func.distinct(AidDistribution.recipient_id)),
               func.coalesce(func.sum(AidDistribution.quantity), 0))
        .select_from(AidDistribution).outerjoin(Region, Region.id == AidDistribution.region_id)
        .where(AidDistribution.organization_id == org_id, AidDistribution.status == "delivered")
        .group_by(Region.name).order_by(func.sum(AidDistribution.quantity).desc())
    )).all()
    return {
        "packages": [await _package_out(db, p) for p in packages],
        "by_region": [{"label": r[0], "households": int(r[1]), "packages": int(r[2])} for r in by_region],
    }


# --- Tasks / calendar ------------------------------------------------------------------

class TaskTemplateIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    category: Optional[str] = Field(default=None, max_length=60)
    default_duration_days: int = Field(default=1, ge=0, le=365)
    checklist: List[str] = Field(default_factory=list, max_length=50)

    clean_text = field_validator("title", "description", "category", mode="before")(lambda cls, v: _clean(v))


class TaskIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    priority: Optional[Literal["low", "normal", "high", "urgent"]] = None
    category: Optional[str] = Field(default=None, max_length=60)
    status: Optional[Literal["todo", "in_progress", "done", "cancelled"]] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    assigned_to_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    parent_task_id: Optional[UUID] = None
    template_id: Optional[UUID] = None
    donor_id: Optional[UUID] = None
    checklist: Optional[List[dict]] = Field(default=None, max_length=50)

    clean_text = field_validator("title", "description", "category", mode="before")(lambda cls, v: _clean(v))

    @field_validator("checklist")
    @classmethod
    def clean_checklist(cls, value):
        if value is None:
            return None
        return [{"text": (_clean(str(i.get("text", ""))) or "")[:200], "done": bool(i.get("done"))} for i in value if i.get("text")]


def _is_manager(user: User) -> bool:
    return has_permission(user, Permission.USER_MANAGE)


def _task_out(t: Task, names: dict, subtask_counts: dict | None = None) -> dict:
    sub = (subtask_counts or {}).get(t.id, (0, 0))
    overdue = t.status in ("todo", "in_progress") and t.due_date and t.due_date < datetime.now(TZ).date()
    return {
        "id": str(t.id), "title": t.title, "description": t.description, "priority": t.priority, "category": t.category,
        "status": t.status, "start_date": t.start_date, "due_date": t.due_date, "overdue": bool(overdue),
        "assigned_to_id": str(t.assigned_to_id) if t.assigned_to_id else None, "assigned_to_name": names.get(t.assigned_to_id),
        "department_id": str(t.department_id) if t.department_id else None,
        "parent_task_id": str(t.parent_task_id) if t.parent_task_id else None,
        "donor_id": str(t.donor_id) if t.donor_id else None, "checklist": t.checklist or [],
        "created_by_id": str(t.created_by_id), "created_by_name": names.get(t.created_by_id),
        "completed_at": t.completed_at, "created_at": t.created_at,
        "subtasks_total": sub[0], "subtasks_done": sub[1],
    }


async def _names(db: AsyncSession, org_id: UUID) -> dict:
    rows = (await db.execute(select(User.id, User.first_name, User.last_name).where(User.organization_id == org_id))).all()
    return {r[0]: f"{r[1]} {r[2]}".strip() for r in rows}


@router.get("/tasks/templates")
async def list_task_templates(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(select(TaskTemplate).where(TaskTemplate.organization_id == _org_id(request)).order_by(TaskTemplate.title))).scalars().all()
    return [{"id": str(t.id), "title": t.title, "description": t.description, "priority": t.priority, "category": t.category,
             "default_duration_days": t.default_duration_days, "checklist": t.checklist or []} for t in rows]


@router.post("/tasks/templates", status_code=status.HTTP_201_CREATED)
async def create_task_template(request: Request, payload: TaskTemplateIn, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Görev şablonlarını yalnız yöneticiler düzenleyebilir")
    org_id = _org_id(request)
    t = TaskTemplate(organization_id=org_id, **{**payload.model_dump(), "checklist": [_clean(c)[:200] for c in payload.checklist if c]})
    db.add(t)
    await db.commit()
    return {"id": str(t.id)}


@router.delete("/tasks/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_template(request: Request, template_id: UUID, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Görev şablonlarını yalnız yöneticiler düzenleyebilir")
    t = await _owned(db, TaskTemplate, _org_id(request), template_id, "Şablon")
    await db.delete(t)
    await db.commit()


@router.get("/tasks")
async def list_tasks(
    request: Request,
    scope: Literal["mine", "created", "department", "all"] = "mine",
    status_filter: Optional[str] = Query(default=None, alias="status"),
    priority: Optional[str] = None,
    assigned_to: Optional[UUID] = None,
    start: Optional[date] = Query(default=None, description="Takvim: bu tarihten itibaren bitenler"),
    end: Optional[date] = None,
    parent_task_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = select(Task).where(Task.organization_id == org_id)
    if scope == "mine":
        query = query.where(Task.assigned_to_id == current_user.id)
    elif scope == "created":
        query = query.where(Task.created_by_id == current_user.id)
    elif scope == "department":
        if not current_user.department_id:
            return []
        query = query.where(Task.department_id == current_user.department_id)
    elif not _is_manager(current_user):
        # Non-managers see what concerns them only.
        query = query.where(or_(Task.assigned_to_id == current_user.id, Task.created_by_id == current_user.id,
                                Task.department_id == current_user.department_id if current_user.department_id else False))
    if status_filter in TASK_STATUSES:
        query = query.where(Task.status == status_filter)
    elif status_filter == "open":
        query = query.where(Task.status.in_(["todo", "in_progress"]))
    if priority in PRIORITIES:
        query = query.where(Task.priority == priority)
    if assigned_to:
        query = query.where(Task.assigned_to_id == assigned_to)
    if start:
        query = query.where(func.coalesce(Task.due_date, Task.start_date) >= start)
    if end:
        query = query.where(func.coalesce(Task.start_date, Task.due_date) <= end)
    query = query.where(Task.parent_task_id == parent_task_id) if parent_task_id else query.where(Task.parent_task_id.is_(None))
    order = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    rows = (await db.execute(query.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc()).limit(2000))).scalars().all()
    rows = sorted(rows, key=lambda t: (t.status in ("done", "cancelled"), order.get(t.priority, 2)))
    sub = {}
    if rows:
        sub = {r[0]: (int(r[1]), int(r[2])) for r in (await db.execute(
            select(Task.parent_task_id, func.count(), func.count().filter(Task.status == "done"))
            .where(Task.parent_task_id.in_([t.id for t in rows])).group_by(Task.parent_task_id)
        )).all()}
    names = await _names(db, org_id)
    return [_task_out(t, names, sub) for t in rows]


def _can_edit(user: User, task: Task) -> bool:
    return _is_manager(user) or task.created_by_id == user.id or task.assigned_to_id == user.id


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(request: Request, payload: TaskIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    data = payload.model_dump(exclude_unset=True)
    if payload.template_id:
        tpl = await _owned(db, TaskTemplate, org_id, payload.template_id, "Şablon")
        start = payload.start_date or datetime.now(TZ).date()
        data = {
            "title": tpl.title, "description": tpl.description, "priority": tpl.priority, "category": tpl.category,
            "start_date": start, "due_date": start + timedelta(days=tpl.default_duration_days),
            "checklist": [{"text": c, "done": False} for c in tpl.checklist or []],
            **{k: v for k, v in data.items() if v is not None},
        }
    if not data.get("title"):
        raise HTTPException(status_code=422, detail="Görev başlığı zorunludur")
    if data.get("assigned_to_id"):
        await _staff(db, org_id, data["assigned_to_id"])
        if data["assigned_to_id"] != current_user.id and not (
            _is_manager(current_user) or has_permission(current_user, Permission.OPERATIONS_MANAGE)
        ):
            raise HTTPException(status_code=403, detail="Başka personele görev atama yetkiniz yok")
    if data.get("department_id"):
        await _owned(db, Department, org_id, data["department_id"], "Birim")
    if data.get("parent_task_id"):
        parent = await _owned(db, Task, org_id, data["parent_task_id"], "Üst görev")
        if not _can_edit(current_user, parent):
            raise HTTPException(status_code=403, detail="Bu göreve alt görev ekleyemezsiniz")
    if data.get("donor_id"):
        await _owned(db, Donor, org_id, data["donor_id"], "Bağışçı")
    task = Task(organization_id=org_id, created_by_id=current_user.id, status=data.pop("status", None) or "todo",
                priority=data.pop("priority", None) or "normal", checklist=data.pop("checklist", None) or [], **data)
    db.add(task)
    await db.flush()
    _audit(db, org_id, current_user, "gorev_olustur", {"task_id": str(task.id), "assigned_to": str(task.assigned_to_id) if task.assigned_to_id else None})
    await db.commit()
    return _task_out(task, await _names(db, org_id))


@router.put("/tasks/{task_id}")
async def update_task(request: Request, task_id: UUID, payload: TaskIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    task = await _owned(db, Task, org_id, task_id, "Görev")
    if not _can_edit(current_user, task):
        raise HTTPException(status_code=403, detail="Bu görevi düzenleme yetkiniz yok")
    data = payload.model_dump(exclude_unset=True)
    data.pop("template_id", None)
    data.pop("parent_task_id", None)
    if "assigned_to_id" in data and data["assigned_to_id"] != task.assigned_to_id:
        if data["assigned_to_id"]:
            await _staff(db, org_id, data["assigned_to_id"])
        if not (_is_manager(current_user) or task.created_by_id == current_user.id):
            raise HTTPException(status_code=403, detail="Görevi yalnız oluşturan veya yönetici yeniden atayabilir")
    if data.get("department_id"):
        await _owned(db, Department, org_id, data["department_id"], "Birim")
    for key, value in data.items():
        if key in {"title", "priority", "status"} and value is None:
            continue
        setattr(task, key, value)
    if task.status == "done" and not task.completed_at:
        task.completed_at = datetime.now(timezone.utc)
    elif task.status != "done":
        task.completed_at = None
    await db.commit()
    return _task_out(task, await _names(db, org_id))


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(request: Request, task_id: UUID, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    task = await _owned(db, Task, org_id, task_id, "Görev")
    if not (_is_manager(current_user) or task.created_by_id == current_user.id):
        raise HTTPException(status_code=403, detail="Görevi yalnız oluşturan veya yönetici silebilir")
    _audit(db, org_id, current_user, "gorev_sil", {"task_id": str(task.id), "title": task.title})
    await db.delete(task)
    await db.commit()
