# E-İnfak'ı sunucuya kurma rehberi

Sunucu: `89.252.152.183` (aynı sunucuda mostilac.com da çalışıyor; bu kurulum ona dokunmaz).
Alan adları (`hicretdernegi.org`, `kardeslikpayi.org`, `e-infak.org` ve `www` sürümleri) zaten bu sunucuyu gösteriyor.

Toplam süre: yaklaşık 30–45 dakika. Komutları sırayla kopyalayıp yapıştırın.

---

## 1. Kodu GitHub'a gönderin (kendi bilgisayarınızda)

Proje klasöründe terminal açın:

```bash
cd ~/Desktop/Projelerim/e-infak
git push origin main
```

GitHub kullanıcı adı ve şifre (token) sorarsa girin. GitHub Desktop kullanıyorsanız "Push origin" düğmesine basmanız yeterli.

## 2. Sunucuya bağlanın

```bash
ssh root@89.252.152.183
```

Bundan sonraki bütün komutlar **sunucuda** çalışır.

## 3. Kurulum betiğini çalıştırın (tek seferlik)

```bash
curl -fsSLo /root/einfak-setup.sh https://raw.githubusercontent.com/afuslu/e-infak/main/deploy/server-setup.sh
sudo bash /root/einfak-setup.sh
```

Betik şunları yapar:
- Gerekli programları kurar (Python, Node.js, PostgreSQL, Redis, nginx, SSL aracı).
- Kodu `/var/www/e-infak` klasörüne indirir.
- Veritabanını oluşturur.
- Bütün şifreleri kendisi üretir ve ekrana yazmadan ayar dosyalarına koyar.
- nginx'e yalnızca e-infak alan adları için yeni bir ayar ekler.
- SSL sertifikası alır. Bu adımda sizden **bir e-posta adresi** ister; sertifika süresi dolmadan uyarı göndermek için kullanılır.

Betik bir port başka bir program tarafından kullanılıyorsa hiçbir şeye dokunmadan durur. Bu durumda bana haber verin.

## 4. İlk yayın

```bash
cd /var/www/e-infak
sudo env "PATH=$PATH" bash deploy.sh
```

Derleme 5–10 dakika sürer. Sonunda betik **"CANLIYA aktarmak istiyor musunuz? [E/h]"** diye sorar; `E` yazıp Enter'a basın.

## 5. Kurumları oluşturun (tek seferlik)

```bash
cd /var/www/e-infak/backend-active && venv/bin/python -m app.cli bootstrap-sites
```

Bu komut Hicret Derneği ve Kardeşlik Payı'nı kendi tasarımlarıyla oluşturur. Ekrana her kurum için bir **yönetici e-postası ve geçici şifre** yazar. **Bu şifreleri hemen bir yere not edin**; tekrar gösterilmez. İlk girişte değiştirin.

## 6. Arka plan işlerini başlatın (tek seferlik)

Makbuz e-postaları, SMS'ler ve ödeme kontrolleri bu süreçlerle çalışır:

```bash
EINFAK_ROOT=/var/www/e-infak pm2 start /var/www/e-infak/deploy/pm2/ecosystem.config.cjs --only einfak-celery-worker
EINFAK_ROOT=/var/www/e-infak pm2 start /var/www/e-infak/deploy/pm2/ecosystem.config.cjs --only einfak-celery-beat
pm2 save
```

## 7. Kontrol

Tarayıcıda açın:
- https://hicretdernegi.org — yeşil Hicret sitesi
- https://kardeslikpayi.org — kırmızı Kardeşlik sitesi
- https://e-infak.org — iki kurumu listeleyen tanıtım sayfası
- https://hicretdernegi.org/login — 5. adımdaki yönetici bilgileriyle giriş

## 8. Çok önemli: şifreleme anahtarının yedeği

Kurumların panele gireceği ödeme ve SMS şifreleri bir anahtarla şifrelenir. Sunucu bozulur ve bu anahtar kaybolursa, o şifreler bir daha okunamaz. Anahtarı görmek için:

```bash
grep CREDENTIALS_ENCRYPTION_KEY /var/www/e-infak/services/backend/.env
```

Çıkan satırı güvenli bir yerde saklayın (şifre yöneticisi gibi). Kimseyle paylaşmayın.

---

## Sonraki güncellemeler

Kodda değişiklik yaptığınızda:
1. Kendi bilgisayarınızda `git push origin main`.
2. Sunucuda:

```bash
cd /var/www/e-infak && sudo env "PATH=$PATH" bash deploy.sh
```

Yeni sürüm önce gizli bir test slotunda açılır. Siz onaylamadan canlı site değişmez; bir sorun olursa betik eski sürüme kendiliğinden döner. Her yayından önce veritabanının yedeği alınır (`/var/www/e-infak/backups`).

## Sorun olursa

| Belirti | Bakılacak yer |
|---|---|
| Site açılmıyor (502) | `pm2 status` ve `pm2 logs --lines 50` |
| Yayın yarıda kaldı | `/var/www/e-infak/deploy-logs/` içindeki son dosya |
| nginx hatası | `nginx -t` |
