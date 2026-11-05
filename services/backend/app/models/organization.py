from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, ForeignKey
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
    
    # Public website (shared theme). `subdomain` serves <subdomain>.<PLATFORM_BASE_DOMAIN>.
    subdomain = Column(String(63), unique=True, index=True)
    template = Column(String(16), nullable=False, default="klasik", server_default="klasik")
    tagline = Column(String(120))
    favicon_url = Column(String(500))
    # hero, home_sections, cta_band, footer_text, social_links, show_in_directory, translations
    site = Column(JSONB, nullable=False, default=dict, server_default="{}")

    # Theme Configuration
    theme_primary_color = Column(String(7), default="#065f46")
    theme_accent_color = Column(String(7), default="#0284c7")
    logo_url = Column(String(500))
    logo_dark_url = Column(String(500))
    
    # Settings
    is_active = Column(Boolean, default=True)
    settings = Column(JSONB, default=dict)

    # Subscription package (see app.core.plans)
    plan = Column(String(20), nullable=False, default="ileri", server_default="ileri")
    enabled_addons = Column(JSONB, nullable=False, default=list, server_default="[]")
    extra_user_seats = Column(Integer, nullable=False, default=0, server_default="0")
    
    # Bank Account Info
    bank_name = Column(String(100))
    iban = Column(String(32))
    account_holder = Column(String(200))
    
    # Payment credentials are kept outside the database. This opaque reference
    # points to the tenant's secret-store entry.
    payment_secret_ref = Column(String(255))
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<Organization {self.name}>"


class OrganizationDomain(Base):
    """A custom domain pointed at the platform. Only `active` domains serve a site or get TLS."""
    __tablename__ = "organization_domains"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    domain = Column(String(253), nullable=False, unique=True, index=True)  # lower-case, no port
    status = Column(String(16), nullable=False, default="pending", index=True)  # pending | active | disabled
    verification_token = Column(String(64), nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False)
    verified_at = Column(DateTime(timezone=True))
    last_check_error = Column(String(300))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
