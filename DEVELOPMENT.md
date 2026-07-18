# E-İnfak 2.0 - Development Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL 16+
- Redis 7+
- pnpm 8+
- Docker & Docker Compose (optional)

### Installation

#### Option 1: Docker Compose (Recommended)
```bash
# Clone and navigate
cd e-infak

# Start all services
docker-compose up -d

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

#### Option 2: Local Development

**Backend Setup:**
```bash
cd services/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

**Frontend Setup:**
```bash
# Install dependencies
pnpm install

# Start Next.js dev server
pnpm --filter web dev
```

### Database Setup

```bash
# Create PostgreSQL database
createdb einfak

# Run migrations
cd services/backend
alembic upgrade head

# Seed demo data (optional)
python scripts/seed_data.py
```

## 📁 Project Structure

```
e-infak/
├── apps/
│   └── web/                 # Next.js 15 Frontend
│       ├── app/            # App Router pages
│       ├── components/     # React components
│       ├── lib/           # Utilities
│       └── middleware.ts  # Multi-tenant middleware
├── services/
│   └── backend/           # FastAPI Backend
│       ├── app/
│       │   ├── api/      # API endpoints
│       │   ├── core/     # Config, DB, Security
│       │   ├── models/   # SQLAlchemy models
│       │   ├── schemas/  # Pydantic schemas
│       │   └── middleware/ # Multi-tenant middleware
│       └── alembic/      # Database migrations
├── packages/
│   ├── ui/               # Shared UI components
│   ├── theme/            # Theme system (Hicret, Kardeşlik)
│   └── api-client/       # API client library
└── public/
    └── images/           # Static assets
```

## 🎨 Multi-Tenant System

### How It Works

1. **Domain-based routing:**
   - `hicretdernegi.org` → Hicret Derneği (Green theme)
   - `kardeslikpayi.org` → Kardeşlik Payı (Red theme)
   - `*.e-infak.org` → Subdomain routing

2. **Backend Middleware:**
   - Extracts organization from hostname
   - Sets organization context for RLS
   - All queries automatically filtered by organization

3. **Frontend Middleware:**
   - Loads theme based on domain
   - Injects CSS variables
   - Sets organization cookie

### Adding New Organization

```python
# In database
organization = Organization(
    slug="new-org",
    name="New Organization",
    primary_domain="neworg.org",
    theme_primary_color="#065f46",
    theme_accent_color="#0284c7",
)
```

```typescript
// In packages/theme/src/
export const newOrgTheme: ThemeConfig = {
  slug: 'new-org',
  name: 'New Organization',
  primaryColor: { /* ... */ },
  accentColor: { /* ... */ },
}
```

## 🛠 Development Commands

```bash
# Install all dependencies
pnpm install

# Run frontend
pnpm --filter web dev

# Run backend
cd services/backend && uvicorn app.main:app --reload

# Lint
pnpm lint

# Type check
pnpm --filter web type-check

# Build
pnpm build

# Clean
pnpm clean
```

## 🗄 Database Migrations

```bash
cd services/backend

# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## 📝 API Documentation

Once backend is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 🧪 Testing

```bash
# Backend tests
cd services/backend
pytest

# Frontend tests
pnpm --filter web test
```

## 🔐 Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/einfak
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=your-secret-key
ZIRAATPAY_TENANT_CREDENTIALS={"hicret-dernegi":{"merchant":"...","merchant_user":"...","merchant_password":"...","secret_key":"..."},"kardeslik-payi":{"merchant":"...","merchant_user":"...","merchant_password":"...","secret_key":"..."}}
PAYMENTS_LIVE_ENABLED=false
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 📚 Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **State:** React Query + Zustand
- **Forms:** React Hook Form + Zod

### Backend
- **Framework:** FastAPI
- **Database:** PostgreSQL 16
- **ORM:** SQLAlchemy 2.0 (Async)
- **Migrations:** Alembic
- **Cache:** Redis
- **Tasks:** Celery

### Infrastructure
- **Monorepo:** Turborepo
- **Package Manager:** pnpm
- **Containers:** Docker & Docker Compose
- **CI/CD:** GitHub Actions

## 🎯 Next Steps

1. ✅ Monorepo setup complete
2. ✅ Database models created
3. ✅ Basic API endpoints (campaigns)
4. ✅ Multi-tenant middleware (frontend + backend)
5. ✅ Theme system (Hicret + Kardeşlik)
6. ⏳ Authentication system
7. ⏳ Donation flow + VPOS integration
8. ⏳ Admin panel
9. ⏳ Email/SMS notifications
10. ⏳ Payment integration

## 📞 Support

For questions or issues, contact the development team.

---

**Status:** 🟢 Development in progress
**Version:** 2.0.0-alpha
**Last Updated:** 2026-07-12
