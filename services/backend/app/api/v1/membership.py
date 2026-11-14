"""Dernek üyeliği: üye kartı, aidat dönemi açma, tahsilat / muafiyet, geciken aidat, çift üye ve vCard.

Aidat tahsilatı bir bağış kaydıdır: kurum için otomatik açılan "Üye Aidatı" kalemine yazılır,
makbuzu kesilir ve `member_due_ids` metadata'sıyla donation_hooks aidatı kapatır. Online ödeme
(bağışçı paneli) aynı kancadan geçer; makbuz iptalinde aidat yeniden açılır.
"""
import calendar
import re
from datetime import date, datetime, timezone
from typing import List, Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission, require_capability
from app.api.v1.crm import _normalize_phone
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.campaign import HIDDEN_CAMPAIGN_TAG, Campaign, CampaignCategory
from app.models.donation import Donor, DonorType, PaymentMethod
from app.models.membership import DUE_STATUSES, MEMBER_STATUSES, MEMBER_TYPES, Member, MemberDue
from app.models.organization_settings import OrganizationSettings
from app.models.user import User
from app.services.offline_donation import record_offline_donation
from app.services.receipt_books import take_number
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features",
    tags=["membership"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
DUES_CAMPAIGN_TITLE = "Üye Aidatı"
Period = Literal["monthly", "yearly"]


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


def _clean(value):
    return sanitize_public_text(value) if value else value


def _today() -> date:
    return datetime.now(TZ).date()


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


async def _settings(db: AsyncSession, org_id: UUID, create: bool = False) -> Optional[OrganizationSettings]:
    row = (await db.execute(select(OrganizationSettings).where(OrganizationSettings.organization_id == org_id))).scalars().first()
    if not row and create:
        row = OrganizationSettings(organization_id=org_id)
        db.add(row)
        await db.flush()
    return row


async def dues_campaign(db: AsyncSession, org_id: UUID) -> Campaign:
    """Aidat tahsilatlarının yazıldığı bağış kalemi; yoksa açılır."""
    from app.api.v1.sponsorship import _new_campaign

    settings_row = await _settings(db, org_id, create=True)
    if settings_row.member_dues_campaign_id:
        campaign = (await db.execute(select(Campaign).where(
            Campaign.id == settings_row.member_dues_campaign_id, Campaign.organization_id == org_id))).scalar_one_or_none()
        if campaign:
            return campaign
    campaign = await _new_campaign(db, org_id, title=DUES_CAMPAIGN_TITLE, summary="Dernek üye aidatı tahsilatları",
                                   category=CampaignCategory.GENEL, min_cents=100)
    campaign.show_donor_list = False
    campaign.show_collected = False
    # Online aidat ödemesi için aktif kalır; etiket sitedeki kampanya listesinden çıkarır.
    campaign.tags = [HIDDEN_CAMPAIGN_TAG]
    settings_row.member_dues_campaign_id = campaign.id
    return campaign


def _member_out(m: Member, open_cents: int = 0, overdue: int = 0, last_paid: Optional[datetime] = None) -> dict:
    d = m.donor
    return {
        "id": str(m.id), "member_no": m.member_no, "member_type": m.member_type,
        "member_type_label": MEMBER_TYPES.get(m.member_type, m.member_type),
        "status": m.status, "status_label": MEMBER_STATUSES.get(m.status, m.status),
        "joined_on": m.joined_on, "left_on": m.left_on, "dues_cents": m.dues_cents, "dues_period": m.dues_period,
        "notes": m.notes, "donor_id": str(m.donor_id),
        "full_name": d.full_name if d else None, "phone": d.phone if d else None, "email": d.email if d else None,
        "city": d.city if d else None,
        "open_dues_cents": open_cents, "overdue_count": overdue, "last_paid_at": last_paid,
    }


def _due_out(due: MemberDue, member: Optional[Member] = None) -> dict:
    today = _today()
    overdue = due.status == "open" and due.due_date < today
    out = {
        "id": str(due.id), "member_id": str(due.member_id), "period": due.period, "due_date": due.due_date,
        "amount_cents": due.amount_cents, "status": due.status, "status_label": DUE_STATUSES.get(due.status, due.status),
        "overdue": overdue, "days_overdue": (today - due.due_date).days if overdue else 0,
        "donation_id": str(due.donation_id) if due.donation_id else None, "paid_at": due.paid_at,
        "waived_reason": due.waived_reason,
    }
    if member is not None:
        out.update({"member_no": member.member_no, "full_name": member.donor.full_name if member.donor else None,
                    "phone": member.donor.phone if member.donor else None})
    return out


# --- Settings ----------------------------------------------------------------------------

class DuesSettingsIn(BaseModel):
    member_dues_cents: Optional[int] = Field(default=None, ge=100, le=100_000_000)
    member_dues_period: Period = "monthly"


@router.get("/members-settings")
async def get_member_settings(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = await _settings(db, _org_id(request))
    return {
        "member_dues_cents": row.member_dues_cents if row else None,
        "member_dues_period": (row.member_dues_period if row else None) or "monthly",
        "types": MEMBER_TYPES, "statuses": MEMBER_STATUSES,
    }


@router.put("/members-settings", dependencies=[Depends(require_capability("members.manage"))])
async def update_member_settings(request: Request, payload: DuesSettingsIn, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    row = await _settings(db, org_id, create=True)
    row.member_dues_cents, row.member_dues_period = payload.member_dues_cents, payload.member_dues_period
    await dues_campaign(db, org_id)
    await db.commit()
    return {"member_dues_cents": row.member_dues_cents, "member_dues_period": row.member_dues_period}


# --- Members -----------------------------------------------------------------------------

class PersonIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    tc_no: Optional[str] = Field(default=None, pattern=r"^\d{11}$")
    city: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=1000)

    clean_text = field_validator("first_name", "last_name", "city", "address", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("email", "tc_no", mode="before")(lambda cls, v: v or None)

    @field_validator("phone", mode="before")
    @classmethod
    def check_phone(cls, value):
        return _normalize_phone(value)


class MemberIn(BaseModel):
    member_no: Optional[str] = Field(default=None, max_length=30)
    member_type: Literal["asil", "onursal", "fahri", "genc"] = "asil"
    status: Literal["active", "passive", "resigned", "expelled", "deceased"] = "active"
    joined_on: Optional[date] = None
    left_on: Optional[date] = None
    dues_cents: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    dues_period: Optional[Period] = None
    notes: Optional[str] = Field(default=None, max_length=2000)

    clean_text = field_validator("member_no", "notes", mode="before")(lambda cls, v: _clean(v.strip() if isinstance(v, str) else v))
    empty_to_none = field_validator("member_no", "joined_on", "left_on", "dues_period", mode="before")(lambda cls, v: v or None)


class MemberCreate(MemberIn):
    donor_id: Optional[UUID] = None
    person: Optional[PersonIn] = None

    @model_validator(mode="after")
    def person_required(self):
        if not self.donor_id and not self.person:
            raise ValueError("Kayıtlı bir kişi seçin veya yeni kişi bilgisi girin")
        return self


async def _next_member_no(db: AsyncSession, org_id: UUID) -> str:
    numbers = (await db.execute(select(Member.member_no).where(Member.organization_id == org_id))).scalars().all()
    digits = [int(n) for n in numbers if n and n.isdigit()]
    return str(max(digits, default=0) + 1)


async def _member(db: AsyncSession, org_id: UUID, member_id: UUID, lock: bool = False) -> Member:
    query = select(Member).options(selectinload(Member.donor)).where(Member.id == member_id, Member.organization_id == org_id)
    if lock:
        query = query.with_for_update(of=Member)
    m = (await db.execute(query)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")
    return m


async def _check_member_no(db: AsyncSession, org_id: UUID, member_no: str, exclude: Optional[UUID] = None) -> None:
    query = select(Member.id).where(Member.organization_id == org_id, Member.member_no == member_no)
    if exclude:
        query = query.where(Member.id != exclude)
    if (await db.execute(query)).first():
        raise HTTPException(status_code=409, detail=f"{member_no} numaralı bir üye zaten var")


@router.get("/members")
async def list_members(
    request: Request,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    member_type: Optional[str] = None,
    overdue_only: bool = False,
    q: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    today = _today()
    open_dues = (
        select(MemberDue.member_id, func.coalesce(func.sum(MemberDue.amount_cents), 0).label("open_cents"),
               func.count().filter(MemberDue.due_date < today).label("overdue"))
        .where(MemberDue.organization_id == org_id, MemberDue.status == "open")
        .group_by(MemberDue.member_id).subquery()
    )
    last_paid = (
        select(MemberDue.member_id, func.max(MemberDue.paid_at).label("last_paid"))
        .where(MemberDue.organization_id == org_id, MemberDue.status == "paid")
        .group_by(MemberDue.member_id).subquery()
    )
    query = (
        select(Member, open_dues.c.open_cents, open_dues.c.overdue, last_paid.c.last_paid)
        .join(Donor, Donor.id == Member.donor_id)
        .outerjoin(open_dues, open_dues.c.member_id == Member.id)
        .outerjoin(last_paid, last_paid.c.member_id == Member.id)
        .options(selectinload(Member.donor))
        .where(Member.organization_id == org_id)
    )
    if status_filter in MEMBER_STATUSES:
        query = query.where(Member.status == status_filter)
    if member_type in MEMBER_TYPES:
        query = query.where(Member.member_type == member_type)
    if overdue_only:
        query = query.where(open_dues.c.overdue > 0)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Member.member_no.ilike(like), Donor.first_name.ilike(like), Donor.last_name.ilike(like),
                                Donor.phone.ilike(like), Donor.email.ilike(like),
                                (Donor.first_name + " " + func.coalesce(Donor.last_name, "")).ilike(like)))
    rows = (await db.execute(query.order_by(func.length(Member.member_no), Member.member_no).limit(5000))).all()
    return [_member_out(m, int(oc or 0), int(od or 0), lp) for m, oc, od, lp in rows]


@router.post("/members", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_capability("members.manage"))])
async def create_member(request: Request, payload: MemberCreate, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    if payload.donor_id:
        donor = (await db.execute(select(Donor).where(Donor.id == payload.donor_id, Donor.organization_id == org_id))).scalar_one_or_none()
        if not donor:
            raise HTTPException(status_code=404, detail="Kişi bulunamadı")
    else:
        p = payload.person
        checks = [c for c in (
            Donor.tc_no == p.tc_no if p.tc_no else None,
            Donor.phone == p.phone if p.phone else None,
            func.lower(Donor.email) == str(p.email).lower() if p.email else None,
        ) if c is not None]
        donor = (await db.execute(select(Donor).where(Donor.organization_id == org_id, or_(*checks))
                                  .order_by(Donor.created_at))).scalars().first() if checks else None
        if donor is None:
            donor = Donor(organization_id=org_id, donor_type=DonorType.INDIVIDUAL, first_name=p.first_name, last_name=p.last_name,
                          phone=p.phone, email=str(p.email).lower() if p.email else None, tc_no=p.tc_no, city=p.city,
                          address=p.address, country="Türkiye", total_donations=0, total_donated_cents=0)
            db.add(donor)
            await db.flush()
    if (await db.execute(select(Member.id).where(Member.organization_id == org_id, Member.donor_id == donor.id,
                                                 Member.status.in_(("active", "passive"))))).first():
        raise HTTPException(status_code=409, detail=f"{donor.full_name} zaten üye")
    member_no = payload.member_no or await _next_member_no(db, org_id)
    await _check_member_no(db, org_id, member_no)
    data = payload.model_dump(exclude={"donor_id", "person", "member_no"})
    m = Member(organization_id=org_id, donor_id=donor.id, member_no=member_no, **data)
    m.joined_on = m.joined_on or _today()
    db.add(m)
    _audit(db, org_id, current_user, "uye_ekle", {"member_no": member_no, "donor_id": str(donor.id)})
    await db.commit()
    return _member_out(await _member(db, org_id, m.id))


@router.get("/members/duplicates")
async def duplicate_members(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Aynı kişiye (bağışçı kartı) ya da aynı telefona / TC'ye bağlı birden çok üye kaydı."""
    org_id = _org_id(request)
    members = (await db.execute(select(Member).options(selectinload(Member.donor))
                                .where(Member.organization_id == org_id))).scalars().all()
    buckets: dict[str, list[Member]] = {}
    for m in members:
        keys = [f"donor:{m.donor_id}"]
        if m.donor and m.donor.phone:
            keys.append(f"phone:{m.donor.phone}")
        if m.donor and m.donor.tc_no:
            keys.append(f"tc:{m.donor.tc_no}")
        for key in keys:
            buckets.setdefault(key, []).append(m)
    labels = {"donor": "Aynı kişi", "phone": "Telefon", "tc": "TC"}
    found: dict[frozenset, tuple[list[Member], list[str]]] = {}
    for key, group in buckets.items():
        ids = frozenset(m.id for m in group)
        if len(ids) < 2:
            continue
        reason = labels[key.split(":")[0]]
        if ids not in found:
            found[ids] = (group, [])
        if reason not in found[ids][1]:
            found[ids][1].append(reason)
    groups = [
        {"reason": ", ".join(sorted(reasons, key=list(labels.values()).index)),
         "members": [_member_out(m) for m in sorted(group, key=lambda m: m.created_at)]}
        for group, reasons in found.values()
    ]
    return {"groups": groups}


class MemberMergeIn(BaseModel):
    target_id: UUID
    source_ids: List[UUID] = Field(min_length=1, max_length=20)


@router.post("/members/merge", dependencies=[Depends(require_capability("members.manage"))])
async def merge_members(request: Request, payload: MemberMergeIn, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Kaynak üye kayıtlarının aidatlarını hedefe taşır ve kaynakları siler.

    Aynı dönem iki kayıtta da varsa ödenmiş olan kalır; ikisi de açıksa kaynaktaki silinir.
    """
    org_id = _org_id(request)
    if payload.target_id in payload.source_ids:
        raise HTTPException(status_code=422, detail="Hedef kayıt kaynaklar arasında olamaz")
    target = await _member(db, org_id, payload.target_id, lock=True)
    sources = [await _member(db, org_id, sid, lock=True) for sid in dict.fromkeys(payload.source_ids)]
    target_dues = {d.period: d for d in (await db.execute(select(MemberDue).where(MemberDue.member_id == target.id))).scalars().all()}
    moved = dropped = 0
    for source in sources:
        for due in (await db.execute(select(MemberDue).where(MemberDue.member_id == source.id))).scalars().all():
            existing = target_dues.get(due.period)
            if existing is None:
                due.member_id = target.id
                target_dues[due.period] = due
                moved += 1
            elif existing.status != "paid" and due.status == "paid":
                await db.delete(existing)
                await db.flush()
                due.member_id = target.id
                target_dues[due.period] = due
                moved += 1
            else:
                await db.delete(due)
                dropped += 1
        if source.notes:
            target.notes = f"{target.notes}\n---\n{source.notes}" if target.notes else source.notes
        if source.joined_on and (not target.joined_on or source.joined_on < target.joined_on):
            target.joined_on = source.joined_on
        await db.flush()
        await db.delete(source)
    _audit(db, org_id, current_user, "uye_birlestir", {
        "target": target.member_no, "sources": [s.member_no for s in sources], "moved": moved, "dropped": dropped})
    await db.commit()
    return {"member": _member_out(await _member(db, org_id, target.id)), "moved_dues": moved, "dropped_dues": dropped}


def _vcard(m: Member) -> str:
    d = m.donor

    def esc(v):
        return re.sub(r"([,;\\])", r"\\\1", str(v or "")).replace("\n", "\\n")
    lines = ["BEGIN:VCARD", "VERSION:3.0", f"N:{esc(d.last_name)};{esc(d.first_name)};;;", f"FN:{esc(d.full_name)}"]
    if d.phone:
        lines.append(f"TEL;TYPE=CELL:{d.phone}")
    if d.email:
        lines.append(f"EMAIL:{d.email}")
    if d.address or d.city:
        lines.append(f"ADR:;;{esc(d.address)};{esc(d.city)};;;{esc(d.country)}")
    lines += [f"NOTE:Üye no {esc(m.member_no)} - {esc(MEMBER_TYPES.get(m.member_type, m.member_type))}", "END:VCARD"]
    return "\r\n".join(lines)


@router.get("/members/vcard")
async def members_vcard(request: Request, ids: Optional[str] = Query(default=None, max_length=20000),
                        db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Seçili (ids=uuid,uuid) ya da tüm aktif üyeler için tek .vcf dosyası."""
    org_id = _org_id(request)
    query = select(Member).options(selectinload(Member.donor)).where(Member.organization_id == org_id)
    if ids:
        try:
            query = query.where(Member.id.in_([UUID(i) for i in ids.split(",") if i]))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Geçersiz üye kimliği") from exc
    else:
        query = query.where(Member.status == "active")
    members = (await db.execute(query.order_by(Member.member_no))).scalars().all()
    return Response("\r\n".join(_vcard(m) for m in members) + "\r\n", media_type="text/vcard; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="uyeler.vcf"'})


@router.get("/members/{member_id}")
async def get_member(request: Request, member_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    m = await _member(db, org_id, member_id)
    dues = (await db.execute(select(MemberDue).where(MemberDue.member_id == m.id).order_by(MemberDue.due_date.desc()))).scalars().all()
    today = _today()
    open_dues = [d for d in dues if d.status == "open"]
    out = _member_out(m, sum(d.amount_cents for d in open_dues), sum(1 for d in open_dues if d.due_date < today),
                      max((d.paid_at for d in dues if d.paid_at), default=None))
    out["dues"] = [_due_out(d) for d in dues]
    return out


@router.put("/members/{member_id}", dependencies=[Depends(require_capability("members.manage"))])
async def update_member(request: Request, member_id: UUID, payload: MemberIn, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    m = await _member(db, org_id, member_id, lock=True)
    data = payload.model_dump()
    if data["member_no"]:
        await _check_member_no(db, org_id, data["member_no"], exclude=m.id)
    else:
        data.pop("member_no")
    if data["status"] in ("resigned", "expelled", "deceased") and not data.get("left_on"):
        data["left_on"] = m.left_on or _today()
    for key, value in data.items():
        setattr(m, key, value)
    _audit(db, org_id, current_user, "uye_guncelle", {"member_no": m.member_no, "status": m.status})
    await db.commit()
    return _member_out(await _member(db, org_id, m.id))


# --- Dues --------------------------------------------------------------------------------

class GenerateIn(BaseModel):
    period: str = Field(pattern=r"^\d{4}(-(0[1-9]|1[0-2]))?$")  # "2026-11" aylık, "2026" yıllık
    due_date: Optional[date] = None
    amount_cents: Optional[int] = Field(default=None, ge=100, le=100_000_000)
    member_ids: List[UUID] = Field(default_factory=list, max_length=5000)
    dry_run: bool = False


@router.post("/member-dues/generate", dependencies=[Depends(require_capability("members.manage"))])
async def generate_dues(request: Request, payload: GenerateIn, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Aktif üyelere dönem aidatı açar; o dönemi zaten olan üye atlanır (tekrar çalıştırmak güvenlidir).

    Aylık dönem ("2026-11") aylık aidatlı, yıllık dönem ("2026") yıllık aidatlı üyelere açılır.
    """
    org_id = _org_id(request)
    period_kind = "monthly" if "-" in payload.period else "yearly"
    year = int(payload.period[:4])
    if period_kind == "monthly":
        month = int(payload.period[5:])
        default_due = date(year, month, calendar.monthrange(year, month)[1])
    else:
        default_due = date(year, 12, 31)
    due_date = payload.due_date or default_due
    settings_row = await _settings(db, org_id)
    org_amount = settings_row.member_dues_cents if settings_row else None
    org_period = (settings_row.member_dues_period if settings_row else None) or "monthly"

    query = select(Member).where(Member.organization_id == org_id, Member.status == "active")
    if payload.member_ids:
        query = query.where(Member.id.in_(payload.member_ids))
    members = (await db.execute(query)).scalars().all()
    existing = set((await db.execute(select(MemberDue.member_id).where(
        MemberDue.organization_id == org_id, MemberDue.period == payload.period))).scalars().all())
    created, skipped_existing, skipped_no_amount, other_period, total = 0, 0, 0, 0, 0
    for m in members:
        if (m.dues_period or org_period) != period_kind:
            other_period += 1
            continue
        if m.id in existing:
            skipped_existing += 1
            continue
        amount = payload.amount_cents if payload.amount_cents is not None else (m.dues_cents if m.dues_cents is not None else org_amount)
        if not amount:
            skipped_no_amount += 1
            continue
        if not payload.dry_run:
            db.add(MemberDue(organization_id=org_id, member_id=m.id, period=payload.period, due_date=due_date,
                             amount_cents=amount, status="open"))
        created += 1
        total += amount
    if not payload.dry_run:
        _audit(db, org_id, current_user, "aidat_donemi_ac", {"period": payload.period, "created": created, "total_cents": total})
        await db.commit()
    return {"period": payload.period, "due_date": due_date, "created": created, "total_cents": total,
            "already_had": skipped_existing, "no_amount": skipped_no_amount, "other_period": other_period,
            "dry_run": payload.dry_run}


@router.get("/member-dues")
async def list_dues(
    request: Request,
    status_filter: Optional[Literal["open", "overdue", "paid", "waived"]] = Query(default="overdue", alias="status"),
    period: Optional[str] = Query(default=None, max_length=7),
    q: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = (select(MemberDue, Member).join(Member, Member.id == MemberDue.member_id)
             .join(Donor, Donor.id == Member.donor_id)
             .options(selectinload(Member.donor)).where(MemberDue.organization_id == org_id))
    if status_filter == "overdue":
        query = query.where(MemberDue.status == "open", MemberDue.due_date < _today())
    elif status_filter:
        query = query.where(MemberDue.status == status_filter)
    if period and period.strip():
        query = query.where(MemberDue.period == period.strip())
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(
            Member.member_no.ilike(like),
            Donor.first_name.ilike(like),
            Donor.last_name.ilike(like),
            Donor.phone.ilike(like),
            (Donor.first_name + " " + func.coalesce(Donor.last_name, "")).ilike(like),
        ))
    rows = (await db.execute(query.order_by(MemberDue.due_date, Member.member_no).limit(10000))).all()
    return [_due_out(d, m) for d, m in rows]


class DuesPaymentIn(BaseModel):
    due_ids: List[UUID] = Field(min_length=1, max_length=60)
    idempotency_key: str = Field(min_length=16, max_length=100)
    payment_method: Literal["cash", "bank_transfer"] = "cash"
    paid_on: Optional[date] = None
    bank_reference: Optional[str] = Field(default=None, max_length=100)
    receipt_book_id: Optional[UUID] = None
    official_no: Optional[int] = Field(default=None, ge=1)
    send_receipt: bool = True

    empty_to_none = field_validator("receipt_book_id", "bank_reference", mode="before")(lambda cls, v: v or None)


@router.post("/member-dues/pay", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_capability("members.manage"))])
async def pay_dues(request: Request, payload: DuesPaymentIn, db: AsyncSession = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Bir üyenin seçili açık aidatlarını tek makbuzla tahsil eder (nakit / havale)."""
    from app.models.donation import Donation

    org_id = _org_id(request)
    key = f"dues:{payload.idempotency_key}"
    done = (await db.execute(select(Donation).where(Donation.organization_id == org_id, Donation.idempotency_key == key))).scalar_one_or_none()
    if done:
        return {"donation_id": str(done.id), "receipt_number": done.receipt_number, "official_receipt_no": done.official_receipt_no}
    dues = (await db.execute(select(MemberDue).where(
        MemberDue.organization_id == org_id, MemberDue.id.in_(payload.due_ids)).with_for_update())).scalars().all()
    if len(dues) != len(set(payload.due_ids)):
        raise HTTPException(status_code=404, detail="Aidatlardan bazıları bulunamadı")
    if any(d.status != "open" for d in dues):
        raise HTTPException(status_code=409, detail="Seçilen aidatlardan bazıları açık değil")
    if len({d.member_id for d in dues}) != 1:
        raise HTTPException(status_code=422, detail="Tek makbuzda yalnız bir üyenin aidatları tahsil edilir")
    member = await _member(db, org_id, dues[0].member_id)
    today = _today()
    if payload.paid_on and payload.paid_on > today:
        raise HTTPException(status_code=422, detail="Tahsilat tarihi ileri bir tarih olamaz")
    book, official = None, None
    if payload.receipt_book_id:
        book, official = await take_number(db, org_id, payload.receipt_book_id, payload.official_no)
    campaign = await dues_campaign(db, org_id)
    total = sum(d.amount_cents for d in dues)
    periods = ", ".join(sorted(d.period for d in dues))
    paid_at = datetime.combine(payload.paid_on, datetime.min.time().replace(hour=12), TZ) if payload.paid_on else datetime.now(timezone.utc)
    donation, effects = await record_offline_donation(
        db, organization_id=org_id, campaign=campaign, donor=member.donor, amount_cents=total, currency="TRY",
        method=PaymentMethod.CASH if payload.payment_method == "cash" else PaymentMethod.BANK_TRANSFER,
        paid_at=paid_at, issued_by_id=current_user.id, provider="manual", idempotency_key=key,
        details={"member_no": member.member_no, "periods": periods, "bank_reference": payload.bank_reference},
        note=f"Üye aidatı ({member.member_no}): {periods}", transaction_id=payload.bank_reference,
        send_receipt=payload.send_receipt, metadata={"member_due_ids": [str(d.id) for d in dues]},
    )
    if book:
        donation.receipt_book_id, donation.official_receipt_no = book.id, official
    if effects.get("member_dues_paid") != len(dues):
        raise HTTPException(status_code=409, detail="Aidatlar kapatılamadı")
    _audit(db, org_id, current_user, "aidat_tahsil", {
        "member_no": member.member_no, "periods": periods, "amount_cents": total, "receipt_number": donation.receipt_number})
    await db.commit()
    return {"donation_id": str(donation.id), "receipt_number": donation.receipt_number, "official_receipt_no": official,
            "amount_cents": total, "paid": len(dues)}


class WaiveIn(BaseModel):
    due_ids: List[UUID] = Field(min_length=1, max_length=5000)
    reason: str = Field(min_length=3, max_length=300)

    clean_text = field_validator("reason", mode="before")(lambda cls, v: _clean(v))


@router.post("/member-dues/waive", dependencies=[Depends(require_capability("members.manage"))])
async def waive_dues(request: Request, payload: WaiveIn, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    """Açık aidatları muaf tutar / siler (yönetim kurulu kararı vb.); ödenmiş aidata dokunulmaz."""
    org_id = _org_id(request)
    dues = (await db.execute(select(MemberDue).where(
        MemberDue.organization_id == org_id, MemberDue.id.in_(payload.due_ids), MemberDue.status == "open"))).scalars().all()
    for d in dues:
        d.status, d.waived_reason = "waived", payload.reason
    _audit(db, org_id, current_user, "aidat_muaf", {"count": len(dues), "reason": payload.reason})
    await db.commit()
    return {"waived": len(dues)}


@router.delete("/member-dues/{due_id}")
async def delete_due(request: Request, due_id: UUID, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    """Yanlışlıkla açılmış açık durumdaki tekil aidat kaydını siler."""
    org_id = _org_id(request)
    due = (await db.execute(select(MemberDue).where(
        MemberDue.id == due_id, MemberDue.organization_id == org_id))).scalar_one_or_none()
    if not due:
        raise HTTPException(status_code=404, detail="Aidat kaydı bulunamadı")
    if due.status != "open":
        raise HTTPException(status_code=409, detail="Yalnız açık durumdaki aidatlar silinebilir")
    _audit(db, org_id, current_user, "aidat_sil", {"due_id": str(due.id), "period": due.period, "amount_cents": due.amount_cents})
    await db.delete(due)
    await db.commit()
    return {"deleted": True}


@router.get("/member-dues-summary")
async def dues_summary(request: Request, year: Optional[int] = Query(default=None, ge=2000, le=2100),
                       db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    today = _today()
    year = year or today.year
    members = dict((await db.execute(select(Member.status, func.count()).where(Member.organization_id == org_id)
                                     .group_by(Member.status))).all())
    by_type = dict((await db.execute(select(Member.member_type, func.count()).where(
        Member.organization_id == org_id, Member.status == "active").group_by(Member.member_type))).all())
    open_row = (await db.execute(select(
        func.coalesce(func.sum(MemberDue.amount_cents), 0),
        func.coalesce(func.sum(MemberDue.amount_cents).filter(MemberDue.due_date < today), 0),
        func.count(func.distinct(MemberDue.member_id)).filter(MemberDue.due_date < today),
    ).where(MemberDue.organization_id == org_id, MemberDue.status == "open"))).one()
    collected = (await db.execute(select(func.coalesce(func.sum(MemberDue.amount_cents), 0)).where(
        MemberDue.organization_id == org_id, MemberDue.status == "paid",
        MemberDue.paid_at >= datetime(year, 1, 1, tzinfo=TZ), MemberDue.paid_at < datetime(year + 1, 1, 1, tzinfo=TZ),
    ))).scalar_one()
    return {
        "members": {k: int(members.get(k, 0)) for k in MEMBER_STATUSES},
        "active_by_type": {k: int(by_type.get(k, 0)) for k in MEMBER_TYPES},
        "open_cents": int(open_row[0]), "overdue_cents": int(open_row[1]), "overdue_members": int(open_row[2]),
        "year": year, "collected_cents": int(collected),
    }
