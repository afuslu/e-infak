from pydantic import BaseModel, Field, field_validator
from typing import Literal, Any, Optional, List, Dict
from datetime import datetime
from uuid import UUID
from pydantic import model_validator
from app.models.campaign import CampaignStatus, CampaignCategory
from app.utils.content import sanitize_long_text
from app.utils.i18n import clean_translations

CAMPAIGN_I18N = ("title", "summary", "story")

CampaignType = Literal["standard", "sponsorship", "kurban", "water_well", "project", "food_package"]
RefCurrency = Literal["TRY", "USD", "EUR", "GBP", "RUB", "SAR", "CHF"]


def _clean_reference_amounts(value):
    if value is None:
        return value
    if not isinstance(value, dict):
        raise ValueError("Referans tutarlar para birimi → kuruş olmalı")
    out = {}
    for currency, cents in value.items():
        if cents in (None, "", 0):
            continue
        cents = int(cents)
        if cents < 0 or cents > 10_000_000_000:
            raise ValueError("Referans tutar geçersiz")
        out[str(currency).upper()] = cents
    return out


class CampaignStkFields(BaseModel):
    """STK PRO campaign form: type tabs, reference amounts, web site settings."""
    campaign_type: Optional[CampaignType] = None
    display_name: Optional[str] = Field(None, max_length=300)
    country: Optional[str] = Field(None, max_length=100)
    reference_amounts: Optional[Dict[RefCurrency, int]] = None
    fixed_amount: Optional[bool] = None
    quantity_multiplier: Optional[int] = Field(None, ge=1, le=1000)
    declaration_item: Optional[str] = Field(None, max_length=120)
    groups: Optional[List[str]] = Field(None, max_length=20)
    is_zakat: Optional[bool] = None
    show_on_site: Optional[bool] = None
    tab_id: Optional[UUID] = None
    redirect_mode: Optional[Literal["own", "url", "page"]] = None
    redirect_target: Optional[str] = Field(None, max_length=500)
    seo_title: Optional[str] = Field(None, max_length=200)
    seo_description: Optional[str] = Field(None, max_length=400)
    type_details: Optional[Dict[str, Any]] = None

    @field_validator("reference_amounts", mode="before")
    @classmethod
    def ref_amounts(cls, value):
        return _clean_reference_amounts(value)

    @field_validator("groups", mode="before")
    @classmethod
    def clean_groups(cls, value):
        if value is None:
            return value
        return [g.strip()[:60] for g in value if isinstance(g, str) and g.strip()]

    @field_validator("display_name", "country", "declaration_item", "redirect_target", "seo_title", "seo_description", mode="before")
    @classmethod
    def blank(cls, value):
        return value.strip() or None if isinstance(value, str) else value

    @model_validator(mode="after")
    def check_redirect(self):
        if self.redirect_mode in ("url", "page") and not self.redirect_target:
            raise ValueError("Yönlendirme adresini yazın")
        if self.redirect_mode == "url" and self.redirect_target and not self.redirect_target.startswith(("https://", "http://", "/")):
            raise ValueError("Yönlendirme adresi http(s):// veya / ile başlamalı")
        if self.fixed_amount and self.reference_amounts is not None and not self.reference_amounts.get("TRY"):
            raise ValueError("Sabit tutar için TL referans tutarını girin")
        return self



class CampaignBase(CampaignStkFields):
    title: str = Field(..., max_length=300)
    summary: str
    story: Optional[str] = None
    category: CampaignCategory = CampaignCategory.GENEL
    target_cents: int = Field(..., ge=0)
    currency: Literal["TRY", "USD", "EUR", "GBP", "SAR", "CHF"] = "TRY"
    cover_image_url: Optional[str] = None
    gallery_urls: List[str] = []
    video_url: Optional[str] = None
    suggested_amounts_cents: List[int] = []
    allow_custom_amount: bool = True
    min_donation_cents: int = Field(default=1000, ge=100)
    is_featured: bool = False
    display_order: int = 0
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
        return sanitize_long_text(value)

    @field_validator("translations", mode="before")
    @classmethod
    def clean_i18n(cls, value):
        if value is None:
            return None
        return clean_translations(value, CAMPAIGN_I18N, long_fields=("story",), max_lengths={"title": 300})


class CampaignCreate(CampaignBase):
    slug: Optional[str] = None  # Will be auto-generated from title if not provided
    status: CampaignStatus = CampaignStatus.DRAFT


class CampaignUpdate(CampaignStkFields):
    slug: Optional[str] = Field(None, max_length=200)
    title: Optional[str] = Field(None, max_length=300)
    summary: Optional[str] = None
    story: Optional[str] = None
    category: Optional[CampaignCategory] = None
    status: Optional[CampaignStatus] = None
    target_cents: Optional[int] = Field(None, ge=0)
    currency: Optional[Literal["TRY", "USD", "EUR", "GBP", "SAR", "CHF"]] = None
    cover_image_url: Optional[str] = None
    gallery_urls: Optional[List[str]] = None
    video_url: Optional[str] = None
    suggested_amounts_cents: Optional[List[int]] = None
    allow_custom_amount: Optional[bool] = None
    min_donation_cents: Optional[int] = Field(None, ge=100)
    is_featured: Optional[bool] = None
    display_order: Optional[int] = None
    show_collected: Optional[bool] = None
    show_donor_list: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    translations: Optional[Dict[str, Dict[str, str]]] = None
    checkout_fields_schema: Optional[List[Dict[str, Any]]] = None

    @field_validator("story", mode="before")
    @classmethod
    def sanitize_story(cls, value: str | None) -> str | None:
        return sanitize_long_text(value)

    @field_validator("translations", mode="before")
    @classmethod
    def clean_i18n(cls, value):
        if value is None:
            return None
        return clean_translations(value, CAMPAIGN_I18N, long_fields=("story",), max_lengths={"title": 300})


class CampaignResponse(CampaignBase):
    campaign_type: str = "standard"
    reference_amounts: Dict[str, int] = {}
    fixed_amount: bool = False
    groups: List[str] = []
    is_zakat: bool = False
    show_on_site: bool = True
    redirect_mode: str = "own"
    type_details: Dict[str, Any] = {}
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


class CampaignStats(BaseModel):
    total_campaigns: int = 0
    active_count: int = 0
    featured_count: int = 0
    completed_count: int = 0
    draft_count: int = 0
    paused_count: int = 0
    total_collected_cents: int = 0


class CampaignListResponse(BaseModel):
    items: List[CampaignResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    stats: Optional[CampaignStats] = None
