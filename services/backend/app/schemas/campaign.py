from pydantic import BaseModel, Field, field_validator
from typing import Literal, Any, Optional, List, Dict
from datetime import datetime
from uuid import UUID
from app.models.campaign import CampaignStatus, CampaignCategory
from app.utils.content import sanitize_public_text
from app.utils.i18n import clean_translations

CAMPAIGN_I18N = ("title", "summary", "story")


class CampaignBase(BaseModel):
    title: str = Field(..., max_length=300)
    summary: str
    story: Optional[str] = None
    category: CampaignCategory = CampaignCategory.GENEL
    target_cents: int = Field(..., ge=0)
    currency: Literal["TRY", "USD", "EUR"] = "TRY"
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

    @field_validator("story", mode="before")
    @classmethod
    def sanitize_story(cls, value: str | None) -> str | None:
        return sanitize_public_text(value)

    @field_validator("translations", mode="before")
    @classmethod
    def clean_i18n(cls, value):
        if value is None:
            return None
        return clean_translations(value, CAMPAIGN_I18N, long_fields=("story",), max_lengths={"title": 300})


class CampaignCreate(CampaignBase):
    slug: Optional[str] = None  # Will be auto-generated from title if not provided


class CampaignUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    story: Optional[str] = None
    category: Optional[CampaignCategory] = None
    status: Optional[CampaignStatus] = None
    target_cents: Optional[int] = None
    currency: Optional[Literal["TRY", "USD", "EUR"]] = None
    cover_image_url: Optional[str] = None
    gallery_urls: Optional[List[str]] = None
    is_featured: Optional[bool] = None
    translations: Optional[Dict[str, Dict[str, str]]] = None
    checkout_fields_schema: Optional[List[Dict[str, Any]]] = None

    @field_validator("story", mode="before")
    @classmethod
    def sanitize_story(cls, value: str | None) -> str | None:
        return sanitize_public_text(value)

    @field_validator("translations", mode="before")
    @classmethod
    def clean_i18n(cls, value):
        if value is None:
            return None
        return clean_translations(value, CAMPAIGN_I18N, long_fields=("story",), max_lengths={"title": 300})


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
