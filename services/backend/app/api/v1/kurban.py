"""Kurban organizasyonu.

Akış: kurban kampanyası bir web bağış kalemine bağlanır → o kaleme gelen her
onaylı bağış (online veya elle makbuz) otomatik olarak hisse(ler)e dönüşür →
"Hisseleri dağıt" atanmamış hisseleri büyükbaşlara 7'şerli (küçükbaşlara 1'er)
yerleştirir; aynı bağışın hisseleri mümkünse aynı hayvana konur → kesim
işaretlenince hissedarlara bir kez SMS gider, video bağışçı panelinde görünür.
"""
from collections import OrderedDict
from datetime import datetime, timezone
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Permission, require_capability, require_feature, require_permission
from app.core.config import settings
from app.core.db import get_db
from app.core.plans import Feature
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
from app.models.donation import Donation
from app.models.kurban import (
    KURBAN_TYPES, SHARES_PER_ANIMAL, KurbanAnimal, KurbanAnimalType, KurbanCampaign, KurbanCampaignStatus,
    KurbanShare, KurbanStatus,
)
from app.models.user import User
from app.services.donation_hooks import normalize_kurban_type
from app.utils.cms import slugify
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/kurban",
    tags=["kurban"],
    dependencies=[Depends(require_feature(Feature.KURBAN))],
)

READ = Depends(require_permission(Permission.ADMIN_READ))
WRITE = Depends(require_permission(Permission.OPERATIONS_MANAGE))
TYPE_LABELS = {KurbanAnimalType.COW: "Büyükbaş", KurbanAnimalType.SHEEP: "Küçükbaş"}

KURBAN_CHECKOUT_FIELDS = [
    {"key": "kurban_type", "label": "Kurban türü", "type": "select", "required": True,
     "options": list(KURBAN_TYPES.values())},
    {"key": "kurban_names", "label": "Hissedar isimleri (her satıra bir isim, hisse sayısı kadar)", "type": "list"},
]


def _org_id(request: Request) -> UUID:
    return UUID(request.state.organization_id)


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


async def _campaign(db: AsyncSession, org_id: UUID, campaign_id: UUID) -> KurbanCampaign:
    row = (await db.execute(
        select(KurbanCampaign).where(KurbanCampaign.id == campaign_id, KurbanCampaign.organization_id == org_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Kurban kampanyası bulunamadı")
    return row


async def _animal(db: AsyncSession, org_id: UUID, animal_id: UUID, lock: bool = False) -> KurbanAnimal:
    query = select(KurbanAnimal).where(KurbanAnimal.id == animal_id, KurbanAnimal.organization_id == org_id)
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Hayvan bulunamadı")
    return row


# --- Campaigns ----------------------------------------------------------------

class KurbanCampaignIn(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    description: Optional[str] = Field(default=None, max_length=1000)
    price_per_share_cents: int = Field(gt=0)
    animal_type: Literal["cow", "sheep"] = "cow"
    country: Optional[str] = Field(default=None, max_length=100)
    season_year: Optional[int] = Field(default=None, ge=2000, le=2100)
    animal_prefix: str = Field(default="K", min_length=1, max_length=10, pattern=r"^[A-Za-z0-9]+$")
    status: Literal["active", "completed"] = "active"
    # Link to an existing website donation item, or let the system create one.
    donation_campaign_id: Optional[UUID] = None
    create_donation_campaign: bool = False

    @field_validator("title", "description", "country", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) if value else value


def _campaign_out(c: KurbanCampaign, stats: dict | None = None) -> dict:
    return {
        "id": str(c.id),
        "title": c.title,
        "description": c.description,
        "price_per_share_cents": c.price_per_share_cents,
        "animal_type": c.animal_type.value,
        "animal_type_label": TYPE_LABELS[c.animal_type],
        "country": c.country,
        "season_year": c.season_year,
        "animal_prefix": c.animal_prefix,
        "status": c.status.value,
        "donation_campaign_id": str(c.donation_campaign_id) if c.donation_campaign_id else None,
        **(stats or {}),
    }


async def _ensure_checkout_fields(campaign: Campaign) -> None:
    existing = {f.get("key") for f in campaign.checkout_fields_schema or []}
    missing = [f for f in KURBAN_CHECKOUT_FIELDS if f["key"] not in existing]
    if missing:
        campaign.checkout_fields_schema = [*(campaign.checkout_fields_schema or []), *missing]


async def _link_donation_campaign(db: AsyncSession, org_id: UUID, kc: KurbanCampaign, payload: KurbanCampaignIn) -> None:
    if payload.donation_campaign_id:
        campaign = (await db.execute(
            select(Campaign).where(Campaign.id == payload.donation_campaign_id, Campaign.organization_id == org_id)
        )).scalar_one_or_none()
        if not campaign:
            raise HTTPException(status_code=404, detail="Bağlanacak bağış kalemi bulunamadı")
        taken = (await db.execute(
            select(KurbanCampaign.id).where(
                KurbanCampaign.donation_campaign_id == campaign.id, KurbanCampaign.id != kc.id,
            )
        )).first()
        if taken:
            raise HTTPException(status_code=409, detail="Bu bağış kalemi başka bir kurban kampanyasına bağlı")
        await _ensure_checkout_fields(campaign)
        kc.donation_campaign_id = campaign.id
    elif payload.create_donation_campaign and not kc.donation_campaign_id:
        base = slugify(payload.title) or "kurban"
        slug = base
        for n in range(2, 100):
            if not (await db.execute(select(Campaign.id).where(Campaign.organization_id == org_id, Campaign.slug == slug))).first():
                break
            slug = f"{base}-{n}"
        price = payload.price_per_share_cents
        campaign = Campaign(
            organization_id=org_id, slug=slug, title=payload.title,
            summary=payload.description or f"{TYPE_LABELS[KurbanAnimalType(payload.animal_type)]} kurban hissesi",
            category=CampaignCategory.KURBAN, status=CampaignStatus.ACTIVE, target_cents=0, collected_cents=0,
            suggested_amounts_cents=[price, price * 2, price * 7] if payload.animal_type == "cow" else [price, price * 2],
            allow_custom_amount=False, min_donation_cents=price, checkout_fields_schema=list(KURBAN_CHECKOUT_FIELDS),
            tags=["kurban"], translations={},
        )
        db.add(campaign)
        await db.flush()
        kc.donation_campaign_id = campaign.id


@router.get("/types")
async def kurban_types(_: User = READ):
    return [{"key": k, "label": v} for k, v in KURBAN_TYPES.items()]


@router.get("/campaigns")
async def list_campaigns(request: Request, db: AsyncSession = Depends(get_db), _: User = READ):
    org_id = _org_id(request)
    campaigns = (await db.execute(
        select(KurbanCampaign).where(KurbanCampaign.organization_id == org_id).order_by(KurbanCampaign.created_at.desc())
    )).scalars().all()
    share_rows = (await db.execute(
        select(KurbanShare.campaign_id, KurbanShare.animal_id.is_(None), KurbanShare.status, func.count())
        .where(KurbanShare.organization_id == org_id)
        .group_by(KurbanShare.campaign_id, KurbanShare.animal_id.is_(None), KurbanShare.status)
    )).all()
    animal_rows = (await db.execute(
        select(KurbanAnimal.campaign_id, KurbanAnimal.status, func.count())
        .where(KurbanAnimal.organization_id == org_id).group_by(KurbanAnimal.campaign_id, KurbanAnimal.status)
    )).all()
    stats: dict = {}
    for cid, unassigned, st, n in share_rows:
        s = stats.setdefault(cid, {"shares": 0, "unassigned_shares": 0, "animals": 0, "slaughtered_animals": 0})
        s["shares"] += n
        if unassigned:
            s["unassigned_shares"] += n
    for cid, st, n in animal_rows:
        s = stats.setdefault(cid, {"shares": 0, "unassigned_shares": 0, "animals": 0, "slaughtered_animals": 0})
        s["animals"] += n
        if st == KurbanStatus.SLAUGHTERED:
            s["slaughtered_animals"] += n
    empty = {"shares": 0, "unassigned_shares": 0, "animals": 0, "slaughtered_animals": 0}
    return [_campaign_out(c, stats.get(c.id, empty)) for c in campaigns]


@router.post("/campaigns", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_capability("kurban.manage"))])
async def create_campaign(request: Request, payload: KurbanCampaignIn, db: AsyncSession = Depends(get_db),
                          current_user: User = WRITE):
    org_id = _org_id(request)
    kc = KurbanCampaign(
        organization_id=org_id, title=payload.title, description=payload.description,
        price_per_share_cents=payload.price_per_share_cents, animal_type=KurbanAnimalType(payload.animal_type),
        country=payload.country, season_year=payload.season_year, animal_prefix=payload.animal_prefix.upper(),
        status=KurbanCampaignStatus(payload.status),
    )
    db.add(kc)
    await db.flush()
    await _link_donation_campaign(db, org_id, kc, payload)
    _audit(db, org_id, current_user, "kurban_kampanya_olustur", {"kurban_campaign_id": str(kc.id), "title": kc.title})
    await db.commit()
    return _campaign_out(kc)


@router.put("/campaigns/{campaign_id}", dependencies=[Depends(require_capability("kurban.manage"))])
async def update_campaign(request: Request, campaign_id: UUID, payload: KurbanCampaignIn,
                          db: AsyncSession = Depends(get_db), current_user: User = WRITE):
    org_id = _org_id(request)
    kc = await _campaign(db, org_id, campaign_id)
    has_animals = (await db.execute(select(KurbanAnimal.id).where(KurbanAnimal.campaign_id == kc.id))).first()
    if has_animals and KurbanAnimalType(payload.animal_type) != kc.animal_type:
        raise HTTPException(status_code=409, detail="Hayvan oluşturulmuş kampanyanın türü değiştirilemez")
    kc.title, kc.description = payload.title, payload.description
    kc.price_per_share_cents = payload.price_per_share_cents
    kc.animal_type = KurbanAnimalType(payload.animal_type)
    kc.country, kc.season_year = payload.country, payload.season_year
    kc.animal_prefix = payload.animal_prefix.upper()
    kc.status = KurbanCampaignStatus(payload.status)
    await _link_donation_campaign(db, org_id, kc, payload)
    _audit(db, org_id, current_user, "kurban_kampanya_guncelle", {"kurban_campaign_id": str(kc.id)})
    await db.commit()
    return _campaign_out(kc)


@router.get("/campaigns/{campaign_id}/summary")
async def campaign_summary(request: Request, campaign_id: UUID, db: AsyncSession = Depends(get_db), _: User = READ):
    """Kurban raporu: türlere göre hisse, atanma ve kesim durumu."""
    org_id = _org_id(request)
    kc = await _campaign(db, org_id, campaign_id)
    by_type = dict((await db.execute(
        select(KurbanShare.kurban_type, func.count()).where(KurbanShare.campaign_id == kc.id).group_by(KurbanShare.kurban_type)
    )).all())
    assigned = (await db.execute(
        select(func.count()).where(KurbanShare.campaign_id == kc.id, KurbanShare.animal_id.is_not(None))
    )).scalar_one()
    total = sum(by_type.values())
    slaughtered_shares = (await db.execute(
        select(func.count()).where(KurbanShare.campaign_id == kc.id, KurbanShare.status == KurbanStatus.SLAUGHTERED)
    )).scalar_one()
    animals = dict((await db.execute(
        select(KurbanAnimal.status, func.count()).where(KurbanAnimal.campaign_id == kc.id).group_by(KurbanAnimal.status)
    )).all())
    notified = (await db.execute(
        select(func.count()).where(KurbanShare.campaign_id == kc.id, KurbanShare.notified_at.is_not(None))
    )).scalar_one()
    return {
        **_campaign_out(kc),
        "shares": total,
        "assigned_shares": assigned,
        "unassigned_shares": total - assigned,
        "slaughtered_shares": slaughtered_shares,
        "notified_shares": notified,
        "by_kurban_type": [{"key": k, "label": KURBAN_TYPES.get(k, k), "count": n} for k, n in sorted(by_type.items())],
        "animals_waiting": animals.get(KurbanStatus.WAITING, 0),
        "animals_slaughtered": animals.get(KurbanStatus.SLAUGHTERED, 0),
        "expected_animals": -(-total // SHARES_PER_ANIMAL[kc.animal_type]) if total else 0,
    }


# --- Distribution ---------------------------------------------------------------

async def _next_numbers(db: AsyncSession, kc: KurbanCampaign, count: int) -> list[str]:
    existing = set((await db.execute(
        select(KurbanAnimal.animal_number).where(KurbanAnimal.campaign_id == kc.id)
    )).scalars().all())
    numbers, n = [], 1
    while len(numbers) < count:
        candidate = f"{kc.animal_prefix}-{n:03d}"
        if candidate not in existing:
            numbers.append(candidate)
        n += 1
    return numbers


def _free_numbers(taken: set[int], capacity: int) -> list[int]:
    return [n for n in range(1, capacity + 1) if n not in taken]


@router.post("/campaigns/{campaign_id}/distribute", dependencies=[Depends(require_capability("kurban.manage"))])
async def distribute_shares(request: Request, campaign_id: UUID, db: AsyncSession = Depends(get_db),
                            current_user: User = WRITE):
    """Atanmamış hisseleri hayvanlara dağıtır; gerekirse yeni hayvan oluşturur."""
    org_id = _org_id(request)
    kc = (await db.execute(
        select(KurbanCampaign).where(KurbanCampaign.id == campaign_id, KurbanCampaign.organization_id == org_id).with_for_update()
    )).scalar_one_or_none()
    if not kc:
        raise HTTPException(status_code=404, detail="Kurban kampanyası bulunamadı")
    capacity = SHARES_PER_ANIMAL[kc.animal_type]
    pending = (await db.execute(
        select(KurbanShare).where(KurbanShare.campaign_id == kc.id, KurbanShare.animal_id.is_(None))
        .order_by(KurbanShare.created_at, KurbanShare.id).with_for_update()
    )).scalars().all()
    if not pending:
        return {"assigned": 0, "new_animals": 0}

    animals = (await db.execute(
        select(KurbanAnimal).where(KurbanAnimal.campaign_id == kc.id, KurbanAnimal.status == KurbanStatus.WAITING)
        .order_by(KurbanAnimal.animal_number).with_for_update()
    )).scalars().all()
    taken: dict[UUID, set[int]] = {a.id: set() for a in animals}
    for animal_id, number in (await db.execute(
        select(KurbanShare.animal_id, KurbanShare.share_number).where(KurbanShare.animal_id.in_([a.id for a in animals]))
    )).all():
        taken[animal_id].add(number or 0)

    # Keep each donation's shares together; groups larger than one animal are split.
    groups: "OrderedDict[UUID | str, list[KurbanShare]]" = OrderedDict()
    for share in pending:
        groups.setdefault(share.donation_id or f"share-{share.id}", []).append(share)
    chunks = []
    for shares in groups.values():
        for i in range(0, len(shares), capacity):
            chunks.append(shares[i:i + capacity])
    # Largest first packs animals tighter (first-fit decreasing), order is otherwise stable.
    chunks.sort(key=len, reverse=True)

    used_numbers = set((await db.execute(
        select(KurbanAnimal.animal_number).where(KurbanAnimal.campaign_id == kc.id)
    )).scalars().all())
    counter = 0

    def next_number() -> str:
        nonlocal counter
        while True:
            counter += 1
            candidate = f"{kc.animal_prefix}-{counter:03d}"
            if candidate not in used_numbers:
                used_numbers.add(candidate)
                return candidate

    new_animals: list[KurbanAnimal] = []
    assigned = 0
    for chunk in chunks:
        target = next((a for a in animals if capacity - len(taken[a.id]) >= len(chunk)), None)
        if target is None:
            number = next_number()
            target = KurbanAnimal(
                organization_id=org_id, campaign_id=kc.id, animal_number=number, type=kc.animal_type,
                status=KurbanStatus.WAITING, country=kc.country,
            )
            db.add(target)
            await db.flush()
            animals.append(target)
            new_animals.append(target)
            taken[target.id] = set()
        free = _free_numbers(taken[target.id], capacity)
        for share, number in zip(chunk, free):
            share.animal_id, share.share_number = target.id, number
            taken[target.id].add(number)
            assigned += 1
    _audit(db, org_id, current_user, "kurban_hisse_dagit", {
        "kurban_campaign_id": str(kc.id), "assigned": assigned, "new_animals": len(new_animals),
    })
    await db.commit()
    return {"assigned": assigned, "new_animals": len(new_animals)}


# --- Animals ------------------------------------------------------------------------

def _animal_out(a: KurbanAnimal, shares: list[KurbanShare]) -> dict:
    return {
        "id": str(a.id),
        "campaign_id": str(a.campaign_id),
        "animal_number": a.animal_number,
        "type": a.type.value,
        "type_label": TYPE_LABELS[a.type],
        "capacity": a.capacity,
        "country": a.country,
        "status": a.status.value,
        "video_url": a.video_url,
        "slaughtered_at": a.slaughtered_at,
        "shares": [
            {"id": str(s.id), "share_number": s.share_number, "name": s.on_behalf_of or s.donor_name,
             "donor_name": s.donor_name, "kurban_type": s.kurban_type, "notified": bool(s.notified_at)}
            for s in sorted(shares, key=lambda s: s.share_number or 0)
        ],
    }


@router.get("/animals")
async def list_animals(
    request: Request,
    campaign_id: Optional[UUID] = None,
    status_filter: Optional[Literal["waiting", "slaughtered"]] = Query(default=None, alias="status"),
    q: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    _: User = READ,
):
    org_id = _org_id(request)
    query = select(KurbanAnimal).where(KurbanAnimal.organization_id == org_id)
    if campaign_id:
        query = query.where(KurbanAnimal.campaign_id == campaign_id)
    if status_filter:
        query = query.where(KurbanAnimal.status == KurbanStatus(status_filter))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(
            KurbanAnimal.animal_number.ilike(like),
            KurbanAnimal.id.in_(select(KurbanShare.animal_id).where(
                KurbanShare.organization_id == org_id,
                or_(KurbanShare.donor_name.ilike(like), KurbanShare.on_behalf_of.ilike(like), KurbanShare.donor_phone.ilike(like)),
            )),
        ))
    animals = (await db.execute(query.order_by(KurbanAnimal.animal_number).limit(2000))).scalars().all()
    shares = (await db.execute(
        select(KurbanShare).where(KurbanShare.animal_id.in_([a.id for a in animals]))
    )).scalars().all() if animals else []
    by_animal: dict = {}
    for s in shares:
        by_animal.setdefault(s.animal_id, []).append(s)
    return [_animal_out(a, by_animal.get(a.id, [])) for a in animals]


class AnimalCreate(BaseModel):
    campaign_id: UUID
    count: int = Field(default=1, ge=1, le=500)
    animal_number: Optional[str] = Field(default=None, max_length=50)


@router.post("/animals", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_capability("kurban.manage"))])
async def create_animals(request: Request, payload: AnimalCreate, db: AsyncSession = Depends(get_db),
                         current_user: User = WRITE):
    """Elle hayvan ekleme; numara verilmezse otomatik numaralanır."""
    org_id = _org_id(request)
    kc = await _campaign(db, org_id, payload.campaign_id)
    if payload.animal_number:
        if payload.count != 1:
            raise HTTPException(status_code=422, detail="Numara verildiğinde tek hayvan eklenebilir")
        number = sanitize_public_text(payload.animal_number)
        if (await db.execute(select(KurbanAnimal.id).where(KurbanAnimal.campaign_id == kc.id, KurbanAnimal.animal_number == number))).first():
            raise HTTPException(status_code=409, detail="Bu numarada bir hayvan zaten var")
        numbers = [number]
    else:
        numbers = await _next_numbers(db, kc, payload.count)
    created = []
    for number in numbers:
        animal = KurbanAnimal(organization_id=org_id, campaign_id=kc.id, animal_number=number, type=kc.animal_type,
                              status=KurbanStatus.WAITING, country=kc.country)
        db.add(animal)
        created.append(animal)
    await db.flush()
    _audit(db, org_id, current_user, "kurban_hayvan_ekle", {"kurban_campaign_id": str(kc.id), "count": len(created)})
    await db.commit()
    return [_animal_out(a, []) for a in created]


class AnimalUpdate(BaseModel):
    animal_number: Optional[str] = Field(default=None, max_length=50)
    video_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("video_url", mode="before")
    @classmethod
    def https_only(cls, value):
        if value is None or not str(value).strip():
            return None
        if not str(value).strip().startswith("https://"):
            raise ValueError("Video bağlantısı https:// ile başlamalıdır")
        return str(value).strip()


@router.put("/animals/{animal_id}", dependencies=[Depends(require_capability("kurban.manage"))])
async def update_animal(request: Request, animal_id: UUID, payload: AnimalUpdate, db: AsyncSession = Depends(get_db),
                        current_user: User = WRITE):
    org_id = _org_id(request)
    animal = await _animal(db, org_id, animal_id)
    if payload.animal_number:
        animal.animal_number = sanitize_public_text(payload.animal_number)
    animal.video_url = payload.video_url
    await db.commit()
    shares = (await db.execute(select(KurbanShare).where(KurbanShare.animal_id == animal.id))).scalars().all()
    return _animal_out(animal, shares)


@router.delete("/animals/{animal_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_capability("kurban.delete"))])
async def delete_animal(request: Request, animal_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = WRITE):
    org_id = _org_id(request)
    animal = await _animal(db, org_id, animal_id)
    if animal.status == KurbanStatus.SLAUGHTERED:
        raise HTTPException(status_code=409, detail="Kesilmiş hayvan silinemez")
    if (await db.execute(select(KurbanShare.id).where(KurbanShare.animal_id == animal.id))).first():
        raise HTTPException(status_code=409, detail="Hisse atanmış hayvan silinemez; önce hisseleri çıkarın")
    await db.delete(animal)
    await db.commit()


class SlaughterItem(BaseModel):
    animal_id: UUID
    video_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("video_url", mode="before")
    @classmethod
    def https_only(cls, value):
        return AnimalUpdate.https_only(value)


class SlaughterRequest(BaseModel):
    items: List[SlaughterItem] = Field(min_length=1, max_length=500)
    notify: bool = True


def _portal_url(organization) -> str:
    if settings.ENVIRONMENT == "production" and getattr(organization, "primary_domain", None):
        return f"https://{organization.primary_domain}/portal"
    return f"{settings.PUBLIC_WEB_URL.rstrip('/')}/portal"


@router.post("/animals/slaughter", dependencies=[Depends(require_capability("kurban.slaughter"))])
async def slaughter_animals(request: Request, payload: SlaughterRequest, db: AsyncSession = Depends(get_db),
                            current_user: User = WRITE):
    """Kesildi işaretleme (tekli veya toplu) ve hissedarlara bir kez 'kesildi' SMS'i."""
    from app.services.sms_service import event_template, send_event_sms

    org_id = _org_id(request)
    # The organisation can switch the "kurban kesildi" SMS off in its SMS templates.
    notify = payload.notify and (await event_template(db, org_id, "kurban_kesildi"))[1] == "auto"
    now = datetime.now(timezone.utc)
    portal = _portal_url(getattr(request.state, "organization", None))
    marked, sms_queued, sms_failed = 0, 0, 0
    for item in payload.items:
        animal = await _animal(db, org_id, item.animal_id, lock=True)
        if item.video_url:
            animal.video_url = item.video_url
        if animal.status != KurbanStatus.SLAUGHTERED:
            animal.status = KurbanStatus.SLAUGHTERED
            animal.slaughtered_at = now
            marked += 1
        shares = (await db.execute(
            select(KurbanShare).where(KurbanShare.animal_id == animal.id).with_for_update()
        )).scalars().all()
        notified_phones: set[str] = set()
        for share in shares:
            share.status = KurbanStatus.SLAUGHTERED
            if not notify or share.notified_at or not share.donor_phone:
                continue
            if share.donor_phone in notified_phones:
                share.notified_at = now
                continue
            queued = await send_event_sms(
                db, org_id, "kurban_kesildi", share.donor_phone, related=("kurban_share", share.id), source="kurban",
                extra={"ad_soyad": share.donor_name, "kimin_adina": share.on_behalf_of or share.donor_name,
                       "kurban_no": animal.animal_number, "portal": portal},
            )
            if queued:
                queued.donor_id = share.donor_id
                share.notified_at = now
                notified_phones.add(share.donor_phone)
                sms_queued += 1
            else:
                sms_failed += 1
    _audit(db, org_id, current_user, "kurban_kesim", {
        "animals": [str(i.animal_id) for i in payload.items], "marked": marked, "sms_queued": sms_queued,
    })
    await db.commit()
    return {"marked": marked, "sms_queued": sms_queued, "sms_failed": sms_failed}


async def _papers(db: AsyncSession, org_id: UUID, animals: list[KurbanAnimal], org_name: str, organization=None) -> Response:
    from app.utils.kurban_pdf import build_kurban_papers

    shares = (await db.execute(
        select(KurbanShare).where(KurbanShare.animal_id.in_([a.id for a in animals]))
    )).scalars().all() if animals else []
    by_animal: dict = {}
    for s in shares:
        by_animal.setdefault(s.animal_id, []).append(s)
    campaigns = {c.id: c for c in (await db.execute(
        select(KurbanCampaign).where(KurbanCampaign.id.in_({a.campaign_id for a in animals}))
    )).scalars().all()} if animals else {}
    data = []
    for a in animals:
        kc = campaigns.get(a.campaign_id)
        data.append({
            "number": a.animal_number,
            "type_label": TYPE_LABELS[a.type],
            "country": a.country or (kc.country if kc else ""),
            "season": f"Kurban {kc.season_year}" if kc and kc.season_year else "",
            "shares": [
                {"name": s.on_behalf_of or s.donor_name, "kurban_type": KURBAN_TYPES.get(s.kurban_type, s.kurban_type)}
                for s in sorted(by_animal.get(a.id, []), key=lambda s: s.share_number or 0)
            ],
        })
    pdf = build_kurban_papers(org_name, data, organization=organization)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="kurban-kagitlari.pdf"'})


@router.get("/animals/{animal_id}/paper.pdf")
async def animal_paper(request: Request, animal_id: UUID, db: AsyncSession = Depends(get_db), _: User = READ):
    org_id = _org_id(request)
    animal = await _animal(db, org_id, animal_id)
    org = getattr(request.state, "organization", None)
    return await _papers(db, org_id, [animal], getattr(org, "name", ""), organization=org)


@router.get("/campaigns/{campaign_id}/papers.pdf", dependencies=[Depends(require_capability("kurban.pdf"))])
async def campaign_papers(
    request: Request,
    campaign_id: UUID,
    status_filter: Optional[Literal["waiting", "slaughtered"]] = Query(default="waiting", alias="status"),
    db: AsyncSession = Depends(get_db),
    _: User = READ,
):
    """Kampanyadaki tüm hayvanların kurban kağıtları (sayfa başına bir hayvan)."""
    org_id = _org_id(request)
    kc = await _campaign(db, org_id, campaign_id)
    query = select(KurbanAnimal).where(KurbanAnimal.campaign_id == kc.id)
    if status_filter:
        query = query.where(KurbanAnimal.status == KurbanStatus(status_filter))
    animals = (await db.execute(query.order_by(KurbanAnimal.animal_number))).scalars().all()
    org = getattr(request.state, "organization", None)
    return await _papers(db, org_id, list(animals), getattr(org, "name", ""), organization=org)


# --- Shares ---------------------------------------------------------------------------

@router.get("/shares")
async def list_shares(
    request: Request,
    campaign_id: Optional[UUID] = None,
    assigned: Optional[bool] = None,
    status_filter: Optional[Literal["waiting", "slaughtered"]] = Query(default=None, alias="status"),
    kurban_type: Optional[str] = Query(default=None, max_length=16),
    q: Optional[str] = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    _: User = READ,
):
    org_id = _org_id(request)
    conditions = [KurbanShare.organization_id == org_id]
    if campaign_id:
        conditions.append(KurbanShare.campaign_id == campaign_id)
    if assigned is True:
        conditions.append(KurbanShare.animal_id.is_not(None))
    elif assigned is False:
        conditions.append(KurbanShare.animal_id.is_(None))
    if status_filter:
        conditions.append(KurbanShare.status == KurbanStatus(status_filter))
    if kurban_type:
        conditions.append(KurbanShare.kurban_type == kurban_type)
    if q:
        like = f"%{q.strip()}%"
        conditions.append(or_(KurbanShare.donor_name.ilike(like), KurbanShare.on_behalf_of.ilike(like),
                              KurbanShare.donor_phone.ilike(like)))
    total = (await db.execute(select(func.count(KurbanShare.id)).where(*conditions))).scalar_one()
    rows = (await db.execute(
        select(KurbanShare, KurbanAnimal.animal_number, Donation.receipt_number)
        .outerjoin(KurbanAnimal, KurbanAnimal.id == KurbanShare.animal_id)
        .outerjoin(Donation, Donation.id == KurbanShare.donation_id)
        .where(*conditions)
        .order_by(KurbanShare.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).all()
    return {
        "total": total,
        "items": [
            {
                "id": str(s.id), "campaign_id": str(s.campaign_id) if s.campaign_id else None,
                "animal_id": str(s.animal_id) if s.animal_id else None, "animal_number": number,
                "share_number": s.share_number, "donor_id": str(s.donor_id) if s.donor_id else None,
                "donor_name": s.donor_name, "donor_phone": s.donor_phone, "on_behalf_of": s.on_behalf_of,
                "kurban_type": s.kurban_type, "kurban_type_label": KURBAN_TYPES.get(s.kurban_type, s.kurban_type),
                "status": s.status.value, "notified": bool(s.notified_at), "receipt_number": receipt,
                "created_at": s.created_at,
            }
            for s, number, receipt in rows
        ],
    }


class ShareUpdate(BaseModel):
    on_behalf_of: Optional[str] = Field(default=None, max_length=200)
    kurban_type: Optional[str] = None
    animal_id: Optional[UUID] = None
    unassign: bool = False

    @field_validator("on_behalf_of", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) if value else value


@router.put("/shares/{share_id}", dependencies=[Depends(require_capability("kurban.manage"))])
async def update_share(request: Request, share_id: UUID, payload: ShareUpdate, db: AsyncSession = Depends(get_db),
                       current_user: User = WRITE):
    """Hissedar adını / türünü düzeltme veya hisseyi elle başka hayvana taşıma."""
    org_id = _org_id(request)
    share = (await db.execute(
        select(KurbanShare).where(KurbanShare.id == share_id, KurbanShare.organization_id == org_id).with_for_update()
    )).scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Hisse bulunamadı")
    if share.status == KurbanStatus.SLAUGHTERED:
        raise HTTPException(status_code=409, detail="Kesilmiş hisse değiştirilemez")
    if payload.on_behalf_of is not None:
        share.on_behalf_of = payload.on_behalf_of or None
    if payload.kurban_type:
        share.kurban_type = normalize_kurban_type(payload.kurban_type)
    if payload.unassign:
        share.animal_id, share.share_number = None, None
    elif payload.animal_id and payload.animal_id != share.animal_id:
        animal = await _animal(db, org_id, payload.animal_id, lock=True)
        if animal.campaign_id != share.campaign_id:
            raise HTTPException(status_code=409, detail="Hisse yalnız kendi kampanyasındaki hayvana taşınabilir")
        if animal.status == KurbanStatus.SLAUGHTERED:
            raise HTTPException(status_code=409, detail="Kesilmiş hayvana hisse eklenemez")
        numbers = set((await db.execute(
            select(KurbanShare.share_number).where(KurbanShare.animal_id == animal.id)
        )).scalars().all())
        free = _free_numbers(numbers, animal.capacity)
        if not free:
            raise HTTPException(status_code=409, detail=f"{animal.animal_number} numaralı hayvanda boş hisse yok")
        share.animal_id, share.share_number = animal.id, free[0]
    _audit(db, org_id, current_user, "kurban_hisse_guncelle", {"share_id": str(share.id)})
    await db.commit()
    return {"id": str(share.id), "animal_id": str(share.animal_id) if share.animal_id else None,
            "share_number": share.share_number, "on_behalf_of": share.on_behalf_of, "kurban_type": share.kurban_type}
