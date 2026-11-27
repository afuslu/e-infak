"""Kurban kartı görseli (PNG): kasap tabletinde tam ekran gösterilir, bağışçıya da gönderilebilir.

İki çeşit: hayvan kartı (numara + bütün hissedarlar, kesim anında kameraya/kasaba gösterilir) ve
hisse kartı (tek kişi; PDF isim kartının görsel karşılığı). Yazı tipleri PDF'lerle aynı TTF'lerden
gelir, böylece Türkçe karakterler iki tarafta da aynı görünür.
"""
from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from typing import Any, Optional

from PIL import Image, ImageDraw, ImageFont

from app.utils import receipt_pdf
from app.utils.kurban_pdf import tr_upper

WIDTH, HEIGHT = 1600, 900
MARGIN = 60
RED = (220, 38, 38)
BLACK = (17, 24, 39)
MUTED = (75, 85, 99)
LINE = (209, 213, 219)
ZEBRA = (249, 250, 251)


def _font_path(name: str) -> Optional[str]:
    try:
        from reportlab.pdfbase import pdfmetrics

        return getattr(getattr(pdfmetrics.getFont(name), "face", None), "filename", None)
    except Exception:  # noqa: BLE001 - Helvetica gibi yerleşik fontların dosyası yok
        return None


@lru_cache(maxsize=256)
def _font(bold: bool, size: int) -> ImageFont.ImageFont:
    path = _font_path(receipt_pdf.FONT_BOLD if bold else receipt_pdf.FONT)
    if path:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def _fit(draw: ImageDraw.ImageDraw, text: str, bold: bool, max_size: int, max_width: int, min_size: int = 14):
    size = max_size
    while size > min_size and draw.textlength(text, font=_font(bold, size)) > max_width:
        size -= 2
    return _font(bold, size)


def _hex(value: Optional[str], default: str = "#065f46") -> tuple[int, int, int]:
    color = receipt_pdf._safe_hex(value, default)
    return tuple(int(round(c * 255)) for c in (color.red, color.green, color.blue))


def _logo(organization: Any) -> Optional[Image.Image]:
    if organization is None:
        return None
    try:
        path = receipt_pdf.resolve_logo_path(organization)
        if not path:
            return None
        image = Image.open(path)
        image.load()
        return image.convert("RGBA")
    except Exception:  # noqa: BLE001 - bozuk/eksik logo kartı durdurmaz
        return None


def _header(img: Image.Image, draw: ImageDraw.ImageDraw, org_name: str, organization: Any, primary) -> int:
    """Üst şerit + logo (yoksa kurum adı). Altındaki ilk boş y'yi döner."""
    draw.rectangle((0, 0, WIDTH, 18), fill=primary)
    logo = _logo(organization)
    if logo is not None:
        logo.thumbnail((360, 110))
        img.paste(logo, ((WIDTH - logo.width) // 2, 36), logo)
        return 36 + logo.height + 14
    font = _fit(draw, tr_upper(org_name), True, 44, WIDTH - 2 * MARGIN)
    draw.text((WIDTH // 2, 44), tr_upper(org_name), font=font, fill=primary, anchor="mt")
    return 44 + 60


def _centered(draw, y: int, text: str, bold: bool, size: int, fill, max_width: int = WIDTH - 2 * MARGIN) -> int:
    font = _fit(draw, text, bold, size, max_width)
    draw.text((WIDTH // 2, y), text, font=font, fill=fill, anchor="mt")
    return y + font.size + 12


def _png(img: Image.Image) -> bytes:
    out = BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def render_share_card(card: dict, org_name: str, organization: Any = None) -> bytes:
    """Tek hissedar kartı. card: build_kurban_cards'daki sözlükle aynı alanlar."""
    primary = _hex(getattr(organization, "theme_primary_color", None))
    img = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(img)
    y = _header(img, draw, org_name, organization, primary)

    _centered(draw, y + 10, f"KURBAN NO: {card.get('number') or '-'}", True, 72, RED)
    name = tr_upper(str(card.get("name") or ""))
    font = _fit(draw, name, True, 170, WIDTH - 2 * MARGIN)
    draw.text((WIDTH // 2, HEIGHT // 2 + 40), name, font=font, fill=BLACK, anchor="mm")

    title = tr_upper(" – ".join(x for x in (
        f"{card.get('kurban_type')} Kurban" if card.get("kurban_type") else "", card.get("animal_label") or "") if x))
    _centered(draw, HEIGHT - 230, title, True, 60, RED)
    place = " - ".join(str(x) for x in (card.get("country"), card.get("year")) if x)
    _centered(draw, HEIGHT - 150, place, False, 44, BLACK)
    if card.get("share_number") and card.get("capacity"):
        _centered(draw, HEIGHT - 80, f"{card['share_number']}. hisse / {card['capacity']}", False, 30, MUTED)
    return _png(img)


def render_animal_card(animal: dict, org_name: str, organization: Any = None) -> bytes:
    """Hayvan kartı: büyük numara + hissedar listesi (7 hissede iki sütun).

    animal: {"number", "type_label", "country", "season", "shares": [{"share_number", "name", "kurban_type"}]}
    """
    primary = _hex(getattr(organization, "theme_primary_color", None))
    img = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(img)
    y = _header(img, draw, org_name, organization, primary)

    y = _centered(draw, y, f"KURBAN NO: {animal.get('number') or '-'}", True, 110, RED)
    meta = " · ".join(str(x) for x in (animal.get("type_label"), animal.get("country"), animal.get("season")) if x)
    if meta:
        y = _centered(draw, y, meta, False, 34, MUTED)
    y += 10

    shares = animal.get("shares") or []
    if not shares:
        _centered(draw, y + 80, "Bu hayvana henüz hisse atanmadı", False, 40, MUTED)
        return _png(img)

    columns = 2 if len(shares) > 4 else 1
    per_column = -(-len(shares) // columns)
    gap = 30
    col_w = (WIDTH - 2 * MARGIN - gap * (columns - 1)) // columns
    bottom = HEIGHT - MARGIN + 20
    row_h = min(130, (bottom - y) // per_column)
    name_size = min(64, int(row_h * 0.46))
    for index, share in enumerate(shares):
        col, row = divmod(index, per_column)
        x0 = MARGIN + col * (col_w + gap)
        y0 = y + row * row_h
        draw.rounded_rectangle((x0, y0 + 4, x0 + col_w, y0 + row_h - 4), radius=14,
                               fill=ZEBRA if index % 2 else "white", outline=LINE, width=2)
        number = f"{share.get('share_number') or index + 1}."
        num_font = _font(True, name_size)
        draw.text((x0 + 22, y0 + row_h * 0.42), number, font=num_font, fill=primary, anchor="lm")
        text_x = x0 + 22 + int(draw.textlength("00.", font=num_font)) + 12
        name = tr_upper(str(share.get("name") or ""))
        draw.text((text_x, y0 + row_h * 0.42), name, anchor="lm", fill=BLACK,
                  font=_fit(draw, name, True, name_size, x0 + col_w - text_x - 20))
        intent = share.get("kurban_type") or ""
        if intent:
            draw.text((text_x, y0 + row_h * 0.80), intent, anchor="lm", fill=MUTED,
                      font=_font(False, max(18, int(name_size * 0.5))))
    return _png(img)
