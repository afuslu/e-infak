"""Sponsorluk & burs (talebe / hoca / yetim), taksitli taahhütler ve su kuyusu fonlama.

Bir taahhüt (pledge) bağışçının bir yararlanıcıya, bir su kuyusuna veya genel bir
kaleme aylık taksitlerle ödeme sözüdür. Taksitler, taahhüdün bağlı olduğu bağış
kalemine gelen onaylı bağışlarla otomatik eşleşir (bkz. services.donation_hooks);
gerekirse personel elle eşleştirir.
"""
from datetime import date, datetime, timedelta, timezone
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
from app.models.donation import Donation, DonationStatus, Donor
from app.models.sponsorship import BENEFICIARY_KINDS, PLEDGE_KINDS, Beneficiary, Pledge, PledgeInstallment, WellShare
from app.models.user import User
from app.models.water_well import WaterWell
from app.services.donation_hooks import schedule_installments
from app.utils.cms import slugify, validate_image_url
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features",
    tags=["sponsorship"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
public_router = APIRouter(tags=["sponsorship-public"])

WELL_STATUSES = ("planned", "funding", "drilling", "completed")


def _org_id(request: Request) -> UUID:
    return UUID(request.state.organization_id)


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


async def _owned(db: AsyncSession, model, org_id: UUID, item_id: UUID, label: str, lock: bool = False):
    query = select(model).where(model.id == item_id, model.organization_id == org_id)
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"{label} bulunamadı")
    return row


async def _new_campaign(db: AsyncSession, org_id: UUID, *, title: str, summary: str, category: CampaignCategory,
                        target_cents: int = 0, suggested: list[int] | None = None, allow_custom: bool = True,
                        min_cents: int = 1000) -> Campaign:
    base = slugify(title) or "bagis"
    slug = base
    for n in range(2, 200):
        if not (await db.execute(select(Campaign.id).where(Campaign.organization_id == org_id, Campaign.slug == slug))).first():
            break
        slug = f"{base}-{n}"
    campaign = Campaign(
        organization_id=org_id, slug=slug, title=title[:300], summary=summary, category=category,
        status=CampaignStatus.ACTIVE, target_cents=target_cents, collected_cents=0,
        suggested_amounts_cents=suggested or [], allow_custom_amount=allow_custom, min_donation_cents=min_cents,
        checkout_fields_schema=[], tags=[], translations={},
    )
    db.add(campaign)
    await db.flush()
    return campaign


# --- Beneficiaries ----------------------------------------------------------------

class BeneficiaryIn(BaseModel):
    kind: Literal["talebe", "hoca", "yetim", "diger"] = "talebe"
    code: Optional[str] = Field(default=None, max_length=32)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    gender: Optional[Literal["erkek", "kadin"]] = None
    birth_date: Optional[date] = None
    country: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)
    school: Optional[str] = Field(default=None, max_length=200)
    guardian_name: Optional[str] = Field(default=None, max_length=200)
    guardian_phone: Optional[str] = Field(default=None, max_length=32)
    photo_url: Optional[str] = None
    description: Optional[str] = Field(default=None, max_length=5000)
    monthly_need_cents: int = Field(default=0, ge=0)
    status: Literal["active", "passive"] = "active"

    @field_validator("code", "first_name", "last_name", "country", "city", "school", "guardian_name", "description", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) if value else value

    @field_validator("photo_url", mode="before")
    @classmethod
    def check_photo(cls, value):
        return validate_image_url(value)

    @field_validator("gender", mode="before")
    @classmethod
    def empty_gender(cls, value):
        return value or None


def _beneficiary_out(b: Beneficiary, active_pledges: int = 0, sponsors: list[str] | None = None) -> dict:
    return {
        "id": str(b.id), "kind": b.kind, "kind_label": BENEFICIARY_KINDS.get(b.kind, b.kind), "code": b.code,
        "first_name": b.first_name, "last_name": b.last_name, "full_name": b.full_name, "gender": b.gender,
        "birth_date": b.birth_date, "country": b.country, "city": b.city, "school": b.school,
        "guardian_name": b.guardian_name, "guardian_phone": b.guardian_phone, "photo_url": b.photo_url,
        "description": b.description, "monthly_need_cents": b.monthly_need_cents, "status": b.status,
        "active_pledges": active_pledges, "sponsors": sponsors or [],
        "is_legacy_student": bool(b.student_id), "is_legacy_orphan": bool(b.orphan_id),
    }


@router.get("/beneficiaries")
async def list_beneficiaries(
    request: Request,
    kind: Optional[str] = None,
    sponsored: Optional[bool] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    q: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = select(Beneficiary).where(Beneficiary.organization_id == org_id)
    if kind in BENEFICIARY_KINDS:
        query = query.where(Beneficiary.kind == kind)
    if status_filter in ("active", "passive"):
        query = query.where(Beneficiary.status == status_filter)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Beneficiary.first_name.ilike(like), Beneficiary.last_name.ilike(like),
                                Beneficiary.code.ilike(like), Beneficiary.city.ilike(like), Beneficiary.school.ilike(like)))
    rows = (await db.execute(query.order_by(Beneficiary.first_name).limit(2000))).scalars().all()
    pledge_rows = (await db.execute(
        select(Pledge.beneficiary_id, Donor.first_name, Donor.last_name)
        .join(Donor, Donor.id == Pledge.donor_id)
        .where(Pledge.organization_id == org_id, Pledge.status == "active", Pledge.beneficiary_id.is_not(None))
    )).all()
    sponsors: dict = {}
    for bid, first, last in pledge_rows:
        sponsors.setdefault(bid, []).append(f"{first} {last or ''}".strip())
    result = [_beneficiary_out(b, len(sponsors.get(b.id, [])), sponsors.get(b.id)) for b in rows]
    if sponsored is True:
        result = [r for r in result if r["active_pledges"]]
    elif sponsored is False:
        result = [r for r in result if not r["active_pledges"]]
    return result


@router.post("/beneficiaries", status_code=status.HTTP_201_CREATED)
async def create_beneficiary(request: Request, payload: BeneficiaryIn, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    b = Beneficiary(organization_id=org_id, **payload.model_dump())
    db.add(b)
    await db.flush()
    _audit(db, org_id, current_user, "yararlanici_ekle", {"beneficiary_id": str(b.id), "kind": b.kind})
    await db.commit()
    return _beneficiary_out(b)


@router.put("/beneficiaries/{beneficiary_id}")
async def update_beneficiary(request: Request, beneficiary_id: UUID, payload: BeneficiaryIn,
                             db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    b = await _owned(db, Beneficiary, org_id, beneficiary_id, "Kayıt")
    for key, value in payload.model_dump().items():
        setattr(b, key, value)
    _audit(db, org_id, current_user, "yararlanici_guncelle", {"beneficiary_id": str(b.id)})
    await db.commit()
    return _beneficiary_out(b)


# --- Pledges ----------------------------------------------------------------------

class PledgeIn(BaseModel):
    kind: Literal["sponsorship", "water_well", "general"] = "sponsorship"
    donor_id: UUID
    beneficiary_id: Optional[UUID] = None
    water_well_id: Optional[UUID] = None
    campaign_id: Optional[UUID] = None
    title: Optional[str] = Field(default=None, max_length=300)
    installment_amount_cents: int = Field(gt=0)
    currency: Literal["TRY", "USD", "EUR"] = "TRY"
    installment_count: int = Field(ge=1, le=120)
    start_date: date
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("title", "notes", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) if value else value

    @model_validator(mode="after")
    def target_matches_kind(self):
        if self.kind == "sponsorship" and not self.beneficiary_id:
            raise ValueError("Sponsorluk için yararlanıcı seçilmelidir")
        if self.kind == "water_well" and not self.water_well_id:
            raise ValueError("Su kuyusu taahhüdü için kuyu seçilmelidir")
        return self


def _installment_status(i: PledgeInstallment, today: date) -> str:
    if i.status == "pending" and i.due_date < today:
        return "overdue"
    return i.status


def _pledge_out(p: Pledge, today: date, include_installments: bool = False) -> dict:
    installments = list(p.installments)
    paid = [i for i in installments if i.status == "paid"]
    overdue = [i for i in installments if _installment_status(i, today) == "overdue"]
    next_due = next((i for i in installments if i.status == "pending"), None)
    data = {
        "id": str(p.id), "kind": p.kind, "kind_label": PLEDGE_KINDS.get(p.kind, p.kind),
        "title": p.title or (p.beneficiary.full_name if p.beneficiary else None),
        "donor_id": str(p.donor_id), "donor_name": p.donor.full_name if p.donor else None,
        "donor_phone": p.donor.phone if p.donor else None,
        "beneficiary_id": str(p.beneficiary_id) if p.beneficiary_id else None,
        "beneficiary_name": p.beneficiary.full_name if p.beneficiary else None,
        "water_well_id": str(p.water_well_id) if p.water_well_id else None,
        "campaign_id": str(p.campaign_id), "campaign_title": p.campaign.title if p.campaign else None,
        "installment_amount_cents": p.installment_amount_cents, "currency": p.currency,
        "installment_count": p.installment_count, "start_date": p.start_date, "status": p.status,
        "paid_count": len(paid), "paid_cents": sum(i.amount_cents for i in paid),
        "overdue_count": len(overdue), "overdue_cents": sum(i.amount_cents for i in overdue),
        "next_due_date": next_due.due_date if next_due else None, "notes": p.notes,
    }
    if include_installments:
        data["installments"] = [
            {"id": str(i.id), "seq": i.seq, "due_date": i.due_date, "amount_cents": i.amount_cents,
             "status": _installment_status(i, today), "donation_id": str(i.donation_id) if i.donation_id else None,
             "paid_at": i.paid_at}
            for i in installments
        ]
    return data


def _pledge_query(org_id: UUID):
    return select(Pledge).options(
        selectinload(Pledge.installments), selectinload(Pledge.donor),
        selectinload(Pledge.beneficiary), selectinload(Pledge.campaign),
    ).where(Pledge.organization_id == org_id)


@router.get("/pledges")
async def list_pledges(
    request: Request,
    kind: Optional[str] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    donor_id: Optional[UUID] = None,
    beneficiary_id: Optional[UUID] = None,
    water_well_id: Optional[UUID] = None,
    overdue: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = _pledge_query(org_id)
    if kind in PLEDGE_KINDS:
        query = query.where(Pledge.kind == kind)
    if status_filter in ("active", "completed", "cancelled"):
        query = query.where(Pledge.status == status_filter)
    if donor_id:
        query = query.where(Pledge.donor_id == donor_id)
    if beneficiary_id:
        query = query.where(Pledge.beneficiary_id == beneficiary_id)
    if water_well_id:
        query = query.where(Pledge.water_well_id == water_well_id)
    today = date.today()
    if overdue:
        query = query.where(Pledge.id.in_(
            select(PledgeInstallment.pledge_id).where(PledgeInstallment.status == "pending", PledgeInstallment.due_date < today)
        ))
    rows = (await db.execute(query.order_by(Pledge.created_at.desc()).limit(2000))).scalars().all()
    return [_pledge_out(p, today) for p in rows]


@router.get("/pledges/summary")
async def pledge_summary(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Sponsorluk / taksit raporu: bu ay beklenen ve tahsil edilen, gecikmiş taksitler."""
    org_id = _org_id(request)
    today = date.today()
    month_start = today.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)
    async def agg(*conditions):
        row = (await db.execute(
            select(func.count(PledgeInstallment.id), func.coalesce(func.sum(PledgeInstallment.amount_cents), 0))
            .join(Pledge).where(Pledge.organization_id == org_id, Pledge.status != "cancelled", *conditions)
        )).one()
        return {"count": int(row[0]), "amount_cents": int(row[1])}

    by_kind = (await db.execute(
        select(Pledge.kind, func.count(Pledge.id)).where(Pledge.organization_id == org_id, Pledge.status == "active")
        .group_by(Pledge.kind)
    )).all()
    return {
        "active_pledges": sum(n for _, n in by_kind),
        "by_kind": [{"kind": k, "label": PLEDGE_KINDS.get(k, k), "count": n} for k, n in by_kind],
        "due_this_month": await agg(PledgeInstallment.due_date >= month_start, PledgeInstallment.due_date < next_month),
        "paid_this_month": await agg(PledgeInstallment.due_date >= month_start, PledgeInstallment.due_date < next_month,
                                     PledgeInstallment.status == "paid"),
        "overdue": await agg(PledgeInstallment.status == "pending", PledgeInstallment.due_date < today),
        "sponsored_beneficiaries": (await db.execute(
            select(func.count(func.distinct(Pledge.beneficiary_id)))
            .where(Pledge.organization_id == org_id, Pledge.status == "active", Pledge.beneficiary_id.is_not(None))
        )).scalar_one(),
        "waiting_beneficiaries": (await db.execute(
            select(func.count(Beneficiary.id)).where(
                Beneficiary.organization_id == org_id, Beneficiary.status == "active",
                Beneficiary.id.notin_(select(Pledge.beneficiary_id).where(
                    Pledge.organization_id == org_id, Pledge.status == "active", Pledge.beneficiary_id.is_not(None))),
            )
        )).scalar_one(),
    }


@router.get("/pledges/{pledge_id}")
async def get_pledge(request: Request, pledge_id: UUID, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    p = (await db.execute(_pledge_query(org_id).where(Pledge.id == pledge_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Taahhüt bulunamadı")
    return _pledge_out(p, date.today(), include_installments=True)


@router.post("/pledges", status_code=status.HTTP_201_CREATED)
async def create_pledge(request: Request, payload: PledgeIn, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    donor = await _owned(db, Donor, org_id, payload.donor_id, "Bağışçı")
    beneficiary = await _owned(db, Beneficiary, org_id, payload.beneficiary_id, "Yararlanıcı") if payload.beneficiary_id else None
    well = await _owned(db, WaterWell, org_id, payload.water_well_id, "Su kuyusu") if payload.water_well_id else None
    campaign_id = payload.campaign_id or (well.donation_campaign_id if well else None)
    if not campaign_id:
        raise HTTPException(status_code=422, detail="Taksitlerin tahsil edileceği bağış kalemi seçilmelidir")
    await _owned(db, Campaign, org_id, campaign_id, "Bağış kalemi")
    pledge = Pledge(
        organization_id=org_id, kind=payload.kind, donor_id=donor.id,
        beneficiary_id=beneficiary.id if beneficiary else None, water_well_id=well.id if well else None,
        campaign_id=campaign_id, title=payload.title or (beneficiary.full_name if beneficiary else well.name if well else None),
        installment_amount_cents=payload.installment_amount_cents, currency=payload.currency,
        installment_count=payload.installment_count, start_date=payload.start_date, notes=payload.notes,
        status="active", created_by_id=current_user.id,
    )
    pledge.installments = schedule_installments(pledge)
    db.add(pledge)
    await db.flush()
    _audit(db, org_id, current_user, "taahhut_olustur", {
        "pledge_id": str(pledge.id), "kind": pledge.kind, "donor_id": str(donor.id),
        "installments": pledge.installment_count, "amount_cents": pledge.installment_amount_cents,
    })
    await db.commit()
    return await get_pledge(request, pledge.id, db, current_user)


class PledgeStatusIn(BaseModel):
    status: Literal["active", "cancelled"]
    notes: Optional[str] = Field(default=None, max_length=2000)


@router.put("/pledges/{pledge_id}/status")
async def update_pledge_status(request: Request, pledge_id: UUID, payload: PledgeStatusIn, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    """İptalde ödenmemiş taksitler iptal edilir; ödenmişler korunur."""
    org_id = _org_id(request)
    p = (await db.execute(_pledge_query(org_id).where(Pledge.id == pledge_id).with_for_update())).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Taahhüt bulunamadı")
    if payload.status == "cancelled":
        for i in p.installments:
            if i.status == "pending":
                i.status = "cancelled"
    elif p.status == "cancelled":
        for i in p.installments:
            if i.status == "cancelled":
                i.status = "pending"
    p.status = payload.status if any(i.status == "pending" for i in p.installments) or payload.status == "cancelled" else "completed"
    if payload.notes is not None:
        p.notes = sanitize_public_text(payload.notes)
    _audit(db, org_id, current_user, "taahhut_durum", {"pledge_id": str(p.id), "status": p.status})
    await db.commit()
    return _pledge_out(p, date.today(), include_installments=True)


class InstallmentMatch(BaseModel):
    donation_id: UUID


@router.post("/pledges/installments/{installment_id}/match")
async def match_installment(request: Request, installment_id: UUID, payload: InstallmentMatch,
                            db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Bir taksiti var olan bir bağışla elle eşleştirir."""
    org_id = _org_id(request)
    installment = (await db.execute(
        select(PledgeInstallment).options(selectinload(PledgeInstallment.pledge))
        .join(Pledge).where(PledgeInstallment.id == installment_id, Pledge.organization_id == org_id)
        .with_for_update(of=PledgeInstallment)
    )).scalar_one_or_none()
    if not installment:
        raise HTTPException(status_code=404, detail="Taksit bulunamadı")
    if installment.status != "pending":
        raise HTTPException(status_code=409, detail="Taksit zaten ödenmiş veya iptal edilmiş")
    donation = await _owned(db, Donation, org_id, payload.donation_id, "Bağış")
    if donation.status != DonationStatus.CONFIRMED:
        raise HTTPException(status_code=409, detail="Yalnız onaylı bağış eşleştirilebilir")
    if donation.donor_id != installment.pledge.donor_id:
        raise HTTPException(status_code=409, detail="Bağış, taahhüt sahibi bağışçıya ait değil")
    used = (await db.execute(
        select(func.coalesce(func.sum(PledgeInstallment.amount_cents), 0)).where(PledgeInstallment.donation_id == donation.id)
    )).scalar_one()
    if used + installment.amount_cents > donation.amount_cents:
        raise HTTPException(status_code=409, detail="Bağışın kalan tutarı bu taksiti karşılamıyor")
    installment.status, installment.donation_id, installment.paid_at = "paid", donation.id, datetime.now(timezone.utc)
    pledge = installment.pledge
    await db.flush()
    remaining = (await db.execute(
        select(func.count()).where(PledgeInstallment.pledge_id == pledge.id, PledgeInstallment.status == "pending")
    )).scalar_one()
    if remaining == 0:
        pledge.status = "completed"
    _audit(db, org_id, current_user, "taksit_eslestir", {"installment_id": str(installment.id), "donation_id": str(donation.id)})
    await db.commit()
    return {"status": "paid", "pledge_status": pledge.status}


# --- Water wells ---------------------------------------------------------------------

class WaterWellIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    location_name: str = Field(min_length=2, max_length=300)
    country: Optional[str] = Field(default=None, max_length=100)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    status: Literal["planned", "funding", "drilling", "completed"] = "funding"
    description: Optional[str] = Field(default=None, max_length=5000)
    funding_model: Literal["standard", "fonlama", "hisseli"] = "fonlama"
    target_cents: int = Field(default=0, ge=0)
    share_count: Optional[int] = Field(default=None, ge=1, le=10_000)
    share_price_cents: Optional[int] = Field(default=None, gt=0)
    donor_id: Optional[UUID] = None
    gallery_urls: List[str] = Field(default_factory=list, max_length=30)
    donation_campaign_id: Optional[UUID] = None
    create_donation_campaign: bool = False

    @field_validator("name", "location_name", "country", "description", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) if value else value

    @field_validator("gallery_urls")
    @classmethod
    def check_gallery(cls, value: List[str]) -> List[str]:
        return [u for u in (validate_image_url(v) for v in value) if u]

    @model_validator(mode="after")
    def shares(self):
        if self.funding_model == "hisseli":
            if not self.share_count or not self.share_price_cents:
                raise ValueError("Hisseli kuyu için hisse sayısı ve hisse bedeli zorunludur")
            self.target_cents = self.share_count * self.share_price_cents
        if self.funding_model == "fonlama" and not self.target_cents:
            raise ValueError("Fonlama modelinde hedef tutar zorunludur")
        return self


async def _well_out(db: AsyncSession, w: WaterWell) -> dict:
    sold = (await db.execute(
        select(func.coalesce(func.sum(WellShare.share_count), 0)).where(WellShare.water_well_id == w.id)
    )).scalar_one()
    pledges = (await db.execute(
        select(func.count(Pledge.id)).where(Pledge.water_well_id == w.id, Pledge.status == "active")
    )).scalar_one()
    slug = None
    if w.donation_campaign_id:
        slug = (await db.execute(select(Campaign.slug).where(Campaign.id == w.donation_campaign_id))).scalar_one_or_none()
    return {
        "id": str(w.id), "name": w.name, "location_name": w.location_name, "country": w.country,
        "latitude": w.latitude, "longitude": w.longitude, "status": w.status, "description": w.description,
        "funding_model": w.funding_model, "target_cents": w.target_cents, "collected_cents": w.collected_cents,
        "progress_pct": round(min(100, w.collected_cents * 100 / w.target_cents), 1) if w.target_cents else None,
        "share_count": w.share_count, "share_price_cents": w.share_price_cents, "shares_sold": int(sold),
        "shares_left": max(0, (w.share_count or 0) - int(sold)) if w.share_count else None,
        "active_pledges": int(pledges), "donor_id": str(w.donor_id) if w.donor_id else None,
        "gallery_urls": w.gallery_urls or [],
        "donation_campaign_id": str(w.donation_campaign_id) if w.donation_campaign_id else None,
        "donation_campaign_slug": slug, "created_at": w.created_at,
    }


async def _apply_well(db: AsyncSession, org_id: UUID, w: WaterWell, payload: WaterWellIn) -> None:
    for key in ("name", "location_name", "country", "latitude", "longitude", "status", "description",
                "funding_model", "target_cents", "share_count", "share_price_cents", "gallery_urls"):
        setattr(w, key, getattr(payload, key))
    if payload.donor_id:
        await _owned(db, Donor, org_id, payload.donor_id, "Bağışçı")
    w.donor_id = payload.donor_id
    if payload.donation_campaign_id:
        await _owned(db, Campaign, org_id, payload.donation_campaign_id, "Bağış kalemi")
        clash = (await db.execute(select(WaterWell.id).where(
            WaterWell.donation_campaign_id == payload.donation_campaign_id, WaterWell.id != w.id))).first()
        if clash:
            raise HTTPException(status_code=409, detail="Bu bağış kalemi başka bir kuyuya bağlı")
        w.donation_campaign_id = payload.donation_campaign_id
    elif payload.create_donation_campaign and not w.donation_campaign_id:
        price = payload.share_price_cents
        campaign = await _new_campaign(
            db, org_id, title=f"{payload.name} — Su Kuyusu", category=CampaignCategory.SU,
            summary=payload.description or f"{payload.location_name} su kuyusu",
            target_cents=payload.target_cents,
            suggested=[price, price * 2, price * 5] if price else [50_000, 100_000, 250_000],
            allow_custom=payload.funding_model != "hisseli", min_cents=price or 1000,
        )
        w.donation_campaign_id = campaign.id


@router.get("/water-wells")
async def list_water_wells(
    request: Request,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    country: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = select(WaterWell).where(WaterWell.organization_id == org_id)
    if status_filter in WELL_STATUSES:
        query = query.where(WaterWell.status == status_filter)
    if country:
        query = query.where(WaterWell.country == country)
    wells = (await db.execute(query.order_by(WaterWell.created_at.desc()))).scalars().all()
    return [await _well_out(db, w) for w in wells]


@router.post("/water-wells", status_code=status.HTTP_201_CREATED)
async def create_water_well(request: Request, payload: WaterWellIn, db: AsyncSession = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    w = WaterWell(organization_id=org_id, collected_cents=0)
    await _apply_well(db, org_id, w, payload)
    db.add(w)
    await db.flush()
    _audit(db, org_id, current_user, "su_kuyusu_ekle", {"well_id": str(w.id), "well_name": w.name})
    await db.commit()
    return await _well_out(db, w)


@router.put("/water-wells/{well_id}")
async def update_water_well(request: Request, well_id: UUID, payload: WaterWellIn, db: AsyncSession = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    w = await _owned(db, WaterWell, org_id, well_id, "Su kuyusu", lock=True)
    if payload.funding_model == "hisseli" and payload.share_count:
        sold = (await db.execute(
            select(func.coalesce(func.sum(WellShare.share_count), 0)).where(WellShare.water_well_id == w.id)
        )).scalar_one()
        if payload.share_count < sold:
            raise HTTPException(status_code=409, detail=f"{sold} hisse satılmış; hisse sayısı bunun altına düşürülemez")
    await _apply_well(db, org_id, w, payload)
    _audit(db, org_id, current_user, "su_kuyusu_guncelle", {"well_id": str(w.id)})
    await db.commit()
    return await _well_out(db, w)


@router.get("/water-wells/{well_id}/shares")
async def list_well_shares(request: Request, well_id: UUID, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    await _owned(db, WaterWell, org_id, well_id, "Su kuyusu")
    rows = (await db.execute(
        select(WellShare, Donor.first_name, Donor.last_name, Donation.receipt_number)
        .outerjoin(Donor, Donor.id == WellShare.donor_id)
        .outerjoin(Donation, Donation.id == WellShare.donation_id)
        .where(WellShare.water_well_id == well_id).order_by(WellShare.created_at)
    )).all()
    return [
        {"id": str(s.id), "share_count": s.share_count, "donor_name": f"{f or ''} {l or ''}".strip(),
         "on_behalf_of": s.on_behalf_of, "receipt_number": r, "created_at": s.created_at}
        for s, f, l, r in rows
    ]


# Public: wells that accept donations or are finished, for the website
@public_router.get("/public/water-wells")
async def public_wells(request: Request, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(WaterWell).where(
        WaterWell.organization_id == request.state.organization_id,
        WaterWell.status.in_(["funding", "drilling", "completed"]),
    ).order_by(WaterWell.created_at.desc()).limit(200))).scalars().all()
    result = []
    for w in rows:
        data = await _well_out(db, w)
        data.pop("donor_id", None)
        data.pop("active_pledges", None)
        result.append(data)
    return result
