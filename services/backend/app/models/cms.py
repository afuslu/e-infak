import uuid
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
from app.core.db import Base


class SitePage(Base):
    """Kurumun panelden yönettiği serbest sayfa (ör. /sayfa/tarihce)."""
    __tablename__ = "site_pages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    slug = Column(String(160), nullable=False)
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=False, default="")
    cover_image_url = Column(String(500))
    seo_title = Column(String(160))
    seo_description = Column(String(320))
    is_published = Column(Boolean, nullable=False, default=False)
    translations = Column(JSONB, nullable=False, default=dict, server_default="{}")
    # Site builder: "home" (one per organisation) or "page". `blocks` is what visitors
    # see; `draft_blocks` is the editor's working copy until it is published.
    kind = Column(String(16), nullable=False, default="page", server_default="page")
    blocks = Column(JSONB)
    draft_blocks = Column(JSONB)
    version = Column(Integer, nullable=False, default=0, server_default="0")
    draft_updated_at = Column(DateTime(timezone=True))
    draft_updated_by = Column(String(255))
    published_at = Column(DateTime(timezone=True))
    published_by = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_site_page_org_slug"),)


class SitePageRevision(Base):
    """A published version of a page (the last 50 are kept) for restoring."""
    __tablename__ = "site_page_revisions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_id = Column(UUID(as_uuid=True), ForeignKey("site_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    blocks = Column(JSONB, nullable=False)
    note = Column(String(200))
    created_by = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class MenuItem(Base):
    """Üst menü veya alt bilgi (footer) bağlantısı."""
    __tablename__ = "site_menu_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    location = Column(String(16), nullable=False, default="header")  # header | footer
    label = Column(String(80), nullable=False)
    url = Column(String(500), nullable=False)
    open_in_new_tab = Column(Boolean, nullable=False, default=False)
    translations = Column(JSONB, nullable=False, default=dict, server_default="{}")  # {"en": {"label": ...}}
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GalleryItem(Base):
    """Foto veya video galeri öğesi. Videolar yalnız YouTube/Vimeo kimliğiyle saklanır."""
    __tablename__ = "gallery_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    kind = Column(String(8), nullable=False, default="photo")  # photo | video
    title = Column(String(200), nullable=False)
    album = Column(String(120))
    image_url = Column(String(500))
    video_provider = Column(String(16))  # youtube | vimeo
    video_id = Column(String(64))
    translations = Column(JSONB, nullable=False, default=dict, server_default="{}")
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class VolunteerApplication(Base):
    __tablename__ = "volunteer_applications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    full_name = Column(String(200), nullable=False)
    phone = Column(String(32), nullable=False)
    email = Column(String(255))
    city = Column(String(100))
    areas = Column(JSONB, nullable=False, default=list)
    availability = Column(String(200))
    message = Column(Text)
    status = Column(String(16), nullable=False, default="new", index=True)  # new | contacted | accepted | rejected
    staff_notes = Column(Text)
    consent_version = Column(String(32), nullable=False)
    ip_address = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
