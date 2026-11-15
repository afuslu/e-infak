from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base


class DonationCategory(Base):
    __tablename__ = "donation_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=True)

    icon = Column(String(10), nullable=False, default="🤝")
    image_url = Column(String(500), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=False)
    donation_type = Column(String(40), nullable=True)
    target_url = Column(String(500), nullable=True)
    suggested_amounts_cents = Column(ARRAY(Integer), nullable=False, default=list, server_default="{}")
    translations = Column(JSONB, nullable=False, default=dict, server_default="{}")
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization")
    campaign = relationship("Campaign")

    def __repr__(self):
        return f"<DonationCategory {self.title}>"
