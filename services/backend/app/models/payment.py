import enum
import uuid

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.db import Base


class PaymentOrderStatus(str, enum.Enum):
    PENDING = "pending"
    AWAITING_TRANSFER = "awaiting_transfer"
    PROCESSING = "processing"
    PAID = "paid"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PARTIALLY_REFUNDED = "partially_refunded"
    REFUNDED = "refunded"
    CHARGEBACK = "chargeback"
    REVIEW = "review"


class PaymentOrder(Base):
    __tablename__ = "payment_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=False, index=True)
    merchant_payment_id = Column(String(128), nullable=False, unique=True, index=True)
    idempotency_key = Column(String(128), nullable=False)
    payment_method = Column(String(32), nullable=False)
    status = Column(Enum(PaymentOrderStatus), nullable=False, default=PaymentOrderStatus.PENDING, index=True)
    total_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="TRY")
    locale = Column(String(5), nullable=False, default="tr")
    refunded_cents = Column(Integer, nullable=False, default=0)
    query_attempts = Column(Integer, nullable=False, default=0)
    query_next_at = Column(DateTime(timezone=True), index=True)
    transfer_reference = Column(String(64), unique=True, index=True)
    consent_version = Column(String(32), nullable=False, default="2026-07")
    failure_code = Column(String(64))
    failure_message = Column(Text)
    paid_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization")
    donor = relationship("Donor")
    items = relationship("PaymentOrderItem", back_populates="order", cascade="all, delete-orphan")
    attempts = relationship("PaymentAttempt", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_payment_order_org_idempotency"),
    )


class PaymentOrderItem(Base):
    __tablename__ = "payment_order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("payment_orders.id"), nullable=False, index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=1)
    unit_amount_cents = Column(Integer, nullable=False)
    total_amount_cents = Column(Integer, nullable=False)
    donor_message = Column(Text)
    metadata_json = Column("metadata", JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order = relationship("PaymentOrder", back_populates="items")
    campaign = relationship("Campaign")


class PaymentAttempt(Base):
    __tablename__ = "payment_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("payment_orders.id"), nullable=False, index=True)
    provider = Column(String(32), nullable=False, default="ziraatpay")
    session_token = Column(String(64), unique=True, index=True)
    pg_tran_id = Column(String(64), index=True)
    response_code = Column(String(16))
    response_message = Column(String(500))
    card_last_4 = Column(String(4))
    card_brand = Column(String(32))
    safe_response = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True))

    order = relationship("PaymentOrder", back_populates="attempts")
