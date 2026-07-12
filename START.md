# 🚀 E-İnfak 2.0 - Hızlı Başlangıç

## 1️⃣ İlk Kurulum (Sadece İlk Kez)

```bash
# 1. Dependencies'leri yükle
pnpm install

# 2. Backend dependencies
cd services/backend
pip install -r requirements.txt
cd ../..

# 3. Environment dosyasını oluştur
cp .env.example .env

# 4. Docker ile veritabanlarını başlat
docker-compose up -d postgres redis

# 5. Veritabanını hazırla
cd services/backend
alembic upgrade head
cd ../..

# 6. Demo verileri yükle
python scripts/seed_data.py
```

## 2️⃣ Her Çalıştırmada

### Option A: Docker ile (Önerilen)
```bash
# Tüm servisleri başlat
docker-compose up -d

# Logları izle
docker-compose logs -f
```

### Option B: Manuel

```bash
# Terminal 1: Backend
cd services/backend
uvicorn app.main:app --reload

# Terminal 2: Frontend
pnpm --filter web dev
```

## 3️⃣ Uygulamayı Aç

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

## 4️⃣ Test Kullanıcıları

### Hicret Derneği
- **Email:** admin@hicretdernegi.org
- **Şifre:** admin123
- **URL:** http://localhost:3000 (default)

### Kardeşlik Payı
- **Email:** admin@kardeslikpayi.org
- **Şifre:** admin123
- **URL:** http://localhost:3000

## 5️⃣ Test Senaryosu

1. Ana sayfayı ziyaret et
2. "Kampanyalar" sayfasına git
3. Bir kampanya seç
4. "Bağış Yap" butonuna tıkla
5. Formu doldur:
   - Tutar: 100 TL
   - İsim: Test User
   - Email: test@test.com
   - Telefon: 05551234567
   - Kart No: 4242 4242 4242 4242
   - Son Kullanma: 12/25
   - CVV: 123
6. "Bağışı Tamamla" butonuna tıkla
7. 3D Secure sayfasına yönlendirileceksin
8. Başarılı sayfayı göreceksin

## 6️⃣ Admin Panel

1. http://localhost:3000/giris adresine git
2. Admin kullanıcısı ile giriş yap
3. Dashboard'u görüntüle

## 🛠 Makefile Komutları

```bash
make help          # Tüm komutları göster
make install       # Dependencies yükle
make dev           # Dev mode başlat
make docker-up     # Docker servisleri başlat
make docker-down   # Docker servisleri durdur
make migrate       # Migration çalıştır
make seed          # Demo veri yükle
make db-reset      # Veritabanını sıfırla
make test          # Testleri çalıştır
make lint          # Lint kontrolü
make clean         # Temizlik
```

## ❓ Sorun Giderme

### Port Zaten Kullanılıyor
```bash
# PostgreSQL (5432)
sudo lsof -i :5432
kill -9 [PID]

# Redis (6379)
sudo lsof -i :6379
kill -9 [PID]

# Backend (8000)
sudo lsof -i :8000
kill -9 [PID]

# Frontend (3000)
sudo lsof -i :3000
kill -9 [PID]
```

### Database Connection Error
```bash
# PostgreSQL'in çalıştığından emin ol
docker-compose ps

# Tekrar başlat
docker-compose restart postgres

# Migration'ları tekrar çalıştır
cd services/backend
alembic upgrade head
```

### Frontend Build Error
```bash
# node_modules'ü temizle
rm -rf node_modules apps/web/node_modules packages/*/node_modules

# Yeniden yükle
pnpm install
```

### Backend Import Error
```bash
# Virtual environment aktif mi kontrol et
which python

# Requirements'ları yeniden yükle
pip install -r requirements.txt
```

## 📚 Daha Fazla Bilgi

- **Detaylı Geliştirme:** [DEVELOPMENT.md](./DEVELOPMENT.md)
- **Implementation Özeti:** [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Tasks:** [.kiro/specs/tasks.md](./.kiro/specs/tasks.md)

## 🎉 Başarılar!

Proje başarıyla çalışıyor olmalı. İyi geliştirmeler! 🚀
