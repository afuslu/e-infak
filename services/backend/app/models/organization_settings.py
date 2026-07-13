from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base


class OrganizationSettings(Base):
    __tablename__ = "organization_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True, unique=True)

    contact_phone = Column(String(30))
    contact_email = Column(String(255))
    contact_address = Column(String(500))
    bank1_name = Column(String(200))
    bank1_iban = Column(String(50))
    bank2_name = Column(String(200))
    bank2_iban = Column(String(50))

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    organization = relationship("Organization")

    def __repr__(self):
        return f"<OrganizationSettings for org {self.organization_id}>"
