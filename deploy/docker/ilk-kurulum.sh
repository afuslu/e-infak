#!/usr/bin/env bash
# E-İnfak — ilk kurulum (Docker'lı sunucu, sudo gerekmez).
# /opt/e_infak altında klasörleri, gizli ayarları ve kod deposunu hazırlar.
# Tekrar çalıştırmak güvenlidir: var olan .env ve depoya dokunmaz.
set -Eeuo pipefail

DIZIN="${DIZIN:-/opt/e_infak}"
ol() { echo "HATA: $*" >&2; exit 1; }

command -v docker >/dev/null || ol "docker yok"
docker compose version >/dev/null 2>&1 || ol "docker compose yok"
[[ -w "$DIZIN" ]] || ol "$DIZIN yazılabilir değil"

mkdir -p "$DIZIN"/{releases,backups,runtime,dagitim-gunlukleri}

# Kod deposu: Mac'ten `git push sunucu main` ile gelir; GitHub da yedek kaynak.
if [[ ! -d "$DIZIN/kaynak.git" ]]; then
  git init -q --bare "$DIZIN/kaynak.git"
  echo "Kod deposu oluşturuldu: $DIZIN/kaynak.git"
fi

ENV_DOSYASI="$DIZIN/.env"
if [[ ! -f "$ENV_DOSYASI" ]]; then
  umask 077
  fernet="$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
  cat > "$ENV_DOSYASI" <<EOF
# E-İnfak canlı ayarları — bu dosyayı kimseyle paylaşmayın.
ENVIRONMENT=production
DEBUG=false
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SECRET_KEY=$(openssl rand -hex 32)
TENANT_PROXY_SECRET=$(openssl rand -hex 32)
# Bu anahtar kaybolursa panelde girilen ödeme/SMS şifreleri okunamaz. Yedeğini saklayın.
CREDENTIALS_ENCRYPTION_KEY=${fernet}
PLATFORM_BASE_DOMAIN=e-infak.org
# Özel alan adlarının A kaydı bu IP'yi göstermeli (nginx-otomatik-ssl.sh boşsa doldurur)
PLATFORM_PUBLIC_IP=
PUBLIC_WEB_URL=https://e-infak.org
PAYMENT_CALLBACK_BASE_URL=https://e-infak.org
PAYMENTS_LIVE_ENABLED=false
# Ziraat Pay canlı adresleri (canlıya geçerken açın):
# ZIRAATPAY_API_URL=https://vpos.ziraatpay.com.tr/ziraatpay/api/v2
# ZIRAATPAY_HPP_URL=https://vpos.ziraatpay.com.tr/payment
# Platform SMS hesabı (kurumun kendi hesabı yoksa kullanılır)
NETGSM_USERNAME=
NETGSM_PASSWORD=
NETGSM_SENDER=
SENDGRID_API_KEY=
EOF
  chmod 600 "$ENV_DOSYASI"
  echo "Gizli ayarlar üretildi: $ENV_DOSYASI"
else
  echo "Ayar dosyası zaten var, dokunulmadı: $ENV_DOSYASI"
fi
echo "İlk kurulum tamam."
