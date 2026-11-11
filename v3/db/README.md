# V3 otomasyon çekirdeği

## Sınırlı uygulama grup rolleri (006)

006 iki NOLOGIN grup rolü oluşturur. Kimlik rolü parola özetini okuyabilir, oturum/limit işlemlerini yapabilir; personel kaydı veya bağış değiştiremez. Veri rolü yalnız bağış/sipariş tablolarını okuyabilir, parola tablosuna erişemez. Membership politikaları role göre ayrılır. Ayrı LOGIN hesapları güvenli kurulumda oluşturulmalı ve her birine yalnız ilgili grup atanmalıdır; bir üretim hesabına iki grubu birden vermeyin. Bu migration mevcut aynı adlı rollerde hata vererek durur.

Geçici PostgreSQL'de verify_roles.sql, verify_sessions.sql ve HTTP işleyicili Node entegrasyonu geçti. Node test rolü fixture kolaylığı için iki gruba da üyedir; bu, üretimde ayrı havuz/rol doğrulaması değildir. Giriş yapabilen gerçek hesap veya parola oluşturulmadı. verify_sessions.sql ve verify-node-session.mjs artık 006 migration'ını gerektirir.

## HTTPS panel arayüzü bağlantısı

`panel-ui.mjs` ve `panel-client.mjs`, yapılandırılmış panel sunucusunda `/giris`, `/panel`, `/api/session` ve statik arayüz dosyalarını sunar. Oturumsuz panel ziyareti girişe yönlendirilir; doğrulanmış üyeliklerle kurum seçimi, 25 kayıtlık sayfalama ve çıkış API'ye bağlıdır. SQL yanıtlarından gelen metinler textContent ile oluşturulur, token tarayıcı depolamasına yazılmaz. Port 3100 tasarım önizlemesinin kapalı giriş ekranı değiştirilmedi.

Bu akış henüz HTTPS sunucusu + gerçek kullanıcı + tarayıcı birleşiminde test edilmedi. Sertifika, uygulama rolleri ve personel hesabı kurulumu tamamlanmadan çalışır panel olarak değerlendirmeyin. SMS/ödeme/iade işlemleri bu panelde yoktur.

## Güncel sürücü entegrasyonu

pg 8.23.0 kuruldu ve package-lock.json oluşturuldu. `verify-node-session.mjs` ayrı geçici PostgreSQL'de gerçek pg Client ile çalıştırıldı: superuser olmayan test rolü altında oturum ekleme, personel çözümleme ve iptal geçti. Fixture ve rol rollback ile kaldırıldı. Test dış transaction'ı korumak için repository transaction'larını savepoint'e çevirir; pool yeniden kullanımını, HTTP/TLS girişini veya eşzamanlı işlemleri kanıtlamaz. 45 birim testi de geçti. Yerel Node 20 sürüm uyarısı devam ediyor; hedef Node 22+. Önceki notlardaki sürücü kurulum engeli artık kalktı.

## HTTPS API başlangıç dosyası

`node v3/panel-server.mjs`, `runtime-config.mjs` ile doğrulanan ayrı kimlik/veri bağlantıları ve TLS dosyalarıyla yalnız 127.0.0.1 üzerinde API açmak üzere hazırlandı. Ortam anahtarları: V3_AUTH_DATABASE_URL, V3_DATA_DATABASE_URL, V3_PANEL_ORIGIN, V3_LIMITER_SECRET, V3_TLS_KEY_PATH, V3_TLS_CERT_PATH; isteğe bağlı V3_PANEL_PORT (3443). Sertifika doğrulamasını kapatmayın. Bu sunucu henüz giriş arayüzünü sunmaz.

pg sürücüsü kurulum isteği araç sınırı nedeniyle engellendi; bağımlılık henüz eklenmedi. Gerçek havuzla başlangıç, TLS bağlantısı ve E2E testi yapılmadı. 45 birim testi geçti; bu sayı çalışan panel anlamına gelmez. Önizleme giriş ekranı hâlâ kapalıdır.

## Yönetim bağış API adaptörü

`admin-http.mjs`, GET `/api/admin/donations?organizationId=UUID&limit=25&offset=0` için cookie doğrulama, origin/host kontrolü, sayfalama ve güvenli hata yanıtları sağlar. `application.mjs` üzerinden oturum ve kurum yetkisi zincirine bağlıdır. Duplicate cookie/query değerleri reddedilir. Dönen kuruş tutarları string kalır. Bu adaptör henüz dinleyen sunucuya bağlanmadı; testler sahte HTTP yanıtları kullanır. Yönetim arayüzü veya canlı API hizmeti olarak değerlendirmeyin.

## Uygulama birleştirme noktası

`application.mjs` iki ayrı PostgreSQL pool alarak oturum repository'si, giriş servisi, limiter, HTTP auth adaptörü ve bağış repository'sini bağlar. Açılışta superuser, BYPASSRLS veya tablo sahibi rollerini reddeder; kimlik/veri rollerinin farklı olmasını zorunlu kılar. Bu kontrol minimum yetki denetiminin tamamı değildir; deployment rolleri için açık GRANT listeleri ayrıca gerekir. Bağış listesi yalnız token çözümlemesinden gelen principal ile çağrılır.

40 birim testi geçti. Henüz pool oluşturan deployment giriş noktası, PostgreSQL Node sürücüsü, rol kurulum migration'ı ve gerçek giriş/panel E2E bağlantısı yoktur. Preview sunucusu değişmedi; kullanıcı girişi açılmadı.

## Güncel doğrulama — 20 Eylül 2026

Aşağıdaki geliştirme notlarında geçen önceki PostgreSQL engeli kalktı. Ayrı geçici kümede 002–004 migration'ları uygulandı; `verify_sessions.sql`, `verify_isolation.sql` ve `verify_limits.sql` başarıyla çalıştı. Node testleri 38/38 geçti. Gerçek pool ile Node entegrasyonu, eşzamanlı limit testi ve çalışan giriş/panel E2E testi henüz tamamlanmadı.

## HTTP giriş/çıkış adaptörü

`auth-http.mjs` sabit HTTPS origin/host kontrolü, yalnız POST, 4 KB JSON sınırı, HttpOnly oturum çerezi ve sunucuda çıkış iptalini sağlar. Forwarded IP başlıklarını kullanmaz; reverse proxy kurulursa güvenilir IP çözümü ayrıca uygulanmalıdır. Hata yanıtları dahili hata metinlerini içermez. Preview sunucusuna bağlanmadı: gerçek havuz, limiter ve migration doğrulaması beklenmektedir. Testler bellek içi HTTP akışlarıyla çalışır; gerçek ağ/HTTPS E2E testi değildir. Üretim sunucusunda body okuma timeout ve bağlantı limitleri de tanımlanmalıdır.

## PostgreSQL giriş limitleri

`login-limiter.mjs` ve `004_login_limits.sql` IP ve hesap sayaçlarını tek transaction'da günceller. Varsayılan sınırlar 15 dakikada IP başına 30, hesap başına 10 denemedir. Anahtarlar en az 32 bayt sunucu sırrıyla HMAC üzerinden saklanır. IPv4-mapped IPv6 adresleri aynı IPv4 kovasına eşlenir. Reddedilen denemeler de sayılır; veritabanı arızası girişe izin vermez.

34 Node testi geçti. Limiter testleri sahte pool kullanır; gerçek PostgreSQL eşzamanlılık testi ve migration uygulaması henüz yapılmadı. HTTP girişine bağlı değildir. Üretim öncesi süre aşımı geçmiş sayaçlar için düzenli temizlik, bağlantı/statement timeout, güvenilir proxy IP çözümü ve IPv6 ağ bazlı kötüye kullanım politikası gereklidir. Limiter sırrı tüm uygulama kopyalarında aynı olmalı, kaynak koda yazılmamalıdır.

## Personel giriş servisi

`login-service.mjs` e-posta normalizasyonu, zorunlu limiter çağrısı, parametreli hesap sorgusu, parola doğrulaması ve oturum oluşturmayı birleştirir. Bilinmeyen/pasif hesaplar aynı 401 mesajıyla reddedilir; bilinmeyen hesapta da scrypt çalıştırılır. Limiter yoksa servis kurulmaz, limiter arızasında giriş yapılmaz. Limiter'ın gerçek paylaşımlı depolama uygulaması henüz yoktur. HTTP route, CSRF/origin kontrolü, gerçek havuz, kullanıcı oluşturma ve giriş ekranı henüz bağlanmadı. 30 Node testi geçti; bu bir canlı giriş E2E testi değildir.

## Oturum veritabanı doğrulaması

`verify_sessions.sql`, 001–003 migration'ları uygulanmış ayrı test veritabanı içindir. Kendi üyelikleriyle sınırlı SELECT, pasif kurumların filtrelenmesi, benzersiz oturum özeti, geçersiz özetin reddi ve iptal kaydını denetler. Geçici rol ve kayıtlar transaction sonunda geri alınır. Bu dosya eklendi fakat PostgreSQL başlatma isteği araç kullanım sınırı nedeniyle reddedildiği için henüz çalıştırılmadı. Gerçek veritabanı doğrulaması açık iştir.

## Kalıcı oturum adaptörü

`../session-repository.mjs` oturum ekleme/arama/iptal ve güncel personel üyeliklerini okuma için parametreli PostgreSQL sorguları sağlar. `003_identity_policy.sql`, personelin kendi üyeliklerini okuyabilmesine yönelik SELECT politikasıdır. Transaction-local personel kimliği yalnız güvenilir kimlik servisi tarafından, saklanan oturumdan atanmalıdır. Genel web rotaları bu kimlik bağlantı havuzuna erişmemelidir. Ortak superuser havuzu kullanmayın.

Pasif üyelikler ve pasif kurumlar principal içinden çıkarılır. Hata durumunda transaction geri alınır. Bu kesitte 26 Node testi geçti; yeni adaptör testlerinde sahte pool kullanıldı. `002_sessions.sql` ve `003_identity_policy.sql` gerçek PostgreSQL üzerinde henüz birlikte doğrulanmadı. Bağlantı sürücüsü/havuzu ve HTTP giriş akışı henüz kurulmadığından kullanıcılar giriş yapamaz. Bu dosyalar üretime hazır kimlik sistemi değildir.

## Bağış listeleme adaptörü

`../donation-repository.mjs` PostgreSQL pool arabirimi alır. Doğrulanmış sunucu oturumu ve kurum yetkisi gerektirir; yetki reddinde bağlantı açmaz. Salt okunur transaction içinde kurum bağlamını yerel olarak ayarlar, sorguyu parametreli çalıştırır ve hata halinde geri alır. Geri alma başarısızsa bağlantıyı havuzdan çıkarır. Liste bağışçı adı veya telefonu içermez; tutarlar kuruş cinsinden string olarak korunur.

Bu adaptör henüz HTTP endpoint'ine veya gerçek bağlantı havuzuna bağlanmadı. Testler sahte pool ile sorgu/transaction sözleşmesini kontrol eder; gerçek PostgreSQL entegrasyon testinin yerine geçmez. Yanlışlıkla geri alınan `auth.mjs`, oturum testleri ve `002_sessions.sql` kullanıcı onayıyla geri getirildi; 23 Node testi geçti. Oturum migration'ı bu geri yükleme sırasında PostgreSQL'e uygulanmadı. Oturum servisi henüz kalıcı repository veya HTTP giriş endpoint'ine bağlı değildir.

`001_core.sql` yalnız ayrı, boş V3 PostgreSQL veritabanına uygulanır. Eski veritabanına uygulanmaz. Bu bir başlangıç şemasıdır; web sunucusu henüz bağlanmamıştır.

```sh
psql "$V3_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f v3/db/001_core.sql
psql "$V3_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f v3/db/verify_isolation.sql
```

Test dosyası geçici NOLOGIN rolü ve örnek kayıtlar oluşturur; tamamını transaction sonunda geri alır. Yalnız ayrı test veritabanında çalıştırılmalıdır.

## Güven sınırı

- Personel kimliği doğrulanmış sunucu oturumundan gelmeli. `access.mjs` rol kontrolü oturum doğrulaması yerine geçmez.
- Sunucu üyeliği doğruladıktan sonra her transaction için `SET LOCAL einfak.organization_id` ayarlanır. İstemci başlığı doğrudan bu değere aktarılmaz.
- Web bağlantısı migration sahibi, superuser veya BYPASSRLS rolü olamaz. Tablolar için en az yetkili ayrı roller sonraki entegrasyonda atanmalıdır.
- Kuruma bağlı yabancı anahtarlar yanlış kurumun bağışçı/kampanya kaydına bağlanmayı engeller.
- Sipariş anahtarı, ödeme olay kimliği, bağış kalemi ve SMS tekrar anahtarı benzersizdir.

## Henüz uygulanmayanlar

Oturum yönetimi, parola/OTP akışları, API bağlantısı, sipariş toplam doğrulaması ve kalem değişmezliği, ödeme imzası ve atomik kesinleştirme, iadeler, makbuz üretimi, audit kayıtları ve SMS worker henüz yoktur. `payment_events.verified_at` tek başına banka doğrulaması değildir; yalnız güvenilir ödeme adaptörü bu tabloya yazabilmelidir. SMS tablosu mesaj göndermez; izin kontrolü ve tekrar deneme/belirsiz yanıt politikaları servis katmanında uygulanacaktır. Henüz üretim migration'ı olarak kullanmayın.
