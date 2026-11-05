from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
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

    # Public trust content is maintained by each organization and displayed on
    # its own About page.  Documents are links so the institution can publish
    # signed PDFs from its approved document storage without code changes.
    about_text = Column(Text)
    mission_text = Column(Text)
    vision_text = Column(Text)
    bylaws_url = Column(String(500))
    board_url = Column(String(500))
    audit_report_url = Column(String(500))
    activity_report_url = Column(String(500))
    fundraising_permit_url = Column(String(500))

    # Engagement widgets
    whatsapp_number = Column(String(20))  # digits only, international format (905xx...)
    whatsapp_message = Column(String(300))
    live_chat_provider = Column(String(16))  # tawk
    live_chat_id = Column(String(80))  # Tawk.to "propertyId/widgetId"

    # Default SEO for pages without their own title/description
    seo_title = Column(String(160))
    seo_description = Column(String(320))
    seo_keywords = Column(String(300))

    # Website languages; the first is the default and must be "tr"
    languages = Column(JSONB, nullable=False, default=lambda: ["tr"], server_default='["tr"]')

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    organization = relationship("Organization")

    def __repr__(self):
        return f"<OrganizationSettings for org {self.organization_id}>"
