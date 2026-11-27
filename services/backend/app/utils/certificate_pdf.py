"""Kurumsal Teşekkür ve Hayır Sertifikası PDF üreticisi (`reportlab`).

Türkçe karakterleri eksiksiz destekler, kurum logosu (yoksa kurumsal monogram),
marka rengi, altın çerçeve, köşe süsleri ve doğrulama QR kodu içerir.
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

from app.utils import receipt_pdf


def _fit_font_size(pdf: canvas.Canvas, text: str, font_name: str, max_size: float, max_width: float, min_size: float = 10.0) -> float:
    size = max_size
    while size > min_size and pdf.stringWidth(text, font_name, size) > max_width:
        size -= 0.5
    return size


def _esc(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _draw_corner_ornament(pdf: canvas.Canvas, cx: float, cy: float, dx: int, dy: int, accent: colors.Color) -> None:
    """Çerçeve köşelerine zarif L şeklinde çift kurumsal köşe süsü çizer."""
    pdf.saveState()
    pdf.setStrokeColor(accent)
    pdf.setLineWidth(1.4)
    arm = 9 * mm
    pdf.line(cx, cy, cx + dx * arm, cy)
    pdf.line(cx, cy, cx, cy + dy * arm)
    pdf.setLineWidth(0.7)
    offset = 2.2 * mm
    pdf.line(cx + dx * offset, cy + dy * offset, cx + dx * (arm - 2 * mm), cy + dy * offset)
    pdf.line(cx + dx * offset, cy + dy * offset, cx + dx * offset, cy + dy * (arm - 2 * mm))
    pdf.setFillColor(accent)
    pdf.circle(cx + dx * offset, cy + dy * offset, 1.1 * mm, fill=1, stroke=0)
    pdf.restoreState()


def build_certificate_pdf(
    *,
    organization: Any,
    donor_name: str,
    campaign_title: str,
    amount_cents: int,
    currency: str,
    receipt_number: str,
    paid_at: datetime | None,
    behalf: str = "",
    dedication_suffix: str = "adına / hatırasına",
    verify_base_url: str = "",
) -> bytes:
    """A4 yatay kurumsal Teşekkür ve Hayır Sertifikası PDF'i üretir."""
    font = receipt_pdf.FONT
    bold = receipt_pdf.FONT_BOLD
    italic = receipt_pdf.FONT_ITALIC

    primary = receipt_pdf._safe_hex(getattr(organization, "theme_primary_color", None), "#065f46")
    gold = colors.HexColor("#b8912e")
    ivory = colors.HexColor("#fcfbf7")
    ink = colors.HexColor("#111827")
    slate = colors.HexColor("#374151")
    muted = colors.HexColor("#6b7280")
    soft_line = colors.HexColor("#e5e7eb")

    org_name = (getattr(organization, "name", None) or "").strip() or "E-İnfak"
    legal_name = (getattr(organization, "legal_name", None) or "").strip()
    date_str = receipt_pdf.to_local(paid_at).strftime("%d.%m.%Y")
    amount_str = receipt_pdf._fmt_amount(int(amount_cents or 0), currency or "TRY")
    donor_display = (donor_name or "").strip() or "Değerli Bağışçımız"
    camp_display = (campaign_title or "").strip() or "Genel Hayır Faaliyetleri"

    buf = BytesIO()
    page = landscape(A4)
    w, h = page
    c = canvas.Canvas(buf, pagesize=page)
    c.setTitle(f"Teşekkür ve Hayır Sertifikası - {receipt_number}")

    # --- Zemin ve çift kurumsal çerçeve ---
    c.setFillColor(ivory)
    c.rect(0, 0, w, h, fill=1, stroke=0)

    # Üst ve alt ince kurumsal şerit
    c.setFillColor(primary)
    c.rect(0, h - 4.5 * mm, w, 4.5 * mm, fill=1, stroke=0)
    c.rect(0, 0, w, 4.5 * mm, fill=1, stroke=0)

    # Dış ana çerçeve
    outer = 12 * mm
    c.setStrokeColor(primary)
    c.setLineWidth(3.2)
    c.rect(outer, outer, w - 2 * outer, h - 2 * outer, fill=0, stroke=1)

    # İç altın çerçeve
    inner = 16.5 * mm
    c.setFillColor(colors.white)
    c.setStrokeColor(gold)
    c.setLineWidth(1.2)
    c.rect(inner, inner, w - 2 * inner, h - 2 * inner, fill=1, stroke=1)

    # 4 köşe süsü
    orn_in = inner + 3.2 * mm
    _draw_corner_ornament(c, orn_in, h - orn_in, 1, -1, gold)
    _draw_corner_ornament(c, w - orn_in, h - orn_in, -1, -1, gold)
    _draw_corner_ornament(c, orn_in, orn_in, 1, 1, gold)
    _draw_corner_ornament(c, w - orn_in, orn_in, -1, 1, gold)

    # --- Üst bölüm: Kurum logosu (veya kurumsal monogram) + Kurum adı ---
    logo = receipt_pdf.resolve_local_logo(organization)
    cursor_y = h - 23 * mm
    if logo is not None:
        logo_h = 18 * mm
        logo_w = 48 * mm
        c.drawImage(
            logo,
            (w - logo_w) / 2,
            cursor_y - logo_h,
            width=logo_w,
            height=logo_h,
            preserveAspectRatio=True,
            mask="auto",
        )
        cursor_y -= logo_h + 4.5 * mm
    else:
        badge_size = 15 * mm
        receipt_pdf.draw_org_monogram(
            c,
            (w - badge_size) / 2,
            cursor_y - badge_size,
            badge_size,
            org_name,
            primary,
            circle=True,
        )
        cursor_y -= badge_size + 4.5 * mm

    org_title = receipt_pdf.tr_upper(org_name)[:70]
    org_font_sz = _fit_font_size(c, org_title, bold, 14, w - 70 * mm, min_size=10)
    c.setFillColor(primary)
    c.setFont(bold, org_font_sz)
    c.drawCentredString(w / 2, cursor_y, org_title)
    cursor_y -= 5 * mm

    if legal_name and legal_name.lower() != org_name.lower():
        c.setFillColor(muted)
        c.setFont(font, 8.5)
        c.drawCentredString(w / 2, cursor_y, legal_name[:95])
        cursor_y -= 4.5 * mm

    # --- Ana Başlık: TEŞEKKÜR VE HAYIR SERTİFİKASI ---
    cursor_y -= 5.5 * mm
    cert_title = "TEŞEKKÜR VE HAYIR SERTİFİKASI"
    c.setFillColor(gold)
    c.setFont(bold, 25)
    c.drawCentredString(w / 2, cursor_y, cert_title)
    cursor_y -= 5.5 * mm

    # Altın ayraç çizgisi ve orta elmas
    line_half = 42 * mm
    c.setStrokeColor(gold)
    c.setLineWidth(1.0)
    c.line(w / 2 - line_half, cursor_y, w / 2 - 4 * mm, cursor_y)
    c.line(w / 2 + 4 * mm, cursor_y, w / 2 + line_half, cursor_y)
    c.setFillColor(primary)
    c.circle(w / 2, cursor_y, 1.5 * mm, fill=1, stroke=0)
    cursor_y -= 9.5 * mm

    # --- "Sayın" + Bağışçı Adı ---
    c.setFillColor(muted)
    c.setFont(italic, 12.5)
    c.drawCentredString(w / 2, cursor_y, "Sayın")
    cursor_y -= 11 * mm

    donor_text = donor_display[:65]
    donor_sz = _fit_font_size(c, donor_text, bold, 24, w - 76 * mm, min_size=14)
    c.setFillColor(ink)
    c.setFont(bold, donor_sz)
    c.drawCentredString(w / 2, cursor_y, donor_text)
    cursor_y -= 7.5 * mm

    # --- Adına / İthaf Rozeti (varsa) ---
    behalf_clean = (behalf or "").strip()
    if behalf_clean:
        behalf_text = f"{behalf_clean[:60]} {dedication_suffix}"
        b_sz = _fit_font_size(c, behalf_text, bold, 12.5, w - 84 * mm, min_size=9.5)
        bw = c.stringWidth(behalf_text, bold, b_sz) + 14 * mm
        bh = 8.5 * mm
        bx = (w - bw) / 2
        by = cursor_y - bh + 2 * mm
        c.setFillColor(receipt_pdf._tint(primary, 0.10))
        c.setStrokeColor(receipt_pdf._tint(primary, 0.35))
        c.setLineWidth(0.7)
        c.roundRect(bx, by, bw, bh, 4, fill=1, stroke=1)
        c.setFillColor(primary)
        c.setFont(bold, b_sz)
        c.drawCentredString(w / 2, by + 2.4 * mm, behalf_text)
        cursor_y -= bh + 5 * mm
    else:
        cursor_y -= 3 * mm

    # --- Teşekkür metni (Paragraph ile taşmadan ortalı) ---
    body_style = ParagraphStyle(
        "cert_body",
        fontName=font,
        fontSize=12.5,
        leading=19,
        textColor=slate,
        alignment=TA_CENTER,
    )
    body_html = (
        f"“<b>{_esc(camp_display[:80])}</b>” kapsamında gerçekleştirdiğiniz "
        f"<b>{_esc(amount_str)}</b> tutarındaki kıymetli bağışınız ihtiyaç sahiplerine emanetle "
        f"ulaştırılmak üzere kayıt altına alınmıştır. Değerli destekleriniz için içtenlikle teşekkür ederiz."
    )
    para = Paragraph(body_html, body_style)
    max_body_w = w - 76 * mm
    _, para_h = para.wrap(max_body_w, 38 * mm)
    para.drawOn(c, (w - max_body_w) / 2, cursor_y - para_h)

    # --- Alt kurumsal bant: Sol (Tarih/Makbuz/İletişim) | Orta (Kurum Onay Mührü) | Sağ (QR Doğrulama) ---
    footer_top = 44 * mm
    c.setStrokeColor(soft_line)
    c.setLineWidth(0.7)
    c.line(26 * mm, footer_top, w - 26 * mm, footer_top)

    # Sol kolon
    left_x = 26 * mm
    c.setFillColor(ink)
    c.setFont(bold, 9.5)
    c.drawString(left_x, footer_top - 7 * mm, f"Düzenlenme Tarihi: {date_str}")
    c.setFillColor(slate)
    c.setFont(font, 9)
    c.drawString(left_x, footer_top - 12.5 * mm, f"Makbuz No: #{receipt_number}")

    contact_parts = [
        p for p in (
            (getattr(organization, "phone", None) or "").strip() or None,
            (getattr(organization, "email", None) or "").strip() or None,
            (f"VKN: {organization.tax_number}" if getattr(organization, "tax_number", None) else None),
        ) if p
    ]
    if contact_parts:
        c.setFillColor(muted)
        c.setFont(font, 7.8)
        c.drawString(left_x, footer_top - 18.5 * mm, " · ".join(contact_parts)[:70])

    # Orta kolon: Kurumsal onay mührü
    seal_y = footer_top - 13 * mm
    c.setStrokeColor(gold)
    c.setLineWidth(0.9)
    c.circle(w / 2, seal_y + 2 * mm, 8.5 * mm, fill=0, stroke=1)
    c.setLineWidth(0.4)
    c.circle(w / 2, seal_y + 2 * mm, 7.0 * mm, fill=0, stroke=1)
    c.setFillColor(primary)
    c.setFont(bold, 6.8)
    c.drawCentredString(w / 2, seal_y + 3.2 * mm, "ELEKTRONİK")
    c.drawCentredString(w / 2, seal_y - 0.5 * mm, "ONAYLI")
    c.setFillColor(muted)
    c.setFont(italic, 7.5)
    c.drawCentredString(w / 2, footer_top - 22.5 * mm, "Yönetim Kurulu Adına")

    # Sağ kolon: Doğrulama QR kodu + kod
    vhash = receipt_pdf.verification_hash(receipt_number, int(amount_cents or 0))
    verify_url = (
        f"{verify_base_url.rstrip('/')}/verify/receipt/{receipt_number}?k={vhash}"
        if verify_base_url
        else f"Makbuz:{receipt_number}|Kod:{vhash}"
    )
    right_x = w - 26 * mm
    qr_size = 18 * mm
    try:
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing

        qr_widget = QrCodeWidget(verify_url)
        b = qr_widget.getBounds()
        bw_qr, bh_qr = b[2] - b[0], b[3] - b[1]
        qx = right_x - qr_size
        qy = footer_top - 21 * mm
        c.setFillColor(colors.white)
        c.setStrokeColor(soft_line)
        c.setLineWidth(0.5)
        c.roundRect(qx - 1.5, qy - 1.5, qr_size + 3, qr_size + 3, 2, fill=1, stroke=1)
        d = Drawing(qr_size, qr_size, transform=[qr_size / bw_qr, 0, 0, qr_size / bh_qr, 0, 0])
        d.add(qr_widget)
        d.drawOn(c, qx, qy)
        text_right = qx - 3.5 * mm
    except Exception:
        text_right = right_x

    c.setFillColor(ink)
    c.setFont(bold, 8.5)
    c.drawRightString(text_right, footer_top - 8.5 * mm, "Dijital Doğrulama")
    c.setFillColor(muted)
    c.setFont(font, 8)
    c.drawRightString(text_right, footer_top - 13.5 * mm, f"Kod: {vhash}")
    c.setFont(font, 7.2)
    c.drawRightString(text_right, footer_top - 18.5 * mm, "QR ile doğrulayabilirsiniz")

    c.showPage()
    c.save()
    return buf.getvalue()
