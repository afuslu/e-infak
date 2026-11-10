"""Dernek üyeliği ve aidat borçları. Üye kişi bilgisi bağışçı kartından gelir (donor)."""
import uuid

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.db import Base

MEMBER_TYPES = {"asil": "Asil üye", "onursal": "Onursal üye", "fahri": "Fahri üye", "genc": "Genç üye"}
MEMBER_STATUSES = {"active": "Aktif", "passive": "Pasif", "resigned": "İstifa", "expelled": "İhraç", "deceased": "Vefat"}
DUE_STATUSES = {"open": "Bekliyor", "paid": "Ödendi", "waived": "Muaf / silindi"}


class Member(Base):
    __tablename__ = "members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=False, index=True)
    member_no = Column(String(30), nullable=False)
    member_type = Column(String(16), nullable=False, default="asil")
    status = Column(String(16), nullable=False, default="active", index=True)
    joined_on = Column(Date)
    left_on = Column(Date)
    # Boşsa kurumun varsayılan aidatı kullanılır
    dues_cents = Column(Integer)
    dues_period = Column(String(8))  # monthly | yearly
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    donor = relationship("Donor")

    __table_args__ = (UniqueConstraint("organization_id", "member_no", name="uq_member_org_no"),)


class MemberDue(Base):
    """Bir üyenin bir döneme ait aidat borcu ("2026-11" aylık, "2026" yıllık)."""
    __tablename__ = "member_dues"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    member_id = Column(UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    period = Column(String(7), nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, default="open", index=True)
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="SET NULL"), index=True)
    paid_at = Column(DateTime(timezone=True))
    waived_reason = Column(String(300))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    member = relationship("Member")

    __table_args__ = (UniqueConstraint("member_id", "period", name="uq_member_due_period"),)
