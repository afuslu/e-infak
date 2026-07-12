---
title: E-İnfak 2.0 - Technical Design Document
status: design
created: 2026-07-11
version: 1.0
parent: e-infak-v2-multi-tenant-platform.md
---

# E-İnfak 2.0 - Technical Design Document

## 📐 Mimari Genel Bakış

### Sistem Mimarisi Prensipler

1. **Multi-Tenant Architecture**: Her STK izole veri ile çalışır
2. **Microservices-Ready**: Modüler yapı, gelecekte mikroservislere geçiş kolay
3. **API-First Design**: Frontend-Backend tamamen API üzerinden iletişim
4. **Event-Driven**: Asenkron işlemler için event bus (Celery + Redis)
5. **Stateless Backend**: Horizontal scaling için session'sız tasarım

### Teknoloji Stack Detayı

#### Frontend Stack
```yaml
Framework: Next.js 15.1.x (App Router)
Language: TypeScript 5.4.x
Styling: Tailwind CSS 4.x
UI Components: Headless UI + Radix UI
State Management: Zustand 4.x
Forms: React Hook Form 7.x + Zod 3.x
Data Fetching: TanStack Query (React Query) 5.x
Charts: Recharts 2.x
Testing: Vitest + React Testing Library + Playwright
```

#### Backend Stack
```yaml
Framework: FastAPI 0.115.x
Language: Python 3.12
ASGI Server: Uvicorn
ORM: SQLAlchemy 2.x + Alembic (migrations)
Validation: Pydantic 2.x
Database: PostgreSQL 16
Cache: Redis 7.x
Task Queue: Celery 5.x
Testing: Pytest + HTTPx
```

#### DevOps Stack
```yaml
Containerization: Docker 24.x + Docker Compose
CI/CD: GitHub Actions
Monitoring: Sentry (errors) + Grafana (metrics) + Prometheus
Logging: Loki + Promtail
Infrastructure: Kubernetes (production) / Docker Compose (dev)
```


## 🏗️ Sistem Mimarisi Diyagramı

### High-Level Architecture (C4 Level 1 - Context)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                    │
│                                                                   │
│  Bağışçılar    STK Adminleri    Platform Admin    Operasyon     │
└───────────┬─────────────┬───────────┬───────────────┬───────────┘
            │             │           │               │
            ▼             ▼           ▼               ▼
┌───────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE CDN                                 │
│                    (SSL, DDoS Protection, Cache)                  │
└───────────────────────────────┬───────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                      LOAD BALANCER                                │
│                      (Nginx / Traefik)                            │
└──────────────┬───────────────────────────┬────────────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│   FRONTEND (Next.js)     │   │   BACKEND (FastAPI)      │
│   - SSR/SSG              │   │   - REST API             │
│   - Multi-tenant routing │◄─►│   - Multi-tenant logic   │
│   - Theme engine         │   │   - Business logic       │
│   - Port: 3000           │   │   - Port: 8000           │
└──────────────┬───────────┘   └──────────┬───────────────┘
               │                           │
               │                           ▼
               │              ┌────────────────────────────┐
               │              │   PostgreSQL (Primary)     │
               │              │   - Multi-tenant data      │
               │              │   - Row-level security     │
               │              └────────────┬───────────────┘
               │                           │
               │                           ▼
               │              ┌────────────────────────────┐
               │              │   Redis                    │
               │              │   - Session cache          │
               │              │   - Celery broker          │
               │              └────────────┬───────────────┘
               │                           │
               │                           ▼
               │              ┌────────────────────────────┐
               │              │   Celery Workers           │
               │              │   - Async tasks            │
               │              │   - Email, SMS sending     │
               │              │   - Report generation      │
               │              └────────────────────────────┘
               │
               └──────────────────────────────────────────────┐
                                                              │
┌─────────────────────────────────────────────────────────────┴───┐
│                    EXTERNAL SERVICES                             │
│                                                                   │
│  - Vakıf Katılım VPOS    - AWS S3 / R2 Storage                  │
│  - Netgsm SMS Gateway    - SendGrid Email                        │
│  - Sentry Monitoring     - Stripe (future)                       │
└───────────────────────────────────────────────────────────────────┘
```


### Multi-Tenant Request Flow

```
1. Request: https://hicretdernegi.org/kampanyalar/zekat
   │
   ├─► Cloudflare CDN (cache check)
   │
   ├─► Nginx Load Balancer
   │
   ├─► Next.js Frontend
   │   ├─► Domain → Organization resolver
   │   │   (hicretdernegi.org → org_slug: "hicret-dernegi")
   │   │
   │   ├─► Theme loader (Hicret theme colors, fonts)
   │   │
   │   └─► SSR: Fetch campaign data from Backend API
   │
   ├─► FastAPI Backend
   │   ├─► Middleware: Extract organization from hostname
   │   │
   │   ├─► Auth middleware (if authenticated request)
   │   │
   │   ├─► Route: GET /api/campaigns/zekat?org_slug=hicret-dernegi
   │   │
   │   ├─► PostgreSQL Query:
   │   │   SELECT * FROM campaigns 
   │   │   WHERE organization_id = (SELECT id FROM organizations WHERE slug = ?)
   │   │   AND slug = 'zekat'
   │   │
   │   └─► Response: Campaign JSON
   │
   └─► Frontend: Render campaign page with theme
```


## 🗄️ Database Schema (PostgreSQL)

### Core Multi-Tenant Tables

#### organizations
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,  -- 'hicret-dernegi', 'kardeslik-payi'
    name VARCHAR(255) NOT NULL,         -- 'Hicret Derneği'
    domain TEXT[] NOT NULL,             -- ['hicretdernegi.org', 'hicretdernegi.org.tr']
    
    -- Theme configuration
    theme_base VARCHAR(50) NOT NULL DEFAULT 'hicret',  -- 'hicret', 'kardeslik', 'custom'
    primary_color VARCHAR(7) NOT NULL,  -- '#065f46'
    accent_color VARCHAR(7) NOT NULL,   -- '#0284c7'
    font_family VARCHAR(100),           -- 'Poppins'
    logo_url TEXT,
    favicon_url TEXT,
    
    -- Contact information
    city VARCHAR(100) NOT NULL,
    tagline TEXT,
    description TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    iban VARCHAR(34),
    tax_number VARCHAR(20),
    
    -- VPOS configuration
    vpos_provider VARCHAR(50) DEFAULT 'mock',  -- 'vakifkatilim', 'mock'
    vpos_client_id TEXT,
    vpos_store_key TEXT,  -- Encrypted
    vpos_username TEXT,
    vpos_password TEXT,   -- Encrypted
    vpos_test_mode BOOLEAN DEFAULT true,
    
    -- Subscription & billing
    subscription_plan VARCHAR(50) DEFAULT 'starter',  -- 'starter', 'professional', 'enterprise'
    subscription_status VARCHAR(20) DEFAULT 'trial',  -- 'trial', 'active', 'suspended', 'cancelled'
    trial_ends_at TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'suspended', 'inactive'
    onboarded_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    CONSTRAINT organizations_slug_key UNIQUE (slug)
);

CREATE INDEX idx_organizations_domain ON organizations USING GIN (domain);
CREATE INDEX idx_organizations_status ON organizations (status, subscription_status);
```

#### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,  -- bcrypt hashed
    
    role VARCHAR(50) NOT NULL,  -- 'platform_admin', 'stk_admin', 'muhasebe', 'crm', 'operasyon', 'readonly'
    
    -- 2FA
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret TEXT,
    
    -- Status
    active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(organization_id, email)
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
```


### Campaign & Donation Tables

#### campaigns
```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    slug VARCHAR(200) NOT NULL,         -- 'zekat', 'kurban-bagisi'
    title VARCHAR(500) NOT NULL,
    category VARCHAR(100) NOT NULL,     -- 'zekat', 'kurban', 'acil-yardim', etc.
    summary TEXT NOT NULL,
    story TEXT,                         -- Rich text (HTML or Markdown)
    
    -- Financials (stored in cents to avoid floating point issues)
    target_cents BIGINT NOT NULL,       -- 1000 TL = 100000 cents
    collected_cents BIGINT DEFAULT 0,
    suggested_amounts JSONB,            -- [100, 250, 500, 1000] in cents
    
    -- Media
    cover_image_url TEXT,
    gallery_urls JSONB,                 -- Array of image URLs
    video_url TEXT,
    
    -- Settings
    featured BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    allow_custom_amount BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    -- Dates
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    
    -- SEO
    meta_title VARCHAR(60),
    meta_description VARCHAR(160),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(organization_id, slug),
    CHECK (target_cents > 0),
    CHECK (collected_cents >= 0)
);

CREATE INDEX idx_campaigns_org ON campaigns(organization_id);
CREATE INDEX idx_campaigns_active ON campaigns(organization_id, active, featured);
CREATE INDEX idx_campaigns_category ON campaigns(category);
```

#### donors
```sql
CREATE TABLE donors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    city VARCHAR(100),
    
    donor_type VARCHAR(50) DEFAULT 'bireysel',  -- 'bireysel', 'kurumsal'
    company_name VARCHAR(255),  -- If kurumsal
    
    -- Communication preferences
    email_opt_in BOOLEAN DEFAULT true,
    sms_opt_in BOOLEAN DEFAULT true,
    whatsapp_opt_in BOOLEAN DEFAULT false,
    
    -- KVKK
    kvkk_consent BOOLEAN DEFAULT false,
    kvkk_consent_at TIMESTAMP,
    kvkk_text_version VARCHAR(20),  -- Track which version they agreed to
    
    -- CRM
    tags JSONB,  -- ['vip', 'recurring', 'kurban-donor']
    notes TEXT,
    
    -- Stats (denormalized for performance)
    total_donated_cents BIGINT DEFAULT 0,
    donation_count INTEGER DEFAULT 0,
    last_donation_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    CONSTRAINT donors_org_email_unique UNIQUE(organization_id, email)
);

CREATE INDEX idx_donors_org ON donors(organization_id);
CREATE INDEX idx_donors_phone ON donors(phone);
CREATE INDEX idx_donors_email ON donors(email);
CREATE INDEX idx_donors_tags ON donors USING GIN (tags);
```


#### donations
```sql
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    donor_id UUID REFERENCES donors(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    
    -- Amount
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'TRY',
    
    -- Payment
    payment_method VARCHAR(50) DEFAULT 'card',  -- 'card', 'bank_transfer', 'cash'
    payment_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'confirmed', 'failed', 'refunded'
    payment_provider VARCHAR(50),  -- 'vakifkatilim', 'mock'
    
    -- Receipt
    receipt_no VARCHAR(50) UNIQUE NOT NULL,  -- 'HCR-2026-000001'
    receipt_url TEXT,  -- PDF URL
    
    -- Optional fields
    note TEXT,
    dedicatee VARCHAR(255),  -- "Anneme hatıra olarak"
    anonymous BOOLEAN DEFAULT false,
    
    -- Recurring
    recurring BOOLEAN DEFAULT false,
    recurring_plan_id UUID REFERENCES recurring_plans(id),
    
    -- Bank details (for 3D Secure)
    bank_auth_code VARCHAR(50),
    bank_transaction_id VARCHAR(100),
    bank_response_code VARCHAR(20),
    bank_error_message TEXT,
    
    -- Certificate (for special campaigns)
    certificate_recipient VARCHAR(255),
    certificate_message TEXT,
    certificate_url TEXT,
    
    -- Idempotency
    idempotency_key UUID UNIQUE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    
    -- Constraints
    CHECK (amount_cents > 0)
);

CREATE INDEX idx_donations_org ON donations(organization_id);
CREATE INDEX idx_donations_donor ON donations(donor_id);
CREATE INDEX idx_donations_campaign ON donations(campaign_id);
CREATE INDEX idx_donations_status ON donations(payment_status);
CREATE INDEX idx_donations_date ON donations(created_at DESC);
CREATE INDEX idx_donations_receipt ON donations(receipt_no);
```

#### recurring_plans
```sql
CREATE TABLE recurring_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    
    -- Plan details
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'TRY',
    interval VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- 'monthly', 'quarterly', 'yearly'
    
    -- Payment method (tokenized card)
    payment_token TEXT NOT NULL,  -- Encrypted token from VPOS
    card_last_4 VARCHAR(4),
    card_brand VARCHAR(20),  -- 'visa', 'mastercard'
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'paused', 'cancelled', 'failed'
    
    -- Schedule
    next_charge_at TIMESTAMP NOT NULL,
    last_charge_at TIMESTAMP,
    
    -- Stats
    successful_charges INTEGER DEFAULT 0,
    failed_charges INTEGER DEFAULT 0,
    total_collected_cents BIGINT DEFAULT 0,
    
    -- Cancellation
    cancelled_at TIMESTAMP,
    cancel_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (amount_cents > 0)
);

CREATE INDEX idx_recurring_org ON recurring_plans(organization_id);
CREATE INDEX idx_recurring_donor ON recurring_plans(donor_id);
CREATE INDEX idx_recurring_next_charge ON recurring_plans(next_charge_at) WHERE status = 'active';
```


### Kurban (Qurban) Management Tables

#### kurban_animals
```sql
CREATE TABLE kurban_animals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    code VARCHAR(50) NOT NULL,  -- 'KRB-2026-001'
    animal_type VARCHAR(20) NOT NULL DEFAULT 'buyukbas',  -- 'buyukbas' (7 shares), 'kucukbas' (1 share)
    
    -- Location
    region VARCHAR(100) NOT NULL,   -- 'Afrika', 'Asya', 'Balkanlar'
    country VARCHAR(100) NOT NULL,  -- 'Somali', 'Nijer', 'Türkiye'
    city VARCHAR(100),
    
    -- Shares
    total_shares INTEGER NOT NULL DEFAULT 7,
    available_shares INTEGER NOT NULL DEFAULT 7,
    share_price_cents BIGINT NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'open',  -- 'open', 'full', 'slaughtered'
    
    -- Slaughter info
    slaughter_date DATE,
    slaughtered_at TIMESTAMP,
    video_url TEXT,
    photos JSONB,  -- Array of photo URLs
    
    -- Notes
    note TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(organization_id, code),
    CHECK (total_shares > 0),
    CHECK (available_shares >= 0),
    CHECK (available_shares <= total_shares)
);

CREATE INDEX idx_kurban_animals_org ON kurban_animals(organization_id);
CREATE INDEX idx_kurban_animals_status ON kurban_animals(organization_id, status);
CREATE INDEX idx_kurban_animals_region ON kurban_animals(region, country);
```

#### kurban_shares
```sql
CREATE TABLE kurban_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    animal_id UUID NOT NULL REFERENCES kurban_animals(id) ON DELETE CASCADE,
    
    share_no INTEGER NOT NULL,  -- 1 to 7
    
    -- Donor info
    donor_id UUID REFERENCES donors(id) ON DELETE SET NULL,
    donation_id UUID REFERENCES donations(id) ON DELETE SET NULL,
    receipt_no VARCHAR(50),
    
    -- Dedication
    dedicatee VARCHAR(255),
    intention_type VARCHAR(50) DEFAULT 'vacip',  -- 'vacip', 'adak', 'akika', 'sukur', 'nafile'
    
    -- Status
    status VARCHAR(20) DEFAULT 'assigned',  -- 'assigned', 'slaughtered', 'notified'
    
    -- Notification
    video_url TEXT,
    slaughtered_at TIMESTAMP,
    notified_at TIMESTAMP,
    notification_method VARCHAR(20),  -- 'sms', 'email', 'whatsapp'
    
    -- Notes
    note TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(animal_id, share_no),
    CHECK (share_no > 0 AND share_no <= 7)
);

CREATE INDEX idx_kurban_shares_org ON kurban_shares(organization_id);
CREATE INDEX idx_kurban_shares_animal ON kurban_shares(animal_id);
CREATE INDEX idx_kurban_shares_donor ON kurban_shares(donor_id);
CREATE INDEX idx_kurban_shares_donation ON kurban_shares(donation_id);
CREATE INDEX idx_kurban_shares_status ON kurban_shares(status);
```


### Orphan Sponsorship Tables

#### orphans
```sql
CREATE TABLE orphans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Profile
    full_name VARCHAR(255) NOT NULL,  -- Can be pseudonym for privacy
    country VARCHAR(100) NOT NULL,
    city VARCHAR(100),
    age INTEGER NOT NULL,
    gender VARCHAR(10),  -- 'male', 'female'
    
    -- Media
    photo_url TEXT,  -- Face blurred for privacy
    photo_public BOOLEAN DEFAULT true,
    
    -- Status
    status VARCHAR(20) DEFAULT 'available',  -- 'available', 'sponsored', 'graduated'
    
    -- Sponsorship
    sponsor_donor_id UUID REFERENCES donors(id) ON DELETE SET NULL,
    sponsored_since TIMESTAMP,
    monthly_support_cents BIGINT,
    
    -- Education
    school_name VARCHAR(255),
    grade_level VARCHAR(20),
    education_status VARCHAR(50),  -- 'in_school', 'graduated', 'dropped_out'
    
    -- Health (optional)
    health_status TEXT,
    special_needs TEXT,
    
    -- Biography
    bio TEXT,  -- Short story about the orphan
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CHECK (age > 0 AND age < 18)
);

CREATE INDEX idx_orphans_org ON orphans(organization_id);
CREATE INDEX idx_orphans_status ON orphans(status);
CREATE INDEX idx_orphans_sponsor ON orphans(sponsor_donor_id);
```

#### orphan_reports
```sql
CREATE TABLE orphan_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orphan_id UUID NOT NULL REFERENCES orphans(id) ON DELETE CASCADE,
    
    report_type VARCHAR(50) NOT NULL,  -- 'school_report', 'health_report', 'progress_update'
    title VARCHAR(255) NOT NULL,
    content TEXT,
    
    -- Attachments
    file_url TEXT,  -- PDF, image
    file_type VARCHAR(20),  -- 'pdf', 'image'
    
    -- Academic (for school reports)
    semester VARCHAR(20),
    gpa DECIMAL(3, 2),
    grade_level VARCHAR(20),
    
    -- Notification
    notified_sponsor BOOLEAN DEFAULT false,
    notified_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orphan_reports_orphan ON orphan_reports(orphan_id);
CREATE INDEX idx_orphan_reports_type ON orphan_reports(report_type);
```


### Communication & Notification Tables

#### message_templates
```sql
CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    channel VARCHAR(20) NOT NULL,  -- 'email', 'sms', 'whatsapp'
    
    -- Template content (supports variables like {name}, {amount}, {campaign})
    subject VARCHAR(255),  -- For email
    body TEXT NOT NULL,
    
    -- Template type
    template_type VARCHAR(50),  -- 'donation_receipt', 'kurban_notification', 'thank_you'
    
    -- Status
    active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_message_templates_org ON message_templates(organization_id);
CREATE INDEX idx_message_templates_type ON message_templates(template_type);
```

#### message_logs
```sql
CREATE TABLE message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    donor_id UUID REFERENCES donors(id) ON DELETE SET NULL,
    
    channel VARCHAR(20) NOT NULL,  -- 'email', 'sms', 'whatsapp'
    target VARCHAR(255) NOT NULL,  -- Email or phone number
    
    subject VARCHAR(255),
    body TEXT NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'queued',  -- 'queued', 'sent', 'delivered', 'failed', 'bounced'
    
    -- Provider info
    provider VARCHAR(50),  -- 'sendgrid', 'netgsm'
    provider_message_id VARCHAR(255),
    provider_response TEXT,
    
    -- Retry
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    
    -- Tracking
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    failed_at TIMESTAMP
);

CREATE INDEX idx_message_logs_org ON message_logs(organization_id);
CREATE INDEX idx_message_logs_donor ON message_logs(donor_id);
CREATE INDEX idx_message_logs_status ON message_logs(status);
CREATE INDEX idx_message_logs_channel ON message_logs(channel);
```

#### notifications
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    type VARCHAR(50) NOT NULL,  -- 'new_donation', 'campaign_goal_reached', 'low_stock'
    title VARCHAR(255) NOT NULL,
    body TEXT,
    
    -- Action link
    action_url TEXT,
    
    -- Status
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE read = false;
```


### Banking & Financial Tables

#### bank_movements
```sql
CREATE TABLE bank_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    bank_name VARCHAR(100) NOT NULL,
    account_no VARCHAR(50) NOT NULL,
    
    -- Transaction details
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'TRY',
    sender_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Matching
    matched_donation_id UUID REFERENCES donations(id),
    status VARCHAR(20) DEFAULT 'unmatched',  -- 'unmatched', 'matched', 'ignored'
    matched_by UUID REFERENCES users(id),
    matched_at TIMESTAMP,
    
    -- Transaction date (from bank)
    happened_at TIMESTAMP NOT NULL,
    
    -- Import info
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    import_source VARCHAR(50),  -- 'manual', 'csv_import', 'api'
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bank_movements_org ON bank_movements(organization_id);
CREATE INDEX idx_bank_movements_status ON bank_movements(status);
CREATE INDEX idx_bank_movements_date ON bank_movements(happened_at DESC);
```

#### payment_transactions
```sql
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
    
    -- Provider info
    provider VARCHAR(50) NOT NULL,  -- 'vakifkatilim', 'stripe'
    transaction_id VARCHAR(255),
    order_id VARCHAR(100),
    
    -- Amount
    amount_cents BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'TRY',
    
    -- Status
    status VARCHAR(50) NOT NULL,  -- 'pending', 'authorized', 'captured', 'failed', 'refunded'
    
    -- 3D Secure info
    auth_code VARCHAR(50),
    md_status VARCHAR(10),  -- 3D Secure result
    cavv VARCHAR(100),
    eci VARCHAR(10),
    
    -- Card info (last 4 digits only)
    card_last_4 VARCHAR(4),
    card_brand VARCHAR(20),
    card_holder_name VARCHAR(255),
    
    -- Error handling
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- Raw response from provider (for debugging)
    provider_request JSONB,
    provider_response JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    authorized_at TIMESTAMP,
    captured_at TIMESTAMP,
    failed_at TIMESTAMP
);

CREATE INDEX idx_payment_transactions_donation ON payment_transactions(donation_id);
CREATE INDEX idx_payment_transactions_provider ON payment_transactions(provider, transaction_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
```


### System & Audit Tables

#### audit_logs
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Action details
    action VARCHAR(50) NOT NULL,  -- 'create', 'update', 'delete', 'login', 'logout'
    resource_type VARCHAR(100) NOT NULL,  -- 'campaign', 'donation', 'user'
    resource_id UUID,
    
    -- Changes (for update actions)
    before_value JSONB,
    after_value JSONB,
    
    -- Request info
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path TEXT,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

#### tasks
```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    title VARCHAR(500) NOT NULL,
    description TEXT,
    
    -- Assignment
    owner VARCHAR(100) NOT NULL,  -- 'Muhasebe', 'Operasyon', 'CRM'
    assigned_to UUID REFERENCES users(id),
    
    -- Priority
    priority VARCHAR(20) DEFAULT 'normal',  -- 'low', 'normal', 'high', 'urgent'
    
    -- Status
    status VARCHAR(20) DEFAULT 'open',  -- 'open', 'in_progress', 'completed', 'cancelled'
    
    -- Dates
    due_at DATE NOT NULL,
    completed_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_org ON tasks(organization_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_at);
```

#### sessions
```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Token info
    refresh_token TEXT UNIQUE NOT NULL,  -- Hashed
    access_token_jti TEXT,  -- JWT ID for revocation
    
    -- Device info
    device_name VARCHAR(255),
    device_type VARCHAR(50),  -- 'desktop', 'mobile', 'tablet'
    ip_address INET,
    user_agent TEXT,
    
    -- Expiration
    expires_at TIMESTAMP NOT NULL,
    
    -- Status
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE revoked = false;
```


### PostgreSQL Row-Level Security (RLS)

Multi-tenant veri izolasyonu için PostgreSQL RLS kullanılacak:

```sql
-- Enable RLS on multi-tenant tables
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
-- ... other tables

-- Policy: Users can only see data from their organization
CREATE POLICY campaigns_org_isolation ON campaigns
    USING (organization_id = current_setting('app.current_organization_id')::uuid);

CREATE POLICY donations_org_isolation ON donations
    USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- Set organization context (called by backend middleware)
-- Example: SELECT set_config('app.current_organization_id', '123e4567-e89b-12d3-a456-426614174000', false);
```


## 🔌 API Design (RESTful)

### Base URL Structure

```
Production: https://api.e-infak.org/v1
Development: http://localhost:8000/api/v1
```

### Authentication

**JWT Bearer Token**:
```http
Authorization: Bearer <access_token>
```

**Access Token**: 15 dakika (short-lived)
**Refresh Token**: 7 gün (httpOnly cookie)

### Common Response Format

**Success**:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-07-11T10:30:00Z",
    "version": "1.0"
  }
}
```

**Error**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": {
      "field": "email",
      "value": "invalid"
    }
  },
  "meta": {
    "timestamp": "2026-07-11T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

### API Endpoints

#### Authentication & Users

```yaml
# Authentication
POST   /auth/register          # Register new user
POST   /auth/login             # Login (returns access + refresh token)
POST   /auth/refresh           # Refresh access token
POST   /auth/logout            # Logout (revoke tokens)
POST   /auth/forgot-password   # Send password reset email
POST   /auth/reset-password    # Reset password with token
POST   /auth/verify-email      # Verify email with token

# Users
GET    /users/me               # Get current user profile
PATCH  /users/me               # Update current user profile
GET    /users                  # List users (admin only)
POST   /users                  # Create user (admin only)
GET    /users/{id}             # Get user by ID
PATCH  /users/{id}             # Update user
DELETE /users/{id}             # Delete user
```

#### Organizations

```yaml
# Organizations (Platform Admin only)
GET    /organizations          # List all organizations
POST   /organizations          # Create new organization
GET    /organizations/{id}     # Get organization details
PATCH  /organizations/{id}     # Update organization
DELETE /organizations/{id}     # Delete organization

# Current organization (STK Admin)
GET    /organization           # Get current organization (from domain)
PATCH  /organization           # Update current organization
GET    /organization/stats     # Organization statistics
```

#### Campaigns

```yaml
# Public endpoints (no auth required)
GET    /campaigns              # List active campaigns
GET    /campaigns/{slug}       # Get campaign details

# Protected endpoints (auth required)
POST   /campaigns              # Create campaign (admin)
PATCH  /campaigns/{id}         # Update campaign (admin)
DELETE /campaigns/{id}         # Delete campaign (admin)
GET    /campaigns/{id}/stats   # Campaign statistics
POST   /campaigns/{id}/publish # Publish campaign (admin)
```


#### Donations

```yaml
# Donations
POST   /donations              # Create donation (initiate payment)
GET    /donations              # List donations (with filters)
GET    /donations/{id}         # Get donation details
GET    /donations/{id}/receipt # Download receipt PDF

# Payment callbacks (from bank VPOS)
POST   /donations/callback/success  # 3D Secure success callback
POST   /donations/callback/fail     # 3D Secure fail callback

# Recurring
POST   /donations/recurring    # Setup recurring plan
GET    /donations/recurring    # List recurring plans
PATCH  /donations/recurring/{id}/pause   # Pause plan
PATCH  /donations/recurring/{id}/resume  # Resume plan
DELETE /donations/recurring/{id}         # Cancel plan
```

#### Donors (CRM)

```yaml
GET    /donors                 # List donors (with filters, pagination)
POST   /donors                 # Create donor
GET    /donors/{id}            # Get donor profile
PATCH  /donors/{id}            # Update donor
DELETE /donors/{id}            # Delete donor (GDPR)
GET    /donors/{id}/donations  # Get donor's donation history
GET    /donors/{id}/stats      # Donor statistics

# Segmentation
POST   /donors/segments        # Create segment
GET    /donors/segments        # List segments
GET    /donors/segments/{id}   # Get segment details
POST   /donors/segments/{id}/export  # Export segment to CSV

# Bulk operations
POST   /donors/import          # Import donors from CSV
POST   /donors/merge           # Merge duplicate donors
```

#### Kurban (Qurban)

```yaml
# Animals
GET    /kurban/animals         # List animals
POST   /kurban/animals         # Create animal record
GET    /kurban/animals/{id}    # Get animal details
PATCH  /kurban/animals/{id}    # Update animal
DELETE /kurban/animals/{id}    # Delete animal
POST   /kurban/animals/import  # Bulk import animals

# Shares
GET    /kurban/shares          # List shares
GET    /kurban/shares/{id}     # Get share details
PATCH  /kurban/shares/{id}     # Update share (assign to donor)
POST   /kurban/shares/{id}/notify  # Send slaughter notification

# Operations
POST   /kurban/animals/{id}/slaughter  # Mark as slaughtered + upload video
POST   /kurban/animals/{id}/notify-all # Notify all shareholders
```

#### Orphans

```yaml
GET    /orphans                # List orphans
POST   /orphans                # Create orphan profile
GET    /orphans/{id}           # Get orphan details
PATCH  /orphans/{id}           # Update orphan
DELETE /orphans/{id}           # Delete orphan
GET    /orphans/{id}/reports   # Get orphan reports
POST   /orphans/{id}/reports   # Upload report (school, health)
POST   /orphans/{id}/sponsor   # Assign sponsor
DELETE /orphans/{id}/sponsor   # Remove sponsor
```


#### Reports & Analytics

```yaml
GET    /reports/dashboard      # Dashboard KPIs
GET    /reports/donations      # Donation report (with filters)
GET    /reports/donors         # Donor report
GET    /reports/campaigns      # Campaign performance report
GET    /reports/financial      # Financial reconciliation report
GET    /reports/kurban         # Kurban operations report

# Export
POST   /reports/export         # Generate and download report (PDF/Excel)
```

#### Communication

```yaml
# Templates
GET    /messages/templates     # List templates
POST   /messages/templates     # Create template
GET    /messages/templates/{id} # Get template
PATCH  /messages/templates/{id} # Update template
DELETE /messages/templates/{id} # Delete template

# Send messages
POST   /messages/send          # Send message (email/SMS)
POST   /messages/bulk-send     # Bulk send to segment

# Logs
GET    /messages/logs          # Message delivery logs
GET    /messages/logs/{id}     # Get log details
```

#### Bank Reconciliation

```yaml
GET    /bank/movements         # List bank movements
POST   /bank/movements         # Add bank movement manually
POST   /bank/movements/import  # Import from CSV
GET    /bank/movements/unmatched # List unmatched movements
POST   /bank/movements/{id}/match # Match to donation
DELETE /bank/movements/{id}/match # Unmatch
```

#### Tasks

```yaml
GET    /tasks                  # List tasks (with filters)
POST   /tasks                  # Create task
GET    /tasks/{id}             # Get task
PATCH  /tasks/{id}             # Update task
DELETE /tasks/{id}             # Delete task
POST   /tasks/{id}/complete    # Mark as completed
```

#### Notifications

```yaml
GET    /notifications          # List notifications (for current user)
GET    /notifications/unread   # Count unread notifications
PATCH  /notifications/{id}/read # Mark as read
POST   /notifications/read-all # Mark all as read
DELETE /notifications/{id}     # Delete notification
```


### Example API Request/Response

#### POST /donations - Create Donation

**Request**:
```http
POST /api/v1/donations HTTP/1.1
Host: api.e-infak.org
Content-Type: application/json

{
  "campaign_id": "123e4567-e89b-12d3-a456-426614174000",
  "amount_cents": 100000,
  "donor": {
    "full_name": "Ahmet Yılmaz",
    "email": "ahmet@example.com",
    "phone": "+905321234567",
    "city": "İstanbul"
  },
  "payment": {
    "method": "card",
    "card_number": "4506347011111111",
    "card_holder": "AHMET YILMAZ",
    "expiry_month": "12",
    "expiry_year": "25",
    "cvv": "123"
  },
  "options": {
    "dedicatee": "Annem için",
    "note": "Hayırlı olsun",
    "anonymous": false,
    "kvkk_consent": true
  },
  "return_urls": {
    "success": "https://hicretdernegi.org/bagis/basarili",
    "fail": "https://hicretdernegi.org/bagis/hata"
  }
}
```

**Response** (3D Secure required):
```json
{
  "success": true,
  "data": {
    "donation_id": "don_abc123",
    "status": "pending",
    "requires_3d_secure": true,
    "redirect": {
      "method": "POST",
      "url": "https://vpos.vakifkatilim.com.tr/lpos/shg/3dSecurePay",
      "fields": {
        "clientid": "MERCHANT_123",
        "oid": "ORD-2026-001",
        "amount": "1000.00",
        "okUrl": "https://api.e-infak.org/v1/donations/callback/success",
        "failUrl": "https://api.e-infak.org/v1/donations/callback/fail",
        "hash": "a8b3c4d5e6f7...",
        "rnd": "xyz123abc",
        "storetype": "3d_pay",
        "currency": "949",
        "lang": "tr"
      }
    }
  },
  "meta": {
    "timestamp": "2026-07-11T10:30:00Z",
    "version": "1.0"
  }
}
```

#### GET /campaigns?org_slug=hicret-dernegi

**Response**:
```json
{
  "success": true,
  "data": {
    "campaigns": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "slug": "zekat",
        "title": "Zekat",
        "category": "zekat",
        "summary": "Zekat emanetlerinizi ihtiyaç sahiplerine ulaştırıyoruz.",
        "cover_image_url": "/images/hicret/talebe-2.png",
        "target_cents": 180000000,
        "collected_cents": 95000000,
        "progress_percentage": 52.78,
        "featured": true,
        "active": true,
        "created_at": "2026-01-01T00:00:00Z"
      },
      {
        "id": "234e5678-e89b-12d3-a456-426614174001",
        "slug": "kurban-bagisi",
        "title": "Kurban Bağışı",
        "category": "kurban",
        "summary": "Vacip, adak, akika ve şükür kurbanları.",
        "cover_image_url": "/images/hicret/talebe-5.jpeg",
        "target_cents": 420000000,
        "collected_cents": 285000000,
        "progress_percentage": 67.86,
        "featured": true,
        "active": true,
        "created_at": "2026-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 25,
      "total": 15,
      "total_pages": 1
    }
  },
  "meta": {
    "timestamp": "2026-07-11T10:30:00Z",
    "version": "1.0"
  }
}
```


## 🎨 Frontend Architecture (Next.js)

### Project Structure (Monorepo)

```
e-infak-v2/
├── apps/
│   ├── web/                    # Main Next.js app
│   │   ├── app/               # App Router
│   │   │   ├── (public)/      # Public routes (no auth)
│   │   │   │   ├── page.tsx   # Homepage
│   │   │   │   ├── kampanyalar/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [slug]/page.tsx
│   │   │   │   ├── bagis/
│   │   │   │   │   ├── [campaign]/page.tsx
│   │   │   │   │   ├── basarili/page.tsx
│   │   │   │   │   └── hata/page.tsx
│   │   │   │   ├── hakkimizda/page.tsx
│   │   │   │   └── iletisim/page.tsx
│   │   │   ├── (auth)/        # Auth routes
│   │   │   │   ├── giris/page.tsx
│   │   │   │   └── kayit/page.tsx
│   │   │   ├── (dashboard)/   # Protected admin routes
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx   # Dashboard
│   │   │   │   ├── kampanyalar/
│   │   │   │   ├── bagislar/
│   │   │   │   ├── bagiscilar/
│   │   │   │   ├── kurban/
│   │   │   │   ├── yetimler/
│   │   │   │   ├── raporlar/
│   │   │   │   └── ayarlar/
│   │   │   ├── api/           # API routes (proxies to backend)
│   │   │   │   └── [...path]/route.ts
│   │   │   └── layout.tsx     # Root layout
│   │   ├── components/
│   │   │   ├── ui/           # Shadcn/Radix components
│   │   │   ├── campaign/     # Campaign-specific components
│   │   │   ├── donation/     # Donation form components
│   │   │   └── admin/        # Admin panel components
│   │   ├── lib/
│   │   │   ├── api.ts        # API client
│   │   │   ├── theme.ts      # Theme loader
│   │   │   ├── utils.ts
│   │   │   └── hooks/
│   │   ├── styles/
│   │   │   └── globals.css
│   │   ├── public/
│   │   │   └── images/
│   │   ├── middleware.ts     # Multi-tenant routing
│   │   └── package.json
│   │
│   └── admin/                 # Platform admin panel (optional separate app)
│       └── ...
│
├── packages/
│   ├── ui/                    # Shared UI components
│   │   ├── src/
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── form.tsx
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── theme/                 # Theme system
│   │   ├── src/
│   │   │   ├── hicret.ts
│   │   │   ├── kardeslik.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── api-client/            # API client library
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── campaigns.ts
│   │   │   ├── donations.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── config/                # Shared config (eslint, ts, tailwind)
│       ├── eslint-config/
│       ├── typescript-config/
│       └── tailwind-config/
│
├── services/
│   └── backend/               # FastAPI backend
│       ├── app/
│       │   ├── main.py
│       │   ├── api/
│       │   │   ├── v1/
│       │   │   │   ├── campaigns.py
│       │   │   │   ├── donations.py
│       │   │   │   └── ...
│       │   │   └── deps.py
│       │   ├── core/
│       │   │   ├── config.py
│       │   │   ├── security.py
│       │   │   └── db.py
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── services/
│       │   └── tasks/
│       ├── alembic/
│       ├── tests/
│       ├── requirements.txt
│       └── Dockerfile
│
├── docker-compose.yml
├── package.json               # Workspace root
├── turbo.json                # Turborepo config
└── README.md
```


### Multi-Tenant Middleware (Next.js)

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  
  // Extract organization from hostname
  let orgSlug: string | null = null;
  
  // Check if it's a custom domain
  if (hostname.includes('hicretdernegi.org')) {
    orgSlug = 'hicret-dernegi';
  } else if (hostname.includes('kardeslikpayi.org')) {
    orgSlug = 'kardeslik-payi';
  }
  // Check if it's a subdomain
  else if (hostname.includes('.e-infak.org')) {
    orgSlug = hostname.split('.')[0];
  }
  
  if (!orgSlug) {
    // Default landing page or error
    return NextResponse.redirect(new URL('/404', request.url));
  }
  
  // Add organization to headers (accessible in server components)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-organization-slug', orgSlug);
  
  // Rewrite to include organization in path
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  // Set cookie for client-side access
  response.cookies.set('org-slug', orgSlug, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api routes (handled separately)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

### Theme System

```typescript
// packages/theme/src/types.ts
export interface Theme {
  name: string;
  slug: string;
  colors: {
    primary: {
      50: string;
      100: string;
      // ... up to 900
    };
    accent: {
      50: string;
      100: string;
      // ... up to 900
    };
  };
  fonts: {
    heading: string;
    body: string;
  };
  logo: {
    light: string;
    dark: string;
  };
}

// packages/theme/src/hicret.ts
export const hicretTheme: Theme = {
  name: 'Hicret Derneği',
  slug: 'hicret',
  colors: {
    primary: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      // ... Tailwind green-700 base: #065f46
      700: '#065f46',
      900: '#14532d',
    },
    accent: {
      // ... Tailwind sky-600 base: #0284c7
      600: '#0284c7',
    },
  },
  fonts: {
    heading: 'Poppins',
    body: 'Poppins',
  },
  logo: {
    light: '/images/hicret/logo.png',
    dark: '/images/hicret/logo-dark.png',
  },
};

// packages/theme/src/kardeslik.ts
export const kardeslikTheme: Theme = {
  name: 'Kardeşlik Payı Derneği',
  slug: 'kardeslik',
  colors: {
    primary: {
      // ... Tailwind red-600 base: #DC2626
      600: '#DC2626',
    },
    accent: {
      // ... Tailwind amber-500 base: #F59E0B
      500: '#F59E0B',
    },
  },
  fonts: {
    heading: 'Outfit',
    body: 'Outfit',
  },
  logo: {
    light: '/images/kardeslik/logo-new.png',
    dark: '/images/kardeslik/logo-new.png',
  },
};
```


### API Client (React Query)

```typescript
// packages/api-client/src/client.ts
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // For cookies
});

// Request interceptor: Add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Add organization context
  const orgSlug = document.cookie
    .split('; ')
    .find(row => row.startsWith('org-slug='))
    ?.split('=')[1];
  
  if (orgSlug) {
    config.headers['X-Organization-Slug'] = orgSlug;
  }
  
  return config;
});

// Response interceptor: Handle errors
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      try {
        await refreshToken();
        return apiClient.request(error.config);
      } catch {
        // Refresh failed, redirect to login
        window.location.href = '/giris';
      }
    }
    return Promise.reject(error);
  }
);

async function refreshToken() {
  const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, {
    withCredentials: true,
  });
  localStorage.setItem('access_token', response.data.data.access_token);
  return response.data;
}

// packages/api-client/src/campaigns.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

export function useCampaigns(filters?: { active?: boolean; featured?: boolean }) {
  return useQuery({
    queryKey: ['campaigns', filters],
    queryFn: async () => {
      const response = await apiClient.get('/campaigns', { params: filters });
      return response.data.campaigns;
    },
  });
}

export function useCampaign(slug: string) {
  return useQuery({
    queryKey: ['campaign', slug],
    queryFn: async () => {
      const response = await apiClient.get(`/campaigns/${slug}`);
      return response.data;
    },
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiClient.post('/campaigns', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

// packages/api-client/src/donations.ts
export function useCreateDonation() {
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await apiClient.post('/donations', data);
      return response.data;
    },
  });
}

export function useDonations(filters?: { campaign_id?: string; status?: string }) {
  return useQuery({
    queryKey: ['donations', filters],
    queryFn: async () => {
      const response = await apiClient.get('/donations', { params: filters });
      return response.data;
    },
  });
}
```


## 🔧 Backend Architecture (FastAPI)

### Project Structure

```
services/backend/
├── app/
│   ├── main.py                # FastAPI app entry point
│   ├── api/
│   │   ├── deps.py           # Dependencies (DB session, current user)
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── auth.py
│   │       ├── organizations.py
│   │       ├── campaigns.py
│   │       ├── donations.py
│   │       ├── donors.py
│   │       ├── kurban.py
│   │       ├── orphans.py
│   │       ├── reports.py
│   │       ├── messages.py
│   │       └── tasks.py
│   ├── core/
│   │   ├── config.py         # Settings (env vars)
│   │   ├── security.py       # JWT, password hashing
│   │   ├── db.py             # Database connection
│   │   └── celery_app.py     # Celery configuration
│   ├── models/               # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── organization.py
│   │   ├── user.py
│   │   ├── campaign.py
│   │   ├── donation.py
│   │   ├── donor.py
│   │   └── ...
│   ├── schemas/              # Pydantic schemas (request/response)
│   │   ├── __init__.py
│   │   ├── campaign.py
│   │   ├── donation.py
│   │   ├── donor.py
│   │   └── ...
│   ├── services/             # Business logic
│   │   ├── campaign_service.py
│   │   ├── donation_service.py
│   │   ├── payment_service.py
│   │   ├── kurban_service.py
│   │   └── ...
│   ├── tasks/                # Celery tasks
│   │   ├── __init__.py
│   │   ├── email_tasks.py
│   │   ├── sms_tasks.py
│   │   ├── recurring_tasks.py
│   │   └── report_tasks.py
│   ├── middleware/
│   │   ├── tenant.py         # Multi-tenant middleware
│   │   └── logging.py
│   └── utils/
│       ├── vpos.py           # VPOS integration
│       ├── pdf.py            # Receipt generation
│       └── helpers.py
├── alembic/                  # Database migrations
│   ├── versions/
│   └── env.py
├── tests/
│   ├── conftest.py
│   ├── test_campaigns.py
│   ├── test_donations.py
│   └── ...
├── requirements.txt
├── Dockerfile
└── .env.example
```

### Multi-Tenant Middleware

```python
# app/middleware/tenant.py
from fastapi import Request, HTTPException
from sqlalchemy.orm import Session
from app.core.db import SessionLocal
from app.models.organization import Organization

async def tenant_middleware(request: Request, call_next):
    """
    Extract organization from hostname or header.
    Set organization context for database queries.
    """
    # Get organization slug from header or cookie
    org_slug = (
        request.headers.get('X-Organization-Slug') 
        or request.cookies.get('org-slug')
    )
    
    if not org_slug:
        # Try to extract from hostname
        hostname = request.headers.get('host', '')
        if 'hicretdernegi.org' in hostname:
            org_slug = 'hicret-dernegi'
        elif 'kardeslikpayi.org' in hostname:
            org_slug = 'kardeslik-payi'
        elif '.e-infak.org' in hostname:
            org_slug = hostname.split('.')[0]
    
    if not org_slug:
        raise HTTPException(status_code=400, detail="Organization not specified")
    
    # Validate organization exists
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.slug == org_slug).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Set organization context (for RLS and app logic)
        request.state.organization_id = str(org.id)
        request.state.organization_slug = org_slug
        
        # Set PostgreSQL session variable for RLS
        db.execute(
            "SELECT set_config('app.current_organization_id', :org_id, false)",
            {"org_id": str(org.id)}
        )
    finally:
        db.close()
    
    response = await call_next(request)
    return response
```

### Authentication & Authorization

```python
# app/core/security.py
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = "your-secret-key-here"  # From env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None or payload.get("type") != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.active:
        raise credentials_exception
    return user

def require_role(required_role: str):
    """Decorator for role-based access control"""
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in ['platform_admin', required_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker
```


### Donation Service Example

```python
# app/services/donation_service.py
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.donation import Donation
from app.models.donor import Donor
from app.models.campaign import Campaign
from app.schemas.donation import DonationCreate
from app.services.payment_service import PaymentService
from app.tasks.email_tasks import send_receipt_email
from app.tasks.sms_tasks import send_thank_you_sms

class DonationService:
    def __init__(self, db: Session, organization_id: UUID):
        self.db = db
        self.organization_id = organization_id
        self.payment_service = PaymentService(db, organization_id)
    
    async def create_donation(self, data: DonationCreate) -> dict:
        """
        Create donation and initiate payment flow.
        Returns 3D Secure redirect info if required.
        """
        # 1. Find or create donor
        donor = await self._get_or_create_donor(data.donor)
        
        # 2. Validate campaign
        campaign = self.db.query(Campaign).filter(
            Campaign.id == data.campaign_id,
            Campaign.organization_id == self.organization_id,
            Campaign.active == True
        ).first()
        
        if not campaign:
            raise ValueError("Campaign not found or inactive")
        
        # 3. Generate receipt number
        receipt_no = await self._generate_receipt_number()
        
        # 4. Create donation record (status: pending)
        donation = Donation(
            id=uuid4(),
            organization_id=self.organization_id,
            donor_id=donor.id,
            campaign_id=campaign.id,
            amount_cents=data.amount_cents,
            currency=data.currency or 'TRY',
            payment_method=data.payment.method,
            payment_status='pending',
            receipt_no=receipt_no,
            note=data.options.note if data.options else None,
            dedicatee=data.options.dedicatee if data.options else None,
            anonymous=data.options.anonymous if data.options else False,
            idempotency_key=data.idempotency_key or uuid4()
        )
        
        self.db.add(donation)
        self.db.commit()
        self.db.refresh(donation)
        
        # 5. Initiate payment (3D Secure)
        payment_result = await self.payment_service.initiate_payment(
            donation=donation,
            payment_data=data.payment,
            return_urls=data.return_urls
        )
        
        return {
            'donation_id': str(donation.id),
            'status': donation.payment_status,
            'requires_3d_secure': payment_result['requires_3d_secure'],
            'redirect': payment_result.get('redirect')
        }
    
    async def handle_payment_callback(self, params: dict) -> Donation:
        """
        Handle 3D Secure callback from bank.
        """
        # 1. Verify signature
        if not self.payment_service.verify_callback(params):
            raise ValueError("Invalid callback signature")
        
        # 2. Find donation by order_id
        order_id = params.get('oid')
        donation = self.db.query(Donation).filter(
            Donation.receipt_no == order_id
        ).first()
        
        if not donation:
            raise ValueError("Donation not found")
        
        # 3. Check payment status
        md_status = params.get('mdStatus')
        response_code = params.get('Response')
        
        if md_status == '1' and response_code == 'Approved':
            # Payment successful
            donation.payment_status = 'confirmed'
            donation.confirmed_at = datetime.utcnow()
            donation.bank_auth_code = params.get('AuthCode')
            donation.bank_transaction_id = params.get('TransId')
            
            # Update campaign collected amount
            campaign = donation.campaign
            campaign.collected_cents += donation.amount_cents
            
            # Update donor stats
            donor = donation.donor
            donor.total_donated_cents += donation.amount_cents
            donor.donation_count += 1
            donor.last_donation_at = datetime.utcnow()
            
            self.db.commit()
            
            # 4. Trigger post-payment tasks
            send_receipt_email.delay(str(donation.id))
            send_thank_you_sms.delay(str(donation.id))
            
            # 5. Handle special cases (kurban, recurring, etc.)
            if campaign.category == 'kurban':
                from app.services.kurban_service import KurbanService
                kurban_service = KurbanService(self.db, self.organization_id)
                await kurban_service.assign_share(donation)
        else:
            # Payment failed
            donation.payment_status = 'failed'
            donation.failed_at = datetime.utcnow()
            donation.bank_error_message = params.get('ErrMsg')
            self.db.commit()
        
        return donation
    
    async def _get_or_create_donor(self, donor_data) -> Donor:
        """Find existing donor or create new one"""
        existing = self.db.query(Donor).filter(
            Donor.organization_id == self.organization_id,
            Donor.email == donor_data.email
        ).first()
        
        if existing:
            return existing
        
        donor = Donor(
            id=uuid4(),
            organization_id=self.organization_id,
            full_name=donor_data.full_name,
            email=donor_data.email,
            phone=donor_data.phone,
            city=donor_data.city,
            kvkk_consent=donor_data.kvkk_consent,
            kvkk_consent_at=datetime.utcnow() if donor_data.kvkk_consent else None
        )
        self.db.add(donor)
        self.db.commit()
        self.db.refresh(donor)
        return donor
    
    async def _generate_receipt_number(self) -> str:
        """Generate unique receipt number: ORG-YYYY-NNNNNN"""
        org = self.db.query(Organization).filter(
            Organization.id == self.organization_id
        ).first()
        
        year = datetime.utcnow().year
        
        # Get last receipt number for this year
        last_donation = self.db.query(Donation).filter(
            Donation.organization_id == self.organization_id,
            Donation.receipt_no.like(f"{org.slug.upper()}-{year}-%")
        ).order_by(Donation.created_at.desc()).first()
        
        if last_donation:
            last_number = int(last_donation.receipt_no.split('-')[-1])
            next_number = last_number + 1
        else:
            next_number = 1
        
        return f"{org.slug.upper()}-{year}-{next_number:06d}"
```


### Celery Tasks

```python
# app/tasks/email_tasks.py
from celery import shared_task
from app.core.db import SessionLocal
from app.models.donation import Donation
from app.utils.pdf import generate_receipt_pdf
from app.utils.email import send_email

@shared_task(bind=True, max_retries=3)
def send_receipt_email(self, donation_id: str):
    """
    Generate receipt PDF and send via email.
    """
    db = SessionLocal()
    try:
        donation = db.query(Donation).filter(Donation.id == donation_id).first()
        if not donation or not donation.donor.email:
            return
        
        # Generate PDF
        pdf_url = generate_receipt_pdf(donation)
        donation.receipt_url = pdf_url
        db.commit()
        
        # Send email
        send_email(
            to=donation.donor.email,
            subject=f"Bağış Makbuzunuz - {donation.organization.name}",
            template='donation_receipt',
            context={
                'donor_name': donation.donor.full_name,
                'amount': donation.amount_cents / 100,
                'campaign': donation.campaign.title,
                'receipt_no': donation.receipt_no,
                'receipt_url': pdf_url,
                'organization': donation.organization
            }
        )
    except Exception as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
    finally:
        db.close()

# app/tasks/sms_tasks.py
from celery import shared_task
from app.utils.sms import send_sms

@shared_task(bind=True, max_retries=3)
def send_thank_you_sms(self, donation_id: str):
    """
    Send thank you SMS with receipt link.
    """
    db = SessionLocal()
    try:
        donation = db.query(Donation).filter(Donation.id == donation_id).first()
        if not donation or not donation.donor.phone:
            return
        
        message = (
            f"Sayın {donation.donor.full_name}, "
            f"{donation.amount_cents / 100:.2f} TL bağışınız için teşekkür ederiz. "
            f"Makbuz: {donation.receipt_url}"
        )
        
        send_sms(
            phone=donation.donor.phone,
            message=message,
            organization_id=donation.organization_id
        )
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
    finally:
        db.close()

# app/tasks/recurring_tasks.py
from celery import shared_task
from datetime import datetime
from app.services.donation_service import DonationService

@shared_task
def process_recurring_donations():
    """
    Cron job: Process all recurring donations that are due.
    Run daily at 09:00 AM.
    """
    db = SessionLocal()
    try:
        # Find plans due for charging
        plans = db.query(RecurringPlan).filter(
            RecurringPlan.status == 'active',
            RecurringPlan.next_charge_at <= datetime.utcnow()
        ).all()
        
        for plan in plans:
            try:
                # Charge using saved payment token
                donation_service = DonationService(db, plan.organization_id)
                result = await donation_service.charge_recurring_plan(plan)
                
                if result['success']:
                    plan.successful_charges += 1
                    plan.last_charge_at = datetime.utcnow()
                    plan.next_charge_at = calculate_next_charge_date(plan)
                else:
                    plan.failed_charges += 1
                    if plan.failed_charges >= 3:
                        plan.status = 'failed'
                        # Send notification to donor
            except Exception as e:
                print(f"Error processing recurring plan {plan.id}: {e}")
        
        db.commit()
    finally:
        db.close()
```


## 🚀 Deployment Architecture

### Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: einfak
      POSTGRES_PASSWORD: einfak_dev
      POSTGRES_DB: einfak_v2
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U einfak"]
      interval: 10s
      timeout: 5s
      retries: 5
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
  
  backend:
    build:
      context: ./services/backend
      dockerfile: Dockerfile
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./services/backend:/app
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://einfak:einfak_dev@postgres:5432/einfak_v2
      - REDIS_URL=redis://redis:6379/0
      - SECRET_KEY=dev_secret_key_change_in_production
      - ENVIRONMENT=development
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
  
  celery_worker:
    build:
      context: ./services/backend
      dockerfile: Dockerfile
    command: celery -A app.core.celery_app worker --loglevel=info
    volumes:
      - ./services/backend:/app
    environment:
      - DATABASE_URL=postgresql://einfak:einfak_dev@postgres:5432/einfak_v2
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
  
  celery_beat:
    build:
      context: ./services/backend
      dockerfile: Dockerfile
    command: celery -A app.core.celery_app beat --loglevel=info
    volumes:
      - ./services/backend:/app
    environment:
      - DATABASE_URL=postgresql://einfak:einfak_dev@postgres:5432/einfak_v2
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
  
  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile.dev
    command: npm run dev
    volumes:
      - ./apps/web:/app
      - /app/node_modules
      - /app/.next
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
      - NODE_ENV=development
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
```

### Kubernetes (Production)

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  labels:
    app: einfak-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: einfak-backend
  template:
    metadata:
      labels:
        app: einfak-backend
    spec:
      containers:
      - name: backend
        image: registry.e-infak.org/backend:latest
        ports:
        - containerPort: 8000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: einfak-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: einfak-secrets
              key: redis-url
        - name: SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: einfak-secrets
              key: secret-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: backend-service
spec:
  selector:
    app: einfak-backend
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8000
  type: ClusterIP

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```


## 🔒 Security Architecture

### Defense in Depth Layers

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Network (Cloudflare WAF, DDoS Protection)     │
├─────────────────────────────────────────────────────────┤
│ Layer 2: Application (Rate Limiting, CORS, CSP)        │
├─────────────────────────────────────────────────────────┤
│ Layer 3: Authentication (JWT, 2FA, Session Management) │
├─────────────────────────────────────────────────────────┤
│ Layer 4: Authorization (RBAC, RLS)                     │
├─────────────────────────────────────────────────────────┤
│ Layer 5: Data (Encryption at rest, TLS, PCI-DSS)       │
└─────────────────────────────────────────────────────────┘
```

### Rate Limiting Strategy

```python
# app/middleware/rate_limit.py
from fastapi import Request, HTTPException
from redis import Redis
import time

redis_client = Redis.from_url(REDIS_URL)

async def rate_limit_middleware(request: Request, call_next):
    """
    Rate limiting by IP address:
    - Public endpoints: 100 req/min
    - Auth endpoints: 5 req/min
    - Admin endpoints: 300 req/min
    """
    ip = request.client.host
    path = request.url.path
    
    # Define limits
    if path.startswith('/api/v1/auth/login'):
        limit = 5
        window = 60  # 1 minute
    elif path.startswith('/api/v1/admin'):
        limit = 300
        window = 60
    else:
        limit = 100
        window = 60
    
    # Check rate limit
    key = f"rate_limit:{ip}:{path}"
    current = redis_client.get(key)
    
    if current and int(current) >= limit:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later."
        )
    
    # Increment counter
    pipe = redis_client.pipeline()
    pipe.incr(key)
    pipe.expire(key, window)
    pipe.execute()
    
    response = await call_next(request)
    return response
```

### CORS Configuration

```python
# app/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://hicretdernegi.org",
        "https://kardeslikpayi.org",
        "https://*.e-infak.org",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)
```

### Security Headers

```python
# app/middleware/security_headers.py
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:; "
        "connect-src 'self' https://api.e-infak.org"
    )
    
    return response
```


## 📊 Monitoring & Observability

### Metrics Stack

```yaml
# Prometheus metrics exposed by FastAPI
/metrics endpoint:
  - http_requests_total
  - http_request_duration_seconds
  - database_query_duration_seconds
  - celery_task_duration_seconds
  - active_connections
  - payment_success_rate
  - donation_amount_total
```

### Logging Strategy

```python
# app/core/logging.py
import logging
from pythonjsonlogger import jsonlogger

# Structured JSON logging
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter(
    '%(asctime)s %(name)s %(levelname)s %(message)s'
)
logHandler.setFormatter(formatter)

logger = logging.getLogger()
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

# Usage
logger.info(
    "Donation created",
    extra={
        "donation_id": str(donation.id),
        "organization_id": str(org.id),
        "amount_cents": donation.amount_cents,
        "campaign_id": str(campaign.id)
    }
)
```

### Error Tracking (Sentry)

```python
# app/main.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("ENVIRONMENT", "development"),
    traces_sample_rate=0.1,  # 10% of transactions
    integrations=[FastApiIntegration()],
)

# Custom error context
with sentry_sdk.configure_scope() as scope:
    scope.set_context("organization", {
        "id": str(org.id),
        "slug": org.slug,
        "name": org.name
    })
    scope.set_user({"id": str(user.id), "email": user.email})
```

### Health Checks

```python
# app/api/v1/health.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter()

@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for load balancer.
    Checks DB connection and Redis.
    """
    try:
        # Check database
        db.execute("SELECT 1")
        
        # Check Redis
        redis_client.ping()
        
        return {
            "status": "healthy",
            "database": "connected",
            "redis": "connected",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }, 503
```


## 🧪 Testing Strategy

### Test Pyramid

```
              ┌─────────────┐
              │  E2E Tests  │  (10%)
              │  Playwright │
              └─────────────┘
         ┌──────────────────────┐
         │  Integration Tests   │  (30%)
         │  API + DB            │
         └──────────────────────┘
    ┌───────────────────────────────┐
    │      Unit Tests               │  (60%)
    │      Functions, Services      │
    └───────────────────────────────┘
```

### Backend Tests (Pytest)

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.db import Base, get_db

# Test database
SQLALCHEMY_TEST_DATABASE_URL = "postgresql://test:test@localhost/einfak_test"
engine = create_engine(SQLALCHEMY_TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(bind=engine)

@pytest.fixture(scope="function")
def db():
    """Create test database tables"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db):
    """FastAPI test client"""
    def override_get_db():
        try:
            yield db
        finally:
            db.close()
    
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()

@pytest.fixture
def test_organization(db):
    """Create test organization"""
    org = Organization(
        slug="test-org",
        name="Test Organization",
        domain=["test.e-infak.org"],
        primary_color="#065f46",
        accent_color="#0284c7"
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org

# tests/test_donations.py
def test_create_donation(client, test_organization):
    """Test donation creation"""
    response = client.post(
        "/api/v1/donations",
        json={
            "campaign_id": str(test_campaign.id),
            "amount_cents": 100000,
            "donor": {
                "full_name": "Test Donor",
                "email": "test@example.com",
                "phone": "+905321234567"
            },
            "payment": {
                "method": "card",
                "card_number": "4506347011111111",
                "card_holder": "TEST USER",
                "expiry_month": "12",
                "expiry_year": "25",
                "cvv": "123"
            }
        },
        headers={"X-Organization-Slug": "test-org"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "donation_id" in data["data"]
```

### Frontend Tests (Vitest + Playwright)

```typescript
// apps/web/__tests__/donation-form.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DonationForm } from '@/components/donation/DonationForm';

describe('DonationForm', () => {
  it('validates required fields', async () => {
    render(<DonationForm campaignId="test-123" />);
    
    const submitButton = screen.getByRole('button', { name: /bağış yap/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/ad soyad zorunludur/i)).toBeInTheDocument();
      expect(screen.getByText(/e-posta zorunludur/i)).toBeInTheDocument();
    });
  });
  
  it('submits donation successfully', async () => {
    const mockSubmit = jest.fn();
    render(<DonationForm campaignId="test-123" onSubmit={mockSubmit} />);
    
    fireEvent.change(screen.getByLabelText(/ad soyad/i), {
      target: { value: 'Ahmet Yılmaz' }
    });
    fireEvent.change(screen.getByLabelText(/e-posta/i), {
      target: { value: 'ahmet@example.com' }
    });
    fireEvent.change(screen.getByLabelText(/telefon/i), {
      target: { value: '05321234567' }
    });
    fireEvent.change(screen.getByLabelText(/tutar/i), {
      target: { value: '1000' }
    });
    
    fireEvent.click(screen.getByRole('button', { name: /bağış yap/i }));
    
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          donor: expect.objectContaining({
            full_name: 'Ahmet Yılmaz',
            email: 'ahmet@example.com'
          }),
          amount_cents: 100000
        })
      );
    });
  });
});

// e2e/donation-flow.spec.ts (Playwright)
import { test, expect } from '@playwright/test';

test('complete donation flow', async ({ page }) => {
  await page.goto('https://hicretdernegi.org/kampanyalar/zekat');
  
  // Click donate button
  await page.click('text=Bağış Yap');
  
  // Fill form
  await page.fill('input[name="full_name"]', 'Test User');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="phone"]', '05321234567');
  await page.fill('input[name="amount"]', '1000');
  
  // Mock payment gateway
  await page.route('**/donations', route => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          donation_id: 'test-123',
          status: 'confirmed'
        }
      })
    });
  });
  
  await page.click('button[type="submit"]');
  
  // Verify success page
  await expect(page).toHaveURL(/\/bagis\/basarili/);
  await expect(page.locator('text=Teşekkürler')).toBeVisible();
});
```


## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/main.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          cd services/backend
          pip install -r requirements.txt
          pip install pytest pytest-cov
      
      - name: Run tests
        run: |
          cd services/backend
          pytest --cov=app --cov-report=xml
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/postgres
          REDIS_URL: redis://localhost:6379/0
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./services/backend/coverage.xml

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          npm install -g pnpm
          pnpm install
      
      - name: Lint
        run: pnpm lint
      
      - name: Type check
        run: pnpm type-check
      
      - name: Run unit tests
        run: pnpm test:unit
      
      - name: Build
        run: pnpm build
  
  e2e-tests:
    needs: [test-backend, test-frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          npm install -g pnpm
          pnpm install
      
      - name: Install Playwright
        run: pnpm exec playwright install --with-deps
      
      - name: Start services
        run: docker-compose up -d
      
      - name: Wait for services
        run: sleep 30
      
      - name: Run E2E tests
        run: pnpm test:e2e
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/

  build-and-push:
    needs: [test-backend, test-frontend, e2e-tests]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Log in to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: ./services/backend
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/backend:latest
      
      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./apps/web
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/web:latest

  deploy-staging:
    needs: build-and-push
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to staging
        run: |
          # Deploy to staging Kubernetes cluster
          kubectl set image deployment/backend backend=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/backend:latest
          kubectl set image deployment/web web=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/web:latest
  
  deploy-production:
    needs: build-and-push
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to production
        run: |
          # Deploy to production Kubernetes cluster
          kubectl set image deployment/backend backend=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/backend:latest
          kubectl set image deployment/web web=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/web:latest
```


## 📈 Performance Optimization

### Database Optimization

```sql
-- Indexes for common queries
CREATE INDEX CONCURRENTLY idx_donations_org_date 
ON donations(organization_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_campaigns_org_active 
ON campaigns(organization_id, active, featured) 
WHERE active = true;

CREATE INDEX CONCURRENTLY idx_donors_org_email 
ON donors(organization_id, email);

-- Materialized view for dashboard stats
CREATE MATERIALIZED VIEW organization_stats AS
SELECT 
    o.id as organization_id,
    COUNT(DISTINCT d.id) as total_donations,
    SUM(d.amount_cents) as total_amount_cents,
    COUNT(DISTINCT d.donor_id) as unique_donors,
    COUNT(DISTINCT c.id) as total_campaigns
FROM organizations o
LEFT JOIN donations d ON d.organization_id = o.id AND d.payment_status = 'confirmed'
LEFT JOIN campaigns c ON c.organization_id = o.id AND c.active = true
GROUP BY o.id;

-- Refresh stats (run daily via cron)
REFRESH MATERIALIZED VIEW CONCURRENTLY organization_stats;
```

### Caching Strategy

```python
# app/core/cache.py
from redis import Redis
import json
from functools import wraps

redis_client = Redis.from_url(REDIS_URL)

def cache(key_prefix: str, ttl: int = 300):
    """
    Cache decorator for expensive operations.
    TTL in seconds (default: 5 minutes)
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{hash(str(args) + str(kwargs))}"
            
            # Try to get from cache
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # Execute function
            result = await func(*args, **kwargs)
            
            # Store in cache
            redis_client.setex(
                cache_key,
                ttl,
                json.dumps(result, default=str)
            )
            
            return result
        return wrapper
    return decorator

# Usage
@cache(key_prefix="campaigns", ttl=600)  # 10 minutes
async def get_active_campaigns(org_id: UUID):
    return db.query(Campaign).filter(
        Campaign.organization_id == org_id,
        Campaign.active == True
    ).all()
```

### CDN Configuration

```
# Cloudflare Page Rules
*.e-infak.org/images/*
  - Cache Level: Everything
  - Edge Cache TTL: 1 month

*.e-infak.org/_next/static/*
  - Cache Level: Everything
  - Edge Cache TTL: 1 year

*.e-infak.org/api/*
  - Cache Level: Bypass
  - Browser Cache TTL: Respect Existing Headers
```

### Database Connection Pooling

```python
# app/core/db.py
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=10,          # Minimum connections
    max_overflow=20,       # Maximum additional connections
    pool_timeout=30,       # Connection timeout
    pool_recycle=3600,     # Recycle connections after 1 hour
    pool_pre_ping=True,    # Verify connections before use
)
```


## 🔐 Data Migration Plan

### Phase 1: Schema Migration (SQLite → PostgreSQL)

```python
# migration/migrate.py
import sqlite3
import psycopg2
from datetime import datetime

# Connect to both databases
sqlite_conn = sqlite3.connect('data/einfak.sqlite3')
pg_conn = psycopg2.connect(POSTGRESQL_URL)

def migrate_organizations():
    """Migrate organizations table"""
    sqlite_cursor = sqlite_conn.cursor()
    pg_cursor = pg_conn.cursor()
    
    # Read from SQLite
    sqlite_cursor.execute("SELECT * FROM organizations")
    rows = sqlite_cursor.fetchall()
    
    for row in rows:
        # Transform data
        pg_cursor.execute("""
            INSERT INTO organizations (
                id, slug, name, domain, theme_base, primary_color, accent_color,
                city, tagline, description, phone, email, address, iban,
                status, created_at
            ) VALUES (
                gen_random_uuid(), %s, %s, ARRAY[%s], %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s,
                'active', %s
            )
        """, (
            row['slug'],
            row['name'],
            row['domain'].split(',')[0],  # Take first domain
            row['theme'],
            row['primary_color'],
            row['accent_color'],
            row['city'],
            row['tagline'],
            row['description'],
            row['phone'],
            row['email'],
            row['address'],
            row['iban'],
            row['created_at']
        ))
    
    pg_conn.commit()
    print(f"Migrated {len(rows)} organizations")

# Run migrations
migrate_organizations()
migrate_campaigns()
migrate_donors()
migrate_donations()
# ... etc
```

### Phase 2: Theme Migration

```bash
# Copy theme assets
cp -r /Users/ahmetfatihuslu/Desktop/Projelerim/e-infak/public/images/hicret/* \
   ./apps/web/public/images/hicret/

cp -r /Users/ahmetfatihuslu/Desktop/Projelerim/e-infak/public/images/kardeslik/* \
   ./apps/web/public/images/kardeslik/
```

### Phase 3: Data Validation

```python
# migration/validate.py
def validate_migration():
    """Compare record counts between old and new databases"""
    checks = [
        ("organizations", "SELECT COUNT(*) FROM organizations"),
        ("campaigns", "SELECT COUNT(*) FROM campaigns"),
        ("donations", "SELECT COUNT(*) FROM donations WHERE payment_status='confirmed'"),
        ("donors", "SELECT COUNT(*) FROM donors"),
    ]
    
    for table, query in checks:
        sqlite_count = sqlite_conn.execute(query).fetchone()[0]
        pg_count = pg_conn.execute(query).fetchone()[0]
        
        if sqlite_count != pg_count:
            print(f"❌ {table}: SQLite={sqlite_count}, PostgreSQL={pg_count}")
        else:
            print(f"✅ {table}: {sqlite_count} records migrated")
```

## 📋 Implementation Checklist

### MVP Phase (Week 1-8)

**Week 1-2: Setup & Infrastructure** ✅
- [ ] Initialize monorepo (Turborepo)
- [ ] Setup PostgreSQL database
- [ ] Create FastAPI boilerplate
- [ ] Create Next.js app structure
- [ ] Docker Compose for development
- [ ] CI/CD pipeline (GitHub Actions)

**Week 3-4: Core Backend** ✅
- [ ] Multi-tenant middleware
- [ ] Authentication (JWT)
- [ ] Organization CRUD
- [ ] Campaign CRUD API
- [ ] Donation API (without payment)
- [ ] Database migrations (Alembic)

**Week 5-6: Frontend** ✅
- [ ] Theme system implementation
- [ ] Homepage with campaign list
- [ ] Campaign detail page
- [ ] Donation form UI
- [ ] Admin panel (basic)
- [ ] API integration (React Query)

**Week 7: Payment Integration** ✅
- [ ] VPOS client (Vakıf Katılım)
- [ ] 3D Secure flow
- [ ] Payment callback handling
- [ ] Receipt generation (PDF)
- [ ] Email integration (SendGrid)

**Week 8: Testing & Launch** ✅
- [ ] Unit tests (80% coverage)
- [ ] E2E tests (Playwright)
- [ ] Security audit
- [ ] Performance testing (K6)
- [ ] Production deployment
- [ ] Domain setup (hicretdernegi.org, kardeslikpayi.org)
- [ ] Monitoring (Sentry, Grafana)
- [ ] 🚀 **MVP LAUNCH**

---

## ✅ Design Document Complete

**Status**: ✅ Design Tamamlandı - Tasks Oluşturulabilir

**Next Steps**:
1. Review design document with stakeholders
2. Create implementation tasks (tasks.md)
3. Start MVP development (Sprint 0: Setup)

**Document Version**: 1.0  
**Last Updated**: 2026-07-11  
**Prepared By**: Kiro AI Agent  
**Approved By**: TBD

