from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from uuid import UUID
from app.core.db import get_db
from app.models.campaign import Campaign, CampaignStatus, CampaignCategory
from app.schemas.campaign import CampaignCreate, CampaignUpdate, CampaignResponse, CampaignListResponse
from app.api.deps import Permission, require_permission
from app.models.user import User, UserRole
from slugify import slugify

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=CampaignListResponse)
async def list_campaigns(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status: Optional[CampaignStatus] = None,
    category: Optional[CampaignCategory] = None,
    featured: Optional[bool] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List campaigns with filtering and pagination"""
    
    organization_id = request.state.organization_id
    
    # Build query
    query = select(Campaign).where(Campaign.organization_id == organization_id)
    
    if status:
        query = query.where(Campaign.status == status)
    if category:
        query = query.where(Campaign.category == category)
    if featured is not None:
        query = query.where(Campaign.is_featured == featured)
    if search:
        query = query.where(Campaign.title.ilike(f"%{search}%"))
    
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # Apply pagination
    query = query.order_by(Campaign.display_order.desc(), Campaign.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    campaigns = result.scalars().all()
    
    return CampaignListResponse(
        items=campaigns,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


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
    
    result = await db.execute(query)
    campaign = result.scalar_one_or_none()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    return campaign


@router.post("", response_model=CampaignResponse, status_code=201)
async def create_campaign(
    request: Request,
    campaign_in: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.CONTENT_MANAGE)),
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
    
    campaign = Campaign(
        organization_id=organization_id,
        slug=slug,
        **campaign_in.model_dump(exclude={"slug"}),
    )
    
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
    current_user: User = Depends(require_permission(Permission.CONTENT_MANAGE)),
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
    for field, value in campaign_in.model_dump(exclude_unset=True).items():
        setattr(campaign, field, value)
    
    await db.commit()
    await db.refresh(campaign)
    
    return campaign
