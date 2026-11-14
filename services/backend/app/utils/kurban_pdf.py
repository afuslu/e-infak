"""Kurban kağıdı: kesim videosunda kameraya gösterilen, hissedar isimlerini içeren A4 sayfa."""
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.utils import receipt_pdf  # registers Unicode fonts on import


def _fit(pdf: canvas.Canvas, text: str, font: str, max_size: int, max_width: float) -> int:
    size = max_size
    while size > 10 and pdf.stringWidth(text, font, size) > max_width:
        size -= 1
    return size


def build_kurban_papers(org_name: str, animals: list[dict], organization: Any = None) -> bytes:
    """animals: [{"number", "type_label", "country", "season", "shares": [{"name", "kurban_type"}]}]"""
    font, bold = receipt_pdf.FONT, receipt_pdf.FONT_BOLD
    primary = receipt_pdf._safe_hex(getattr(organization, "theme_primary_color", None), "#065f46")
    logo = receipt_pdf.resolve_local_logo(organization) if organization is not None else None
    line_color = colors.HexColor("#d1d5db")
    zebra = colors.HexColor("#f9fafb")
    muted = colors.HexColor("#4b5563")

    buffer = BytesIO()
    page = landscape(A4)
    width, height = page
    pdf = canvas.Canvas(buffer, pagesize=page)
    pdf.setTitle("Kurban Kağıtları")
    margin = 15 * mm

    for animal in animals or [{"number": "-", "type_label": "", "country": "", "season": "", "shares": []}]:
        # Üst kurumsal şerit
        pdf.setFillColor(primary)
        pdf.rect(0, height - 7 * mm, width, 7 * mm, fill=1, stroke=0)

        header_x = margin
        if logo is not None:
            logo_size = 12 * mm
            pdf.drawImage(logo, margin, height - margin - logo_size + 2 * mm, width=logo_size, height=logo_size, preserveAspectRatio=True, mask="auto")
            header_x = margin + logo_size + 3 * mm

        pdf.setFillColor(colors.black)
        pdf.setFont(bold, 18)
        pdf.drawString(header_x, height - margin - 6 * mm, org_name[:70])

        meta = " · ".join(str(x) for x in (animal.get("type_label"), animal.get("country"), animal.get("season")) if x)
        pdf.setFillColor(muted)
        pdf.setFont(font, 13)
        pdf.drawRightString(width - margin, height - margin - 6 * mm, meta[:80])

        # Kesim numarası (kamerada uzaktan okunabilir büyük başlık)
        number = f"No: {animal['number']}"
        size = _fit(pdf, number, bold, 70, width - 2 * margin)
        pdf.setFillColor(primary)
        pdf.setFont(bold, size)
        pdf.drawCentredString(width / 2, height - margin - 34 * mm, number)

        shares = animal.get("shares") or []
        top = height - margin - 50 * mm
        line_height = min(17 * mm, (top - margin) / max(len(shares), 1))

        if shares:
            table_h = len(shares) * line_height
            pdf.setStrokeColor(line_color)
            pdf.setLineWidth(0.8)
            pdf.roundRect(margin, top - table_h + 3 * mm, width - 2 * margin, table_h, 4, fill=0, stroke=1)

        for index, share in enumerate(shares, start=1):
            text = f"{index}. {share['name']}"
            label = share.get("kurban_type") or ""
            name_size = _fit(pdf, text, bold, 28, width - 2 * margin - 50 * mm)
            row_bottom = top - index * line_height + 3 * mm
            if index % 2 == 0:
                pdf.setFillColor(zebra)
                pdf.rect(margin + 0.5, row_bottom + 0.5, width - 2 * margin - 1, line_height - 0.5, fill=1, stroke=0)
            y = row_bottom + line_height * 0.3
            pdf.setFillColor(colors.black)
            pdf.setFont(bold, name_size)
            pdf.drawString(margin + 5 * mm, y, text)
            pdf.setFillColor(muted)
            pdf.setFont(font, 15)
            pdf.drawRightString(width - margin - 5 * mm, y, label)
            if index < len(shares):
                pdf.setStrokeColor(line_color)
                pdf.setLineWidth(0.5)
                pdf.line(margin, row_bottom, width - margin, row_bottom)

        if not shares:
            pdf.setFillColor(muted)
            pdf.setFont(font, 20)
            pdf.drawCentredString(width / 2, top - 10 * mm, "Bu hayvana henüz hisse atanmadı")
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()
