#!/usr/bin/env bash
# E-İnfak — kurum alt alan adları ve özel alan adları için otomatik SSL (sudo ile BİR KEZ).
#   sudo bash /opt/e_infak/nginx-otomatik-ssl.sh
#
# Nasıl çalışır: "certs" kabı (Caddy, deploy/docker/Caddyfile) sertifikaları alır ve
# $SERTIFIKA_DIZINI altına yazar. Bu betiğin eklediği nginx sitesi, sabit listede olmayan
# adlar için (ör. hicret.e-infak.org, dernekadi.org) sertifikayı her TLS el sıkışmasında o
# dizinden okur. Böylece yeni alan adı eklemek için bir daha sudo veya nginx reload gerekmez.
#
# E-Medrese ve diğer siteler: hiçbir dosyasına dokunulmaz, listen satırları değişmez.
# Kendi adlarını açıkça yazan sunucular her zaman önce seçilir (nginx, tam ad ve joker adları
# düzenli ifadeden önce dener); /etc/letsencrypt'te sertifikası olan her ad ayrıca hariç tutulur.
# nginx -t başarısız olursa bu dosya geri alınır. Tekrar çalıştırmak güvenlidir.
set -Eeuo pipefail

DIZIN="${DIZIN:-/opt/e_infak}"
SERTIFIKA_DIZINI="${SERTIFIKA_DIZINI:-$DIZIN/sertifikalar}"
TABAN="${TABAN:-e-infak.org}"
NGINX_DIZINI="${NGINX_DIZINI:-/etc/nginx}"
LE_DIZINI="${LE_DIZINI:-/etc/letsencrypt/live}"
ENV_DOSYASI="${ENV_DOSYASI:-$DIZIN/.env}"
SITE="$NGINX_DIZINI/sites-available/zz-e-infak-otomatik.conf"
ETKIN="$NGINX_DIZINI/sites-enabled/zz-e-infak-otomatik.conf"
# Caddy'nin Let's Encrypt sertifikalarını yazdığı yer (Caddyfile: storage /data + acme dir)
CRT_KOK="$SERTIFIKA_DIZINI/certificates/acme-v02.api.letsencrypt.org-directory"

ol() { echo "HATA: $*" >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || ol "sudo ile çalıştırın: sudo bash $0"
command -v nginx >/dev/null || ol "nginx bulunamadı"

# 1) nginx sürümü: değişkenli ssl_certificate 1.15.9 ile geldi
surum="$(nginx -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p')"
[[ -n "$surum" && "$(printf '%s\n1.15.9\n' "$surum" | sort -V | head -1)" == "1.15.9" ]] \
  || ol "nginx $surum çok eski (en az 1.15.9 gerekli)"

# 2) Sertifika dizini nginx çalışan kullanıcısına ait olmalı (anahtar dosyaları 0600)
kullanici="$(awk '$1=="user"{sub(";","",$2); print $2; exit}' "$NGINX_DIZINI/nginx.conf" 2>/dev/null || true)"
kullanici="${kullanici:-www-data}"
id "$kullanici" >/dev/null 2>&1 || ol "nginx kullanıcısı '$kullanici' yok"
uid="$(id -u "$kullanici")"; gid="$(id -g "$kullanici")"
mkdir -p "$SERTIFIKA_DIZINI"
chown -R "$uid:$gid" "$SERTIFIKA_DIZINI"
chmod 700 "$SERTIFIKA_DIZINI"
# nginx'in dizine inebilmesi için üst dizinlerde yalnızca "geçiş" (x) izni gerekir
yol="$(dirname "$SERTIFIKA_DIZINI")"
while [[ "$yol" != "/" ]]; do
  if ! runuser -u "$kullanici" -- test -x "$yol" 2>/dev/null; then
    chmod o+x "$yol"; echo "$yol için geçiş izni (o+x) verildi."
  fi
  yol="$(dirname "$yol")"
done

# 3) .env: kabın kullanıcı kimliği ve doğrulamada beklenen sunucu IP'si
env_yaz() {  # anahtar değer [yalnız-boşsa]
  [[ -f "$ENV_DOSYASI" ]] || return 0
  if grep -q "^$1=" "$ENV_DOSYASI"; then
    [[ -n "${3:-}" && -n "$(grep "^$1=" "$ENV_DOSYASI" | tail -1 | cut -d= -f2-)" ]] && return 0
    sed -i "s|^$1=.*|$1=$2|" "$ENV_DOSYASI"
  else
    echo "$1=$2" >> "$ENV_DOSYASI"
  fi
}
eski_uid="$(grep -s '^CERTS_UID=' "$ENV_DOSYASI" | tail -1 | cut -d= -f2- || true)"
env_yaz CERTS_UID "$uid"
env_yaz CERTS_GID "$gid"
sunucu_ip="$(curl -s --max-time 5 https://api.ipify.org || true)"
[[ "$sunucu_ip" =~ ^[0-9.]+$ ]] && env_yaz PLATFORM_PUBLIC_IP "$sunucu_ip" yalniz-bossa
[[ -f "$ENV_DOSYASI" ]] || echo "UYARI: $ENV_DOSYASI yok; CERTS_UID=$uid, CERTS_GID=$gid ve PLATFORM_PUBLIC_IP elle eklenmeli."

# 4) Diğer sitelerin sertifikalı adları hiçbir zaman bu siteye düşmesin
haric=""
for crt in "$LE_DIZINI"/*/cert.pem; do
  [[ -f "$crt" ]] || continue
  for ad in $(openssl x509 -in "$crt" -noout -ext subjectAltName 2>/dev/null | grep -o 'DNS:[^,]*' | cut -d: -f2); do
    [[ "$ad" == \** ]] && continue
    haric+="${haric:+|}$(printf '%s' "$ad" | sed 's/[.]/\\./g')"
  done
done
etiket='[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?'
duzenli="~^${haric:+(?!(?:$haric)\$)}(?:$etiket\\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})\$"
ssl_ek=""
[[ -f /etc/letsencrypt/options-ssl-nginx.conf ]] && ssl_ek="include /etc/letsencrypt/options-ssl-nginx.conf;"

yeni="$(mktemp)"
cat > "$yeni" <<EOF
# E-İnfak — otomatik SSL (nginx-otomatik-ssl.sh üretir; elle değiştirmeyin).
# Sabit adlar (e-infak.org vb.) e-infak.conf'ta kalır. Buradaki sunucular yalnızca başka hiçbir
# sitenin adını açıkça yazmadığı adları alır: *.${TABAN} ve kurumların özel alan adları.
# Sertifikalar: certs kabı (Caddy) → ${CRT_KOK}/<ad>/<ad>.crt
server {
    listen 80;
    listen [::]:80;
    server_name *.${TABAN} "${duzenli}";
    client_max_body_size 8m;

    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;

    # Let's Encrypt HTTP-01 doğrulaması → certs kabı
    location ^~ /.well-known/acme-challenge/ { proxy_pass http://127.0.0.1:8480; }

    location / {
        if (-f ${CRT_KOK}/\$host/\$host.crt) { return 301 https://\$host\$request_uri; }
        proxy_pass http://127.0.0.1:3092;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name *.${TABAN} "${duzenli}";
    client_max_body_size 8m;

    # Her el sıkışmada okunur: yeni sertifika için reload gerekmez. Dosya yoksa bağlantı reddedilir.
    ssl_certificate     ${CRT_KOK}/\$ssl_server_name/\$ssl_server_name.crt;
    ssl_certificate_key ${CRT_KOK}/\$ssl_server_name/\$ssl_server_name.key;
    ${ssl_ek}

    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;

    location ^~ /api/v1/payments/ { proxy_pass http://127.0.0.1:8092; }
    location ^~ /api/v1/media/    { proxy_pass http://127.0.0.1:8092; expires 7d; }
    location = /health            { proxy_pass http://127.0.0.1:8092; }
    location / { proxy_pass http://127.0.0.1:3092; }
}
EOF

yedek=""
[[ -f "$SITE" ]] && { yedek="$(mktemp)"; cp "$SITE" "$yedek"; }
install -m 644 "$yeni" "$SITE"; rm -f "$yeni"
ln -sf "$SITE" "$ETKIN"
if ! nginx -t; then
  if [[ -n "$yedek" ]]; then cp "$yedek" "$SITE"; else rm -f "$ETKIN" "$SITE"; fi
  ol "nginx ayarı geçersiz; otomatik SSL dosyası geri alındı, diğer sitelere dokunulmadı."
fi
rm -f "$yedek"
systemctl reload nginx
sleep 2
echo "nginx hazır: $SITE"
[[ -n "$haric" ]] && echo "Hariç tutulan (başka sitelerin sertifikalı) adlar: $(printf '%s' "$haric" | sed 's/\\//g')"

# 5) certs kabı yeni kullanıcı/dizinle başlasın
kap="$(docker ps -aq --filter label=com.docker.compose.project=einfak --filter label=com.docker.compose.service=certs 2>/dev/null | head -1 || true)"
if [[ -z "$kap" ]]; then
  echo "certs kabı henüz yok: bir sonraki dagit.sh çalıştırmasında başlar."
elif [[ -n "$eski_uid" && "$eski_uid" == "$uid" ]] || [[ -z "$eski_uid" && "$uid" == "33" ]]; then
  docker restart "$kap" >/dev/null && echo "certs kabı yeniden başlatıldı."
else
  echo "Kullanıcı kimliği değişti (CERTS_UID=$uid): /opt/e_infak/dagit.sh ile bir kez daha dağıtın."
fi

# 6) Kısa kontrol: doğrulama yolu certs kabına ulaşıyor mu? (Caddyfile: respond "einfak-certs")
yanit="$(curl -s --max-time 5 -H "Host: kontrol.$TABAN" "http://127.0.0.1/.well-known/acme-challenge/kontrol" || true)"
if [[ "$yanit" == "einfak-certs" ]]; then
  echo "✅ Doğrulama yolu certs kabına ulaşıyor. Yeni alan adları artık sudo gerektirmez."
else
  echo "UYARI: /.well-known/acme-challenge/ certs kabına ulaşmadı (yanıt: ${yanit:0:60})."
  echo "       Güncel sürümü dagit.sh ile dağıtıp certs kabı çalışırken bu betiği tekrar çalıştırın."
fi
