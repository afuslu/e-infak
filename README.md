# e-İnfak — Çoklu Kurum (Multi-Tenant) STK & Bağış Yönetim Platformu

e-İnfak, dernek ve vakıflar için geliştirilmiş çoklu kiracılı (SaaS) bağış, CRM, saha operasyonu, ön muhasebe, site yapıcı ve mobil yönetim platformudur.

## Mimari & Dizin Yapısı

- **`services/backend`** — FastAPI + SQLAlchemy (async) + PostgreSQL + Redis + Celery + Alembic
- **`apps/web`** — Next.js 15 + React 19 + Tailwind CSS 4 (kurum web siteleri, site yapıcı, STK yönetim paneli, SaaS platform konsolu)
- **`apps/mobile`** — Expo / React Native (iOS & Android yönetici/saha uygulaması, ana ekran widget'ları, QR kumbara, çevrimdışı makbuz kuyruğu, push bildirimleri)
- **`packages/ui`**, **`packages/theme`**, **`packages/api-client`** — Ortak UI, tema ve API istemci paketleri
- **`deploy/docker/`** — Üretim Docker Compose, Nginx/SSL ve dağıtım betikleri

## Hızlı Başlangıç (Geliştirme)

1. Ortam değişkenlerini kopyalayın:
   ```bash
   cp .env.example .env
   ```
2. Veritabanı ve Redis'i başlatın:
   ```bash
   docker compose up -d postgres redis
   ```
3. Backend migration ve geliştirme sunucusunu çalıştırın:
   ```bash
   cd services/backend
   alembic upgrade head
   uvicorn app.main:app --reload --port 8020
   ```
4. Web uygulamasını başlatın:
   ```bash
   pnpm install
   pnpm --filter @e-infak/web dev
   ```
5. Mobil uygulamayı başlatın:
   ```bash
   cd apps/mobile && npm install && npx expo start
   ```

## Kalite Kontrolleri & Testler

```bash
# Web type-check, lint ve test
pnpm --filter @e-infak/web type-check
pnpm --filter @e-infak/web lint
pnpm --filter @e-infak/web test

# Mobil type-check
cd apps/mobile && npm run type-check

# Backend derleme ve pytest
cd services/backend && python -m compileall -q app tests && pytest -q
```

## Üretim Dağıtımı ve Yedekleme

- Üretim kurulumu için [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) ve [docs/SUNUCU_KURULUM.md](docs/SUNUCU_KURULUM.md) belgelerine bakın.
- Otomatik PostgreSQL yedekleme ve geri yükleme doğrulaması için `scripts/backup_verify.sh` betiğini cron ile çalıştırabilirsiniz.
