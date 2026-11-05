#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# E-İnfak 2.0 – Post-Deploy Smoke Test
# ═══════════════════════════════════════════════════════════════
# Bu betik, yeni dağıtım yapıldıktan sonra sitenin ve API'nin
# çalışır durumda olduğunu doğrular.
#
# Kontroller:
#   1. Frontend (Next.js SSR) — HTML yanıt kontrolü
#   2. Backend (FastAPI)      — /health endpoint "healthy" kontrolü
#   3. Çoklu Domain (HTTPS)   — hicretdernegi.org, kardeslikpayi.org
#   4. Cache-Control          — Dinamik sayfalar no-store olmalı
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# Değişken Tanımlamaları
BASE_URL="${FRONTEND_BASE_URL:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"
INDEX_URL="${INDEX_URL:-${BASE_URL}/}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:8020/health}"
API_ROOT_URL="${API_ROOT_URL:-http://127.0.0.1:8020/}"
PUBLIC_DOMAINS="${PUBLIC_DOMAINS:-hicretdernegi.org,kardeslikpayi.org}"

PASS_COUNT=0
FAIL_COUNT=0

log() {
  printf '[post-deploy-smoke] %s\n' "$1"
}

# HTTP Durum Kodunu Getiren Yardımcı Fonksiyon
http_code() {
  curl --connect-timeout 5 --max-time 15 -sS -o /dev/null -w '%{http_code}' -L "$1"
}

# Servis Ayağa Kalkana Kadar Bekleyen Yardımcı Fonksiyon
wait_for_url() {
  local url="$1"
  local max_attempts="${2:-10}"
  local delay="${3:-2}"
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
  return 1
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
      PASS_COUNT=$((PASS_COUNT + 1))
      return 0
    fi
  done

  log "HATA durum kodu ${code} -> ${url} (Beklenen: ${allowed[*]})"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  return 1
}

# Cache-Control no-store Başlığını Doğrulayan Fonksiyon
require_no_store() {
  local url="$1"
  local cache_control
  cache_control="$(extract_header "$url" "cache-control")"

  if [[ "$cache_control" == *"no-store"* || "$cache_control" == *"no-cache"* ]]; then
    log "BAŞARILI cache-control no-store/no-cache -> ${url} (${cache_control})"
    PASS_COUNT=$((PASS_COUNT + 1))
    return 0
  fi

  log "HATA cache-control -> ${url} (${cache_control:-yok})"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  return 1
}

# HTTP yanıt gövdesinde belirli bir string aranır
require_body_contains() {
  local url="$1"
  local expected="$2"
  local label="${3:-içerik}"
  local body
  body="$(curl --connect-timeout 5 --max-time 15 -fsS -L "$url" 2>/dev/null || echo "")"

  if [[ "$body" == *"$expected"* ]]; then
    log "BAŞARILI ${label} kontrolü -> ${url}"
    PASS_COUNT=$((PASS_COUNT + 1))
    return 0
  fi

  log "HATA ${label} kontrolü -> ${url} (beklenen: '${expected}')"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  return 1
}

main() {
  log "═══════════════════════════════════════════════════"
  log "Doğrulama testleri başlatılıyor..."
  log "Ön Yüz Adresi (Frontend): ${INDEX_URL}"
  log "Arka Plan Sağlık Adresi (Backend Health): ${API_HEALTH_URL}"
  log "═══════════════════════════════════════════════════"

  # Servisler yeni yeniden başlatıldığı için hazır olmalarını bekle
  wait_for_url "$INDEX_URL"
  wait_for_url "$API_HEALTH_URL"
  wait_for_url "$API_ROOT_URL"

  local index_status api_health_status api_root_status
  index_status="$(http_code "$INDEX_URL" 2>/dev/null || echo "000")"
  api_health_status="$(http_code "$API_HEALTH_URL" 2>/dev/null || echo "000")"
  api_root_status="$(http_code "$API_ROOT_URL" 2>/dev/null || echo "000")"

  # ── Durum Kodu Kontrolleri ──
  require_status_in "$INDEX_URL" "$index_status" 200
  require_status_in "$API_HEALTH_URL" "$api_health_status" 200
  require_status_in "$API_ROOT_URL" "$api_root_status" 200

  # ── API Yanıt İçeriği Kontrolü ──
  # FastAPI /health endpoint "healthy" dönmeli
  require_body_contains "$API_HEALTH_URL" "healthy" "API sağlık yanıtı"

  # ── Next.js SSR HTML Kontrolü ──
  # Ana sayfanın geçerli bir Next.js SSR sayfası olduğunu doğrula
  require_body_contains "$INDEX_URL" "__next" "Next.js SSR HTML"

  # ── Cache-Control Başlık Kontrolleri ──
  require_no_store "$INDEX_URL"

  # ── Çoklu Domain (DNS/TLS) Kontrolleri ──
  local domain domain_url domain_code
  IFS=',' read -r -a domains <<< "$PUBLIC_DOMAINS"
  for domain in "${domains[@]}"; do
    domain="${domain//[[:space:]]/}"
    [[ -z "$domain" ]] && continue
    domain_url="https://${domain}/"
    domain_code="$(http_code "$domain_url" 2>/dev/null || echo "000")"
    require_status_in "$domain_url" "$domain_code" 200
  done

  # ── Sonuç Raporu ──
  log "═══════════════════════════════════════════════════"
  log "Sonuç: ${PASS_COUNT} başarılı, ${FAIL_COUNT} başarısız"
  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    log "⚠️  Bazı doğrulama testleri başarısız oldu!"
    log "═══════════════════════════════════════════════════"
    return 1
  fi
  log "✅ Tüm doğrulama testleri başarıyla tamamlandı!"
  log "═══════════════════════════════════════════════════"
}

main "$@"
