---
feature: e-infak-v2-multi-tenant-platform
created: 2026-07-11
status: not_started
---

# E-İnfak 2.0 - Implementation Tasks

## Overview

8 haftalık MVP geliştirme süreci için detaylı task listesi. Her task, bağımlılıkları, kabul kriterleri ve tahmini süre ile tanımlanmıştır.

**Toplam Tahmini Süre**: 320 saat (8 hafta × 40 saat)
**Ekip**: 2 Full-Stack Developer + 1 UI/UX Designer + 1 Product Manager

---

## Week 1-2: Setup & Infrastructure (80 saat)

### Task 1.1: Monorepo Kurulumu
**Bağımlılıklar**: Yok
**Tahmini Süre**: 4 saat
**Atanan**: Backend Dev

**Açıklama**:
Turborepo ile monorepo yapısı oluştur. Workspace'leri yapılandır:
- `apps/web` - Next.js frontend
- `services/backend` - FastAPI backend
- `packages/ui` - Shared UI components
- `packages/theme` - Theme system
- `packages/api-client` - API client library

**Kabul Kriterleri**:
- [ ] Turborepo başarıyla kuruldu
- [ ] `turbo run build` tüm workspace'leri build ediyor
- [ ] Package dependency management çalışıyor
- [ ] Root package.json scripts tanımlandı

**Dosyalar**:
- `/package.json`
- `/turbo.json`
- `/pnpm-workspace.yaml`

---

### Task 1.2: PostgreSQL Database Setup
**Bağımlılıklar**: Yok
**Tahmini Süre**: 6 saat
**Atanan**: Backend Dev

**Açıklama**:
PostgreSQL veritabanı kurulumu ve initial schema oluşturma:
- Docker Compose ile PostgreSQL 16
- SQLAlchemy models oluşturma
- Alembic migration setup
- Row-Level Security (RLS) policies

**Kabul Kriterleri**:
- [ ] PostgreSQL container çalışıyor
- [ ] Tüm tablolar oluşturuldu (20+ tablo)
- [ ] Foreign key constraints aktif
- [ ] Indexes tanımlandı
- [ ] RLS policies uygulandı

**Dosyalar**:
- `/services/backend/alembic/versions/001_initial_schema.py`
- `/services/backend/app/models/*.py`

---

### Task 1.3: FastAPI Boilerplate
**Bağımlılıklar**: Task 1.2
**Tahmini Süre**: 8 saat
**Atanan**: Backend Dev

**Açıklama**:
FastAPI uygulama yapısı ve temel konfigürasyon:
- Project structure oluştur
- Config management (environment variables)
- Database connection pooling
- CORS middleware
- Health check endpoint
- API versioning (/api/v1)

**Kabul Kriterleri**:
- [ ] FastAPI app başarıyla çalışıyor
- [ ] `/health` endpoint response veriyor
- [ ] Database connection test ediliyor
- [ ] Environment variables yükleniyor
- [ ] OpenAPI docs `/docs` erişilebilir

**Dosyalar**:
- `/services/backend/app/main.py`
- `/services/backend/app/core/config.py`
- `/services/backend/app/core/db.py`
- `/services/backend/requirements.txt`

---

### Task 1.4: Next.js App Structure
**Bağımlılıklar**: Task 1.1
**Tahmini Süre**: 6 saat
**Atanan**: Frontend Dev

**Açıklama**:
Next.js 15 App Router ile frontend yapısı:
- App Router structure (app directory)
- Tailwind CSS configuration
- TypeScript strict mode
- ESLint + Prettier setup
- Route groups: (public), (auth), (dashboard)

**Kabul Kriterleri**:
- [ ] Next.js dev server çalışıyor
- [ ] Tailwind CSS aktif
- [ ] TypeScript compile error yok
- [ ] Lint checks pass ediyor
- [ ] Folder structure doğru

**Dosyalar**:
- `/apps/web/app/layout.tsx`
- `/apps/web/tailwind.config.ts`
- `/apps/web/tsconfig.json`

---

### Task 1.5: Docker Compose Setup
**Bağımlılıklar**: Task 1.2, Task 1.3, Task 1.4
**Tahmini Süre**: 4 saat
**Atanan**: Backend Dev

**Açıklama**:
Development environment için Docker Compose:
- PostgreSQL service
- Redis service
- Backend service (FastAPI)
- Frontend service (Next.js)
- Celery worker
- Celery beat

**Kabul Kriterleri**:
- [ ] `docker-compose up` tüm servisleri başlatıyor
- [ ] Health checks çalışıyor
- [ ] Volume mounting doğru
- [ ] Hot reload aktif (backend ve frontend)
- [ ] Service'ler birbirine erişebiliyor

**Dosyalar**:
- `/docker-compose.yml`
- `/services/backend/Dockerfile`
- `/apps/web/Dockerfile.dev`

---

### Task 1.6: CI/CD Pipeline
**Bağımlılıklar**: Task 1.1, Task 1.3, Task 1.4
**Tahmini Süre**: 8 saat
**Atanan**: Backend Dev

**Açıklama**:
GitHub Actions workflow:
- Lint checks (backend + frontend)
- Type checking
- Unit tests
- Build validation
- Docker image build and push

**Kabul Kriterleri**:
- [ ] PR açıldığında otomatik test çalışıyor
- [ ] Lint errors varsa fail oluyor
- [ ] Build başarısız olursa merge bloklanıyor
- [ ] Main branch'e merge edilince image build oluyor

**Dosyalar**:
- `/.github/workflows/main.yml`
- `/.github/workflows/pr.yml`

---


## Week 3-4: Core Backend (80 saat)

### Task 2.1: Multi-Tenant Middleware
**Bağımlılıklar**: Task 1.3
**Tahmini Süre**: 6 saat
**Atanan**: Backend Dev

**Açıklama**:
Domain-based multi-tenant middleware implementasyonu:
- Hostname'den organization slug çıkarma
- Custom domain support (hicretdernegi.org, kardeslikpayi.org)
- Subdomain support (*.e-infak.org)
- PostgreSQL session variable set etme (RLS için)
- Request state'e organization context ekleme

**Kabul Kriterleri**:
- [ ] hicretdernegi.org → 'hicret-dernegi' organization
- [ ] kardeslikpayi.org → 'kardeslik-payi' organization
- [ ] test.e-infak.org → 'test' organization
- [ ] Invalid domain → 404 error
- [ ] RLS context doğru set ediliyor

**Dosyalar**:
- `/services/backend/app/middleware/tenant.py`

---

### Task 2.2: Authentication System
**Bağımlılıklar**: Task 1.3
**Tahmini Süre**: 12 saat
**Atanan**: Backend Dev

**Açıklama**:
JWT-based authentication:
- User registration endpoint
- Login endpoint (access + refresh token)
- Refresh token endpoint
- Logout endpoint (revoke tokens)
- Password hashing (bcrypt)
- JWT token generation ve validation
- Session management (sessions table)

**Kabul Kriterleri**:
- [ ] Kullanıcı kaydı yapılabiliyor
- [ ] Login başarılı → access + refresh token dönüyor
- [ ] Access token 15 dakika geçerli
- [ ] Refresh token 7 gün geçerli
- [ ] Invalid token → 401 error
- [ ] Logout token'ı revoke ediyor

**Dosyalar**:
- `/services/backend/app/api/v1/auth.py`
- `/services/backend/app/core/security.py`
- `/services/backend/app/schemas/auth.py`

---

### Task 2.3: Authorization & RBAC
**Bağımlılıklar**: Task 2.2
**Tahmini Süre**: 6 saat
**Atanan**: Backend Dev

**Açıklama**:
Role-based access control:
- Role definitions (platform_admin, stk_admin, muhasebe, crm, operasyon, readonly)
- Permission decorators
- current_user dependency
- Organization membership check

**Kabul Kriterleri**:
- [ ] Roller doğru tanımlandı
- [ ] `@require_role('stk_admin')` decorator çalışıyor
- [ ] Cross-organization access bloklanıyor
- [ ] Platform admin tüm STK'lara erişebiliyor

**Dosyalar**:
- `/services/backend/app/api/deps.py`
- `/services/backend/app/core/security.py`

---

### Task 2.4: Organization CRUD API
**Bağımlılıklar**: Task 2.1, Task 2.3
**Tahmini Süre**: 8 saat
**Atanan**: Backend Dev

**Açıklama**:
Organization management endpoints:
- GET /organizations - List (platform admin only)
- POST /organizations - Create
- GET /organizations/{id} - Get details
- PATCH /organizations/{id} - Update
- DELETE /organizations/{id} - Delete
- GET /organization - Get current org (from domain)

**Kabul Kriterleri**:
- [ ] CRUD operations çalışıyor
- [ ] Only platform admin can create/delete
- [ ] STK admin can update own org
- [ ] Domain validation (unique check)
- [ ] Theme colors validation (hex format)

**Dosyalar**:
- `/services/backend/app/api/v1/organizations.py`
- `/services/backend/app/schemas/organization.py`
- `/services/backend/app/services/organization_service.py`

---

### Task 2.5: Campaign CRUD API
**Bağımlılıklar**: Task 2.4
**Tahmini Süre**: 10 saat
**Atanan**: Backend Dev

**Açıklama**:
Campaign management endpoints:
- GET /campaigns - List (with filters: active, featured, category)
- GET /campaigns/{slug} - Get by slug
- POST /campaigns - Create (admin only)
- PATCH /campaigns/{id} - Update
- DELETE /campaigns/{id} - Delete
- GET /campaigns/{id}/stats - Statistics

**Kabul Kriterleri**:
- [ ] Public endpoints auth gerektirmiyor
- [ ] Admin endpoints require authentication
- [ ] Slug auto-generate from title
- [ ] Image upload support
- [ ] Multi-tenant isolation çalışıyor
- [ ] Pagination implemented (25/page)

**Dosyalar**:
- `/services/backend/app/api/v1/campaigns.py`
- `/services/backend/app/schemas/campaign.py`
- `/services/backend/app/services/campaign_service.py`

---

### Task 2.6: Donation API (Without Payment)
**Bağımlılıklar**: Task 2.5
**Tahmini Süre**: 12 saat
**Atanan**: Backend Dev

**Açıklama**:
Donation endpoints (ödeme entegrasyonu sonraki task):
- POST /donations - Create donation
- GET /donations - List (with filters)
- GET /donations/{id} - Get details
- Donor creation/lookup logic
- Receipt number generation
- Campaign collected_cents update

**Kabul Kriterleri**:
- [ ] Donation record oluşturuluyor
- [ ] Donor bilgisi kaydediliyor (get or create)
- [ ] Receipt number unique ve sequential
- [ ] Campaign collected amount güncellenmiyor (payment sonrası)
- [ ] Idempotency key kontrolü

**Dosyalar**:
- `/services/backend/app/api/v1/donations.py`
- `/services/backend/app/schemas/donation.py`
- `/services/backend/app/services/donation_service.py`

---

### Task 2.7: Donor CRM API
**Bağımlılıklar**: Task 2.6
**Tahmini Süre**: 8 saat
**Atanan**: Backend Dev

**Açıklama**:
Donor management endpoints:
- GET /donors - List (with filters, search)
- GET /donors/{id} - Get profile
- PATCH /donors/{id} - Update
- DELETE /donors/{id} - Delete (GDPR)
- GET /donors/{id}/donations - Donation history
- GET /donors/{id}/stats - Lifetime value, avg donation

**Kabul Kriterleri**:
- [ ] Search by name, email, phone çalışıyor
- [ ] Filters: city, donor_type, tags
- [ ] Pagination implemented
- [ ] Stats doğru hesaplanıyor
- [ ] GDPR delete tüm ilişkili verileri anonymize ediyor

**Dosyalar**:
- `/services/backend/app/api/v1/donors.py`
- `/services/backend/app/schemas/donor.py`
- `/services/backend/app/services/donor_service.py`

---

### Task 2.8: Database Migrations
**Bağımlılıklar**: Task 1.2
**Tahmini Süre**: 4 saat
**Atanan**: Backend Dev

**Açıklama**:
Alembic migration files oluştur:
- Initial schema migration
- Seed data migration (demo organizations)
- Index creation migrations

**Kabul Kriterleri**:
- [ ] `alembic upgrade head` çalışıyor
- [ ] `alembic downgrade` rollback yapıyor
- [ ] Seed data yüklenebiliyor
- [ ] Foreign keys ve constraints doğru

**Dosyalar**:
- `/services/backend/alembic/versions/*.py`

---

### Task 2.9: API Tests (Backend)
**Bağımlılıklar**: Task 2.4, Task 2.5, Task 2.6, Task 2.7
**Tahmini Süre**: 14 saat
**Atanan**: Backend Dev

**Açıklama**:
Pytest ile API endpoint testleri:
- Auth tests
- Organization CRUD tests
- Campaign CRUD tests
- Donation tests
- Donor tests
- Multi-tenant isolation tests

**Kabul Kriterleri**:
- [ ] Test coverage > 80%
- [ ] Tüm endpoint'ler test edildi
- [ ] Happy path + error cases
- [ ] Multi-tenant isolation verify edildi
- [ ] CI'da otomatik çalışıyor

**Dosyalar**:
- `/services/backend/tests/test_auth.py`
- `/services/backend/tests/test_campaigns.py`
- `/services/backend/tests/test_donations.py`

---


## Week 5-6: Frontend (80 saat)

### Task 3.1: Theme System Implementation
**Bağımlılıklar**: Task 1.4
**Tahmini Süre**: 10 saat
**Atanan**: Frontend Dev

**Açıklama**:
Multi-tenant theme system:
- Theme package oluştur (`packages/theme`)
- Hicret theme definition (green + blue)
- Kardeslik theme definition (red + orange)
- Tailwind config integration
- CSS variables for dynamic theming
- Font loading (Poppins, Outfit)

**Kabul Kriterleri**:
- [ ] Theme değiştirme çalışıyor
- [ ] Renk paleti Tailwind'de kullanılabiliyor
- [ ] Fontlar yükleniyor
- [ ] Logo URL'leri theme'den geliyor
- [ ] 2 base theme test edildi

**Dosyalar**:
- `/packages/theme/src/hicret.ts`
- `/packages/theme/src/kardeslik.ts`
- `/packages/theme/src/types.ts`
- `/apps/web/tailwind.config.ts`

---

### Task 3.2: Multi-Tenant Middleware (Next.js)
**Bağımlılıklar**: Task 3.1
**Tahmini Süre**: 6 saat
**Atanan**: Frontend Dev

**Açıklama**:
Next.js middleware for domain routing:
- Hostname parse edip organization slug çıkarma
- Theme loader (domain → organization → theme)
- Headers'a organization context ekleme
- Cookie set etme (org-slug)

**Kabul Kriterleri**:
- [ ] hicretdernegi.org → Hicret teması
- [ ] kardeslikpayi.org → Kardeslik teması
- [ ] Subdomain routing çalışıyor
- [ ] Invalid domain → 404 page
- [ ] Theme dinamik yükleniyor

**Dosyalar**:
- `/apps/web/middleware.ts`
- `/apps/web/lib/theme.ts`

---

### Task 3.3: API Client Setup (React Query)
**Bağımlılıklar**: Task 1.4, Task 2.5
**Tahmini Süre**: 8 saat
**Atanan**: Frontend Dev

**Açıklama**:
API client library ve React Query setup:
- Axios client configuration
- Request/response interceptors
- Auth token management
- React Query hooks
- Campaign hooks (useCampaigns, useCampaign)
- Donation hooks (useCreateDonation)

**Kabul Kriterleri**:
- [ ] API calls backend'e ulaşıyor
- [ ] Auth token otomatik ekleniyor
- [ ] Token refresh çalışıyor
- [ ] Error handling implemented
- [ ] Loading states manage ediliyor

**Dosyalar**:
- `/packages/api-client/src/client.ts`
- `/packages/api-client/src/campaigns.ts`
- `/packages/api-client/src/donations.ts`
- `/apps/web/app/providers.tsx`

---

### Task 3.4: Shared UI Components
**Bağımlılıklar**: Task 3.1
**Tahmini Süre**: 12 saat
**Atanan**: Frontend Dev + UI/UX Designer

**Açıklama**:
Reusable UI component library:
- Button (variants: primary, secondary, outline)
- Input, Textarea, Select
- Card component
- Modal/Dialog
- Alert/Toast notifications
- Progress bar
- Badge
- Skeleton loaders

**Kabul Kriterleri**:
- [ ] Tüm componentler TypeScript typed
- [ ] Accessible (WCAG 2.1 AA)
- [ ] Theme-aware (primary/accent colors)
- [ ] Responsive design
- [ ] Storybook documentation (opsiyonel)

**Dosyalar**:
- `/packages/ui/src/button.tsx`
- `/packages/ui/src/form.tsx`
- `/packages/ui/src/card.tsx`
- `/packages/ui/src/modal.tsx`

---

### Task 3.5: Homepage & Campaign List
**Bağımlılıklar**: Task 3.2, Task 3.3, Task 3.4
**Tahmini Süre**: 10 saat
**Atanan**: Frontend Dev

**Açıklama**:
Public homepage ve kampanya listesi:
- Hero section (organization specific)
- Featured campaigns grid
- All campaigns list
- Category filter
- Search functionality
- Responsive design (mobile-first)

**Kabul Kriterleri**:
- [ ] Kampanyalar API'den yükleniyor
- [ ] Featured campaigns öne çıkıyor
- [ ] Kategori filtreleme çalışıyor
- [ ] Search real-time çalışıyor
- [ ] Mobile responsive
- [ ] Loading states gösteriliyor

**Dosyalar**:
- `/apps/web/app/(public)/page.tsx`
- `/apps/web/app/(public)/kampanyalar/page.tsx`
- `/apps/web/components/campaign/CampaignCard.tsx`
- `/apps/web/components/campaign/CampaignList.tsx`

---

### Task 3.6: Campaign Detail Page
**Bağımlılıklar**: Task 3.5
**Tahmini Süre**: 8 saat
**Atanan**: Frontend Dev

**Açıklama**:
Kampanya detay sayfası:
- Campaign title, summary, story
- Cover image ve gallery
- Progress bar (collected/target)
- Suggested donation amounts
- "Bağış Yap" CTA button
- Social share buttons
- Related campaigns

**Kabul Kriterleri**:
- [ ] Dynamic routing (/kampanyalar/[slug])
- [ ] Campaign data API'den geliyor
- [ ] Progress bar animasyonlu
- [ ] Image gallery çalışıyor
- [ ] Social share links doğru
- [ ] SEO meta tags set ediliyor

**Dosyalar**:
- `/apps/web/app/(public)/kampanyalar/[slug]/page.tsx`
- `/apps/web/components/campaign/CampaignDetail.tsx`
- `/apps/web/components/campaign/ProgressBar.tsx`

---

### Task 3.7: Donation Form
**Bağımlılıklar**: Task 3.6, Task 3.4
**Tahmini Süre**: 12 saat
**Atanan**: Frontend Dev

**Açıklama**:
Bağış formu (ödeme entegrasyonu hariç):
- Amount selection (preset + custom)
- Donor information form (ad, email, telefon)
- Kart bilgileri form (card number, expiry, CVV)
- KVKK checkbox
- Form validation (Zod schema)
- Error messages
- Loading states

**Kabul Kriterleri**:
- [ ] Form validation çalışıyor
- [ ] Kart numarası auto-format (4-4-4-4)
- [ ] Telefon auto-format (05XX XXX XX XX)
- [ ] Error messages Türkçe ve anlaşılır
- [ ] KVKK onayı zorunlu
- [ ] Accessibility (keyboard navigation)

**Dosyalar**:
- `/apps/web/app/(public)/bagis/[campaign]/page.tsx`
- `/apps/web/components/donation/DonationForm.tsx`
- `/apps/web/lib/validation.ts`

---

### Task 3.8: Admin Panel Layout
**Bağımlılıklar**: Task 3.4, Task 2.2
**Tahmini Süre**: 8 saat
**Atanan**: Frontend Dev

**Açıklama**:
Admin panel layout ve navigation:
- Sidebar navigation
- Header with user menu
- Breadcrumbs
- Protected route wrapper
- Login page
- 404 page

**Kabul Kriterleri**:
- [ ] Sidebar responsive (collapse on mobile)
- [ ] Active menu item highlighted
- [ ] User dropdown (profile, logout)
- [ ] Protected routes require auth
- [ ] Redirect to login if not authenticated
- [ ] Role-based menu items

**Dosyalar**:
- `/apps/web/app/(dashboard)/layout.tsx`
- `/apps/web/components/admin/Sidebar.tsx`
- `/apps/web/components/admin/Header.tsx`
- `/apps/web/app/(auth)/giris/page.tsx`

---

### Task 3.9: Dashboard (Admin)
**Bağımlılıklar**: Task 3.8
**Tahmini Süre**: 6 saat
**Atanan**: Frontend Dev

**Açıklama**:
Admin dashboard homepage:
- KPI cards (bugün, bu ay, bu yıl)
- Günlük bağış trendi (line chart)
- Kampanya dağılımı (pie chart)
- Son bağışlar listesi (table)
- Quick actions

**Kabul Kriterleri**:
- [ ] Stats API'den geliyor
- [ ] Chart'lar render ediliyor (Recharts)
- [ ] Real-time data (30 saniye refresh)
- [ ] Responsive layout
- [ ] Loading skeleton

**Dosyalar**:
- `/apps/web/app/(dashboard)/page.tsx`
- `/apps/web/components/admin/Dashboard.tsx`
- `/apps/web/components/admin/StatsCard.tsx`

---


## Week 7: Payment Integration & Email (40 saat)

### Task 4.1: VPOS Client (Vakıf Katılım)
**Bağımlılıklar**: Task 2.6
**Tahmini Süre**: 10 saat
**Atanan**: Backend Dev

**Açıklama**:
Vakıf Katılım 3D Secure entegrasyonu:
- VPOS client class (mevcut vpos_client.py'den adapte et)
- Hash calculation (SHA256 + Base64)
- 3D Secure form data preparation
- Callback signature verification
- Mock VPOS for testing

**Kabul Kriterleri**:
- [ ] Test mode çalışıyor (mock VPOS)
- [ ] 3D Secure redirect formu oluşturuluyor
- [ ] Hash calculation doğru
- [ ] Callback verification çalışıyor
- [ ] Error handling comprehensive

**Dosyalar**:
- `/services/backend/app/utils/vpos.py`
- `/services/backend/app/services/payment_service.py`

---

### Task 4.2: Donation Payment Flow
**Bağımlılıklar**: Task 4.1, Task 2.6
**Tahmini Süre**: 12 saat
**Atanan**: Backend Dev

**Açıklama**:
Bağış ödeme akışı tamamlama:
- POST /donations endpoint'i payment_service ile entegre et
- 3D Secure redirect data dön
- Callback endpoints (success/fail)
- Payment status güncelleme
- Campaign collected_cents güncelleme
- Donor stats güncelleme

**Kabul Kriterleri**:
- [ ] Bağış oluşturulunca 3D Secure redirect dönüyor
- [ ] Callback endpoint hash verify ediyor
- [ ] Successful payment → donation status 'confirmed'
- [ ] Failed payment → donation status 'failed'
- [ ] Campaign amount otomatik güncelleniryor
- [ ] Idempotency korunuyor

**Dosyalar**:
- `/services/backend/app/api/v1/donations.py` (update)
- `/services/backend/app/services/donation_service.py` (update)

---

### Task 4.3: Frontend Payment Integration
**Bağımlılıklar**: Task 4.2, Task 3.7
**Tahmini Süre**: 8 saat
**Atanan**: Frontend Dev

**Açıklama**:
Frontend'de 3D Secure akışı:
- Form submit → API call
- 3D Secure redirect handle et (POST form)
- Success/fail callback pages
- Receipt download link
- Error messaging

**Kabul Kriterleri**:
- [ ] Form submit çalışıyor
- [ ] 3D Secure sayfasına yönlendiriliyor
- [ ] Banka callback'inden dönünce success/fail page
- [ ] Receipt PDF indirilebiliyor
- [ ] Error states user-friendly

**Dosyalar**:
- `/apps/web/components/donation/DonationForm.tsx` (update)
- `/apps/web/app/(public)/bagis/basarili/page.tsx`
- `/apps/web/app/(public)/bagis/hata/page.tsx`

---

### Task 4.4: Receipt PDF Generation
**Bağımlılıklar**: Task 4.2
**Tahmini Süre**: 6 saat
**Atanan**: Backend Dev

**Açıklama**:
Makbuz PDF oluşturma:
- PDF template (ReportLab veya WeasyPrint)
- Organization logo, bilgileri
- Bağış detayları (tutar, tarih, kampanya)
- QR code (makbuz doğrulama linki)
- S3/R2 upload

**Kabul Kriterleri**:
- [ ] PDF doğru format'ta oluşuyor
- [ ] Logo ve bilgiler theme'e göre
- [ ] QR code çalışıyor
- [ ] PDF URL donations tablosuna kaydediliyor
- [ ] GET /donations/{id}/receipt endpoint çalışıyor

**Dosyalar**:
- `/services/backend/app/utils/pdf.py`
- `/services/backend/app/api/v1/donations.py` (receipt endpoint)

---

### Task 4.5: Email Service Integration
**Bağımlılıklar**: Task 4.4
**Tahmini Süre**: 4 saat
**Atanan**: Backend Dev

**Açıklama**:
SendGrid email entegrasyonu:
- Email client setup
- Template engine (Jinja2)
- Donation receipt template
- Test email sending

**Kabul Kriterleri**:
- [ ] SendGrid API çalışıyor
- [ ] HTML email template render ediliyor
- [ ] PDF attachment eklenebiliyor
- [ ] Test email gönderimi başarılı
- [ ] Error handling (retry logic)

**Dosyalar**:
- `/services/backend/app/utils/email.py`
- `/services/backend/app/templates/email/donation_receipt.html`

---


## Week 8: Testing, Deployment & Launch (40 saat)

### Task 5.1: Celery Tasks Setup
**Bağımlılıklar**: Task 4.5
**Tahmini Süre**: 6 saat
**Atanan**: Backend Dev

**Açıklama**:
Asynchronous task processing:
- Celery configuration (Redis broker)
- Email sending task (send_receipt_email)
- Task retry logic
- Celery beat for scheduled tasks

**Kabul Kriterleri**:
- [ ] Celery worker çalışıyor
- [ ] Task queue'ya gönderiliyor
- [ ] Email task async çalışıyor
- [ ] Retry logic test edildi
- [ ] Task monitoring çalışıyor

**Dosyalar**:
- `/services/backend/app/core/celery_app.py`
- `/services/backend/app/tasks/email_tasks.py`

---

### Task 5.2: Integration Tests
**Bağımlılıklar**: Task 4.2, Task 4.3
**Tahmini Süre**: 8 saat
**Atanan**: Backend Dev + Frontend Dev

**Açıklama**:
End-to-end integration tests:
- Complete donation flow test
- Payment callback test
- Email sending test
- Multi-tenant isolation test

**Kabul Kriterleri**:
- [ ] Donation flow baştan sona test edildi
- [ ] Mock VPOS callback test edildi
- [ ] Email task çalıştırıldı
- [ ] Multi-tenant cross-contamination yok
- [ ] Test coverage > 80%

**Dosyalar**:
- `/services/backend/tests/test_integration.py`

---

### Task 5.3: E2E Tests (Playwright)
**Bağımlılıklar**: Task 3.7, Task 4.3
**Tahmini Süre**: 8 saat
**Atanan**: QA / Frontend Dev

**Açıklama**:
Playwright ile end-to-end tests:
- Homepage navigation test
- Campaign browse test
- Donation form test
- Admin login test
- Dashboard load test

**Kabul Kriterleri**:
- [ ] Tüm critical user flows test edildi
- [ ] Mobile viewport test edildi
- [ ] Screenshot comparison (visual regression)
- [ ] Tests CI'da çalışıyor

**Dosyalar**:
- `/apps/web/e2e/donation-flow.spec.ts`
- `/apps/web/e2e/admin-panel.spec.ts`

---

### Task 5.4: Security Audit
**Bağımlılıklar**: Task 4.2
**Tahmini Süre**: 4 saat
**Atanan**: Backend Dev + Security Consultant

**Açıklama**:
Security checklist review:
- SQL injection test
- XSS prevention check
- CSRF token validation
- Rate limiting test
- Password policy enforcement
- Secret management review

**Kabul Kriterleri**:
- [ ] OWASP Top 10 checked
- [ ] No critical vulnerabilities
- [ ] Secrets not hardcoded
- [ ] Rate limiting active
- [ ] Security headers set

**Dosyalar**:
- `/docs/SECURITY_AUDIT.md`

---

### Task 5.5: Performance Testing
**Bağımlılıklar**: Task 4.2
**Tahmini Süre**: 4 saat
**Atanan**: Backend Dev

**Açıklama**:
Load testing with K6:
- Homepage load test (100 concurrent users)
- API endpoint load test
- Database query optimization
- Redis caching validation

**Kabul Kriterleri**:
- [ ] 100 concurrent users destekleniyor
- [ ] API response time < 500ms (p95)
- [ ] No timeout errors
- [ ] Database queries < 100ms
- [ ] Cache hit rate > 80%

**Dosyalar**:
- `/services/backend/tests/k6/load_test.js`

---

### Task 5.6: Production Environment Setup
**Bağımlılıklar**: Task 1.6
**Tahmini Süre**: 6 saat
**Atanan**: DevOps / Backend Dev

**Açıklama**:
Production infrastructure:
- DigitalOcean / Hetzner server provisioning
- PostgreSQL managed database
- Redis managed instance
- Nginx reverse proxy
- SSL certificates (Let's Encrypt)
- Environment variables setup

**Kabul Kriterleri**:
- [ ] Production server çalışıyor
- [ ] Database accessible
- [ ] SSL certificates active
- [ ] Domain routing configured
- [ ] Firewall rules set

**Dosyalar**:
- `/infrastructure/terraform/*.tf` (opsiyonel)
- `/docs/DEPLOYMENT.md`

---

### Task 5.7: Monitoring & Logging Setup
**Bağımlılıklar**: Task 5.6
**Tahmini Süre**: 4 saat
**Atanan**: Backend Dev

**Açıklama**:
Production monitoring:
- Sentry error tracking
- Grafana dashboards
- Prometheus metrics
- Log aggregation (Loki)
- Uptime monitoring

**Kabul Kriterleri**:
- [ ] Sentry catching errors
- [ ] Grafana dashboard created
- [ ] Metrics exposed (/metrics)
- [ ] Logs centralized
- [ ] Uptime alerts configured

**Dosyalar**:
- `/services/backend/app/main.py` (Sentry integration)
- `/infrastructure/grafana/dashboard.json`

---

### Task 5.8: Data Migration (SQLite → PostgreSQL)
**Bağımlılıklar**: Task 5.6
**Tahmini Süre**: 4 saat
**Atanan**: Backend Dev

**Açıklama**:
Mevcut e-infak.sqlite3'den PostgreSQL'e veri taşıma:
- Organizations migration
- Campaigns migration
- Donations migration
- Donors migration
- Data validation

**Kabul Kriterleri**:
- [ ] Tüm organizasyonlar taşındı
- [ ] Kampanyalar doğru ilişkilendirildi
- [ ] Bağış kayıtları ve tutarlar eşleşiyor
- [ ] Foreign key constraints ihlal edilmedi
- [ ] Data integrity check passed

**Dosyalar**:
- `/scripts/migrate_data.py`
- `/docs/MIGRATION.md`

---

### Task 5.9: Domain Configuration
**Bağımlılıklar**: Task 5.6
**Tahmini Süre**: 2 saat
**Atanan**: DevOps

**Açıklama**:
DNS konfigürasyonu:
- hicretdernegi.org → production server
- kardeslikpayi.org → production server
- *.e-infak.org wildcard
- SSL certificate generation

**Kabul Kriterleri**:
- [ ] DNS propagation tamamlandı
- [ ] HTTPS çalışıyor
- [ ] Subdomain routing aktif
- [ ] SSL auto-renewal set

**Dosyalar**:
- `/docs/DNS_SETUP.md`

---

### Task 5.10: Go-Live Checklist
**Bağımlılıklar**: Tüm tasklar
**Tahmini Süre**: 4 saat
**Atanan**: Tüm Ekip

**Açıklama**:
Launch preparation ve final checks:
- Smoke tests (production'da)
- User acceptance testing (UAT)
- Stakeholder demo
- Documentation review
- Rollback plan hazırlama
- Launch announcement

**Kabul Kriterleri**:
- [ ] Production'da test bağışı yapıldı
- [ ] Email ve SMS gönderimi test edildi
- [ ] Admin panel erişilebilir
- [ ] Backup alındı
- [ ] Rollback plan hazır
- [ ] 🚀 LAUNCH!

**Dosyalar**:
- `/docs/GO_LIVE_CHECKLIST.md`
- `/docs/ROLLBACK_PLAN.md`

---

## Post-MVP Tasks (Opsiyonel - Sonraki Sprintler)

### Task 6.1: SMS Integration
**Tahmini Süre**: 4 saat
**Açıklama**: Netgsm SMS gateway entegrasyonu

### Task 6.2: Kurban Module
**Tahmini Süre**: 16 saat
**Açıklama**: Kurban hayvan yönetimi ve hisse atama

### Task 6.3: Orphan Sponsorship
**Tahmini Süre**: 12 saat
**Açıklama**: Yetim sponsorluğu modülü

### Task 6.4: Recurring Donations
**Tahmini Süre**: 10 saat
**Açıklama**: Otomatik düzenli bağış sistemi

### Task 6.5: Admin Campaign Management
**Tahmini Süre**: 8 saat
**Açıklama**: Admin panelde kampanya CRUD UI

### Task 6.6: Admin Donor Management
**Tahmini Süre**: 8 saat
**Açıklama**: CRM panel (bağışçı listesi, filtreleme, export)

### Task 6.7: Bank Reconciliation
**Tahmini Süre**: 10 saat
**Açıklama**: Banka hesap hareketleri eşleştirme

### Task 6.8: Reports & Analytics
**Tahmini Süre**: 12 saat
**Açıklama**: Detaylı raporlar ve Excel export

---

## Task Summary

**Total Tasks**: 40 (MVP)
**Total Estimated Hours**: 320 saat
**Timeline**: 8 hafta
**Resources**: 2 Full-Stack Dev + 1 Designer + 1 PM

**Week Breakdown**:
- Week 1-2: Infrastructure (80h)
- Week 3-4: Backend (80h)
- Week 5-6: Frontend (80h)
- Week 7: Payment (40h)
- Week 8: Testing & Launch (40h)

**Critical Path**:
1. Task 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3
2. Task 2.4 → 2.5 → 2.6 → 4.1 → 4.2
3. Task 3.1 → 3.2 → 3.3 → 3.7 → 4.3
4. Task 5.8 → 5.9 → 5.10

**Risk Mitigation**:
- VPOS entegrasyonu erken başlatılmalı (Week 7)
- E2E tests coverage yüksek tutulmalı
- Security audit external uzmanla yapılmalı
- Data migration rehearsal edilmeli

---

**Status**: ✅ Tasks Tamamlandı - Implementation Başlayabilir
**Next Action**: Sprint 0 kickoff meeting + Task assignment
**Document Version**: 1.0
**Last Updated**: 2026-07-11

