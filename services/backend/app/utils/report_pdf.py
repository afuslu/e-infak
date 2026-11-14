"""Kurumsal PDF tablo & rapor üreticisi (`reportlab`).

Dernek logosu, marka rengi, tarih/alt başlık, özet kutuları ve sayfa numaralarıyla
tüm admin listeleri ve raporları için tek tip kurumsal PDF üretir.
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any, Sequence

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.utils import receipt_pdf  # Unicode fontlar ve resolve_local_logo


def build_report_pdf(
    *,
    title: str,
    headers: Sequence[str],
    rows: Sequence[Sequence[object]],
    org_name: str = "",
    subtitle: str = "",
    organization: Any = None,
    summary: Sequence[Sequence[str]] | None = None,
) -> bytes:
    """Kurum logolu ve marka renkli A4 (dikey veya yatay) PDF raporu döner."""
    font, bold = receipt_pdf.FONT, receipt_pdf.FONT_BOLD
    primary = receipt_pdf._safe_hex(getattr(organization, "theme_primary_color", None), "#065f46")
    logo = receipt_pdf.resolve_local_logo(organization) if organization is not None else None
    ink = colors.HexColor("#111827")
    muted = colors.HexColor("#6b7280")
    zebra = colors.HexColor("#f9fafb")
    border_col = colors.HexColor("#e5e7eb")
    soft_bg = colors.HexColor("#f3f4f6")

    pagesize = landscape(A4) if len(headers) > 6 else A4
    page_w, page_h = pagesize
    margin = 14 * mm
    usable_w = page_w - 2 * margin
    generated = datetime.now().strftime("%d.%m.%Y %H:%M")

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=pagesize,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=28 * mm,
        bottomMargin=15 * mm,
        title=title,
    )

    def _draw_chrome(canvas_obj, _doc):
        canvas_obj.saveState()
        # Üst kurumsal renk şeridi
        canvas_obj.setFillColor(primary)
        canvas_obj.rect(0, page_h - 5 * mm, page_w, 5 * mm, fill=1, stroke=0)

        x = margin
        if logo is not None:
            logo_size = 13 * mm
            canvas_obj.drawImage(
                logo, margin, page_h - 21 * mm,
                width=logo_size, height=logo_size, preserveAspectRatio=True, mask="auto",
            )
            x = margin + logo_size + 3.5 * mm

        canvas_obj.setFillColor(ink)
        canvas_obj.setFont(bold, 12)
        canvas_obj.drawString(x, page_h - 13 * mm, (org_name or "E-İnfak")[:75])

        canvas_obj.setFillColor(primary)
        canvas_obj.setFont(bold, 10)
        canvas_obj.drawString(x, page_h - 18.5 * mm, title[:90])

        canvas_obj.setFillColor(muted)
        canvas_obj.setFont(font, 8.5)
        canvas_obj.drawRightString(page_w - margin, page_h - 13 * mm, f"Oluşturulma: {generated}")
        if subtitle:
            canvas_obj.drawRightString(page_w - margin, page_h - 18.5 * mm, subtitle[:80])

        canvas_obj.setStrokeColor(border_col)
        canvas_obj.setLineWidth(0.6)
        canvas_obj.line(margin, page_h - 24 * mm, page_w - margin, page_h - 24 * mm)

        # Alt bilgi + sayfa numarası
        canvas_obj.line(margin, 11 * mm, page_w - margin, 11 * mm)
        canvas_obj.setFillColor(muted)
        canvas_obj.setFont(font, 8)
        canvas_obj.drawString(margin, 7 * mm, f"{org_name or 'E-İnfak'} · Kurumsal Rapor Çıktısı")
        canvas_obj.drawRightString(page_w - margin, 7 * mm, f"Sayfa {canvas_obj.getPageNumber()}")
        canvas_obj.restoreState()

    story: list[Any] = []

    if summary:
        sum_cards = []
        lbl_style = ParagraphStyle("sum_lbl", fontName=font, fontSize=7.5, textColor=muted, leading=10)
        val_style = ParagraphStyle("sum_val", fontName=bold, fontSize=10, textColor=ink, leading=13)
        row_cells = []
        for item in summary[:5]:
            lbl = str(item[0]) if len(item) > 0 else ""
            val = str(item[1]) if len(item) > 1 else ""
            row_cells.append([Paragraph(lbl, lbl_style), Paragraph(val, val_style)])
        if row_cells:
            col_w = usable_w / len(row_cells)
            sum_table = Table([row_cells], colWidths=[col_w] * len(row_cells))
            sum_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), soft_bg),
                ("BOX", (0, 0), (-1, -1), 0.5, border_col),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, border_col),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ]))
            story.append(sum_table)
            story.append(Spacer(1, 5 * mm))

    th_style = ParagraphStyle("th", fontName=bold, fontSize=8.5, textColor=colors.white, leading=11)
    td_style = ParagraphStyle("td", fontName=font, fontSize=8, textColor=ink, leading=10.5)

    def _esc(val: object) -> str:
        s = "" if val is None else str(val)
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    table_data: list[list[Any]] = [[Paragraph(_esc(h), th_style) for h in headers]]
    for r in rows:
        cells = [Paragraph(_esc(r[i] if i < len(r) else ""), td_style) for i in range(len(headers))]
        table_data.append(cells)

    if len(table_data) == 1:
        table_data.append([Paragraph("Kayıt bulunamadı.", td_style)] + [Paragraph("", td_style)] * (len(headers) - 1))

    col_count = max(len(headers), 1)
    col_widths = [usable_w / col_count] * col_count
    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), primary),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, zebra]),
        ("BOX", (0, 0), (-1, -1), 0.5, border_col),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, border_col),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)

    doc.build(story, onFirstPage=_draw_chrome, onLaterPages=_draw_chrome)
    return buf.getvalue()
