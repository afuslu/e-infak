from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.core.db import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    legal_name = Column(String(200), nullable=False)
    
    # Contact Info
    email = Column(String(255), nullable=False)
    phone = Column(String(20))
    address = Column(Text)
    city = Column(String(100))
    tax_number = Column(String(20))
    
    # Domain Configuration
    primary_domain = Column(String(255), unique=True, nullable=False)
    custom_domains = Column(JSONB, default=list)
    
    # Theme Configuration
    theme_primary_color = Column(String(7), default="#065f46")
    theme_accent_color = Column(String(7), default="#0284c7")
    logo_url = Column(String(500))
    logo_dark_url = Column(String(500))
    
    # Settings
    is_active = Column(Boolean, default=True)
    settings = Column(JSONB, default=dict)
    
    # Bank Account Info
    bank_name = Column(String(100))
    iban = Column(String(32))
    account_holder = Column(String(200))
    
    # VPOS Configuration
    vpos_merchant_id = Column(String(100))
    vpos_terminal_id = Column(String(100))
    vpos_password = Column(String(255))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<Organization {self.name}>"
