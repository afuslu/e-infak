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


class BankTransaction(Base):
    __tablename__ = "bank_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    import_id = Column(UUID(as_uuid=True), ForeignKey("bank_statement_imports.id"), nullable=False, index=True)
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
