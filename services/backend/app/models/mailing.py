"""STK PRO İletişim: saved recipient lists (SMS / mail) and the mail module (templates, sends, messages)."""
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class RecipientList(Base):
    """"SMS Listeleri" / "Mail Listeleri": a named set of donors built from the donor list's bulk actions."""
    __tablename__ = "recipient_lists"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(8), nullable=False, default="sms")  # sms | mail
    name = Column(String(120), nullable=False)
    description = Column(String(300))
    member_count = Column(Integer, nullable=False, default=0, server_default="0")
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class RecipientListMember(Base):
    __tablename__ = "recipient_list_members"

    list_id = Column(UUID(as_uuid=True), ForeignKey("recipient_lists.id", ondelete="CASCADE"), primary_key=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="CASCADE"), primary_key=True, index=True)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MailTemplate(Base):
    __tablename__ = "mail_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    subject = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)  # HTML-free text with {ad}, {ad_soyad}, {kurum} variables; paragraphs by blank line
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_mail_template_org_name"),)


class MailBatch(Base):
    """"Mail Gönderimleri": one subject + text sent to an audience; its messages are MailMessage rows."""
    __tablename__ = "mail_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    seq_no = Column(Integer, nullable=False, default=0)
    source = Column(String(160), nullable=False, default="")  # e.g. "Liste: Kurban 2026" or "Bağışçı: X"
    subject = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    commercial = Column(Boolean, nullable=False, default=False, server_default="false")
    total = Column(Integer, nullable=False, default=0, server_default="0")
    send_after = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    status = Column(String(12), nullable=False, default="queued", server_default="queued")  # queued|sending|done|cancelled
    stats = Column(JSONB, nullable=False, default=dict, server_default="{}")
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(DateTime(timezone=True))

    __table_args__ = (Index("ix_mail_batches_org_created", "organization_id", "created_at"),)


class MailMessage(Base):
    __tablename__ = "mail_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("mail_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="SET NULL"), index=True)
    email = Column(String(255), nullable=False)
    name = Column(String(200))
    status = Column(String(10), nullable=False, default="queued", server_default="queued")  # queued|sent|failed|cancelled
    error = Column(Text)
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    sent_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_mail_messages_batch_status", "batch_id", "status"),)
