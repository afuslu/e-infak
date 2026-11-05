"""Kurban kağıdı: kesim videosunda kameraya gösterilen, hissedar isimlerini içeren A4 sayfa."""
from io import BytesIO

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


def build_kurban_papers(org_name: str, animals: list[dict]) -> bytes:
    """animals: [{"number", "type_label", "country", "season", "shares": [{"name", "kurban_type"}]}]"""
    font, bold = receipt_pdf.FONT, receipt_pdf.FONT_BOLD
    buffer = BytesIO()
    page = landscape(A4)
    width, height = page
    pdf = canvas.Canvas(buffer, pagesize=page)
    pdf.setTitle("Kurban Kağıtları")
    margin = 15 * mm
    for animal in animals or [{"number": "-", "type_label": "", "country": "", "season": "", "shares": []}]:
        pdf.setFillColor(colors.black)
        pdf.setFont(bold, 18)
        pdf.drawString(margin, height - margin - 6 * mm, org_name[:80])
        meta = " · ".join(str(x) for x in (animal.get("type_label"), animal.get("country"), animal.get("season")) if x)
        pdf.setFont(font, 14)
        pdf.drawRightString(width - margin, height - margin - 6 * mm, meta[:80])

        number = f"No: {animal['number']}"
        size = _fit(pdf, number, bold, 72, width - 2 * margin)
        pdf.setFont(bold, size)
        pdf.drawCentredString(width / 2, height - margin - 34 * mm, number)

        shares = animal.get("shares") or []
        top = height - margin - 52 * mm
        line_height = min(17 * mm, (top - margin) / max(len(shares), 1))
        for index, share in enumerate(shares, start=1):
            text = f"{index}. {share['name']}"
            label = share.get("kurban_type") or ""
            name_size = _fit(pdf, text, bold, 30, width - 2 * margin - 45 * mm)
            y = top - (index - 1) * line_height
            pdf.setFont(bold, name_size)
            pdf.drawString(margin, y, text)
            pdf.setFont(font, 16)
            pdf.drawRightString(width - margin, y, label)
            pdf.setStrokeColor(colors.HexColor("#d4d4d4"))
            pdf.line(margin, y - 4 * mm, width - margin, y - 4 * mm)
        if not shares:
            pdf.setFont(font, 20)
            pdf.drawCentredString(width / 2, top, "Bu hayvana henüz hisse atanmadı")
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()
