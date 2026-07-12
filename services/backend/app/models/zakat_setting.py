from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class ZakatSetting(Base):
    __tablename__ = "zakat_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True, unique=True)

    gold_price_per_gram = Column(Float, nullable=False, default=3000.0)
    nisap_amount_lira = Column(Float, nullable=False, default=255000.0) # 85 * gold_price
    is_auto_sync = Column(Boolean, nullable=False, default=True)

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    organization = relationship("Organization")

    def __repr__(self):
        return f"<ZakatSetting for org {self.organization_id} - {self.nisap_amount_lira} TL>"
