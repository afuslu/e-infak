"""Yararlanıcılar (talebe / hoca / yetim) ve taksitli taahhütler (sponsorluk, su kuyusu, genel)."""
import uuid
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.db import Base

BENEFICIARY_KINDS = {"talebe": "Talebe / Öğrenci", "hoca": "Hoca / Öğretmen", "yetim": "Yetim", "diger": "Diğer"}
PLEDGE_KINDS = {"sponsorship": "Sponsorluk / Burs", "water_well": "Su Kuyusu", "general": "Genel Taahhüt"}


class Beneficiary(Base):
    __tablename__ = "beneficiaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    kind = Column(String(16), nullable=False, default="talebe", index=True)
    code = Column(String(32))  # kurum içi numara
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100))
    gender = Column(String(10))
    birth_date = Column(Date)
    country = Column(String(100))
    city = Column(String(100))
    school = Column(String(200))  # okul / medrese / görev yeri
    guardian_name = Column(String(200))
    guardian_phone = Column(String(32))
    photo_url = Column(String(500))
    description = Column(Text)
    monthly_need_cents = Column(Integer, nullable=False, default=0)
    status = Column(String(16), nullable=False, default="active", index=True)  # active | passive
    # Links to legacy records so existing screens keep working
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="SET NULL"), unique=True)
    orphan_id = Column(UUID(as_uuid=True), ForeignKey("orphans.id", ondelete="SET NULL"), unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name or ''}".strip()


class Pledge(Base):
    """A donor's commitment paid in installments (sponsorship, water well or general)."""
    __tablename__ = "pledges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    kind = Column(String(16), nullable=False, default="sponsorship", index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=False, index=True)
    beneficiary_id = Column(UUID(as_uuid=True), ForeignKey("beneficiaries.id", ondelete="SET NULL"), index=True)
    water_well_id = Column(UUID(as_uuid=True), ForeignKey("water_wells.id", ondelete="SET NULL"), index=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False, index=True)
    title = Column(String(300))
    installment_amount_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="TRY")
    installment_count = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    status = Column(String(16), nullable=False, default="active", index=True)  # active | completed | cancelled
    notes = Column(Text)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    donor = relationship("Donor")
    beneficiary = relationship("Beneficiary")
    campaign = relationship("Campaign")
    installments = relationship(
        "PledgeInstallment", back_populates="pledge", order_by="PledgeInstallment.seq", cascade="all, delete-orphan",
    )


class PledgeInstallment(Base):
    __tablename__ = "pledge_installments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pledge_id = Column(UUID(as_uuid=True), ForeignKey("pledges.id", ondelete="CASCADE"), nullable=False, index=True)
    seq = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    amount_cents = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False, default="pending", index=True)  # pending | paid | cancelled
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="SET NULL"), index=True)
    paid_at = Column(DateTime(timezone=True))

    pledge = relationship("Pledge", back_populates="installments")

    __table_args__ = (UniqueConstraint("pledge_id", "seq", name="uq_pledge_installment_seq"),)


class WellShare(Base):
    """Hisse bought in a shared ('hisseli') water well."""
    __tablename__ = "water_well_shares"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    water_well_id = Column(UUID(as_uuid=True), ForeignKey("water_wells.id", ondelete="CASCADE"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), index=True)
    donation_id = Column(UUID(as_uuid=True), ForeignKey("donations.id", ondelete="SET NULL"), index=True)
    share_count = Column(Integer, nullable=False, default=1)
    on_behalf_of = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
