"""Medya kütüphanesi: görsel işleme (WebP, boyutlar, kırpma), kota ve "nerede kullanılıyor".

Dosyalar MEDIA_ROOT/<org_id>/ altında durur ve GET /api/v1/media/{org_id}/{name}
ile yayınlanır. Bir görselin bütün dosya adları aynı 24 haneli `token` ile başlar;
bu sayede kullanım taraması, kota ve silme tek bir önekle çalışır.
"""
import io
import json
import os
import re
import secrets
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.plans import org_storage_quota_bytes
from app.models.media import MediaAsset

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
VARIANT_WIDTHS = (480, 960, 1440, 1920)
MAX_MASTER_SIDE = 2560  # the full-size WebP is capped here; the original stays untouched
WEBP_QUALITY = 82
IMAGE_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp", "GIF": "gif", "ICO": "ico"}
MIME_TYPES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "ico": "image/x-icon"}
# Public names: the token, an optional "-k" (cropped) and an optional width. `<token>.orig.<ext>` is never served.
PUBLIC_NAME = re.compile(r"^[a-f0-9]{24}(-k)?(-\d{2,4})?\.(png|jpg|webp|gif|ico)$")
_LEGACY_NAME = re.compile(r"^([a-f0-9]{24})\.(png|jpg|webp|gif|ico)$")


def org_dir(org_id) -> Path:
    return Path(settings.MEDIA_ROOT) / str(org_id)


def media_url(org_id, name: str) -> str:
    return f"/api/v1/media/{org_id}/{name}"


def url_prefix(org_id, token: str) -> str:
    return f"/api/v1/media/{org_id}/{token}"


# --- Image processing (runs in a worker thread) ------------------------------------------

@dataclass
class Probe:
    extension: str
    width: int
    height: int


def probe(content: bytes) -> Probe:
    """Validate an upload: real image (Pillow verify), allowed format, size and pixel limits."""
    from PIL import Image, UnidentifiedImageError

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Görsel en fazla 5 MB olabilir")
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
            fmt = image.format
        with Image.open(io.BytesIO(content)) as image:
            width, height = image.size
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise HTTPException(status_code=422, detail="Dosya geçerli bir görsel değil")
    extension = IMAGE_FORMATS.get(fmt or "")
    if not extension:
        raise HTTPException(status_code=422, detail="Desteklenen biçimler: PNG, JPEG, WEBP, GIF, ICO")
    if width * height > MAX_PIXELS:
        raise HTTPException(status_code=422, detail="Görsel çözünürlüğü çok yüksek")
    return Probe(extension, width, height)


def _load_clean(source: Path):
    """Open an image upright (EXIF orientation applied) in a WebP-friendly mode, without metadata."""
    from PIL import Image, ImageOps

    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        image.load()
    if image.mode not in ("RGB", "RGBA"):
        has_alpha = image.mode in ("LA", "PA") or (image.mode == "P" and "transparency" in image.info)
        image = image.convert("RGBA" if has_alpha else "RGB")
    icc = image.info.get("icc_profile")
    image.info = {"icc_profile": icc} if icc else {}  # drop EXIF, XMP, comments
    return image


def _save_webp(image, path: Path) -> int:
    params = {"format": "WEBP", "quality": WEBP_QUALITY, "method": 4}
    if image.info.get("icc_profile"):
        params["icc_profile"] = image.info["icc_profile"]
    image.save(path, **params)
    os.chmod(path, 0o644)
    return path.stat().st_size


def render_variants(source: Path, folder: Path, base: str, crop: dict | None = None) -> dict:
    """Write `<base>.webp` (full size, capped) and `<base>-<w>.webp` for every smaller width.

    Returns {"width", "height", "master", "master_size", "variants": [...]}. Never upscales.
    """
    from PIL import Image

    image = _load_clean(source)
    if crop:
        image = image.crop((crop["x"], crop["y"], crop["x"] + crop["width"], crop["y"] + crop["height"]))
    width, height = image.size
    master = image
    if max(width, height) > MAX_MASTER_SIDE:
        master = image.copy()
        master.thumbnail((MAX_MASTER_SIDE, MAX_MASTER_SIDE), Image.Resampling.LANCZOS)
        master.info = image.info
    master_name = f"{base}.webp"
    master_size = _save_webp(master, folder / master_name)
    variants = []
    for target in VARIANT_WIDTHS:
        if target >= master.width:
            break
        target_height = max(1, round(master.height * target / master.width))
        resized = master.resize((target, target_height), Image.Resampling.LANCZOS)
        resized.info = master.info
        name = f"{base}-{target}.webp"
        variants.append({"width": target, "height": target_height, "file": name,
                         "size": _save_webp(resized, folder / name)})
    variants.append({"width": master.width, "height": master.height, "file": master_name, "size": master_size})
    return {"width": master.width, "height": master.height, "master": master_name, "variants": variants}


def _store_upload(content: bytes, folder: Path, info: Probe) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    token = secrets.token_hex(12)
    if info.extension in ("gif", "ico"):
        # Animations and favicons are served as uploaded.
        name = f"{token}.{info.extension}"
        (folder / name).write_bytes(content)
        os.chmod(folder / name, 0o644)
        return {"token": token, "url_file": name, "original_file": name, "mime": MIME_TYPES[info.extension],
                "width": info.width, "height": info.height, "variants": []}
    original = f"{token}.orig.{info.extension}"
    (folder / original).write_bytes(content)
    os.chmod(folder / original, 0o600)
    try:
        rendered = render_variants(folder / original, folder, token)
    except Exception:
        for path in folder.glob(f"{token}*"):
            path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Görsel işlenemedi")
    return {"token": token, "url_file": rendered["master"], "original_file": original, "mime": "image/webp",
            "width": rendered["width"], "height": rendered["height"], "variants": rendered["variants"]}


def files_size(folder: Path, token: str) -> int:
    return sum(path.stat().st_size for path in folder.glob(f"{token}*") if path.is_file())


# --- Quota -------------------------------------------------------------------------------

async def used_bytes(db: AsyncSession, org_id) -> int:
    total = (await db.execute(
        select(func.coalesce(func.sum(MediaAsset.size_bytes), 0)).where(MediaAsset.organization_id == org_id)
    )).scalar_one()
    return int(total)


async def usage(db: AsyncSession, org) -> dict:
    count = (await db.execute(
        select(func.count()).select_from(MediaAsset).where(MediaAsset.organization_id == org.id)
    )).scalar_one()
    return {"used_bytes": await used_bytes(db, org.id), "quota_bytes": org_storage_quota_bytes(org), "count": count}


async def ensure_quota(db: AsyncSession, org, incoming: int) -> None:
    quota = org_storage_quota_bytes(org)
    if await used_bytes(db, org.id) + incoming > quota:
        raise HTTPException(status_code=413, detail={
            "code": "media_quota_exceeded",
            "message": f"Medya depolama kotanız ({quota // (1024 * 1024)} MB) doldu. Kullanılmayan görselleri silin veya paketinizi yükseltin.",
        })


# --- Upload / legacy registration ---------------------------------------------------------

async def create_asset(db: AsyncSession, org, content: bytes, filename: str | None, user_id=None,
                       folder_id: UUID | None = None) -> MediaAsset:
    info = probe(content)
    # Variants add roughly half the original again; check before the work, settle exactly after.
    await ensure_quota(db, org, len(content))
    folder = org_dir(org.id)
    stored = await run_in_threadpool(_store_upload, content, folder, info)
    size = files_size(folder, stored["token"])
    try:
        await ensure_quota(db, org, size)
    except HTTPException:
        for path in folder.glob(f"{stored['token']}*"):
            path.unlink(missing_ok=True)
        raise
    asset = MediaAsset(
        organization_id=org.id, folder_id=folder_id, token=stored["token"],
        url=media_url(org.id, stored["url_file"]), original_name=(filename or "")[:255],
        original_file=stored["original_file"], mime=stored["mime"], size_bytes=size,
        width=stored["width"], height=stored["height"], variants=stored["variants"], tags=[],
        created_by=user_id,
    )
    db.add(asset)
    await db.flush()
    return asset


def _legacy_info(path: Path) -> tuple[int, int] | None:
    from PIL import Image

    try:
        with Image.open(path) as image:
            return image.size
    except Exception:
        return None


async def register_legacy_files(db: AsyncSession, org_id) -> int:
    """Add files uploaded before the library existed (`<token>.<ext>`) as assets. Returns how many."""
    folder = org_dir(org_id)
    if not folder.is_dir():
        return 0
    found, pipeline = {}, set()
    for entry in os.scandir(folder):
        if ".orig." in entry.name:
            pipeline.add(entry.name[:24])  # written by create_asset (maybe still in flight), not legacy
            continue
        match = _LEGACY_NAME.fullmatch(entry.name)
        if match and entry.is_file():
            found[match.group(1)] = entry.name
    for token in pipeline:
        found.pop(token, None)
    if not found:
        return 0
    known = set((await db.execute(
        select(MediaAsset.token).where(MediaAsset.organization_id == org_id, MediaAsset.token.in_(list(found)))
    )).scalars().all())
    added = 0
    for token, name in found.items():
        if token in known:
            continue
        size = await run_in_threadpool(_legacy_info, folder / name)
        if not size:
            continue
        stat = (folder / name).stat()
        extension = name.rsplit(".", 1)[1]
        db.add(MediaAsset(
            organization_id=org_id, token=token, url=media_url(org_id, name), original_name=name,
            original_file=name, mime=MIME_TYPES[extension], size_bytes=stat.st_size,
            width=size[0], height=size[1], variants=[], tags=[],
        ))
        added += 1
    if added:
        await db.flush()
    return added


# --- Crop --------------------------------------------------------------------------------

def _crop_source(folder: Path, asset: MediaAsset) -> Path:
    if asset.original_file and (folder / asset.original_file).is_file():
        return folder / asset.original_file
    return folder / asset.url.rsplit("/", 1)[1].split("?", 1)[0]


async def crop_asset(db: AsyncSession, org, asset: MediaAsset, x: float, y: float, w: float, h: float) -> MediaAsset:
    """Crop (fractions 0–1 of the upright original) into `<token>-k*.webp` and point the asset there.

    The address keeps the same file name with a new `?v=` so every page that already uses
    the cropped image shows the new crop, while browsers fetch it fresh.
    """
    if asset.mime in ("image/gif", "image/x-icon"):
        raise HTTPException(status_code=422, detail="GIF ve ICO dosyaları kırpılamaz")
    folder = org_dir(org.id)
    source = _crop_source(folder, asset)
    if not source.is_file():
        raise HTTPException(status_code=404, detail="Görsel dosyası bulunamadı")

    def run():
        from PIL import Image, ImageOps

        with Image.open(source) as opened:
            width, height = ImageOps.exif_transpose(opened).size
        box = {
            "x": int(round(x * width)), "y": int(round(y * height)),
            "width": int(round(w * width)), "height": int(round(h * height)),
        }
        box["width"] = min(box["width"], width - box["x"])
        box["height"] = min(box["height"], height - box["y"])
        if box["width"] < 8 or box["height"] < 8:
            raise HTTPException(status_code=422, detail="Kırpma alanı çok küçük")
        for old in folder.glob(f"{asset.token}-k*"):
            old.unlink(missing_ok=True)
        return box, render_variants(source, folder, f"{asset.token}-k", crop=box)

    box, rendered = await run_in_threadpool(run)
    others = [v for v in asset.variants or [] if not v["file"].startswith(f"{asset.token}-k")]
    asset.crop = box
    asset.variants = [*others, *rendered["variants"]]
    asset.width, asset.height = rendered["width"], rendered["height"]
    asset.mime = "image/webp"
    asset.url = f"{media_url(org.id, rendered['master'])}?v={secrets.token_hex(3)}"
    asset.focal_x, asset.focal_y = 0.5, 0.5
    new_size = files_size(folder, asset.token)
    if new_size > (asset.size_bytes or 0):
        quota = org_storage_quota_bytes(org)
        if await used_bytes(db, org.id) - (asset.size_bytes or 0) + new_size > quota:
            # The crop is smaller than its source in practice; refuse only a real overrun.
            raise HTTPException(status_code=413, detail={"code": "media_quota_exceeded",
                                                         "message": "Medya depolama kotanız doldu"})
    asset.size_bytes = new_size
    return asset


def delete_files(org_id, token: str) -> None:
    for path in org_dir(org_id).glob(f"{token}*"):
        path.unlink(missing_ok=True)


# --- Where used ---------------------------------------------------------------------------

def _usage_sources():
    """(model, label, title attribute, admin link, columns) of every place that stores image addresses."""
    from app.models.campaign import Campaign
    from app.models.cms import GalleryItem, SitePage
    from app.models.content_post import ContentPost
    from app.models.organization_settings import OrganizationSettings
    from app.models.orphan import Orphan
    from app.models.sponsorship import Beneficiary

    return [
        (SitePage, "Sayfa", "title", "/admin/site-yapici", (
            "cover_image_url", "body", "translations", "blocks", "draft_blocks",
        )),
        (ContentPost, "Haber & Blog", "title", "/admin/icerikler", ("image_url", "gallery_urls", "body", "translations")),
        (GalleryItem, "Galeri", "title", "/admin/galeri", ("image_url",)),
        (Campaign, "Kampanya", "title", "/admin/kampanyalar", ("cover_image_url", "gallery_urls", "description")),
        (Beneficiary, "Sponsorluk", None, "/admin/sponsorluk", ("photo_url",)),
        (Orphan, "Yetim", None, "/admin/sponsorluk", ("photo_url",)),
        (OrganizationSettings, "Site Ayarları", None, "/admin/site-ayarlari", (
            "bylaws_url", "board_url", "audit_report_url", "activity_report_url", "fundraising_permit_url",
        )),
    ]


_ORG_FIELDS = {
    "logo_url": "Logo", "logo_dark_url": "Koyu logo", "favicon_url": "Site simgesi (favicon)", "site": "Site tasarımı",
}


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


async def usage_haystack(db: AsyncSession, org, needles: list[str]) -> list[dict]:
    """Every stored field of the organisation that contains one of `needles`, as reference entries.

    Each entry: {"type", "label", "id", "title", "field", "link", "text"}; `text` is dropped by callers.
    """
    if not needles:
        return []
    refs = []
    for field, label in _ORG_FIELDS.items():
        text = _text(getattr(org, field, None))
        if any(n in text for n in needles):
            refs.append({"type": "organization", "label": label, "id": str(org.id), "title": org.name,
                         "field": field, "link": "/admin/gorunum", "text": text})
    for model, label, title_attr, link, columns in _usage_sources():
        present = [c for c in columns if hasattr(model, c)]
        if not present:
            continue
        conditions = [cast(getattr(model, c), Text).contains(n) for c in present for n in needles]
        rows = (await db.execute(
            select(model).where(model.organization_id == org.id, or_(*conditions))
        )).scalars().all()
        for row in rows:
            for column in present:
                text = _text(getattr(row, column))
                if any(n in text for n in needles):
                    title = getattr(row, title_attr, None) if title_attr else None
                    if not title:
                        title = " ".join(filter(None, [getattr(row, "first_name", None), getattr(row, "last_name", None)])) or label
                    refs.append({"type": model.__tablename__, "label": label, "id": str(row.id), "title": str(title),
                                 "field": column, "link": link, "text": text})
    return refs


async def where_used(db: AsyncSession, org, asset: MediaAsset) -> list[dict]:
    prefix = url_prefix(org.id, asset.token)
    return [{k: v for k, v in ref.items() if k != "text"} for ref in await usage_haystack(db, org, [prefix])]


async def used_tokens(db: AsyncSession, org) -> set[str]:
    """Tokens of the organisation's assets that appear anywhere (one pass for the "unused" filter)."""
    base = f"/api/v1/media/{org.id}/"
    refs = await usage_haystack(db, org, [base])
    pattern = re.compile(re.escape(base) + r"([a-f0-9]{24})")
    tokens: set[str] = set()
    for ref in refs:
        tokens.update(pattern.findall(ref["text"]))
    return tokens
