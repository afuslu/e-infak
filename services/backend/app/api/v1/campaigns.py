from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, case
from typing import Annotated, List, Optional
from uuid import UUID
from app.core.db import get_db
from app.models.campaign import HIDDEN_CAMPAIGN_TAG, Campaign, CampaignStatus, CampaignCategory
from app.schemas.campaign import CampaignCreate, CampaignUpdate, CampaignResponse, CampaignListResponse, CampaignStats
from app.api.deps import Permission, optional_staff, require_permission, require_module
from app.models.user import User, UserRole
from slugify import slugify
from app.schemas.campaign import CAMPAIGN_I18N
from app.utils.i18n import request_language


def _localized(campaign: Campaign, lang: Optional[str]) -> CampaignResponse:
    """Response in the requested language; untranslated fields keep the default text."""
    response = CampaignResponse.model_validate(campaign)
    overlay = (campaign.translations or {}).get(lang) if lang else None
    if overlay:
        response = response.model_copy(update={f: overlay[f] for f in CAMPAIGN_I18N if overlay.get(f)})
    return response

from app.services.donation_options import apply_to_campaign, needs_unit_price

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

# Columns that are NOT NULL: a null in the payload means "leave as is / use the default".
NOT_NULL_STK = ("campaign_type", "reference_amounts", "fixed_amount", "groups", "is_zakat", "show_on_site",
                "redirect_mode", "type_details", "donation_options")


def _without_null_defaults(data: dict) -> dict:
    return {k: v for k, v in data.items() if not (k in NOT_NULL_STK and v is None)}


def _apply_fixed_amount(campaign: Campaign) -> None:
    """"Sabit Tutar": the site's donation form offers only the TL reference amount (it already treats
    allow_custom_amount=False + one suggested amount as a fixed price)."""
    if campaign.donation_options:
        apply_to_campaign(campaign)
        return
    if campaign.fixed_amount and (campaign.reference_amounts or {}).get("TRY"):
        campaign.allow_custom_amount = False
        campaign.suggested_amounts_cents = [int(campaign.reference_amounts["TRY"])]


async def _check_tab(db: AsyncSession, organization_id, tab_id) -> None:
    if not tab_id:
        return
    from app.models.campaign import CampaignTab

    tab = await db.get(CampaignTab, tab_id)
    if not tab or str(tab.organization_id) != str(organization_id):
        raise HTTPException(status_code=404, detail="Kampanya sekmesi bulunamadı")
PUBLIC_STATUSES = (CampaignStatus.ACTIVE, CampaignStatus.PAUSED, CampaignStatus.COMPLETED)


@router.get("", response_model=CampaignListResponse)
async def list_campaigns(
    request: Request,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 25,
    status: Optional[CampaignStatus] = None,
    category: Optional[CampaignCategory] = None,
    featured: Optional[bool] = None,
    search: Optional[str] = None,
    campaign_type: Optional[str] = None,
    tab_id: Optional[UUID] = None,
    country: Optional[str] = None,
    group: Optional[str] = None,
    is_zakat: Optional[bool] = None,
    show_on_site: Optional[bool] = None,
    sort: Optional[str] = Query(None, pattern="^(display_order|collected_desc|newest|progress_desc|oldest|title)$"),
    db: AsyncSession = Depends(get_db),
):
    """List campaigns with filtering and pagination"""
    
    organization_id = request.state.organization_id
    
    # Build query
    base_filter = [
        Campaign.organization_id == organization_id,
        # System items (e.g. member dues) accept payments but are not listed as campaigns.
        or_(Campaign.tags.is_(None), ~Campaign.tags.any(HIDDEN_CAMPAIGN_TAG)),
    ]
    staff = await optional_staff(request, db)
    if not staff:
        # Drafts and cancelled campaigns are for the panel only; "Web / 1" off hides a campaign from the site lists.
        base_filter.append(Campaign.status.in_(PUBLIC_STATUSES))
        base_filter.append(Campaign.show_on_site.is_(True))

    # Global stats across all visible campaigns for this organization
    stats_row = (await db.execute(
        select(
            func.count().label("total_campaigns"),
            func.coalesce(func.sum(case((Campaign.status == CampaignStatus.ACTIVE, 1), else_=0)), 0).label("active_count"),
            func.coalesce(func.sum(case((Campaign.is_featured.is_(True), 1), else_=0)), 0).label("featured_count"),
            func.coalesce(func.sum(case((Campaign.status == CampaignStatus.COMPLETED, 1), else_=0)), 0).label("completed_count"),
            func.coalesce(func.sum(case((Campaign.status == CampaignStatus.DRAFT, 1), else_=0)), 0).label("draft_count"),
            func.coalesce(func.sum(case((Campaign.status == CampaignStatus.PAUSED, 1), else_=0)), 0).label("paused_count"),
            func.coalesce(func.sum(Campaign.collected_cents), 0).label("total_collected_cents"),
        ).where(*base_filter)
    )).one()

    query = select(Campaign).where(*base_filter)
    if status:
        query = query.where(Campaign.status == status)
    if category:
        query = query.where(Campaign.category == category)
    if featured is not None:
        query = query.where(Campaign.is_featured == featured)
    if search:
        query = query.where(or_(Campaign.title.ilike(f"%{search}%"), Campaign.display_name.ilike(f"%{search}%"),
                                Campaign.slug.ilike(f"%{search}%")))
    if campaign_type:
        query = query.where(Campaign.campaign_type == campaign_type)
    if tab_id:
        query = query.where(Campaign.tab_id == tab_id)
    if country:
        query = query.where(Campaign.country.ilike(f"%{country.strip()}%"))
    if group:
        query = query.where(func.array_to_string(Campaign.groups, ",").ilike(f"%{group.strip()}%"))
    if is_zakat is not None:
        query = query.where(Campaign.is_zakat.is_(is_zakat))
    if show_on_site is not None:
        query = query.where(Campaign.show_on_site.is_(show_on_site))
    
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Apply sorting and pagination
    if sort == "collected_desc":
        query = query.order_by(Campaign.collected_cents.desc(), Campaign.created_at.desc())
    elif sort == "newest":
        query = query.order_by(Campaign.created_at.desc())
    elif sort == "oldest":
        query = query.order_by(Campaign.created_at.asc())
    elif sort == "title":
        query = query.order_by(Campaign.title.asc())
    elif sort == "progress_desc":
        ratio = (Campaign.collected_cents * 1.0) / func.nullif(Campaign.target_cents, 0)
        query = query.order_by(ratio.desc().nullslast(), Campaign.collected_cents.desc())
    else:
        query = query.order_by(Campaign.display_order.desc(), Campaign.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    campaigns = result.scalars().all()
    
    lang = request_language(request)
    return CampaignListResponse(
        items=[_localized(c, lang) for c in campaigns],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
        stats=CampaignStats(
            total_campaigns=int(stats_row.total_campaigns or 0),
            active_count=int(stats_row.active_count or 0),
            featured_count=int(stats_row.featured_count or 0),
            completed_count=int(stats_row.completed_count or 0),
            draft_count=int(stats_row.draft_count or 0),
            paused_count=int(stats_row.paused_count or 0),
            total_collected_cents=int(stats_row.total_collected_cents or 0),
        ),
    )


@router.get("/id/{campaign_id}", response_model=CampaignResponse)
async def get_campaign_by_id(
    request: Request,
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("site", write=False)),
):
    """Panel: one campaign by id, whatever its status (the edit page)."""
    campaign = (await db.execute(select(Campaign).where(
        Campaign.id == campaign_id, Campaign.organization_id == request.state.organization_id,
    ))).scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
    return campaign


@router.get("/{slug}", response_model=CampaignResponse)
async def get_campaign(
    request: Request,
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get campaign by slug"""
    
    organization_id = request.state.organization_id
    
    query = select(Campaign).where(
        Campaign.organization_id == organization_id,
        Campaign.slug == slug,
    )
    if not await optional_staff(request, db):
        query = query.where(Campaign.status.in_(PUBLIC_STATUSES))

    result = await db.execute(query)
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
    
    return _localized(campaign, request_language(request))


@router.post("", response_model=CampaignResponse, status_code=201)
async def create_campaign(
    request: Request,
    campaign_in: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("site")),
):
    """Create new campaign (admin only)"""
    
    organization_id = request.state.organization_id
    
    # Generate slug if not provided
    slug = campaign_in.slug or slugify(campaign_in.title)
    
    # Check slug uniqueness
    existing = await db.execute(
        select(Campaign).where(
            Campaign.organization_id == organization_id,
            Campaign.slug == slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Campaign slug already exists")
    
    data = _without_null_defaults(campaign_in.model_dump(exclude={"slug"}))
    if (data.get("fixed_amount") or needs_unit_price(data.get("donation_options"))) and not (data.get("reference_amounts") or {}).get("TRY"):
        raise HTTPException(status_code=422, detail="Bu bağış şekli için TL tutarını girin")
    await _check_tab(db, organization_id, data.get("tab_id"))
    campaign = Campaign(
        organization_id=organization_id,
        slug=slug,
        **data,
    )
    
    _apply_fixed_amount(campaign)
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    
    return campaign


@router.patch("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    request: Request,
    campaign_id: UUID,
    campaign_in: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("site")),
):
    """Update campaign (admin only)"""
    
    organization_id = request.state.organization_id
    
    query = select(Campaign).where(
        Campaign.id == campaign_id,
        Campaign.organization_id == organization_id,
    )
    
    result = await db.execute(query)
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Update fields
    payload = _without_null_defaults(campaign_in.model_dump(exclude_unset=True))
    if "tab_id" in payload:
        await _check_tab(db, organization_id, payload["tab_id"])
    fixed = payload.get("fixed_amount", campaign.fixed_amount)
    refs = payload.get("reference_amounts", campaign.reference_amounts) or {}
    options = payload.get("donation_options", campaign.donation_options)
    if options:
        fixed = needs_unit_price(options)
    if fixed and not refs.get("TRY"):
        raise HTTPException(status_code=422, detail="Bu bağış şekli için TL tutarını girin")
    if "slug" in payload and payload["slug"] is not None:
        new_slug = slugify(payload["slug"])
        if not new_slug:
            raise HTTPException(status_code=400, detail="Geçersiz URL slug")
        if new_slug != campaign.slug:
            dup = await db.execute(
                select(Campaign.id).where(
                    Campaign.organization_id == organization_id,
                    Campaign.slug == new_slug,
                    Campaign.id != campaign.id,
                )
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Bu URL slug zaten kullanımda")
            payload["slug"] = new_slug
        else:
            payload.pop("slug", None)
    for field, value in payload.items():
        setattr(campaign, field, value)
    _apply_fixed_amount(campaign)
    
    await db.commit()
    await db.refresh(campaign)
    
    return campaign


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    request: Request,
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("site")),
):
    """Deletes a campaign created by mistake. One with donations or payments is kept for the
    records: it can be closed (status "completed" or "cancelled") instead."""
    from app.models.audit_log import AuditLog
    from app.models.donation import Donation
    from app.models.payment import PaymentOrderItem

    campaign = (await db.execute(select(Campaign).where(
        Campaign.id == campaign_id, Campaign.organization_id == request.state.organization_id,
    ))).scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
    used = (await db.execute(select(Donation.id).where(Donation.campaign_id == campaign.id).limit(1))).first() or (
        await db.execute(select(PaymentOrderItem.id).where(PaymentOrderItem.campaign_id == campaign.id).limit(1))).first()
    if used:
        raise HTTPException(status_code=409, detail="Bu kampanyaya bağış yapılmış; silinemez. Durumunu 'Tamamlandı' veya 'İptal' yapın.")
    db.add(AuditLog(organization_id=campaign.organization_id, user_id=current_user.id, action="kampanya_sil",
                    details={"campaign_id": str(campaign.id), "title": campaign.title}))
    try:
        await db.delete(campaign)
        await db.commit()
    except Exception as exc:  # other records (kurban, wells, SMS templates…) still point to it
        await db.rollback()
        raise HTTPException(status_code=409, detail="Kampanya başka kayıtlarda kullanılıyor; silinemez, kapatılabilir.") from exc
