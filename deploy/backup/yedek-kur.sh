#!/usr/bin/env bash
# Bir kez (ve yedek betikleri değişince) sudo ile çalıştırılır. Tekrar çalıştırmak güvenlidir.
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo "sudo ile çalıştırın." >&2; exit 1; }
export HOME=/root
KAYNAK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v rclone >/dev/null || ! command -v gpg >/dev/null; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y rclone gnupg openssl
fi
if [[ ! -s /root/.yedek-sifre ]]; then
  (umask 077; openssl rand -base64 48 >/root/.yedek-sifre)
  echo "ÖNEMLİ: Yeni yedek şifresi üretildi; parola yöneticinize kaydedin:"
  cat /root/.yedek-sifre
fi
if ! rclone listremotes | grep -qx 'drive:'; then
  echo "Google Drive bağlantısı yok. Önce: sudo -H rclone config  (ad: drive, izin: drive.file)" >&2
  echo "Sonra bu betiği tekrar çalıştırın." >&2
  exit 3
fi
rclone lsd drive: >/dev/null || { echo "Google Drive'a ulaşılamadı: sudo -H rclone config reconnect drive:" >&2; exit 3; }

install -m 755 "$KAYNAK/gecelik-yedek.sh" /usr/local/sbin/e-infak-yedek
install -m 755 "$KAYNAK/geri-yukleme-testi.sh" /usr/local/sbin/e-infak-restore-test
install -m 644 "$KAYNAK"/e-infak-{yedek,restore-test}.{service,timer} /etc/systemd/system/
systemctl daemon-reload
[[ -x /usr/local/sbin/e-medrese-yedek-uyari ]] || echo "UYARI: E-Medrese yedeği kurulu değil; hata e-postası gönderilemez."

for is in e-infak-yedek e-infak-restore-test; do
  echo "Çalışıyor: $is"
  baslangic="$(date '+%F %T')"
  sonuc=0
  systemctl start "$is.service" || sonuc=$?
  journalctl -u "$is" --since "$baslangic" --no-pager -o cat
  (( sonuc == 0 )) || { echo "HATA: $is başarısız" >&2; exit 1; }
done
systemctl enable --now e-infak-yedek.timer e-infak-restore-test.timer
rclone lsf drive: --dirs-only
echo "✅ Gecelik yedekler kuruldu."
