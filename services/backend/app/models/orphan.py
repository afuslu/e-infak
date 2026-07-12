from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Enum, Text, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from app.core.db import Base

class OrphanStatus(str, enum.Enum):
    WAITING = "waiting"
    SPONSORED = "sponsored"

class Orphan(Base):
    __tablename__ = "orphans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100))
    birth_date = Column(Date, nullable=False)
    gender = Column(String(10), nullable=False)
    country = Column(String(100), nullable=False)
    city = Column(String(100))
    description = Column(Text)
    photo_url = Column(String(500))
    
    monthly_sponsor_amount_cents = Column(Integer, nullable=False, default=40000)
    status = Column(Enum(OrphanStatus), nullable=False, default=OrphanStatus.WAITING)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    organization = relationship("Organization")

class OrphanSponsorship(Base):
    __tablename__ = "orphan_sponsorships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    orphan_id = Column(UUID(as_uuid=True), ForeignKey("orphans.id"), nullable=False, index=True)
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id"), nullable=True, index=True)
    
    donor_name = Column(String(200), nullable=False)
    donor_phone = Column(String(20), nullable=False)
    start_date = Column(DateTime(timezone=True), server_default=func.now())
    end_date = Column(DateTime(timezone=True))
    active = Column(Boolean, default=True, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    orphan = relationship("Orphan", backref="sponsorships")
    donation = relationship("Donation")
    organization = relationship("Organization")
