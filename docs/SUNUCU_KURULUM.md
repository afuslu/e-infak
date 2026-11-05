# E-İnfak sunucu rehberi

E-İnfak, E-Medrese ile aynı sunucuda (`31.97.159.228`, `emedrese-prod`) **Docker** ile, ondan tamamen ayrı çalışır:

| | E-Medrese | E-İnfak |
|---|---|---|
| Klasör | `/opt/e_medrese` | `/opt/e_infak` |
| Docker projesi | `emedrese` | `einfak` |
| Veritabanı / Redis | kendi kapları | ayrı kendi kapları |
| İç portlar | 8081 | site 3092, API 8092 |
| nginx dosyası | `e-medrese.org` | `e-infak.conf` |

## Klasör düzeni (`/opt/e_infak`)

- `.env` — gizli ayarlar (veritabanı şifresi, anahtarlar). Kimseyle paylaşmayın.
- `kaynak.git` — kod deposu; Mac'ten `git push sunucu main` ile gelir.
- `dagit.sh` — yayın betiği.
- `releases/` — son 3 sürümün kodu.
- `backups/` — her yayından önce alınan veritabanı yedekleri (son 14).
- `dagitim-gunlukleri/` — yayın kayıtları.
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
