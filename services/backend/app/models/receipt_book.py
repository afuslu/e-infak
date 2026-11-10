"""Resmî (matbu) makbuz koçanı: seri ve numara aralığı; kesilen numara bir daha kullanılamaz."""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.db import Base


class ReceiptBook(Base):
    __tablename__ = "receipt_books"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    series = Column(String(20), nullable=False)  # koçan seri harfi / kodu, ör. "A" veya "2026-B"
    start_no = Column(Integer, nullable=False)
    end_no = Column(Integer, nullable=False)
    next_no = Column(Integer, nullable=False)  # sıradaki boş yaprak
    branch = Column(String(100))  # şube / temsilcilik; boşsa merkez
    holder_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    status = Column(String(16), nullable=False, default="active", server_default="active")  # active | closed
    # Yırtılan / hatalı yazılan yapraklar: [{"no": 12, "reason": "...", "by": "<user id>", "at": "..."}]
    voided = Column(JSONB, nullable=False, default=list, server_default="[]")
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def label(self, number: int) -> str:
        return f"{self.series}-{number}"
