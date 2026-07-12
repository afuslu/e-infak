# ⚡ E-İnfak 2.0 - 5 Dakikada Başla

## 🎯 Hedef
5 dakikada projeyi ayağa kaldır ve test et!

---

## 📋 Ön Gereksinimler

✅ Docker Desktop yüklü mü? → [İndir](https://www.docker.com/products/docker-desktop)  
✅ Node.js 20+ yüklü mü? → [İndir](https://nodejs.org/)  
✅ pnpm yüklü mü? → `npm install -g pnpm`

---

## 🚀 3 Adımda Başlat

### Adım 1: Klonla ve Kur
```bash
cd e-infak
pnpm install
```

### Adım 2: Docker ile Başlat
```bash
# Tüm servisleri başlat
docker-compose up -d

# 10 saniye bekle (veritabanı hazır olsun)
sleep 10

# Veritabanını hazırla
cd services/backend
alembic upgrade head

# Demo verileri yükle
python ../../scripts/seed_data.py
```

### Adım 3: Aç ve Test Et
```bash
# Frontend başlat
pnpm --filter web dev
```

**🎉 Hazır!**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379

---

## 🧪 Test Et

### 1. Ana Sayfayı Aç
```
http://localhost:3000
```
→ Hero section, stats ve kampanyaları göreceksin

### 2. Kampanya İncele
```
Kampanyalar → Bir kampanya seç → "Bağış Yap"
```

### 3. Test Bağış Yap
```
Form doldur:
- Tutar: 100 TL
- İsim: Test User
- Email: test@test.com
- Tel: 05551234567
- Kart: 4242 4242 4242 4242
- Tarih: 12/25
- CVV: 123
- KVKK: ✅

→ "Bağışı Tamamla" tıkla
```

### 4. Admin Panel
```
http://localhost:3000/giris

Hicret:
- Email: admin@hicretdernegi.org
- Şifre: admin123

Kardeşlik:
- Email: admin@kardeslikpayi.org
- Şifre: admin123
```

---

## 🎨 Tema Test

### Hicret Derneği (Yeşil)
```
http://localhost:3000
```
Default olarak Hicret teması yüklenir (yeşil renkler)

### Kardeşlik Payı (Kırmızı)
Middleware otomatik domain'e göre tema yükler.
Şimdilik localhost default Hicret kullanıyor.

Production'da:
- hicretdernegi.org → Yeşil tema
- kardeslikpayi.org → Kırmızı tema

---

## 📊 API Test

### Swagger UI
```
http://localhost:8000/docs
```

### Test Endpoints
```bash
# Kampanyaları listele
curl http://localhost:8000/api/v1/campaigns

# Health check
curl http://localhost:8000/health
```

---

## 🛑 Durdur

```bash
# Servisleri durdur
docker-compose down

# Veritabanını da sil (dikkat!)
docker-compose down -v
```

---

## ❓ Sorun mu var?

### Port kullanımda hatası
```bash
# Port'ları kontrol et
lsof -i :3000  # Frontend
lsof -i :8000  # Backend
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# İşlemi durdur
kill -9 [PID]
```

### Docker başlamıyor
```bash
# Docker'ı yeniden başlat
docker-compose down
docker-compose up -d

# Logları kontrol et
docker-compose logs -f
```

### Frontend çalışmıyor
```bash
# node_modules temizle
rm -rf node_modules
pnpm install

# Build temizle
pnpm clean
pnpm --filter web dev
```

---

## 📚 Daha Fazla

- **Detaylı Kurulum:** [START.md](./START.md)
- **Geliştirme:** [DEVELOPMENT.md](./DEVELOPMENT.md)
- **Tamamlananlar:** [DONE.md](./DONE.md)

---

## ✅ Checklist

- [ ] Docker Desktop çalışıyor
- [ ] pnpm yüklü
- [ ] `pnpm install` başarılı
- [ ] `docker-compose up -d` başarılı
- [ ] Migration çalıştı
- [ ] Seed data yüklendi
- [ ] Frontend açıldı (http://localhost:3000)
- [ ] API docs açıldı (http://localhost:8000/docs)
- [ ] Test bağış yapıldı
- [ ] Admin panel çalışıyor

---

## 🎉 Başarılar!

5 dakikada projeyi ayağa kaldırdın! 🚀

**Sonraki adım:** [DEVELOPMENT.md](./DEVELOPMENT.md) oku ve geliştirmeye başla!
