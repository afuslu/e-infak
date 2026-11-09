# E-İnfak sunucu rehberi

E-İnfak, E-Medrese ile aynı sunucuda (`31.97.159.228`, `emedrese-prod`) **Docker** ile, ondan tamamen ayrı çalışır:

| | E-Medrese | E-İnfak |
|---|---|---|
| Klasör | `/opt/e_medrese` | `/opt/e_infak` |
| Docker projesi | `emedrese` | `einfak` |
| Veritabanı / Redis | kendi kapları | ayrı kendi kapları |
| İç portlar | 8081 | site 3092, API 8092 |
| nginx dosyası | `e-medrese.org` | `e-infak.conf` (sabit adlar), `zz-e-infak-otomatik.conf` (otomatik SSL) |

## Klasör düzeni (`/opt/e_infak`)

- `.env` — gizli ayarlar (veritabanı şifresi, anahtarlar). Kimseyle paylaşmayın.
- `kaynak.git` — kod deposu; Mac'ten `git push sunucu main` ile gelir.
- `dagit.sh` — yayın betiği.
- `releases/` — son 3 sürümün kodu.
- `backups/` — her yayından önce alınan veritabanı yedekleri (son 14).
- `dagitim-gunlukleri/` — yayın kayıtları.
- `sertifikalar/` — kurum alt alan adları ve özel alan adlarının SSL sertifikaları (certs kabı yazar, nginx okur).
- `nginx-kur.sh`, `nginx-otomatik-ssl.sh` — sudo ile çalıştırılan nginx betikleri (her yayında güncellenir).
- `yonetici-sifreleri.txt` — ilk kurulumda üretilen yönetici şifreleri (okuyup not edin, sonra silin).

## Yeni sürüm yayınlama

Mac'te:

```bash
cd ~/Desktop/Projelerim/e-infak && git push sunucu main && git push origin main
```

Sonra yayın (commit numarasını yeni commit ile değiştirin; `git rev-parse HEAD` verir):

```bash
ssh -t afuslu@31.97.159.228 "/opt/e_infak/dagit.sh $(git rev-parse HEAD)"
```

Betik sırasıyla:
1. Kodu çıkarır ve imajları derler. Bu adımda hata olursa canlı site değişmez.
2. Veritabanı yedeği alır.
3. Migration'ları uygular.
4. Yeni kapları başlatır ve sağlık kontrolü yapar. Kontrol başarısızsa önceki sürüme döner.

## Yalnızca sunucu sahibinin yapabileceği işler

**1. DNS (alan adı paneli):** Şu kayıtların A kaydı `31.97.159.228` olmalı:
`hicretdernegi.org`, `www.hicretdernegi.org`, `kardeslikpayi.org`, `www.kardeslikpayi.org`, `e-infak.org`, `www.e-infak.org`.

**2. nginx + SSL (sudo şifresi ister; DNS değiştikten sonra bir kez):**

```bash
ssh -t afuslu@31.97.159.228 "sudo bash /opt/e_infak/releases/\$(cat /opt/e_infak/runtime/aktif-surum)/deploy/docker/nginx-kur.sh"
```

Betik yalnızca e-infak alan adları için yeni bir nginx dosyası ekler; E-Medrese'ye dokunmaz. Ayar testi başarısız olursa kendi dosyasını geri çeker. SSL sertifikasını yalnızca DNS'i bu sunucuyu gösteren alan adları için alır; certbot e-posta adresinizi ve Let's Encrypt koşullarını sorar. DNS'i sonradan değişen alan adları için betiği tekrar çalıştırın.

**3. Otomatik SSL (sudo şifresi ister; yalnızca BİR KEZ):**

Bu adımdan sonra platformda açılan her kurum (`kurumadi.e-infak.org`) ve kurumların doğruladığı her özel alan adı (`kurumadi.org`) sertifikasını kendiliğinden alır; bir daha sudo, certbot veya nginx reload gerekmez. Önce bu özelliği içeren sürümü `dagit.sh` ile yayınlayın, sonra:

```bash
ssh -t afuslu@31.97.159.228 "sudo bash /opt/e_infak/nginx-otomatik-ssl.sh"
```

Betik şunları yapar:
1. `/opt/e_infak/sertifikalar` klasörünü nginx kullanıcısına (`www-data`) ait olarak açar; `/opt/e_infak`'a yalnızca geçiş izni (`o+x`) verir.
2. `.env`'e `CERTS_UID`, `CERTS_GID` ve (boşsa) `PLATFORM_PUBLIC_IP` yazar.
3. `/etc/nginx/sites-enabled/zz-e-infak-otomatik.conf` dosyasını ekler: başka hiçbir sitenin adını açıkça yazmadığı adlar (`*.e-infak.org` ve kurumların alan adları) bu dosyaya düşer; sertifika her TLS el sıkışmasında `sertifikalar/` altından okunur.
4. `nginx -t` başarısız olursa kendi dosyasını geri alır; başarılıysa `systemctl reload nginx` yapar.
5. Sonunda doğrulama yolunun certs kabına ulaştığını sınar ("✅ Doğrulama yolu …" satırı).

**E-Medrese'ye etkisi:** Hiçbir dosyasına ve `listen` satırına dokunulmaz; E-Medrese'nin adları her zaman kendi sunucu bloğunda kalır (nginx tam adları ve joker adları önce dener) ve `/etc/letsencrypt` içinde sertifikası olan her ad ayrıca hariç tutulur. Tek fark: **hiçbir sitenin tanımadığı** bir adla gelen istekler (ör. DNS'i yanlışlıkla bu sunucuya yönlendirilmiş rastgele bir alan adı) artık E-Medrese'nin varsayılan sitesine değil E-İnfak'a düşer ve orada "bulunamadı" alır. IP ile veya SNI'sız gelen istekler eskisi gibi E-Medrese'ye gider. İleride E-Medrese'ye yalnızca `default_server` ile karşılanan yeni bir alan adı eklenirse betiği tekrar çalıştırın (tekrar çalıştırmak güvenlidir).

### Nasıl çalışır (özet)

- `certs` kabı (Caddy, `deploy/docker/Caddyfile`) sertifika alır ama ziyaretçi trafiği taşımaz. TLS portu dışarı açık değildir; yalnızca worker bir el sıkışmasıyla "bu ad için sertifika al" der. Caddy her seferinde backend'e `/api/v1/internal/tls-allowed` ile sorar; yalnızca **etkin kurumların alt alan adları** ve **etkin özel alan adları (+www)** onay alır.
- Let's Encrypt doğrulaması HTTP-01 ile yapılır: `http://<ad>/.well-known/acme-challenge/…` → host nginx → `127.0.0.1:8480` (certs kabı).
- Sertifika hazır olunca nginx http isteklerini https'e yönlendirmeye başlar. Yenileme: worker her gün (ve her yayında) bütün adlar için el sıkışması yapar, Caddy süresi dolmak üzere olanları yeniler.
- Sabit adlar (`e-infak.org`, `hicretdernegi.org`, `kardeslikpayi.org` ve `www`'leri) eskisi gibi certbot sertifikasıyla `e-infak.conf`'ta kalır.

## Kurum alan adı ekleme (uçtan uca)

1. Kurum yöneticisi panelde **Site Ayarları → Alan Adları**'na (ya da platform yöneticisi konsolda kurum sayfasındaki **Alan adları** kartına) `kurumadi.org` yazıp **Ekle**'ye basar. Alan adı "Doğrulama bekliyor" durumunda açılır.
2. Ekranda çıkan üç kaydı kurum, alan adını aldığı firmanın DNS paneline girer:

   | Tür | Ad | Değer |
   |---|---|---|
   | A | `@` | `31.97.159.228` |
   | A | `www` | `31.97.159.228` |
   | TXT | `_einfak-verify` | ekranda gösterilen doğrulama kodu |

3. **Doğrula**'ya basılır; ya da sistem bekleyen alan adlarını 5 dakikada bir kendisi kontrol eder (14 gün boyunca). DNS, Cloudflare ve Google'ın DNS-over-HTTPS servislerinden okunur. TXT kodu eşleşir ve `@` A kaydı sunucuyu gösterirse alan adı **etkin** olur, kurumun ana adresi yapılır; eşleşmezse sebep ekranda "Son kontrol" satırında görünür.
4. Etkinleşir etkinleşmez worker sertifikayı ister; genellikle bir dakika içinde `https://kurumadi.org` açılır. `www` yalnızca A kaydı sunucuyu gösteriyorsa sertifika alır.
5. Platform yöneticisi TXT kaydı girilemeyen durumlarda konsoldaki **Elle etkinleştir** ile doğrulamayı atlayabilir (A kaydını kendisi kontrol etmelidir).

Yeni kurum açıldığında `kurumadi.e-infak.org` için de sertifika aynı şekilde kendiliğinden alınır (DNS'teki `*.e-infak.org` joker kaydı sayesinde ek bir işlem gerekmez).

**Kontrol:**

```bash
ssh afuslu@31.97.159.228 'ls /opt/e_infak/sertifikalar/certificates/acme-v02.api.letsencrypt.org-directory/'
```

```bash
ssh afuslu@31.97.159.228 'docker logs --tail 50 einfak-certs-1'
```

Not: Let's Encrypt aynı ad için saatte 5 başarısız doğrulamaya izin verir; bu yüzden worker yalnızca DNS'i sunucuyu gösteren adlar için sertifika ister.

## Yönetici girişi

- Hicret: https://hicretdernegi.org/giris
- Kardeşlik: https://kardeslikpayi.org/giris

İlk şifreler sunucuda:

```bash
ssh afuslu@31.97.159.228 cat /opt/e_infak/yonetici-sifreleri.txt
```

İlk girişte şifreleri değiştirin, sonra dosyayı silin:

```bash
ssh afuslu@31.97.159.228 rm /opt/e_infak/yonetici-sifreleri.txt
```

## Platform konsolu (e-infak.org/platform)

Bütün kurumları yöneten süper yönetici paneli: kurum açma, paket değiştirme, askıya alma, alan adı, ödeme/SMS hesapları, destek girişi ve işlem kayıtları.

- Giriş: https://e-infak.org/platform/giris — e-posta `admin@e-infak.org`
- İlk şifre: `ssh afuslu@31.97.159.228 cat /opt/e_infak/platform-yonetici.txt` (girişten sonra sağ üstteki e-postanıza tıklayıp değiştirin, ardından dosyayı silin)
- Şifre unutulursa yenisi: `ssh afuslu@31.97.159.228 "docker exec einfak-backend-1 python -m app.cli create-platform-admin --email admin@e-infak.org"`

## Şifreleme anahtarının yedeği (önemli)

Kurumların panele girdiği ödeme/SMS şifreleri `CREDENTIALS_ENCRYPTION_KEY` ile şifrelenir. Anahtar kaybolursa o şifreler okunamaz. Anahtarı bir kez şifre yöneticinize kaydedin:

```bash
ssh afuslu@31.97.159.228 grep CREDENTIALS_ENCRYPTION_KEY /opt/e_infak/.env
```

## Sorun olursa

```bash
ssh afuslu@31.97.159.228 'docker ps --filter label=com.docker.compose.project=einfak'
```

```bash
ssh afuslu@31.97.159.228 'docker logs --tail 50 einfak-backend-1'
```

Son yayın kaydı: `/opt/e_infak/dagitim-gunlukleri/` içindeki en yeni dosya.
