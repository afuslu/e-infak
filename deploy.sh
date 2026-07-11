#!/bin/bash
set -euo pipefail

# E-İnfak Canlıya Dağıtım ve Entegrasyon Betiği (Deploy Script)
# e-medrese projesinin hata toleranslı ve güvenli dağıtım yapısı esas alınmıştır.

PROJECT_DIR="${PROJECT_DIR:-/var/www/e-infak}"
PORT="${PORT:-8020}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:$PORT/api/health}"
FRONTEND_HEALTH_URL="${FRONTEND_HEALTH_URL:-http://127.0.0.1:$PORT/}"

echo "--------------------------------------------------"
echo "🚀 E-İnfak Dağıtım İşlemi Başlatıldı: $(date)"
echo "📁 Proje Dizini: ${PROJECT_DIR}"
echo "--------------------------------------------------"

cd "${PROJECT_DIR}"

echo "📥 GitHub'dan güncel kodlar çekiliyor..."
git fetch origin main

# Yerel değişikliklerin engellemesini önlemek için stash mekanizması
HAS_STASH=0
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "⚠️  Sunucuda yerel değişiklikler tespit edildi. Geçici olarak stash ediliyor..."
    git stash save "deploy_stash_$(date +%Y%m%d_%H%M%S)"
    HAS_STASH=1
fi

git checkout main
git pull --ff-only origin main

if [[ "$HAS_STASH" -eq 1 ]]; then
    echo "🔄 Yerel değişiklikler geri yükleniyor (stash pop)..."
    git stash pop || echo "⚠️  Stash geri yüklenirken çakışma çıktı, lütfen manuel kontrol edin!"
fi

# Her git pull sonrasında yeni gelen dosyaların izinlerini Nginx kullanıcısına (www-data) geçir
echo "🔑 Dosya izinleri www-data kullanıcısına eşitleniyor..."
chown -R www-data:www-data "${PROJECT_DIR}"

echo "🧾 Güncel Commit: $(git rev-parse --short HEAD)"

# Python Sanal Ortamını Etkinleştirme
activate_backend_python() {
    if [[ -f venv/bin/activate ]]; then
        source venv/bin/activate
        return 0
    fi
    if [[ -f .venv/bin/activate ]]; then
        source .venv/bin/activate
        return 0
    fi
    return 1
}

if ! activate_backend_python; then
    echo "❌ Python sanal ortamı (venv veya .venv) bulunamadı!"
    exit 1
fi

echo "📦 Bağımlılıklar kuruluyor..."
pip install --upgrade pip
pip install flask

# --- KALİTE KAPILARI (QUALITY GATES) ---
echo "🧪 Kalite kapıları (Quality Gates) çalıştırılıyor..."

# 1. Python doğrulama testini çalıştır
if [[ -f scripts/release_check.py ]]; then
    echo "🐍 Python entegrasyon testi çalıştırılıyor..."
    python scripts/release_check.py
else
    echo "⚠️  scripts/release_check.py bulunamadı, entegrasyon testi atlandı."
fi

# 2. Frontend JS Syntax kontrolü
if command -v node >/dev/null 2>&1; then
    if [[ -f public/app.js ]]; then
        echo "🔍 Node.js ile frontend syntax kontrolü yapılıyor..."
        node -c public/app.js
    fi
fi

echo "✅ Kalite kapıları başarıyla geçildi."

# --- UYGULAMA YENİDEN BAŞLATMA ---
echo "🔄 Servisler yeniden yükleniyor..."

# 1. E-İnfak Systemd Servisini yeniden başlat
if systemctl list-units --type=service | grep -q "einfak.service"; then
    echo "⚙️  einfak.service yeniden başlatılıyor..."
    sudo systemctl restart einfak
else
    echo "⚠️  einfak.service bulunamadı, servis yeniden başlatma atlandı."
fi

# 2. Nginx testi ve yeniden yüklemesi
if command -v nginx >/dev/null 2>&1; then
    echo "🛡️  Nginx konfigürasyonu test ediliyor..."
    if sudo nginx -t; then
        echo "⚙️  Nginx yeniden başlatılıyor..."
        sudo systemctl restart nginx
    else
        echo "❌ Nginx konfigürasyon hatası! Dağıtım durduruldu."
        exit 1
    fi
fi

# --- DUMAN TESTLERİ (SMOKE TESTS) ---
echo "🔍 Dağıtım sonrası duman (smoke) testleri yapılıyor..."
sleep 2

verify_endpoint() {
    local url="$1"
    local name="$2"
    local attempts=5
    local i=1
    while [[ "$i" -le "$attempts" ]]; do
        if curl --connect-timeout 3 --max-time 5 -fsS "$url" >/dev/null 2>&1; then
            echo "✅ $name sağlıklı şekilde yanıt veriyor."
            return 0
        fi
        echo "   ⏳ $name henüz hazır değil, tekrar deneniyor (${i}/${attempts})..."
        sleep 2
        i=$((i + 1))
    done
    echo "❌ $name doğrulaması başarısız oldu! URL: $url"
    return 1
}

verify_endpoint "$BACKEND_HEALTH_URL" "Backend Servisi (API)"
verify_endpoint "$FRONTEND_HEALTH_URL" "Frontend Sunucusu (Arayüz)"

echo "--------------------------------------------------"
echo "🎉 E-İnfak Dağıtımı Başarıyla Tamamlandı: $(date)"
echo "--------------------------------------------------"
