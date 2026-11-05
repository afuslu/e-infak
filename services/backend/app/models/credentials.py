import uuid
from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.db import Base


class TenantCredential(Base):
    """Third-party account details of one organisation (ZiraatPay, NetGSM…), encrypted at rest."""
    __tablename__ = "tenant_credentials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(32), nullable=False)
    ciphertext = Column(Text, nullable=False)  # Fernet token of the JSON payload
    updated_by = Column(String(255))  # e-mail of the platform / organisation user
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("organization_id", "provider", name="uq_tenant_credential_provider"),)
