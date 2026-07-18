from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from app.core.db import Base


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
