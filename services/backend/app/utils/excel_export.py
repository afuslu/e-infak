"""Kurumsal Excel (.xlsx) dışa aktarım şablonu üreticisi (`openpyxl`)."""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
import re
from typing import Iterable, Sequence

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


def _clean_hex(hex_color: str | None, default: str = "065F46") -> str:
    raw = (hex_color or "").strip().lstrip("#")
    if len(raw) == 6 and all(c in "0123456789abcdefABCDEF" for c in raw):
        return raw.upper()
    return default


def build_corporate_xlsx(
    *,
    title: str,
    headers: Sequence[str],
    rows: Iterable[Sequence[object]],
    org_name: str = "",
    subtitle: str = "",
    primary_color: str | None = None,
    currency_cols: set[int] | None = None,
) -> bytes:
    """Kurum başlıklı, biçimlendirilmiş ve otomatik sütun genişlikli `.xlsx` bayt dizisi döner."""
    wb = Workbook()
    ws = wb.active
    safe_sheet_title = re.sub(r"[\\/*?:\[\]]", "-", title).strip()[:31]
    ws.title = safe_sheet_title or "Rapor"
    ws.views.sheetView[0].showGridLines = True

    brand = _clean_hex(primary_color, "065F46")
    thin = Side(style="thin", color="E5E7EB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill(start_color=brand, end_color=brand, fill_type="solid")
    zebra_fill = PatternFill(start_color="F9FAFB", end_color="F9FAFB", fill_type="solid")
    title_fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")

    col_count = max(len(headers), 1)
    last_col = get_column_letter(col_count)

    # Üst kurumsal bilgi bandı
    ws.merge_cells(f"A1:{last_col}1")
    c1 = ws["A1"]
    c1.value = f"{org_name} — {title}" if org_name else title
    c1.font = Font(name="Calibri", size=13, bold=True, color=brand)
    c1.fill = title_fill
    c1.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 26

    ws.merge_cells(f"A2:{last_col}2")
    c2 = ws["A2"]
    generated = datetime.now().strftime("%d.%m.%Y %H:%M")
    c2.value = f"{subtitle} · Oluşturulma: {generated}" if subtitle else f"Oluşturulma: {generated}"
    c2.font = Font(name="Calibri", size=9, italic=True, color="6B7280")
    c2.fill = title_fill
    c2.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[2].height = 18

    # Tablo başlık satırı
    header_row = 4
    ws.row_dimensions[header_row].height = 22
    widths = [len(str(h)) + 4 for h in headers]
    for idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=idx, value=h)
        cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center" if idx == 1 else "left", vertical="center")
        cell.border = border

    currency_cols = currency_cols or set()
    r_idx = header_row + 1
    for row in rows:
        ws.row_dimensions[r_idx].height = 19
        is_zebra = (r_idx - header_row) % 2 == 0
        for c_idx, val in enumerate(row, start=1):
            cell = ws.cell(row=r_idx, column=c_idx, value=val)
            cell.font = Font(name="Calibri", size=10, color="111827")
            if is_zebra:
                cell.fill = zebra_fill
            cell.border = border
            if c_idx in currency_cols and isinstance(val, (int, float)):
                cell.number_format = "#,##0.00"
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="center" if c_idx == 1 else "left", vertical="center")
            widths[c_idx - 1] = min(max(widths[c_idx - 1], len(str(val or "")) + 3), 48)
        r_idx += 1

    for idx, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = max(w, 10)

    ws.freeze_panes = f"A{header_row + 1}"

    out = BytesIO()
    wb.save(out)
    return out.getvalue()
