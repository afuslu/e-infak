#!/usr/bin/env bash
# E-İnfak 2.0 - Canlı Ortam Doğrulama ve Sağlık Kontrolü Betiği
# Bu betik, yeni dağıtım yapıldıktan sonra sitenin ve API'nin çalışır durumda olduğunu doğrular.

set -euo pipefail

# Değişken Tanımlamaları (Çevre değişkenlerinden alınır veya varsayılanlar kullanılır)
BASE_URL="${FRONTEND_BASE_URL:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"
INDEX_URL="${INDEX_URL:-${BASE_URL}/}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:8000/health}"
API_ROOT_URL="${API_ROOT_URL:-http://127.0.0.1:8000/}"

log() {
  printf '[post-deploy-smoke] %s\n' "$1"
}

# HTTP Durum Kodunu Getiren Yardımcı Fonksiyon
http_code() {
  curl --connect-timeout 5 --max-time 15 -sS -o /dev/null -w '%{http_code}' -L "$1"
}

# Servis Ayağa Kalkana Kadar Bekleyen Yardımcı Fonksiyon
# Systemd servisleri yeniden başlatıldıktan hemen sonra (özellikle Next.js)
# port'u dinlemeye başlaması birkaç saniye sürebilir; bu yüzden sabit sayıda
# deneme ile bekleriz, aksi halde "Connection refused" script'i anında
# (set -e nedeniyle) çökertir.
wait_for_url() {
  local url="$1"
  local max_attempts="${2:-10}"
  local delay="${3:-1}"
  local attempt=1
  local code="000"

  while (( attempt <= max_attempts )); do
    code="$(http_code "$url" 2>/dev/null || echo "000")"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    log "Bekleniyor (${attempt}/${max_attempts}): ${url} -> ${code}"
    sleep "$delay"
    ((attempt++))
  done

  log "HATA: ${url} zaman aşımına uğradı (son durum kodu: ${code})"
  return 0
}

# HTTP Başlık Değerini Okuyan Yardımcı Fonksiyon
extract_header() {
  local url="$1"
  local header_name="$2"
  curl --connect-timeout 5 --max-time 15 -sSI -L "$url" \
    | tr -d '\r' \
    | awk -v target="${header_name,,}" '
        BEGIN { value="" }
        {
          line=$0
          lower=tolower(line)
          if (index(lower, target ":") == 1) {
            sub(/^[^:]+:[[:space:]]*/, "", line)
            value=line
          }
        }
        END { print value }
      '
}

# Belirtilen Durum Kodunun İzin Verilenler Arasında Olduğunu Doğrulayan Fonksiyon
require_status_in() {
  local url="$1"
  local code="$2"
  shift 2
  local allowed=("$@")

  for expected in "${allowed[@]}"; do
    if [[ "$code" == "$expected" ]]; then
      log "BAŞARILI durum kodu ${code} -> ${url}"
      return 0
    fi
  done

  log "HATA durum kodu ${code} -> ${url} (Beklenen: ${allowed[*]})"
  return 1
}

# Cache-Control no-store Başlığını Doğrulayan Fonksiyon
require_no_store() {
  local url="$1"
  local cache_control
  cache_control="$(extract_header "$url" "cache-control")"

  if [[ "$cache_control" == *"no-store"* || "$cache_control" == *"no-cache"* ]]; then
    log "BAŞARILI cache-control no-store/no-cache -> ${url} (${cache_control})"
    return 0
  fi

  log "HATA cache-control -> ${url} (${cache_control:-yok})"
  return 1
}

main() {
  log "Doğrulama testleri başlatılıyor..."
  log "Ön Yüz Adresi (Frontend): ${INDEX_URL}"
  log "Arka Plan Sağlık Adresi (Backend Health): ${API_HEALTH_URL}"

  # Servisler yeni yeniden başlatıldığı için hazır olmalarını bekle
  wait_for_url "$INDEX_URL"
  wait_for_url "$API_HEALTH_URL"
  wait_for_url "$API_ROOT_URL"

  local index_status api_health_status api_root_status
  index_status="$(http_code "$INDEX_URL" 2>/dev/null || echo "000")"
  api_health_status="$(http_code "$API_HEALTH_URL" 2>/dev/null || echo "000")"
  api_root_status="$(http_code "$API_ROOT_URL" 2>/dev/null || echo "000")"

  # Durum Kodu Kontrolleri
  require_status_in "$INDEX_URL" "$index_status" 200
  require_status_in "$API_HEALTH_URL" "$api_health_status" 200
  require_status_in "$API_ROOT_URL" "$api_root_status" 200

  # API Yanıt İçeriği Kontrolü (FastAPI health endpoint "healthy" dönmeli)
  local health_payload
  health_payload="$(curl --connect-timeout 5 --max-time 15 -fsS "$API_HEALTH_URL" 2>/dev/null || echo "")"
  if [[ "$health_payload" != *"healthy"* ]]; then
    log "HATA: API sağlık yanıtı beklenen içeriği barındırmıyor: ${health_payload}"
    return 1
  fi
  log "BAŞARILI: API sağlıklı yanıt verdi (healthy)"

  # Tarayıcı Önbellek (Cache-Control) Başlık Kontrolleri
  # Ana sayfanın önbelleklenmesini önlemek için no-store/no-cache başlığı olmalıdır
  require_no_store "$INDEX_URL"

  log "Doğrulama testleri başarıyla tamamlandı!"
}

main "$@"
