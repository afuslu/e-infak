"""Saha operasyonları: bölgeler, kumbaralar, kumanya ve görevler."""
import uuid
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
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
    # --- Yoksul takibi (POVERTY_TRACKING) ---
    city = Column(String(100), index=True)
    district = Column(String(100), index=True)
    neighborhood = Column(String(120), index=True)
    street = Column(String(160))
    latitude = Column(Float)
    longitude = Column(Float)
    housing_status = Column(String(16))  # owner | rent | relative | free | other
    heating_type = Column(String(16))  # natural_gas | stove | electric | none | other
    rent_cents = Column(Integer)
    monthly_income_cents = Column(Integer)
    monthly_expense_cents = Column(Integer)
    debt_cents = Column(Integer)
    poverty_reasons = Column(JSONB, nullable=False, default=list, server_default="[]")
    poverty_score = Column(Integer, nullable=False, default=0, server_default="0", index=True)
    degree_override = Column(String(16))  # critical | high | medium | low; boşsa puandan hesaplanır
    # applied (web başvurusu) -> inspecting (saha incelemesi) -> approved | rejected
    review_status = Column(String(16), nullable=False, default="approved", server_default="approved", index=True)
    source = Column(String(16), nullable=False, default="admin", server_default="admin")  # admin | web
    inspected_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    inspected_at = Column(DateTime(timezone=True))
    inspection_note = Column(Text)
    consent_version = Column(String(32))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    region = relationship("Region")
    members = relationship("HouseholdMember", cascade="all, delete-orphan", order_by="HouseholdMember.created_at")


class HouseholdMember(Base):
    """Hanedeki bir birey; puanlama ve kişisel ölçüler (beden, ayakkabı) için."""
    __tablename__ = "household_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("aid_recipients.id", ondelete="CASCADE"), nullable=False, index=True)
    full_name = Column(String(200), nullable=False)
    relation = Column(String(16), nullable=False, default="other")  # self | spouse | child | parent | sibling | other
    gender = Column(String(10))
    birth_date = Column(Date)
    is_disabled = Column(Boolean, nullable=False, default=False)
    has_chronic_illness = Column(Boolean, nullable=False, default=False)
    is_student = Column(Boolean, nullable=False, default=False)
    school = Column(String(200))
    is_working = Column(Boolean, nullable=False, default=False)
    monthly_income_cents = Column(Integer)
    clothing_size = Column(String(10))
    shoe_size = Column(String(10))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


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
