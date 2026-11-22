"""STK PRO Web Sitesi → "Form": forms built in the panel, shown on the site, answers kept here."""
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class SiteForm(Base):
    __tablename__ = "site_forms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(160), nullable=False)
    slug = Column(String(160), nullable=False)
    description = Column(Text)
    # [{"key": "ad_soyad", "label": "Ad Soyad", "type": "text|textarea|email|phone|number|date|select|radio|checkbox", "required": true, "options": [...]}]
    fields = Column(JSONB, nullable=False, default=list, server_default="[]")
    submit_label = Column(String(60))
    success_message = Column(String(400))
    notify_email = Column(String(255))
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_site_form_org_slug"),)


class SiteFormSubmission(Base):
    __tablename__ = "site_form_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    form_id = Column(UUID(as_uuid=True), ForeignKey("site_forms.id", ondelete="CASCADE"), nullable=False, index=True)
    data = Column(JSONB, nullable=False, default=dict)
    ip_address = Column(String(64))
    read_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_site_form_submissions_form_created", "form_id", "created_at"),)
