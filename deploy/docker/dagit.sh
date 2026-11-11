#!/usr/bin/env bash
# E-İnfak — belirli bir commit'i sunucuya dağıtır (Docker).
#   /opt/e_infak/dagit.sh <40-karakter-commit-sha>
# Adımlar: kodu çıkar → imajları derle → veritabanı yedeği → migration →
# yeni kapları başlat → sağlık kontrolü. Kontrol başarısızsa önceki sürüme döner.
# E-Medrese'ye dokunmaz: ayrı compose projesi (einfak), ayrı ağ ve veritabanı.
set -Eeuo pipefail

DIZIN="${DIZIN:-/opt/e_infak}"
KAYNAK="$DIZIN/kaynak.git"
ENV_DOSYASI="$DIZIN/.env"
GITHUB_URL="${GITHUB_URL:-https://github.com/afuslu/e-infak.git}"
SAKLANACAK_SURUM="${SAKLANACAK_SURUM:-3}"
SAKLANACAK_YEDEK="${SAKLANACAK_YEDEK:-14}"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
ol() { echo "HATA: $*" >&2; exit 1; }

# Uygulama kapları değişmeden önceki her hata: canlı sürüm olduğu gibi kalır.
trap 'echo "HATA: dağıtım ${LINENO}. satırda durdu; canlı sürüm değişmedi." >&2' ERR

SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || ol "Kullanım: $0 <40-karakter-commit-sha>"
[[ -f "$ENV_DOSYASI" ]] || ol "$ENV_DOSYASI yok; önce ilk-kurulum.sh"
exec 9>"$DIZIN/runtime/dagit.lock"
flock -n 9 || ol "Başka bir dağıtım sürüyor"
mkdir -p "$DIZIN/dagitim-gunlukleri"
exec > >(tee -a "$DIZIN/dagitim-gunlukleri/dagit_$(date +%Y%m%d_%H%M%S).log") 2>&1

if ! git --git-dir="$KAYNAK" cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  log "Commit yerel depoda yok, GitHub'dan çekiliyor"
  git --git-dir="$KAYNAK" fetch -q "$GITHUB_URL" '+refs/heads/*:refs/remotes/github/*' \
    || ol "GitHub'dan çekilemedi"
  git --git-dir="$KAYNAK" cat-file -e "${SHA}^{commit}" 2>/dev/null || ol "Commit bulunamadı: $SHA"
fi

TAG="${SHA:0:12}"
SURUM="$DIZIN/releases/$TAG"
ONCEKI="$(cat "$DIZIN/runtime/aktif-surum" 2>/dev/null || echo yok)"
log "Dağıtım: $TAG (önceki: $ONCEKI)"

rm -rf "$SURUM.tmp" && mkdir -p "$SURUM.tmp"
git --git-dir="$KAYNAK" archive "$SHA" | tar -x -C "$SURUM.tmp"
rm -rf "$SURUM" && mv "$SURUM.tmp" "$SURUM"

log "İmajlar derleniyor"
docker build -q -t "einfak-backend:$TAG" -f "$SURUM/deploy/docker/backend.Dockerfile" "$SURUM/services/backend" >/dev/null
docker build -q -t "einfak-web:$TAG" -f "$SURUM/deploy/docker/web.Dockerfile" "$SURUM" >/dev/null

export EINFAK_ENV_FILE="$ENV_DOSYASI"
compose() { TAG="$1" docker compose -p einfak -f "$SURUM/deploy/docker/compose.yml" --env-file "$ENV_DOSYASI" "${@:2}"; }

log "Veritabanı ve Redis"
compose "$TAG" up -d --wait db redis

YEDEK="$DIZIN/backups/einfak_$(date +%Y%m%d_%H%M%S)_once-$TAG.dump"
log "Yedek alınıyor: $YEDEK"
compose "$TAG" exec -T db pg_dump -U einfak -Fc einfak > "$YEDEK" || { rm -f "$YEDEK"; ol "Yedek alınamadı; migration yapılmadı"; }

log "Migration"
compose "$TAG" run --rm --no-deps backend alembic upgrade head

geri_don() {
  if [[ "$ONCEKI" != "yok" ]]; then
    log "Sorun var — önceki sürüme ($ONCEKI) dönülüyor"
    compose "$ONCEKI" up -d --remove-orphans backend worker beat web || true
  fi
  ol "Dağıtım başarısız ($TAG). Veritabanı yedeği: $YEDEK"
}

log "Uygulama kapları başlatılıyor"
compose "$TAG" up -d --wait --remove-orphans backend worker beat web || geri_don

log "Sağlık kontrolü"
saglikli=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8092/health >/dev/null 2>&1 \
     && curl -fsS -o /dev/null -H "Host: e-infak.org" http://127.0.0.1:3092/ 2>/dev/null; then
    saglikli=1; break
  fi
  sleep 2
done
[[ "$saglikli" -eq 1 ]] || geri_don

# Sertifika servisi siteyi taşımaz; başlamazsa dağıtım geri alınmaz, yalnızca uyarılır.
if compose "$TAG" up -d --no-deps certs; then
  compose "$TAG" exec -T backend python -c "from app.tasks import warm_all_certificates_task; warm_all_certificates_task.delay()" >/dev/null 2>&1 || true
else
  log "UYARI: sertifika servisi (certs) başlamadı; yeni alan adları SSL alamaz"
fi

echo "$TAG" > "$DIZIN/runtime/aktif-surum"
cp "$SURUM/deploy/docker/dagit.sh" "$DIZIN/dagit.sh.yeni" && chmod +x "$DIZIN/dagit.sh.yeni" && mv "$DIZIN/dagit.sh.yeni" "$DIZIN/dagit.sh"
# sudo ile çalıştırılan nginx betikleri de güncel sürümden alınır
for betik in nginx-kur.sh nginx-otomatik-ssl.sh; do cp "$SURUM/deploy/docker/$betik" "$DIZIN/$betik" || true; done

# Eski sürümler, imajlar ve yedekler
ls -1dt "$DIZIN"/releases/*/ 2>/dev/null | tail -n +"$((SAKLANACAK_SURUM + 1))" | while read -r eski; do
  eski_tag="$(basename "$eski")"
  rm -rf "$eski"
  docker image rm "einfak-backend:$eski_tag" "einfak-web:$eski_tag" >/dev/null 2>&1 || true
done
ls -1t "$DIZIN"/backups/*.dump 2>/dev/null | tail -n +"$((SAKLANACAK_YEDEK + 1))" | xargs -r rm -f

log "✅ Yayında: $TAG"
