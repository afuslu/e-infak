"""STK PRO "Kampanya Sekmeler" and "Kampanya Sayfaları"."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from slugify import slugify
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin_route_feature, require_admin_route_permission, require_module
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.campaign import HIDDEN_CAMPAIGN_TAG, Campaign, CampaignTab
from app.models.user import User
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features",
    tags=["campaign-tabs"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
site = require_module("site")
site_read = require_module("site", write=False)


class TabIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: Optional[UUID] = None
    is_active: bool = True
    display_order: int = Field(default=0, ge=-10_000, le=10_000)
    show_on_open: bool = False
    slug: Optional[str] = Field(default=None, max_length=140)

    @field_validator("name", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value.strip()) if isinstance(value, str) else value


class TabPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    parent_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = Field(default=None, ge=-10_000, le=10_000)
    show_on_open: Optional[bool] = None


def _org(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


def _out(tab: CampaignTab, names: dict, counts: dict) -> dict:
    return {
        "id": str(tab.id), "name": tab.name, "slug": tab.slug, "parent_id": str(tab.parent_id) if tab.parent_id else None,
        "parent_name": names.get(tab.parent_id), "is_active": tab.is_active, "display_order": tab.display_order,
        "show_on_open": tab.show_on_open, "campaign_count": counts.get(tab.id, 0), "created_at": tab.created_at,
    }


async def _load(db: AsyncSession, org_id: UUID, tab_id: UUID) -> CampaignTab:
    tab = await db.get(CampaignTab, tab_id)
    if not tab or tab.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Sekme bulunamadı")
    return tab


async def _check_parent(db: AsyncSession, org_id: UUID, parent_id: Optional[UUID], self_id: Optional[UUID] = None) -> None:
    if not parent_id:
        return
    if parent_id == self_id:
        raise HTTPException(status_code=422, detail="Sekme kendisinin üst kategorisi olamaz")
    await _load(db, org_id, parent_id)


@router.get("/campaign-tabs")
async def list_tabs(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(site_read)):
    org_id = _org(request)
    tabs = (await db.execute(select(CampaignTab).where(CampaignTab.organization_id == org_id)
                             .order_by(CampaignTab.display_order.desc(), CampaignTab.name))).scalars().all()
    counts = dict((await db.execute(
        select(Campaign.tab_id, func.count()).where(Campaign.organization_id == org_id, Campaign.tab_id.isnot(None))
        .group_by(Campaign.tab_id)
    )).all())
    names = {t.id: t.name for t in tabs}
    return [_out(t, names, counts) for t in tabs]


@router.post("/campaign-tabs", status_code=201)
async def create_tab(payload: TabIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(site)):
    org_id = _org(request)
    await _check_parent(db, org_id, payload.parent_id)
    base = slugify(payload.slug or payload.name) or "sekme"
    slug, n = base, 2
    while (await db.execute(select(CampaignTab.id).where(CampaignTab.organization_id == org_id, CampaignTab.slug == slug))).first():
        slug, n = f"{base}-{n}", n + 1
    tab = CampaignTab(organization_id=org_id, slug=slug, **payload.model_dump(exclude={"slug"}))
    db.add(tab)
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action="kampanya_sekme_ekle", details={"name": tab.name}))
    await db.commit()
    return _out(tab, {}, {})


@router.patch("/campaign-tabs/{tab_id}")
async def update_tab(tab_id: UUID, payload: TabPatch, request: Request, db: AsyncSession = Depends(get_db),
                     user: User = Depends(site)):
    org_id = _org(request)
    tab = await _load(db, org_id, tab_id)
    data = payload.model_dump(exclude_unset=True)
    if "parent_id" in data:
        await _check_parent(db, org_id, data["parent_id"], tab.id)
    for key, value in data.items():
        if key != "parent_id" and value is None:
            continue
        setattr(tab, key, value)
    await db.commit()
    return _out(tab, {}, {})


@router.delete("/campaign-tabs/{tab_id}", status_code=204)
async def delete_tab(tab_id: UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(site)):
    org_id = _org(request)
    tab = await _load(db, org_id, tab_id)
    await db.execute(update(Campaign).where(Campaign.tab_id == tab.id).values(tab_id=None))
    await db.execute(update(CampaignTab).where(CampaignTab.parent_id == tab.id).values(parent_id=None))
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action="kampanya_sekme_sil", details={"name": tab.name}))
    await db.delete(tab)
    await db.commit()


@router.get("/campaign-pages")
async def campaign_pages(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(site_read)):
    """STK PRO "Kampanya Sayfaları": every campaign's web address and whether it has its own page."""
    org_id = _org(request)
    rows = (await db.execute(
        select(Campaign).where(Campaign.organization_id == org_id,
                               or_(Campaign.tags.is_(None), ~Campaign.tags.any(HIDDEN_CAMPAIGN_TAG)))
        .order_by(Campaign.created_at.asc())
    )).scalars().all()
    return [{
        "id": str(c.id), "title": c.title, "display_name": c.display_name or c.title, "slug": c.slug,
        "campaign_type": c.campaign_type, "status": c.status.value,
        "has_page": c.redirect_mode == "own" and bool(c.story or c.summary),
        "redirect_mode": c.redirect_mode, "redirect_target": c.redirect_target,
        "seo_title": c.seo_title, "updated_at": c.updated_at or c.created_at,
    } for c in rows]
