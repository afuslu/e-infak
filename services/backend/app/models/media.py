import uuid

from sqlalchemy import BigInteger, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class MediaFolder(Base):
    """Medya kütüphanesinde düz (tek seviye) klasör."""
    __tablename__ = "media_folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_media_folder_org_name"),)


class MediaAsset(Base):
    """Yüklenmiş bir görsel ve ondan üretilen WebP boyutları.

    Bir görselin bütün dosyaları MEDIA_ROOT/<org>/ altında aynı `token` ile başlar:
    `<token>.orig.<ext>` (özgün dosya, yayınlanmaz), `<token>.webp` (EXIF'siz tam boy),
    `<token>-<genişlik>.webp` (küçültülmüş boyutlar), kırpılınca `<token>-k*.webp`.
    Eski yüklemeler `<token>.<ext>` olarak durur ve aynen yayınlanır.
    """
    __tablename__ = "media_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("media_folders.id", ondelete="SET NULL"), index=True)
    token = Column(String(24), nullable=False)
    url = Column(String(500), nullable=False)  # the address editors put on pages
    original_name = Column(String(255), nullable=False, default="")
    original_file = Column(String(64))  # file name of the kept original on disk
    mime = Column(String(64), nullable=False)
    size_bytes = Column(BigInteger, nullable=False, default=0)  # every file of the asset together
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    alt_text = Column(String(300), nullable=False, default="", server_default="")
    caption = Column(String(500), nullable=False, default="", server_default="")
    credit = Column(String(200), nullable=False, default="", server_default="")
    focal_x = Column(Float, nullable=False, default=0.5, server_default="0.5")
    focal_y = Column(Float, nullable=False, default=0.5, server_default="0.5")
    tags = Column(JSONB, nullable=False, default=list, server_default="[]")
    # [{"width": 480, "height": 270, "file": "<token>-480.webp", "size": 12345}]
    variants = Column(JSONB, nullable=False, default=list, server_default="[]")
    crop = Column(JSONB)  # {"x", "y", "width", "height"} in source pixels, when cropped
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("organization_id", "token", name="uq_media_asset_org_token"),)
