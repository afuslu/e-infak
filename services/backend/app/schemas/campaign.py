from pydantic import BaseModel, Field
from typing import Any, Optional, List, Dict
from datetime import datetime
from uuid import UUID
from app.models.campaign import CampaignStatus, CampaignCategory


class CampaignBase(BaseModel):
    title: str = Field(..., max_length=300)
    summary: str
    story: Optional[str] = None
    category: CampaignCategory = CampaignCategory.GENEL
    target_cents: int = Field(..., gt=0)
    cover_image_url: Optional[str] = None
    gallery_urls: List[str] = []
    video_url: Optional[str] = None
    suggested_amounts_cents: List[int] = []
    allow_custom_amount: bool = True
    min_donation_cents: int = Field(default=1000, ge=100)
    is_featured: bool = False
    show_collected: bool = True
    show_donor_list: bool = True
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    tags: List[str] = []
    translations: Dict[str, Dict[str, str]] = {}
    checkout_fields_schema: List[Dict[str, Any]] = []


class CampaignCreate(CampaignBase):
    slug: Optional[str] = None  # Will be auto-generated from title if not provided


class CampaignUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    story: Optional[str] = None
    category: Optional[CampaignCategory] = None
    status: Optional[CampaignStatus] = None
    target_cents: Optional[int] = None
    cover_image_url: Optional[str] = None
    gallery_urls: Optional[List[str]] = None
    is_featured: Optional[bool] = None
    translations: Optional[Dict[str, Dict[str, str]]] = None
    checkout_fields_schema: Optional[List[Dict[str, Any]]] = None


class CampaignResponse(CampaignBase):
    id: UUID
    organization_id: UUID
    slug: str
    status: CampaignStatus
    collected_cents: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Computed fields
    target_lira: float
    collected_lira: float
    progress_percentage: float

    class Config:
        from_attributes = True


class CampaignListResponse(BaseModel):
    items: List[CampaignResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
