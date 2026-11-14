import csv
import hashlib
import io
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Permission, require_capability, require_feature, require_permission
from app.core.plans import Feature
from app.api.v1.checkout import _finalize_paid_order, _load_order
from app.core.db import get_db
from app.models.automation import BankAccount, BankStatementImport, BankTransaction, ReconciliationStatus
from app.models.expense import Expense
from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderStatus
from app.models.user import User

router = APIRouter(
    tags=["reconciliation"],
    dependencies=[Depends(require_feature(Feature.BANK_TRANSACTIONS))],
)


def _decode_bytes(content: bytes) -> str:
    for enc in ("utf-8-sig", "cp1254", "iso-8859-9", "latin-1"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("Dosya karakter kodlaması okunamadı")


def _amount_to_cents(value) -> int:
    if isinstance(value, (int, float, Decimal)):
        return int((Decimal(str(value)) * 100).quantize(Decimal("1")))
    text = str(value or "").strip().replace("₺", "").replace("TL", "").replace("TRY", "").replace(" ", "")
    if not text or text in ("-", "—"):
        return 0
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return int((Decimal(text) * 100).quantize(Decimal("1")))
    except InvalidOperation as exc:
        raise ValueError(f"Geçersiz tutar: {value}") from exc


def _parse_date(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Boş tarih değeri")
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d.%m.%Y %H:%M:%S",
        "%d.%m.%Y %H:%M",
        "%d.%m.%Y",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%Y%m%d",
    ):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    raise ValueError(f"Geçersiz tarih: {value}")


def _normalize_key(value) -> str:
    folded = unicodedata.normalize("NFKD", str(value).strip().casefold())
    return "".join(char for char in folded if not unicodedata.combining(char)).replace("ı", "i")


def _normalize_row(row: dict, index: int, column_map: Optional[dict] = None) -> Optional[dict]:
    normalized = {_normalize_key(k): v for k, v in row.items() if k is not None and str(k).strip()}
    if not any(v not in (None, "") for v in normalized.values()):
        return None

    def pick(*keys):
        return next((normalized[k] for k in keys if normalized.get(k) not in (None, "")), None)

    def mapped(field: str, *fallbacks):
        if column_map and column_map.get(field):
            val = normalized.get(_normalize_key(column_map[field]))
            if val not in (None, ""):
                return val
        return pick(*fallbacks)

    raw_date = mapped("date", "tarih", "islem tarihi", "işlem tarihi", "valor tarihi", "valör tarihi", "date", "booked_at")
    if raw_date in (None, ""):
        return None

    raw_amount = mapped("amount", "tutar", "amount", "islem tutari", "işlem tutarı")
    raw_credit = mapped("credit", "alacak", "credit", "giren")
    raw_debit = mapped("debit", "borc", "borç", "debit", "cikan", "çıkan")

    if raw_amount not in (None, ""):
        amount_cents = _amount_to_cents(raw_amount)
    elif raw_credit not in (None, "") or raw_debit not in (None, ""):
        credit_cents = _amount_to_cents(raw_credit) if raw_credit not in (None, "") else 0
        debit_cents = _amount_to_cents(raw_debit) if raw_debit not in (None, "") else 0
        amount_cents = credit_cents - abs(debit_cents) if debit_cents and not credit_cents else credit_cents
    else:
        raise ValueError(f"Satır {index}: Tutar / Alacak / Borç sütunu bulunamadı")

    external_id = mapped("external_id", "islem no", "işlem no", "transaction_id", "referans", "reference", "dekont no", "fis no", "fiş no")
    if not external_id:
        row_fingerprint = "|".join(f"{key}={row[key]}" for key in sorted(row, key=str))
        external_id = f"ROW-{hashlib.sha256(row_fingerprint.encode()).hexdigest()[:24]}"

    return {
        "external_id": str(external_id).strip(),
        "booked_at": _parse_date(raw_date),
        "amount_cents": amount_cents,
        "currency": str(mapped("currency", "para birimi", "currency", "doviz", "döviz") or "TRY").upper()[:3],
        "sender_name": str(mapped("sender", "gonderen", "gönderen", "sender", "hesap sahibi", "karsi taraf", "karşı taraf") or "").strip() or None,
        "description": str(mapped("description", "aciklama", "açıklama", "description", "detay") or "").strip(),
        "raw_data": {str(k): str(v) for k, v in row.items() if k is not None and v is not None},
    }


_HEADER_DATE_HINTS = {"tarih", "date", "islem tarihi", "valor tarihi", "booked_at"}
_HEADER_VAL_HINTS = {"tutar", "amount", "alacak", "borc", "aciklama", "description", "islem tutari", "credit", "debit"}


def _find_header_index(rows: list[list]) -> int:
    for idx, row in enumerate(rows[:25]):
        keys = {_normalize_key(cell) for cell in row if cell not in (None, "")}
        if (keys & _HEADER_DATE_HINTS) and (keys & _HEADER_VAL_HINTS):
            return idx
    for idx, row in enumerate(rows[:25]):
        if sum(1 for c in row if str(c or "").strip()) >= 3:
            return idx
    return 0


def _parse_mt940(text: str) -> list[dict]:
    """Parse SWIFT MT940 (.sta/.mt940) statements."""
    currency = "TRY"
    m_cur = re.search(r":60[FM]:[CD]\d{6}([A-Z]{3})", text)
    if m_cur:
        currency = m_cur.group(1)
    lines = text.splitlines()
    entries: list[tuple[str, list[str]]] = []
    current_61: Optional[str] = None
    current_86: list[str] = []
    in_86 = False
    for line in lines:
        if line.startswith(":61:"):
            if current_61:
                entries.append((current_61, current_86))
            current_61 = line[4:].strip()
            current_86 = []
            in_86 = False
        elif line.startswith(":86:"):
            current_86.append(line[4:].strip())
            in_86 = True
        elif line.startswith(":"):
            in_86 = False
        elif in_86 and line.strip():
            current_86.append(line.strip())
    if current_61:
        entries.append((current_61, current_86))

    rows: list[dict] = []
    pat61 = re.compile(r"^(\d{6})(?:\d{4})?(RC|RD|C|D)[A-Z]?([0-9,]+)([A-Z]{4})(.*)$")
    for idx, (tag61, tag86) in enumerate(entries, 1):
        m = pat61.match(tag61)
        if not m:
            continue
        yymmdd, cd, amt_str, _, ref = m.groups()
        booked_at = datetime.strptime("20" + yymmdd, "%Y%m%d").replace(tzinfo=timezone.utc)
        cents = _amount_to_cents(amt_str)
        if cd in ("D", "RD"):
            cents = -abs(cents)
        desc = " ".join(tag86).strip()
        ext = ref.strip()[:64] or f"MT940-{yymmdd}-{idx}-{hashlib.sha256((tag61 + desc).encode()).hexdigest()[:12]}"
        rows.append({
            "external_id": ext,
            "booked_at": booked_at,
            "amount_cents": cents,
            "currency": currency,
            "sender_name": None,
            "description": desc,
            "raw_data": {"mt940_61": tag61, "mt940_86": desc},
        })
    if not rows:
        raise ValueError("MT940 dosyasında geçerli :61: hareketi bulunamadı")
    return rows


def _parse_camt053(content: bytes) -> list[dict]:
    """Parse ISO 20022 CAMT.053 XML bank statements."""
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"Geçersiz CAMT.053 XML: {exc}") from exc

    def local(tag: str) -> str:
        return tag.split("}", 1)[-1]

    def find_text(el: ET.Element, *path: str) -> Optional[str]:
        cur = el
        for step in path:
            nxt = next((c for c in cur if local(c.tag) == step), None)
            if nxt is None:
                return None
            cur = nxt
        return (cur.text or "").strip() or None

    rows: list[dict] = []
    for idx, ntry in enumerate(root.iter(), 1):
        if local(ntry.tag) != "Ntry":
            continue
        amt_el = next((c for c in ntry if local(c.tag) == "Amt"), None)
        if amt_el is None or not (amt_el.text or "").strip():
            continue
        cents = _amount_to_cents(amt_el.text)
        currency = (amt_el.attrib.get("Ccy") or "TRY").upper()[:3]
        ind = find_text(ntry, "CdtDbtInd") or "CRDT"
        if ind == "DBIT":
            cents = -abs(cents)
        dt_str = find_text(ntry, "BookgDt", "Dt") or find_text(ntry, "BookgDt", "DtTm") or find_text(ntry, "ValDt", "Dt")
        booked_at = _parse_date(dt_str)
        ext = find_text(ntry, "AcctSvcrRef") or find_text(ntry, "NtryRef")
        desc = find_text(ntry, "NtryDtls", "TxDtls", "RmtInf", "Ustrd") or find_text(ntry, "AddtlNtryInf") or ""
        sender = find_text(ntry, "NtryDtls", "TxDtls", "RltdPties", "Dbtr", "Nm")
        if not ext:
            ext = f"CAMT-{dt_str}-{idx}-{hashlib.sha256(f'{cents}:{sender}:{desc}'.encode()).hexdigest()[:12]}"
        rows.append({
            "external_id": ext[:120],
            "booked_at": booked_at,
            "amount_cents": cents,
            "currency": currency,
            "sender_name": sender,
            "description": desc,
            "raw_data": {"camt_ref": ext, "ind": ind},
        })
    if not rows:
        raise ValueError("CAMT.053 XML dosyasında <Ntry> hareketi bulunamadı")
    return rows


def _read_rows(content: bytes, filename: str, column_map: Optional[dict] = None) -> list[dict]:
    lower = filename.lower()
    if lower.endswith((".sta", ".mt940", ".mt")):
        return _parse_mt940(_decode_bytes(content))
    if lower.endswith(".xml"):
        return _parse_camt053(content)
    if lower.endswith(".xlsx"):
        from openpyxl import load_workbook
        sheet = load_workbook(io.BytesIO(content), read_only=True, data_only=True).active
        all_rows = [list(r) for r in sheet.iter_rows(values_only=True)]
        if not all_rows:
            return []
        h_idx = _find_header_index(all_rows)
        headers = [str(value or "").strip() for value in all_rows[h_idx]]
        out = []
        for index, row in enumerate(all_rows[h_idx + 1 :], h_idx + 2):
            norm = _normalize_row(dict(zip(headers, row)), index, column_map)
            if norm:
                out.append(norm)
        return out
    if lower.endswith(".xls"):
        try:
            import xlrd  # type: ignore
        except ImportError as exc:
            raise ValueError("Eski .xls formatı için sunucuda xlrd kurulu değil; lütfen .xlsx veya .csv yükleyin") from exc
        book = xlrd.open_workbook(file_contents=content)
        sheet = book.sheet_by_index(0)
        all_rows = [sheet.row_values(r) for r in range(sheet.nrows)]
        if not all_rows:
            return []
        h_idx = _find_header_index(all_rows)
        headers = [str(value or "").strip() for value in all_rows[h_idx]]
        out = []
        for index, row in enumerate(all_rows[h_idx + 1 :], h_idx + 2):
            norm = _normalize_row(dict(zip(headers, row)), index, column_map)
            if norm:
                out.append(norm)
        return out

    text = _decode_bytes(content)
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=";,\t")
    except csv.Error:
        dialect = csv.excel
        if text.count(";") > text.count(","):
            dialect.delimiter = ";"
    raw_rows = list(csv.reader(io.StringIO(text), dialect=dialect))
    if not raw_rows:
        return []
    h_idx = _find_header_index(raw_rows)
    headers = [str(value or "").strip() for value in raw_rows[h_idx]]
    out = []
    for index, row in enumerate(raw_rows[h_idx + 1 :], h_idx + 2):
        norm = _normalize_row(dict(zip(headers, row)), index, column_map)
        if norm:
            out.append(norm)
    return out


async def _auto_match(db: AsyncSession, transaction: BankTransaction, user_id: UUID):
    result = await db.execute(
        select(PaymentOrder).where(
            PaymentOrder.organization_id == transaction.organization_id,
            PaymentOrder.payment_method == "bank_transfer",
            PaymentOrder.status == PaymentOrderStatus.AWAITING_TRANSFER,
            PaymentOrder.total_cents == transaction.amount_cents,
            PaymentOrder.currency == transaction.currency,
        )
    )
    description = (transaction.description or "").upper()
    candidates = [o for o in result.scalars().all() if o.transfer_reference and o.transfer_reference.upper() in description]
    if len(candidates) > 1:
        transaction.status = ReconciliationStatus.AMBIGUOUS
        return
    if not candidates:
        return
    order = await _load_order(db, candidates[0].id)
    attempt = PaymentAttempt(
        order_id=order.id, provider="bank_transfer", pg_tran_id=transaction.external_id,
        response_code="00", response_message="Banka ekstresiyle otomatik eşleşti",
        safe_response={"bank_transaction_id": str(transaction.id)},
    )
    db.add(attempt)
    transaction.status = ReconciliationStatus.MATCHED
    transaction.payment_order_id = order.id
    transaction.matched_by_id = user_id
    transaction.matched_at = datetime.now(timezone.utc)
    await db.flush()
    await _finalize_paid_order(db, order, attempt, commit=False, issued_by_id=user_id)


@router.post("/admin/bank-statements/import", dependencies=[Depends(require_capability("bank.upload"))])
async def import_bank_statement(
    request: Request,
    file: UploadFile = File(...),
    preview: bool = Query(False),
    bank_account_id: UUID | None = Query(None),
    column_map: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    from app.banking.sync import process_transactions

    allowed_exts = (".csv", ".xlsx", ".xls", ".sta", ".mt940", ".mt", ".xml")
    if not file.filename or not file.filename.lower().endswith(allowed_exts):
        raise HTTPException(
            status_code=400,
            detail="Yalnız CSV, XLSX, XLS, MT940 (.sta/.mt940) veya CAMT.053 (.xml) kabul edilir",
        )
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya en fazla 10 MB olabilir")
    parsed_map: Optional[dict] = None
    if column_map:
        try:
            parsed_map = json.loads(column_map)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=422, detail="Geçersiz sütun eşleştirme JSON") from exc
    try:
        rows = _read_rows(content, file.filename, parsed_map)
    except (ValueError, StopIteration, UnicodeDecodeError, csv.Error) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if preview:
        return {"preview": True, "row_count": len(rows), "rows": rows[:25]}
    org_id = UUID(request.state.organization_id)
    account = None
    if bank_account_id:
        account = await db.get(BankAccount, bank_account_id)
        if not account or account.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Banka hesabı bulunamadı")
    file_hash = hashlib.sha256(content).hexdigest()
    duplicate = await db.execute(select(BankStatementImport).where(
        BankStatementImport.organization_id == org_id, BankStatementImport.file_hash == file_hash
    ))
    if duplicate.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Bu ekstre daha önce içe aktarıldı")
    statement = BankStatementImport(
        organization_id=org_id, file_hash=file_hash, filename=file.filename,
        row_count=len(rows), imported_by_id=current_user.id,
    )
    db.add(statement)
    await db.flush()

    ext_ids = [r["external_id"] for r in rows]
    known_ids: set[str] = set()
    if ext_ids:
        existing_rows = await db.execute(
            select(BankTransaction.external_id).where(
                BankTransaction.organization_id == org_id,
                BankTransaction.external_id.in_(ext_ids),
            )
        )
        known_ids = set(existing_rows.scalars().all())

    imported_count = 0
    skipped_count = 0
    new_transactions = []
    for row in rows:
        if row["external_id"] in known_ids:
            skipped_count += 1
            continue
        known_ids.add(row["external_id"])
        transaction = BankTransaction(organization_id=org_id, import_id=statement.id, bank_account_id=bank_account_id, **row)
        if account:
            transaction.raw_data = {**transaction.raw_data, "_bank": account.bank_key}
        db.add(transaction)
        new_transactions.append(transaction)
        imported_count += 1
    await db.flush()
    stats = await process_transactions(db, new_transactions, account=account, user_id=current_user.id)
    await db.commit()
    return {
        "import_id": statement.id,
        "row_count": len(rows),
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "status": "imported",
        **stats,
    }


@router.get("/admin/bank-statements/imports")
async def list_bank_imports(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    org_id = UUID(request.state.organization_id)
    imports = (
        await db.execute(
            select(BankStatementImport)
            .where(BankStatementImport.organization_id == org_id)
            .order_by(BankStatementImport.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    if not imports:
        return []
    import_ids = [imp.id for imp in imports]
    counts_rows = (
        await db.execute(
            select(BankTransaction.import_id, BankTransaction.status, func.count(BankTransaction.id))
            .where(BankTransaction.organization_id == org_id, BankTransaction.import_id.in_(import_ids))
            .group_by(BankTransaction.import_id, BankTransaction.status)
        )
    ).all()
    by_import: dict[UUID, dict[str, int]] = {}
    for imp_id, st, cnt in counts_rows:
        st_val = st.value if hasattr(st, "value") else str(st)
        by_import.setdefault(imp_id, {})[st_val] = cnt
    return [
        {
            "id": str(imp.id),
            "filename": imp.filename,
            "row_count": imp.row_count,
            "created_at": imp.created_at,
            "counts": by_import.get(imp.id, {}),
        }
        for imp in imports
    ]


@router.delete("/admin/bank-statements/imports/{import_id}")
async def delete_bank_import(
    import_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    org_id = UUID(request.state.organization_id)
    imp = await db.get(BankStatementImport, import_id)
    if not imp or imp.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Ekstre kaydı bulunamadı")
    matched_cnt = (
        await db.execute(
            select(func.count(BankTransaction.id)).where(
                BankTransaction.organization_id == org_id,
                BankTransaction.import_id == import_id,
                BankTransaction.status == ReconciliationStatus.MATCHED,
            )
        )
    ).scalar_one()
    if matched_cnt > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Bu ekstrede {matched_cnt} adet eşleşmiş hareket var; önce eşleşmeleri kaldırın",
        )
    await db.execute(
        delete(BankTransaction).where(
            BankTransaction.organization_id == org_id,
            BankTransaction.import_id == import_id,
        )
    )
    await db.delete(imp)
    await db.commit()
    return {"deleted": True}


@router.get("/admin/reconciliation/summary")
async def reconciliation_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    org_id = UUID(request.state.organization_id)
    rows = (
        await db.execute(
            select(
                BankTransaction.status,
                func.count(BankTransaction.id),
                func.coalesce(func.sum(BankTransaction.amount_cents), 0),
            )
            .where(BankTransaction.organization_id == org_id)
            .group_by(BankTransaction.status)
        )
    ).all()
    by_status = {}
    total_count = 0
    for st, cnt, total in rows:
        key = st.value if hasattr(st, "value") else str(st)
        by_status[key] = {"count": int(cnt), "amount_cents": int(total)}
        total_count += int(cnt)
    incoming_cents = (
        await db.execute(
            select(func.coalesce(func.sum(BankTransaction.amount_cents), 0)).where(
                BankTransaction.organization_id == org_id,
                BankTransaction.amount_cents > 0,
            )
        )
    ).scalar_one()
    outgoing_cents = (
        await db.execute(
            select(func.coalesce(func.sum(BankTransaction.amount_cents), 0)).where(
                BankTransaction.organization_id == org_id,
                BankTransaction.amount_cents < 0,
            )
        )
    ).scalar_one()
    return {
        "total_count": total_count,
        "incoming_cents": int(incoming_cents),
        "outgoing_cents": int(outgoing_cents),
        "by_status": by_status,
    }


@router.get("/admin/reconciliation")
async def list_reconciliation(
    request: Request,
    status: ReconciliationStatus | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    query = select(BankTransaction).where(BankTransaction.organization_id == UUID(request.state.organization_id))
    if status:
        query = query.where(BankTransaction.status == status)
    result = await db.execute(query.order_by(BankTransaction.booked_at.desc()).limit(500))
    return result.scalars().all()


@router.get("/admin/reconciliation/{transaction_id}/candidates")
async def reconciliation_candidates(
    request: Request,
    transaction_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    org_id = UUID(request.state.organization_id)
    tx = (
        await db.execute(
            select(BankTransaction).where(
                BankTransaction.id == transaction_id,
                BankTransaction.organization_id == org_id,
            )
        )
    ).scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Hareket bulunamadı")
    orders = (
        await db.execute(
            select(PaymentOrder)
            .where(
                PaymentOrder.organization_id == org_id,
                PaymentOrder.payment_method == "bank_transfer",
                PaymentOrder.status == PaymentOrderStatus.AWAITING_TRANSFER,
                PaymentOrder.total_cents == tx.amount_cents,
                PaymentOrder.currency == tx.currency,
            )
            .order_by(PaymentOrder.created_at.desc())
            .limit(25)
        )
    ).scalars().all()
    return [
        {
            "id": str(o.id),
            "transfer_reference": o.transfer_reference,
            "total_cents": o.total_cents,
            "currency": o.currency,
            "donor_email": o.donor_email,
            "donor_phone": o.donor_phone,
            "created_at": o.created_at,
        }
        for o in orders
    ]


@router.post("/admin/reconciliation/{transaction_id}/resolve")
async def resolve_reconciliation(
    request: Request,
    transaction_id: UUID,
    payment_order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    org_id = UUID(request.state.organization_id)
    result = await db.execute(select(BankTransaction).where(
        BankTransaction.id == transaction_id, BankTransaction.organization_id == org_id
    ))
    transaction = result.scalar_one_or_none()
    order = await _load_order(db, payment_order_id)
    if not transaction or not order or order.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Hareket veya ödeme bulunamadı")
    if order.payment_method != "bank_transfer" or order.status != PaymentOrderStatus.AWAITING_TRANSFER:
        raise HTTPException(status_code=409, detail="Ödeme eşleştirmeye uygun değil")
    if transaction.amount_cents != order.total_cents or transaction.currency != order.currency:
        raise HTTPException(status_code=409, detail="Tutar veya para birimi eşleşmiyor")
    attempt = PaymentAttempt(
        order_id=order.id, provider="bank_transfer", pg_tran_id=transaction.external_id,
        response_code="00", response_message="Muhasebe tarafından eşleştirildi",
        safe_response={"bank_transaction_id": str(transaction.id)},
    )
    db.add(attempt)
    transaction.status = ReconciliationStatus.MATCHED
    transaction.payment_order_id = order.id
    transaction.matched_by_id = current_user.id
    transaction.matched_at = datetime.now(timezone.utc)
    await db.flush()
    donation_ids = await _finalize_paid_order(db, order, attempt, issued_by_id=current_user.id)
    return {"status": "matched", "donation_count": len(donation_ids)}


@router.post("/admin/reconciliation/{transaction_id}/reopen")
async def reopen_reconciliation(
    request: Request,
    transaction_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    from app.banking.matching import Matcher, analyse

    org_id = UUID(request.state.organization_id)
    tx = (
        await db.execute(
            select(BankTransaction).where(
                BankTransaction.id == transaction_id,
                BankTransaction.organization_id == org_id,
            )
        )
    ).scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Hareket bulunamadı")
    if tx.status == ReconciliationStatus.MATCHED:
        raise HTTPException(status_code=409, detail="Eşleşmiş hareket bu yolla açılamaz")
    tx.status = ReconciliationStatus.UNMATCHED
    tx.suggestion = {}
    account = await db.get(BankAccount, tx.bank_account_id) if tx.bank_account_id else None
    await analyse(db, tx, Matcher(db, org_id), account)
    await db.commit()
    return {"status": tx.status.value}


class ToExpenseIn(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    category: str = Field(default="Diger", min_length=2, max_length=100)
    receipt_no: Optional[str] = Field(default=None, max_length=100)


@router.post("/admin/reconciliation/{transaction_id}/to-expense")
async def convert_to_expense(
    request: Request,
    transaction_id: UUID,
    payload: ToExpenseIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    org_id = UUID(request.state.organization_id)
    tx = (
        await db.execute(
            select(BankTransaction).where(
                BankTransaction.id == transaction_id,
                BankTransaction.organization_id == org_id,
            )
        )
    ).scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Hareket bulunamadı")
    if tx.status == ReconciliationStatus.MATCHED:
        raise HTTPException(status_code=409, detail="Bu hareket zaten eşleştirilmiş")
    if tx.amount_cents >= 0:
        raise HTTPException(status_code=422, detail="Yalnız giden ödemeler (negatif tutar) gidere dönüştürülebilir")

    expense = Expense(
        organization_id=org_id,
        title=payload.title.strip(),
        category=payload.category.strip(),
        amount_cents=abs(tx.amount_cents),
        currency=tx.currency or "TRY",
        receipt_no=(payload.receipt_no or tx.external_id)[:100],
        expense_date=tx.booked_at,
        description=tx.description[:1000] if tx.description else None,
        created_by_id=current_user.id,
    )
    db.add(expense)
    await db.flush()
    tx.status = ReconciliationStatus.MATCHED
    tx.matched_by_id = current_user.id
    tx.matched_at = datetime.now(timezone.utc)
    tx.suggestion = {**(tx.suggestion or {}), "expense_id": str(expense.id), "expense_title": expense.title}
    await db.commit()
    return {"status": "matched", "expense_id": str(expense.id)}
