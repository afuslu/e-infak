"""Every outgoing SMS: the queue and the log in one table.

status: scheduled (waits for send_after) -> queued -> sent -> delivered | failed; cancelled before sending.
A message may point at the record it is about (related_type/related_id: a donation, a bank
transfer, a kurban share…) so lists can show "SMS sent" next to that record.
"""
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.db import Base

SMS_OPEN_STATUSES = ("scheduled", "queued")
SMS_STATUSES = (*SMS_OPEN_STATUSES, "sent", "delivered", "failed", "cancelled")
SMS_SOURCES = ("manual", "receipt", "transfer", "kurban", "bulk", "auto", "otp", "test")


class SmsMessage(Base):
    __tablename__ = "sms_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    seq_no = Column(Integer, nullable=False)  # per organisation, shown to staff as "#316"
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="SET NULL"), index=True)
    phone = Column(String(20), nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String(16), nullable=False, default="queued", server_default="queued")
    source = Column(String(16), nullable=False, default="manual", server_default="manual")
    related_type = Column(String(32))
    related_id = Column(UUID(as_uuid=True))
    # Set for automatic messages: the same key is never sent twice in an organisation.
    dedupe_key = Column(String(120))
    template_id = Column(UUID(as_uuid=True), ForeignKey("sms_templates.id", ondelete="SET NULL"))
    batch_id = Column(UUID(as_uuid=True), index=True)
    # Promotion: sent through the provider's İYS permission check
    commercial = Column(Boolean, nullable=False, default=False, server_default="false")
    encoding = Column(String(8), nullable=False, default="gsm", server_default="gsm")
    parts = Column(Integer, nullable=False, default=1, server_default="1")
    provider = Column(String(32))
    provider_ref = Column(String(64))
    error = Column(Text)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    send_after = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    sent_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "seq_no", name="uq_sms_message_org_seq"),
        UniqueConstraint("organization_id", "dedupe_key", name="uq_sms_message_org_dedupe"),
        Index("ix_sms_messages_due", "status", "send_after"),
        Index("ix_sms_messages_org_created", "organization_id", "created_at"),
        Index("ix_sms_messages_related", "organization_id", "related_type", "related_id"),
    )
