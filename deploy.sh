#!/usr/bin/env bash
# E-İnfak 2.0 - Sunucu Güncelleme ve Dağıtım Betiği (E-Medrese Modeliyle Docker'sız)
# Bu betik, sunucudaki diğer projelere dokunmadan E-İnfak uygulamasını kesintisiz günceller.

set -euo pipefail

# Ana Klasör Yolu
PROJECT_DIR="${PROJECT_DIR:-/var/www/e-infak}"

# Varsa özel çevre değişkenlerini yükle
if [[ -f "${PROJECT_DIR}/.deploy.env" ]]; then
	# shellcheck disable=SC1090
	source "${PROJECT_DIR}/.deploy.env"
fi

# Doğrulama Ayarları
POST_DEPLOY_SMOKE_SCRIPT="${POST_DEPLOY_SMOKE_SCRIPT:-${PROJECT_DIR}/scripts/post_deploy_smoke.sh}"
RUN_POST_DEPLOY_SMOKE="${RUN_POST_DEPLOY_SMOKE:-1}"
RUN_DEPLOY_QUALITY_GATES="${RUN_DEPLOY_QUALITY_GATES:-1}"
RUN_FRONTEND_DEPLOY_CHECKS="${RUN_FRONTEND_DEPLOY_CHECKS:-1}"
RUN_BACKEND_DEPLOY_CHECK="${RUN_BACKEND_DEPLOY_CHECK:-1}"

# Test Adresleri
FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-http://127.0.0.1:3000}"
BACKEND_LIVE_URL="${BACKEND_LIVE_URL:-http://127.0.0.1:8020/health}"
BACKEND_ROOT_URL="${BACKEND_ROOT_URL:-http://127.0.0.1:8020/}"

echo "------------------------------------------"
echo "🚀 Güncelleme İşlemi Başlatıldı: $(date)"
echo "📁 Proje dizini: ${PROJECT_DIR}"
echo "------------------------------------------"

cd "${PROJECT_DIR}"

# 1. GİT GÜNCELLEMESİ (OTOMATİK YEDEKLEME / STASH)
echo "📥 Kodlar güncelleniyor (GitHub -> main)..."
git fetch origin main

# Yerel değişikliklerin silinmesini önlemek için stash mekanizması
HAS_STASH=0
if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "⚠️  Sunucuda yerel değişiklikler tespit edildi. Geçici olarak yedekleniyor (stash)..."
	git stash save "deploy_stash_$(date +%Y%m%d_%H%M%S)"
	HAS_STASH=1
fi

git checkout main
git pull --ff-only origin main

if [[ "$HAS_STASH" -eq 1 ]]; then
	echo "🔄 Yerel değişiklikler geri yükleniyor (stash pop)..."
	git stash pop || echo "⚠️  Yedekler yüklenirken çakışma çıktı, lütfen manuel kontrol edin!"
fi

echo "🧾 Güncel commit: $(git rev-parse --short HEAD)"

# 2. PYTHON SANAL ORTAMI AKTİFLEŞTİRME
activate_backend_python() {
	if [[ -f services/backend/venv/bin/activate ]]; then
		source services/backend/venv/bin/activate
		return 0
	fi
	if [[ -f venv/bin/activate ]]; then
		source venv/bin/activate
		return 0
	fi
	return 1
}

# 3. KALİTE KAPILARI (PRE-DEPLOY QUALITY GATES)
run_pre_deploy_quality_gates() {
	if [[ "$RUN_DEPLOY_QUALITY_GATES" != "1" ]]; then
		echo "ℹ️  Deploy öncesi kalite denetimleri atlandı."
		return 0
	fi

	if [[ "$RUN_BACKEND_DEPLOY_CHECK" == "1" ]]; then
		echo "🧪 Backend Python derleme kontrolü yapılıyor..."
		if ! activate_backend_python; then
			echo "❌ Python sanal ortamı bulunamadı!"
			return 1
		fi
		# Kodların derlenebildiğini doğrulamak için python derleyici kontrolü çalıştırılır
		python3 -m py_compile $(find services/backend/app -name "*.py")
		echo "✅ Backend kod derleme kontrolü başarılı."
	fi
}

run_pre_deploy_quality_gates

# 4. KÜTÜPHANE VE ARAYÜZ KURULUMU / DERLEMESİ
echo "📦 Bağımlılıklar kuruluyor ve Frontend derleniyor..."

# pnpm monorepo paketlerini yükle ve derle (Next.js derlemesini içerir)
if command -v pnpm >/dev/null 2>&1; then
	pnpm install
	pnpm build
else
	echo "❌ 'pnpm' bulunamadı! Lütfen önce 'npm install -g pnpm' çalıştırın."
	exit 1
fi

# Python bağımlılıklarını kur
if activate_backend_python; then
	pip install -r services/backend/requirements.txt
else
	echo "❌ Python sanal ortamı aktifleştirilemedi!"
	exit 1
fi

# 5. VERİTABANI GÖÇLERİ (MIGRATION)
echo "🗄️  Veritabanı göçleri (migration) uygulanıyor..."
cd services/backend
alembic upgrade head
cd "${PROJECT_DIR}"

# 6. SERVİSLERİ YENİDEN BAŞLATMA (SYSTEMD & PM2)
echo "🔄 Sunucu servisleri yeniden başlatılıyor..."

restart_service_if_exists() {
	local svc="$1"
	if systemctl is-active --quiet "$svc" || systemctl is-enabled --quiet "$svc" 2>/dev/null; then
		echo "🔄 ${svc} servisi yeniden başlatılıyor..."
		sudo systemctl restart "$svc"
	else
		echo "ℹ️  ${svc} servisi sunucuda aktif değil, atlandı."
	fi
}

# E-İnfak Systemd servislerini yeniden başlat
# einfak (varsayılan backend), einfak-frontend (Next.js), einfak-celery (Celery Worker), einfak-beat (Celery Beat)
restart_service_if_exists "einfak"
restart_service_if_exists "einfak-backend"
restart_service_if_exists "einfak-frontend"
restart_service_if_exists "einfak-celery"
restart_service_if_exists "einfak-beat"

# PM2 süreçleri varsa onları da yenile (PM2 kullanan kurulumlar için)
if command -v pm2 >/dev/null 2>&1; then
	if pm2 describe einfak-frontend >/dev/null 2>&1; then
		echo "🔄 PM2: einfak-frontend yeniden yükleniyor (reload)..."
		pm2 reload einfak-frontend
	fi
	if pm2 describe einfak-backend >/dev/null 2>&1; then
		echo "🔄 PM2: einfak-backend yeniden yükleniyor (reload)..."
		pm2 reload einfak-backend
	fi
fi

# 7. CANLI ORTAM DOĞRULAMA (SMOKE TESTS)
if [[ "$RUN_POST_DEPLOY_SMOKE" == "1" ]]; then
	if [[ -f "$POST_DEPLOY_SMOKE_SCRIPT" ]]; then
		echo "🔍 Canlı ortam doğrulama testleri çalıştırılıyor..."
		# Gerekli adresleri smoke test betiğine gönderiyoruz
		FRONTEND_BASE_URL="$FRONTEND_BASE_URL" \
		API_HEALTH_URL="$BACKEND_LIVE_URL" \
		API_ROOT_URL="$BACKEND_ROOT_URL" \
		bash "$POST_DEPLOY_SMOKE_SCRIPT"
	else
		echo "⚠️  Doğrulama betiği bulunamadı: ${POST_DEPLOY_SMOKE_SCRIPT}"
	fi
fi

echo "------------------------------------------"
echo "✅ E-İnfak Güncellemesi Başarıyla Tamamlandı!"
echo "🧾 Çalışan commit: $(git rev-parse --short HEAD)"
echo "------------------------------------------"
