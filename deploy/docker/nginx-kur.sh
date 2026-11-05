#!/usr/bin/env bash
# E-İnfak — nginx sitesi ve SSL (sunucu sahibi sudo ile bir kez çalıştırır).
#   sudo bash /opt/e_infak/nginx-kur.sh
# Yalnızca e-infak alan adları için yeni bir nginx dosyası ekler; E-Medrese'nin
# ayarına dokunmaz. nginx testi başarısız olursa kendi dosyasını geri çeker.
set -Eeuo pipefail

ALAN_ADLARI="${ALAN_ADLARI:-hicretdernegi.org kardeslikpayi.org e-infak.org}"
SITE=/etc/nginx/sites-available/e-infak.conf
ol() { echo "HATA: $*" >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || ol "sudo ile çalıştırın: sudo bash $0"

isimler=""
for alan in $ALAN_ADLARI; do isimler+="$alan www.$alan "; done

cat > "$SITE" <<EOF
# E-İnfak (Docker: web 127.0.0.1:3092, api 127.0.0.1:8092)
server {
    listen 80;
    listen [::]:80;
    server_name ${isimler% };
    client_max_body_size 8m;

    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;

    # Ödeme kuruluşu dönüşleri ve yüklenen görseller doğrudan API'ye
    location ^~ /api/v1/payments/ { proxy_pass http://127.0.0.1:8092; }
    location ^~ /api/v1/media/    { proxy_pass http://127.0.0.1:8092; expires 7d; }
    location = /health            { proxy_pass http://127.0.0.1:8092; }

    # Sayfalar ve /api/v1/* (imzalı web geçidi üzerinden)
    location / { proxy_pass http://127.0.0.1:3092; }
}
EOF
ln -sf "$SITE" /etc/nginx/sites-enabled/e-infak.conf
if ! nginx -t; then
  rm -f /etc/nginx/sites-enabled/e-infak.conf
  ol "nginx ayarı geçersiz; e-infak dosyası geri çekildi, diğer sitelere dokunulmadı."
fi
systemctl reload nginx
echo "nginx hazır."

# SSL: yalnızca DNS'i bu sunucuyu gösteren alan adları için
sunucu_ip="$(curl -s --max-time 5 https://api.ipify.org || true)"
sertifika_args=()
for alan in $ALAN_ADLARI; do
  for ad in "$alan" "www.$alan"; do
    ip="$(getent ahostsv4 "$ad" | awk 'NR==1{print $1}')"
    if [[ -n "$sunucu_ip" && "$ip" == "$sunucu_ip" ]]; then
      sertifika_args+=(-d "$ad")
    else
      echo "UYARI: $ad bu sunucuyu göstermiyor (DNS: ${ip:-yok}, sunucu: ${sunucu_ip:-?}); SSL atlandı."
    fi
  done
done
if [[ ${#sertifika_args[@]} -eq 0 ]]; then
  echo "Hiçbir alan adı bu sunucuyu göstermiyor. DNS'i değiştirdikten sonra bu betiği tekrar çalıştırın."
  exit 0
fi
# certbot e-posta adresini ve Let's Encrypt koşullarını kendisi sorar.
certbot --nginx --cert-name e-infak "${sertifika_args[@]}" --redirect
