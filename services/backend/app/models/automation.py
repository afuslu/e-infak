import enum
import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class OutboxStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DELIVERED = "delivered"
    FAILED = "failed"


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    aggregate_type = Column(String(64), nullable=False)
    aggregate_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    payload = Column(JSONB, nullable=False, default=dict)
    status = Column(Enum(OutboxStatus), nullable=False, default=OutboxStatus.PENDING, index=True)
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    processing_started_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    last_error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("event_type", "aggregate_id", name="uq_outbox_event_aggregate"),
    )


class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=False, index=True)
    consent_type = Column(String(32), nullable=False)
    granted = Column(Boolean, nullable=False)
    document_version = Column(String(32), nullable=False)
    locale = Column(String(5), nullable=False, default="tr")
    source = Column(String(32), nullable=False, default="checkout")
    ip_address = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ReconciliationStatus(str, enum.Enum):
    UNMATCHED = "unmatched"
    MATCHED = "matched"
    AMBIGUOUS = "ambiguous"
    IGNORED = "ignored"


class BankStatementImport(Base):
    __tablename__ = "bank_statement_imports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    file_hash = Column(String(64), nullable=False)
    filename = Column(String(255), nullable=False)
    row_count = Column(Integer, nullable=False, default=0)
    imported_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "file_hash", name="uq_bank_import_org_hash"),
    )


class BankAccount(Base):
    """An organisation bank account whose movements are pulled automatically (Vakıf Katılım, Ziraat Katılım…)."""
    __tablename__ = "bank_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    bank_key = Column(String(32), nullable=False)  # app.banking connector key
    label = Column(String(120), nullable=False)
    iban = Column(String(34))
    account_no = Column(String(40))  # bank-side account / suffix number when the API needs it
    currency = Column(String(3), nullable=False, default="TRY")
    enabled = Column(Boolean, nullable=False, default=True)
    # Turn a transfer into a donation without review when donor and campaign are both certain.
    auto_approve = Column(Boolean, nullable=False, default=False)
    default_campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"))
    last_synced_at = Column(DateTime(timezone=True))
    last_error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "bank_key", "iban", name="uq_bank_account_org_bank_iban"),
    )


class BankMatchRule(Base):
    """What the matcher has learned: a sender name belongs to a donor, a word points to a campaign."""
    __tablename__ = "bank_match_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(16), nullable=False)  # "sender" | "keyword"
    pattern = Column(String(255), nullable=False)  # folded (lower case, no accents)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="CASCADE"))
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"))
    hits = Column(Integer, nullable=False, default=0)
    source = Column(String(16), nullable=False, default="manual")  # manual | approval | import
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "kind", "pattern", name="uq_bank_match_rule"),
    )


class BankTransaction(Base):
    __tablename__ = "bank_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    import_id = Column(UUID(as_uuid=True), ForeignKey("bank_statement_imports.id"), index=True)  # null: pulled by API
    bank_account_id = Column(UUID(as_uuid=True), ForeignKey("bank_accounts.id", ondelete="SET NULL"), index=True)
    source = Column(String(16), nullable=False, default="upload", server_default="upload")  # upload | api
    external_id = Column(String(128), nullable=False)
    booked_at = Column(DateTime(timezone=True), nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="TRY")
    sender_name = Column(String(255))
    description = Column(Text)
    status = Column(Enum(ReconciliationStatus), nullable=False, default=ReconciliationStatus.UNMATCHED, index=True)
    payment_order_id = Column(UUID(as_uuid=True), ForeignKey("payment_orders.id"), index=True)
    matched_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    matched_at = Column(DateTime(timezone=True))
    # Donation created straight from this transfer (no checkout order behind it)
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="SET NULL"), index=True)
    # Matcher output: donor/campaign candidates, confidence, parsed sender
    suggestion = Column(JSONB, nullable=False, default=dict, server_default="{}")
    raw_data = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "external_id", name="uq_bank_transaction_org_external"),
    )


class PaymentRefund(Base):
    __tablename__ = "payment_refunds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    payment_order_id = Column(UUID(as_uuid=True), ForeignKey("payment_orders.id"), nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    status = Column(String(24), nullable=False, default="pending", index=True)
    provider_transaction_id = Column(String(128))
    failure_message = Column(Text)
    requested_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True))
