from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, Enum, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from app.core.db import Base


class DonorType(str, enum.Enum):
    INDIVIDUAL = "individual"
    CORPORATE = "corporate"


class Donor(Base):
    __tablename__ = "donors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    
    # Identity
    donor_type = Column(Enum(DonorType), nullable=False, default=DonorType.INDIVIDUAL)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100))
    company_name = Column(String(200))
    
    # Contact
    email = Column(String(255), index=True)
    phone = Column(String(20), index=True)
    
    # Address
    address = Column(Text)
    city = Column(String(100))
    country = Column(String(100), default="Türkiye")
    
    # Identity Numbers
    tc_no = Column(String(11))
    tax_number = Column(String(20))
    
    # Stats
    total_donations = Column(Integer, default=0)
    total_donated_cents = Column(Integer, default=0)
    first_donation_at = Column(DateTime(timezone=True))
    last_donation_at = Column(DateTime(timezone=True))
    
    # Preferences
    allow_email = Column(Boolean, default=False)
    allow_sms = Column(Boolean, default=False)
    is_anonymous = Column(Boolean, default=False)
    
    # Tags and Notes
    tags = Column(JSONB, default=list)
    notes = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    organization = relationship("Organization", backref="donors")
    
    @property
    def full_name(self):
        if self.donor_type == DonorType.CORPORATE:
            return self.company_name
        return f"{self.first_name} {self.last_name or ''}".strip()
    
    def __repr__(self):
        return f"<Donor {self.full_name}>"


class DonationStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class PaymentMethod(str, enum.Enum):
    CREDIT_CARD = "credit_card"
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"


class Donation(Base):
    __tablename__ = "donations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=False, index=True)
    
    # Receipt
    receipt_number = Column(String(50), unique=True, nullable=False, index=True)
    
    # Amount
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), default="TRY")
    
    # Payment
    payment_method = Column(Enum(PaymentMethod), nullable=False, default=PaymentMethod.CREDIT_CARD)
    status = Column(Enum(DonationStatus), nullable=False, default=DonationStatus.PENDING, index=True)
    
    # Payment Gateway Details
    transaction_id = Column(String(100), index=True)
    payment_provider = Column(String(50))
    payment_details = Column(JSONB, default=dict)
    
    # Card Info (masked)
    card_last_4 = Column(String(4))
    card_brand = Column(String(20))
    
    # Dates
    paid_at = Column(DateTime(timezone=True))
    refunded_at = Column(DateTime(timezone=True))
    
    # Receipt
    receipt_pdf_url = Column(String(500))
    receipt_sent_at = Column(DateTime(timezone=True))
    
    # Message
    donor_message = Column(Text)
    is_anonymous = Column(Boolean, default=False)
    
    # Idempotency
    idempotency_key = Column(String(100), unique=True, index=True)
    payment_order_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("payment_order_items.id"),
        unique=True,
        index=True,
    )
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    organization = relationship("Organization")
    campaign = relationship("Campaign", backref="donations")
    donor = relationship("Donor", backref="donations")
    
    @property
    def amount_lira(self):
        return self.amount_cents / 100
    
    @property
    def is_confirmed(self):
        return self.status == DonationStatus.CONFIRMED
    
    def __repr__(self):
        return f"<Donation {self.receipt_number} - {self.amount_lira} TL>"


# Indexes for multi-tenant queries
Index('idx_donations_org_status', Donation.organization_id, Donation.status)
Index('idx_donations_org_campaign', Donation.organization_id, Donation.campaign_id)
Index('idx_donations_org_donor', Donation.organization_id, Donation.donor_id)
Index('idx_donors_org_email', Donor.organization_id, Donor.email)
Index('idx_donors_org_phone', Donor.organization_id, Donor.phone)
