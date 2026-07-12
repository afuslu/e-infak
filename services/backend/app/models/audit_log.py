from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True) # User who performed action

    action = Column(String(100), nullable=False, index=True) # e.g. "kampanya_guncelle"
    details = Column(JSON, nullable=True) # Audit details as json map
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    organization = relationship("Organization")
    user = relationship("User")

    def __repr__(self):
        return f"<AuditLog {self.action} by user {self.user_id} at {self.created_at}>"
