# shellcheck shell=bash
# shellcheck disable=SC2034  # değişkenleri source eden betikler kullanır
# Yedek betiklerinin ortak parçaları: ayar dosyası, kilitli ikinci kopya, dış alarm.
# Ayarlar boşsa hiçbir şey yapmaz. Kurulu yeri: /usr/local/lib/e-infak-yedek-ortak.sh
KILITLI_REMOTE=""
SINYAL_GECELIK=""
SINYAL_SAATLIK=""
AYLIK_GUN=365
AYAR_DOSYASI="${AYAR_DOSYASI:-/etc/e-infak-yedek.conf}"
if [[ -f "$AYAR_DOSYASI" ]]; then
  # shellcheck source=/dev/null
  source "$AYAR_DOSYASI"
fi

# kilitli_kopya <dosya> <klasör>: yalnızca yazma yetkili anahtarla yükler (okuma, listeleme, silme gerekmez).
# Silme kilidi ve eskilerin temizliği depo ayarındadır (Object Lock + yaşam döngüsü).
kilitli_kopya() {
  [[ -n "$KILITLI_REMOTE" ]] || return 0
  rclone copyto "$1" "${KILITLI_REMOTE%/}/$2/$(basename "$1")" --no-check-dest --s3-no-check-bucket --s3-no-head \
    --retries 3 --low-level-retries 10 </dev/null
}

# sinyal <adres>: dış alarma "yedek tamam" der. Kişisel veri göndermez; hata yedeği bozmaz.
sinyal() {
  [[ -n "$1" ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$1" </dev/null || echo "UYARI: dış alarma ulaşılamadı" >&2
}
