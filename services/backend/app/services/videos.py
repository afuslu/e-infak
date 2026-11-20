"""Donation videos: chunked upload, per-donor watch links, view tracking and range streaming.

Uploads come in 5 MB chunks because the reverse proxy caps request bodies at 8 MB; the browser
sends the chunks in order and the last one marks the video ready. Files live under
MEDIA_ROOT/videos/<org>/<video id>.<ext>.

Watch links are signed: /api/v1/media/video/<token> where the token carries the video id and,
for links sent to a donor, the donor id. Opening the page records a view for that donor, so
staff can see who watched their slaughter video (STK PRO's "izlenme durumu").
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

CHUNK_BYTES = 5 * 1024 * 1024
MAX_VIDEO_BYTES = 1024 * 1024 * 1024  # 1 GB
STREAM_BLOCK = 512 * 1024
CONTENT_TYPES = {".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"}


class VideoError(ValueError):
    pass


def video_dir(organization_id) -> Path:
    return Path(settings.MEDIA_ROOT) / "videos" / str(organization_id)


def video_path(video) -> Path:
    return video_dir(video.organization_id) / video.file_name


def extension_for(filename: str, content_type: Optional[str]) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in CONTENT_TYPES:
        return ext
    for known, ctype in CONTENT_TYPES.items():
        if ctype == (content_type or "").lower():
            return known
    raise VideoError("Yalnız MP4, MOV veya WEBM video yüklenebilir")


def write_chunk(video, index: int, data: bytes) -> int:
    """Write chunk `index` at its offset; returns the bytes received so far."""
    expected_index = video.received_bytes // CHUNK_BYTES
    if index != expected_index:
        raise VideoError(f"Beklenen parça {expected_index}, gelen {index}")
    offset = index * CHUNK_BYTES
    last = offset + len(data) >= video.size_bytes
    if not data or (len(data) != CHUNK_BYTES and not last) or offset + len(data) > video.size_bytes:
        raise VideoError("Parça boyutu hatalı")
    path = video_path(video)
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = "r+b" if path.exists() and offset > 0 else "wb"
    with open(path, mode) as fh:
        fh.seek(offset)
        fh.write(data)
    return offset + len(data)


def remove_file(video) -> None:
    try:
        video_path(video).unlink()
    except FileNotFoundError:
        pass


# --- signed links ------------------------------------------------------------------------------

def _sig(payload: str) -> str:
    digest = hmac.new(settings.SECRET_KEY.encode(), f"video:{payload}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest[:12]).decode().rstrip("=")


def _b64(value: UUID) -> str:
    return base64.urlsafe_b64encode(value.bytes).decode().rstrip("=")


def _unb64(value: str) -> UUID:
    return UUID(bytes=base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))


def token_for(video_id: UUID, donor_id: Optional[UUID] = None) -> str:
    payload = _b64(video_id) + ("." + _b64(donor_id) if donor_id else "")
    return f"{payload}.{_sig(payload)}"


def parse_token(token: str) -> Optional[tuple[UUID, Optional[UUID]]]:
    parts = (token or "").split(".")
    if len(parts) not in (2, 3):
        return None
    payload, sig = ".".join(parts[:-1]), parts[-1]
    if not hmac.compare_digest(_sig(payload), sig):
        return None
    try:
        video_id = _unb64(parts[0])
        donor_id = _unb64(parts[1]) if len(parts) == 3 else None
    except (ValueError, TypeError):
        return None
    return video_id, donor_id


def watch_path(video_id: UUID, donor_id: Optional[UUID] = None) -> str:
    return f"/api/v1/media/video/{token_for(video_id, donor_id)}"


async def watch_url(db: AsyncSession, organization_id: UUID, video_id: UUID, donor_id: Optional[UUID] = None) -> str:
    from app.models.organization import Organization
    from app.services.sms_service import site_url

    org = await db.get(Organization, organization_id)
    return f"{site_url(org).rstrip('/')}{watch_path(video_id, donor_id)}" if org else watch_path(video_id, donor_id)


async def video_for_animal(db: AsyncSession, animal_id: Optional[UUID]):
    from app.models.channels import DonationVideo

    if not animal_id:
        return None
    return (await db.execute(select(DonationVideo).where(
        DonationVideo.kurban_animal_id == animal_id, DonationVideo.status == "ready",
    ).order_by(DonationVideo.created_at.desc()).limit(1))).scalars().first()


async def record_view(db: AsyncSession, video, donor_id: Optional[UUID]) -> None:
    from app.models.channels import VideoView

    now = datetime.now(timezone.utc)
    query = select(VideoView).where(VideoView.video_id == video.id)
    query = query.where(VideoView.donor_id == donor_id) if donor_id else query.where(VideoView.donor_id.is_(None))
    view = (await db.execute(query.with_for_update())).scalars().first()
    if view:
        view.view_count += 1
        view.last_viewed_at = now
    else:
        db.add(VideoView(organization_id=video.organization_id, video_id=video.id, donor_id=donor_id,
                         first_viewed_at=now, last_viewed_at=now))


# --- streaming ---------------------------------------------------------------------------------

def parse_range(header: Optional[str], size: int) -> Optional[tuple[int, int]]:
    """'bytes=START-END' → (start, end) inclusive; None for no or unusable header."""
    if not header or not header.startswith("bytes=") or "," in header:
        return None
    start_s, _, end_s = header[6:].partition("-")
    try:
        if start_s == "":
            length = int(end_s)
            start, end = max(size - length, 0), size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
    except ValueError:
        return None
    if start >= size or start > end:
        return None
    return start, min(end, size - 1)


def iter_file(path: Path, start: int, end: int):
    with open(path, "rb") as fh:
        fh.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            block = fh.read(min(STREAM_BLOCK, remaining))
            if not block:
                break
            remaining -= len(block)
            yield block


def watch_page(org_name: str, title: str, src: str, primary: str = "#065f46") -> str:
    esc = html.escape
    return f"""<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>{esc(title)} · {esc(org_name)}</title>
<style>body{{margin:0;background:#0b1220;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;
min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}}
h1{{font-size:18px;margin:0 0 4px}}p{{margin:0 0 16px;color:#9ca3af;font-size:14px}}
video{{width:100%;max-width:960px;border-radius:14px;background:#000;box-shadow:0 10px 40px rgba(0,0,0,.5)}}
.b{{display:inline-block;margin-top:16px;color:#fff;background:{esc(primary)};padding:10px 18px;border-radius:999px;
text-decoration:none;font-weight:600;font-size:14px}}</style></head>
<body><h1>{esc(title)}</h1><p>{esc(org_name)}</p>
<video src="{esc(src)}" controls playsinline preload="metadata"></video>
<a class="b" href="{esc(src)}" download>Videoyu indir</a></body></html>"""
