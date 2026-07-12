from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class Banner(Base):
    __tablename__ = "banners"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)

    text = Column(String(500), nullable=False)
    bg_color = Column(String(50), nullable=False, default="#1e293b") # Tailwind slate-800 or CSS hex
    link_url = Column(String(500))
    is_active = Column(Boolean, nullable=False, default=True)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    organization = relationship("Organization")

    def __repr__(self):
        return f"<Banner '{self.text[:20]}...' active={self.is_active}>"
