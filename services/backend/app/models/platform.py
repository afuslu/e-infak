import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class PlatformUser(Base):
    """E-İnfak platform operator. Separate from organisation users on purpose:
    a platform account is never a member of a tenant and its tokens carry
    scope="platform", which tenant endpoints refuse."""
    __tablename__ = "platform_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200), nullable=False, default="")
    role = Column(String(20), nullable=False, default="admin", server_default="admin")  # admin | support
    is_active = Column(Boolean, nullable=False, default=True)
    must_change_password = Column(Boolean, nullable=False, default=False, server_default="false")
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PlatformAuditLog(Base):
    """Every action taken in the platform console (organisation created, plan
    changed, suspended, support sign-in…)."""
    __tablename__ = "platform_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    platform_user_id = Column(UUID(as_uuid=True), ForeignKey("platform_users.id"), nullable=True, index=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    details = Column(JSONB, nullable=False, default=dict)
    ip_address = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class DemoRequest(Base):
    """A demo / offer request left on the platform landing page (e-infak.org)."""
    __tablename__ = "demo_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False)
    organization = Column(String(200), nullable=False)
    phone = Column(String(32), nullable=False)
    email = Column(String(255))
    plan = Column(String(20))  # package the visitor asked about, if any
    message = Column(Text)
    status = Column(String(16), nullable=False, default="new", server_default="new", index=True)  # new | contacted | converted | closed
    ip_address = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class PlatformPayment(Base):
    """SaaS subscription payment recorded by a platform operator for an organisation."""
    __tablename__ = "platform_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_by_id = Column(UUID(as_uuid=True), ForeignKey("platform_users.id", ondelete="SET NULL"), nullable=True)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="TRY", server_default="TRY")
    period_label = Column(String(80), nullable=False)
    payment_method = Column(String(24), nullable=False, default="havale", server_default="havale")  # havale | kart | nakit
    status = Column(String(16), nullable=False, default="paid", server_default="paid")  # paid | pending | cancelled
    notes = Column(String(300))
    paid_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class PlatformBroadcast(Base):
    """System-wide announcement or maintenance notice shown inside tenant admin panels."""
    __tablename__ = "platform_broadcasts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("platform_users.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(160), nullable=False)
    message = Column(Text, nullable=False)
    level = Column(String(16), nullable=False, default="info", server_default="info")  # info | warning | danger
    is_active = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    maintenance_mode = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class PlatformAlertDismissal(Base):
    """Alert dismissed by a platform operator so it stays hidden until restored."""
    __tablename__ = "platform_alert_dismissals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    kind = Column(String(64), nullable=False, index=True)
    dismissed_by_id = Column(UUID(as_uuid=True), ForeignKey("platform_users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
