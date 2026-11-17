"""Hatırlatıcı: a staff member's own "call this person at this time" notes (e-İnfak's Wise Reminder).

The text is free; a phone number written in it links the reminder to the donor with that number.
The person who wrote it gets a push on their phone when the time comes (app.services.reminders).
"""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.db import Base

REPEAT_CHOICES = ("none", "daily", "weekly", "monthly", "yearly")
SOURCE_CHOICES = ("manual", "wise_reminder")


class DonorReminder(Base):
    __tablename__ = "donor_reminders"
    __table_args__ = (
        Index("ix_donor_reminders_owner_open", "organization_id", "created_by_id", "completed_at", "remind_at"),
        Index("ix_donor_reminders_due", "completed_at", "notified_at", "remind_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    content = Column(Text, nullable=False)
    phone = Column(String(20), nullable=True)  # digits found in the text (last 10), used to find the donor
    remind_at = Column(DateTime(timezone=True), nullable=False)
    repeat = Column(String(10), nullable=False, default="none", server_default="none")
    source = Column(String(20), nullable=False, default="manual", server_default="manual")

    notified_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completed_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    donor = relationship("Donor")
    created_by = relationship("User", foreign_keys=[created_by_id])
