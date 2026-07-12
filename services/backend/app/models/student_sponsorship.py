from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class StudentSponsorship(Base):
    __tablename__ = "student_sponsorships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)
    donor_id = Column(UUID(as_uuid=True), ForeignKey("donors.id"), nullable=False, index=True)

    amount_cents = Column(Integer, nullable=False, default=50000) # 500 TL/month standard
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    student = relationship("Student", backref="sponsorships")
    donor = relationship("Donor")

    def __repr__(self):
        return f"<StudentSponsorship student {self.student_id} donor {self.donor_id}>"
