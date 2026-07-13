from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base


class StudentPreregistration(Base):
    __tablename__ = "student_preregistrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)

    program = Column(String(50), nullable=False)
    student_name = Column(String(200), nullable=False)
    student_age = Column(String(10), nullable=False)
    parent_name = Column(String(200), nullable=False)
    parent_phone = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="pending")

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")

    def __repr__(self):
        return f"<StudentPreregistration {self.student_name}>"
