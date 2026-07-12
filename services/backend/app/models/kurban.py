from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from app.core.db import Base

class KurbanCampaignStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"

class KurbanAnimalType(str, enum.Enum):
    COW = "cow"
    SHEEP = "sheep"

class KurbanStatus(str, enum.Enum):
    WAITING = "waiting"
    SLAUGHTERED = "slaughtered"

class KurbanCampaign(Base):
    __tablename__ = "kurban_campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    
    title = Column(String(300), nullable=False)
    description = Column(String(1000))
    price_per_share_cents = Column(Integer, nullable=False)
    status = Column(Enum(KurbanCampaignStatus), nullable=False, default=KurbanCampaignStatus.ACTIVE)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    organization = relationship("Organization")

class KurbanAnimal(Base):
    __tablename__ = "kurban_animals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("kurban_campaigns.id"), nullable=False, index=True)
    
    animal_number = Column(String(50), nullable=False)
    type = Column(Enum(KurbanAnimalType), nullable=False, default=KurbanAnimalType.COW)
    status = Column(Enum(KurbanStatus), nullable=False, default=KurbanStatus.WAITING)
    video_url = Column(String(500))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    campaign = relationship("KurbanCampaign", backref="animals")
    organization = relationship("Organization")

class KurbanShare(Base):
    __tablename__ = "kurban_shares"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    animal_id = Column(UUID(as_uuid=True), ForeignKey("kurban_animals.id"), nullable=False, index=True)
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id"), nullable=False, index=True)
    
    donor_name = Column(String(200), nullable=False)
    donor_phone = Column(String(20), nullable=False)
    share_number = Column(Integer, nullable=False, default=1)
    status = Column(Enum(KurbanStatus), nullable=False, default=KurbanStatus.WAITING)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    animal = relationship("KurbanAnimal", backref="shares")
    donation = relationship("Donation")
    organization = relationship("Organization")
