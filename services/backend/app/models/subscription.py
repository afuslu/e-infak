from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=False, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False, index=True)

    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), default="TRY", nullable=False)
    status = Column(String(20), default="active", nullable=False, index=True) # active, paused, cancelled
    card_token = Column(String(100))
    next_charge_date = Column(DateTime(timezone=True), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization")
    donor = relationship("Donor")
    campaign = relationship("Campaign")

    def __repr__(self):
        return f"<Subscription {self.id} - {self.amount_cents / 100} {self.currency} - {self.status}>"
