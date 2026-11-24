#!/usr/bin/env bash
# Her sabah yedeklerin durumunu doğrudan Drive'daki dosyalardan okuyup e-postayla bildirir (root).
# Yalnızca okur; kişisel veri göndermez.
set -uo pipefail
export TZ=Europe/Istanbul
REMOTE="${RCLONE_REMOTE:-drive:}"
UYARI_KOMUTU="${UYARI_KOMUTU:-/usr/local/sbin/e-medrese-yedek-uyari}"
DISK="${DISK:-/}"
BACKEND=einfak-backend-1
SORUN=0
SATIRLAR=()

[[ "$EUID" -eq 0 ]] || { echo "root gerekli" >&2; exit 1; }
[[ -x "$UYARI_KOMUTU" ]] || { echo "E-posta betiği yok: $UYARI_KOMUTU" >&2; exit 1; }
ekle() { SATIRLAR+=("$1"); }
sorun() { SORUN=$((SORUN + 1)); ekle "❌ $1"; }

# son_yedek <ad> <klasör> <dosya kalıbı>: 26 saatten yeni ve dolu dosya var mı?
son_yedek() {
  local liste son zaman boyut
  if ! liste="$(rclone lsf "${REMOTE}$2" --files-only --format tsp --max-age 26h --include "/$3" </dev/null 2>/dev/null)"; then
    sorun "$1: Drive klasörü okunamadı ($2)"; return
  fi
  son="$(sort <<<"$liste" | tail -n 1)"
  IFS=';' read -r zaman boyut _ <<<"$son"
  if [[ -z "$son" ]]; then
    sorun "$1: son 26 saatte yedek yok"
  elif (( boyut < 1024 )); then
    sorun "$1: son yedek boş görünüyor ($boyut bayt)"
  else
    ekle "✅ $1: $zaman, $(awk -v b="$boyut" 'BEGIN { printf "%.1f MB", b / 1048576 }')"
  fi
}

son_yedek "E-Medrese" e-medrese-yedek/gunluk 'e-medrese_gece_*.tar.gz.gpg'
son_yedek "E-İnfak platform" e-infak-yedek 'e-infak_sistem_*.tar.gz.gpg'
if KURUMLAR="$(docker exec "$BACKEND" python -m app.cli list-orgs </dev/null 2>/dev/null | sed -n 's/^KURUM //p')" && [[ -n "$KURUMLAR" ]]; then
  while read -r slug; do
    klasor="$slug-yedek"
    case "$slug" in e-infak|e-medrese) klasor="kurum-$slug-yedek" ;; esac
    son_yedek "$slug" "$klasor" "e-infak_${slug}_*.zip.gpg"
  done <<<"$KURUMLAR"
else
  sorun "Kurum listesi okunamadı; kurum yedekleri denetlenemedi"
fi

# saatlik <ad> <proje>
saatlik() {
  local klasor="${REMOTE}$2-yedek/saatlik" kalip="/$2_saatlik_*.gpg" adet eski
  if [[ -z "$(rclone lsf "$klasor" --files-only --max-age 2h --include "$kalip" </dev/null 2>/dev/null)" ]]; then
    sorun "$1 saatlik: son 2 saatte yedek yok"; return
  fi
  adet="$(rclone lsf "$klasor" --files-only --max-age 24h --include "$kalip" </dev/null 2>/dev/null | wc -l | tr -d ' ')"
  # Kurulumun ilk gününde eksik sayılmasın: yalnızca 25 saatten eski yedek varsa tam gün beklenir.
  eski="$(rclone lsf "$klasor" --files-only --min-age 25h --include "$kalip" </dev/null 2>/dev/null)"
  if [[ -n "$eski" ]] && (( adet < 20 )); then sorun "$1 saatlik: son 24 saatte yalnızca $adet"; else ekle "✅ $1 saatlik: son 24 saatte $adet"; fi
}
saatlik "E-Medrese" e-medrese
saatlik "E-İnfak" e-infak

DOLU="$(df -P "$DISK" | awk 'NR==2 { sub("%", "", $5); print $5 }')"
if [[ "$DOLU" =~ ^[0-9]+$ ]] && (( DOLU < 85 )); then ekle "✅ Sunucu diski: %$DOLU dolu"; else sorun "Sunucu diski: %${DOLU:-?} dolu"; fi
BOS="$(rclone about "$REMOTE" </dev/null 2>/dev/null | sed -n 's/^Free: *//p')"
ekle "ℹ️ Google Drive boş alan: ${BOS:-okunamadı}"

if (( SORUN )); then KONU="❌ DİKKAT: $SORUN yedek sorunu — $(date +%d.%m.%Y)"; else KONU="✅ Yedekler sağlıklı — $(date +%d.%m.%Y)"; fi
GOVDE="$(printf '%s\n' "${SATIRLAR[@]}" "" "Saatler Türkiye saatidir. Bu e-posta gelmezse sunucuyu kontrol edin.")"
printf '%s\n%s\n' "$KONU" "$GOVDE"
"$UYARI_KOMUTU" "$KONU" "$GOVDE" || { echo "HATA: özet e-postası gönderilemedi" >&2; exit 1; }
