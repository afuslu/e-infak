---
title: E-İnfak 2.0 - Multi-Tenant Bağış Otomasyon Platformu
status: requirements
created: 2026-07-11
version: 1.0
---

# E-İnfak 2.0 - Multi-Tenant Bağış Otomasyon Platformu

## 📋 Genel Bakış

E-İnfak 2.0, Türkiye'deki STK'lar (Sivil Toplum Kuruluşları) için tasarlanmış kurumsal düzeyde, çok kiracılı (multi-tenant) bir bağış otomasyon platformudur. Platform, mevcut üç sistemi (e-infak.org, hicretdernegi.org, kardeslikpayi.org) entegre ederek, 100+ STK'ya hizmet verebilecek ölçeklenebilir bir SaaS altyapısı sunacaktır.

## 🎯 Proje Hedefleri

### 1. Ana Hedefler
- **Multi-Tenant SaaS Platformu**: 100+ STK'nın kendi domain'leri ile bağımsız çalışabilmesi
- **Tam Entegrasyon**: Mevcut 3 sistem (e-infak, hicret, kardeslik) tek platform altında birleştirilmesi
- **Tema Sistemi**: Hicret Derneği ve Kardeşlik Payı tema şablonlarının yeni STK'lar tarafından kullanılabilmesi
- **Otomasyon**: Bağış süreçlerinin baştan sona otomatik yönetimi (VPOS, makbuz, CRM, raporlama)
- **Ölçeklenebilirlik**: Mikroservis mimarisi ile yatay ölçeklendirme desteği

### 2. İş Değeri
- STK'lar için hızlı onboarding (48 saat içinde canlıya çıkma)
- Bağış işlem maliyetlerinde %60 azalma
- Bağışçı memnuniyetinde artış (otomatik makbuz, SMS, e-posta)
- Şeffaf raporlama ve analitik dashboard
- Gelir modeli: SaaS abonelik + işlem komisyonu

## 👥 Kullanıcı Profilleri


### 1. Bağışçılar (Donors)
- **Bireysel Bağışçılar**: Tek seferlik veya düzenli bağış yapan gerçek kişiler
- **Kurumsal Bağışçılar**: Şirketler, vakıflar ve kurumsal sponsorlar
- **Yetim Sponsorları**: Aylık düzenli yetim/öğrenci desteği yapan bağışçılar
- **Kurban Bağışçıları**: Mevsimsel kurban payı alımı yapan bağışçılar

### 2. STK Yöneticileri
- **Platform Admin**: E-İnfak'ı yöneten süper admin (tüm STK'ları görür)
- **STK Admin**: Kendi kuruluşunu yöneten yetkili (sadece kendi verilerini görür)
- **Muhasebe Personeli**: Bağış kayıtları, makbuzlar, banka eşleştirme
- **Bağışçı İlişkileri**: CRM, iletişim, kampanya yönetimi
- **Operasyon**: Kurban kesimi, yardım dağıtımı, lojistik takip

### 3. Sistem Entegratörleri
- **Banka VPOS**: Vakıf Katılım, Kuveyt Türk, Ziraat Katılım vb.
- **SMS Gateway**: Netgsm, İletimerkezi vb.
- **E-posta Service**: SendGrid, AWS SES
- **Muhasebe Yazılımları**: Mikro, Netsis, Logo entegrasyonları

## 📊 Mevcut Sistemlerin Analizi

### E-İnfak.org (Mevcut Backend)
**Teknoloji Stack:**
- Backend: Python 3 + http.server (ThreadingHTTPServer)
- Database: SQLite3 (multi-tenant destekli)
- Frontend: Vanilla JavaScript + HTML/CSS
- VPOS: Vakıf Katılım entegrasyonu (vpos_client.py)

**Güçlü Yönler:**
✅ Multi-tenant veritabanı şeması (organizations, campaigns, donations)
✅ VPOS entegrasyonu hazır (3D Secure, hash calculation)
✅ Kurban yönetimi (animals, shares)
✅ CRM modülleri (donors, bank_movements, recurring_plans)
✅ Banka hesap hareketleri eşleştirme
✅ Tema sistemi (themes.css - hicret ve kardeslik temaları)

**Zayıf Yönler:**
❌ http.server production-ready değil (gunicorn/uvicorn gerekli)
❌ SQLite ölçeklenebilir değil (PostgreSQL'e geçiş şart)
❌ API dokümantasyonu yok
❌ Authentication/Authorization eksik
❌ Frontend çok basit (modern UI framework gerekli)


### Hicretdernegi.org (Mevcut Frontend)
**Teknoloji Stack:**
- Framework: Next.js 15 + TypeScript
- Styling: Tailwind CSS
- Font: Poppins
- Tema: Yeşil (#065f46) + Mavi (#0284c7)
- Port: 3005
- Lokasyon: Eskişehir
- Slogan: "İslami Eğitim Kurumu ve İlim Medresesi"

**Güçlü Yönler:**
✅ Modern Next.js 15 mimarisi
✅ TypeScript tip güvenliği
✅ Responsive ve hızlı UI
✅ SEO-friendly (Next.js SSR/SSG)
✅ Tailwind ile özelleştirilebilir tasarım

**Zayıf Yönler:**
❌ Backend entegrasyonu yok (API bağlantısı eksik)
❌ Ödeme sistemi yok
❌ Gerçek veri yok (mock data)
❌ Authentication eksik

### Kardeslikpayi.org (Mevcut Frontend)
**Teknoloji Stack:**
- Framework: Next.js 15 + TypeScript
- Styling: Tailwind CSS
- Font: Outfit
- **YANLIŞ Tema**: Yeşil (#407833) - Olması Gereken: Kırmızı (#DC2626) + Turuncu (#F59E0B)
- Port: 3005 (conflict with hicret)
- Lokasyon: İstanbul
- Slogan: "Paylaşmak Kardeşliktir"

**Güçlü Yönler:**
✅ Modern Next.js 15 mimarisi
✅ TypeScript tip güvenliği
✅ Temiz ve minimal tasarım

**Zayıf Yönler:**
❌ **Tema renkleri yanlış** (yeşil yerine kırmızı+turuncu olmalı)
❌ Backend entegrasyonu yok
❌ Port çakışması (hicret ile aynı 3005)
❌ README'de yanlış bilgi (HAKDER yazıyor, olması gereken: Kardeşlik Payı)


## 🎨 Tema Sistemi Gereksinimleri

### Tema Mimarisi
Platform, "Base Theme Templates" yaklaşımı ile çalışacak:

1. **Hicret Derneği Teması (Base Template #1)**
   - Primary: #065f46 (Koyu Yeşil - İlim, Güven)
   - Accent: #0284c7 (Açık Mavi - Ufuk)
   - Font Family: Poppins
   - Karakter: Akademik, eğitim odaklı, güvenilir
   - Kullanım Senaryoları: Eğitim kurumları, medreseler, hafızlık programları

2. **Kardeşlik Payı Teması (Base Template #2)**
   - Primary: #DC2626 (Kırmızı - Sıcaklık, Yardımlaşma)
   - Accent: #F59E0B (Turuncu - Enerji, Umut)
   - Font Family: Outfit
   - Karakter: Dinamik, sosyal, kapsayıcı
   - Kullanım Senaryoları: Sosyal yardım dernekleri, acil yardım kampanyaları

3. **Custom Theme Support**
   - Yeni STK'lar bu 2 base template'den birini seçebilir
   - Ya da sıfırdan custom tema oluşturabilir (renk paleti, font, logo)
   - Tema editörü: Canlı önizleme ile renk/font değişimi

### Tema Bileşenleri
Her tema şunları içerecek:
- **Renk Paleti**: Primary, accent, success, error, warning, neutral
- **Tipografi**: Heading fonts, body fonts, font sizes
- **Logo**: SVG/PNG format, light/dark variants
- **Hero Section**: Background image/gradient, CTA button styles
- **Cards**: Campaign cards, donation cards, testimonial cards
- **Buttons**: Primary, secondary, outline, ghost variants
- **Forms**: Input fields, dropdowns, checkboxes, radio buttons
- **Navigation**: Header, footer, mobile menu styles

## 📋 Fonksiyonel Gereksinimler

### FR-1: Multi-Tenant Altyapı

#### FR-1.1: STK Kaydı ve Onboarding
- **Gereksinim**: Yeni STK'lar self-service olarak platforma kaydolabilmeli
- **Süreç**:
  1. İlk temas formu (kurum adı, yetkili, telefon, e-posta)
  2. Platform admin onayı
  3. Kurum bilgileri girişi (yasal bilgiler, IBAN, vergi numarası)
  4. Tema seçimi (Hicret / Kardeşlik / Custom)
  5. Domain bağlama (subdomain veya custom domain)
  6. Test bağışı ile VPOS testi
  7. Canlıya çıkış onayı
- **Beklenen Süre**: 48 saat içinde canlıya çıkış
- **Acceptance Criteria**:
  - [ ] Yeni STK kaydı 10 dakikadan kısa sürmeli
  - [ ] Domain propagation otomatik kontrol edilmeli
  - [ ] VPOS test modu otomatik aktif olmalı
  - [ ] Demo kampanyalar otomatik oluşturulmalı


#### FR-1.2: Domain Yönetimi
- **Gereksinim**: Her STK kendi domain'i ile erişilebilmeli
- **Desteklenen Formatlar**:
  - Subdomain: `{stk-slug}.e-infak.org` (örn: hicret.e-infak.org)
  - Custom Domain: `hicretdernegi.org`, `kardeslikpayi.org`
  - Multi-domain: Bir STK birden fazla domain bağlayabilmeli
- **Teknik Gereksinimler**:
  - Wildcard SSL sertifikası (Let's Encrypt)
  - DNS CNAME/A record otomatik kontrolü
  - Domain hijacking koruması
- **Acceptance Criteria**:
  - [ ] Subdomain 5 dakika içinde aktif olmalı
  - [ ] Custom domain 24 saat içinde DNS propagation tamamlanmalı
  - [ ] SSL otomatik yenilenebilmeli
  - [ ] Birden fazla domain aynı STK'ya yönlendirilebilmeli

#### FR-1.3: Veri İzolasyonu
- **Gereksinim**: Her STK sadece kendi verilerine erişebilmeli
- **Güvenlik Kontrolleri**:
  - Row-level security (PostgreSQL RLS)
  - organization_id foreign key constraint (tüm tablolarda)
  - API middleware: Her request'te organization_id doğrulaması
  - Admin panel: STK'lar arası veri sızıntısı önleme
- **Acceptance Criteria**:
  - [ ] Bir STK başka STK'nın kampanyasını göremez
  - [ ] Bir STK başka STK'nın bağışçılarını göremez
  - [ ] Platform admin tüm STK'ları görebilir ve yönetebilir
  - [ ] API response'larda organization_id leak olmamalı

### FR-2: Kampanya Yönetimi

#### FR-2.1: Kampanya Oluşturma
- **Gereksinim**: STK yöneticileri kolayca kampanya oluşturabilmeli
- **Kampanya Bilgileri**:
  - Temel: Başlık, slug, kategori, özet, detaylı hikaye
  - Finansal: Hedef tutar, toplanan tutar, önerilen bağış miktarları
  - Görsel: Kapak fotoğrafı, galeri (4-8 fotoğraf)
  - Durum: Aktif/Pasif, öne çıkan/normal, sıralama
  - Tarih: Başlangıç, bitiş tarihi (opsiyonel)
- **Kampanya Kategorileri**:
  - Acil Yardım (deprem, sel, savaş)
  - Zekat ve Fitre
  - Kurban
  - Yetim Sponsorluğu
  - Eğitim (hafızlık, talebe desteği)
  - Su Kuyusu
  - Sağlık (ameliyat, ilaç)
  - Gıda Yardımı
  - Genel Bağışlar


- **Acceptance Criteria**:
  - [ ] Kampanya oluşturma 3 dakikadan kısa sürmeli
  - [ ] Görsel yükleme: drag-drop + crop aracı
  - [ ] Rich text editor (hikaye için)
  - [ ] SEO meta tags otomatik oluşturulmalı
  - [ ] Kampanya preview modu (canlıya almadan önce)
  - [ ] Kampanya URL: `/{kampanya-slug}` veya `/kampanyalar/{slug}`

#### FR-2.2: Kampanya İstatistikleri
- **Gereksinim**: Her kampanya için real-time istatistikler
- **Metrikler**:
  - Toplam bağış tutarı (TRY)
  - Bağışçı sayısı (unique donors)
  - Hedefe ulaşma yüzdesi (%)
  - Ortalama bağış tutarı
  - Günlük/haftalık/aylık trend grafikleri
  - Popüler bağış saatleri (heatmap)
- **Acceptance Criteria**:
  - [ ] İstatistikler 1 dakika gecikmeli güncellenebilir (near real-time)
  - [ ] Export: Excel, CSV, PDF
  - [ ] Grafik kütüphanesi: Recharts veya Chart.js
  - [ ] Karşılaştırma: Kampanyalar arası performans

### FR-3: Bağış Süreci

#### FR-3.1: Bağış Formu
- **Gereksinim**: Basit, hızlı ve güvenli bağış akışı
- **Form Alanları**:
  ```
  1. Kampanya Seçimi (dropdown veya kampanya sayfasından)
  2. Bağış Tutarı (önerilen tutarlar + custom input)
  3. Bağışçı Bilgileri:
     - Ad Soyad (zorunlu)
     - E-posta (zorunlu - makbuz için)
     - Telefon (zorunlu - SMS için)
     - Şehir (opsiyonel)
  4. Kart Bilgileri:
     - Kart Numarası (16 digit)
     - İsim (kart üzerindeki)
     - Son Kullanma (MM/YY)
     - CVV (3 digit)
  5. Ek Seçenekler:
     - Adına bağış yapılacak kişi (opsiyonel)
     - Bağış notu (opsiyonel)
     - Düzenli bağış (checkbox - aylık tekrar)
     - KVKK onayı (checkbox - zorunlu)
  ```
- **UX Prensipleri**:
  - Single-page form (scroll veya wizard)
  - Auto-format: Kart numarası, telefon
  - Real-time validation
  - Loading states: Button spinner, overlay


- **Acceptance Criteria**:
  - [ ] Form completion süresi < 2 dakika
  - [ ] Mobile responsive (öncelik: telefon)
  - [ ] Accessibility (WCAG 2.1 AA)
  - [ ] Güvenlik: PCI-DSS compliance, kart bilgileri tokenize edilmeli
  - [ ] Hata mesajları: Anlaşılır ve Türkçe

#### FR-3.2: 3D Secure Ödeme Akışı
- **Gereksinim**: Vakıf Katılım ve diğer bankalarla 3D Secure entegrasyonu
- **Akış**:
  ```
  1. Kullanıcı bağış formunu doldurur
  2. Backend: VPOS hash hesaplaması (vpos_client.py)
  3. Frontend: Banka gateway'e POST (3D Secure sayfası)
  4. Kullanıcı: Telefona gelen SMS kodunu girer
  5. Banka: Callback (okUrl veya failUrl)
  6. Backend: Hash doğrulama + ödeme onayı
  7. Frontend: Teşekkür sayfası + makbuz indir
  ```
- **Desteklenen Bankalar** (Öncelik Sırası):
  1. Vakıf Katılım (mevcut entegrasyon)
  2. Kuveyt Türk
  3. Ziraat Katılım
  4. Türkiye Finans
  5. Mock VPOS (test ortamı)
- **Acceptance Criteria**:
  - [ ] Ödeme süresi < 60 saniye
  - [ ] Timeout durumunda graceful error
  - [ ] Duplicate payment prevention (idempotency)
  - [ ] Webhook retry mekanizması (banka callback fail olursa)
  - [ ] Test modu: Başarılı/başarısız simülasyonlar

#### FR-3.3: Makbuz ve İletişim
- **Gereksinim**: Bağıştan sonra otomatik makbuz ve teşekkür mesajı
- **Makbuz Özellikleri**:
  - PDF format (A4)
  - Bağış detayları: Tutar, tarih, kampanya, makbuz no
  - STK logosu ve yasal bilgileri
  - E-posta ile gönderilmeli + web'den indirilebilmeli
  - QR kod: Makbuz doğrulama linki
- **İletişim Kanalları**:
  - **E-posta**: Makbuz PDF eki + teşekkür mesajı
  - **SMS**: Kısa teşekkür + web makbuz linki
  - **WhatsApp** (gelecek): Makbuz + kampanya güncellemeleri
- **Acceptance Criteria**:
  - [ ] E-posta 30 saniye içinde gönderilmeli
  - [ ] SMS 60 saniye içinde gönderilmeli
  - [ ] Makbuz no: Unique, sequential (ÖRN: HCR-2026-000001)
  - [ ] Failed delivery durumunda retry (3 deneme)
  - [ ] İletişim tercihleri: Bağışçı opt-out edebilmeli


### FR-4: Kurban Yönetimi Modülü

#### FR-4.1: Kurban Hayvan Kaydı
- **Gereksinim**: Operasyon ekibi kurban hayvanlarını sisteme girebilmeli
- **Hayvan Bilgileri**:
  - Kod: Unique identifier (örn: KRB-2026-001)
  - Tip: Büyükbaş (7 hisse) / Küçükbaş (1 hisse)
  - Bölge: Afrika, Asya, Türkiye, Balkanlar
  - Ülke: Somali, Nijer, Türkiye, vb.
  - Hisse fiyatı: TRY (örn: 7.500 TL)
  - Durum: Açık, Dolu, Kesildi
  - Kesim tarihi: Planlanan tarih
- **Acceptance Criteria**:
  - [ ] Toplu hayvan girişi (CSV import)
  - [ ] Hisse durumu real-time güncellenmeli
  - [ ] Dolu olan hayvanlar otomatik pasife alınmalı
  - [ ] Kesim takvimi: Operasyon takvim görünümü

#### FR-4.2: Kurban Hisse Atama
- **Gereksinim**: Bağış yapıldığında otomatik hisse ataması
- **Atama Kuralları**:
  1. Kullanıcı bağış yaparken bölge seçer (Somali, Nijer, vb.)
  2. Sistem o bölgede "açık" olan ilk hayvanı bulur
  3. Boş hisse varsa atar (hisse_no: 1-7)
  4. Hayvan dolduğunda status = "dolu" yapar
  5. Bağışçıya SMS: "Kurban emanetiniz alındı. Hayvan kodu: KRB-2026-001, Hisse: 3"
- **Niyet Tipleri**:
  - Vacip (farz kurban)
  - Adak
  - Akika
  - Şükür
  - Nafile
- **Acceptance Criteria**:
  - [ ] Atama 5 saniyeden kısa sürmeli
  - [ ] Race condition koruması (aynı hisse iki kişiye atanmamalı)
  - [ ] Bağışçı adına atama (dedicatee field)
  - [ ] Bağışçı kurban tercihlerini değiştirebilmeli (72 saat içinde)

#### FR-4.3: Kesim Bildirimi
- **Gereksinim**: Kurban kesildikten sonra bağışçılara video ve fotoğraf ile bildirim
- **Süreç**:
  1. Operasyon: Hayvan kesilir, video/fotoğraf çekilir
  2. Admin panel: Video upload + kesim tarihi girilir
  3. Sistem: O hayvana ait tüm bağışçılara otomatik bildirim gönderir
  4. Kanal: SMS + E-posta + WhatsApp (varsa)
  5. İçerik: "Kurbanınız kesildi. Video: [link]"
- **Video Depolama**:
  - Cloud storage: AWS S3 / Cloudflare R2
  - Format: MP4, max 50MB
  - Thumbnail otomatik oluşturulmalı
- **Acceptance Criteria**:
  - [ ] Video upload max 2 dakika
  - [ ] Toplu bildirim: 1000 bağışçıya 10 dakikada gönderilmeli
  - [ ] Video link 1 yıl boyunca geçerli olmalı
  - [ ] Bağışçı video izleme istatistiği (opsiyonel)


### FR-5: CRM ve Bağışçı Yönetimi

#### FR-5.1: Bağışçı Profili
- **Gereksinim**: Her bağışçı için detaylı profil ve geçmiş
- **Profil Bilgileri**:
  - Temel: Ad, e-posta, telefon, şehir
  - Tip: Bireysel / Kurumsal
  - KVKK onayı: Tarih ve kapsam
  - İletişim tercihleri: E-posta, SMS, WhatsApp (opt-in/out)
  - Notlar: Serbest metin (admin tarafından)
  - Oluşturulma tarihi
- **Bağış Geçmişi**:
  - Tüm bağışlar: Tarih, tutar, kampanya, makbuz no
  - Toplam bağış: Lifetime value (LTV)
  - Ortalama bağış: Average donation
  - Son bağış tarihi
  - Düzenli bağış durumu
- **Acceptance Criteria**:
  - [ ] Profil sayfası < 1 saniye yüklenmeli
  - [ ] Bağış geçmişi pagination (25 kayıt/sayfa)
  - [ ] Filtreleme: Kampanya, tarih aralığı, tutar
  - [ ] Export: Bireysel bağışçı raporu (PDF)

#### FR-5.2: Bağışçı Segmentasyonu
- **Gereksinim**: Bağışçıları gruplandırma ve hedefli iletişim
- **Segment Kriterleri**:
  - **Miktar bazlı**: 
    - VIP (10K+ TL/yıl)
    - Düzenli (1K-10K TL/yıl)
    - Ara sıra (<1K TL/yıl)
  - **Frekans bazlı**:
    - Aktif (son 3 ayda bağış)
    - Uyuyan (3-12 ay arası)
    - Kayıp (12+ ay)
  - **Kategori bazlı**:
    - Kurban bağışçıları
    - Yetim sponsorları
    - Zekat vericiler
  - **Coğrafi**: Şehir, bölge
  - **Kampanya bazlı**: Belirli kampanyaya bağış yapanlar
- **Kullanım Alanları**:
  - Hedefli SMS/e-posta kampanyaları
  - Özel teşekkür mesajları
  - Yeniden katılım (re-engagement) kampanyaları
- **Acceptance Criteria**:
  - [ ] Dinamik segment oluşturma (query builder UI)
  - [ ] Segment preview: Kaç kişi etkilenecek
  - [ ] Segment export: Excel, CSV
  - [ ] Scheduled campaigns: Segmente otomatik mesaj gönderimi


#### FR-5.3: Banka Hesap Hareketleri Eşleştirme
- **Gereksinim**: Banka havalesi/EFT ile gelen bağışları sisteme kaydedebilme
- **Mevcut Durum**: 
  - E-İnfak backend'de `bank_movements` tablosu var
  - Manuel eşleştirme sistemi mevcut
- **İyileştirmeler**:
  1. **Otomatik Eşleştirme**:
     - Banka açıklamasında referans no varsa otomatik eşleştir
     - Ad soyad fuzzy match (benzerlik skoru > 85%)
     - Tutar tam eşleşmesi kontrolü
  2. **Manuel Eşleştirme UI**:
     - Sol: Eşleşmemiş banka hareketleri
     - Sağ: Bağışçı arama + kampanya seçimi
     - Drag-drop veya "Eşleştir" butonu
  3. **Toplu İşlem**:
     - Banka ekstresinden CSV import
     - Otomatik parse (İş Bankası, Garanti, Vakıf formatları)
- **Acceptance Criteria**:
  - [ ] Otomatik eşleştirme doğruluk oranı > 80%
  - [ ] Manuel eşleştirme < 30 saniye/kayıt
  - [ ] Eşleştirilen bağışa otomatik makbuz oluşturulmalı
  - [ ] Eşleştirme geçmişi (audit log)

### FR-6: Yetim Sponsorluğu Modülü

#### FR-6.1: Yetim Profil Yönetimi
- **Gereksinim**: Yetim çocukların profillerini yönetme
- **Profil Bilgileri**:
  - Ad Soyad (takma ad olabilir)
  - Ülke
  - Yaş
  - Fotoğraf (gizlilik için yüz bulanık olabilir)
  - Durum: Müsait / Sponsor bulundu
  - Eğitim durumu: Okul raporu, not ortalaması
  - Sağlık durumu (opsiyonel)
  - Sponsor: Hangi bağışçı sponsor
  - Oluşturulma tarihi
- **Karne/Rapor Sistemi**:
  - Dönemlik karne yükleme (PDF/JPG)
  - Sponsor'a otomatik bildirim
  - Gelişim notları
- **Acceptance Criteria**:
  - [ ] Yetim ekleme formu < 5 dakika
  - [ ] Toplu yetim import (Excel/CSV)
  - [ ] Fotoğraf: Otomatik yüz bulanıklaştırma (GDPR/KVKK)
  - [ ] Durum değişiminde sponsor'a bildirim

#### FR-6.2: Sponsorluk Ataması
- **Gereksinim**: Bağışçıların yetim sponsoru olabilmesi
- **Süreç**:
  1. Bağışçı "Yetim Sponsorluğu" kampanyasından bağış yapar
  2. Aylık tutar seçer (örn: 750 TL/ay)
  3. Sistem müsait yetimlerden birini gösterir
  4. Bağışçı profili inceler ve onaylar
  5. Aylık otomatik ödeme planı oluşturulur
  6. Her ay otomatik çekim + makbuz gönderimi
- **Acceptance Criteria**:
  - [ ] Yetim seçimi: Rastgele veya tercih bazlı
  - [ ] Aylık ödeme: Recurring payment otomasyonu
  - [ ] Sponsor-yetim mesajlaşma (opsiyonel, moderasyonlu)
  - [ ] Sponsorluk iptal: 1 ay önceden bildirim ile


### FR-7: Admin Panel ve Raporlama

#### FR-7.1: Dashboard (STK Yöneticisi)
- **Gereksinim**: STK'nın genel durumunu özetleyen dashboard
- **Metrikler (KPI'lar)**:
  - **Bugün**:
    - Toplam bağış (TRY)
    - Bağışçı sayısı
    - Ortalama bağış
  - **Bu Ay**:
    - Toplam bağış
    - Hedef karşılama oranı (%)
    - Yeni bağışçı sayısı
  - **Bu Yıl**:
    - Yıllık toplam
    - En başarılı kampanyalar (top 5)
    - Bağışçı büyüme oranı
  - **Grafikler**:
    - Günlük bağış trendi (son 30 gün - line chart)
    - Kampanya dağılımı (pie chart)
    - Bağışçı segmentasyonu (bar chart)
    - Coğrafi dağılım (harita - opsiyonel)
- **Hızlı Aksiyonlar**:
  - Yeni kampanya oluştur
  - Banka hareketlerini eşleştir
  - Kurban kesim bildirimi gönder
  - Toplu SMS/e-posta gönder
- **Acceptance Criteria**:
  - [ ] Dashboard 2 saniyede yüklenmeli
  - [ ] Grafikler interaktif (hover, zoom)
  - [ ] Canlı güncelleme (WebSocket veya 30sn polling)
  - [ ] Export: Dashboard raporu PDF/Excel

#### FR-7.2: Raporlama ve Analitics
- **Gereksinim**: Detaylı raporlar ve veri analizi
- **Rapor Tipleri**:
  1. **Bağış Raporu**:
     - Tarih aralığı filtresi
     - Kampanya filtresi
     - Ödeme yöntemi (kart, havale, nakit)
     - Toplam, ortalama, medyan
     - Export: Excel, CSV, PDF
  2. **Bağışçı Raporu**:
     - Yeni bağışçılar (tarih aralığı)
     - Tekrar eden bağışçılar
     - En yüksek bağışçılar (top 100)
     - Şehir dağılımı
  3. **Kampanya Performans Raporu**:
     - Her kampanya için: Hedef, toplanan, eksik, süre
     - Dönüşüm oranı (görüntülenme vs bağış)
     - Sosyal medya etkisi (UTM tracking)
  4. **Finansal Mutabakat Raporu**:
     - Banka hareketleri vs sistem kayıtları
     - Eşleşmeyen tutarlar
     - Muhasebe export (e-Fatura formatı)
  5. **Kurban Operasyon Raporu**:
     - Bölge bazında: Toplam hayvan, kesilen, bekleyen
     - Bağışçı bildirimleri: Gönderilen, açılan
- **Acceptance Criteria**:
  - [ ] Rapor oluşturma < 10 saniye (1M kayıt için)
  - [ ] Scheduled reports: Otomatik e-posta gönderimi (haftalık, aylık)
  - [ ] Report builder: Custom rapor oluşturma (admin için)


#### FR-7.3: Kullanıcı ve Rol Yönetimi
- **Gereksinim**: STK içinde farklı yetki seviyelerinde kullanıcılar
- **Roller**:
  1. **Platform Super Admin** (E-İnfak sahibi):
     - Tüm STK'ları görebilir ve yönetebilir
     - Sistem ayarları (VPOS konfigürasyonu, pricing)
     - Faturalandırma ve abonelik yönetimi
  2. **STK Admin** (Kurum yöneticisi):
     - Kendi STK'sının tüm yetkilerine sahip
     - Kampanya, bağışçı, raporlar
     - Kullanıcı ekleyebilir/çıkarabilir
  3. **Muhasebe**:
     - Bağışlar, makbuzlar, banka eşleştirme
     - Finansal raporlar
     - Kampanya ve bağışçı düzenleyemez
  4. **Bağışçı İlişkileri**:
     - CRM (bağışçı profilleri)
     - SMS/e-posta kampanyaları
     - Finansal bilgilere erişemez
  5. **Operasyon**:
     - Kurban yönetimi
     - Yetim profilleri
     - Lojistik takip
  6. **Salt Okunur** (read-only):
     - Sadece raporları görür
     - Hiçbir şeyi değiştiremez
- **Acceptance Criteria**:
  - [ ] Rol bazlı erişim kontrolü (RBAC)
  - [ ] Kullanıcı ekleme: E-posta davetiyesi + şifre oluşturma
  - [ ] Audit log: Kim, ne zaman, ne yaptı
  - [ ] 2FA (Two-Factor Authentication) desteği (opsiyonel)

### FR-8: İletişim ve Bildirimler

#### FR-8.1: E-posta Sistemi
- **Gereksinim**: Transactional ve marketing e-postaları
- **Tipler**:
  1. **Transactional** (otomatik):
     - Bağış onayı + makbuz
     - Kurban kesim bildirimi
     - Yetim sponsor raporu
     - Şifre sıfırlama
  2. **Marketing** (manuel/scheduled):
     - Kampanya duyuruları
     - Aylık bülten
     - Yıllık etki raporu
- **Altyapı**:
  - ESP (Email Service Provider): SendGrid, AWS SES, veya Mailgun
  - Template engine: MJML veya React Email
  - Özelleştirme: Her STK kendi logosu, renkleri
- **Acceptance Criteria**:
  - [ ] Delivery rate > 95%
  - [ ] Açılma oranı tracking (open rate)
  - [ ] Tıklama oranı tracking (click rate)
  - [ ] Unsubscribe (abonelik iptali) linki (yasal zorunluluk)
  - [ ] Bounce/complaint yönetimi


#### FR-8.2: SMS Sistemi
- **Gereksinim**: Hızlı ve güvenilir SMS bildirimleri
- **Tipler**:
  - Bağış teşekkürü (makbuz linki)
  - Kurban kesim bildirimi
  - Düzenli bağış hatırlatıcı
  - OTP (One-Time Password) - 2FA için
- **Altyapı**:
  - SMS Gateway: Netgsm, İletimerkezi, Twilio
  - Karakter limiti: 160 karakter (Türkçe: 70 karakter)
  - Kısa link kullanımı (bit.ly veya custom short domain)
- **Acceptance Criteria**:
  - [ ] Delivery time < 60 saniye
  - [ ] Delivery rate > 98%
  - [ ] DLR (Delivery Report) tracking
  - [ ] Opt-out desteği: "Mesaj almak istemiyorum" yanıtı
  - [ ] Maliyet optimizasyonu: Toplu gönderimde indirim

#### FR-8.3: Bildirim Merkezi (Notification Center)
- **Gereksinim**: Kullanıcıların tüm bildirimlerini görebilmesi
- **Bildirim Tipleri**:
  - Yeni bağış (admin için)
  - Kampanya hedefine ulaşıldı
  - Düşük stok uyarısı (kurban hisseleri)
  - Sistem bakım duyuruları
- **Özellikler**:
  - Bell icon (header): Okunmamış sayısı badge
  - Dropdown: Son 10 bildirim
  - Tümünü gör sayfası
  - Okundu işaretleme
  - Bildirim tercihleri: Hangi olaylar için bildirim istiyorum
- **Acceptance Criteria**:
  - [ ] Real-time bildirim (WebSocket)
  - [ ] Fallback: Polling (30 saniye)
  - [ ] Push notification (browser - opsiyonel)
  - [ ] Bildirim geçmişi: 30 gün

### FR-9: Düzenli Bağış (Recurring Donations)

#### FR-9.1: Düzenli Ödeme Planı
- **Gereksinim**: Bağışçıların otomatik aylık bağış yapabilmesi
- **Plan Özellikleri**:
  - Miktar: Sabit tutar (örn: 500 TL/ay)
  - Frekans: Aylık, 3 aylık, 6 aylık
  - Kampanya: Belirli kampanya veya genel
  - Başlangıç: İlk ödeme tarihi
  - Durum: Aktif, duraklatıldı, iptal
- **Ödeme Yöntemi**:
  - **Kart kaydetme**: Tokenization (PCI-DSS uyumlu)
  - **Otomatik çekim**: Ayın belirli günü (örn: her ayın 1'i)
  - **Başarısız ödeme**: 3 deneme (1 gün, 3 gün, 7 gün)
  - **Başarısız sonrası**: Bağışçıya bildirim + plan pasif
- **Acceptance Criteria**:
  - [ ] Plan oluşturma bağış formu ile entegre
  - [ ] İlk ödeme: Anında (0. gün)
  - [ ] Sonraki ödemeler: Scheduled job (cron)
  - [ ] Bağışçı paneli: Planlarımı görüntüle, duraklat, iptal et
  - [ ] Her ödeme için ayrı makbuz


#### FR-9.2: Taahhüt Sistemi (Pledges)
- **Gereksinim**: Bağışçıların ödeme taahhüdünde bulunması
- **Kullanım Senaryosu**:
  - Büyük projeler için (cami inşaatı, okul binası)
  - Bağışçı: "12 ay boyunca aylık 1000 TL vereceğim"
  - İlk ödeme yapar, kalan taahhüdü kaydedilir
  - Her ay hatırlatma + manuel ödeme linki
- **Taahhüt Bilgileri**:
  - Toplam taahhüt tutarı
  - Ödenen tutar
  - Kalan tutar
  - Vade tarihi
  - Durum: Açık, tamamlandı, gecikmiş
- **Acceptance Criteria**:
  - [ ] Taahhüt oluşturma: Admin veya bağışçı
  - [ ] Hatırlatma: 7 gün önceden e-posta/SMS
  - [ ] Vade geçti: Otomatik "gecikmiş" durumu
  - [ ] Ödeme linki: Taahhüde özel secure link

### FR-10: Güvenlik ve Compliance

#### FR-10.1: Authentication (Kimlik Doğrulama)
- **Gereksinim**: Güvenli giriş sistemi
- **Yöntemler**:
  1. **E-posta + Şifre**: Klasik login
  2. **Magic Link**: Şifresiz e-posta linki ile giriş
  3. **2FA (İki Faktörlü)**: SMS veya Authenticator app (opsiyonel)
  4. **SSO (gelecek)**: Google, Microsoft Azure AD entegrasyonu
- **Şifre Politikası**:
  - Min 8 karakter
  - En az 1 büyük harf, 1 küçük harf, 1 rakam
  - Şifre sıfırlama: E-posta linki (15 dakika geçerli)
- **Session Yönetimi**:
  - JWT token (access + refresh)
  - Access token: 15 dakika
  - Refresh token: 7 gün
  - Cookie: httpOnly, secure, sameSite
- **Acceptance Criteria**:
  - [ ] Login < 3 saniye
  - [ ] Rate limiting: 5 failed login = 15 dakika ban
  - [ ] Şüpheli aktivite: IP değişimi, farklı cihaz uyarısı
  - [ ] GDPR/KVKK: "Beni hatırla" checkbox

#### FR-10.2: Authorization (Yetkilendirme)
- **Gereksinim**: Rol bazlı erişim kontrolü (RBAC)
- **İmplementasyon**:
  - Middleware: Her API request'te rol kontrolü
  - Frontend: UI element visibility (role-based)
  - Database: Row-level security (PostgreSQL RLS)
- **Acceptance Criteria**:
  - [ ] Unauthorized access: 403 Forbidden
  - [ ] Cross-tenant access: Kesinlikle engellenmiş olmalı
  - [ ] Permission matrix: Hangi rol ne yapabilir (dokümantasyon)


#### FR-10.3: Veri Güvenliği
- **Gereksinim**: Hassas verilerin korunması
- **Şifreleme**:
  - **At Rest**: Database encryption (PostgreSQL TDE)
  - **In Transit**: TLS 1.3 (HTTPS zorunlu)
  - **Sensitive Fields**: Kart bilgileri tokenize, IBAN maskelenmiş
- **PCI-DSS Compliance** (Kart Güvenliği):
  - Kart bilgileri asla sunucuda saklanmaz (tokenization)
  - 3D Secure zorunlu
  - PCI SAQ-A seviyesi (en düşük risk)
- **KVKK/GDPR Compliance**:
  - Açık rıza metni (checkbox)
  - Veri işleme sözleşmesi
  - Bağışçı hakları: Verilerini görme, silme, düzeltme
  - Data retention: Bağış kayıtları 10 yıl (yasal zorunluluk)
- **Acceptance Criteria**:
  - [ ] Penetration test: Yıllık güvenlik denetimi
  - [ ] Bug bounty program (gelecek)
  - [ ] OWASP Top 10 açıklarına karşı koruma
  - [ ] Security headers: CSP, HSTS, X-Frame-Options

#### FR-10.4: Audit Log (İşlem Günlüğü)
- **Gereksinim**: Tüm kritik işlemlerin kayıt altına alınması
- **Loglanacak İşlemler**:
  - Admin actions: Kampanya oluşturma, silme, düzenleme
  - Bağış işlemleri: Her bağış (tutar, tarih, bağışçı)
  - Ödeme işlemleri: Başarılı, başarısız, iptal
  - Kullanıcı işlemleri: Login, logout, şifre değişimi
  - Veri değişiklikleri: CRM düzenlemeleri, kurban atamaları
- **Log Bilgileri**:
  - Timestamp (UTC)
  - User ID ve role
  - Action type (create, update, delete)
  - Resource (campaign, donation, user)
  - IP address
  - User agent
  - Before/after values (değişiklik kayıtları)
- **Acceptance Criteria**:
  - [ ] Log retention: 2 yıl
  - [ ] Log search: Tarih, kullanıcı, aksiyon filtresi
  - [ ] Immutable logs (değiştirilemez)
  - [ ] Export: Denetim için CSV/JSON

### FR-11: Entegrasyonlar

#### FR-11.1: Muhasebe Yazılımı Entegrasyonu
- **Gereksinim**: Bağış verilerinin muhasebe sistemine aktarılması
- **Desteklenen Sistemler**:
  - Logo Tiger
  - Mikro
  - Netsis
  - e-Fatura sistemi
- **Akış**:
  1. Bağış tamamlanır
  2. Sistem otomatik muhasebe kaydı oluşturur
  3. API/File export ile muhasebe yazılımına gönderilir
  4. Makbuz no muhasebe ile eşleştirilir
- **Acceptance Criteria**:
  - [ ] Real-time veya günlük batch export
  - [ ] Hata durumunda retry mekanizması
  - [ ] Mutabakat raporu: Sistem vs Muhasebe


#### FR-11.2: CRM Entegrasyonu
- **Gereksinim**: Bağışçı verilerini harici CRM sistemlerine senkronize etme
- **Desteklenen CRM'ler**:
  - HubSpot
  - Salesforce (gelecek)
  - Custom CRM (webhook desteği)
- **Senkronize Edilen Veriler**:
  - Bağışçı profili (ad, e-posta, telefon)
  - Bağış geçmişi
  - Segmentasyon tagları
  - İletişim logları
- **Acceptance Criteria**:
  - [ ] Two-way sync: CRM'de yapılan değişiklik E-İnfak'a yansımalı
  - [ ] Conflict resolution: Hangisi daha yeni
  - [ ] Webhook desteği: CRM event'leri E-İnfak'ı tetikleyebilir

#### FR-11.3: Sosyal Medya Entegrasyonu
- **Gereksinim**: Kampanya paylaşımları ve sosyal kanıt
- **Özellikler**:
  1. **Paylaşım Butonları**:
     - Facebook, Twitter, WhatsApp, LinkedIn
     - Custom mesaj template
     - UTM parametreleri (tracking için)
  2. **Facebook Pixel / Google Analytics**:
     - Bağış dönüşüm tracking
     - Retargeting kampanyaları
  3. **Instagram Feed** (opsiyonel):
     - STK'nın Instagram postlarını sitede gösterme
- **Acceptance Criteria**:
  - [ ] Open Graph tags: Paylaşımlarda güzel preview
  - [ ] Twitter Card desteği
  - [ ] Google Analytics 4 entegrasyonu
  - [ ] Facebook Conversions API

## 🎯 Non-Fonksiyonel Gereksinimler

### NFR-1: Performans

#### NFR-1.1: Sayfa Yükleme Hızı
- Homepage: < 2 saniye (LCP - Largest Contentful Paint)
- Kampanya sayfası: < 2.5 saniye
- Admin dashboard: < 3 saniye
- Bağış formu: < 1.5 saniye
- **Metrik**: Google Lighthouse score > 90

#### NFR-1.2: API Response Time
- GET endpoints: < 200ms (p95)
- POST endpoints: < 500ms (p95)
- Ödeme işlemi: < 5 saniye (banka dahil)
- Raporlar: < 10 saniye (1M kayıt için)

#### NFR-1.3: Veritabanı Performans
- Query time: < 100ms (indexed queries)
- Connection pool: Min 10, Max 100
- Pagination: 25-50-100 kayıt/sayfa
- Index strategy: Campaign slug, donor email, donation date


### NFR-2: Ölçeklenebilirlik

#### NFR-2.1: Kullanıcı Kapasitesi
- Eşzamanlı kullanıcı: 10,000 (peak time)
- Günlük bağış: 50,000 işlem
- Kampanya bayramı (Ramazan, Kurban): 100,000+ işlem/gün
- STK sayısı: 100+ (initial), 1000+ (5 yıl hedefi)

#### NFR-2.2: Yatay Ölçeklendirme
- Backend: Load balancer + multiple instances
- Database: Read replicas (master-slave)
- Cache: Redis cluster
- File storage: CDN (CloudFlare, AWS CloudFront)

#### NFR-2.3: Otomatik Ölçeklendirme
- Kubernetes HPA (Horizontal Pod Autoscaling)
- CPU > 70% → yeni pod ekle
- CPU < 30% → pod azalt
- Min replicas: 2, Max replicas: 20

### NFR-3: Güvenilirlik (Reliability)

#### NFR-3.1: Uptime
- SLA: 99.9% uptime (aylık ~43 dakika downtime)
- Maintenance window: Hafta sonu 02:00-04:00
- Zero-downtime deployment: Blue-green deployment

#### NFR-3.2: Hata Yönetimi
- Error rate: < 0.1%
- Retry mekanizması: Exponential backoff
- Circuit breaker: Bağımlı servisler fail olursa
- Graceful degradation: VPOS down → manuel ödeme seçeneği göster

#### NFR-3.3: Backup ve Recovery
- Database backup: Günlük (otomatik)
- Retention: 30 gün
- Point-in-time recovery: Son 7 gün
- Disaster recovery: RTO < 4 saat, RPO < 1 saat

### NFR-4: Güvenlik

#### NFR-4.1: Uygulama Güvenliği
- SQL Injection koruması (ORM kullanımı)
- XSS koruması (input sanitization)
- CSRF token (state-changing requests)
- Rate limiting: 100 req/min per IP

#### NFR-4.2: Altyapı Güvenliği
- WAF (Web Application Firewall)
- DDoS koruması (Cloudflare)
- VPN: Database ve admin panel erişimi
- Firewall rules: Sadece gerekli portlar açık

#### NFR-4.3: Monitoring ve Alerting
- Uptime monitoring: UptimeRobot, Pingdom
- Error tracking: Sentry
- Log aggregation: ELK Stack (Elasticsearch, Logstash, Kibana)
- Metrics: Prometheus + Grafana
- Alerts: Slack, PagerDuty


### NFR-5: Kullanılabilirlik (Usability)

#### NFR-5.1: Responsive Design
- Mobile-first approach
- Breakpoints: 320px, 768px, 1024px, 1440px
- Touch-friendly: Button min 44x44px
- Bağışçıların %70'i mobil kullanıcı (istatistik)

#### NFR-5.2: Erişilebilirlik (Accessibility)
- WCAG 2.1 Level AA compliance
- Keyboard navigation
- Screen reader desteği
- Yüksek kontrast modu
- Font size: Ayarlanabilir

#### NFR-5.3: Çoklu Dil Desteği
- Öncelik: Türkçe (TR)
- Gelecek: İngilizce (EN), Arapça (AR)
- i18n framework: next-i18next
- RTL support (Arapça için)

### NFR-6: Bakım ve Sürdürülebilirlik

#### NFR-6.1: Kod Kalitesi
- TypeScript: Strict mode
- ESLint + Prettier
- Test coverage: > 80%
- Code review: 2 approvers

#### NFR-6.2: Dokümantasyon
- API: OpenAPI/Swagger
- Architecture: C4 diagrams
- Deployment: Runbook
- User manual: STK yöneticileri için

#### NFR-6.3: CI/CD Pipeline
- GitHub Actions / GitLab CI
- Stages: Lint → Test → Build → Deploy
- Environments: Dev, Staging, Production
- Rollback: 1-click rollback (< 5 dakika)

## 📊 Teknik Gereksinimler Özeti

### Tech Stack (Önerilen)

#### Frontend
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS 4.x
- **State Management**: Zustand veya Jotai
- **Forms**: React Hook Form + Zod validation
- **HTTP Client**: TanStack Query (React Query)
- **Charts**: Recharts veya ApexCharts

#### Backend
- **Framework**: FastAPI (Python 3.12)
- **ORM**: SQLAlchemy 2.x
- **Database**: PostgreSQL 16
- **Cache**: Redis 7.x
- **Queue**: Celery + Redis (background jobs)
- **API Docs**: FastAPI automatic OpenAPI


#### Infrastructure
- **Hosting**: AWS / DigitalOcean / Hetzner
- **Container**: Docker + Docker Compose (dev)
- **Orchestration**: Kubernetes (production)
- **CDN**: Cloudflare
- **Storage**: AWS S3 / Cloudflare R2
- **Monitoring**: Sentry + Grafana + Prometheus

#### DevOps
- **Version Control**: Git + GitHub
- **CI/CD**: GitHub Actions
- **IaC**: Terraform (infrastructure as code)
- **Secrets**: Vault / AWS Secrets Manager

### Database Schema (Core Tables)

```sql
-- Multi-tenant core
organizations (id, slug, name, domain, theme, primary_color, accent_color, ...)
users (id, organization_id, full_name, email, role, ...)

-- Campaigns
campaigns (id, organization_id, slug, title, category, target_cents, collected_cents, ...)
campaign_updates (id, campaign_id, title, content, created_at) -- Kampanya güncellemeleri

-- Donations
donors (id, organization_id, full_name, email, phone, city, ...)
donations (id, organization_id, donor_id, campaign_id, amount_cents, payment_status, ...)
recurring_plans (id, organization_id, donor_id, amount_cents, interval, status, ...)
pledges (id, organization_id, donor_id, pledged_cents, paid_cents, ...)

-- Kurban
kurban_animals (id, organization_id, code, animal_type, region, total_shares, ...)
kurban_shares (id, organization_id, animal_id, share_no, donor_id, donation_id, ...)

-- Yetim
orphans (id, organization_id, full_name, country, age, photo_url, status, sponsor_donor_id, ...)
orphan_reports (id, orphan_id, report_type, file_url, created_at) -- Karne, sağlık raporu

-- Banking
bank_movements (id, organization_id, bank_name, amount_cents, sender_name, status, ...)
payment_transactions (id, donation_id, provider, transaction_id, status, ...)

-- Communication
message_templates (id, organization_id, title, channel, body, ...)
message_logs (id, organization_id, donor_id, channel, target, body, status, ...)
notifications (id, user_id, type, title, body, read, created_at)

-- System
audit_logs (id, user_id, action, resource_type, resource_id, before_value, after_value, ...)
tasks (id, organization_id, title, owner, priority, status, due_at, ...)
```

## 🚀 Uygulama Fazları (Implementation Phases)

### Phase 1: MVP (8 hafta) - Temel Fonksiyonalite
**Hedef**: 2 STK (Hicret + Kardeşlik) canlıya çıksın

**Kapsam**:
- ✅ Multi-tenant backend altyapısı (FastAPI + PostgreSQL)
- ✅ Frontend: Hicret ve Kardeşlik temaları (Next.js)
- ✅ Kampanya yönetimi (CRUD)
- ✅ Bağış formu + 3D Secure ödeme (Vakıf Katılım)
- ✅ Makbuz oluşturma (PDF)
- ✅ E-posta bildirimleri
- ✅ Basit admin panel (dashboard, kampanya listesi)
- ✅ Domain routing (subdomain)

**Çıkarılanlar** (Sonraki fazlara):
- SMS entegrasyonu
- Kurban modülü
- Yetim sponsorluğu
- CRM özellikleri
- Düzenli bağış


### Phase 2: Otomasyon (6 hafta) - Kurban & İletişim
**Hedef**: Ramazan ve Kurban Bayramı hazırlığı

**Kapsam**:
- ✅ Kurban hayvan yönetimi
- ✅ Kurban hisse atama otomasyonu
- ✅ Kesim bildirimi (video upload + SMS)
- ✅ SMS entegrasyonu (Netgsm)
- ✅ Banka eşleştirme modülü
- ✅ Detaylı raporlar (Excel/PDF export)
- ✅ Bildirim merkezi
- ✅ Audit log sistemi

### Phase 3: CRM & Sponsorluk (6 hafta) - Bağışçı İlişkileri
**Hedef**: Yetim sponsorluğu ve bağışçı yönetimi

**Kapsam**:
- ✅ CRM: Bağışçı profilleri ve segmentasyon
- ✅ Yetim sponsorluğu modülü
- ✅ Düzenli bağış (recurring donations)
- ✅ Taahhüt sistemi
- ✅ Bağışçı paneli (self-service)
- ✅ SMS/e-posta kampanya yönetimi
- ✅ HubSpot entegrasyonu

### Phase 4: Ölçeklendirme (4 hafta) - Multi-STK
**Hedef**: 10+ yeni STK onboarding

**Kapsam**:
- ✅ Self-service STK kaydı
- ✅ Tema editörü (custom themes)
- ✅ Custom domain desteği
- ✅ Kubernetes deployment
- ✅ Monitoring dashboard (Grafana)
- ✅ Muhasebe entegrasyonları
- ✅ Faturalandırma modülü (SaaS pricing)

### Phase 5: Gelişmiş Özellikler (Ongoing) - İnovasyon
**Hedef**: Rekabet avantajı ve kullanıcı deneyimi

**Kapsam**:
- 📱 Mobil app (React Native)
- 🤖 AI chatbot (bağışçı destek)
- 📊 Tahminleme analitiği (donation forecasting)
- 🌍 Çoklu dil (EN, AR)
- 💳 Alternatif ödeme yöntemleri (PayPal, kripto)
- 🎥 Canlı yayın entegrasyonu (YouTube, Twitch)
- 🏆 Gamification (rozet, liderlik tablosu)

## 🎨 Tasarım Sistemi (Design System)

### Renk Paleti Standardı

Her STK teması aşağıdaki renkleri tanımlamalı:

```css
--primary-50 to --primary-900    /* Ana marka rengi tonları */
--accent-50 to --accent-900      /* Vurgu rengi tonları */
--gray-50 to --gray-900          /* Nötr tonlar */
--success: #10b981              /* Başarı (yeşil) */
--error: #ef4444                /* Hata (kırmızı) */
--warning: #f59e0b              /* Uyarı (turuncu) */
--info: #3b82f6                 /* Bilgi (mavi) */
```

### Tipografi Standardı

```css
/* Headings */
h1: 3rem (48px), font-weight: 700
h2: 2.25rem (36px), font-weight: 600
h3: 1.875rem (30px), font-weight: 600
h4: 1.5rem (24px), font-weight: 600
h5: 1.25rem (20px), font-weight: 500
h6: 1.125rem (18px), font-weight: 500

/* Body */
body: 1rem (16px), font-weight: 400
small: 0.875rem (14px)
```


### Component Library

Tüm temalar aşağıdaki bileşenleri kullanacak (Tailwind + Headless UI):

- **Buttons**: Primary, Secondary, Outline, Ghost, Danger
- **Forms**: Input, Textarea, Select, Checkbox, Radio, Toggle
- **Cards**: Campaign Card, Donor Card, Stats Card
- **Modals**: Confirmation, Form, Info
- **Navigation**: Header, Footer, Sidebar, Breadcrumb
- **Feedback**: Alert, Toast, Progress Bar, Skeleton Loader
- **Data Display**: Table, Badge, Avatar, Empty State

## 📱 Kullanıcı Akışları (User Flows)

### Akış 1: Bağışçı - Tek Seferlik Bağış

```
1. Landing page → Kampanyalar
2. Kampanya seçimi → Kampanya detay sayfası
3. "Bağış Yap" butonu → Bağış formu
4. Form doldur (tutar, kişisel bilgiler, kart)
5. "Ödemeyi Tamamla" → 3D Secure sayfası (banka)
6. SMS kodu girme → Ödeme onayı
7. Teşekkür sayfası (makbuz indir, sosyal paylaşım)
8. E-posta + SMS (makbuz linki)
```

### Akış 2: STK Admin - Yeni Kampanya

```
1. Admin panel login
2. Dashboard → "Yeni Kampanya"
3. Form:
   - Temel bilgiler (başlık, kategori, özet)
   - Finansal (hedef, önerilen tutarlar)
   - Görsel (kapak, galeri)
   - Hikaye (rich text editor)
4. Preview → "Yayınla"
5. Kampanya canlıya alındı (status: aktif)
6. Kampanya istatistikleri dashboard'da görünür
```

### Akış 3: Operasyon - Kurban Kesim Bildirimi

```
1. Admin panel → Kurban Yönetimi
2. Hayvan listesi → Filtre (kesilecek)
3. Hayvan seçimi → "Video Yükle"
4. Video upload + kesim tarihi → "Kaydet"
5. Sistem: O hayvana ait bağışçıları bul
6. Toplu bildirim gönder:
   - SMS: "Kurbanınız kesildi. Video: [link]"
   - E-posta: Detaylı mesaj + video embed
7. Bildirim logları → delivery status takip
```

## 🔐 Güvenlik Senaryoları

### Senaryo 1: Duplicate Payment Prevention

**Problem**: Kullanıcı ödeme butonuna 2 kez tıklarsa?

**Çözüm**:
1. Frontend: Button disable (loading state)
2. Backend: Idempotency key (UUID)
3. Database: Unique constraint (idempotency_key)
4. Retry: Aynı key ile gelen request → ilk result döndür

### Senaryo 2: Cross-Tenant Data Access

**Problem**: Hicret Derneği admin'i Kardeşlik Payı kampanyasını görmeye çalışırsa?

**Çözüm**:
1. Middleware: JWT'den organization_id çıkar
2. Query: WHERE organization_id = :org_id
3. PostgreSQL RLS: Row-level policy
4. Response: 403 Forbidden (yetkisiz erişim)


### Senaryo 3: VPOS Callback Tampering

**Problem**: Saldırgan fake callback gönderirse (ödeme olmadan onay)?

**Çözüm**:
1. Banka hash doğrulama (vpos_client.verify_callback_signature)
2. Hash match yoksa → request reject
3. IP whitelist (banka IP'leri)
4. SSL/TLS zorunlu
5. Suspicious activity log

## 📊 İş Metrikleri (Business Metrics)

### KPI'lar (Key Performance Indicators)

#### Gelir Metrikleri
- **MRR** (Monthly Recurring Revenue): Aylık abonelik geliri
- **ARR** (Annual Recurring Revenue): Yıllık tekrarlayan gelir
- **ARPU** (Average Revenue Per User): STK başına ortalama gelir
- **Churn Rate**: Aylık ayrılan STK oranı (< %5 hedef)

#### Platform Metrikleri
- **Active STKs**: Aktif STK sayısı (aylık en az 1 bağış alan)
- **Total Donations**: Platform geneli toplam bağış (TRY)
- **Average Donation**: Ortalama bağış tutarı
- **Donor Retention**: Bağışçı geri dönüş oranı (% recurring donors)

#### Operasyonel Metrikler
- **Onboarding Time**: Yeni STK'nın canlıya çıkma süresi (< 48 saat hedef)
- **Support Ticket Resolution**: Destek talebi çözüm süresi (< 24 saat)
- **System Uptime**: Platform erişilebilirlik (> 99.9%)

## 🎯 Başarı Kriterleri (Success Criteria)

### MVP Başarısı (8 hafta sonunda)

✅ **Teknik**:
- [ ] 2 STK (Hicret + Kardeşlik) canlıda
- [ ] 100 test bağışı başarıyla tamamlanmış
- [ ] %0 critical bug
- [ ] API response time < 500ms
- [ ] Frontend Lighthouse score > 85

✅ **İş**:
- [ ] İlk gerçek bağış alınmış
- [ ] Makbuz otomasyonu çalışıyor
- [ ] STK admin'leri kendi başlarına kampanya açabiliyor
- [ ] 10+ gerçek bağışçı

### 6 Ay Sonunda (Phase 3 tamamlandı)

✅ **Teknik**:
- [ ] 10+ STK aktif
- [ ] 10,000+ bağış işlenmiş
- [ ] Zero downtime deployment yapılıyor
- [ ] Monitoring ve alerting tam otomatik

✅ **İş**:
- [ ] 1M+ TRY toplam bağış işlenmiş
- [ ] %20+ STK'lar referans ile gelmiş
- [ ] Kurban sezonu başarıyla tamamlanmış
- [ ] 50+ yetim sponsor bulmuş

### 1 Yıl Sonunda (Phase 4 tamamlandı)

✅ **Teknik**:
- [ ] 50+ STK aktif
- [ ] 100,000+ bağış işlenmiş
- [ ] Kubernetes cluster production'da
- [ ] Multi-region deployment (afet durumunda)

✅ **İş**:
- [ ] 10M+ TRY toplam bağış
- [ ] MRR: 100K+ TRY (abonelik geliri)
- [ ] %30+ market share (STK bağış platformları içinde)
- [ ] Case study: En az 3 başarı hikayesi


## 🚨 Riskler ve Azaltma Stratejileri

### Risk 1: VPOS Entegrasyon Sorunları
**Olasılık**: Orta | **Etki**: Yüksek

**Açıklama**: Banka VPOS API'leri değişebilir, test ortamları stabil olmayabilir

**Azaltma**:
- Mock VPOS (test için)
- Birden fazla banka desteği (fallback)
- Kapsamlı error handling
- Webhook retry mekanizması

### Risk 2: Performans Darboğazları
**Olasılık**: Orta | **Etki**: Orta

**Açıklama**: Bayram dönemlerinde trafik 10x artabilir

**Azaltma**:
- Load testing (K6, JMeter)
- Auto-scaling (Kubernetes HPA)
- CDN kullanımı (statik dosyalar)
- Database indexing stratejisi

### Risk 3: Veri Güvenliği İhlali
**Olasılık**: Düşük | **Etki**: Kritik

**Açıklama**: Bağışçı verileri çalınabilir, KVKK ihlali

**Azaltma**:
- Penetration testing (üçüncü parti)
- Bug bounty program
- Encryption at rest & in transit
- Regular security audits
- Incident response plan

### Risk 4: STK Churn (Ayrılma)
**Olasılık**: Orta | **Etki**: Orta

**Açıklama**: STK'lar platformdan ayrılabilir (fiyat, özellik eksikliği)

**Azaltma**:
- Sürekli feedback toplama
- Feature roadmap şeffaflığı
- Excellent customer support
- Onboarding eğitimleri
- Success metrics paylaşımı

### Risk 5: Yasal ve Compliance
**Olasılık**: Düşük | **Etki**: Yüksek

**Açıklama**: KVKK, PCI-DSS, vergi mevzuatı değişiklikleri

**Azaltma**:
- Hukuk danışmanlığı
- KVKK uzmanı ile çalışma
- Periyodik compliance audit
- Yasal dokümantasyon güncel tutma

## 📚 Referanslar ve İnspirasyonlar

### Benchmark Platformlar

1. **LaunchGood** (launchgood.com)
   - Muslim crowdfunding platform
   - Güçlü yönler: Sosyal proof, campaign updates
   - Öğrenme: Video storytelling etkili

2. **DonorBox** (donorbox.org)
   - Nonprofit donation platform
   - Güçlü yönler: Embed widgets, recurring donations
   - Öğrenme: Basit onboarding süreci

3. **GiveWP** (givewp.com)
   - WordPress donation plugin
   - Güçlü yönler: Raporlama, form builder
   - Öğrenme: Flexibility in customization

4. **Zakat Foundation** (zakatfoundation.org)
   - Islamic charity platform
   - Güçlü yönler: Şeffaf raporlama, impact stories
   - Öğrenme: Kategori bazlı kampanyalar

### Teknik Referanslar

- **Multi-tenancy Patterns**: 
  - https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/overview
- **Payment Gateway Security**:
  - https://stripe.com/docs/strong-customer-authentication
- **PostgreSQL Row-Level Security**:
  - https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- **Next.js Multi-Tenant Architecture**:
  - https://vercel.com/guides/nextjs-multi-tenant-application


## 🎓 Ekip ve Roller

### Gerekli Ekip (MVP için)

1. **Full-Stack Developer (2 kişi)**:
   - Frontend: Next.js, TypeScript, Tailwind
   - Backend: FastAPI, PostgreSQL
   - DevOps: Docker, basic deployment

2. **UI/UX Designer (1 kişi)**:
   - Tema tasarımları
   - User flow diagrams
   - Prototype (Figma)
   - Component library

3. **Product Manager/Owner (1 kişi)**:
   - Requirements gathering
   - Stakeholder communication
   - Sprint planning
   - User acceptance testing

4. **QA Engineer (0.5 FTE)**:
   - Test scenarios
   - Manual testing
   - Basic automation (Playwright)

**Toplam**: 4.5 FTE (Full-Time Equivalent)

### Danışman/Konsültant İhtiyaçları

- **Hukuk Danışmanı**: KVKK, sözleşmeler
- **Muhasebe Danışmanı**: Finansal raporlama standartları
- **Güvenlik Uzmanı**: Penetration testing, PCI-DSS
- **DevOps Uzmanı**: Kubernetes setup (Phase 4)

## 💰 Maliyet Tahmini

### Geliştirme Maliyetleri (8 hafta MVP)

| Kalem | Miktar | Birim Fiyat | Toplam |
|-------|--------|-------------|--------|
| Full-Stack Dev (2 kişi) | 2 x 320 saat | 500 TRY/saat | 320,000 TRY |
| UI/UX Designer | 320 saat | 400 TRY/saat | 128,000 TRY |
| Product Manager | 320 saat | 600 TRY/saat | 192,000 TRY |
| QA Engineer (part-time) | 160 saat | 350 TRY/saat | 56,000 TRY |
| **Toplam İşçilik** | | | **696,000 TRY** |

### Altyapı Maliyetleri (Aylık - Production)

| Hizmet | Açıklama | Aylık Maliyet |
|--------|----------|---------------|
| Hosting | DigitalOcean Droplets (2x 4GB) | $48 (~1,600 TRY) |
| Database | Managed PostgreSQL | $60 (~2,000 TRY) |
| Redis | Managed Redis | $25 (~850 TRY) |
| CDN | Cloudflare Pro | $20 (~650 TRY) |
| Email | SendGrid (50K emails) | $50 (~1,650 TRY) |
| SMS | Netgsm (5K SMS) | ~750 TRY |
| Storage | AWS S3 (100GB) | $3 (~100 TRY) |
| Monitoring | Sentry + Grafana Cloud | $30 (~1,000 TRY) |
| SSL | Let's Encrypt | $0 |
| **Toplam** | | **~8,600 TRY/ay** |

### 1. Yıl Toplam Maliyet Tahmini

- Geliştirme (MVP): 696,000 TRY
- Altyapı (12 ay): 103,200 TRY
- Danışmanlık ve yasal: 50,000 TRY
- Buffer (%20): 169,840 TRY
- **TOPLAM**: ~**1,019,040 TRY** (~$30,000)


## 💵 Gelir Modeli (Revenue Model)

### SaaS Abonelik Planları

#### 1. Starter Plan (Küçük STK'lar)
- **Fiyat**: 2,500 TRY/ay
- **Özellikler**:
  - 5 aktif kampanya
  - 500 bağış/ay
  - Temel tema (Hicret veya Kardeşlik)
  - E-posta desteği
  - Temel raporlar
- **Hedef**: Yeni kurulan, küçük bütçeli dernekler

#### 2. Professional Plan (Orta Boy STK'lar)
- **Fiyat**: 6,500 TRY/ay
- **Özellikler**:
  - Sınırsız kampanya
  - 2,000 bağış/ay
  - Custom tema
  - Custom domain
  - SMS + E-posta
  - Gelişmiş raporlar
  - CRM özellikleri
  - Öncelikli destek
- **Hedef**: Orta ölçekli, kurumsal STK'lar

#### 3. Enterprise Plan (Büyük STK'lar)
- **Fiyat**: 15,000 TRY/ay (veya custom)
- **Özellikler**:
  - Professional'daki her şey +
  - Sınırsız bağış
  - Dedicated account manager
  - Custom entegrasyonlar
  - White-label option
  - SLA garantisi (99.95%)
  - Özel raporlama
- **Hedef**: Büyük vakıflar, uluslararası STK'lar

### İşlem Komisyonu (Transaction Fee)

**Alternatif Model**: Sabit abonelik yerine işlem başı komisyon

- %2.5 + 1 TRY per transaction
- Örnek: 1000 TRY bağış → 26 TRY komisyon
- Rekabetçi (pazar ortalaması %3-4)

### Hibrit Model (Önerilen)

**Düşük abonelik + düşük komisyon**:
- Starter: 1,500 TRY/ay + %1.5 işlem
- Professional: 4,000 TRY/ay + %1 işlem
- Enterprise: 10,000 TRY/ay + %0.5 işlem

**Avantaj**: Hem sabit gelir, hem scalable revenue

### Gelir Projeksiyonu (1. Yıl)

| Ay | STK Sayısı | Ort. Abonelik | Ort. İşlem Kom. | Toplam Gelir |
|----|-----------|---------------|-----------------|--------------|
| 1-2 | 2 | 13K | 5K | 18K TRY |
| 3-4 | 5 | 32.5K | 15K | 47.5K TRY |
| 5-6 | 10 | 65K | 35K | 100K TRY |
| 7-9 | 20 | 130K | 80K | 210K TRY |
| 10-12 | 35 | 227.5K | 150K | 377.5K TRY |
| **Toplam 1. Yıl** | | | | **~2.1M TRY** |

**Break-even**: 6. ay civarı

## 📅 Geliştirme Takvimi (Gantt Chart)

### Hafta 1-2: Setup & Infrastructure
- [ ] Proje yapısı oluştur (monorepo)
- [ ] PostgreSQL şema tasarımı
- [ ] FastAPI boilerplate
- [ ] Next.js boilerplate (tema temelleri)
- [ ] Docker Compose setup
- [ ] CI/CD pipeline (GitHub Actions)

### Hafta 3-4: Core Backend
- [ ] Multi-tenant middleware
- [ ] Authentication & Authorization
- [ ] Kampanya API (CRUD)
- [ ] Bağış API (create, list)
- [ ] VPOS entegrasyonu (Vakıf Katılım)
- [ ] Payment callback handling

### Hafta 5-6: Frontend (Hicret + Kardeşlik)
- [ ] Tema sistemi implementasyonu
- [ ] Homepage (kampanya listesi)
- [ ] Kampanya detay sayfası
- [ ] Bağış formu + 3D Secure akışı
- [ ] Teşekkür sayfası (makbuz indir)
- [ ] Responsive design (mobile-first)

### Hafta 7: Admin Panel
- [ ] Login/logout
- [ ] Dashboard (KPI'lar)
- [ ] Kampanya yönetimi (CRUD UI)
- [ ] Bağış listesi
- [ ] Temel raporlar (Excel export)

### Hafta 8: Testing & Launch
- [ ] End-to-end testing (Playwright)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Production deployment
- [ ] Domain setup (hicretdernegi.org, kardeslikpayi.org)
- [ ] Monitoring setup (Sentry, Grafana)
- [ ] **🚀 MVP LAUNCH**


## ✅ Kabul Kriterleri Özeti (Acceptance Criteria Summary)

### Kritik Fonksiyonlar (MVP'de mutlaka olmalı)

#### Bağış Süreci
- [x] Bağışçı kampanya seçebilir
- [x] Bağış formu 2 dakikadan kısa doldurulabilir
- [x] 3D Secure ödeme başarıyla tamamlanır
- [x] Ödeme sonrası makbuz otomatik oluşturulur
- [x] E-posta ile makbuz 30 saniye içinde gelir
- [x] Teşekkür sayfasında sosyal paylaşım butonları var

#### Multi-Tenant
- [x] Her STK kendi domain'i ile erişilebilir
- [x] Bir STK başka STK'nın verisini göremez
- [x] Her STK kendi teması ile görünür (renk, logo, font)
- [x] Subdomain 5 dakika içinde aktif olur

#### Admin Panel
- [x] STK admin'i login olabilir
- [x] Yeni kampanya 5 dakikadan kısa oluşturulabilir
- [x] Dashboard real-time istatistikler gösterir
- [x] Bağış listesi filtrelenebilir ve export edilebilir

#### Güvenlik
- [x] Kart bilgileri tokenize edilir (PCI-DSS)
- [x] SQL injection ve XSS koruması var
- [x] Rate limiting aktif (100 req/min)
- [x] HTTPS zorunlu (TLS 1.3)
- [x] Audit log tüm kritik işlemleri kaydeder

#### Performans
- [x] Homepage < 2 saniye yüklenir
- [x] API response time < 500ms (p95)
- [x] Ödeme işlemi < 60 saniye
- [x] 1000 eşzamanlı kullanıcı desteklenir

## 🔄 Migrasyon Stratejisi (Mevcut Sistemlerden)

### E-İnfak Backend → Yeni Backend

**Veri Migrasyonu**:
1. SQLite → PostgreSQL export
2. Schema mapping (mevcut tablolar uyumlu)
3. Data validation ve cleaning
4. Test environment'ta migrasyon testi
5. Production migrasyon (downtime: 2 saat)

**VPOS Konfigürasyonu**:
- Mevcut Vakıf Katılım credentials'ları yeni sisteme taşı
- Test modunda doğrulama
- Production anahtarları migration sonrası

### Hicret & Kardeşlik Frontend → Yeni Frontend

**Yaklaşım**: 
- Mevcut Next.js projelerini monorepo içine al
- Theme extraction: CSS → Tailwind config
- Component migration: Ortak component library'e taşı
- API entegrasyonu: Mock data yerine gerçek backend

**Aşamalar**:
1. Week 1: Repository setup (monorepo structure)
2. Week 2: Theme extraction ve standardization
3. Week 3: Component library oluşturma
4. Week 4: API entegrasyonu
5. Week 5: Testing ve production deployment

### Zero-Downtime Migration Plan

**STK Başına**:
1. Yeni sistemde test environment hazırla
2. Veri migrationı test et
3. UAT (User Acceptance Testing) - STK ile birlikte test
4. DNS değişikliği (old → new)
5. TTL sonrası eski sistem kapat
6. Monitoring (ilk 48 saat yoğun takip)

**Rollback Plan**:
- DNS değişikliğini geri al (5 dakika)
- Eski sistem hazır bekler (7 gün)


## 📞 Stakeholder İletişimi

### İlk Görüşme (Kickoff Meeting)

**Katılımcılar**:
- E-İnfak sahibi / Product Owner
- Hicret Derneği temsilcisi
- Kardeşlik Payı temsilcisi
- Geliştirme ekibi lead

**Ajanda**:
1. Proje vizyonu paylaşımı
2. Requirements dokümanı sunumu
3. MVP scope onayı
4. Timeline ve milestone'lar
5. İletişim kanalları (Slack, haftalık meeting)
6. Demo schedule (2 haftada 1)

### Haftalık Sprint Review

**Format**: 1 saatlik demo + Q&A
**Katılımcılar**: Tüm stakeholder'lar
**İçerik**:
- Bu sprint'te tamamlananlar (demo)
- Gelecek sprint planı
- Blocker'lar ve riskler
- Feedback toplama

### Go-Live Checklist

**2 Hafta Öncesi**:
- [ ] UAT tamamlandı
- [ ] Tüm kritik bug'lar fixlendi
- [ ] Performance testing passed
- [ ] Security audit yapıldı
- [ ] Backup plan hazır
- [ ] Rollback plan test edildi

**1 Hafta Öncesi**:
- [ ] Production server hazır
- [ ] SSL sertifikaları kuruldu
- [ ] Monitoring ve alerting aktif
- [ ] Support ekibi eğitildi
- [ ] Documentation tamamlandı

**Launch Day**:
- [ ] DNS değişiklikleri yapıldı
- [ ] Migration script çalıştırıldı
- [ ] Smoke test passed
- [ ] Stakeholder'lara bildirim
- [ ] Social media announcement

**Launch Sonrası**:
- [ ] 24/7 monitoring (ilk 48 saat)
- [ ] Hotfix readiness
- [ ] User feedback collection
- [ ] Post-launch retrospective (1 hafta sonra)

## 🎉 Sonuç ve Bir Sonraki Adımlar

### Requirements Dokümanı Tamamlandı ✅

Bu doküman, E-İnfak 2.0 Multi-Tenant Bağış Otomasyon Platformu'nun kapsamlı gereksinimlerini içermektedir. 

**Kapsanan Konular**:
✅ 11 ana fonksiyonel gereksinim kategorisi (FR-1 to FR-11)
✅ 6 non-fonksiyonel gereksinim kategorisi (NFR-1 to NFR-6)
✅ Teknik stack ve mimari kararlar
✅ Güvenlik ve compliance gereksinimleri
✅ Maliyet ve gelir projeksiyonları
✅ Geliştirme takvimi (8 hafta MVP)
✅ Risk analizi ve azaltma stratejileri
✅ Başarı kriterleri ve KPI'lar

### Bir Sonraki Adımlar

#### 1. Onay Süreci (1 hafta)
- [ ] Bu dokümanı stakeholder'larla paylaş
- [ ] Review meeting düzenle
- [ ] Feedback topla ve revize et
- [ ] Final approval al

#### 2. Design Phase'e Geçiş
- [ ] High-Level Design dokümanı oluştur
- [ ] Database schema detaylandır
- [ ] API endpoints tanımla (OpenAPI)
- [ ] UI/UX mockup'lar hazırla (Figma)
- [ ] Architecture diagrams çiz (C4 Model)

#### 3. MVP Geliştirme Başlangıcı
- [ ] Geliştirme ekibini kur
- [ ] Sprint 0: Setup ve infrastructure
- [ ] Sprint 1-4: Core features
- [ ] Sprint 5-6: Testing ve launch prep
- [ ] Sprint 7: GO LIVE 🚀

### Sorular veya Değişiklikler?

Bu requirements dokümanı "living document" olarak güncellenebilir. Herhangi bir soru, öneri veya değişiklik talebi için:

- **Slack**: #e-infak-v2-requirements
- **E-posta**: product@e-infak.org
- **GitHub Issues**: Repository'de issue açılabilir

---

**Doküman Versiyonu**: 1.0  
**Son Güncelleme**: 2026-07-11  
**Durum**: ✅ Requirements Tamamlandı - Onay Bekliyor  
**Hazırlayan**: Kiro AI Agent  
**Onaylayan**: TBD

