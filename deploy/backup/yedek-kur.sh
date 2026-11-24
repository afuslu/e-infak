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

if [[ ! -e /etc/e-infak-yedek.conf ]]; then
  install -m 600 "$KAYNAK/e-infak-yedek.conf.ornek" /etc/e-infak-yedek.conf
fi
chown root:root /etc/e-infak-yedek.conf
chmod 600 /etc/e-infak-yedek.conf
# Ortak parça değiştiyse eski betikler bozulmasın diye önce kurulur
install -m 644 "$KAYNAK/ortak.sh" /usr/local/lib/e-infak-yedek-ortak.sh

# Yalnızca yeni veya değişen betikler hemen çalıştırılıp sınanır.
SINANACAK=()
kur() {
  if ! cmp -s "$KAYNAK/$1" "/usr/local/sbin/$2" || ! systemctl is-enabled --quiet "$2.timer" 2>/dev/null; then SINANACAK+=("$2"); fi
  install -m 755 "$KAYNAK/$1" "/usr/local/sbin/$2"
}
grep -q '^SINYAL_EMEDRESE_SAATLIK=' /etc/e-infak-yedek.conf || echo 'SINYAL_EMEDRESE_SAATLIK=""' >>/etc/e-infak-yedek.conf
kur saatlik-yedek.sh e-infak-saatlik
if docker inspect emedrese-db-1 >/dev/null 2>&1; then
  kur saatlik-yedek.sh e-medrese-saatlik
  install -m 644 "$KAYNAK"/e-medrese-saatlik.{service,timer} /etc/systemd/system/
fi
kur gecelik-yedek.sh e-infak-yedek
kur geri-yukleme-testi.sh e-infak-restore-test
kur gunluk-ozet.sh e-infak-ozet
install -m 644 "$KAYNAK"/e-infak-{saatlik,yedek,restore-test,ozet}.{service,timer} /etc/systemd/system/
systemctl daemon-reload
[[ -x /usr/local/sbin/e-medrese-yedek-uyari ]] || echo "UYARI: E-Medrese yedeği kurulu değil; hata e-postası gönderilemez."

for is in "${SINANACAK[@]}"; do
  echo "Çalışıyor: $is"
  baslangic="$(date '+%F %T')"
  sonuc=0
  systemctl start "$is.service" || sonuc=$?
  journalctl -u "$is" --since "$baslangic" --no-pager -o cat
  (( sonuc == 0 )) || { echo "HATA: $is başarısız" >&2; exit 1; }
  systemctl enable --now "$is.timer"
done
systemctl list-timers 'e-infak-*' 'e-medrese-*' --no-pager
rclone lsf drive: --dirs-only
echo "✅ Saatlik ve gecelik yedekler kuruldu."
