"""Bağış makbuzu (alındı belgesi) PDF üretimi.

Yalnızca `reportlab` ve `Pillow` kullanır; uzak logo indirmez, ağ erişimi olmadan güvenle çalışır.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime
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


def _register_unicode_fonts() -> None:
    """Türkçe karakterleri (ve mümkünse ₺ simgesini) destekleyen fontu kaydeder."""
    global FONT, FONT_BOLD, FONT_ITALIC, HAS_TRY_GLYPH
    if "DejaVu" in pdfmetrics.getRegisteredFontNames():
        FONT, FONT_BOLD, FONT_ITALIC, HAS_TRY_GLYPH = "DejaVu", "DejaVuBd", "DejaVuIt", True
        return
    if "Vera" in pdfmetrics.getRegisteredFontNames():
        FONT, FONT_BOLD, FONT_ITALIC, HAS_TRY_GLYPH = "Vera", "VeraBd", "VeraIt", False
        return

    # DejaVu Sans: Türkçe + ₺ (U+20BA) gliflerini eksiksiz destekler.
    dejavu_dirs = [
        "/usr/share/fonts/truetype/dejavu",
        "/usr/share/fonts/dejavu",
        "/Library/Fonts",
    ]
    for base in dejavu_dirs:
        reg = os.path.join(base, "DejaVuSans.ttf")
        bold = os.path.join(base, "DejaVuSans-Bold.ttf")
        italic = os.path.join(base, "DejaVuSans-Oblique.ttf")
        if os.path.exists(reg) and os.path.exists(bold):
            try:
                pdfmetrics.registerFont(TTFont("DejaVu", reg))
                pdfmetrics.registerFont(TTFont("DejaVuBd", bold))
                pdfmetrics.registerFont(TTFont("DejaVuIt", italic if os.path.exists(italic) else reg))
                FONT, FONT_BOLD, FONT_ITALIC, HAS_TRY_GLYPH = "DejaVu", "DejaVuBd", "DejaVuIt", True
                return
            except Exception:
                pass

    # Fallback: reportlab ile birlikte gelen Bitstream Vera Sans (Türkçe glifler mevcut, ₺ yok).
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
    return hashlib.sha256(
        f"receipt-{receipt_number}-{amount_cents}".encode("utf-8")
    ).hexdigest()[:16]


def resolve_local_logo(organization: Any) -> ImageReader | None:
    """Kurum logosu yerel medya dizinindeyse ağ isteği yapmadan ImageReader döner."""
    logo_url = (getattr(organization, "logo_url", None) or "").strip()
    if not logo_url:
        return None
    # Yalnızca yerel /api/v1/media/<org_id>/<name> veya /media/... yollarını çöz
    path_part = logo_url.split("?")[0]
    candidate: Path | None = None
    try:
        from app.core.config import settings
        media_root = Path(settings.MEDIA_ROOT)
    except Exception:
        media_root = Path("media")

    if "/api/v1/media/" in path_part:
        rel = path_part.split("/api/v1/media/", 1)[1].lstrip("/")
        candidate = media_root / rel
    elif path_part.startswith("/media/"):
        rel = path_part[len("/media/"):].lstrip("/")
        candidate = media_root / rel

    if not candidate or not candidate.is_file():
        return None

    try:
        from PIL import Image
        with Image.open(candidate) as img:
            # Saydamlığı beyaz zeminle birleştirip PNG olarak belleğe al (WebP/RGBA uyumlu)
            rgba = img.convert("RGBA")
            bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
            bg.paste(rgba, mask=rgba.split()[3])
            out = BytesIO()
            bg.convert("RGB").save(out, format="PNG")
            out.seek(0)
            return ImageReader(out)
    except Exception:
        return None


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
    lines: list[tuple[str, int, str, str | None]] | None = None,
    status_label: str | None = None,
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

    # --- Kurum başlığı + Logo ---
    logo = resolve_local_logo(organization)
    header_x = margin
    if logo is not None:
        logo_size = 16 * mm
        pdf.setStrokeColor(line)
        pdf.setLineWidth(0.6)
        pdf.roundRect(margin, top - logo_size - 1 * mm, logo_size, logo_size, 3, fill=0, stroke=1)
        pdf.drawImage(logo, margin + 1 * mm, top - logo_size, width=logo_size - 2 * mm, height=logo_size - 2 * mm, preserveAspectRatio=True, mask="auto")
        header_x = margin + logo_size + 4 * mm

    org_name = (getattr(organization, "name", None) or "").strip() or "Dernek"
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
        for idx, (title_, cents, cur, behalf) in enumerate(lines[:14]):
            rh = 7 * mm
            if idx % 2 == 1:
                pdf.setFillColor(zebra)
                pdf.rect(margin, y - rh, table_w, rh, fill=1, stroke=0)
            pdf.setFillColor(ink)
            pdf.setFont(FONT, 9.5)
            pdf.drawString(margin + 3 * mm, y - 4.8 * mm, (title_ or "-")[:50])
            pdf.setFillColor(muted)
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
    vhash = verification_hash(receipt_number, amount_cents)
    verify_url = f"{verify_base_url.rstrip('/')}/verify/receipt/{receipt_number}"
    y -= box_h + 8 * mm
    card_h = 26 * mm
    pdf.setFillColor(zebra)
    pdf.setStrokeColor(line)
    pdf.setLineWidth(0.6)
    pdf.roundRect(margin, y - card_h, table_w, card_h, 4, fill=1, stroke=1)

    pdf.setFillColor(ink)
    pdf.setFont(FONT_BOLD, 9.5)
    pdf.drawString(margin + 5 * mm, y - 6.5 * mm, "Dijital Doğrulama ve Elektronik Onay")
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
        "Bu belge, kurum muhasebe sistemindeki resmi kayıtlar esas alınarak dijital olarak "
        "oluşturulmuş ve doğrulanmıştır."
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
