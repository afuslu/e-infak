"""Kurumsal Excel (.xlsx) dışa aktarım şablonu üreticisi (`openpyxl`)."""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path
import re
from typing import Any, Iterable, Sequence

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


def _clean_hex(hex_color: str | None, default: str = "065F46") -> str:
    raw = (hex_color or "").strip().lstrip("#")
    if len(raw) == 6 and all(c in "0123456789abcdefABCDEF" for c in raw):
        return raw.upper()
    return default


def _resolve_logo_png_bytes(organization: Any) -> BytesIO | None:
    """Kurum logosunu yerel medya klasöründen okuyup 40x40 PNG bayt akışına dönüştürür."""
    if organization is None:
        return None
    logo_url = (getattr(organization, "logo_url", None) or "").strip()
    if not logo_url:
        return None
    path_part = logo_url.split("?")[0]
    try:
        from app.core.config import settings
        media_root = Path(settings.MEDIA_ROOT)
    except Exception:
        media_root = Path("media")

    candidate: Path | None = None
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
        with Image.open(candidate) as im:
            im = im.convert("RGBA")
            im.thumbnail((42, 42))
            buf = BytesIO()
            im.save(buf, format="PNG")
            buf.seek(0)
            return buf
    except Exception:
        return None


def build_corporate_xlsx(
    *,
    title: str,
    headers: Sequence[str],
    rows: Iterable[Sequence[object]],
    org_name: str = "",
    subtitle: str = "",
    primary_color: str | None = None,
    currency_cols: set[int] | None = None,
    organization: Any = None,
) -> bytes:
    """Kurum logolu, marka renkli, biçimlendirilmiş ve otomatik sütun genişlikli `.xlsx` döner."""
    wb = Workbook()
    ws = wb.active
    safe_sheet_title = re.sub(r"[\\/*?:\[\]]", "-", title).strip()[:31]
    ws.title = safe_sheet_title or "Rapor"
    ws.views.sheetView[0].showGridLines = True

    brand = _clean_hex(primary_color or getattr(organization, "theme_primary_color", None), "065F46")
    thin = Side(style="thin", color="E5E7EB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill(start_color=brand, end_color=brand, fill_type="solid")
    zebra_fill = PatternFill(start_color="F9FAFB", end_color="F9FAFB", fill_type="solid")
    title_fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")

    col_count = max(len(headers), 1)
    last_col = get_column_letter(col_count)
    logo_buf = _resolve_logo_png_bytes(organization)
    text_indent = 7 if logo_buf else 1

    # Üst kurumsal bilgi bandı
    ws.merge_cells(f"A1:{last_col}1")
    c1 = ws["A1"]
    c1.value = f"{org_name} — {title}" if org_name else title
    c1.font = Font(name="Calibri", size=13, bold=True, color=brand)
    c1.fill = title_fill
    c1.alignment = Alignment(horizontal="left", vertical="center", indent=text_indent)
    ws.row_dimensions[1].height = 30

    ws.merge_cells(f"A2:{last_col}2")
    c2 = ws["A2"]
    generated = datetime.now().strftime("%d.%m.%Y %H:%M")
    c2.value = f"{subtitle} · Oluşturulma: {generated}" if subtitle else f"Oluşturulma: {generated}"
    c2.font = Font(name="Calibri", size=9, italic=True, color="6B7280")
    c2.fill = title_fill
    c2.alignment = Alignment(horizontal="left", vertical="center", indent=text_indent)
    ws.row_dimensions[2].height = 20

    if logo_buf is not None:
        try:
            xl_img = XLImage(logo_buf)
            xl_img.width = 36
            xl_img.height = 36
            ws.add_image(xl_img, "A1")
        except Exception:
            pass

    # Tablo başlık satırı
    header_row = 4
    ws.row_dimensions[header_row].height = 24
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
        ws.row_dimensions[r_idx].height = 20
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
