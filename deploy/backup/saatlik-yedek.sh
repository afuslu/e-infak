#!/usr/bin/env bash
# Saatlik veritabanı yedeği (root): şifreler, Drive'a yükler, 48 saat saklar.
#   PROJE=e-infak (varsayılan) → e-infak-yedek/saatlik     PROJE=e-medrese → e-medrese-yedek/saatlik
# Medya ve kurum klasörleri gecelik yedektedir.
set -Eeuo pipefail
umask 077
# shellcheck source=deploy/backup/ortak.sh
source "${ORTAK:-/usr/local/lib/e-infak-yedek-ortak.sh}" || exit 1

PROJE="${PROJE:-e-infak}"
BAKIM_KILIDI=""
case "$PROJE" in
  e-infak)
    ADI="E-İnfak"; DB=einfak-db-1; DB_KULLANICI=einfak; DB_ADI=einfak
    YEDEK_DIZIN="${YEDEK_DIZIN:-/var/yedek/e-infak}/saatlik"; SINYAL="$SINYAL_SAATLIK" ;;
  e-medrese)
    ADI="E-Medrese"; DB=emedrese-db-1; DB_KULLANICI=emedrese_admin; DB_ADI=emedrese_db
    YEDEK_DIZIN="${YEDEK_DIZIN:-/var/yedek/e-medrese-saatlik}"; SINYAL="$SINYAL_EMEDRESE_SAATLIK"
    BAKIM_KILIDI="${EMEDRESE_KILIT:-/opt/e_medrese/runtime/maintenance.lock}" ;;
  *) echo "Bilinmeyen proje: $PROJE" >&2; exit 2 ;;
esac
ONEK="${PROJE}_saatlik"
PAROLA_DOSYASI="${PAROLA_DOSYASI:-/root/.yedek-sifre}"
HEDEF="${RCLONE_REMOTE:-drive:}$PROJE-yedek/saatlik"
UYARI_KOMUTU="${UYARI_KOMUTU:-/usr/local/sbin/e-medrese-yedek-uyari}"
SAKLA_SAAT="${SAKLA_SAAT:-48}"
EN_AZ_BOS_MB="${EN_AZ_BOS_MB:-5120}"

[[ "$EUID" -eq 0 ]] || { echo "root gerekli" >&2; exit 1; }
mkdir -p "$YEDEK_DIZIN"
chmod 700 "$YEDEK_DIZIN"
exec 9>"$YEDEK_DIZIN/.kilit"
flock -n 9 || { echo "Önceki saatlik yedek sürüyor; bu tur atlandı"; exit 0; }

AD="${ONEK}_$(date '+%Y%m%d_%H%M%S').dump.gpg"
DURUM="$YEDEK_DIZIN/.durum"
NEDEN="Yedek alınamadı"
CALISMA=""
ATLANDI=0

uyar() { [[ -x "$UYARI_KOMUTU" ]] && "$UYARI_KOMUTU" "$1" "$2"; }

bitir() {
  local kod=$? onceki
  if [[ -n "$CALISMA" ]]; then rm -rf "${CALISMA:?}"; fi
  onceki="$(cat "$DURUM" 2>/dev/null || true)"
  # Her saat e-posta gelmesin: yalnızca bozulduğunda ve düzeldiğinde bildirilir.
  if (( kod != 0 )); then
    echo "HATA: $NEDEN" >&2
    if [[ "$onceki" != hatali ]] &&
      uyar "$ADI saatlik yedeği başarısız" "$NEDEN. Düzelene kadar yeniden bildirilmez. Ayrıntı: journalctl -u $PROJE-saatlik"; then
      echo hatali >"$DURUM" || true
    fi
  elif (( ! ATLANDI )) && [[ "$onceki" == hatali ]]; then
    uyar "$ADI saatlik yedeği düzeldi" "Son yedek: $AD" || true
    echo iyi >"$DURUM" || true
  fi
  exit "$kod"
}
trap bitir EXIT
trap 'exit 143' TERM INT
find "$YEDEK_DIZIN" -maxdepth 1 -type d -name '.hazirlaniyor.*' -exec rm -rf {} +
CALISMA="$(mktemp -d "$YEDEK_DIZIN/.hazirlaniyor.XXXXXX")"

NEDEN="Şifre dosyası yok"
[[ -s "$PAROLA_DOSYASI" ]] || exit 1
NEDEN="Diskte ${EN_AZ_BOS_MB} MB boş alan kalmadı"
BOS_MB="$(df -Pk "$YEDEK_DIZIN" | awk 'NR==2 {print int($4 / 1024)}')"
(( BOS_MB >= EN_AZ_BOS_MB )) || exit 1
NEDEN="Veritabanı dökümü alınamadı"
if [[ -n "$BAKIM_KILIDI" ]]; then
  # E-Medrese yayını/yedeği sürerken araya girmeyelim; kilit yalnızca döküm boyunca tutulur.
  exec 8<"$BAKIM_KILIDI"
  flock -n 8 || { echo "E-Medrese yayını veya yedeği sürüyor; bu tur atlandı"; ATLANDI=1; exit 0; }
fi
docker exec "$DB" pg_dump -U "$DB_KULLANICI" -Fc --no-owner --no-privileges "$DB_ADI" >"$CALISMA/database.dump" </dev/null
if [[ -n "$BAKIM_KILIDI" ]]; then exec 8<&-; fi
[[ -s "$CALISMA/database.dump" ]] || exit 1
docker exec -i "$DB" pg_restore --list <"$CALISMA/database.dump" >/dev/null
NEDEN="Şifreleme doğrulanamadı"
gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --pinentry-mode loopback \
  --passphrase-file "$PAROLA_DOSYASI" --output "$CALISMA/$AD" "$CALISMA/database.dump" </dev/null
gpg --batch --quiet --decrypt --pinentry-mode loopback --passphrase-file "$PAROLA_DOSYASI" \
  "$CALISMA/$AD" </dev/null | cmp - "$CALISMA/database.dump" || exit 1
mv "$CALISMA/$AD" "$YEDEK_DIZIN/$AD"
NEDEN="Google Drive'a yüklenemedi (sunucudaki kopya alındı)"
rclone copyto "$YEDEK_DIZIN/$AD" "$HEDEF/$AD" --retries 3 --low-level-retries 10 </dev/null
rclone check "$YEDEK_DIZIN" "$HEDEF" --one-way --include "/$AD" </dev/null
# E-Medrese'nin saatlik dosyaları büyük olabilir; kilitli depoya yalnızca gecelik paketi gider.
if [[ "$PROJE" == e-infak ]]; then
  NEDEN="Kilitli kopya yüklenemedi (Drive kopyası alındı)"
  kilitli_kopya "$YEDEK_DIZIN/$AD" e-infak-saatlik
fi
# Eskiler ancak yeni yedek Drive'da doğrulandıktan sonra silinir.
NEDEN="Yedek alındı, eskiler silinemedi"
rclone delete "$HEDEF" --min-age "${SAKLA_SAAT}h" --include "/${ONEK}_*.gpg" \
  --drive-use-trash=false </dev/null
find "$YEDEK_DIZIN" -maxdepth 1 -type f -name "${ONEK}_*.gpg" -mmin +"$((SAKLA_SAAT * 60))" -delete
sinyal "$SINYAL"
echo "✅ Saatlik yedek Drive'da: $AD"
