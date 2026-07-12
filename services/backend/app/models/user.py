from sqlalchemy import Column, String, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from app.core.db import Base


class UserRole(str, enum.Enum):
    PLATFORM_ADMIN = "platform_admin"
    STK_ADMIN = "stk_admin"
    MUHASEBE = "muhasebe"
    CRM = "crm"
    OPERASYON = "operasyon"
    READONLY = "readonly"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False, index=True)
    
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    phone = Column(String(20))
    
    role = Column(Enum(UserRole), nullable=False, default=UserRole.READONLY)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    organization = relationship("Organization", backref="users")
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"
    
    def __repr__(self):
        return f"<User {self.email}>"


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    refresh_token = Column(String(500), unique=True, nullable=False, index=True)
    access_token = Column(String(500))
    
    ip_address = Column(String(50))
    user_agent = Column(String(500))
    
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", backref="sessions")
    
    @property
    def is_valid(self):
        from datetime import datetime, timezone
        return self.revoked_at is None and self.expires_at > datetime.now(timezone.utc)
    
    def __repr__(self):
        return f"<Session {self.id}>"
