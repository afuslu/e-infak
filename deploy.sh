#!/usr/bin/env bash
set -Eeuo pipefail

# ═══════════════════════════════════════════════════════════════
# E-İnfak 2.0 — Blue/Green Zero-Downtime Production Deploy
# ═══════════════════════════════════════════════════════════════
# Ubuntu 22.04+ / Nginx / PM2 / PostgreSQL / Redis, Docker'sız.
#
# Backend  : Uvicorn (FastAPI)    → blue 8020 / green 8021
# Frontend : Next.js (next start) → blue 3000 / green 3001
# Celery   : Worker + Beat
#
# E-Medrese blue/green deploy modelinden uyarlanmıştır.
# ═══════════════════════════════════════════════════════════════

PROJECT_DIR="${PROJECT_DIR:-/var/www/e-infak}"
RELEASES_DIR="${RELEASES_DIR:-${PROJECT_DIR}/releases}"
SLOTS_DIR="${SLOTS_DIR:-${PROJECT_DIR}/slots}"
LOG_DIR="${LOG_DIR:-${PROJECT_DIR}/deploy-logs}"
BACKEND_ACTIVE_LINK="${BACKEND_ACTIVE_LINK:-${PROJECT_DIR}/backend-active}"
FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-https://hicretdernegi.org}"
NGINX_RUNTIME_DIR="${NGINX_RUNTIME_DIR:-/etc/nginx/e-infak}"
NGINX_BACKEND_FILE="${NGINX_BACKEND_FILE:-${NGINX_RUNTIME_DIR}/backend-active.conf}"
NGINX_FRONTEND_FILE="${NGINX_FRONTEND_FILE:-${NGINX_RUNTIME_DIR}/frontend-active.conf}"
ACTIVE_SLOT_FILE="${ACTIVE_SLOT_FILE:-${NGINX_RUNTIME_DIR}/active-slot}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-/var/lock/e-infak-deploy.lock}"
PUBLIC_DOMAINS="${PUBLIC_DOMAINS:-hicretdernegi.org,kardeslikpayi.org}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
RUN_BACKEND_TESTS="${RUN_BACKEND_TESTS:-0}"
RUN_FRONTEND_TYPECHECK="${RUN_FRONTEND_TYPECHECK:-1}"
RUN_POST_DEPLOY_SMOKE="${RUN_POST_DEPLOY_SMOKE:-1}"
DEPLOY_REF="${DEPLOY_REF:-origin/main}"

# Veritabanı yedeği (migration öncesi zorunlu güvenlik ağı)
RUN_DB_BACKUP="${RUN_DB_BACKUP:-1}"
DB_BACKUP_DIR="${DB_BACKUP_DIR:-${PROJECT_DIR}/backups}"
DB_BACKUP_KEEP="${DB_BACKUP_KEEP:-10}"

TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
LOG_FILE=""
RELEASE_PATH=""
APP_BUILD_ID=""
TARGET_COMMIT=""
NEW_SLOT=""
OLD_SLOT=""
NEW_BACKEND_PORT=""
NEW_FRONTEND_PORT=""
OLD_BACKEND_PORT=""
OLD_FRONTEND_PORT=""
NEW_BACKEND_PROCESS=""
NEW_FRONTEND_PROCESS=""
OLD_BACKEND_PROCESS=""
OLD_FRONTEND_PROCESS=""
OLD_BACKEND_LINK_TARGET=""
CUTOVER_STARTED=0
CUTOVER_DONE=0
DEPLOY_SUCCEEDED=0
OLD_CELERY_WORKER_PRESENT=0
OLD_CELERY_BEAT_PRESENT=0

# ─── Yardımcı Fonksiyonlar ─────────────────────────────────

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  log "HATA: $*"
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    if [[ "$1" == "pnpm" || "$1" == "pm2" ]]; then
      die "Zorunlu komut bulunamadı: $1 — nvm kullanıyorsanız root PATH'inde yoktur; 'sudo env \"PATH=\$PATH\" bash deploy.sh' ile çalıştırın."
    fi
    die "Zorunlu komut bulunamadı: $1"
  fi
}

pm2_process_online() {
  pm2 describe "$1" 2>/dev/null | grep -Eiq 'status[^a-z]*online'
}

stop_process_if_present() {
  local process_name="$1"
  if pm2 describe "$process_name" >/dev/null 2>&1; then
    pm2 stop "$process_name" >/dev/null 2>&1 || true
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"
  local i
  for ((i = 1; i <= attempts; i += 1)); do
    if curl --connect-timeout 3 --max-time 10 -fsS "$url" >/dev/null 2>&1; then
      log "${label} hazır (${i}/${attempts})."
      return 0
    fi
    sleep 2
  done
  log "${label} hazır olmadı: ${url}"
  return 1
}

write_upstream_file() {
  local destination="$1"
  local port="$2"
  local temporary="${destination}.new.$$"
  printf 'server 127.0.0.1:%s max_fails=3 fail_timeout=10s;\n' "$port" > "$temporary"
  chmod 0644 "$temporary"
  mv -f "$temporary" "$destination"
}

# ─── Rollback ──────────────────────────────────────────────

rollback() {
  local exit_code="${1:-1}"
  set +e
  trap - ERR
  log "Deployment başarısız; güvenli geri dönüş başlatılıyor."

  if [[ "$CUTOVER_STARTED" -eq 1 ]]; then
    # Nginx upstream'leri eski portlara geri çevir
    if [[ -n "$OLD_BACKEND_PORT" ]]; then
      write_upstream_file "$NGINX_BACKEND_FILE" "$OLD_BACKEND_PORT"
    fi
    if [[ -n "$OLD_FRONTEND_PORT" ]]; then
      write_upstream_file "$NGINX_FRONTEND_FILE" "$OLD_FRONTEND_PORT"
    fi

    # Backend active symlink'i eski release'e geri al
    if [[ -n "$OLD_BACKEND_LINK_TARGET" && -e "$OLD_BACKEND_LINK_TARGET" ]]; then
      ln -sfn "$OLD_BACKEND_LINK_TARGET" "${BACKEND_ACTIVE_LINK}.rollback"
      mv -Tf "${BACKEND_ACTIVE_LINK}.rollback" "$BACKEND_ACTIVE_LINK"
    fi

    if nginx -t; then
      systemctl reload nginx
    fi

    # Celery süreçlerini eski release'den geri başlat
    if [[ -n "$OLD_BACKEND_LINK_TARGET" ]]; then
      local old_release_root
      old_release_root="$(dirname "$(dirname "$OLD_BACKEND_LINK_TARGET")")"
      if [[ -f "$old_release_root/deploy/pm2/ecosystem.config.cjs" ]]; then
        if [[ "$OLD_CELERY_WORKER_PRESENT" -eq 1 ]]; then
          pm2 delete einfak-celery-worker >/dev/null 2>&1 || true
          EINFAK_ROOT="$PROJECT_DIR" pm2 start "$old_release_root/deploy/pm2/ecosystem.config.cjs" \
            --only einfak-celery-worker --update-env >/dev/null 2>&1 || true
        fi
        if [[ "$OLD_CELERY_BEAT_PRESENT" -eq 1 ]]; then
          pm2 delete einfak-celery-beat >/dev/null 2>&1 || true
          EINFAK_ROOT="$PROJECT_DIR" pm2 start "$old_release_root/deploy/pm2/ecosystem.config.cjs" \
            --only einfak-celery-beat --update-env >/dev/null 2>&1 || true
        fi
      fi
    fi
  fi

  stop_process_if_present "$NEW_BACKEND_PROCESS"
  stop_process_if_present "$NEW_FRONTEND_PROCESS"
  log "Veritabanı migration'ları otomatik geri alınmadı; deploy yedeği korundu."
  log "Başarısız release inceleme için bırakıldı: ${RELEASE_PATH:-<oluşmadı>}"
  exit "$exit_code"
}

on_error() {
  local exit_code="$?"
  local line_number="${1:-?}"
  log "Komut ${line_number}. satırda başarısız oldu (exit=${exit_code})."
  rollback "$exit_code"
}

trap 'on_error $LINENO' ERR

# ─── 1. Preflight Kontrolleri ──────────────────────────────

preflight() {
  [[ "$EUID" -eq 0 ]] || die "Deploy root yetkisiyle çalıştırılmalıdır."
  for command_name in git curl pnpm python3 pm2 nginx systemctl flock tar pg_dump; do
    require_command "$command_name"
  done

  [[ -d "$PROJECT_DIR/.git" ]] || die "Git deposu bulunamadı: ${PROJECT_DIR}"
  [[ -f "$PROJECT_DIR/deploy/pm2/ecosystem.config.cjs" ]] || die "PM2 production tanımı eksik."
  [[ -f "$PROJECT_DIR/scripts/post_deploy_smoke.sh" ]] || die "Post-deploy smoke scripti eksik."
  [[ -f "$NGINX_BACKEND_FILE" && -f "$NGINX_FRONTEND_FILE" && -f "$ACTIVE_SLOT_FILE" ]] || \
    die "Production runtime kurulmamış. Önce Nginx upstream dosyalarını ve active-slot dosyasını oluşturun."
  [[ -f "$PROJECT_DIR/services/backend/.env" ]] || die "Production services/backend/.env bulunamadı."

  systemctl is-active --quiet nginx || die "Nginx aktif değil."
  systemctl is-active --quiet postgresql || die "PostgreSQL aktif değil."
  if ! systemctl is-active --quiet redis-server && ! systemctl is-active --quiet redis; then
    die "Redis aktif değil."
  fi
  nginx -t

  git -C "$PROJECT_DIR" checkout -- . 2>/dev/null || true
  local tracked_changes
  tracked_changes="$(git -C "$PROJECT_DIR" status --porcelain --untracked-files=no)"
  [[ -z "$tracked_changes" ]] || die "Sunucuda commit edilmemiş takipli kaynak kod değişikliği var."

  local available_kb
  available_kb="$(df -Pk "$PROJECT_DIR" | awk 'NR==2 {print $4}')"
  [[ "${available_kb:-0}" -ge 2097152 ]] || die "Deploy için en az 2 GB boş disk gerekli."
}

# ─── 2. Slot Seçimi ────────────────────────────────────────

select_slots() {
  OLD_SLOT="$(tr -d '[:space:]' < "$ACTIVE_SLOT_FILE")"
  case "$OLD_SLOT" in
    blue)
      NEW_SLOT="green"
      OLD_BACKEND_PORT="8020"
      OLD_FRONTEND_PORT="3000"
      NEW_BACKEND_PORT="8021"
      NEW_FRONTEND_PORT="3001"
      ;;
    green)
      NEW_SLOT="blue"
      OLD_BACKEND_PORT="8021"
      OLD_FRONTEND_PORT="3001"
      NEW_BACKEND_PORT="8020"
      NEW_FRONTEND_PORT="3000"
      ;;
    *)
      die "Geçersiz aktif slot: ${OLD_SLOT}"
      ;;
  esac
  NEW_BACKEND_PROCESS="einfak-backend-${NEW_SLOT}"
  NEW_FRONTEND_PROCESS="einfak-frontend-${NEW_SLOT}"
  OLD_BACKEND_PROCESS="einfak-backend-${OLD_SLOT}"
  OLD_FRONTEND_PROCESS="einfak-frontend-${OLD_SLOT}"
}

# ─── 3. Release Hazırlığı ──────────────────────────────────

prepare_release() {
  log "Git kaynağı güncelleniyor: ${DEPLOY_REF}"
  git -C "$PROJECT_DIR" fetch --prune origin
  TARGET_COMMIT="$(git -C "$PROJECT_DIR" rev-parse "$DEPLOY_REF")"
  APP_BUILD_ID="$(git -C "$PROJECT_DIR" rev-parse --short=12 "$TARGET_COMMIT")-${TIMESTAMP}"
  RELEASE_PATH="${RELEASES_DIR}/release_${APP_BUILD_ID}"
  [[ ! -e "$RELEASE_PATH" ]] || die "Release yolu zaten var: ${RELEASE_PATH}"

  mkdir -p "$RELEASE_PATH"
  git -C "$PROJECT_DIR" archive "$TARGET_COMMIT" | tar -x -C "$RELEASE_PATH"

  # Backend .env symlink
  ln -s "$PROJECT_DIR/services/backend/.env" "$RELEASE_PATH/services/backend/.env"

  # Backend media klasörü symlink (varsa)
  if [[ -d "$PROJECT_DIR/services/backend/media" ]]; then
    ln -s "$PROJECT_DIR/services/backend/media" "$RELEASE_PATH/services/backend/media"
  fi

  # Frontend env dosyaları symlink
  for env_file in .env .env.production .env.local; do
    if [[ -f "$PROJECT_DIR/apps/web/$env_file" ]]; then
      ln -s "$PROJECT_DIR/apps/web/$env_file" "$RELEASE_PATH/apps/web/$env_file"
    fi
  done

  log "Release hazırlandı: ${RELEASE_PATH}"
}

# ─── 4. Release Derleme ────────────────────────────────────

build_release() {
  log "Release Python ortamı oluşturuluyor."
  python3 -m venv "$RELEASE_PATH/services/backend/venv"
  "$RELEASE_PATH/services/backend/venv/bin/pip" install --disable-pip-version-check --upgrade pip
  "$RELEASE_PATH/services/backend/venv/bin/pip" install --disable-pip-version-check \
    -r "$RELEASE_PATH/services/backend/requirements.txt"

  log "Frontend bağımlılıkları ve build hazırlanıyor (pnpm monorepo)."
  (
    cd "$RELEASE_PATH"
    pnpm install --frozen-lockfile
    if [[ "$RUN_FRONTEND_TYPECHECK" == "1" ]]; then
      log "TypeScript tip kontrolü çalıştırılıyor..."
      apps/web/node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json
    fi
    log "Next.js derlemesi başlatılıyor..."
    cd apps/web
    NODE_OPTIONS="--max-old-space-size=2048" npx next build
  )

  log "Frontend build başarıyla tamamlandı."
}

# ─── 5. Kalite Kapıları ────────────────────────────────────

run_quality_gates() {
  log "Deploy öncesi kalite kontrolleri çalıştırılıyor."
  (
    cd "$RELEASE_PATH"

    # Python derleme kontrolü
    log "Backend Python derleme kontrolü yapılıyor..."
    find services/backend/app -name "*.py" -exec \
      "$RELEASE_PATH/services/backend/venv/bin/python3" -m py_compile {} +
    log "✅ Backend kod derleme kontrolü başarılı."

    # Opsiyonel backend testleri
    if [[ "$RUN_BACKEND_TESTS" == "1" ]]; then
      log "Backend testleri çalıştırılıyor..."
      cd services/backend
      venv/bin/python -m pytest tests/ --tb=short -q
      cd "$RELEASE_PATH"
    fi
  )
}

# ─── 6. Veritabanı Yedeği ──────────────────────────────────

resolve_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    printf '%s' "$DATABASE_URL"
    return 0
  fi
  local env_file="${PROJECT_DIR}/services/backend/.env"
  if [[ -f "$env_file" ]]; then
    grep -E '^DATABASE_URL=' "$env_file" | tail -1 | cut -d= -f2- | sed -e "s/^[\"']//" -e "s/[\"']$//"
  fi
}

run_db_backup() {
  if [[ "$RUN_DB_BACKUP" != "1" ]]; then
    log "ℹ️  Migration öncesi veritabanı yedeği atlandı (RUN_DB_BACKUP=0)."
    return 0
  fi

  local raw_url
  raw_url="$(resolve_database_url)"
  if [[ -z "$raw_url" ]]; then
    die "DATABASE_URL bulunamadı; migration öncesi güvenlik yedeği alınamıyor."
  fi

  # SQLAlchemy sürücü ekini pg_dump için libpq URL'ine çevir
  local pg_url="$raw_url"
  pg_url="${pg_url/postgresql+asyncpg:/postgresql:}"
  pg_url="${pg_url/postgresql+psycopg2:/postgresql:}"
  pg_url="${pg_url/postgres+asyncpg:/postgres:}"

  mkdir -p "$DB_BACKUP_DIR"
  local stamp out
  stamp="$(date +%Y%m%d_%H%M%S)"
  out="${DB_BACKUP_DIR}/einfak_pre_migration_${stamp}.dump"
  log "💾 Migration öncesi veritabanı yedeği alınıyor -> ${out}"
  if ! pg_dump "$pg_url" -Fc -f "$out"; then
    die "Veritabanı yedeği başarısız oldu; migration ÇALIŞTIRILMAYACAK."
  fi
  log "✅ Yedek tamam ($(du -h "$out" | cut -f1)). Geri yükleme: pg_restore -c -d <db> \"${out}\""

  # Eski yedekleri temizle (yalnızca son $DB_BACKUP_KEEP tanesini tut)
  ls -1t "${DB_BACKUP_DIR}"/einfak_pre_migration_*.dump 2>/dev/null \
    | tail -n +"$((DB_BACKUP_KEEP + 1))" | xargs -r rm -f || true
}

# ─── 7. Veritabanı Migration ───────────────────────────────

run_migrations() {
  log "🗄️  Veritabanı göçleri (Alembic migration) uygulanıyor..."
  (
    cd "$RELEASE_PATH/services/backend"
    venv/bin/alembic upgrade head
  )
  log "✅ Alembic migration başarıyla uygulandı."
}

# ─── 8. Pasif Slot'u Başlat ────────────────────────────────

start_inactive_slot() {
  local ecosystem="$RELEASE_PATH/deploy/pm2/ecosystem.config.cjs"
  local slot_link="${SLOTS_DIR}/${NEW_SLOT}"

  # Eski süreçleri temizle
  stop_process_if_present "$NEW_BACKEND_PROCESS"
  stop_process_if_present "$NEW_FRONTEND_PROCESS"
  pm2 delete "$NEW_BACKEND_PROCESS" >/dev/null 2>&1 || true
  pm2 delete "$NEW_FRONTEND_PROCESS" >/dev/null 2>&1 || true

  # Slot symlink'i güncelle
  ln -sfn "$RELEASE_PATH" "${slot_link}.new"
  mv -Tf "${slot_link}.new" "$slot_link"

  # Backend ve Frontend'i yeni slot'ta başlat
  EINFAK_ROOT="$PROJECT_DIR" pm2 start "$ecosystem" --only "$NEW_BACKEND_PROCESS" --update-env
  EINFAK_ROOT="$PROJECT_DIR" pm2 start "$ecosystem" --only "$NEW_FRONTEND_PROCESS" --update-env

  # Sağlık kontrollerini bekle
  wait_for_url "http://127.0.0.1:${NEW_BACKEND_PORT}/health" "Yeni backend (Uvicorn)"
  wait_for_url "http://127.0.0.1:${NEW_FRONTEND_PORT}/" "Yeni frontend (Next.js)"
  pm2_process_online "$NEW_BACKEND_PROCESS" || die "${NEW_BACKEND_PROCESS} online değil."
  pm2_process_online "$NEW_FRONTEND_PROCESS" || die "${NEW_FRONTEND_PROCESS} online değil."
}

# ─── 9. Kullanıcı Onayı ────────────────────────────────────

prompt_user_approval() {
  if [[ "${AUTO_APPROVE:-0}" == "1" ]]; then
    log "AUTO_APPROVE=1 algılandı; manuel onay adımı otomatik geçiliyor."
    return 0
  fi

  printf '\n'
  printf '=========================================================================\n'
  printf '  ✅ YENİ SÜRÜM BAŞARIYLA DERLENDİ VE GİZLİ TEST SLOTUNDA AÇILDI!\n'
  printf '=========================================================================\n'
  printf '  🌐 Test Backend  (Uvicorn):  http://127.0.0.1:%s/health\n' "$NEW_BACKEND_PORT"
  printf '  🌐 Test Frontend (Next.js):  http://127.0.0.1:%s\n' "$NEW_FRONTEND_PORT"
  printf '  📦 Derlenen Sürüm Build ID:  %s\n' "$APP_BUILD_ID"
  printf '  🔒 Aktif Canlı Sürüm (Slot):  %s (Değişmedi, Canlı Etkilenmedi)\n' "$OLD_SLOT"
  printf '  🆕 Hazırlanan Yeni Sürüm (Slot): %s\n' "$NEW_SLOT"
  printf '%s\n' '-------------------------------------------------------------------------'
  printf '  Canlıdaki kullanıcılar HALEN eski sürümü (%s) kesintisiz kullanıyor.\n' "$OLD_SLOT"
  printf '  Lütfen yeni sürümü test edin.\n'
  printf '\n'

  local response=""
  if [[ -c /dev/tty ]]; then
    read -r -p "Yeni sürümü onaylayıp CANLIYA aktarmak istiyor musunuz? [E/h]: " response < /dev/tty || response="e"
  else
    read -r response || response="e"
  fi

  response="$(echo "$response" | tr '[:upper:]' '[:lower:]')"
  if [[ "$response" == "e" || "$response" == "evet" || "$response" == "y" || "$response" == "yes" || -z "$response" ]]; then
    log "Manuel Onay Alındı! Trafik canlıya aktarılıyor..."
    return 0
  else
    log "Kullanıcı Onayı REDDEDİLDİ. Deploy iptal ediliyor ve eski sürümde kalınıyor."
    die "Deploy kullanıcı tarafından reddedildi."
  fi
}

# ─── 10. Trafik Geçişi (Cutover) ──────────────────────────

cutover() {
  OLD_BACKEND_LINK_TARGET="$(readlink -f "$BACKEND_ACTIVE_LINK" 2>/dev/null || true)"
  CUTOVER_STARTED=1

  # Backend active symlink'i yeni release'e geçir
  ln -sfn "$RELEASE_PATH/services/backend" "${BACKEND_ACTIVE_LINK}.new"
  mv -Tf "${BACKEND_ACTIVE_LINK}.new" "$BACKEND_ACTIVE_LINK"

  # Nginx upstream dosyalarını yeni portlara geçir
  write_upstream_file "$NGINX_BACKEND_FILE" "$NEW_BACKEND_PORT"
  write_upstream_file "$NGINX_FRONTEND_FILE" "$NEW_FRONTEND_PORT"

  nginx -t
  systemctl reload nginx
  CUTOVER_DONE=1
  log "Trafik ${NEW_SLOT} slotuna geçirildi."
}

# ─── 11. Canlı Doğrulama ──────────────────────────────────

verify_release() {
  log "Canlı sürüm ve servis sağlık kontrolleri çalıştırılıyor."
  if [[ "$RUN_POST_DEPLOY_SMOKE" == "1" ]]; then
    FRONTEND_BASE_URL="$FRONTEND_BASE_URL" \
      API_HEALTH_URL="http://127.0.0.1:${NEW_BACKEND_PORT}/health" \
      API_ROOT_URL="http://127.0.0.1:${NEW_BACKEND_PORT}/" \
      PUBLIC_DOMAINS="$PUBLIC_DOMAINS" \
      bash "$RELEASE_PATH/scripts/post_deploy_smoke.sh"
  fi

  sleep 10
  pm2_process_online "$NEW_BACKEND_PROCESS" || die "Yeni backend doğrulama sırasında kapandı."
  pm2_process_online "$NEW_FRONTEND_PROCESS" || die "Yeni frontend doğrulama sırasında kapandı."
  wait_for_url "http://127.0.0.1:${NEW_BACKEND_PORT}/health" "Canlı backend health" 10
}

# ─── 12. Celery İşçilerini Başlat ──────────────────────────

start_background_workers() {
  local ecosystem="$RELEASE_PATH/deploy/pm2/ecosystem.config.cjs"
  if pm2 describe einfak-celery-worker >/dev/null 2>&1; then
    OLD_CELERY_WORKER_PRESENT=1
  fi
  if pm2 describe einfak-celery-beat >/dev/null 2>&1; then
    OLD_CELERY_BEAT_PRESENT=1
  fi
  local worker_names=()
  [[ "$OLD_CELERY_WORKER_PRESENT" -eq 1 ]] && worker_names+=(einfak-celery-worker)
  [[ "$OLD_CELERY_BEAT_PRESENT" -eq 1 ]] && worker_names+=(einfak-celery-beat)
  if [[ "${#worker_names[@]}" -eq 0 ]]; then
    log "Celery PM2 süreçleri mevcut değil; worker/beat başlatılmadı."
    return 0
  fi
  for process_name in "${worker_names[@]}"; do
    if pm2 describe "$process_name" >/dev/null 2>&1; then
      pm2 delete "$process_name"
    fi
    EINFAK_ROOT="$PROJECT_DIR" pm2 start "$ecosystem" --only "$process_name" --update-env
    pm2_process_online "$process_name" || die "${process_name} online değil."
  done
}

# ─── 13. Finalize ─────────────────────────────────────────

finalize_release() {
  # Aktif slot dosyasını güncelle
  printf '%s\n' "$NEW_SLOT" > "${ACTIVE_SLOT_FILE}.new"
  mv -f "${ACTIVE_SLOT_FILE}.new" "$ACTIVE_SLOT_FILE"

  # Eski slot süreçlerini durdur
  stop_process_if_present "$OLD_BACKEND_PROCESS"
  stop_process_if_present "$OLD_FRONTEND_PROCESS"

  # PM2 durumunu kaydet
  pm2 save

  # Eski release'leri temizle (son $KEEP_RELEASES tanesini tut)
  mapfile -t old_releases < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -name 'release_*' -printf '%T@ %p\n' | sort -rn | awk '{print $2}')
  local index
  for ((index = KEEP_RELEASES; index < ${#old_releases[@]}; index += 1)); do
    if [[ "${old_releases[$index]}" != "$RELEASE_PATH" ]]; then
      rm -rf "${old_releases[$index]}"
    fi
  done

  DEPLOY_SUCCEEDED=1
  log "═══════════════════════════════════════════"
  log "✅ E-İnfak Deployment Başarıyla Tamamlandı!"
  log "📦 Build:       ${APP_BUILD_ID}"
  log "🎯 Aktif slot:  ${NEW_SLOT}"
  log "🧾 Commit:      $(git -C "$PROJECT_DIR" rev-parse --short HEAD)"
  log "═══════════════════════════════════════════"
}

# ─── Ana Akış ──────────────────────────────────────────────

main() {
  AUTO_APPROVE="${AUTO_APPROVE:-0}"
  for arg in "$@"; do
    case "$arg" in
      --auto|--yes|-y|--non-interactive)
        AUTO_APPROVE=1
        ;;
    esac
  done

  mkdir -p "$LOG_DIR"
  LOG_FILE="${LOG_DIR}/deploy_${TIMESTAMP}.log"
  exec > >(tee -a "$LOG_FILE") 2>&1

  exec 9>"$DEPLOY_LOCK_FILE"
  flock -n 9 || die "Başka bir deploy işlemi devam ediyor."

  log "E-İnfak blue-green deployment başladı."
  cd "$PROJECT_DIR"

  preflight
  select_slots
  mkdir -p "$RELEASES_DIR" "$SLOTS_DIR"

  prepare_release
  build_release
  run_quality_gates
  run_db_backup
  run_migrations
  start_inactive_slot

  prompt_user_approval

  cutover
  verify_release
  start_background_workers
  finalize_release
}

main "$@"
