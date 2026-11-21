"""In-app notifications for organisation staff (mobile inbox) and their per-person settings."""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class StaffNotification(Base):
    """One line in a staff member's notification inbox; a push may or may not have been sent for it."""
    __tablename__ = "staff_notifications"
    __table_args__ = (Index("ix_staff_notifications_user_created", "user_id", "created_at"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # donation | online | transfer | transfer_waiting | payment_failed | refund | digest | task | test
    kind = Column(String(32), nullable=False, index=True)
    channel = Column(String(32))  # online | transfer | cash | pos | money_box | dues | sms ...
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    amount_cents = Column(Integer)
    currency = Column(String(3))
    data = Column(JSONB, nullable=False, default=dict)  # ids the app opens (donation_id, donor_id …)
    pushed = Column(Integer, nullable=False, default=0)  # devices the push went to
    read_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StaffNotificationSetting(Base):
    """What a staff member wants pushed to their phone. Missing row = defaults."""
    __tablename__ = "staff_notification_settings"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    settings = Column(JSONB, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
