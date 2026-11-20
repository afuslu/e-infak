"""Donor channels beyond SMS: WhatsApp messages, call-center calls and operator SMS donations."""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base

WHATSAPP_STATUSES = ("queued", "sent", "delivered", "read", "failed")
CALL_STATUSES = ("ringing", "answered", "missed", "busy", "failed", "ended")
SMS_DONATION_STATUSES = ("recorded", "unmatched", "ignored", "error")


class WhatsAppMessage(Base):
    """Every outgoing WhatsApp message: the queue and the log in one table (like SmsMessage)."""
    __tablename__ = "whatsapp_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="SET NULL"), index=True)
    phone = Column(String(20), nullable=False)
    kind = Column(String(10), nullable=False, default="template", server_default="template")  # template | text
    template_name = Column(String(120))
    language = Column(String(10))
    params = Column(JSONB, nullable=False, default=list, server_default="[]")
    body = Column(Text)  # free text, or the template parameters joined for the log
    status = Column(String(12), nullable=False, default="queued", server_default="queued")
    provider_ref = Column(String(128), index=True)  # wamid.…
    error = Column(Text)
    batch_id = Column(UUID(as_uuid=True), index=True)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    read_at = Column(DateTime(timezone=True))

    __table_args__ = (Index("ix_whatsapp_messages_org_status", "organization_id", "status"),)


class CallLog(Base):
    """One call through the organisation's cloud PBX, built up from the PBX's events."""
    __tablename__ = "call_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(20), nullable=False, default="netsantral", server_default="netsantral")
    unique_id = Column(String(80), nullable=False)
    direction = Column(String(3), nullable=False, default="in", server_default="in")  # in | out
    customer_phone = Column(String(20))
    extension = Column(String(20))
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="SET NULL"), index=True)
    status = Column(String(10), nullable=False, default="ringing", server_default="ringing")
    last_event = Column(String(20))
    talk_seconds = Column(Integer)
    recording_url = Column(String(500))
    note = Column(Text)
    started_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))  # click-to-call
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    answered_at = Column(DateTime(timezone=True))
    ended_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("organization_id", "provider", "unique_id", name="uq_call_log_org_unique"),
        Index("ix_call_logs_org_started", "organization_id", "started_at"),
    )


class SmsDonationRecord(Base):
    """One operator SMS donation as reported by the short-number provider (webhook or file)."""
    __tablename__ = "sms_donation_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    external_ref = Column(String(120), nullable=False)  # the provider's id, or a hash of the row
    source = Column(String(10), nullable=False, default="webhook", server_default="webhook")  # webhook | file
    phone = Column(String(20))
    amount_cents = Column(Integer, nullable=False)
    keyword = Column(String(60))
    operator = Column(String(40))
    received_at = Column(DateTime(timezone=True), nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"))
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="SET NULL"), index=True)
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="SET NULL"))
    status = Column(String(10), nullable=False, default="recorded", server_default="recorded")
    error = Column(Text)
    raw = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "external_ref", name="uq_sms_donation_org_ref"),
        Index("ix_sms_donation_org_received", "organization_id", "received_at"),
    )


class DonationVideo(Base):
    """A video file stored on our server and shown to donors (kurban slaughter, well opening, project)."""
    __tablename__ = "donation_videos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False,
                             index=True)
    original_name = Column(String(255), nullable=False)
    file_name = Column(String(80), nullable=False)  # <id>.<ext> under MEDIA_ROOT/videos/<org>/
    content_type = Column(String(60), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    received_bytes = Column(Integer, nullable=False, default=0, server_default="0")
    status = Column(String(10), nullable=False, default="uploading", server_default="uploading")  # uploading | ready
    title = Column(String(200))
    kurban_animal_id = Column(UUID(as_uuid=True), ForeignKey("kurban_animals.id", ondelete="SET NULL"), index=True)
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="SET NULL"), index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"), index=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class VideoView(Base):
    """Who opened a video link, how often and when (one row per video and donor)."""
    __tablename__ = "video_views"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(UUID(as_uuid=True), ForeignKey("donation_videos.id", ondelete="CASCADE"), nullable=False)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="CASCADE"))
    view_count = Column(Integer, nullable=False, default=1, server_default="1")
    first_viewed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_viewed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("video_id", "donor_id", name="uq_video_view_video_donor"),)
