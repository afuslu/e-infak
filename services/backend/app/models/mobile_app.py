"""Mobil Uygulama Yapıcı: a donor app's design and the organisation's store application."""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class MobileApp(Base):
    """`config` is what the donor app shows (NULL = built-in design); `draft` is the editor's copy."""
    __tablename__ = "mobile_apps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True)
    config = Column(JSONB)
    draft = Column(JSONB)
    version = Column(Integer, nullable=False, default=0, server_default="0")
    draft_updated_at = Column(DateTime(timezone=True))
    draft_updated_by = Column(String(255))
    published_at = Column(DateTime(timezone=True))
    published_by = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MobileAppRevision(Base):
    """A published design (the last 50 are kept) for restoring."""
    __tablename__ = "mobile_app_revisions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    config = Column(JSONB, nullable=False)
    created_by = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MobileAppRequest(Base):
    """An organisation's application for its own store app. Built by a platform operator."""
    __tablename__ = "mobile_app_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True)
    data = Column(JSONB, nullable=False, default=dict, server_default="{}")
    # draft | submitted | in_review | built | in_store | changes_requested
    status = Column(String(20), nullable=False, default="draft", server_default="draft", index=True)
    note = Column(Text)  # the operator's message to the organisation
    submitted_at = Column(DateTime(timezone=True))
    submitted_by = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
