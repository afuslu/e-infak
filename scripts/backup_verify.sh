#!/usr/bin/env bash
# PostgreSQL yedekleme ve otomatik geri yükleme (restore) doğrulama betiği.
# Kullanım: DATABASE_URL=postgresql://... ALERT_WEBHOOK_URL=https://... ./scripts/backup_verify.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/einfak_${STAMP}.dump"
VERIFY_DB="${VERIFY_DB:-einfak_backup_verify}"

notify_alert() {
  local msg="$1"
  echo "[ALERT] $msg" >&2
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"[e-İnfak Backup] ${msg}\"}" \
      "${ALERT_WEBHOOK_URL}" >/dev/null 2>&1 || true
  fi
}

trap 'notify_alert "Yedekleme veya doğrulama başarısız oldu (${STAMP})"' ERR

mkdir -p "${BACKUP_DIR}"
DB_URL="${DATABASE_URL:?DATABASE_URL tanımlı olmalıdır}"
# SQLAlchemy asyncpg URL'sini libpq formatına çevir
PG_URL="${DB_URL/postgresql+asyncpg:\/\//postgresql:\/\/}"

echo "[1/4] pg_dump alınıyor -> ${DUMP_FILE}"
pg_dump --format=custom --no-owner --no-acl "${PG_URL}" --file="${DUMP_FILE}"

if [[ ! -s "${DUMP_FILE}" ]]; then
  notify_alert "Yedek dosyası boş: ${DUMP_FILE}"
  exit 1
fi

echo "[2/4] Arşiv bütünlüğü kontrol ediliyor (pg_restore --list)"
pg_restore --list "${DUMP_FILE}" >/dev/null

if [[ "${VERIFY_RESTORE:-true}" == "true" ]]; then
  ADMIN_URL="${PG_URL%/*}/postgres"
  echo "[3/4] Geçici veritabanına geri yükleme testi (${VERIFY_DB})"
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${VERIFY_DB};"
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${VERIFY_DB};"
  pg_restore --no-owner --no-acl --dbname="${PG_URL%/*}/${VERIFY_DB}" "${DUMP_FILE}"
  TABLE_COUNT="$(psql "${PG_URL%/*}/${VERIFY_DB}" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${VERIFY_DB};"
  echo "Doğrulanan tablo sayısı: ${TABLE_COUNT}"
  if [[ "${TABLE_COUNT:-0}" -lt 5 ]]; then
    notify_alert "Geri yükleme doğrulamasında yetersiz tablo: ${TABLE_COUNT}"
    exit 1
  fi
fi

echo "[4/4] ${RETENTION_DAYS} günden eski yedekler temizleniyor"
find "${BACKUP_DIR}" -name 'einfak_*.dump' -type f -mtime +"${RETENTION_DAYS}" -delete

echo "Yedekleme ve doğrulama tamamlandı: ${DUMP_FILE}"
