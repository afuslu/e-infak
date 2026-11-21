from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from app.core.db import Base


# Ödeme alan ama sitede kampanya olarak listelenmeyen sistem kalemleri (ör. üye aidatı)
HIDDEN_CAMPAIGN_TAG = "sistem:gizli"


class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CampaignCategory(str, enum.Enum):
    EGITIM = "egitim"
    SAGLIK = "saglik"
    GIDA = "gida"
    SU = "su"
    YETIM = "yetim"
    KURBAN = "kurban"
    INSAAT = "insaat"
    GENEL = "genel"
    # Dinî bağış türleri (raporlarda ayrı izlenir)
    ZEKAT = "zekat"
    FITRE = "fitre"
    FIDYE = "fidye"
    SADAKA = "sadaka"
    ADAK = "adak"
    AKIKA = "akika"


CAMPAIGN_TYPES = ("standard", "sponsorship", "kurban", "water_well", "project", "food_package")


class CampaignTab(Base):
    """STK PRO "Kampanya Sekmeler": the tabs campaigns are grouped under on the donation pages."""
    __tablename__ = "campaign_tabs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("campaign_tabs.id", ondelete="SET NULL"), index=True)
    name = Column(String(120), nullable=False)
    slug = Column(String(140), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    display_order = Column(Integer, nullable=False, default=0, server_default="0")
    show_on_open = Column(Boolean, nullable=False, default=False, server_default="false")
    translations = Column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    
    slug = Column(String(200), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    summary = Column(Text, nullable=False)
    story = Column(Text)
    
    category = Column(Enum(CampaignCategory), nullable=False, default=CampaignCategory.GENEL)
    status = Column(Enum(CampaignStatus), nullable=False, default=CampaignStatus.DRAFT, index=True)
    
    # Financial
    target_cents = Column(Integer, nullable=False)  # Hedef tutar (kuruş cinsinden)
    currency = Column(String(3), nullable=False, default="TRY", server_default="TRY")  # hedef/toplanan para birimi
    collected_cents = Column(Integer, default=0)     # Toplanan tutar (kuruş cinsinden)
    
    # Media
    cover_image_url = Column(String(500))
    gallery_urls = Column(ARRAY(String), default=list)
    video_url = Column(String(500))
    
    # Donation Settings
    suggested_amounts_cents = Column(ARRAY(Integer), default=list)  # [5000, 10000, 25000]
    allow_custom_amount = Column(Boolean, default=True)
    min_donation_cents = Column(Integer, default=1000)  # Min 10 TL
    
    # Display Settings
    is_featured = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)
    show_collected = Column(Boolean, default=True)
    show_donor_list = Column(Boolean, default=True)
    
    # Dates
    start_date = Column(DateTime(timezone=True))
    end_date = Column(DateTime(timezone=True))
    
    # Meta
    tags = Column(ARRAY(String), default=list)
    translations = Column(JSONB, nullable=False, default=dict)
    checkout_fields_schema = Column(JSONB, nullable=False, default=list)

    # STK PRO campaign fields
    campaign_type = Column(String(20), nullable=False, default="standard", server_default="standard")
    display_name = Column(String(300))  # "Web Site Görünen Ad"; empty → title
    country = Column(String(100))
    reference_amounts = Column(JSONB, nullable=False, default=dict, server_default="{}")  # {"TRY": 1500000, "USD": …} cents
    fixed_amount = Column(Boolean, nullable=False, default=False, server_default="false")  # donor cannot type another amount
    quantity_multiplier = Column(Integer)  # receipts count adet × multiplier (1 purchase = N hisse)
    declaration_item = Column(String(120))  # "Beyanname Kalemi"
    groups = Column(ARRAY(String), nullable=False, default=list, server_default="{}")
    is_zakat = Column(Boolean, nullable=False, default=False, server_default="false")
    show_on_site = Column(Boolean, nullable=False, default=True, server_default="true")  # "Web / 1"
    tab_id = Column(UUID(as_uuid=True), ForeignKey("campaign_tabs.id", ondelete="SET NULL"), index=True)
    redirect_mode = Column(String(8), nullable=False, default="own", server_default="own")  # own | url | page
    redirect_target = Column(String(500))
    seo_title = Column(String(200))
    seo_description = Column(String(400))
    type_details = Column(JSONB, nullable=False, default=dict, server_default="{}")  # e.g. kurban type, cins, hisse
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    organization = relationship("Organization", backref="campaigns")
    
    @property
    def target_lira(self):
        return self.target_cents / 100
    
    @property
    def collected_lira(self):
        return self.collected_cents / 100
    
    @property
    def progress_percentage(self):
        if self.target_cents == 0:
            return 0
        return min(100, (self.collected_cents / self.target_cents) * 100)
    
    @property
    def is_active(self):
        return self.status == CampaignStatus.ACTIVE
    
    def __repr__(self):
        return f"<Campaign {self.title}>"
