from sqlalchemy import UniqueConstraint, Column, String, Boolean, DateTime, Text, Integer, Enum, ForeignKey, Index, Date
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
    hashed_password = Column(String(255), nullable=True)
    
    # Address
    address = Column(Text)
    city = Column(String(100))
    country = Column(String(100), default="Türkiye")
    
    # Identity Numbers
    tc_no = Column(String(11))
    tax_number = Column(String(20))

    # Number of this donor in the system the organisation migrated from (e.g. STK PRO "Bağışçı No")
    external_ref = Column(String(64))

    # Profile (STK PRO donor form). Choice lists live in org settings ("donor_options").
    membership_type = Column(String(60))
    blood_group = Column(String(8))
    gender = Column(String(10))
    occupation = Column(String(100))
    rating = Column(String(60))
    referral_source = Column(String(100))
    birth_date = Column(Date)
    district = Column(String(100))
    neighbourhood = Column(String(150))
    phone_code = Column(String(6))
    phone2 = Column(String(20))
    phone2_code = Column(String(6))
    # Staff member who registered / looks after the record ("Personel"), separate from the representative
    staff_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)

    # Stats
    total_donations = Column(Integer, default=0)
    total_donated_cents = Column(Integer, default=0)
    first_donation_at = Column(DateTime(timezone=True))
    last_donation_at = Column(DateTime(timezone=True))
    
    # Preferences
    allow_email = Column(Boolean, default=False)
    allow_sms = Column(Boolean, default=False)
    # allow_*: explicit permission for commercial messages. *_opt_out: wants no announcements at all.
    sms_opt_out = Column(Boolean, nullable=False, default=False, server_default="false")
    email_opt_out = Column(Boolean, nullable=False, default=False, server_default="false")
    push_opt_out = Column(Boolean, nullable=False, default=False, server_default="false")
    # WhatsApp: opt-in moment (needed for announcements), opt-out ("DUR") stops every business message.
    whatsapp_opt_in_at = Column(DateTime(timezone=True))
    whatsapp_opt_out = Column(Boolean, nullable=False, default=False, server_default="false")
    whatsapp_consent_source = Column(String(30))  # checkout | keyword | staff | import | portal
    is_anonymous = Column(Boolean, default=False)
    # Donor deleted their portal account in the app: tokens issued before this moment are rejected.
    # Donation and receipt records stay for the legal retention period.
    portal_closed_at = Column(DateTime(timezone=True))
    
    # Staff member (representative) responsible for this donor
    assigned_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)

    # Tags and Notes
    tags = Column(JSONB, default=list)
    notes = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    __table_args__ = (
        UniqueConstraint("organization_id", "external_ref", name="uq_donor_org_external_ref"),
    )

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
    issued_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)  # staff who confirmed/issued; NULL = online
    receipt_pdf_url = Column(String(500))
    # Matbu koçandan kesildiyse: koçan ve yaprak numarası ("A-1234")
    receipt_book_id = Column(UUID(as_uuid=True), ForeignKey("receipt_books.id", ondelete="SET NULL"), index=True)
    official_receipt_no = Column(String(40))
    # "Makbuz No": sequential per organisation, shared by every line of one receipt (see services/receipt_seq)
    receipt_seq = Column(Integer)
    receipt_sent_at = Column(DateTime(timezone=True))
    
    # Message
    donor_message = Column(Text)
    on_behalf_of = Column(String(200))  # "X adına" bağış
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
# A paper receipt number is issued once per organisation, even after the donation is cancelled.
Index('uq_donations_org_official_receipt', Donation.organization_id, Donation.official_receipt_no,
      unique=True, postgresql_where=Donation.official_receipt_no.isnot(None))
