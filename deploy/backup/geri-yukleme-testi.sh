#!/usr/bin/env bash
# Drive'daki en son platform yedeğini geçici bir PostgreSQL'e gerçekten yükler (root).
# Canlı veritabanına dokunmaz.
set -Eeuo pipefail
umask 077
YEDEK_DIZIN="${YEDEK_DIZIN:-/var/yedek/e-infak}"
PAROLA_DOSYASI="${PAROLA_DOSYASI:-/root/.yedek-sifre}"
REMOTE="${RCLONE_REMOTE:-drive:}"
UYARI_KOMUTU="${UYARI_KOMUTU:-/usr/local/sbin/e-medrese-yedek-uyari}"
KAP="einfak-restore-test-$$"
[[ "$EUID" -eq 0 ]] || { echo "root gerekli" >&2; exit 1; }
CALISMA="$(mktemp -d "$YEDEK_DIZIN/.restore-test.XXXXXX")"
bitir() {
  local kod=$?
  docker rm -f -v "$KAP" >/dev/null 2>&1 || true
  rm -rf "${CALISMA:?}"
  if (( kod != 0 )) && [[ -x "$UYARI_KOMUTU" ]]; then
    "$UYARI_KOMUTU" "E-İnfak geri yükleme testi başarısız" "Ayrıntı: journalctl -u e-infak-restore-test" || true
  fi
  exit "$kod"
}
trap bitir EXIT

SON="$(rclone lsf "${REMOTE}e-infak-yedek" --files-only --include '/e-infak_sistem_*.tar.gz.gpg' | sort | tail -n 1)"
[[ -n "$SON" ]] || { echo "Drive'da platform yedeği yok" >&2; exit 1; }
echo "Sınanan yedek: $SON"
rclone copyto "${REMOTE}e-infak-yedek/$SON" "$CALISMA/yedek.gpg"
gpg --batch --quiet --decrypt --pinentry-mode loopback --passphrase-file "$PAROLA_DOSYASI" \
  "$CALISMA/yedek.gpg" | tar xzf - -C "$CALISMA"
(cd "$CALISMA" && sha256sum -c SHA256SUMS)
tar tf "$CALISMA/media.tar" >/dev/null

# Ağsız ve dışarı kapalı; yalnızca docker exec ile erişilir.
docker run -d --name "$KAP" --network none -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=einfak \
  -e POSTGRES_DB=einfak postgres:16-alpine >/dev/null
hazir=0
for _ in $(seq 1 60); do
  # İlk açılıştaki geçici sunucu TCP dinlemez; -h ile asıl sunucu beklenir.
  if docker exec "$KAP" pg_isready -h 127.0.0.1 -U einfak -d einfak >/dev/null 2>&1; then hazir=1; break; fi
  sleep 1
done
(( hazir )) || { echo "Geçici PostgreSQL açılmadı" >&2; exit 1; }
docker exec -i "$KAP" pg_restore -U einfak -d einfak --no-owner --exit-on-error <"$CALISMA/database.dump"
KURUM="$(docker exec "$KAP" psql -U einfak -d einfak -Atc 'select count(*) from organizations')"
BAGIS="$(docker exec "$KAP" psql -U einfak -d einfak -Atc 'select count(*) from donations')"
(( KURUM > 0 )) || { echo "Yedekte kurum yok" >&2; exit 1; }
echo "✅ Geri yükleme testi başarılı: $KURUM kurum, $BAGIS bağış"
