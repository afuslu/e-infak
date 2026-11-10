"""Stok / depo (ayni bağış dahil), alış-satış faturası ve cari borç-alacak defteri (İleri paket, muhasebe modülü).

- Stok bakiyesi = girişler − çıkışlar (depo bazında); çıkış bakiyeyi eksiye düşüremez.
- Ayni bağış bir stok girişidir (donor_id); kasaya para girmediği için nakit raporlarını etkilemez,
  tahmini değeri ayni bağış raporunda görünür.
- Faturanın stoklu satırları fatura depoya stok hareketi üretir; fatura iptalinde hareketler silinir.
  Fatura ödemeleri hareket defterine source_type=invoice ile yazılır.
- Cari defter: gider / alış faturası = alacak (biz borçluyuz), satış faturası = borç (cari borçlu),
  ödeme / tahsilat ve çek-senet karşılıkları. Bakiye > 0 ise kurum cariye borçludur.
"""
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Literal, Optional
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, condecimal, field_validator, model_validator
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.models.accounting import (
    STOCK_MOVE_KINDS, STOCK_UNITS, Cheque, Counterparty, FinanceAccount, Invoice, InvoiceLine, LedgerEntry, StockItem,
    StockMove, Warehouse,
)
from app.models.audit_log import AuditLog
from app.models.donation import Donor
from app.models.expense import Expense
from app.models.field_ops import AidRecipient
from app.models.user import User
from app.services import ledger
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features/acc",
    tags=["inventory"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
Qty = condecimal(gt=0, max_digits=14, decimal_places=3)


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


def _clean(value):
    return sanitize_public_text(value) if value else value


def _today() -> date:
    return datetime.now(TZ).date()


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


async def _owned(db: AsyncSession, model, org_id: UUID, item_id: UUID, label: str, lock: bool = False):
    query = select(model).where(model.id == item_id, model.organization_id == org_id)
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"{label} bulunamadı")
    return row


def _not_future(day: Optional[date]) -> date:
    day = day or _today()
    if day > _today():
        raise HTTPException(status_code=422, detail="İleri tarihli hareket girilemez")
    return day


def _num(value) -> float:
    return float(value or 0)


# --- Warehouses & items --------------------------------------------------------------------

class WarehouseIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = True

    clean_text = field_validator("name", "address", mode="before")(lambda cls, v: _clean(v))


@router.get("/warehouses")
async def list_warehouses(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(select(Warehouse).where(Warehouse.organization_id == _org_id(request)).order_by(Warehouse.name))).scalars().all()
    return [{"id": str(w.id), "name": w.name, "address": w.address, "is_active": w.is_active} for w in rows]


@router.post("/warehouses", status_code=status.HTTP_201_CREATED)
async def create_warehouse(request: Request, payload: WarehouseIn, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    w = Warehouse(organization_id=_org_id(request), **payload.model_dump())
    db.add(w)
    await db.commit()
    return {"id": str(w.id), "name": w.name, "address": w.address, "is_active": w.is_active}


@router.put("/warehouses/{warehouse_id}")
async def update_warehouse(request: Request, warehouse_id: UUID, payload: WarehouseIn, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    w = await _owned(db, Warehouse, _org_id(request), warehouse_id, "Depo")
    for key, value in payload.model_dump().items():
        setattr(w, key, value)
    await db.commit()
    return {"id": str(w.id), "name": w.name, "address": w.address, "is_active": w.is_active}


class ItemIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: Optional[str] = Field(default=None, max_length=40)
    unit: Literal["adet", "kg", "lt", "koli", "paket", "metre"] = "adet"
    category: Optional[str] = Field(default=None, max_length=60)
    min_qty: condecimal(ge=0, max_digits=14, decimal_places=3) = Decimal(0)
    unit_value_cents: int = Field(default=0, ge=0, le=1_000_000_000)
    is_active: bool = True

    clean_text = field_validator("name", "code", "category", mode="before")(lambda cls, v: _clean(v))


def _signed_qty():
    return case((StockMove.direction == "in", StockMove.qty), else_=-StockMove.qty)


async def _stock(db: AsyncSession, org_id: UUID, item_id: Optional[UUID] = None) -> dict[tuple[UUID, UUID], Decimal]:
    query = (select(StockMove.item_id, StockMove.warehouse_id, func.coalesce(func.sum(_signed_qty()), 0))
             .where(StockMove.organization_id == org_id).group_by(StockMove.item_id, StockMove.warehouse_id))
    if item_id:
        query = query.where(StockMove.item_id == item_id)
    return {(r[0], r[1]): Decimal(r[2]) for r in (await db.execute(query)).all()}


@router.get("/stock-items")
async def list_items(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Stok kartları; depo bazında ve toplam bakiye, kritik seviye uyarısı ve tahmini değer."""
    org_id = _org_id(request)
    items = (await db.execute(select(StockItem).where(StockItem.organization_id == org_id)
                              .order_by(StockItem.category, StockItem.name))).scalars().all()
    stock = await _stock(db, org_id)
    names = dict((await db.execute(select(Warehouse.id, Warehouse.name).where(Warehouse.organization_id == org_id))).all())
    out = []
    for i in items:
        per = {wid: q for (iid, wid), q in stock.items() if iid == i.id and q != 0}
        total = sum(per.values(), Decimal(0))
        out.append({
            "id": str(i.id), "name": i.name, "code": i.code, "unit": i.unit, "unit_label": STOCK_UNITS.get(i.unit, i.unit),
            "category": i.category, "min_qty": _num(i.min_qty), "unit_value_cents": i.unit_value_cents, "is_active": i.is_active,
            "qty": _num(total), "low": total <= i.min_qty and i.min_qty > 0,
            "value_cents": int((total * i.unit_value_cents).to_integral_value(ROUND_HALF_UP)),
            "by_warehouse": [{"warehouse_id": str(w), "warehouse": names.get(w), "qty": _num(q)} for w, q in per.items()],
        })
    return out


@router.post("/stock-items", status_code=status.HTTP_201_CREATED)
async def create_item(request: Request, payload: ItemIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    if (await db.execute(select(StockItem.id).where(StockItem.organization_id == org_id,
                                                    func.lower(StockItem.name) == payload.name.lower()))).first():
        raise HTTPException(status_code=409, detail="Bu isimde bir stok kartı var")
    item = StockItem(organization_id=org_id, **payload.model_dump())
    db.add(item)
    await db.commit()
    return {"id": str(item.id), "name": item.name}


@router.put("/stock-items/{item_id}")
async def update_item(request: Request, item_id: UUID, payload: ItemIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    item = await _owned(db, StockItem, _org_id(request), item_id, "Stok kartı")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    await db.commit()
    return {"id": str(item.id), "name": item.name}


# --- Stock moves ---------------------------------------------------------------------------

class MoveIn(BaseModel):
    item_id: UUID
    warehouse_id: UUID
    direction: Literal["in", "out"]
    qty: Qty
    kind: Literal["purchase", "in_kind", "aid_out", "adjust", "use"] = "adjust"
    move_date: Optional[date] = None
    unit_value_cents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    counterparty_id: Optional[UUID] = None
    donor_id: Optional[UUID] = None
    aid_recipient_id: Optional[UUID] = None
    note: Optional[str] = Field(default=None, max_length=500)

    clean_text = field_validator("note", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("counterparty_id", "donor_id", "aid_recipient_id", mode="before")(lambda cls, v: v or None)

    @model_validator(mode="after")
    def kind_direction(self):
        if self.kind in ("purchase", "in_kind") and self.direction != "in":
            raise ValueError("Alış ve ayni bağış giriş hareketidir")
        if self.kind in ("aid_out", "use") and self.direction != "out":
            raise ValueError("Yardım ve kurum içi kullanım çıkış hareketidir")
        if self.kind == "in_kind" and not self.donor_id:
            raise ValueError("Ayni bağış için bağışçı seçin")
        return self


async def _available(db: AsyncSession, org_id: UUID, item_id: UUID, warehouse_id: UUID) -> Decimal:
    return (await _stock(db, org_id, item_id)).get((item_id, warehouse_id), Decimal(0))


async def _lock_item(db: AsyncSession, org_id: UUID, item_id: UUID) -> StockItem:
    """Aynı stok kartına eşzamanlı çıkışlar bakiyeyi eksiye düşürmesin diye kartı kilitler."""
    return await _owned(db, StockItem, org_id, item_id, "Stok kartı", lock=True)


async def _move(db: AsyncSession, org_id: UUID, user: User, *, item: StockItem, warehouse_id: UUID, direction: str, qty: Decimal,
                kind: str, day: date, unit_value_cents: Optional[int] = None, **links) -> StockMove:
    if direction == "out":
        available = await _available(db, org_id, item.id, warehouse_id)
        if qty > available:
            raise HTTPException(status_code=409, detail=f"{item.name}: depoda {_num(available):g} {item.unit} var, {_num(qty):g} çıkılamaz")
    move = StockMove(organization_id=org_id, item_id=item.id, warehouse_id=warehouse_id, direction=direction, qty=qty, kind=kind,
                     move_date=day, unit_value_cents=item.unit_value_cents if unit_value_cents is None else unit_value_cents,
                     created_by_id=user.id, **links)
    db.add(move)
    await db.flush()
    return move


@router.post("/stock-moves", status_code=status.HTTP_201_CREATED)
async def create_move(request: Request, payload: MoveIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    item = await _lock_item(db, org_id, payload.item_id)
    await _owned(db, Warehouse, org_id, payload.warehouse_id, "Depo")
    if payload.counterparty_id:
        await _owned(db, Counterparty, org_id, payload.counterparty_id, "Cari kart")
    if payload.donor_id:
        await _owned(db, Donor, org_id, payload.donor_id, "Bağışçı")
    if payload.aid_recipient_id:
        await _owned(db, AidRecipient, org_id, payload.aid_recipient_id, "Hane")
    move = await _move(db, org_id, current_user, item=item, warehouse_id=payload.warehouse_id, direction=payload.direction,
                       qty=payload.qty, kind=payload.kind, day=_not_future(payload.move_date), unit_value_cents=payload.unit_value_cents,
                       counterparty_id=payload.counterparty_id, donor_id=payload.donor_id,
                       aid_recipient_id=payload.aid_recipient_id, note=payload.note)
    _audit(db, org_id, current_user, "stok_hareket", {"item": item.name, "direction": move.direction, "qty": str(move.qty), "kind": move.kind})
    await db.commit()
    return {"id": str(move.id)}


class TransferIn(BaseModel):
    item_id: UUID
    from_warehouse_id: UUID
    to_warehouse_id: UUID
    qty: Qty
    move_date: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=500)


@router.post("/stock-transfers", status_code=status.HTTP_201_CREATED)
async def transfer_stock(request: Request, payload: TransferIn, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    if payload.from_warehouse_id == payload.to_warehouse_id:
        raise HTTPException(status_code=422, detail="Kaynak ve hedef depo aynı olamaz")
    item = await _lock_item(db, org_id, payload.item_id)
    for wid in (payload.from_warehouse_id, payload.to_warehouse_id):
        await _owned(db, Warehouse, org_id, wid, "Depo")
    group = uuid4()
    day = _not_future(payload.move_date)
    note = _clean(payload.note)
    await _move(db, org_id, current_user, item=item, warehouse_id=payload.from_warehouse_id, direction="out", qty=payload.qty,
                kind="transfer", day=day, group_id=group, note=note)
    await _move(db, org_id, current_user, item=item, warehouse_id=payload.to_warehouse_id, direction="in", qty=payload.qty,
                kind="transfer", day=day, group_id=group, note=note)
    await db.commit()
    return {"group_id": str(group)}


@router.delete("/stock-moves/{move_id}")
async def delete_move(request: Request, move_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Elle girilen hareketi (transferde iki bacağıyla) siler; fatura hareketleri faturadan geri alınır."""
    org_id = _org_id(request)
    move = await _owned(db, StockMove, org_id, move_id, "Stok hareketi")
    if move.invoice_id:
        raise HTTPException(status_code=409, detail="Fatura hareketi faturayı iptal ederek geri alınır")
    await _lock_item(db, org_id, move.item_id)
    moves = (await db.execute(select(StockMove).where(StockMove.group_id == move.group_id))).scalars().all() if move.group_id else [move]
    for m in moves:
        if m.direction == "in":
            remaining = await _available(db, org_id, m.item_id, m.warehouse_id) - m.qty
            if remaining < 0:
                raise HTTPException(status_code=409, detail="Bu giriş silinirse stok eksiye düşer; önce çıkışları düzeltin")
    for m in moves:
        await db.delete(m)
    _audit(db, org_id, current_user, "stok_hareket_sil", {"moves": len(moves)})
    await db.commit()
    return {"deleted": len(moves)}


@router.get("/stock-moves")
async def list_moves(
    request: Request, item_id: Optional[UUID] = None, warehouse_id: Optional[UUID] = None,
    kind: Optional[str] = None, start: Optional[date] = None, end: Optional[date] = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = (select(StockMove, StockItem.name, StockItem.unit, Warehouse.name, Counterparty.name, Donor.first_name, Donor.last_name,
                    AidRecipient.full_name)
             .join(StockItem, StockItem.id == StockMove.item_id).join(Warehouse, Warehouse.id == StockMove.warehouse_id)
             .outerjoin(Counterparty, Counterparty.id == StockMove.counterparty_id)
             .outerjoin(Donor, Donor.id == StockMove.donor_id)
             .outerjoin(AidRecipient, AidRecipient.id == StockMove.aid_recipient_id)
             .where(StockMove.organization_id == org_id))
    for column, value in ((StockMove.item_id, item_id), (StockMove.warehouse_id, warehouse_id), (StockMove.kind, kind)):
        if value:
            query = query.where(column == value)
    if start:
        query = query.where(StockMove.move_date >= start)
    if end:
        query = query.where(StockMove.move_date <= end)
    rows = (await db.execute(query.order_by(StockMove.move_date.desc(), StockMove.created_at.desc()).limit(5000))).all()
    return [{
        "id": str(m.id), "move_date": m.move_date, "item_id": str(m.item_id), "item": item, "unit": unit, "warehouse": wh,
        "direction": m.direction, "qty": _num(m.qty), "kind": m.kind, "kind_label": STOCK_MOVE_KINDS.get(m.kind, m.kind),
        "unit_value_cents": m.unit_value_cents,
        "value_cents": int((m.qty * m.unit_value_cents).to_integral_value(ROUND_HALF_UP)),
        "party": cp or (f"{df} {dl or ''}".strip() if df else None) or rec, "invoice_id": str(m.invoice_id) if m.invoice_id else None,
        "note": m.note,
    } for m, item, unit, wh, cp, df, dl, rec in rows]


@router.get("/in-kind-report")
async def in_kind_report(request: Request, start: Optional[date] = None, end: Optional[date] = None,
                         db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Ayni bağışlar: kalem ve bağışçı bazında miktar ve tahmini değer."""
    org_id = _org_id(request)
    end = end or _today()
    start = start or date(end.year, 1, 1)
    value = func.sum(StockMove.qty * StockMove.unit_value_cents)
    base = (StockMove.organization_id == org_id, StockMove.kind == "in_kind", StockMove.move_date >= start, StockMove.move_date <= end)
    by_item = (await db.execute(select(StockItem.name, StockItem.unit, func.sum(StockMove.qty), value)
                                .join(StockItem, StockItem.id == StockMove.item_id).where(*base)
                                .group_by(StockItem.name, StockItem.unit).order_by(value.desc()))).all()
    by_donor = (await db.execute(select(Donor.id, Donor.first_name, Donor.last_name, func.count(StockMove.id), value)
                                 .join(Donor, Donor.id == StockMove.donor_id).where(*base)
                                 .group_by(Donor.id, Donor.first_name, Donor.last_name).order_by(value.desc()).limit(500))).all()
    rows_item = [{"item": n, "unit": u, "qty": _num(q), "value_cents": int(v or 0)} for n, u, q, v in by_item]
    return {"start": start, "end": end, "total_value_cents": sum(r["value_cents"] for r in rows_item), "by_item": rows_item,
            "by_donor": [{"donor_id": str(i), "donor": f"{f} {l or ''}".strip(), "count": int(c), "value_cents": int(v or 0)}
                         for i, f, l, c, v in by_donor]}


# --- Invoices ------------------------------------------------------------------------------

class LineIn(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    item_id: Optional[UUID] = None
    qty: Qty = Decimal(1)
    unit_price_cents: int = Field(ge=0, le=10_000_000_000)
    vat_rate: Literal[0, 1, 8, 10, 18, 20] = 20

    clean_text = field_validator("description", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("item_id", mode="before")(lambda cls, v: v or None)


class InvoiceIn(BaseModel):
    kind: Literal["purchase", "sales"] = "purchase"
    number: str = Field(min_length=1, max_length=40)
    counterparty_id: UUID
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    currency: Literal["TRY", "USD", "EUR", "GBP"] = "TRY"
    warehouse_id: Optional[UUID] = None
    lines: List[LineIn] = Field(min_length=1, max_length=200)
    note: Optional[str] = Field(default=None, max_length=2000)

    clean_text = field_validator("number", "note", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("warehouse_id", "due_date", mode="before")(lambda cls, v: v or None)


async def _paid(db: AsyncSession, invoice_ids: list[UUID]) -> dict[UUID, int]:
    if not invoice_ids:
        return {}
    rows = (await db.execute(select(LedgerEntry.source_id, func.sum(LedgerEntry.amount_cents)).where(
        LedgerEntry.source_type == "invoice", LedgerEntry.source_id.in_(invoice_ids)).group_by(LedgerEntry.source_id))).all()
    return {r[0]: int(r[1]) for r in rows}


def _invoice_out(inv: Invoice, cp: Optional[str], paid: int, lines: Optional[list] = None) -> dict:
    remaining = max(0, inv.total_cents - paid) if inv.status == "open" else 0
    out = {
        "id": str(inv.id), "kind": inv.kind, "kind_label": "Alış" if inv.kind == "purchase" else "Satış", "number": inv.number,
        "counterparty_id": str(inv.counterparty_id), "counterparty": cp, "issue_date": inv.issue_date, "due_date": inv.due_date,
        "currency": inv.currency, "subtotal_cents": inv.subtotal_cents, "vat_cents": inv.vat_cents, "total_cents": inv.total_cents,
        "paid_cents": paid, "remaining_cents": remaining, "status": inv.status,
        "payment_status": "cancelled" if inv.status == "cancelled" else "paid" if remaining == 0 else "partial" if paid else "unpaid",
        "overdue": inv.status == "open" and remaining > 0 and inv.due_date is not None and inv.due_date < _today(),
        "warehouse_id": str(inv.warehouse_id) if inv.warehouse_id else None, "note": inv.note,
    }
    if lines is not None:
        out["lines"] = [{"description": l.description, "item_id": str(l.item_id) if l.item_id else None, "qty": _num(l.qty),
                         "unit_price_cents": l.unit_price_cents, "vat_rate": l.vat_rate, "line_total_cents": l.line_total_cents}
                        for l in lines]
    return out


@router.get("/invoices")
async def list_invoices(
    request: Request, kind: Optional[Literal["purchase", "sales"]] = None, counterparty_id: Optional[UUID] = None,
    unpaid: bool = False, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = (select(Invoice, Counterparty.name).join(Counterparty, Counterparty.id == Invoice.counterparty_id)
             .where(Invoice.organization_id == org_id))
    if kind:
        query = query.where(Invoice.kind == kind)
    if counterparty_id:
        query = query.where(Invoice.counterparty_id == counterparty_id)
    rows = (await db.execute(query.order_by(Invoice.issue_date.desc(), Invoice.created_at.desc()).limit(5000))).all()
    paid = await _paid(db, [i.id for i, _ in rows])
    out = [_invoice_out(i, cp, paid.get(i.id, 0)) for i, cp in rows]
    return [o for o in out if o["remaining_cents"] > 0] if unpaid else out


@router.post("/invoices", status_code=status.HTTP_201_CREATED)
async def create_invoice(request: Request, payload: InvoiceIn, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    cp = await _owned(db, Counterparty, org_id, payload.counterparty_id, "Cari kart")
    day = _not_future(payload.issue_date)
    if (await db.execute(select(Invoice.id).where(
            Invoice.organization_id == org_id, Invoice.kind == payload.kind, Invoice.counterparty_id == cp.id,
            Invoice.number == payload.number))).first():
        raise HTTPException(status_code=409, detail="Bu cariden aynı numaralı fatura zaten girilmiş")
    stocked = [l for l in payload.lines if l.item_id]
    if stocked and not payload.warehouse_id:
        raise HTTPException(status_code=422, detail="Stoklu satırlar için depo seçin")
    if payload.warehouse_id:
        await _owned(db, Warehouse, org_id, payload.warehouse_id, "Depo")
    inv = Invoice(organization_id=org_id, kind=payload.kind, number=payload.number, counterparty_id=cp.id, issue_date=day,
                  due_date=payload.due_date, currency=payload.currency, warehouse_id=payload.warehouse_id, note=payload.note,
                  status="open", created_by_id=current_user.id)
    db.add(inv)
    await db.flush()
    subtotal = vat = 0
    lines = []
    for l in payload.lines:
        line_total = int((l.qty * l.unit_price_cents).to_integral_value(ROUND_HALF_UP))
        subtotal += line_total
        vat += int((Decimal(line_total) * l.vat_rate / 100).to_integral_value(ROUND_HALF_UP))
        line = InvoiceLine(invoice_id=inv.id, description=l.description, item_id=l.item_id, qty=l.qty,
                           unit_price_cents=l.unit_price_cents, vat_rate=l.vat_rate, line_total_cents=line_total)
        db.add(line)
        lines.append(line)
        if l.item_id:
            item = await _lock_item(db, org_id, l.item_id)
            await _move(db, org_id, current_user, item=item, warehouse_id=payload.warehouse_id,
                        direction="in" if payload.kind == "purchase" else "out", qty=l.qty, kind="invoice", day=day,
                        unit_value_cents=l.unit_price_cents, counterparty_id=cp.id, invoice_id=inv.id,
                        note=f"Fatura {inv.number}")
    inv.subtotal_cents, inv.vat_cents, inv.total_cents = subtotal, vat, subtotal + vat
    _audit(db, org_id, current_user, "fatura_ekle", {"kind": inv.kind, "number": inv.number, "total_cents": inv.total_cents})
    await db.commit()
    return _invoice_out(inv, cp.name, 0, lines)


@router.get("/invoices/{invoice_id}")
async def get_invoice(request: Request, invoice_id: UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    inv = await _owned(db, Invoice, org_id, invoice_id, "Fatura")
    lines = (await db.execute(select(InvoiceLine).where(InvoiceLine.invoice_id == inv.id))).scalars().all()
    cp = (await db.execute(select(Counterparty.name).where(Counterparty.id == inv.counterparty_id))).scalar()
    return _invoice_out(inv, cp, (await _paid(db, [inv.id])).get(inv.id, 0), lines)


class InvoicePayIn(BaseModel):
    account_id: UUID
    amount_cents: Optional[int] = Field(default=None, gt=0, le=10_000_000_000)  # boşsa kalanın tamamı
    paid_on: Optional[date] = None


@router.post("/invoices/{invoice_id}/pay")
async def pay_invoice(request: Request, invoice_id: UUID, payload: InvoicePayIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Alış faturasını öder (hesaptan çıkış) / satış faturasını tahsil eder (hesaba giriş); kısmi ödeme olabilir."""
    org_id = _org_id(request)
    inv = await _owned(db, Invoice, org_id, invoice_id, "Fatura", lock=True)
    if inv.status != "open":
        raise HTTPException(status_code=409, detail="İptal edilmiş fatura ödenemez")
    remaining = inv.total_cents - (await _paid(db, [inv.id])).get(inv.id, 0)
    amount = payload.amount_cents or remaining
    if remaining <= 0 or amount > remaining:
        raise HTTPException(status_code=409, detail=f"Faturanın kalan tutarı {remaining / 100:.2f} {inv.currency}")
    acc = await ledger.account(db, org_id, payload.account_id, currency=inv.currency)
    ledger.post(db, acc, direction="out" if inv.kind == "purchase" else "in", amount_cents=amount,
                entry_date=_not_future(payload.paid_on), category="Alış faturası" if inv.kind == "purchase" else "Satış faturası",
                description=f"Fatura {inv.number}", source_type="invoice", source_id=inv.id, counterparty_id=inv.counterparty_id,
                user_id=current_user.id)
    _audit(db, org_id, current_user, "fatura_odeme", {"number": inv.number, "amount_cents": amount})
    await db.commit()
    return {"paid_cents": amount, "remaining_cents": remaining - amount}


@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(request: Request, invoice_id: UUID, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """Ödemesi olmayan faturayı iptal eder; stok hareketleri geri alınır."""
    org_id = _org_id(request)
    inv = await _owned(db, Invoice, org_id, invoice_id, "Fatura", lock=True)
    if inv.status != "open":
        raise HTTPException(status_code=409, detail="Fatura zaten iptal")
    if (await _paid(db, [inv.id])).get(inv.id, 0):
        raise HTTPException(status_code=409, detail="Ödemesi olan fatura iptal edilemez; önce ödemeyi kasa ekstresinden geri alın")
    moves = (await db.execute(select(StockMove).where(StockMove.invoice_id == inv.id))).scalars().all()
    for m in moves:
        await _lock_item(db, org_id, m.item_id)
        if m.direction == "in" and await _available(db, org_id, m.item_id, m.warehouse_id) - m.qty < 0:
            raise HTTPException(status_code=409, detail="Bu faturayla giren stok kullanılmış; iptal stoğu eksiye düşürür")
    for m in moves:
        await db.delete(m)
    inv.status = "cancelled"
    _audit(db, org_id, current_user, "fatura_iptal", {"number": inv.number})
    await db.commit()
    return {"cancelled": True, "stock_moves_removed": len(moves)}


# --- Counterparty debit / credit ledger ----------------------------------------------------

@router.get("/counterparties/{cp_id}/ledger")
async def counterparty_ledger(request: Request, cp_id: UUID, currency: Literal["TRY", "USD", "EUR", "GBP"] = "TRY",
                              db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Cari borç / alacak defteri (tek para birimi). credit: kurumun borcu artar, debit: azalır.

    Bakiye > 0: kurum cariye borçlu; < 0: cari kuruma borçlu.
    """
    org_id = _org_id(request)
    cp = await _owned(db, Counterparty, org_id, cp_id, "Cari kart")
    rows: list[dict] = []

    def add(day, kind, text, debit=0, credit=0):
        rows.append({"date": day, "type": kind, "description": text, "debit_cents": debit, "credit_cents": credit})

    for e in (await db.execute(select(Expense).where(Expense.counterparty_id == cp.id, Expense.currency == currency))).scalars().all():
        add(ledger.local_day(e.expense_date), "Gider", e.description or e.category, credit=e.amount_cents)
    for inv in (await db.execute(select(Invoice).where(Invoice.counterparty_id == cp.id, Invoice.currency == currency,
                                                       Invoice.status == "open"))).scalars().all():
        if inv.kind == "purchase":
            add(inv.issue_date, "Alış faturası", inv.number, credit=inv.total_cents)
        else:
            add(inv.issue_date, "Satış faturası", inv.number, debit=inv.total_cents)
    entries = (await db.execute(
        select(LedgerEntry).join(FinanceAccount, FinanceAccount.id == LedgerEntry.account_id)
        .where(LedgerEntry.counterparty_id == cp.id, FinanceAccount.currency == currency, LedgerEntry.source_type != "cheque")
    )).scalars().all()
    for e in entries:
        if e.direction == "out":
            add(e.entry_date, "Ödeme", e.description or e.category, debit=e.amount_cents)
        else:
            add(e.entry_date, "Tahsilat", e.description or e.category, credit=e.amount_cents)
    cheques = (await db.execute(select(Cheque).where(
        Cheque.currency == currency, Cheque.organization_id == org_id,
        (Cheque.counterparty_id == cp.id) | (Cheque.endorsed_to_id == cp.id)))).scalars().all()
    for c in cheques:
        label = f"{'Çek' if c.kind == 'cheque' else 'Senet'} {c.number}"
        day = c.issue_date or c.created_at.date()
        if c.counterparty_id == cp.id and c.status not in ("bounced", "cancelled"):
            if c.direction == "received":
                add(day, "Alınan çek/senet", label, credit=c.amount_cents)
            else:
                add(day, "Verilen çek/senet", label, debit=c.amount_cents)
        if c.endorsed_to_id == cp.id and c.status == "endorsed":
            add(day, "Ciro edilen çek", label, debit=c.amount_cents)
    rows.sort(key=lambda r: (r["date"], r["type"]))
    balance = 0
    for r in rows:
        balance += r["credit_cents"] - r["debit_cents"]
        r["balance_cents"] = balance
    return {"counterparty": {"id": str(cp.id), "name": cp.name}, "currency": currency, "balance_cents": balance,
            "status": "Kurum borçlu" if balance > 0 else "Cari borçlu" if balance < 0 else "Kapalı", "rows": rows}
