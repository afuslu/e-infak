"""Bağış makbuzu (alındı belgesi) PDF üretimi.

Yalnızca `reportlab` kullanır (requirements.txt'te mevcut, sistem bağımlılığı yok).
Uzak logo indirmez; ağ erişimi olmadan güvenle çalışır.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime
from io import BytesIO

import reportlab
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# Türkçe karakterler (ş, ğ, İ, ı) standart Helvetica'da yoktur. reportlab ile
# birlikte gelen Bitstream Vera Sans bunların tümünü kapsar; bir bağımlılık
# olduğu için sunucuda garanti mevcuttur.
FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
FONT_ITALIC = "Helvetica-Oblique"


def _register_unicode_fonts() -> None:
    global FONT, FONT_BOLD, FONT_ITALIC
    if "Vera" in pdfmetrics.getRegisteredFontNames():
        FONT, FONT_BOLD, FONT_ITALIC = "Vera", "VeraBd", "VeraIt"
        return
    fonts_dir = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
    try:
        pdfmetrics.registerFont(TTFont("Vera", os.path.join(fonts_dir, "Vera.ttf")))
        pdfmetrics.registerFont(TTFont("VeraBd", os.path.join(fonts_dir, "VeraBd.ttf")))
        pdfmetrics.registerFont(TTFont("VeraIt", os.path.join(fonts_dir, "VeraIt.ttf")))
        FONT, FONT_BOLD, FONT_ITALIC = "Vera", "VeraBd", "VeraIt"
    except Exception:
        # Font bulunamazsa ASCII-güvenli Helvetica'ya düş (Türkçe glifler bozulabilir)
        FONT, FONT_BOLD, FONT_ITALIC = "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


_register_unicode_fonts()

# Bitstream Vera Sans'ta ₺ (U+20BA) glifi yoktur; PDF'te "TL" kullanılır.
_CURRENCY_SYMBOL = {"TRY": "TL", "EUR": "€", "USD": "$"}
_PAYMENT_LABEL = {
    "credit_card": "Kredi Kartı (3D Secure)",
    "bank_transfer": "Havale / EFT",
    "cash": "Nakit",
}


def _fmt_amount(amount_cents: int, currency: str) -> str:
    symbol = _CURRENCY_SYMBOL.get(currency, currency + " ")
    value = amount_cents / 100
    # Türkçe binlik ayırıcı (nokta) ve kuruş (virgül)
    formatted = f"{value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{formatted} {symbol}"


def verification_hash(receipt_number: str, amount_cents: int) -> str:
    return hashlib.sha256(
        f"receipt-{receipt_number}-{amount_cents}".encode("utf-8")
    ).hexdigest()[:16]


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
) -> bytes:
    """Tek sayfalık resmi görünümlü bağış makbuzu üretir ve PDF bayt dizisi döner."""
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    primary = colors.HexColor(getattr(organization, "theme_primary_color", None) or "#065f46")
    ink = colors.HexColor("#1f2937")
    muted = colors.HexColor("#6b7280")
    line = colors.HexColor("#e5e7eb")

    margin = 20 * mm
    top = height - margin

    # --- Üst şerit ---
    pdf.setFillColor(primary)
    pdf.rect(0, height - 12 * mm, width, 12 * mm, fill=1, stroke=0)

    # --- Kurum başlığı ---
    pdf.setFillColor(ink)
    pdf.setFont(FONT_BOLD,18)
    org_name = (getattr(organization, "name", None) or "").strip() or "Dernek"
    pdf.drawString(margin, top - 6 * mm, org_name)

    pdf.setFont(FONT,9)
    pdf.setFillColor(muted)
    legal = (getattr(organization, "legal_name", None) or "").strip()
    meta_line = " · ".join(
        part for part in (
            legal if legal and legal != org_name else None,
            (getattr(organization, "address", None) or "").strip() or None,
        ) if part
    )
    if meta_line:
        pdf.drawString(margin, top - 11 * mm, meta_line[:110])
    contact = " · ".join(
        part for part in (
            (getattr(organization, "phone", None) or "").strip() or None,
            (getattr(organization, "email", None) or "").strip() or None,
            (f"VKN: {organization.tax_number}" if getattr(organization, "tax_number", None) else None),
        ) if part
    )
    if contact:
        pdf.drawString(margin, top - 15 * mm, contact[:110])

    # --- Belge başlığı ---
    pdf.setFillColor(primary)
    pdf.setFont(FONT_BOLD,15)
    title = "BAĞIŞ MAKBUZU" if status != "refunded" else "BAĞIŞ MAKBUZU ( İADE EDİLDİ )"
    pdf.drawRightString(width - margin, top - 6 * mm, title)

    # --- Ayraç ---
    y = top - 24 * mm
    pdf.setStrokeColor(line)
    pdf.setLineWidth(1)
    pdf.line(margin, y, width - margin, y)

    # --- Detay tablosu ---
    rows = [
        ("Makbuz No", receipt_number),
        ("Bağışçı", donor_name or "Anonim Bağışçı"),
        *([("Adına Bağış", on_behalf_of[:80])] if on_behalf_of else []),
        ("Kampanya", (getattr(campaign, "title", None) or "-")[:80]),
        ("Ödeme Yöntemi", _PAYMENT_LABEL.get(payment_method, payment_method)),
        (
            "Tarih",
            (paid_at or datetime.now()).strftime("%d.%m.%Y %H:%M"),
        ),
        ("Durum", {"refunded": "İade edildi", "cancelled": "İptal edildi"}.get(status, "Geçerli / Onaylandı")),
    ]
    y -= 12 * mm
    pdf.setFont(FONT,11)
    for label, value in rows:
        pdf.setFillColor(muted)
        pdf.setFont(FONT,10)
        pdf.drawString(margin, y, label)
        pdf.setFillColor(ink)
        pdf.setFont(FONT_BOLD,11)
        pdf.drawString(margin + 45 * mm, y, str(value))
        y -= 9 * mm

    # --- Tutar kutusu ---
    y -= 4 * mm
    box_h = 20 * mm
    pdf.setFillColor(colors.HexColor("#f0fdf4"))
    pdf.setStrokeColor(primary)
    pdf.roundRect(margin, y - box_h, width - 2 * margin, box_h, 6, fill=1, stroke=1)
    pdf.setFillColor(muted)
    pdf.setFont(FONT,10)
    pdf.drawString(margin + 6 * mm, y - 8 * mm, "Bağış Tutarı")
    pdf.setFillColor(primary)
    pdf.setFont(FONT_BOLD,22)
    pdf.drawRightString(width - margin - 6 * mm, y - 12 * mm, _fmt_amount(amount_cents, currency))

    # --- Doğrulama ---
    vhash = verification_hash(receipt_number, amount_cents)
    verify_url = f"{verify_base_url.rstrip('/')}/verify/receipt/{receipt_number}"
    y -= box_h + 14 * mm
    pdf.setFillColor(ink)
    pdf.setFont(FONT_BOLD,10)
    pdf.drawString(margin, y, "Dijital Doğrulama & QR Kod")
    pdf.setFillColor(muted)
    pdf.setFont(FONT,8.5)
    pdf.drawString(margin, y - 5 * mm, f"Doğrulama Kodu: {vhash}")
    pdf.drawString(margin, y - 9 * mm, f"Doğrulama Adresi: {verify_url}")

    # Draw QR Code
    try:
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing
        qr = QrCodeWidget(verify_url)
        bounds = qr.getBounds()
        w = bounds[2] - bounds[0]
        h = bounds[3] - bounds[1]
        d = Drawing(45, 45, transform=[45 / w, 0, 0, 45 / h, 0, 0])
        d.add(qr)
        d.drawOn(pdf, width - margin - 45, y - 10 * mm)
    except Exception as qr_err:
        print(f"QR code render error: {qr_err}")

    # --- Alt not / footer ---
    pdf.setFillColor(muted)
    pdf.setFont(FONT_ITALIC,8)
    footer = (
        "Bu belge, dernek muhasebe sistemindeki resmi kayıtlar esas alınarak dijital olarak "
        "oluşturulmuş ve doğrulanmıştır. Bağışlarınız vergi indirimi kapsamındadır."
    )
    style = ParagraphStyle("footer", fontName=FONT_ITALIC, fontSize=8, textColor=muted, leading=11)
    from reportlab.platypus import Paragraph

    para = Paragraph(footer, style)
    para.wrapOn(pdf, width - 2 * margin, 20 * mm)
    para.drawOn(pdf, margin, margin + 6 * mm)

    pdf.setFillColor(primary)
    pdf.setFont(FONT_BOLD,8)
    pdf.drawRightString(width - margin, margin, "E-İnfak altyapısı ile güçlendirilmiştir")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
