#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# E-İnfak — ilk sunucu kurulumu (Ubuntu 22.04 / 24.04, root)
# ═══════════════════════════════════════════════════════════════
# Bir kez çalıştırılır; tekrar çalıştırmak güvenlidir (var olanı korur).
# Sunucudaki diğer sitelere (ör. mostilac.com) dokunmaz:
#   - yalnızca kendi nginx dosyasını ekler, başka nginx dosyasını değiştirmez,
#   - kendi veritabanını ve kullanıcısını oluşturur,
#   - kullandığı portlar doluysa hiçbir şey yapmadan durur.
#
# Kullanım:
#   curl -fsSLo /root/einfak-setup.sh https://raw.githubusercontent.com/afuslu/e-infak/main/deploy/server-setup.sh
#   sudo bash /root/einfak-setup.sh
# ═══════════════════════════════════════════════════════════════
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/afuslu/e-infak.git}"
PROJECT_DIR="${PROJECT_DIR:-/var/www/e-infak}"
DOMAINS="${DOMAINS:-hicretdernegi.org kardeslikpayi.org e-infak.org}"
DB_NAME="${DB_NAME:-einfak}"
DB_USER="${DB_USER:-einfak}"
NODE_MAJOR=20
PNPM_VERSION=8.15.0
NGINX_RUNTIME_DIR=/etc/nginx/e-infak
PORTS=(3000 3001 8020 8021 8090)

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mHATA: %s\033[0m\n' "$*"; exit 1; }

[[ "$EUID" -eq 0 ]] || die "root olarak çalıştırın: sudo bash $0"
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "Ubuntu dışı sistem (${ID:-?}); komutlar farklı olabilir."

# ── 0. Ön kontrol: portlar başka bir uygulamada mı? ─────────────
if [[ ! -f "$NGINX_RUNTIME_DIR/active-slot" ]]; then
  for port in "${PORTS[@]}"; do
    if ss -ltn "( sport = :$port )" | grep -q LISTEN; then
      die "Port $port başka bir uygulama tarafından kullanılıyor. Sunucudaki diğer siteyi bozmamak için kurulum durduruldu."
    fi
  done
fi

# ── 1. Paketler ────────────────────────────────────────────────
log "Sistem paketleri kuruluyor"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates gnupg build-essential \
  python3 python3-venv python3-pip python3-dev libpq-dev \
  postgresql postgresql-client redis-server nginx certbot python3-certbot-nginx \
  libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b fonts-dejavu-core  # PDF makbuzlar (weasyprint)

if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  log "Node.js ${NODE_MAJOR} kuruluyor (NodeSource)"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y && apt-get install -y nodejs
fi
npm install -g "pnpm@${PNPM_VERSION}" pm2

systemctl enable --now postgresql redis-server nginx

# ── 2. Kaynak kod ──────────────────────────────────────────────
if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  log "Kod GitHub'dan indiriliyor: $REPO_URL"
  mkdir -p "$(dirname "$PROJECT_DIR")"
  git clone "$REPO_URL" "$PROJECT_DIR"
else
  log "Kod zaten var: $PROJECT_DIR"
fi
mkdir -p "$PROJECT_DIR/services/backend/media" "$PROJECT_DIR/backups"

# ── 3. Veritabanı ──────────────────────────────────────────────
BACKEND_ENV="$PROJECT_DIR/services/backend/.env"
if [[ ! -f "$BACKEND_ENV" ]]; then
  log "PostgreSQL veritabanı ve kullanıcısı oluşturuluyor"
  DB_PASSWORD="$(openssl rand -hex 24)"
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}'"
  else
    sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}'"
  fi
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  fi

  # ── 4. Ayar dosyaları (şifreler burada üretilir, ekrana yazılmaz) ──
  log "Ayar dosyaları oluşturuluyor"
  PROXY_SECRET="$(openssl rand -hex 32)"
  FERNET_KEY="$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
  umask 077
  cat > "$BACKEND_ENV" <<EOF
ENVIRONMENT=production
DEBUG=false
DATABASE_URL=postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
SECRET_KEY=$(openssl rand -hex 32)
TENANT_PROXY_SECRET=${PROXY_SECRET}
# Bu anahtar kaybolursa panelde girilen ödeme/SMS şifreleri okunamaz. Yedeğini saklayın.
CREDENTIALS_ENCRYPTION_KEY=${FERNET_KEY}
PLATFORM_BASE_DOMAIN=e-infak.org
PUBLIC_WEB_URL=https://e-infak.org
PAYMENT_CALLBACK_BASE_URL=https://e-infak.org
MEDIA_ROOT=${PROJECT_DIR}/services/backend/media
PAYMENTS_LIVE_ENABLED=false
# Ziraat Pay canlı adresleri (canlıya geçerken açın):
# ZIRAATPAY_API_URL=https://vpos.ziraatpay.com.tr/ziraatpay/api/v2
# ZIRAATPAY_HPP_URL=https://vpos.ziraatpay.com.tr/payment
# Platform SMS hesabı (kurumun kendi hesabı yoksa kullanılır):
NETGSM_USERNAME=
NETGSM_PASSWORD=
NETGSM_SENDER=
SENDGRID_API_KEY=
EOF
  cat > "$PROJECT_DIR/apps/web/.env.production" <<EOF
INTERNAL_API_URL=http://127.0.0.1:8090
TENANT_PROXY_SECRET=${PROXY_SECRET}
PLATFORM_BASE_DOMAIN=e-infak.org
EOF
  umask 022
  chmod 600 "$BACKEND_ENV" "$PROJECT_DIR/apps/web/.env.production"
else
  log "Ayar dosyası zaten var, dokunulmadı: $BACKEND_ENV"
fi

# ── 5. nginx ───────────────────────────────────────────────────
log "nginx ayarı ekleniyor (yalnızca e-infak alan adları)"
mkdir -p "$NGINX_RUNTIME_DIR"
[[ -f "$NGINX_RUNTIME_DIR/backend-active.conf" ]] || echo 'server 127.0.0.1:8020 max_fails=3 fail_timeout=10s;' > "$NGINX_RUNTIME_DIR/backend-active.conf"
[[ -f "$NGINX_RUNTIME_DIR/frontend-active.conf" ]] || echo 'server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;' > "$NGINX_RUNTIME_DIR/frontend-active.conf"
[[ -f "$NGINX_RUNTIME_DIR/active-slot" ]] || echo 'blue' > "$NGINX_RUNTIME_DIR/active-slot"

SERVER_NAMES=""
CERTBOT_ARGS=()
for domain in $DOMAINS; do
  SERVER_NAMES+="$domain www.$domain "
  CERTBOT_ARGS+=(-d "$domain" -d "www.$domain")
done
SITE_FILE=/etc/nginx/sites-available/e-infak.conf
if [[ ! -f "$SITE_FILE" ]]; then
  sed "s/__SERVER_NAMES__/${SERVER_NAMES% }/" "$PROJECT_DIR/deploy/nginx/e-infak.conf" > "$SITE_FILE"
  ln -sf "$SITE_FILE" /etc/nginx/sites-enabled/e-infak.conf
else
  log "nginx dosyası zaten var, dokunulmadı: $SITE_FILE"
fi
if ! nginx -t; then
  # Never leave a broken config behind: the other sites on this nginx would fail on the next reload.
  rm -f /etc/nginx/sites-enabled/e-infak.conf
  die "nginx ayarı geçersiz; e-infak dosyası geri çekildi, diğer sitelere dokunulmadı."
fi
systemctl reload nginx

# ── 6. SSL sertifikası (Let's Encrypt) ─────────────────────────
if [[ ! -d /etc/letsencrypt/live/hicretdernegi.org ]]; then
  log "SSL sertifikası alınıyor"
  read -r -p "Sertifika uyarıları için e-posta adresiniz: " CERT_EMAIL < /dev/tty
  certbot --nginx --cert-name hicretdernegi.org "${CERTBOT_ARGS[@]}" \
    --redirect -m "$CERT_EMAIL" --agree-tos --no-eff-email
else
  log "SSL sertifikası zaten var"
fi

# ── 7. Yeniden başlatmada PM2 süreçleri otomatik açılsın ────────
pm2 startup systemd -u root --hp /root >/dev/null

log "Kurulum tamam. Sıradaki adım: ilk yayın"
cat <<EOF

  cd $PROJECT_DIR
  sudo env "PATH=\$PATH" bash deploy.sh

Yayın bitince (tek seferlik) kurumları oluşturun:

  cd $PROJECT_DIR/backend-active && venv/bin/python -m app.cli bootstrap-sites

Arka plan işleri (makbuz e-postası, SMS, ödeme kontrolü):

  EINFAK_ROOT=$PROJECT_DIR pm2 start $PROJECT_DIR/deploy/pm2/ecosystem.config.cjs --only einfak-celery-worker
  EINFAK_ROOT=$PROJECT_DIR pm2 start $PROJECT_DIR/deploy/pm2/ecosystem.config.cjs --only einfak-celery-beat
  pm2 save

EOF
