from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
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
    status = Column(String(20), default="active", nullable=False, index=True)  # active, paused, cancelled
    card_token = Column(String(100))  # unused legacy column
    next_charge_date = Column(DateTime(timezone=True), nullable=False)
    # "card": charged automatically with the card the donor saved at the payment provider;
    # "reminder": a monthly SMS with a payment link (provider cannot store cards, or card not saved).
    mode = Column(String(16), nullable=False, default="reminder", server_default="reminder")
    day_of_month = Column(Integer, nullable=False, default=1, server_default="1")
    provider = Column(String(32))
    card_ref = Column(Text)  # Fernet-encrypted provider card reference, never the card number
    card_last_4 = Column(String(4))
    card_brand = Column(String(32))
    failed_attempts = Column(Integer, nullable=False, default=0, server_default="0")
    last_error = Column(String(500))
    last_charged_at = Column(DateTime(timezone=True))
    last_reminded_at = Column(DateTime(timezone=True))
    source_order_id = Column(UUID(as_uuid=True), ForeignKey("payment_orders.id", ondelete="SET NULL"))
    # Lets the donor stop the instruction from the link in an SMS without signing in.
    manage_token = Column(String(64), unique=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization")
    donor = relationship("Donor")
    campaign = relationship("Campaign")

    def __repr__(self):
        return f"<Subscription {self.id} - {self.amount_cents / 100} {self.currency} - {self.status}>"
