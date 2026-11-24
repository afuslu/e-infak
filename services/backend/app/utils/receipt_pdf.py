"""Bağış makbuzu (alındı belgesi) PDF üretimi.

Yalnızca `reportlab` ve `Pillow` kullanır; uzak logo indirmez, ağ erişimi olmadan güvenle çalışır.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any

import reportlab
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_ITALIC = "Helvetica-Oblique"
HAS_TRY_GLYPH = False

_TURKISH_REQUIRED_CODEPOINTS = (0x00C7, 0x00E7, 0x011E, 0x011F, 0x0130, 0x0131, 0x00D6, 0x00F6, 0x015E, 0x015F, 0x00DC, 0x00FC)


def tr_upper(text: str) -> str:
    """Türkçe büyük harf: i→İ, ı→I (str.upper 'i'yi 'I' yapar)."""
    return (text or "").replace("i", "İ").replace("ı", "I").upper()


def _supports_turkish(font_obj: TTFont) -> bool:
    cmap = getattr(getattr(font_obj, "face", None), "charToGlyph", None) or {}
    return all(cp in cmap for cp in _TURKISH_REQUIRED_CODEPOINTS)


def _register_unicode_fonts() -> None:
    """Türkçe karakterleri (ÇçĞğİıÖöŞşÜü ve mümkünse ₺ simgesini) eksiksiz destekleyen fontu kaydeder."""
    global FONT, FONT_BOLD, FONT_ITALIC, HAS_TRY_GLYPH

    if "CorpUnicode" in pdfmetrics.getRegisteredFontNames():
        FONT, FONT_BOLD, FONT_ITALIC = "CorpUnicode", "CorpUnicodeBd", "CorpUnicodeIt"
        return

    bundled_dir = Path(__file__).resolve().parent.parent / "assets" / "fonts"
    candidates: list[tuple[str, str, str]] = [
        # 1. Proje içi gömülü font (varsa)
        (str(bundled_dir / "DejaVuSans.ttf"), str(bundled_dir / "DejaVuSans-Bold.ttf"), str(bundled_dir / "DejaVuSans-Oblique.ttf")),
        # 2. DejaVu Sans (Linux / Docker: fonts-dejavu-core) — Türkçe + ₺ tam destek
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
        ("/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Oblique.ttf"),
        ("/Library/Fonts/DejaVuSans.ttf", "/Library/Fonts/DejaVuSans-Bold.ttf", "/Library/Fonts/DejaVuSans-Oblique.ttf"),
        # 3. Liberation Sans (Linux)
        ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf"),
        ("/usr/share/fonts/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/liberation/LiberationSans-Bold.ttf", "/usr/share/fonts/liberation/LiberationSans-Italic.ttf"),
        # 4. Noto Sans (Linux)
        ("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf", "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf", "/usr/share/fonts/truetype/noto/NotoSans-Italic.ttf"),
        # 5. macOS Arial (Supplemental) — Türkçe tam destek
        ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Italic.ttf"),
        ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf", "/Library/Fonts/Arial Italic.ttf"),
        # 6. FreeSans (Linux)
        ("/usr/share/fonts/truetype/freefont/FreeSans.ttf", "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf", "/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf"),
    ]

    for reg_path, bold_path, italic_path in candidates:
        if not (os.path.exists(reg_path) and os.path.exists(bold_path)):
            continue
        try:
            reg_font = TTFont("CorpUnicode", reg_path)
            if not _supports_turkish(reg_font):
                continue
            bold_font = TTFont("CorpUnicodeBd", bold_path)
            italic_font = TTFont("CorpUnicodeIt", italic_path if os.path.exists(italic_path) else reg_path)
            pdfmetrics.registerFont(reg_font)
            pdfmetrics.registerFont(bold_font)
            pdfmetrics.registerFont(italic_font)
            pdfmetrics.registerFontFamily(
                "CorpUnicode",
                normal="CorpUnicode",
                bold="CorpUnicodeBd",
                italic="CorpUnicodeIt",
                boldItalic="CorpUnicodeBd",
            )
            cmap = getattr(getattr(reg_font, "face", None), "charToGlyph", None) or {}
            FONT, FONT_BOLD, FONT_ITALIC = "CorpUnicode", "CorpUnicodeBd", "CorpUnicodeIt"
            HAS_TRY_GLYPH = 0x20BA in cmap
            return
        except Exception:
            continue

    # Son çare fallback: Bitstream Vera Sans (not: bazı Türkçe glifler eksik olabilir) veya Helvetica
    fonts_dir = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
    try:
        pdfmetrics.registerFont(TTFont("Vera", os.path.join(fonts_dir, "Vera.ttf")))
        pdfmetrics.registerFont(TTFont("VeraBd", os.path.join(fonts_dir, "VeraBd.ttf")))
        pdfmetrics.registerFont(TTFont("VeraIt", os.path.join(fonts_dir, "VeraIt.ttf")))
        FONT, FONT_BOLD, FONT_ITALIC, HAS_TRY_GLYPH = "Vera", "VeraBd", "VeraIt", False
    except Exception:
        FONT, FONT_BOLD, FONT_ITALIC, HAS_TRY_GLYPH = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", False


_register_unicode_fonts()

_PAYMENT_LABEL = {
    "credit_card": "Kredi Kartı (3D Secure)",
    "bank_transfer": "Havale / EFT",
    "cash": "Nakit",
}


def _fmt_amount(amount_cents: int, currency: str) -> str:
    symbols = {"TRY": "₺" if HAS_TRY_GLYPH else "TL", "EUR": "€", "USD": "$"}
    symbol = symbols.get(currency, currency + " ")
    value = amount_cents / 100
    formatted = f"{value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{formatted} {symbol}"


def verification_hash(receipt_number: str, amount_cents: int) -> str:
    """Code printed on the receipt. Keyed with the server secret, so it cannot be computed from the
    receipt number alone: whoever shows the code has seen the real receipt."""
    import hmac

    from app.core.config import settings

    digest = hmac.new(settings.SECRET_KEY.encode(), f"receipt:{receipt_number}:{amount_cents}".encode(), hashlib.sha256)
    return digest.hexdigest()[:12].upper()


def code_matches(receipt_number: str, amount_cents: int, code: str | None) -> bool:
    import hmac

    return bool(code) and hmac.compare_digest(verification_hash(receipt_number, amount_cents), code.strip().upper())


@lru_cache(maxsize=64)
def _cached_pdf_logo_bytes(path_str: str, mtime_ns: int) -> bytes | None:
    try:
        from PIL import Image
        with Image.open(path_str) as img:
            # Saydamlığı beyaz zeminle birleştirip PNG olarak belleğe al (WebP/RGBA uyumlu)
            rgba = img.convert("RGBA")
            bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            bg.paste(rgba, mask=rgba.split()[3])
            out = BytesIO()
            bg.convert("RGB").save(out, format="PNG")
            return out.getvalue()
    except Exception:
        return None


def _candidate_logo_urls(organization: Any) -> list[str]:
    if organization is None:
        return []
    site = getattr(organization, "site", None)
    site_dict = site if isinstance(site, dict) else {}
    raw = [
        site_dict.get("pdf_logo_url"),
        getattr(organization, "logo_url", None),
        site_dict.get("logo_url"),
        site_dict.get("footer_logo_url"),
    ]
    out: list[str] = []
    for item in raw:
        val = (item or "").strip() if isinstance(item, str) else ""
        if val and not val.lower().split("?")[0].endswith(".svg") and val not in out:
            out.append(val)
    return out


def _safe_child(base: Path, rel: str) -> Path | None:
    try:
        resolved_base = base.resolve()
        candidate = (resolved_base / rel.lstrip("/")).resolve()
        if candidate.is_file() and (candidate == resolved_base or resolved_base in candidate.parents):
            return candidate
    except OSError:
        return None
    return None


def resolve_logo_path(organization: Any) -> Path | None:
    """Kurum logosunu yerel medya veya statik public/images dizinlerinden çözer (ağ isteği yapmaz)."""
    urls = _candidate_logo_urls(organization)
    if not urls:
        return None
    try:
        from app.core.config import settings
        media_root = Path(settings.MEDIA_ROOT)
    except Exception:
        media_root = Path("media")

    # Proje kökü: services/backend/app/utils/receipt_pdf.py -> 4 üst dizin (monorepo) veya backend kökü
    here = Path(__file__).resolve()
    static_roots: list[Path] = []
    for parent in (here.parents[4] if len(here.parents) > 4 else here.parent, here.parents[2] if len(here.parents) > 2 else here.parent):
        for sub in ("public", "apps/web/public"):
            p = parent / sub
            if p.is_dir() and p not in static_roots:
                static_roots.append(p)

    for logo_url in urls:
        path_part = logo_url.split("?")[0].split("#")[0]
        # Tam URL ise sadece path kısmını al (örn. https://site.org/api/v1/media/...)
        if "://" in path_part:
            from urllib.parse import urlparse
            path_part = urlparse(path_part).path

        found: Path | None = None
        if "/api/v1/media/" in path_part:
            rel = path_part.split("/api/v1/media/", 1)[1]
            found = _safe_child(media_root, rel)
        elif path_part.startswith("/media/"):
            rel = path_part[len("/media/"):]
            found = _safe_child(media_root, rel)
        elif path_part.startswith("/uploads/"):
            rel = path_part[len("/uploads/"):]
            found = _safe_child(media_root, rel)
        elif path_part.startswith("/images/") or path_part.startswith("images/"):
            rel = path_part.lstrip("/")
            for sroot in static_roots:
                found = _safe_child(sroot, rel)
                if found:
                    break
            if not found:
                found = _safe_child(media_root, rel)

        if found is not None:
            return found
    return None


def resolve_local_logo(organization: Any) -> ImageReader | None:
    """Kurum logosu yerel medya/statik dizindeyse ağ isteği yapmadan ImageReader döner."""
    candidate = resolve_logo_path(organization)
    if not candidate:
        return None

    try:
        mtime_ns = candidate.stat().st_mtime_ns
    except OSError:
        return None

    raw = _cached_pdf_logo_bytes(str(candidate), mtime_ns)
    if not raw:
        return None
    return ImageReader(BytesIO(raw))


def _org_initials(name: str) -> str:
    words = [w for w in (name or "").strip().split() if w and w[0].isalnum()]
    if not words:
        return "Eİ"
    if len(words) == 1:
        return tr_upper(words[0][:2])
    return tr_upper(words[0][0] + words[1][0])


def draw_org_monogram(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    size: float,
    org_name: str,
    primary: colors.Color,
    *,
    circle: bool = False,
) -> None:
    """Logo yüklenmemiş kurumlar için şık kurumsal monogram rozeti çizer."""
    pdf.saveState()
    bg = _tint(primary, 0.12)
    pdf.setFillColor(bg)
    pdf.setStrokeColor(primary)
    pdf.setLineWidth(1.0)
    if circle:
        r = size / 2
        pdf.circle(x + r, y + r, r, fill=1, stroke=1)
    else:
        pdf.roundRect(x, y, size, size, 4, fill=1, stroke=1)
    initials = _org_initials(org_name)
    font_size = max(8, size * 0.38)
    pdf.setFillColor(primary)
    pdf.setFont(FONT_BOLD, font_size)
    pdf.drawCentredString(x + size / 2, y + size / 2 - font_size * 0.35, initials)
    pdf.restoreState()


def _safe_hex(value: str | None, default: str = "#065f46") -> colors.Color:
    try:
        return colors.HexColor(value or default)
    except Exception:
        return colors.HexColor(default)


def _tint(color: colors.Color, alpha: float = 0.08) -> colors.Color:
    """Rengi beyazla karıştırarak açık arka plan tonu üretir."""
    return colors.Color(
        1 - (1 - color.red) * alpha,
        1 - (1 - color.green) * alpha,
        1 - (1 - color.blue) * alpha,
    )


def _is_tax_exempt(organization: Any) -> bool:
    if getattr(organization, "tax_exempt", False):
        return True
    org_settings = getattr(organization, "settings", None)
    if isinstance(org_settings, dict):
        return bool(org_settings.get("tax_exempt") or org_settings.get("public_benefit"))
    return False


def build_receipt_pdf(
    *,
    organization,
    campaign,
    donor_name: str,
    receipt_number: str,
    amount_cents: int,
    currency: str,
    payment_method: str,
    paid_at: datetime | None,
    status: str,
    verify_base_url: str,
    on_behalf_of: str | None = None,
    official_receipt_no: str | None = None,
    lines: list[tuple[str, int, str, str | None, str | None]] | None = None,
    status_label: str | None = None,
    intent: str | None = None,
    verify_amount_cents: int | None = None,
) -> bytes:
    """Tek sayfalık kurumsal bağış makbuzu üretir ve PDF bayt dizisi döner."""
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setTitle(f"Bağış Makbuzu - {receipt_number}")
    width, height = A4

    primary = _safe_hex(getattr(organization, "theme_primary_color", None), "#065f46")
    ink = colors.HexColor("#111827")
    muted = colors.HexColor("#6b7280")
    line = colors.HexColor("#e5e7eb")
    zebra = colors.HexColor("#f9fafb")

    margin = 18 * mm
    top = height - margin

    # --- Üst kurumsal şerit ---
    pdf.setFillColor(primary)
    pdf.rect(0, height - 9 * mm, width, 9 * mm, fill=1, stroke=0)

    # --- Kurum başlığı + Logo (yoksa kurumsal monogram rozeti) ---
    org_name = (getattr(organization, "name", None) or "").strip() or "Dernek"
    logo = resolve_local_logo(organization)
    logo_size = 16 * mm
    if logo is not None:
        pdf.setStrokeColor(line)
        pdf.setLineWidth(0.6)
        pdf.roundRect(margin, top - logo_size - 1 * mm, logo_size, logo_size, 3, fill=0, stroke=1)
        pdf.drawImage(logo, margin + 1 * mm, top - logo_size, width=logo_size - 2 * mm, height=logo_size - 2 * mm, preserveAspectRatio=True, mask="auto")
    else:
        draw_org_monogram(pdf, margin, top - logo_size - 1 * mm, logo_size, org_name, primary)
    header_x = margin + logo_size + 4 * mm

    pdf.setFillColor(ink)
    pdf.setFont(FONT_BOLD, 16)
    pdf.drawString(header_x, top - 6 * mm, org_name[:42])

    pdf.setFont(FONT, 8.5)
    pdf.setFillColor(muted)
    legal = (getattr(organization, "legal_name", None) or "").strip()
    meta_line = " · ".join(
        part for part in (
            legal if legal and legal != org_name else None,
            (getattr(organization, "address", None) or "").strip() or None,
        ) if part
    )
    if meta_line:
        pdf.drawString(header_x, top - 11 * mm, meta_line[:85])

    contact = " · ".join(
        part for part in (
            (getattr(organization, "phone", None) or "").strip() or None,
            (getattr(organization, "email", None) or "").strip() or None,
            (f"VKN: {organization.tax_number}" if getattr(organization, "tax_number", None) else None),
        ) if part
    )
    if contact:
        pdf.drawString(header_x, top - 15.5 * mm, contact[:85])

    # --- Sağ üst: Belge Başlığı & Durum Rozeti ---
    pdf.setFillColor(primary)
    pdf.setFont(FONT_BOLD, 14)
    pdf.drawRightString(width - margin, top - 6 * mm, "BAĞIŞ MAKBUZU")

    badge_text = status_label or {
        "refunded": "İADE EDİLDİ",
        "cancelled": "İPTAL EDİLDİ",
    }.get(status, "GEÇERLİ / ONAYLANDI")
    if status == "refunded":
        badge_bg, badge_fg = colors.HexColor("#fef2f2"), colors.HexColor("#b91c1c")
    elif status == "cancelled":
        badge_bg, badge_fg = colors.HexColor("#f3f4f6"), colors.HexColor("#4b5563")
    elif status_label and "Beklemede" in status_label:
        badge_bg, badge_fg = colors.HexColor("#fffbeb"), colors.HexColor("#b45309")
    else:
        badge_bg, badge_fg = _tint(primary, 0.12), primary

    pdf.setFont(FONT_BOLD, 8)
    bw = pdf.stringWidth(badge_text, FONT_BOLD, 8) + 8 * mm
    bh = 6 * mm
    bx = width - margin - bw
    by = top - 15 * mm
    pdf.setFillColor(badge_bg)
    pdf.setStrokeColor(badge_fg)
    pdf.setLineWidth(0.6)
    pdf.roundRect(bx, by, bw, bh, 3, fill=1, stroke=1)
    pdf.setFillColor(badge_fg)
    pdf.drawCentredString(bx + bw / 2, by + 2 * mm, badge_text)

    # --- Ayraç ---
    y = top - 23 * mm
    pdf.setStrokeColor(line)
    pdf.setLineWidth(0.8)
    pdf.line(margin, y, width - margin, y)

    # --- Detay tablosu (çerçeveli ve zebra satırlı) ---
    rows = [
        ("Makbuz No", receipt_number),
        *([("Koçan / Yaprak No", official_receipt_no)] if official_receipt_no else []),
        ("Bağışçı", donor_name or "Anonim Bağışçı"),
        *([("Adına Bağış", on_behalf_of[:80])] if on_behalf_of and not lines else []),
        *([] if lines else [("Kampanya", (getattr(campaign, "title", None) or "-")[:80])]),
        *([("Niyet", intent[:80])] if intent and not lines else []),
        ("Ödeme Yöntemi", _PAYMENT_LABEL.get(payment_method, payment_method)),
        ("Düzenlenme Tarihi", (paid_at or datetime.now()).strftime("%d.%m.%Y %H:%M")),
    ]

    y -= 6 * mm
    row_h = 8 * mm
    table_h = len(rows) * row_h
    table_w = width - 2 * margin
    pdf.setStrokeColor(line)
    pdf.setLineWidth(0.6)
    pdf.roundRect(margin, y - table_h, table_w, table_h, 4, fill=0, stroke=1)

    for idx, (label, value) in enumerate(rows):
        ry = y - (idx + 1) * row_h
        if idx % 2 == 1:
            pdf.setFillColor(zebra)
            pdf.rect(margin + 0.5, ry + 0.5, table_w - 1, row_h - 0.5, fill=1, stroke=0)
        if idx > 0:
            pdf.setStrokeColor(line)
            pdf.setLineWidth(0.4)
            pdf.line(margin, ry + row_h, width - margin, ry + row_h)
        pdf.setFillColor(muted)
        pdf.setFont(FONT, 9.5)
        pdf.drawString(margin + 4 * mm, ry + 2.6 * mm, label)
        pdf.setFillColor(ink)
        pdf.setFont(FONT_BOLD, 10)
        pdf.drawString(margin + 48 * mm, ry + 2.6 * mm, str(value))

    y -= table_h

    # --- Kalemler (birden çok bağış kalemi olan makbuz) ---
    if lines:
        y -= 6 * mm
        pdf.setFillColor(_tint(primary, 0.08))
        pdf.rect(margin, y - 7 * mm, table_w, 7 * mm, fill=1, stroke=0)
        pdf.setFillColor(primary)
        pdf.setFont(FONT_BOLD, 8.5)
        pdf.drawString(margin + 3 * mm, y - 4.8 * mm, "BAĞIŞ KALEMİ")
        pdf.drawString(margin + 96 * mm, y - 4.8 * mm, "ADINA")
        pdf.drawRightString(width - margin - 3 * mm, y - 4.8 * mm, "TUTAR")
        y -= 7 * mm
        for idx, (title_, cents, cur, behalf, line_intent) in enumerate(lines[:14]):
            rh = 7 * mm
            if idx % 2 == 1:
                pdf.setFillColor(zebra)
                pdf.rect(margin, y - rh, table_w, rh, fill=1, stroke=0)
            pdf.setFillColor(ink)
            pdf.setFont(FONT, 9.5)
            pdf.drawString(margin + 3 * mm, y - (3.5 if line_intent else 4.8) * mm, (title_ or "-")[:50])
            pdf.setFillColor(muted)
            if line_intent:
                pdf.setFont(FONT, 7)
                pdf.drawString(margin + 3 * mm, y - 6.2 * mm, f"Niyet: {line_intent[:50]}")
                pdf.setFont(FONT, 9.5)
            pdf.drawString(margin + 96 * mm, y - 4.8 * mm, (behalf or "-")[:26])
            pdf.setFillColor(ink)
            pdf.setFont(FONT_BOLD, 9.5)
            pdf.drawRightString(width - margin - 3 * mm, y - 4.8 * mm, _fmt_amount(cents, cur))
            y -= rh
            pdf.setStrokeColor(line)
            pdf.setLineWidth(0.4)
            pdf.line(margin, y, width - margin, y)

    # --- Tutar kutusu (dengeli hizalama) ---
    y -= 7 * mm
    box_h = 18 * mm
    pdf.setFillColor(_tint(primary, 0.08))
    pdf.setStrokeColor(primary)
    pdf.setLineWidth(0.9)
    pdf.roundRect(margin, y - box_h, table_w, box_h, 5, fill=1, stroke=1)

    pdf.setFillColor(muted)
    pdf.setFont(FONT_BOLD, 8.5)
    pdf.drawString(margin + 6 * mm, y - 7.5 * mm, "TOPLAM BAĞIŞ TUTARI")
    pdf.setFont(FONT, 8)
    pdf.drawString(margin + 6 * mm, y - 12.5 * mm, "Kurum kayıtlarına işlenmiştir")

    pdf.setFillColor(primary)
    pdf.setFont(FONT_BOLD, 20)
    pdf.drawRightString(width - margin - 6 * mm, y - 11.5 * mm, _fmt_amount(amount_cents, currency))

    # --- Dijital Doğrulama & QR Kod Kartı ---
    vhash = verification_hash(receipt_number, amount_cents if verify_amount_cents is None else verify_amount_cents)
    verify_url = f"{verify_base_url.rstrip('/')}/verify/receipt/{receipt_number}?k={vhash}"
    y -= box_h + 8 * mm
    card_h = 26 * mm
    pdf.setFillColor(zebra)
    pdf.setStrokeColor(line)
    pdf.setLineWidth(0.6)
    pdf.roundRect(margin, y - card_h, table_w, card_h, 4, fill=1, stroke=1)

    pdf.setFillColor(ink)
    pdf.setFont(FONT_BOLD, 9.5)
    pdf.drawString(margin + 5 * mm, y - 6.5 * mm, "Makbuz Doğrulama")
    pdf.setFillColor(muted)
    pdf.setFont(FONT, 8)
    pdf.drawString(margin + 5 * mm, y - 11.5 * mm, f"Doğrulama Kodu: {vhash}")
    pdf.drawString(margin + 5 * mm, y - 16 * mm, f"Doğrulama Adresi: {verify_url[:72]}")
    pdf.drawString(margin + 5 * mm, y - 20.5 * mm, "Bu belge elektronik ortamda üretilmiştir; ıslak imza gerektirmez.")

    try:
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing
        qr = QrCodeWidget(verify_url)
        bounds = qr.getBounds()
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        qr_size = 54
        qx = width - margin - 5 * mm - qr_size
        qy = y - card_h + (card_h - qr_size) / 2
        pdf.setFillColor(colors.white)
        pdf.setStrokeColor(line)
        pdf.roundRect(qx - 2, qy - 2, qr_size + 4, qr_size + 4, 2, fill=1, stroke=1)
        d = Drawing(qr_size, qr_size, transform=[qr_size / w, 0, 0, qr_size / h, 0, 0])
        d.add(qr)
        d.drawOn(pdf, qx, qy)
    except Exception as qr_err:
        print(f"QR code render error: {qr_err}")

    # --- Alt not / footer ---
    footer_y = margin + 10 * mm
    pdf.setStrokeColor(line)
    pdf.setLineWidth(0.5)
    pdf.line(margin, footer_y + 4 * mm, width - margin, footer_y + 4 * mm)

    footer_text = (
        "Bu belge, kurum muhasebe sistemindeki kayıtlar esas alınarak elektronik ortamda "
        "oluşturulmuştur; doğrulama koduyla kayıttan teyit edilebilir."
    )
    if _is_tax_exempt(organization):
        footer_text += " Bağışlarınız ilgili mevzuat çerçevesinde vergi indirimi kapsamındadır."

    style = ParagraphStyle("footer", fontName=FONT_ITALIC, fontSize=8, textColor=muted, leading=11)
    para = Paragraph(footer_text, style)
    para.wrapOn(pdf, table_w - 48 * mm, 16 * mm)
    para.drawOn(pdf, margin, margin)

    pdf.setFillColor(primary)
    pdf.setFont(FONT_BOLD, 8)
    pdf.drawRightString(width - margin, margin + 2 * mm, "E-İnfak altyapısı ile üretilmiştir")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
