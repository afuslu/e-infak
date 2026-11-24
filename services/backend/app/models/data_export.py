import uuid

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class DataExport(Base):
    """A full backup (ZIP) an organisation asked for. The file lives outside the public media folders for 7 days."""
    __tablename__ = "data_exports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    include_media = Column(Boolean, nullable=False, default=True)
    status = Column(String(16), nullable=False, default="queued", index=True)  # queued | running | ready | failed | expired
    size_bytes = Column(BigInteger)
    sha256 = Column(String(64))
    counts = Column(JSONB, nullable=False, default=dict)
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    downloaded_at = Column(DateTime(timezone=True))


class OrganizationOffboarding(Base):
    """An organisation leaving the platform. Nothing is ever deleted by itself; an operator does it by hand."""
    __tablename__ = "organization_offboardings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(String(16), nullable=False, default="requested")  # requested | scheduled | cancelled
    reason = Column(Text)
    requested_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closes_on = Column(Date)
    operator_note = Column(Text)
    checklist = Column(JSONB, nullable=False, default=dict)
    backup_confirmed_at = Column(DateTime(timezone=True))
    backup_confirmed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
