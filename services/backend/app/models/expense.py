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

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    organization = relationship("Organization")

    @property
    def amount_lira(self):
        return self.amount_cents / 100

    def __repr__(self):
        return f"<Expense {self.title} - {self.amount_lira} TL>"
