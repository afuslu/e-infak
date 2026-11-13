from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class SmsTemplate(Base):
    __tablename__ = "sms_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)

    name = Column(String(100), nullable=False, index=True)
    body = Column(Text, nullable=False) # e.g. "Sayın {donor_name}, {amount_lira} TL bağışınız ulaştı..."

    # Event this template answers ("makbuz", "havale_eslesti"…; see services.sms_service.SMS_EVENTS)
    event_key = Column(String(40))
    # Receipt texts of this campaign (donation item) use this template instead of the event's
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"))
    # auto: sent when the event happens · manual: offered in the quick SMS window · off: never
    auto_mode = Column(String(8), nullable=False, default="manual", server_default="manual")
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("organization_id", "event_key", name="uq_sms_template_org_event"),
        UniqueConstraint("organization_id", "campaign_id", name="uq_sms_template_org_campaign"),
    )

    # Relationships
    organization = relationship("Organization")

    def __repr__(self):
        return f"<SmsTemplate {self.name} for org {self.organization_id}>"
