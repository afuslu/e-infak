"""Validation helpers for organization-managed site content.

Everything an organization types into the CMS ends up on its public site, so
links, media and embed identifiers are normalised to a small, safe set of
shapes here instead of being stored verbatim.
"""
import re
from urllib.parse import parse_qs, urlparse

_TR_MAP = str.maketrans({
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "İ": "i", "I": "i",
    "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u", "â": "a", "î": "i", "û": "u",
})
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_VIMEO_ID = re.compile(r"^\d{6,12}$")
_TAWK_ID = re.compile(r"^[a-f0-9]{24}/[a-z0-9]{6,16}$")


def slugify(value: str, max_length: int = 150) -> str:
    text = (value or "").translate(_TR_MAP).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:max_length].strip("-")


def validate_slug(value: str) -> str:
    slug = (value or "").strip().lower()
    if not _SLUG_RE.fullmatch(slug) or len(slug) > 150:
        raise ValueError("Adres (slug) yalnız küçük harf, rakam ve tire içerebilir")
    return slug


def parse_video_url(url: str) -> tuple[str, str]:
    """Return (provider, id) for a YouTube or Vimeo link; raise ValueError otherwise."""
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Video bağlantısı http(s) ile başlamalıdır")
    host = (parsed.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    path = parsed.path.strip("/")
    video_id = None
    if host == "youtu.be":
        video_id = path.split("/")[0]
    elif host in {"youtube.com", "youtube-nocookie.com"}:
        if path == "watch":
            video_id = (parse_qs(parsed.query).get("v") or [""])[0]
        elif path.split("/")[0] in {"embed", "shorts", "live"} and "/" in path:
            video_id = path.split("/")[1]
    if video_id is not None:
        if not _YOUTUBE_ID.fullmatch(video_id):
            raise ValueError("YouTube video kimliği okunamadı")
        return "youtube", video_id
    if host in {"vimeo.com", "player.vimeo.com"}:
        candidate = path.split("/")[-1]
        if _VIMEO_ID.fullmatch(candidate):
            return "vimeo", candidate
        raise ValueError("Vimeo video kimliği okunamadı")
    raise ValueError("Yalnız YouTube veya Vimeo videoları eklenebilir")


def video_embed_url(provider: str | None, video_id: str | None) -> str | None:
    if provider == "youtube" and video_id:
        return f"https://www.youtube-nocookie.com/embed/{video_id}"
    if provider == "vimeo" and video_id:
        return f"https://player.vimeo.com/video/{video_id}"
    return None


def validate_link(value: str) -> str:
    """Site-internal path ("/hakkimizda") or an absolute http(s) URL."""
    link = (value or "").strip()
    if link.startswith("/") and not link.startswith("//") and "\\" not in link:
        return link
    parsed = urlparse(link)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return link
    raise ValueError("Bağlantı '/' ile başlayan bir site adresi veya http(s) URL olmalıdır")


def validate_image_url(value: str | None) -> str | None:
    if value is None or not str(value).strip():
        return None
    link = str(value).strip()
    parsed = urlparse(link)
    if link.startswith("/") and not link.startswith("//"):
        return link
    if parsed.scheme == "https" and parsed.netloc:
        return link
    raise ValueError("Görsel adresi https:// veya / ile başlamalıdır")


def normalize_whatsapp(value: str | None) -> str | None:
    if value is None or not str(value).strip():
        return None
    digits = re.sub(r"\D", "", str(value))
    if digits.startswith("0"):
        digits = "90" + digits[1:]
    if not 10 <= len(digits) <= 15:
        raise ValueError("WhatsApp numarası ülke koduyla birlikte 10-15 rakam olmalıdır (ör. 905xxxxxxxxx)")
    return digits


def validate_tawk_id(value: str | None) -> str | None:
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    # Accept the full embed URL as pasted from the Tawk.to dashboard.
    match = re.search(r"embed\.tawk\.to/([a-f0-9]{24}/[a-z0-9]{6,16})", text)
    if match:
        text = match.group(1)
    if not _TAWK_ID.fullmatch(text):
        raise ValueError("Tawk.to kimliği 'propertyId/widgetId' biçiminde olmalıdır")
    return text
