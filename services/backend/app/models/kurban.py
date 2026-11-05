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
    COW = "cow"      # büyükbaş: 7 hisse
    SHEEP = "sheep"  # küçükbaş: 1 hisse


class KurbanStatus(str, enum.Enum):
    WAITING = "waiting"
    SLAUGHTERED = "slaughtered"


# Niyet türleri; hepsi aynı büyükbaşta birlikte bulunabilir.
KURBAN_TYPES = {
    "vacip": "Vacip",
    "adak": "Adak",
    "akika": "Akika",
    "sukur": "Şükür",
    "nafile": "Nafile",
    "sadaka": "Sadaka",
}

SHARES_PER_ANIMAL = {KurbanAnimalType.COW: 7, KurbanAnimalType.SHEEP: 1}


class KurbanCampaign(Base):
    """A kurban offering for one season / country / animal type (e.g. 'Çad Büyükbaş 2026')."""
    __tablename__ = "kurban_campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    description = Column(String(1000))
    price_per_share_cents = Column(Integer, nullable=False)
    status = Column(Enum(KurbanCampaignStatus), nullable=False, default=KurbanCampaignStatus.ACTIVE)
    # Website donations to this campaign become kurban shares automatically.
    donation_campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"), unique=True)
    animal_type = Column(Enum(KurbanAnimalType), nullable=False, default=KurbanAnimalType.COW, server_default="COW")
    country = Column(String(100))
    season_year = Column(Integer)
    animal_prefix = Column(String(10), nullable=False, default="K", server_default="K")
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
    country = Column(String(100))
    slaughtered_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    campaign = relationship("KurbanCampaign", backref="animals")
    organization = relationship("Organization")

    @property
    def capacity(self) -> int:
        return SHARES_PER_ANIMAL.get(self.type, 1)


class KurbanShare(Base):
    """One hisse. Unassigned (animal_id NULL) until distributed to an animal."""
    __tablename__ = "kurban_shares"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("kurban_campaigns.id"), index=True)
    animal_id = Column(UUID(as_uuid=True), ForeignKey("kurban_animals.id"), nullable=True, index=True)
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id"), nullable=True, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=True, index=True)
    donor_name = Column(String(200), nullable=False)
    donor_phone = Column(String(20), nullable=False)
    # Name read aloud / written on the kurban paper ("X adına")
    on_behalf_of = Column(String(200))
    kurban_type = Column(String(16), nullable=False, default="vacip", server_default="vacip")
    share_number = Column(Integer)  # 1..7 within the animal once assigned
    status = Column(Enum(KurbanStatus), nullable=False, default=KurbanStatus.WAITING)
    notified_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    animal = relationship("KurbanAnimal", backref="shares")
    campaign = relationship("KurbanCampaign")
    donation = relationship("Donation")
    organization = relationship("Organization")
