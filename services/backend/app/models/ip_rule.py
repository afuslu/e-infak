"""Organisation IP rules: where staff may sign in from (allow) and addresses shut out (block)."""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.db import Base


class OrgIpRule(Base):
    __tablename__ = "org_ip_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(8), nullable=False)  # allow | block
    network = Column(String(64), nullable=False)  # single address or CIDR, normalised
    note = Column(String(200))
    # allow: this staff member only (empty = every staff member except the organisation's admins)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_org_ip_rules_org_kind", "organization_id", "kind"),)
