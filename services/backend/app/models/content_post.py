from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base


class ContentPost(Base):
    __tablename__ = "content_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)

    title = Column(String(300), nullable=False)
    # haber | blog | faaliyet — all listed under /haberler, filterable by kind
    kind = Column(String(16), nullable=False, default="haber", server_default="haber", index=True)
    slug = Column(String(160))  # unique per organization when set
    summary = Column(String(500))
    body = Column(Text)  # plain text; blank lines separate paragraphs, "## " starts a heading
    gallery_urls = Column(JSONB, nullable=False, default=list, server_default="[]")
    video_provider = Column(String(16))
    video_id = Column(String(64))
    seo_title = Column(String(160))
    seo_description = Column(String(320))
    translations = Column(JSONB, nullable=False, default=dict, server_default="{}")
    image_url = Column(String(500))
    published_at = Column(DateTime(timezone=True), server_default=func.now())
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")

    def __repr__(self):
        return f"<ContentPost {self.title}>"


Index(
    "uq_content_posts_org_slug", ContentPost.organization_id, ContentPost.slug,
    unique=True, postgresql_where=ContentPost.slug.isnot(None),
)
