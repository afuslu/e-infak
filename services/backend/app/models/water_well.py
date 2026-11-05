from sqlalchemy import Column, String, DateTime, ForeignKey, Float, JSON, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class WaterWell(Base):
    __tablename__ = "water_wells"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=True, index=True)

    name = Column(String(200), nullable=False) # e.g. "Hz. Hamza Hayrat Kuyusu"
    location_name = Column(String(300), nullable=False) # e.g. "Çad, N'Djamena"
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(String(50), nullable=False, default="completed") # planned, funding, drilling, completed
    country = Column(String(100))
    description = Column(Text)
    # Funding: standard (free amount), fonlama (target + progress) or hisseli (fixed shares)
    funding_model = Column(String(16), nullable=False, default="standard", server_default="standard")
    target_cents = Column(Integer, nullable=False, default=0, server_default="0")
    collected_cents = Column(Integer, nullable=False, default=0, server_default="0")
    share_count = Column(Integer)
    share_price_cents = Column(Integer)
    donation_campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"), unique=True)

    gallery_urls = Column(JSON, nullable=False, default=list) # Array of photo/video urls

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    organization = relationship("Organization")
    donor = relationship("Donor")

    def __repr__(self):
        return f"<WaterWell {self.name} at {self.location_name}>"
