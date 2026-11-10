"""Yoksul takibi: hane kartı, aile bireyleri, puanlama, başvuru/inceleme, toplu yardım ve adalet raporları.

Hane kaydı kumanya modülüyle ortaktır (aid_recipients); kumanya yalnızca onaylı haneleri görür.
"""
from datetime import date, datetime, timedelta, timezone
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission, require_feature
from app.core.db import get_db
from app.core.plans import Feature
from app.core.rate_limit import rate_limit
from app.models.audit_log import AuditLog
from app.models.field_ops import AidDistribution, AidPackage, AidRecipient, HouseholdMember, Region
from app.models.organization_settings import OrganizationSettings
from app.models.user import User
from app.services.poverty import (
    DEFAULT_POVERTY_LINE_CENTS, DEGREES, HEATING, HOUSING, POVERTY_REASONS, RELATIONS, REVIEW_STATUSES,
    household_degree, poverty_line, poverty_score, rescore,
)
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features",
    tags=["poverty"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
public_router = APIRouter(prefix="/public", tags=["poverty-public"])

HELP_REQUEST_CONSENT_VERSION = "2026-11"
Degree = Literal["critical", "high", "medium", "low"]


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


def _clean(value):
    return sanitize_public_text(value) if value else value


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


def _degree_expr():
    score = AidRecipient.poverty_score
    return case(
        (AidRecipient.degree_override.isnot(None), AidRecipient.degree_override),
        (score >= 70, "critical"), (score >= 50, "high"), (score >= 30, "medium"),
        else_="low",
    )


async def _household(db: AsyncSession, org_id: UUID, household_id: UUID, lock: bool = False) -> AidRecipient:
    query = select(AidRecipient).where(AidRecipient.id == household_id, AidRecipient.organization_id == org_id)
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Hane bulunamadı")
    return row


def _mask(national_id: Optional[str]) -> Optional[str]:
    return f"{national_id[:3]}*****{national_id[-2:]}" if national_id and len(national_id) >= 6 else None


def _household_out(h: AidRecipient, region_name: Optional[str] = None, last: Optional[datetime] = None,
                   received: int = 0, member_count: Optional[int] = None) -> dict:
    degree = household_degree(h)
    return {
        "id": str(h.id), "full_name": h.full_name, "phone": h.phone, "national_id_masked": _mask(h.national_id),
        "region_id": str(h.region_id) if h.region_id else None, "region_name": region_name,
        "city": h.city, "district": h.district, "neighborhood": h.neighborhood, "street": h.street, "address": h.address,
        "latitude": h.latitude, "longitude": h.longitude,
        "household_size": h.household_size, "member_count": member_count,
        "housing_status": h.housing_status, "heating_type": h.heating_type,
        "rent_cents": h.rent_cents, "monthly_income_cents": h.monthly_income_cents,
        "monthly_expense_cents": h.monthly_expense_cents, "debt_cents": h.debt_cents,
        "poverty_reasons": h.poverty_reasons or [], "needs": h.needs,
        "poverty_score": h.poverty_score or 0, "degree": degree, "degree_label": DEGREES[degree],
        "degree_override": h.degree_override,
        "review_status": h.review_status, "review_label": REVIEW_STATUSES.get(h.review_status, h.review_status),
        "source": h.source, "status": h.status,
        "inspected_at": h.inspected_at, "inspection_note": h.inspection_note,
        "last_delivery_at": last, "total_received": received, "created_at": h.created_at,
    }


def _member_out(m: HouseholdMember) -> dict:
    return {
        "id": str(m.id), "full_name": m.full_name, "relation": m.relation, "relation_label": RELATIONS.get(m.relation, m.relation),
        "gender": m.gender, "birth_date": m.birth_date, "is_disabled": m.is_disabled,
        "has_chronic_illness": m.has_chronic_illness, "is_student": m.is_student, "school": m.school,
        "is_working": m.is_working, "monthly_income_cents": m.monthly_income_cents,
        "clothing_size": m.clothing_size, "shoe_size": m.shoe_size, "notes": m.notes,
    }


def _delivered_subquery(org_id: UUID, since: Optional[datetime] = None):
    query = (
        select(AidDistribution.recipient_id, func.max(AidDistribution.delivered_at).label("last"),
               func.coalesce(func.sum(AidDistribution.quantity), 0).label("total"))
        .where(AidDistribution.organization_id == org_id, AidDistribution.status == "delivered")
    )
    if since:
        query = query.where(AidDistribution.delivered_at >= since)
    return query.group_by(AidDistribution.recipient_id).subquery()


# --- Lookups & settings ------------------------------------------------------------------

@router.get("/households-meta")
async def household_meta(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {
        "reasons": POVERTY_REASONS, "housing": HOUSING, "heating": HEATING, "relations": RELATIONS,
        "degrees": DEGREES, "review_statuses": REVIEW_STATUSES,
        "poverty_line_cents": await poverty_line(db, _org_id(request)),
        "default_poverty_line_cents": DEFAULT_POVERTY_LINE_CENTS,
    }


class PovertySettingsIn(BaseModel):
    poverty_line_cents: Optional[int] = Field(default=None, ge=10_000, le=100_000_000)


@router.put("/households-settings")
async def update_poverty_settings(request: Request, payload: PovertySettingsIn, db: AsyncSession = Depends(get_db),
                                  current_user: User = Depends(get_current_user)):
    """Eşiği değiştirir ve tüm hanelerin puanını yeniden hesaplar."""
    org_id = _org_id(request)
    settings_row = (await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.organization_id == org_id)
    )).scalars().first()
    if not settings_row:
        settings_row = OrganizationSettings(organization_id=org_id)
        db.add(settings_row)
    settings_row.poverty_line_cents = payload.poverty_line_cents
    await db.flush()
    households = (await db.execute(
        select(AidRecipient).where(AidRecipient.organization_id == org_id).options(selectinload(AidRecipient.members))
    )).scalars().all()
    line = payload.poverty_line_cents or DEFAULT_POVERTY_LINE_CENTS
    for h in households:
        h.poverty_score = poverty_score(h, h.members, line)
    _audit(db, org_id, current_user, "yoksulluk_esigi", {"poverty_line_cents": payload.poverty_line_cents, "rescored": len(households)})
    await db.commit()
    return {"poverty_line_cents": line, "rescored": len(households)}


# --- Households --------------------------------------------------------------------------

class MemberIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    relation: Literal["self", "spouse", "child", "parent", "sibling", "other"] = "other"
    gender: Optional[Literal["male", "female"]] = None
    birth_date: Optional[date] = None
    is_disabled: bool = False
    has_chronic_illness: bool = False
    is_student: bool = False
    school: Optional[str] = Field(default=None, max_length=200)
    is_working: bool = False
    monthly_income_cents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    clothing_size: Optional[str] = Field(default=None, max_length=10)
    shoe_size: Optional[str] = Field(default=None, max_length=10)
    notes: Optional[str] = Field(default=None, max_length=2000)

    clean_text = field_validator("full_name", "school", "clothing_size", "shoe_size", "notes", mode="before")(
        lambda cls, v: _clean(v))
    empty_to_none = field_validator("gender", "birth_date", mode="before")(lambda cls, v: v or None)


class HouseholdIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=32)
    national_id: Optional[str] = Field(default=None, max_length=20)
    region_id: Optional[UUID] = None
    city: Optional[str] = Field(default=None, max_length=100)
    district: Optional[str] = Field(default=None, max_length=100)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    street: Optional[str] = Field(default=None, max_length=160)
    address: Optional[str] = Field(default=None, max_length=1000)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    household_size: Optional[int] = Field(default=None, ge=1, le=50)
    housing_status: Optional[Literal["owner", "rent", "relative", "free", "other"]] = None
    heating_type: Optional[Literal["natural_gas", "stove", "electric", "none", "other"]] = None
    rent_cents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    monthly_income_cents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    monthly_expense_cents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    debt_cents: Optional[int] = Field(default=None, ge=0, le=10_000_000_000)
    poverty_reasons: List[str] = Field(default_factory=list, max_length=len(POVERTY_REASONS))
    degree_override: Optional[Degree] = None
    needs: Optional[str] = Field(default=None, max_length=2000)
    status: Literal["active", "passive"] = "active"

    clean_text = field_validator("full_name", "city", "district", "neighborhood", "street", "address", "needs", mode="before")(
        lambda cls, v: _clean(v))
    empty_to_none = field_validator(
        "region_id", "national_id", "phone", "housing_status", "heating_type", "degree_override", mode="before",
    )(lambda cls, v: v or None)

    @field_validator("poverty_reasons")
    @classmethod
    def known_reasons(cls, value: List[str]) -> List[str]:
        return sorted({r for r in value if r in POVERTY_REASONS})


class HouseholdCreate(HouseholdIn):
    members: List[MemberIn] = Field(default_factory=list, max_length=50)


async def _check_unique_national_id(db: AsyncSession, org_id: UUID, national_id: Optional[str], exclude: Optional[UUID] = None):
    if not national_id:
        return
    query = select(AidRecipient.id).where(AidRecipient.organization_id == org_id, AidRecipient.national_id == national_id)
    if exclude:
        query = query.where(AidRecipient.id != exclude)
    if (await db.execute(query)).first():
        raise HTTPException(status_code=409, detail="Bu kimlik numarasıyla kayıtlı bir hane var")


async def _check_region(db: AsyncSession, org_id: UUID, region_id: Optional[UUID]) -> None:
    if region_id and not (await db.execute(
            select(Region.id).where(Region.id == region_id, Region.organization_id == org_id))).first():
        raise HTTPException(status_code=404, detail="Bölge bulunamadı")


@router.get("/households")
async def list_households(
    request: Request,
    review: Optional[Literal["applied", "inspecting", "approved", "rejected", "open"]] = None,
    degree: Optional[Degree] = None,
    region_id: Optional[UUID] = None,
    city: Optional[str] = Query(default=None, max_length=100),
    district: Optional[str] = Query(default=None, max_length=100),
    neighborhood: Optional[str] = Query(default=None, max_length=120),
    min_score: Optional[int] = Query(default=None, ge=0, le=100),
    not_helped_days: Optional[int] = Query(default=None, ge=1, le=3650),
    q: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    delivered = _delivered_subquery(org_id)
    members = (
        select(HouseholdMember.recipient_id, func.count(HouseholdMember.id).label("n"))
        .where(HouseholdMember.organization_id == org_id).group_by(HouseholdMember.recipient_id).subquery()
    )
    query = (
        select(AidRecipient, Region.name, delivered.c.last, delivered.c.total, members.c.n)
        .outerjoin(Region, Region.id == AidRecipient.region_id)
        .outerjoin(delivered, delivered.c.recipient_id == AidRecipient.id)
        .outerjoin(members, members.c.recipient_id == AidRecipient.id)
        .where(AidRecipient.organization_id == org_id)
    )
    if review == "open":
        query = query.where(AidRecipient.review_status.in_(("applied", "inspecting")))
    elif review:
        query = query.where(AidRecipient.review_status == review)
    if degree:
        query = query.where(_degree_expr() == degree)
    if region_id:
        query = query.where(AidRecipient.region_id == region_id)
    for column, value in ((AidRecipient.city, city), (AidRecipient.district, district), (AidRecipient.neighborhood, neighborhood)):
        if value:
            query = query.where(func.lower(column) == value.strip().lower())
    if min_score is not None:
        query = query.where(AidRecipient.poverty_score >= min_score)
    if not_helped_days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=not_helped_days)
        query = query.where(or_(delivered.c.last.is_(None), delivered.c.last < cutoff))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(AidRecipient.full_name.ilike(like), AidRecipient.phone.ilike(like),
                                AidRecipient.address.ilike(like), AidRecipient.street.ilike(like)))
    rows = (await db.execute(
        query.order_by(AidRecipient.poverty_score.desc(), AidRecipient.full_name).limit(5000)
    )).all()
    return [_household_out(h, rn, last, int(total or 0), int(n or 0)) for h, rn, last, total, n in rows]


@router.post("/households", status_code=status.HTTP_201_CREATED)
async def create_household(request: Request, payload: HouseholdCreate, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    await _check_region(db, org_id, payload.region_id)
    await _check_unique_national_id(db, org_id, payload.national_id)
    h = AidRecipient(organization_id=org_id, review_status="approved", source="admin",
                     **payload.model_dump(exclude={"members"}))
    db.add(h)
    await db.flush()
    for m in payload.members:
        db.add(HouseholdMember(organization_id=org_id, recipient_id=h.id, **m.model_dump()))
    await db.flush()
    await rescore(db, h)
    _audit(db, org_id, current_user, "hane_ekle", {"household_id": str(h.id)})
    await db.commit()
    return _household_out(h, member_count=len(payload.members))


@router.get("/households/{household_id}")
async def get_household(request: Request, household_id: UUID, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    h = await _household(db, org_id, household_id)
    members = (await db.execute(
        select(HouseholdMember).where(HouseholdMember.recipient_id == h.id).order_by(HouseholdMember.created_at)
    )).scalars().all()
    history = (await db.execute(
        select(AidDistribution, AidPackage.name)
        .join(AidPackage, AidPackage.id == AidDistribution.package_id)
        .where(AidDistribution.recipient_id == h.id, AidDistribution.organization_id == org_id)
        .order_by(AidDistribution.created_at.desc()).limit(200)
    )).all()
    region_name = (await db.execute(select(Region.name).where(Region.id == h.region_id))).scalar() if h.region_id else None
    delivered = [d for d, _ in history if d.status == "delivered"]
    out = _household_out(h, region_name, max((d.delivered_at for d in delivered), default=None),
                         sum(d.quantity for d in delivered), len(members))
    out["members"] = [_member_out(m) for m in members]
    out["distributions"] = [
        {"id": str(d.id), "package_name": pn, "quantity": d.quantity, "status": d.status,
         "planned_date": d.planned_date, "delivered_at": d.delivered_at}
        for d, pn in history
    ]
    return out


@router.put("/households/{household_id}")
async def update_household(request: Request, household_id: UUID, payload: HouseholdIn, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    h = await _household(db, org_id, household_id, lock=True)
    await _check_region(db, org_id, payload.region_id)
    data = payload.model_dump()
    if not data.get("national_id"):
        data.pop("national_id")  # maskeli alan boş bırakılırsa kayıtlı numara korunur
    else:
        await _check_unique_national_id(db, org_id, data["national_id"], exclude=h.id)
    for key, value in data.items():
        setattr(h, key, value)
    await rescore(db, h)
    _audit(db, org_id, current_user, "hane_guncelle", {"household_id": str(h.id), "score": h.poverty_score})
    await db.commit()
    return _household_out(h)


@router.post("/households/{household_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(request: Request, household_id: UUID, payload: MemberIn, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    h = await _household(db, org_id, household_id, lock=True)
    m = HouseholdMember(organization_id=org_id, recipient_id=h.id, **payload.model_dump())
    db.add(m)
    await db.flush()
    await rescore(db, h)
    await db.commit()
    return {**_member_out(m), "poverty_score": h.poverty_score}


async def _member(db: AsyncSession, org_id: UUID, household_id: UUID, member_id: UUID) -> HouseholdMember:
    m = (await db.execute(select(HouseholdMember).where(
        HouseholdMember.id == member_id, HouseholdMember.recipient_id == household_id,
        HouseholdMember.organization_id == org_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Aile bireyi bulunamadı")
    return m


@router.put("/households/{household_id}/members/{member_id}")
async def update_member(request: Request, household_id: UUID, member_id: UUID, payload: MemberIn,
                        db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    h = await _household(db, org_id, household_id, lock=True)
    m = await _member(db, org_id, h.id, member_id)
    for key, value in payload.model_dump().items():
        setattr(m, key, value)
    await db.flush()
    await rescore(db, h)
    await db.commit()
    return {**_member_out(m), "poverty_score": h.poverty_score}


@router.delete("/households/{household_id}/members/{member_id}")
async def delete_member(request: Request, household_id: UUID, member_id: UUID,
                        db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    h = await _household(db, org_id, household_id, lock=True)
    await db.delete(await _member(db, org_id, h.id, member_id))
    await db.flush()
    await rescore(db, h)
    await db.commit()
    return {"poverty_score": h.poverty_score}


class ReviewIn(BaseModel):
    status: Literal["inspecting", "approved", "rejected"]
    note: Optional[str] = Field(default=None, max_length=2000)

    clean_text = field_validator("note", mode="before")(lambda cls, v: _clean(v))


@router.post("/households/{household_id}/review")
async def review_household(request: Request, household_id: UUID, payload: ReviewIn, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    """Başvuru akışı: saha incelemesine al, onayla ya da reddet."""
    org_id = _org_id(request)
    h = await _household(db, org_id, household_id, lock=True)
    h.review_status = payload.status
    if payload.note:
        h.inspection_note = payload.note
    if payload.status in ("approved", "rejected"):
        h.inspected_by_id, h.inspected_at = current_user.id, datetime.now(timezone.utc)
    if payload.status == "rejected":
        # Reddedilen haneye bekleyen dağıtım kalmasın.
        for d in (await db.execute(select(AidDistribution).where(
                AidDistribution.recipient_id == h.id, AidDistribution.status == "planned"))).scalars().all():
            d.status = "cancelled"
    _audit(db, org_id, current_user, "hane_inceleme", {"household_id": str(h.id), "status": payload.status})
    await db.commit()
    return _household_out(h)


# --- Bulk aid planning -------------------------------------------------------------------

class BulkPlanIn(BaseModel):
    package_id: UUID
    degrees: List[Degree] = Field(default_factory=list)
    region_id: Optional[UUID] = None
    city: Optional[str] = Field(default=None, max_length=100)
    district: Optional[str] = Field(default=None, max_length=100)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    min_score: Optional[int] = Field(default=None, ge=0, le=100)
    exclude_helped_days: int = Field(default=30, ge=0, le=3650)
    max_households: int = Field(default=500, ge=1, le=2000)
    quantity: int = Field(default=1, ge=1, le=100)
    planned_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=1000)
    dry_run: bool = True

    empty_to_none = field_validator("region_id", "city", "district", "neighborhood", mode="before")(lambda cls, v: v or None)


@router.post("/households/bulk-plan")
async def bulk_plan(request: Request, payload: BulkPlanIn, db: AsyncSession = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """Ölçütlere uyan onaylı hanelere, en yüksek puandan başlayarak dağıtım planlar.

    Aynı paket için bekleyen dağıtımı olanlar ve son N günde yardım almış olanlar atlanır.
    dry_run=true yalnızca önizleme döndürür.
    """
    org_id = _org_id(request)
    package = (await db.execute(select(AidPackage).where(
        AidPackage.id == payload.package_id, AidPackage.organization_id == org_id))).scalar_one_or_none()
    if not package:
        raise HTTPException(status_code=404, detail="Paket bulunamadı")
    delivered = _delivered_subquery(org_id)
    pending = (
        select(AidDistribution.recipient_id)
        .where(AidDistribution.organization_id == org_id, AidDistribution.package_id == package.id,
               AidDistribution.status == "planned", AidDistribution.recipient_id.isnot(None))
    )
    query = (
        select(AidRecipient, delivered.c.last)
        .outerjoin(delivered, delivered.c.recipient_id == AidRecipient.id)
        .where(AidRecipient.organization_id == org_id, AidRecipient.review_status == "approved",
               AidRecipient.status == "active", AidRecipient.id.not_in(pending))
    )
    if payload.degrees:
        query = query.where(_degree_expr().in_(payload.degrees))
    if payload.region_id:
        query = query.where(AidRecipient.region_id == payload.region_id)
    for column, value in ((AidRecipient.city, payload.city), (AidRecipient.district, payload.district),
                          (AidRecipient.neighborhood, payload.neighborhood)):
        if value:
            query = query.where(func.lower(column) == value.strip().lower())
    if payload.min_score is not None:
        query = query.where(AidRecipient.poverty_score >= payload.min_score)
    if payload.exclude_helped_days:
        cutoff = datetime.now(timezone.utc) - timedelta(days=payload.exclude_helped_days)
        query = query.where(or_(delivered.c.last.is_(None), delivered.c.last < cutoff))
    rows = (await db.execute(
        query.order_by(AidRecipient.poverty_score.desc(), delivered.c.last.asc().nulls_first(), AidRecipient.full_name)
        .limit(payload.max_households)
    )).all()
    needed = len(rows) * payload.quantity
    summary = {
        "households": len(rows), "packages_needed": needed, "stock": package.stock,
        "stock_short": max(0, needed - package.stock),
        "estimated_cost_cents": needed * package.unit_cost_cents,
    }
    if payload.dry_run:
        return {**summary, "planned": 0, "preview": [_household_out(h, last=last) for h, last in rows[:200]]}
    for h, _ in rows:
        db.add(AidDistribution(
            organization_id=org_id, package_id=package.id, recipient_id=h.id, region_id=h.region_id,
            quantity=payload.quantity, status="planned", planned_date=payload.planned_date, notes=_clean(payload.notes),
        ))
    _audit(db, org_id, current_user, "toplu_yardim_planla",
           {"package_id": str(package.id), "households": len(rows), "degrees": payload.degrees})
    await db.commit()
    return {**summary, "planned": len(rows), "preview": []}


# --- Statistics & fairness ---------------------------------------------------------------

@router.get("/households-stats")
async def household_stats(
    request: Request, level: Literal["city", "district", "neighborhood"] = "neighborhood",
    city: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Adres bazlı istatistik: hane sayısı, ortalama puan, acil hane ve son 12 ayda dağıtılan paket."""
    org_id = _org_id(request)
    since = datetime.now(timezone.utc) - timedelta(days=365)
    delivered = _delivered_subquery(org_id, since)
    degree = _degree_expr()
    keys = {"city": [AidRecipient.city], "district": [AidRecipient.city, AidRecipient.district],
            "neighborhood": [AidRecipient.city, AidRecipient.district, AidRecipient.neighborhood]}[level]
    approved = (AidRecipient.organization_id == org_id, AidRecipient.review_status == "approved")
    query = (
        select(*keys, func.count(AidRecipient.id), func.round(func.avg(AidRecipient.poverty_score)),
               func.count().filter(degree == "critical"), func.count().filter(degree == "high"),
               func.coalesce(func.sum(delivered.c.total), 0), func.count(delivered.c.recipient_id))
        .outerjoin(delivered, delivered.c.recipient_id == AidRecipient.id)
        .where(*approved)
        .group_by(*keys)
        .order_by(func.count().filter(degree == "critical").desc(), func.count(AidRecipient.id).desc())
    )
    if city:
        query = query.where(func.lower(AidRecipient.city) == city.strip().lower())
    rows = (await db.execute(query.limit(1000))).all()
    n = len(keys)
    by_degree = dict((await db.execute(
        select(degree, func.count()).where(*approved).group_by(degree))).all())
    by_review = dict((await db.execute(
        select(AidRecipient.review_status, func.count()).where(AidRecipient.organization_id == org_id)
        .group_by(AidRecipient.review_status))).all())
    return {
        "level": level,
        "rows": [
            {"label": " / ".join(str(v) for v in r[:n] if v) or "Adres girilmemiş",
             "city": r[0], "district": r[1] if n > 1 else None, "neighborhood": r[2] if n > 2 else None,
             "households": int(r[n]), "avg_score": int(r[n + 1] or 0), "critical": int(r[n + 2]), "high": int(r[n + 3]),
             "packages_12m": int(r[n + 4]), "helped_12m": int(r[n + 5])}
            for r in rows
        ],
        "degrees": [{"degree": k, "label": v, "households": int(by_degree.get(k, 0))} for k, v in DEGREES.items()],
        "review": {k: int(by_review.get(k, 0)) for k in REVIEW_STATUSES},
    }


@router.get("/households-fairness")
async def household_fairness(request: Request, days: int = Query(default=180, ge=7, le=3650),
                             db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Yardımın ihtiyaca göre dağılıp dağılmadığı: derece bazında yardım oranı, gözden kaçanlar, en çok alanlar."""
    org_id = _org_id(request)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    delivered = _delivered_subquery(org_id, since)
    degree = _degree_expr()
    base = (AidRecipient.organization_id == org_id, AidRecipient.review_status == "approved", AidRecipient.status == "active")
    per_degree = {r[0]: r for r in (await db.execute(
        select(degree, func.count(AidRecipient.id), func.count(delivered.c.recipient_id),
               func.coalesce(func.sum(delivered.c.total), 0))
        .outerjoin(delivered, delivered.c.recipient_id == AidRecipient.id)
        .where(*base).group_by(degree)
    )).all()}
    degrees = []
    for key, label in DEGREES.items():
        _, households, helped, packages = per_degree.get(key, (key, 0, 0, 0))
        degrees.append({
            "degree": key, "label": label, "households": int(households), "helped": int(helped),
            "not_helped": int(households) - int(helped), "packages": int(packages),
            "helped_pct": round(int(helped) * 100 / int(households), 1) if households else 0,
            "packages_per_household": round(int(packages) / int(households), 2) if households else 0,
        })
    last_any = _delivered_subquery(org_id)
    overlooked = (await db.execute(
        select(AidRecipient, last_any.c.last)
        .outerjoin(delivered, delivered.c.recipient_id == AidRecipient.id)
        .outerjoin(last_any, last_any.c.recipient_id == AidRecipient.id)
        .where(*base, degree.in_(("critical", "high")), delivered.c.recipient_id.is_(None))
        .order_by(AidRecipient.poverty_score.desc()).limit(200)
    )).all()
    most_helped = (await db.execute(
        select(AidRecipient, delivered.c.last, delivered.c.total)
        .join(delivered, delivered.c.recipient_id == AidRecipient.id)
        .where(AidRecipient.organization_id == org_id)
        .order_by(delivered.c.total.desc(), AidRecipient.poverty_score).limit(20)
    )).all()
    return {
        "days": days,
        "degrees": degrees,
        "overlooked": [_household_out(h, last=last) for h, last in overlooked],
        "most_helped": [_household_out(h, last=last, received=int(total)) for h, last, total in most_helped],
    }


# --- Public help request -----------------------------------------------------------------

class HelpRequestIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=200)
    phone: str = Field(min_length=10, max_length=32)
    national_id: Optional[str] = Field(default=None, pattern=r"^\d{11}$")
    city: str = Field(min_length=2, max_length=100)
    district: str = Field(min_length=2, max_length=100)
    neighborhood: Optional[str] = Field(default=None, max_length=120)
    address: str = Field(min_length=5, max_length=1000)
    household_size: int = Field(ge=1, le=50)
    monthly_income_cents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    housing_status: Optional[Literal["owner", "rent", "relative", "free", "other"]] = None
    needs: str = Field(min_length=5, max_length=2000)
    kvkk_accepted: bool
    website: Optional[str] = None  # honeypot

    clean_text = field_validator("full_name", "city", "district", "neighborhood", "address", "needs", mode="before")(
        lambda cls, v: _clean(v))
    empty_to_none = field_validator("national_id", "housing_status", mode="before")(lambda cls, v: v or None)

    @model_validator(mode="after")
    def require_consent(self):
        if not self.kvkk_accepted:
            raise ValueError("KVKK aydınlatma metni onayı zorunludur")
        return self


@public_router.post("/help-requests", status_code=status.HTTP_201_CREATED,
                    dependencies=[Depends(require_feature(Feature.POVERTY_TRACKING))])
async def create_help_request(
    request: Request, payload: HelpRequestIn, db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("help-request", limit=3, window_seconds=600)),
):
    """Web sitesinden yardım başvurusu; kayıt 'Başvuru' durumunda düşer ve kumanyada görünmez."""
    if payload.website:
        return {"status": "received"}
    org_id = _org_id(request)
    if payload.national_id and (await db.execute(select(AidRecipient.id).where(
            AidRecipient.organization_id == org_id, AidRecipient.national_id == payload.national_id))).first():
        # Aynı kişiye ikinci kayıt açılmaz; başvurunun alındığını söylemek yeterli (kayıt varlığı sızdırılmaz).
        return {"status": "received"}
    h = AidRecipient(
        organization_id=org_id, review_status="applied", source="web", status="active",
        consent_version=HELP_REQUEST_CONSENT_VERSION,
        **payload.model_dump(exclude={"kvkk_accepted", "website"}),
    )
    db.add(h)
    await db.flush()
    await rescore(db, h)
    await db.commit()
    return {"status": "received"}
