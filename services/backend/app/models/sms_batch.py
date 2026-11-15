"""A bulk SMS: one text sent to an audience. Its messages are SmsMessage rows with this batch_id."""
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class SmsBatch(Base):
    __tablename__ = "sms_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(120), nullable=False)
    body = Column(Text, nullable=False)  # as written, with {variables}
    audience = Column(JSONB, nullable=False, default=dict)
    audience_label = Column(String(200), nullable=False, default="")
    # Commercial (promotion) messages are sent through the provider's İYS check.
    commercial = Column(Boolean, nullable=False, default=False, server_default="false")
    total = Column(Integer, nullable=False, default=0, server_default="0")
    send_after = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"))
    throttle_per_minute = Column(Integer)
    ab_variant_body = Column(Text)
    ab_test_percent = Column(Integer)
    cancelled_at = Column(DateTime(timezone=True))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (Index("ix_sms_batches_org_created", "organization_id", "created_at"),)
