from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.db import Base

class StudentProgress(Base):
    __tablename__ = "student_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False, index=True)

    check_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    memorized_pages = Column(Integer, nullable=False, default=0)
    current_surah = Column(String(100), nullable=False)
    instructor_notes = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    student = relationship("Student", backref="progress")

    def __repr__(self):
        return f"<StudentProgress student_id={self.student_id} pages={self.memorized_pages}>"
