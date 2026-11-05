import uuid
from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
from app.core.db import Base


class Department(Base):
    """Kurum içi birim (ör. Muhasebe, Kurban Birimi, İstanbul Temsilciliği)."""
    __tablename__ = "departments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(String(500))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_department_org_name"),)


class StaffRole(Base):
    """Kurumun kendi tanımladığı rol; `permissions` app.api.deps.Permission değerlerini tutar."""
    __tablename__ = "staff_roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(String(500))
    permissions = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_staff_role_org_name"),)
