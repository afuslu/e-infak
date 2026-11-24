"""Kurban organizasyonu.

Akış: kurban kampanyası bir web bağış kalemine bağlanır → o kaleme gelen her
onaylı bağış (online veya elle makbuz) otomatik olarak hisse(ler)e dönüşür →
"Hisseleri dağıt" atanmamış hisseleri büyükbaşlara 7'şerli (küçükbaşlara 1'er)
yerleştirir; aynı bağışın hisseleri mümkünse aynı hayvana konur → kesim
işaretlenince hissedarlara bir kez SMS gider, video bağışçı panelinde görünür.
"""
from datetime import date, datetime, time, timezone
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Permission, require_capability, require_feature, require_permission, require_module, masked
from app.core.config import settings
from app.core.db import get_db
from app.core.plans import Feature
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
from app.models.donation import Donation
from app.models.kurban import (
    ANIMAL_LABELS, KURBAN_TYPES, SHARES_PER_ANIMAL, VIDEO_STATUSES, KurbanAnimal, KurbanAnimalType, KurbanCampaign,
    KurbanCampaignStatus, KurbanShare, KurbanStatus,
)
from app.models.user import User
from app.services.donation_hooks import normalize_kurban_type
from app.services.kurban_placement import free_numbers as _free_numbers, place_shares
from app.utils.cms import slugify
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/kurban",
    tags=["kurban"],
    dependencies=[Depends(require_feature(Feature.KURBAN))],
)

READ = Depends(require_module("kurban", write=False))
WRITE = Depends(require_module("kurban"))
TYPE_LABELS = {KurbanAnimalType.COW: "Büyükbaş", KurbanAnimalType.SHEEP: "Küçükbaş"}
VideoStatus = Literal["none", "recorded", "sent"]


def _animal_label(kc: Optional[KurbanCampaign], animal_type: KurbanAnimalType) -> str:
    """Cins adı: kampanyada yazılıysa o ("Keçi"), yoksa Büyükbaş / Küçükbaş."""
    return (kc.animal_label if kc is not None and kc.animal_label else None) or TYPE_LABELS[animal_type]

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
    animal_label: Optional[str] = Field(default=None, max_length=30)
    auto_assign: bool = True
    status: Literal["active", "completed"] = "active"
    # Link to an existing website donation item, or let the system create one.
    donation_campaign_id: Optional[UUID] = None
    create_donation_campaign: bool = False

    @field_validator("title", "description", "country", "animal_label", mode="before")
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
        "animal_label": c.animal_label,
        "animal_label_options": {t.value: list(labels) for t, labels in ANIMAL_LABELS.items()},
        "auto_assign": c.auto_assign,
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


class CountryIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(str(value or "").strip())


class CountriesIn(BaseModel):
    countries: List[CountryIn] = Field(default_factory=list, max_length=100)


async def _countries(db: AsyncSession, org_id: UUID) -> list[dict]:
    from app.models.organization import Organization

    org = await db.get(Organization, org_id)
    stored = ((org.settings or {}) if org else {}).get("kurban_countries") or []
    used = dict((await db.execute(
        select(KurbanCampaign.country, func.count()).where(KurbanCampaign.organization_id == org_id, KurbanCampaign.country.isnot(None))
        .group_by(KurbanCampaign.country))).all())
    out = [{"name": c["name"], "active": bool(c.get("active", True)), "campaigns": used.pop(c["name"], 0)} for c in stored if c.get("name")]
    # Countries already written on campaigns but not in the list yet are offered too.
    out += [{"name": name, "active": True, "campaigns": n, "unlisted": True} for name, n in sorted(used.items())]
    return out


@router.get("/countries", dependencies=[READ])
async def list_countries(request: Request, db: AsyncSession = Depends(get_db)):
    """STK PRO "Kurban Ülkesi Yönetimi": the countries kurban campaigns are slaughtered in."""
    return await _countries(db, _org_id(request))


@router.put("/countries", dependencies=[Depends(require_capability("kurban.manage"))])
async def save_countries(payload: CountriesIn, request: Request, db: AsyncSession = Depends(get_db)):
    from app.models.organization import Organization

    org_id = _org_id(request)
    seen, clean = set(), []
    for c in payload.countries:
        key = c.name.casefold()
        if key in seen:
            raise HTTPException(status_code=422, detail=f"{c.name} iki kez yazılmış")
        seen.add(key)
        clean.append({"name": c.name, "active": c.active})
    org = await db.get(Organization, org_id)
    org.settings = {**(org.settings or {}), "kurban_countries": clean}
    await db.commit()
    return await _countries(db, org_id)


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
        animal_label=payload.animal_label or None, auto_assign=payload.auto_assign,
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
    kc.animal_label, kc.auto_assign = payload.animal_label or None, payload.auto_assign
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


@router.post("/campaigns/{campaign_id}/distribute", dependencies=[Depends(require_capability("kurban.manage"))])
async def distribute_shares(request: Request, campaign_id: UUID, db: AsyncSession = Depends(get_db),
                            current_user: User = WRITE):
    """Atanmamış hisseleri hayvanlara dağıtır; gerekirse yeni hayvan oluşturur (kural: kurban_placement)."""
    org_id = _org_id(request)
    kc = await _campaign(db, org_id, campaign_id)
    assigned, new_animals = await place_shares(db, kc)
    if not assigned:
        return {"assigned": 0, "new_animals": 0}
    _audit(db, org_id, current_user, "kurban_hisse_dagit", {
        "kurban_campaign_id": str(kc.id), "assigned": assigned, "new_animals": len(new_animals),
    })
    await db.commit()
    return {"assigned": assigned, "new_animals": len(new_animals)}


# --- Bulk entry -----------------------------------------------------------------

class BulkRow(BaseModel):
    donor_name: str = Field(min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=30)
    # Hissedar adları; birden çok hisse için ";" ile ayrılır. Boşsa bağışçının adı.
    on_behalf_of: Optional[str] = Field(default=None, max_length=1000)
    kurban_type: str = "vacip"
    shares: int = Field(default=1, ge=1, le=70)
    payment_method: Literal["cash", "bank_transfer", "credit_card"] = "cash"
    status: Literal["paid", "pending"] = "paid"

    @field_validator("donor_name", "on_behalf_of", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value) if value else value


class BulkReceiptsIn(BaseModel):
    # İstemcinin ürettiği toplu iş anahtarı: aynı liste iki kez gönderilirse makbuzlar çoğalmaz.
    batch_key: str = Field(min_length=16, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    rows: List[BulkRow] = Field(min_length=1, max_length=500)
    paid_on: Optional[date] = None
    send_receipt: bool = False


@router.post("/campaigns/{campaign_id}/bulk-receipts")
async def bulk_receipts(request: Request, campaign_id: UUID, payload: BulkReceiptsIn, db: AsyncSession = Depends(get_db),
                        current_user: User = WRITE):
    """Toplu kurban girişi: her satır, elle makbuzla aynı yoldan (crm.create_manual_donation) kaydedilir.

    Bütün satırlar önce doğrulanır; biri bile geçersizse hiçbir şey kaydedilmez. Kayıt sırasında bir
    satır reddedilirse (ör. yetki, koçan) orada durulur: önceki satırlar kayıtlıdır ve yanıtta
    görünür; aynı `batch_key` ile yeniden gönderilince kayıtlı satırlar tekrar kesilmez.
    """
    from pydantic import ValidationError

    from app.api.v1 import crm
    from app.services.kurban_placement import kurban_numbers

    org_id = _org_id(request)
    kc = await _campaign(db, org_id, campaign_id)
    if not kc.donation_campaign_id:
        raise HTTPException(status_code=409, detail="Bu kurban kampanyası bir bağış kalemine bağlı değil; önce Kampanya Ayarları'ndan bağlayın")
    if kc.status == KurbanCampaignStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="Kurban kampanyası tamamlanmış; yeni hisse kaydı alınamaz")
    manual: list[crm.ManualDonationIn] = []
    for index, row in enumerate(payload.rows, start=1):
        names = [n.strip() for n in (row.on_behalf_of or "").replace("\n", ";").split(";") if n.strip()]
        if len(names) > row.shares:
            raise HTTPException(status_code=422, detail=f"{index}. satır: {row.shares} hisse için {len(names)} isim yazılmış")
        first, _, last = row.donor_name.strip().rpartition(" ")
        try:
            manual.append(crm.ManualDonationIn(
                idempotency_key=f"{payload.batch_key}-{index:04d}",
                donor=crm.ManualDonor(first_name=first or last, last_name=last if first else None, phone=row.phone or None),
                campaign_id=kc.donation_campaign_id, amount_cents=kc.price_per_share_cents * row.shares,
                payment_method=row.payment_method, status=row.status, paid_on=payload.paid_on,
                on_behalf_of=names[0] if names else None, send_receipt=payload.send_receipt, quantity=row.shares,
                metadata={"kurban_type": normalize_kurban_type(row.kurban_type), "kurban_names": names},
            ))
        except ValidationError as exc:
            message = "; ".join(str(e.get("msg", "")).removeprefix("Value error, ") for e in exc.errors())
            raise HTTPException(status_code=422, detail=f"{index}. satır: {message}") from exc

    results, failed = [], None
    for index, item in enumerate(manual, start=1):
        try:
            receipt = await crm.create_manual_donation(request, item, db, current_user)
        except HTTPException as exc:
            await db.rollback()
            failed = {"row": index, "detail": str(exc.detail)}
            break
        results.append({"row": index, "donation_id": receipt["id"], "receipt_number": receipt["receipt_number"],
                        "status": receipt["status"], "donor_name": payload.rows[index - 1].donor_name})
    numbers = await kurban_numbers(db, [UUID(r["donation_id"]) for r in results])
    for r in results:
        r["kurban_shares"] = numbers.get(UUID(r["donation_id"]), [])
    return {"created": results, "failed": failed, "total": len(manual)}


BULK_COLUMNS = {  # folded header -> row field
    "bagisci": "donor_name", "bagisciadi": "donor_name", "adsoyad": "donor_name", "ad": "donor_name", "isim": "donor_name",
    "telefon": "phone", "tel": "phone", "cep": "phone", "ceptelefonu": "phone", "gsm": "phone",
    "kiminadina": "on_behalf_of", "adina": "on_behalf_of", "hissedar": "on_behalf_of", "hissedarlar": "on_behalf_of",
    "niyet": "kurban_type", "kurbanturu": "kurban_type", "tur": "kurban_type",
    "hisse": "shares", "hisseadedi": "shares", "adet": "shares", "hissesayisi": "shares",
    "odeme": "status", "odemedurumu": "status", "durum": "status",
    "odemeyontemi": "payment_method", "yontem": "payment_method",
}


def _fold_header(value) -> str:
    text = str(value or "").strip().lower()
    for src, dst in (("ı", "i"), ("İ".lower(), "i"), ("ğ", "g"), ("ü", "u"), ("ş", "s"), ("ö", "o"), ("ç", "c")):
        text = text.replace(src, dst)
    return "".join(ch for ch in text if ch.isalnum())


@router.get("/bulk-template.xlsx")
async def bulk_template(request: Request, _: User = WRITE):
    """Toplu giriş şablonu: ilk satır başlıklar (bulk-parse bunları tanır), ikinci satır örnek."""
    from io import BytesIO

    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.worksheet.datavalidation import DataValidation
    from app.utils.excel_export import _clean_hex

    org = getattr(request.state, "organization", None)
    brand = _clean_hex(getattr(org, "theme_primary_color", None), "065F46")
    thin = Side(style="thin", color="E5E7EB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill(start_color=brand, end_color=brand, fill_type="solid")
    sample_fill = PatternFill(start_color="F9FAFB", end_color="F9FAFB", fill_type="solid")

    wb = Workbook()
    ws = wb.active
    ws.title = "Kurban"
    ws.append(["Bağışçı", "Telefon", "Kimin Adına", "Niyet", "Hisse", "Ödeme", "Ödeme Yöntemi"])
    ws.append(["Ahmet Yılmaz", "05551112233", "Merhum Mehmet Yılmaz; Annesi", "Vacip", 2, "Alındı", "Nakit"])
    ws.row_dimensions[1].height = 24
    for cell in ws[1]:
        cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="left", vertical="center")
        cell.border = border
    ws.row_dimensions[2].height = 20
    for cell in ws[2]:
        cell.font = Font(name="Calibri", size=10, color="374151")
        cell.fill = sample_fill
        cell.alignment = Alignment(horizontal="left", vertical="center")
        cell.border = border
    for column, width in zip("ABCDEFG", (24, 16, 34, 12, 8, 12, 16)):
        ws.column_dimensions[column].width = width
    lists = {"D": ",".join(KURBAN_TYPES.values()), "F": "Alındı,Bekliyor", "G": "Nakit,Havale,Kart"}
    for column, options in lists.items():
        rule = DataValidation(type="list", formula1=f'"{options}"', allow_blank=True)
        ws.add_data_validation(rule)
        rule.add(f"{column}2:{column}501")
    ws.freeze_panes = "A2"
    buffer = BytesIO()
    wb.save(buffer)
    return Response(content=buffer.getvalue(),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="kurban-toplu-giris-sablonu.xlsx"'})


@router.post("/bulk-parse")
async def bulk_parse(file: UploadFile = File(...), _: User = WRITE):
    """Toplu giriş için Excel/CSV dosyasını okur; kaydetmez, satırları ekrana döndürür.

    Sütunlar başlık adıyla eşleşir (Bağışçı, Telefon, Kimin Adına, Niyet, Hisse, Ödeme, Ödeme Yöntemi).
    """
    from app.api.v1.data_tools import MAX_FILE_BYTES, _cell, _read_table

    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Dosya çok büyük")
    try:
        headers, data, _sheets, _active = _read_table(content, file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    columns = {index: BULK_COLUMNS[_fold_header(h)] for index, h in enumerate(headers) if _fold_header(h) in BULK_COLUMNS}
    if "donor_name" not in columns.values():
        raise HTTPException(status_code=422, detail='Dosyanın ilk satırında "Bağışçı" başlığı olmalı')
    rows = []
    for raw in data[:500]:
        row: dict = {}
        for index, field in columns.items():
            value = _cell(raw[index]) if index < len(raw) else None
            if value is None or field in row:
                continue
            if field == "shares":
                try:
                    row[field] = max(1, int(float(str(value).replace(",", "."))))
                except ValueError:
                    continue
            elif field == "kurban_type":
                row[field] = normalize_kurban_type(value)
            elif field == "status":
                folded = _fold_header(value)
                row[field] = "paid" if folded.startswith(("alindi", "odendi", "evet", "tamam")) else "pending"
            elif field == "payment_method":
                folded = _fold_header(value)
                row[field] = ("bank_transfer" if folded.startswith(("banka", "havale", "eft"))
                              else "credit_card" if folded.startswith(("kart", "kredi", "pos")) else "cash")
            elif field == "phone":
                text = str(value)
                # Excel telefonu sayı yapar: 5551234567.0 → 05551234567
                if text.endswith(".0"):
                    text = text[:-2]
                row[field] = ("0" + text) if len(text) == 10 and text.startswith("5") else text
            else:
                row[field] = str(value)
        if row.get("donor_name"):
            rows.append(row)
    return {"rows": rows, "skipped_columns": [h for i, h in enumerate(headers) if i not in columns]}


# --- Animals ------------------------------------------------------------------------

def _animal_out(a: KurbanAnimal, shares: list[KurbanShare], kc: Optional[KurbanCampaign] = None) -> dict:
    return {
        "id": str(a.id),
        "campaign_id": str(a.campaign_id),
        "animal_number": a.animal_number,
        "type": a.type.value,
        "type_label": TYPE_LABELS[a.type],
        "animal_label": _animal_label(kc, a.type),
        "capacity": a.capacity,
        "country": a.country,
        "status": a.status.value,
        "video_url": a.video_url,
        "video_status": a.video_status,
        "video_status_label": VIDEO_STATUSES.get(a.video_status, a.video_status),
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
    status_filter: Annotated[Optional[Literal["waiting", "slaughtered"]], Query(alias="status")] = None,
    q: Annotated[Optional[str], Query(max_length=100)] = None,
    db: AsyncSession = Depends(get_db),
    _: User = READ,
    has_free: Optional[bool] = None,
    video_status: Optional[VideoStatus] = None,
):
    org_id = _org_id(request)
    query = select(KurbanAnimal).where(KurbanAnimal.organization_id == org_id)
    if campaign_id:
        query = query.where(KurbanAnimal.campaign_id == campaign_id)
    if status_filter:
        query = query.where(KurbanAnimal.status == KurbanStatus(status_filter))
    if video_status:
        query = query.where(KurbanAnimal.video_status == video_status)
    if has_free is not None:
        # Boş hissesi olan (ya da dolu) hayvanlar: kapasite türden gelir (büyükbaş 7, küçükbaş 1).
        filled = select(func.count(KurbanShare.id)).where(KurbanShare.animal_id == KurbanAnimal.id).scalar_subquery()
        capacity = case((KurbanAnimal.type == KurbanAnimalType.COW, SHARES_PER_ANIMAL[KurbanAnimalType.COW]),
                        else_=SHARES_PER_ANIMAL[KurbanAnimalType.SHEEP])
        query = query.where(filled < capacity if has_free else filled >= capacity)
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
    campaigns = await _campaigns_of(db, animals)
    return [_animal_out(a, by_animal.get(a.id, []), campaigns.get(a.campaign_id)) for a in animals]


async def _campaigns_of(db: AsyncSession, animals) -> dict:
    ids = {a.campaign_id for a in animals}
    if not ids:
        return {}
    return {c.id: c for c in (await db.execute(select(KurbanCampaign).where(KurbanCampaign.id.in_(ids)))).scalars().all()}


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
    return [_animal_out(a, [], kc) for a in created]


class AnimalUpdate(BaseModel):
    animal_number: Optional[str] = Field(default=None, max_length=50)
    video_url: Optional[str] = Field(default=None, max_length=500)
    # Verilmezse dokunulmaz (eski istemciler yalnız numara ve bağlantı gönderir).
    video_status: Optional[VideoStatus] = None
    slaughtered_on: Optional[date] = None

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
        number = sanitize_public_text(payload.animal_number)
        if number != animal.animal_number and (await db.execute(select(KurbanAnimal.id).where(
                KurbanAnimal.campaign_id == animal.campaign_id, KurbanAnimal.animal_number == number))).first():
            raise HTTPException(status_code=409, detail="Bu numarada bir hayvan zaten var")
        animal.animal_number = number
    animal.video_url = payload.video_url
    _set_video_status(animal, payload.video_status)
    if payload.slaughtered_on:
        if animal.status != KurbanStatus.SLAUGHTERED:
            raise HTTPException(status_code=409, detail="Kesim tarihi yalnız kesilmiş hayvanda değiştirilir")
        animal.slaughtered_at = _slaughter_moment(payload.slaughtered_on)
    await db.commit()
    shares = (await db.execute(select(KurbanShare).where(KurbanShare.animal_id == animal.id))).scalars().all()
    return _animal_out(animal, shares, await _campaign(db, org_id, animal.campaign_id))


def _set_video_status(animal: KurbanAnimal, wanted: Optional[str]) -> None:
    """Açık seçim varsa o; yoksa bağlantı girilen hayvan en az "çekildi" olur, bağlantısı silinen "yok"."""
    if wanted:
        animal.video_status = wanted
    elif animal.video_url and animal.video_status == "none":
        animal.video_status = "recorded"
    elif not animal.video_url and animal.video_status == "recorded":
        animal.video_status = "none"


def _slaughter_moment(day: date) -> datetime:
    """Elle girilen kesim günü: gün ortası (saat bilinmiyor), gelecekte olamaz."""
    if day > datetime.now(timezone.utc).date():
        raise HTTPException(status_code=422, detail="Kesim tarihi gelecekte olamaz")
    return datetime.combine(day, time(12, 0), timezone.utc)


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
    # Kesim günü geriye dönük girilebilir; boşsa şimdi.
    slaughtered_on: Optional[date] = None
    video_status: Optional[VideoStatus] = None


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
    slaughtered_at = _slaughter_moment(payload.slaughtered_on) if payload.slaughtered_on else now
    portal = _portal_url(getattr(request.state, "organization", None))
    marked, sms_queued, sms_failed = 0, 0, 0
    for item in payload.items:
        animal = await _animal(db, org_id, item.animal_id, lock=True)
        if item.video_url:
            animal.video_url = item.video_url
        _set_video_status(animal, payload.video_status)
        if animal.status != KurbanStatus.SLAUGHTERED:
            animal.status = KurbanStatus.SLAUGHTERED
            animal.slaughtered_at = slaughtered_at
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
            # {video}: kesim videosunun bağlantısı; yoksa bağışçı paneli. Sunucuya yüklenmiş videoda
            # bağışçıya özel bağlantı gider, izleyip izlemediği görülür.
            from app.services.videos import video_for_animal, watch_url
            stored_video = await video_for_animal(db, animal.id)
            video_link = (await watch_url(db, org_id, stored_video.id, share.donor_id) if stored_video
                          else animal.video_url or portal)
            queued = await send_event_sms(
                db, org_id, "kurban_kesildi", share.donor_phone, related=("kurban_share", share.id), source="kurban",
                extra={"ad_soyad": share.donor_name, "kimin_adina": share.on_behalf_of or share.donor_name,
                       "kurban_no": animal.animal_number, "portal": portal, "video": video_link},
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


class VideoUpdate(BaseModel):
    animal_ids: List[UUID] = Field(min_length=1, max_length=500)
    video_status: VideoStatus
    video_url: Optional[str] = Field(default=None, max_length=500)

    @field_validator("video_url", mode="before")
    @classmethod
    def https_only(cls, value):
        return AnimalUpdate.https_only(value)


@router.post("/animals/video", dependencies=[Depends(require_capability("kurban.manage"))])
async def update_videos(request: Request, payload: VideoUpdate, db: AsyncSession = Depends(get_db),
                        current_user: User = WRITE):
    """Seçilen hayvanların video durumu (ve verilirse bağlantısı) toplu yazılır."""
    org_id = _org_id(request)
    animals = (await db.execute(select(KurbanAnimal).where(
        KurbanAnimal.organization_id == org_id, KurbanAnimal.id.in_(payload.animal_ids)).with_for_update())).scalars().all()
    for animal in animals:
        animal.video_status = payload.video_status
        if payload.video_url:
            animal.video_url = payload.video_url
    _audit(db, org_id, current_user, "kurban_video_durumu", {
        "animals": [str(a.id) for a in animals], "video_status": payload.video_status})
    await db.commit()
    return {"updated": len(animals)}


async def _cards(db: AsyncSession, shares: list[KurbanShare], organization=None) -> Response:
    """Kişiye özel isim kartları: hissedar başına bir sayfa."""
    from app.utils.kurban_pdf import build_kurban_cards

    animal_ids = {s.animal_id for s in shares if s.animal_id}
    animals = {a.id: a for a in (await db.execute(
        select(KurbanAnimal).where(KurbanAnimal.id.in_(animal_ids)))).scalars().all()} if animal_ids else {}
    campaign_ids = {s.campaign_id for s in shares if s.campaign_id}
    campaigns = {c.id: c for c in (await db.execute(
        select(KurbanCampaign).where(KurbanCampaign.id.in_(campaign_ids)))).scalars().all()} if campaign_ids else {}
    data = []
    for s in sorted(shares, key=lambda s: ((animals[s.animal_id].animal_number if s.animal_id in animals else "~"),
                                           s.share_number or 0, str(s.id))):
        animal, kc = animals.get(s.animal_id), campaigns.get(s.campaign_id)
        animal_type = animal.type if animal else (kc.animal_type if kc else KurbanAnimalType.SHEEP)
        data.append({
            "number": animal.animal_number if animal else "",
            "name": s.on_behalf_of or s.donor_name,
            "kurban_type": KURBAN_TYPES.get(s.kurban_type, s.kurban_type),
            "animal_label": _animal_label(kc, animal_type),
            "country": (animal.country if animal else None) or (kc.country if kc else "") or "",
            "year": kc.season_year if kc and kc.season_year else "",
            "share_number": s.share_number if animal and animal.capacity > 1 else None,
            "capacity": animal.capacity if animal else None,
        })
    pdf = build_kurban_cards(getattr(organization, "name", "") or "", data, organization=organization)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="kurban-isim-kartlari.pdf"'})


@router.get("/animals/{animal_id}/cards.pdf", dependencies=[Depends(require_capability("kurban.pdf"))])
async def animal_cards(request: Request, animal_id: UUID, db: AsyncSession = Depends(get_db), _: User = READ):
    org_id = _org_id(request)
    animal = await _animal(db, org_id, animal_id)
    shares = (await db.execute(select(KurbanShare).where(KurbanShare.animal_id == animal.id))).scalars().all()
    return await _cards(db, list(shares), organization=getattr(request.state, "organization", None))


@router.get("/campaigns/{campaign_id}/cards.pdf", dependencies=[Depends(require_capability("kurban.pdf"))])
async def campaign_cards(
    request: Request,
    campaign_id: UUID,
    status_filter: Annotated[Optional[Literal["waiting", "slaughtered"]], Query(alias="status")] = "waiting",
    db: AsyncSession = Depends(get_db),
    _: User = READ,
):
    """Kampanyadaki hayvana yerleşmiş bütün hissedarların isim kartları."""
    org_id = _org_id(request)
    kc = await _campaign(db, org_id, campaign_id)
    query = select(KurbanShare).where(KurbanShare.campaign_id == kc.id, KurbanShare.animal_id.is_not(None))
    if status_filter:
        query = query.where(KurbanShare.status == KurbanStatus(status_filter))
    shares = (await db.execute(query)).scalars().all()
    return await _cards(db, list(shares), organization=getattr(request.state, "organization", None))


class CardsRequest(BaseModel):
    share_ids: List[UUID] = Field(min_length=1, max_length=2000)


@router.post("/shares/cards.pdf", dependencies=[Depends(require_capability("kurban.pdf"))])
async def share_cards(request: Request, payload: CardsRequest, db: AsyncSession = Depends(get_db), _: User = READ):
    """Seçilen hisselerin isim kartları (ör. toplu girişten hemen sonra)."""
    org_id = _org_id(request)
    shares = (await db.execute(select(KurbanShare).where(
        KurbanShare.organization_id == org_id, KurbanShare.id.in_(payload.share_ids)))).scalars().all()
    if not shares:
        raise HTTPException(status_code=404, detail="Hisse bulunamadı")
    return await _cards(db, list(shares), organization=getattr(request.state, "organization", None))


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
            "type_label": _animal_label(kc, a.type),
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


@router.get("/animals/{animal_id}/paper.pdf", dependencies=[Depends(require_capability("kurban.pdf"))])
async def animal_paper(request: Request, animal_id: UUID, db: AsyncSession = Depends(get_db), _: User = READ):
    org_id = _org_id(request)
    animal = await _animal(db, org_id, animal_id)
    org = getattr(request.state, "organization", None)
    return await _papers(db, org_id, [animal], getattr(org, "name", ""), organization=org)


@router.get("/campaigns/{campaign_id}/papers.pdf", dependencies=[Depends(require_capability("kurban.pdf"))])
async def campaign_papers(
    request: Request,
    campaign_id: UUID,
    status_filter: Annotated[Optional[Literal["waiting", "slaughtered"]], Query(alias="status")] = "waiting",
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
    status_filter: Annotated[Optional[Literal["waiting", "slaughtered"]], Query(alias="status")] = None,
    kurban_type: Annotated[Optional[str], Query(max_length=16)] = None,
    notified: Optional[bool] = None,
    q: Annotated[Optional[str], Query(max_length=100)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=1000)] = 100,
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
    if notified is True:
        conditions.append(KurbanShare.notified_at.is_not(None))
    elif notified is False:
        conditions.append(KurbanShare.notified_at.is_(None))
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
                "donor_name": s.donor_name, "donor_phone": masked(s.donor_phone), "on_behalf_of": s.on_behalf_of,
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


class ShareMove(BaseModel):
    share_ids: List[UUID] = Field(min_length=1, max_length=500)
    # Hedef hayvan; verilmezse hisselerin ataması kaldırılır.
    animal_id: Optional[UUID] = None


@router.post("/shares/move", dependencies=[Depends(require_capability("kurban.manage"))])
async def move_shares(request: Request, payload: ShareMove, db: AsyncSession = Depends(get_db),
                      current_user: User = WRITE):
    """Seçilen hisseleri tek işlemde bir hayvana taşır (ya da boşa çıkarır): hepsi ya da hiçbiri.

    Eskiden ekran her hisse için ayrı istek atıyordu; biri başarısız olunca yarısı taşınmış kalıyordu.
    """
    org_id = _org_id(request)
    shares = (await db.execute(select(KurbanShare).where(
        KurbanShare.organization_id == org_id, KurbanShare.id.in_(payload.share_ids)).with_for_update())).scalars().all()
    if len(shares) != len(set(payload.share_ids)):
        raise HTTPException(status_code=404, detail="Hisselerden bazıları bulunamadı")
    if any(s.status == KurbanStatus.SLAUGHTERED for s in shares):
        raise HTTPException(status_code=409, detail="Kesilmiş hisse taşınamaz")
    if payload.animal_id is None:
        for share in shares:
            share.animal_id, share.share_number = None, None
    else:
        animal = await _animal(db, org_id, payload.animal_id, lock=True)
        if animal.status == KurbanStatus.SLAUGHTERED:
            raise HTTPException(status_code=409, detail="Kesilmiş hayvana hisse eklenemez")
        if any(s.campaign_id != animal.campaign_id for s in shares):
            raise HTTPException(status_code=409, detail="Hisse yalnız kendi kampanyasındaki hayvana taşınabilir")
        moving = [s for s in shares if s.animal_id != animal.id]
        taken = set((await db.execute(select(KurbanShare.share_number).where(
            KurbanShare.animal_id == animal.id, KurbanShare.id.notin_([s.id for s in moving])))).scalars().all())
        free = _free_numbers(taken, animal.capacity)
        if len(free) < len(moving):
            raise HTTPException(status_code=409, detail=(
                f"{animal.animal_number} numaralı hayvanda {len(free)} boş hisse var; {len(moving)} hisse taşınamaz"))
        for share, number in zip(moving, free):
            share.animal_id, share.share_number = animal.id, number
    _audit(db, org_id, current_user, "kurban_hisse_toplu_tasi", {
        "shares": [str(s.id) for s in shares], "animal_id": str(payload.animal_id) if payload.animal_id else None})
    await db.commit()
    return {"moved": len(shares)}


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
    if payload.kurban_type and normalize_kurban_type(payload.kurban_type) != share.kurban_type:
        share.kurban_type = normalize_kurban_type(payload.kurban_type)
        donation = await db.get(Donation, share.donation_id) if share.donation_id else None
        if donation:
            # The receipt now follows the shares, even when they are set to the default type.
            donation.payment_details = {**(donation.payment_details or {}), "niyet_edited": True}
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
