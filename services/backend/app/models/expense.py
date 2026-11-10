from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)

    title = Column(String(300), nullable=False)
    category = Column(String(100), nullable=False, index=True) # Kira, Personel, Fatura, Yardim, Diger
    amount_cents = Column(Integer, nullable=False)
    receipt_no = Column(String(100), nullable=False)
    expense_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Muhasebe modülü (İleri): gider kartı, döviz, ödendiği hesap ve tedarikçi
    expense_card_id = Column(UUID(as_uuid=True), ForeignKey("expense_cards.id", ondelete="SET NULL"), index=True)
    currency = Column(String(3), nullable=False, default="TRY", server_default="TRY")
    account_id = Column(UUID(as_uuid=True), ForeignKey("finance_accounts.id", ondelete="SET NULL"), index=True)
    counterparty_id = Column(UUID(as_uuid=True), ForeignKey("counterparties.id", ondelete="SET NULL"), index=True)
    description = Column(String(1000))
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization")

    @property
    def amount_lira(self):
        return self.amount_cents / 100

    def __repr__(self):
        return f"<Expense {self.title} - {self.amount_lira} TL>"
