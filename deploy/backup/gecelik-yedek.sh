#!/usr/bin/env bash
# E-İnfak gecelik yedeği (root). Her kurum Google Drive'da kendi klasörüne,
# bütün platform (veritabanı + medya + .env) e-infak-yedek klasörüne yüklenir.
# Bir kurumun hatası diğerlerini durdurmaz; sonunda çıkış kodu 1 olur ve e-posta gider.
set -uo pipefail
umask 077
# shellcheck source=deploy/backup/ortak.sh
source "${ORTAK:-/usr/local/lib/e-infak-yedek-ortak.sh}" || exit 1

DIZIN="${DIZIN:-/opt/e_infak}"
YEDEK_DIZIN="${YEDEK_DIZIN:-/var/yedek/e-infak}"
PAROLA_DOSYASI="${PAROLA_DOSYASI:-/root/.yedek-sifre}"
REMOTE="${RCLONE_REMOTE:-drive:}"
UYARI_KOMUTU="${UYARI_KOMUTU:-/usr/local/sbin/e-medrese-yedek-uyari}"
YEREL_GUN="${YEREL_GUN:-7}"
DRIVE_GUN="${DRIVE_GUN:-30}"
EMEDRESE_DIZIN="${EMEDRESE_DIZIN:-/var/yedek/e-medrese}"
DB=einfak-db-1
BACKEND=einfak-backend-1

ZAMAN="$(date '+%Y%m%d_%H%M%S')"
HATALAR=()
CALISMA=""
KILITLI=0

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
hata() { HATALAR+=("$1"); log "HATA: $1" >&2; }

bitir() {
  local kod=$?
  if [[ -n "$CALISMA" ]]; then rm -rf "${CALISMA:?}"; fi
  if (( KILITLI )); then docker exec "$BACKEND" rm -rf /data/media/_exports/_gecelik >/dev/null 2>&1 </dev/null; fi
  (( ${#HATALAR[@]} )) && kod=1
  if (( kod != 0 )); then
    if [[ -x "$UYARI_KOMUTU" ]]; then
      "$UYARI_KOMUTU" "E-İnfak gecelik yedeği başarısız" \
        "$(printf '%s\n' "$ZAMAN" "${HATALAR[@]:-Yedek yarıda kaldı}" "Ayrıntı: journalctl -u e-infak-yedek")" || true
    fi
    log "Yedekleme HATALI bitti"
  fi
  exit "$kod"
}
trap bitir EXIT
trap 'exit 143' TERM INT

dur() { hata "$1"; exit 1; }

[[ "$EUID" -eq 0 ]] || dur "root gerekli"
[[ -s "$PAROLA_DOSYASI" ]] || dur "Şifre dosyası yok: $PAROLA_DOSYASI"
mkdir -p "$YEDEK_DIZIN" || dur "$YEDEK_DIZIN açılamadı"
chmod 700 "$YEDEK_DIZIN"

# Yayınla çakışmasın: dagit.sh ile aynı kilit (en çok 30 dk beklenir).
KILIT="$DIZIN/runtime/dagit.lock"
if [[ ! -e "$KILIT" ]]; then touch "$KILIT" && chown --reference="$DIZIN/runtime" "$KILIT" && chmod 664 "$KILIT"; fi
exec 9<"$KILIT" || dur "Kilit açılamadı"
flock -w "${KILIT_BEKLE:-1800}" 9 || dur "Yayın sürüyor, kilit alınamadı"
KILITLI=1

find "$YEDEK_DIZIN" -maxdepth 1 -type d -name '.hazirlaniyor.*' -exec rm -rf {} +
CALISMA="$(mktemp -d "$YEDEK_DIZIN/.hazirlaniyor.XXXXXX")" || dur "Geçici klasör açılamadı"

# yukle <düz dosya> <paket adı> <drive klasörü>: şifrele, açılabildiğini sına, yükle, karşılaştır
yukle() {
  local kaynak="$1" ad="$2" hedef="${REMOTE}$3" paket="$YEDEK_DIZIN/$2" beklenen acilan
  beklenen="$(sha256sum <"$kaynak")" || return 1
  gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --pinentry-mode loopback \
    --passphrase-file "$PAROLA_DOSYASI" --output "$paket" "$kaynak" </dev/null || return 1
  acilan="$(gpg --batch --quiet --decrypt --pinentry-mode loopback \
    --passphrase-file "$PAROLA_DOSYASI" "$paket" </dev/null | sha256sum)" || return 1
  [[ "$beklenen" == "$acilan" ]] || return 1
  rclone copyto "$paket" "$hedef/$ad" --retries 3 --low-level-retries 10 </dev/null || return 1
  rclone check "$YEDEK_DIZIN" "$hedef" --one-way --include "/$ad" </dev/null || return 1
}

# Yalnızca bu betiğin dosyaları silinir. KVKK: çöp kutusunda da beklemez.
drive_temizle() {
  rclone delete "${REMOTE}$1" --min-age "${DRIVE_GUN}d" --include '/e-infak_*.gpg' \
    --drive-use-trash=false </dev/null || hata "$1: eski Drive yedekleri silinemedi"
}

calisma_bosalt() { find "${CALISMA:?}" -mindepth 1 -delete; }

sistem_yedegi() {
  log "Platform yedeği"
  local d="$CALISMA/sistem" kod=0
  mkdir -p "$d" || return 1
  docker exec "$DB" pg_dump -U einfak -Fc einfak >"$d/database.dump" </dev/null || return 1
  [[ -s "$d/database.dump" ]] || return 1
  docker exec -i "$DB" pg_restore --list <"$d/database.dump" >/dev/null || return 1
  # 1: okurken değişen dosya (canlı sistemde olağan); 2 ve üstü gerçek hata
  docker exec "$BACKEND" tar cf - --exclude=./_exports -C /data/media . >"$d/media.tar" </dev/null || kod=$?
  (( kod <= 1 )) || return 1
  tar tf "$d/media.tar" >/dev/null || return 1
  install -m 600 "$DIZIN/.env" "$d/env" || return 1
  cp "$DIZIN/runtime/aktif-surum" "$d/aktif-surum" || return 1
  (cd "$d" && sha256sum -- database.dump media.tar env aktif-surum >SHA256SUMS) || return 1
  tar czf "$CALISMA/sistem.tar.gz" -C "$d" . || return 1
  yukle "$CALISMA/sistem.tar.gz" "e-infak_sistem_$ZAMAN.tar.gz.gpg" e-infak-yedek || return 1
}

# Ayın ilk başarılı platform yedeği (ayın 1'i kaçsa bile) AYLIK_GUN saklanır.
aylik_yedek() {
  local ad="e-infak_sistem_$ZAMAN.tar.gz.gpg" hedef="${REMOTE}e-infak-yedek/aylik" var
  rclone mkdir "$hedef" </dev/null || return 1
  var="$(rclone lsf "$hedef" --files-only --include "/e-infak_sistem_${ZAMAN:0:6}*.gpg" </dev/null)" || return 1
  if [[ -z "$var" ]]; then
    log "Aylık yedek"
    rclone copyto "$YEDEK_DIZIN/$ad" "$hedef/$ad" --retries 3 </dev/null || return 1
    rclone check "$YEDEK_DIZIN" "$hedef" --one-way --include "/$ad" </dev/null || return 1
  fi
  rclone delete "$hedef" --min-age "${AYLIK_GUN}d" --include '/e-infak_sistem_*.gpg' \
    --drive-use-trash=false </dev/null || return 1
}

# E-Medrese'nin kendi gecelik paketi de kilitli depoya kopyalanır (yalnızca okunur).
emedrese_kopyasi() {
  local son
  son="$(find "$EMEDRESE_DIZIN" -maxdepth 1 -type f -name 'e-medrese_gece_*.tar.gz.gpg' -mmin -1560 | sort | tail -n 1)"
  [[ -n "$son" ]] || return 1
  kilitli_kopya "$son" e-medrese
}

kurum_yedegi() {
  local slug="$1" klasor="$2" zip="$CALISMA/$1.zip"
  local kap="/data/media/_exports/_gecelik/$slug.zip"
  log "Kurum yedeği: $slug → $klasor"
  docker exec "$BACKEND" python -m app.cli backup-org --org "$slug" --out "$kap" </dev/null || return 1
  docker exec "$BACKEND" cat "$kap" >"$zip" </dev/null || return 1
  docker exec "$BACKEND" rm -f "$kap" </dev/null || return 1
  [[ -s "$zip" ]] || return 1
  yukle "$zip" "e-infak_${slug}_$ZAMAN.zip.gpg" "$klasor" || return 1
}

BASARISIZ=" "
if sistem_yedegi; then
  drive_temizle e-infak-yedek
  aylik_yedek || hata "Aylık yedek alınamadı"
  kilitli_kopya "$YEDEK_DIZIN/e-infak_sistem_$ZAMAN.tar.gz.gpg" e-infak || hata "Kilitli kopya yüklenemedi"
else
  hata "Platform yedeği alınamadı"
fi
if [[ -n "$KILITLI_REMOTE" && -d "$EMEDRESE_DIZIN" ]]; then
  emedrese_kopyasi || hata "E-Medrese'nin kilitli kopyası yüklenemedi veya 26 saatten yeni yedeği yok"
fi
calisma_bosalt

if KURUMLAR="$(docker exec "$BACKEND" python -m app.cli list-orgs </dev/null | sed -n 's/^KURUM //p')" && [[ -n "$KURUMLAR" ]]; then
  while read -r slug; do
    if [[ ! "$slug" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]]; then hata "Geçersiz kurum kısa adı: $slug"; continue; fi
    klasor="$slug-yedek"
    case "$slug" in e-infak|e-medrese) klasor="kurum-$slug-yedek" ;; esac  # ana klasörlerle karışmasın
    kurum_yedegi "$slug" "$klasor" || { hata "Kurum yedeği alınamadı: $slug"; BASARISIZ+="$klasor "; }
    calisma_bosalt
  done <<<"$KURUMLAR"

  # Silinmiş kurumlarınkiler dahil. Bu gece yedeği alınamayan klasörden eski yedek silinmez.
  if KLASORLER="$(rclone lsf "$REMOTE" --dirs-only </dev/null)"; then
    while read -r k; do
      k="${k%/}"
      [[ "$k" == *-yedek && "$k" != e-medrese-yedek && "$k" != e-infak-yedek ]] || continue
      [[ "$BASARISIZ" == *" $k "* ]] || drive_temizle "$k"
    done <<<"$KLASORLER"
  else
    hata "Drive klasörleri listelenemedi"
  fi
else
  hata "Kurum listesi alınamadı"
fi

find "$YEDEK_DIZIN" -maxdepth 1 -type f -name 'e-infak_*.gpg' -mtime +"$YEREL_GUN" -delete
if (( ${#HATALAR[@]} == 0 )); then
  sinyal "$SINYAL_GECELIK"
  log "✅ Bütün yedekler Drive'da${KILITLI_REMOTE:+ ve kilitli depoda}"
fi
