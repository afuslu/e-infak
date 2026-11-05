"""Saha operasyonları: bölgeler, kumbaralar, kumanya ve görevler."""
import uuid
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.db import Base


class Region(Base):
    __tablename__ = "regions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(String(500))
    responsible_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_region_org_name"),)


class MoneyBox(Base):
    __tablename__ = "money_boxes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    code = Column(String(32), nullable=False)
    region_id = Column(UUID(as_uuid=True), ForeignKey("regions.id", ondelete="SET NULL"), index=True)
    location_name = Column(String(200), nullable=False)  # dükkan / cami / kurum adı
    address = Column(Text)
    city = Column(String(100))
    district = Column(String(100))
    contact_name = Column(String(200))
    contact_phone = Column(String(32))
    responsible_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"))  # toplananın aktarılacağı kalem
    status = Column(String(16), nullable=False, default="active", index=True)  # active | passive | lost
    placed_at = Column(Date)
    last_collected_at = Column(DateTime(timezone=True))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    region = relationship("Region")

    __table_args__ = (UniqueConstraint("organization_id", "code", name="uq_money_box_org_code"),)


class MoneyBoxCollection(Base):
    __tablename__ = "money_box_collections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    money_box_id = Column(UUID(as_uuid=True), ForeignKey("money_boxes.id", ondelete="CASCADE"), nullable=False, index=True)
    collected_at = Column(DateTime(timezone=True), nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="TRY")
    collected_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="SET NULL"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AidPackage(Base):
    """Kumanya paketi tanımı (içerik ve birim maliyet)."""
    __tablename__ = "aid_packages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    contents = Column(Text)
    unit_cost_cents = Column(Integer, nullable=False)
    donation_campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="SET NULL"))
    stock = Column(Integer, nullable=False, default=0)  # hazırlanmış paket
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AidRecipient(Base):
    """Kumanya verilen hane / aile."""
    __tablename__ = "aid_recipients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    full_name = Column(String(200), nullable=False)
    phone = Column(String(32))
    national_id = Column(String(20))
    region_id = Column(UUID(as_uuid=True), ForeignKey("regions.id", ondelete="SET NULL"), index=True)
    address = Column(Text)
    household_size = Column(Integer)
    needs = Column(Text)
    status = Column(String(16), nullable=False, default="active")  # active | passive
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    region = relationship("Region")


class AidDistribution(Base):
    __tablename__ = "aid_distributions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    package_id = Column(UUID(as_uuid=True), ForeignKey("aid_packages.id"), nullable=False, index=True)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("aid_recipients.id", ondelete="SET NULL"), index=True)
    region_id = Column(UUID(as_uuid=True), ForeignKey("regions.id", ondelete="SET NULL"), index=True)
    quantity = Column(Integer, nullable=False, default=1)
    status = Column(String(16), nullable=False, default="planned")  # planned | delivered | cancelled
    planned_date = Column(Date)
    delivered_at = Column(DateTime(timezone=True))
    delivered_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    package = relationship("AidPackage")
    recipient = relationship("AidRecipient")


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    priority = Column(String(10), nullable=False, default="normal")
    category = Column(String(60))
    default_duration_days = Column(Integer, nullable=False, default=1)
    checklist = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    priority = Column(String(10), nullable=False, default="normal", index=True)  # low | normal | high | urgent
    category = Column(String(60))
    status = Column(String(16), nullable=False, default="todo", index=True)  # todo | in_progress | done | cancelled
    start_date = Column(Date)
    due_date = Column(Date, index=True)
    assigned_to_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    parent_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    template_id = Column(UUID(as_uuid=True), ForeignKey("task_templates.id", ondelete="SET NULL"))
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id", ondelete="SET NULL"))
    checklist = Column(JSONB, nullable=False, default=list)  # [{"text": "...", "done": false}]
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
