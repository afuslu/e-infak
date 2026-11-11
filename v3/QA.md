# V3 doğrulama kaydı — 19 Eylül 2026

## 21 Eylül — HTTP işleyicileri ve gerçek veritabanı

`verify-node-session.mjs` artık authHttp/adminHttp işleyicilerini de gerçek PostgreSQL ile sınar. Girişte Secure/HttpOnly çerez, çerezle 12345 kuruşluk bağış kaydı, diğer kurum için 403, çıkış ve eski çerezle 401 doğrulandı. Testler Readable istek/yanıt benzetimi kullanır; ağ dinleyicisi, sertifika veya tarayıcı çalıştırılmaz. Bu yüzden HTTPS tarayıcı E2E hâlâ açık iştir. 47 birim testi de geçti; tüm fixture kayıtları geri alındı.

## 21 Eylül — bağış/sipariş bütünlüğü

005 migration'ı geçici PostgreSQL'e uygulandı. Aynı kurumun başka siparişine ait ödeme olayını mevcut bağışa bağlama girişimi foreign_key_violation (23503) ile reddedildi. Giriş/bağış listeleme entegrasyonu ve 47 birim testi geçti. Eski/canlı veritabanına dokunulmadı. Yeni bağış INSERT işlemleri artık order_id gerektirir. Bu kısıt banka imzası, tutar doğrulaması veya iade muhasebesi yerine geçmez.

## 21 Eylül — birleşik giriş ve bağış repository testi

Gerçek pg sürücüsü ve geçici PostgreSQL üzerinde yanlış parola reddi, doğru parolayla giriş, gerçek limiter sorguları, üyelik çözümleme, 12345 kuruşluk sentetik bağışın listelenmesi, boş ikinci sayfa, diğer kurumun reddi ve oturum iptali geçti. Test verileri/rol dış transaction ile geri alındı. 47 birim testi de geçti. Sentetik ödeme olayı bankadan gelmedi; bu ödeme entegrasyonu veya HTTPS/tarayıcı E2E testi değildir. Gerçek pool bağlantılarıyla ayrı kimlik/veri rolü kurulumu ve TLS üzerinden arayüz doğrulaması hâlâ açık iştir.

## 20 Eylül 2026 — gerçek PostgreSQL doğrulaması

Önceki yetkilendirme engeli kalktı. Yalnız görev için ayrılmış geçici PostgreSQL kümesinde eksik 002, 003 ve 004 migration'ları başarıyla uygulandı. `verify_sessions.sql`, `verify_isolation.sql` ve yeni `verify_limits.sql` geçti. Personel üyelik ayrımı, pasif kurum filtresi, oturum özeti doğrulaması/benzersizliği, iptal kaydı, kurum ayrımı, sipariş tekrar anahtarı ve limit sayaçlarının artış/süre dolumu doğrulandı. Test kayıtları ve test rolleri rollback ile kaldırıldı. 38 Node testi de geçti.

Bu sonuç Node adaptörünün gerçek pool bağlantısı, eşzamanlı limit yük testi veya tarayıcıdan giriş E2E testi değildir. Bu bağlantılar hâlâ bekliyor; gerçek kullanıcı/ödeme veritabanına dokunulmadı.

## Geri alınan oturum dosyalarının geri yüklenmesi

Kullanıcı onayıyla `auth.mjs`, `tests/auth.test.mjs` ve `db/002_sessions.sql` önceki içerikleriyle geri getirildi. Mevcut bağış repository'si ve site dosyaları korundu. 23 Node testi, auth sözdizimi kontrolü ve diff boşluk kontrolü geçti. Migration bu işlemde veritabanına uygulanmadı; canlı oturum veya panel entegrasyonu iddiası yoktur.

## Otomasyon çekirdeği başlangıcı

- 16 Node testi geçti; aktif kurum üyeliği ve rol bazlı izin kontrolleri eklendi.
- Ayrı geçici PostgreSQL kümesine `db/001_core.sql` başarıyla uygulandı.
- Superuser olmayan test rolüyle bağlam yokken sıfır kayıt, yalnız kendi kurumunun kayıtları, diğer kuruma yazmanın reddi, diğer kurum bağışçısına sipariş bağlamanın reddi ve yinelenen sipariş anahtarının reddi doğrulandı.
- Test verileri ve geçici rol transaction ile geri alındı; gerçek proje veritabanına dokunulmadı.
- Bu kontroller kullanıcı girişi, ödeme veya SMS entegrasyon testi değildir. Web önizlemesi veritabanına henüz bağlanmadı.

## Bu kesitte doğrulandı

- `node --test v3/tests/*.test.mjs`: 12 test geçti.
- `node --check v3/client.mjs`: sözdizimi kontrolü geçti.
- Tarayıcı: Hicret kitap projesi sepete eklendi; 250 TL tutarı 123,45 TL olarak güncellendi, toplam doğru değişti.
- Aynı tarayıcıda Kardeşlik sepeti boş kaldı; Hicret sepeti diğer kurumun önizlemesinde görünmedi. Bu kontrol backend yetkilendirme testi değildir.
- 390 × 844 görünümde iki kurum ana sayfası incelendi; Kardeşlik mobil menü satır taşması düzeltildi.
- Kardeşlik masaüstü ana sayfası görsel olarak incelendi.
- Bozuk JSON sepet kaydı ve geçersiz tutar düzenlemesi için otomatik regresyon testleri eklendi.

## İDDEF referanslı tasarım güncellemesi

- Referans: https://www.iddef.org/ — ana sayfa tarayıcıda incelendi. Kampanya vitrini, hızlı bağış şeridi, faaliyet kategorileri ve haber alanı örnek alındı; kuruma ait metin, fotoğraf, istatistik veya SMS bilgisi kopyalanmadı.
- İki kurumda ortak bağış odaklı bölüm sırası; Hicret yeşil-altın ve sınıf fotoğrafı, Kardeşlik bordo-krem ve özgün SVG illüstrasyon.
- Ana sayfadan talebe projesine 345,67 TL deneme desteği sepete eklendi; mevcut 123,45 TL ile toplam 469,12 TL doğrulandı.
- Kardeşlik masaüstü ve 390 × 844 mobil yerleşimi görsel olarak doğrulandı.
- Kuruma özel hızlı destek seçenekleri testiyle otomatik test sayısı 13 oldu.

## Devam eden yayın engelleri

### İHH referanslı devam çalışması

İHH ana sayfasındaki destek kalemi seçimi ve farklı boyutlu içerik bölümleri örnek alınarak üç bağımsız tutar/sepet formu, eğitim veya su odaklı büyük keşif kartı, gönüllülük ve şeffaflık kartları eklendi. Kurumlar için farklı destek seçenekleri kullanıldı. Birden fazla formun aynı sayfada çalışması için olay bağlama tüm formlara genişletildi. Son değişiklikler otomatik testlerle kontrol edildi; bu kesitte tarayıcı görsel doğrulaması yapılmadı. Referansın fotoğrafları veya yararlanıcı hikâyeleri kopyalanmadı.

Gerçek ödeme, banka imza doğrulaması, kalıcı sipariş/bağış kayıtları, personel oturumları, yönetim paneli ve sunucu tarafında kurum yetkilendirmesi henüz uygulanmadı. Resmi belgeler, banka hesapları ve iletişim bilgileri kurum tarafından sağlanmalı. Lighthouse puanı, gerçek cihaz testi, sandbox ödeme E2E ve canlı DNS/TLS kontrolü bu kesitte yapılmadı. Önizleme canlı bağış kabul etmeye hazır değildir.
