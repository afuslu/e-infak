"""Muhasebe (İleri paket): kasa / banka / POS hesapları, hareket defteri ve virman, gider kartları ve
giderler, cari kartlar, çek-senet, personel maaş ve avans.

Para hareketi yaratan her işlem (gider ödemesi, çek tahsili, maaş, avans, virman, elle hareket)
hareket defterine (ledger_entries) yazılır; işlem geri alınınca kaynağına bağlı hareket de silinir.
Onaylı bağışlar donation_hooks üzerinden, ödeme yöntemine göre varsayılan hesaba otomatik işlenir.
"""
from datetime import date, datetime, timedelta, timezone
from typing import List, Literal, Optional
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.models.accounting import (
    ACCOUNT_KINDS, CHEQUE_STATUSES, COUNTERPARTY_KINDS, Cheque, Counterparty, Employee, ExpenseCard, FinanceAccount,
    LedgerEntry, PayrollItem, SalaryAdvance,
)
from app.models.audit_log import AuditLog
from app.models.expense import Expense
from app.models.user import User
from app.services import ledger
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features/acc",
    tags=["accounting"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
Currency = Literal["TRY", "USD", "EUR", "GBP", "SAR", "CHF"]


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


async def _counterparty(db: AsyncSession, org_id: UUID, cp_id: Optional[UUID]) -> Optional[Counterparty]:
    return await _owned(db, Counterparty, org_id, cp_id, "Cari kart") if cp_id else None


def _not_future(day: Optional[date]) -> date:
    day = day or _today()
    if day > _today():
        raise HTTPException(status_code=422, detail="İleri tarihli para hareketi girilemez")
    return day


# --- Accounts & ledger ---------------------------------------------------------------------

class AccountIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    kind: Literal["cash", "bank", "pos"] = "cash"
    currency: Currency = "TRY"
    bank_name: Optional[str] = Field(default=None, max_length=120)
    iban: Optional[str] = Field(default=None, max_length=40)
    opening_balance_cents: int = Field(default=0, ge=-10_000_000_000, le=10_000_000_000)
    opening_date: Optional[date] = None
    default_for: Optional[Literal["cash", "bank_transfer", "credit_card"]] = None
    is_active: bool = True

    clean_text = field_validator("name", "bank_name", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("default_for", "iban", "opening_date", mode="before")(lambda cls, v: v or None)


def _account_out(a: FinanceAccount, balance: int) -> dict:
    return {
        "id": str(a.id), "name": a.name, "kind": a.kind, "kind_label": ACCOUNT_KINDS.get(a.kind, a.kind), "currency": a.currency,
        "bank_name": a.bank_name, "iban": a.iban, "opening_balance_cents": a.opening_balance_cents, "opening_date": a.opening_date,
        "default_for": a.default_for, "is_active": a.is_active, "balance_cents": balance,
    }


async def _clear_default(db: AsyncSession, org_id: UUID, default_for: Optional[str], currency: str, keep: Optional[UUID]) -> None:
    """Bir ödeme yöntemi + para birimi için tek varsayılan hesap olur."""
    if not default_for:
        return
    others = (await db.execute(select(FinanceAccount).where(
        FinanceAccount.organization_id == org_id, FinanceAccount.default_for == default_for,
        FinanceAccount.currency == currency))).scalars().all()
    for other in others:
        if other.id != keep:
            other.default_for = None


@router.get("/accounts")
async def list_accounts(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    rows = (await db.execute(select(FinanceAccount).where(FinanceAccount.organization_id == org_id)
                             .order_by(FinanceAccount.is_active.desc(), FinanceAccount.kind, FinanceAccount.name))).scalars().all()
    bal = await ledger.balances(db, org_id)
    return [_account_out(a, bal.get(a.id, a.opening_balance_cents)) for a in rows]


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
async def create_account(request: Request, payload: AccountIn, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    await _clear_default(db, org_id, payload.default_for, payload.currency, None)
    acc = FinanceAccount(organization_id=org_id, **payload.model_dump())
    db.add(acc)
    _audit(db, org_id, current_user, "hesap_ekle", {"name": acc.name, "currency": acc.currency})
    await db.commit()
    return _account_out(acc, acc.opening_balance_cents)


@router.put("/accounts/{account_id}")
async def update_account(request: Request, account_id: UUID, payload: AccountIn, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    acc = await _owned(db, FinanceAccount, org_id, account_id, "Hesap", lock=True)
    if payload.currency != acc.currency and (await db.execute(
            select(LedgerEntry.id).where(LedgerEntry.account_id == acc.id).limit(1))).first():
        raise HTTPException(status_code=409, detail="Hareketi olan hesabın para birimi değiştirilemez")
    await _clear_default(db, org_id, payload.default_for, payload.currency, acc.id)
    for key, value in payload.model_dump().items():
        setattr(acc, key, value)
    await db.commit()
    return _account_out(acc, (await ledger.balances(db, org_id))[acc.id])


class EntryIn(BaseModel):
    account_id: UUID
    direction: Literal["in", "out"]
    amount_cents: int = Field(gt=0, le=10_000_000_000)
    entry_date: Optional[date] = None
    category: str = Field(min_length=2, max_length=60)
    description: Optional[str] = Field(default=None, max_length=500)
    counterparty_id: Optional[UUID] = None

    clean_text = field_validator("category", "description", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("counterparty_id", mode="before")(lambda cls, v: v or None)


@router.post("/entries", status_code=status.HTTP_201_CREATED)
async def create_entry(request: Request, payload: EntryIn, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Elle kasa / banka hareketi (ör. banka masrafı, faiz, kira geliri)."""
    org_id = _org_id(request)
    acc = await ledger.account(db, org_id, payload.account_id)
    await _counterparty(db, org_id, payload.counterparty_id)
    entry = ledger.post(db, acc, direction=payload.direction, amount_cents=payload.amount_cents,
                        entry_date=_not_future(payload.entry_date), category=payload.category, description=payload.description,
                        counterparty_id=payload.counterparty_id, user_id=current_user.id)
    _audit(db, org_id, current_user, "kasa_hareket", {"account": acc.name, "direction": payload.direction, "amount_cents": payload.amount_cents})
    await db.commit()
    return {"id": str(entry.id)}


class TransferIn(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    amount_cents: int = Field(gt=0, le=10_000_000_000)
    entry_date: Optional[date] = None
    description: Optional[str] = Field(default=None, max_length=300)

    clean_text = field_validator("description", mode="before")(lambda cls, v: _clean(v))


@router.post("/transfers", status_code=status.HTTP_201_CREATED)
async def create_transfer(request: Request, payload: TransferIn, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """Hesaplar arası virman (ör. kasadan bankaya yatırma); iki hesap aynı para biriminde olmalı."""
    org_id = _org_id(request)
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=422, detail="Kaynak ve hedef hesap aynı olamaz")
    src = await ledger.account(db, org_id, payload.from_account_id)
    dst = await ledger.account(db, org_id, payload.to_account_id, currency=src.currency)
    day = _not_future(payload.entry_date)
    transfer_id = uuid4()
    note = payload.description or f"{src.name} → {dst.name}"
    for acc, direction in ((src, "out"), (dst, "in")):
        ledger.post(db, acc, direction=direction, amount_cents=payload.amount_cents, entry_date=day, category="Virman",
                    description=note, source_type="transfer", source_id=transfer_id, user_id=current_user.id)
    _audit(db, org_id, current_user, "virman", {"from": src.name, "to": dst.name, "amount_cents": payload.amount_cents})
    await db.commit()
    return {"transfer_id": str(transfer_id)}


@router.delete("/entries/{entry_id}")
async def delete_entry(request: Request, entry_id: UUID, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Yalnız elle girilen hareket ve virman silinebilir; diğerleri kaynağından geri alınır."""
    org_id = _org_id(request)
    entry = await _owned(db, LedgerEntry, org_id, entry_id, "Hareket")
    if entry.source_type == "transfer":
        removed = await ledger.remove_source(db, org_id, "transfer", entry.source_id)
    elif entry.source_type == "manual":
        await db.delete(entry)
        removed = 1
    else:
        raise HTTPException(status_code=409, detail="Bu hareket bağlı olduğu kayıttan (bağış, gider, çek, maaş) geri alınır")
    _audit(db, org_id, current_user, "kasa_hareket_sil", {"entry_id": str(entry_id), "removed": removed})
    await db.commit()
    return {"removed": removed}


@router.get("/accounts/{account_id}/statement")
async def account_statement(request: Request, account_id: UUID, start: Optional[date] = None, end: Optional[date] = None,
                            db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Hesap ekstresi: dönem başı bakiye, hareketler ve yürüyen bakiye."""
    org_id = _org_id(request)
    acc = await _owned(db, FinanceAccount, org_id, account_id, "Hesap")
    end = end or _today()
    start = start or end.replace(day=1)
    before = (await db.execute(select(func.coalesce(func.sum(ledger.signed()), 0)).where(
        LedgerEntry.account_id == acc.id, LedgerEntry.entry_date < start))).scalar_one()
    rows = (await db.execute(
        select(LedgerEntry, Counterparty.name).outerjoin(Counterparty, Counterparty.id == LedgerEntry.counterparty_id)
        .where(LedgerEntry.account_id == acc.id, LedgerEntry.entry_date >= start, LedgerEntry.entry_date <= end)
        .order_by(LedgerEntry.entry_date, LedgerEntry.created_at)
    )).all()
    running = acc.opening_balance_cents + int(before)
    opening = running
    entries = []
    for e, cp in rows:
        running += e.amount_cents if e.direction == "in" else -e.amount_cents
        entries.append({
            "id": str(e.id), "entry_date": e.entry_date, "direction": e.direction, "amount_cents": e.amount_cents,
            "category": e.category, "description": e.description, "source_type": e.source_type,
            "counterparty": cp, "balance_cents": running,
        })
    return {"account": _account_out(acc, running), "start": start, "end": end, "opening_cents": opening,
            "closing_cents": running, "in_cents": sum(e["amount_cents"] for e in entries if e["direction"] == "in"),
            "out_cents": sum(e["amount_cents"] for e in entries if e["direction"] == "out"), "entries": entries}


# --- Expense cards & expenses --------------------------------------------------------------

class CardIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    code: Optional[str] = Field(default=None, max_length=20)
    group: Optional[str] = Field(default=None, max_length=60)
    is_active: bool = True

    clean_text = field_validator("name", "code", "group", mode="before")(lambda cls, v: _clean(v))


def _card_out(c: ExpenseCard) -> dict:
    return {"id": str(c.id), "name": c.name, "code": c.code, "group": c.group, "is_active": c.is_active}


@router.get("/expense-cards")
async def list_cards(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(select(ExpenseCard).where(ExpenseCard.organization_id == _org_id(request))
                             .order_by(ExpenseCard.group, ExpenseCard.name))).scalars().all()
    return [_card_out(c) for c in rows]


@router.post("/expense-cards", status_code=status.HTTP_201_CREATED)
async def create_card(request: Request, payload: CardIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    if (await db.execute(select(ExpenseCard.id).where(ExpenseCard.organization_id == org_id,
                                                      func.lower(ExpenseCard.name) == payload.name.lower()))).first():
        raise HTTPException(status_code=409, detail="Bu isimde bir gider kartı var")
    card = ExpenseCard(organization_id=org_id, **payload.model_dump())
    db.add(card)
    await db.commit()
    return _card_out(card)


@router.put("/expense-cards/{card_id}")
async def update_card(request: Request, card_id: UUID, payload: CardIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    card = await _owned(db, ExpenseCard, org_id, card_id, "Gider kartı")
    for key, value in payload.model_dump().items():
        setattr(card, key, value)
    await db.commit()
    return _card_out(card)


class ExpenseIn(BaseModel):
    expense_card_id: UUID
    amount_cents: int = Field(gt=0, le=10_000_000_000)
    currency: Currency = "TRY"
    expense_date: Optional[date] = None
    description: Optional[str] = Field(default=None, max_length=1000)
    document_no: Optional[str] = Field(default=None, max_length=100)  # fatura / fiş no
    counterparty_id: Optional[UUID] = None
    account_id: Optional[UUID] = None  # boşsa ödenmemiş (borç) gider

    clean_text = field_validator("description", "document_no", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("counterparty_id", "account_id", mode="before")(lambda cls, v: v or None)


def _expense_out(e: Expense, card: Optional[str] = None, cp: Optional[str] = None, account: Optional[str] = None) -> dict:
    return {
        "id": str(e.id), "expense_card_id": str(e.expense_card_id) if e.expense_card_id else None, "card_name": card or e.category,
        "amount_cents": e.amount_cents, "currency": e.currency or "TRY", "expense_date": ledger.local_day(e.expense_date),
        "description": e.description or (e.title if e.title != (card or e.category) else None), "document_no": e.receipt_no or None,
        "counterparty_id": str(e.counterparty_id) if e.counterparty_id else None, "counterparty": cp,
        "account_id": str(e.account_id) if e.account_id else None, "account_name": account, "paid": e.account_id is not None,
    }


@router.get("/expenses")
async def list_expenses(
    request: Request, start: Optional[date] = None, end: Optional[date] = None, card_id: Optional[UUID] = None,
    counterparty_id: Optional[UUID] = None, unpaid: bool = False,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = (select(Expense, ExpenseCard.name, Counterparty.name, FinanceAccount.name)
             .outerjoin(ExpenseCard, ExpenseCard.id == Expense.expense_card_id)
             .outerjoin(Counterparty, Counterparty.id == Expense.counterparty_id)
             .outerjoin(FinanceAccount, FinanceAccount.id == Expense.account_id)
             .where(Expense.organization_id == org_id))
    if start:
        query = query.where(Expense.expense_date >= datetime.combine(start, datetime.min.time(), TZ))
    if end:
        query = query.where(Expense.expense_date < datetime.combine(end + timedelta(days=1), datetime.min.time(), TZ))
    if card_id:
        query = query.where(Expense.expense_card_id == card_id)
    if counterparty_id:
        query = query.where(Expense.counterparty_id == counterparty_id)
    if unpaid:
        query = query.where(Expense.account_id.is_(None))
    rows = (await db.execute(query.order_by(Expense.expense_date.desc()).limit(5000))).all()
    return [_expense_out(e, c, cp, a) for e, c, cp, a in rows]


def _post_expense(db: AsyncSession, acc: FinanceAccount, e: Expense, card: ExpenseCard, cp: Optional[Counterparty],
                  day: date, user: User) -> None:
    ledger.post(db, acc, direction="out", amount_cents=e.amount_cents, entry_date=day, category=card.name,
                description=e.description or (cp.name if cp else None), source_type="expense", source_id=e.id,
                counterparty_id=e.counterparty_id, user_id=user.id)


@router.post("/expenses", status_code=status.HTTP_201_CREATED)
async def create_expense(request: Request, payload: ExpenseIn, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    card = await _owned(db, ExpenseCard, org_id, payload.expense_card_id, "Gider kartı")
    cp = await _counterparty(db, org_id, payload.counterparty_id)
    day = _not_future(payload.expense_date)
    acc = await ledger.account(db, org_id, payload.account_id, currency=payload.currency) if payload.account_id else None
    e = Expense(
        organization_id=org_id, title=(payload.description or card.name)[:300], category=card.name[:100],
        amount_cents=payload.amount_cents, receipt_no=payload.document_no or "", currency=payload.currency,
        expense_date=datetime.combine(day, datetime.min.time().replace(hour=12), TZ), expense_card_id=card.id,
        counterparty_id=payload.counterparty_id, account_id=payload.account_id, description=payload.description,
        created_by_id=current_user.id,
    )
    db.add(e)
    await db.flush()
    if acc:
        _post_expense(db, acc, e, card, cp, day, current_user)
    _audit(db, org_id, current_user, "gider_ekle", {"card": card.name, "amount_cents": e.amount_cents, "paid": acc is not None})
    await db.commit()
    return _expense_out(e, card.name, cp.name if cp else None, acc.name if acc else None)


class PayIn(BaseModel):
    account_id: UUID
    paid_on: Optional[date] = None


@router.post("/expenses/{expense_id}/pay")
async def pay_expense(request: Request, expense_id: UUID, payload: PayIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Borç olarak girilmiş gideri öder (hesaptan çıkış)."""
    org_id = _org_id(request)
    e = await _owned(db, Expense, org_id, expense_id, "Gider", lock=True)
    if e.account_id:
        raise HTTPException(status_code=409, detail="Gider zaten ödenmiş")
    acc = await ledger.account(db, org_id, payload.account_id, currency=e.currency or "TRY")
    card = await _owned(db, ExpenseCard, org_id, e.expense_card_id, "Gider kartı") if e.expense_card_id else ExpenseCard(name=e.category)
    cp = await _counterparty(db, org_id, e.counterparty_id)
    e.account_id = acc.id
    _post_expense(db, acc, e, card, cp, _not_future(payload.paid_on), current_user)
    await db.commit()
    return _expense_out(e, card.name, cp.name if cp else None, acc.name)


@router.delete("/expenses/{expense_id}")
async def delete_expense(request: Request, expense_id: UUID, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    e = await _owned(db, Expense, org_id, expense_id, "Gider", lock=True)
    removed = await ledger.remove_source(db, org_id, "expense", e.id)
    _audit(db, org_id, current_user, "gider_sil", {"category": e.category, "amount_cents": e.amount_cents, "ledger_removed": removed})
    await db.delete(e)
    await db.commit()
    return {"deleted": True}


# --- Counterparties ------------------------------------------------------------------------

class CounterpartyIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    kind: Literal["supplier", "customer", "staff", "partner", "other"] = "supplier"
    tax_no: Optional[str] = Field(default=None, max_length=20)
    tax_office: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=32)
    email: Optional[EmailStr] = None
    iban: Optional[str] = Field(default=None, max_length=40)
    address: Optional[str] = Field(default=None, max_length=1000)
    note: Optional[str] = Field(default=None, max_length=2000)
    is_active: bool = True

    clean_text = field_validator("name", "tax_office", "address", "note", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("email", "tax_no", "phone", "iban", mode="before")(lambda cls, v: v or None)


def _cp_out(c: Counterparty) -> dict:
    return {"id": str(c.id), "name": c.name, "kind": c.kind, "kind_label": COUNTERPARTY_KINDS.get(c.kind, c.kind),
            "tax_no": c.tax_no, "tax_office": c.tax_office, "phone": c.phone, "email": c.email, "iban": c.iban,
            "address": c.address, "note": c.note, "is_active": c.is_active}


@router.get("/counterparties")
async def list_counterparties(request: Request, q: Optional[str] = Query(default=None, max_length=100),
                              db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    query = select(Counterparty).where(Counterparty.organization_id == org_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Counterparty.name.ilike(like), Counterparty.tax_no.ilike(like), Counterparty.phone.ilike(like)))
    rows = (await db.execute(query.order_by(Counterparty.name).limit(2000))).scalars().all()
    unpaid = dict((await db.execute(
        select(Expense.counterparty_id, func.sum(Expense.amount_cents))
        .where(Expense.organization_id == org_id, Expense.account_id.is_(None), Expense.counterparty_id.isnot(None),
               Expense.currency == "TRY")
        .group_by(Expense.counterparty_id))).all())
    return [_cp_out(c) | {"unpaid_cents": int(unpaid.get(c.id, 0))} for c in rows]


@router.post("/counterparties", status_code=status.HTTP_201_CREATED)
async def create_counterparty(request: Request, payload: CounterpartyIn, db: AsyncSession = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    cp = Counterparty(organization_id=_org_id(request), **payload.model_dump(mode="json"))
    db.add(cp)
    await db.commit()
    return _cp_out(cp)


@router.put("/counterparties/{cp_id}")
async def update_counterparty(request: Request, cp_id: UUID, payload: CounterpartyIn, db: AsyncSession = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    cp = await _owned(db, Counterparty, _org_id(request), cp_id, "Cari kart")
    for key, value in payload.model_dump(mode="json").items():
        setattr(cp, key, value)
    await db.commit()
    return _cp_out(cp)


@router.get("/counterparties/{cp_id}/statement")
async def counterparty_statement(request: Request, cp_id: UUID, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    """Cari ekstre: giderler (borç), ödemeler / tahsilatlar (hareket defteri) ve çek-senetler."""
    org_id = _org_id(request)
    cp = await _owned(db, Counterparty, org_id, cp_id, "Cari kart")
    expenses = await list_expenses(request, None, None, None, cp.id, False, db, current_user)
    moves = (await db.execute(
        select(LedgerEntry, FinanceAccount.name, FinanceAccount.currency).join(FinanceAccount, FinanceAccount.id == LedgerEntry.account_id)
        .where(LedgerEntry.counterparty_id == cp.id).order_by(LedgerEntry.entry_date.desc()).limit(2000))).all()
    cheques = (await db.execute(select(Cheque).where(Cheque.counterparty_id == cp.id).order_by(Cheque.due_date.desc()))).scalars().all()
    return {
        "counterparty": _cp_out(cp),
        "unpaid_cents": sum(e["amount_cents"] for e in expenses if not e["paid"] and e["currency"] == "TRY"),
        "expenses": expenses,
        "movements": [{"id": str(e.id), "entry_date": e.entry_date, "direction": e.direction, "amount_cents": e.amount_cents,
                       "currency": cur, "account": name, "category": e.category, "description": e.description}
                      for e, name, cur in moves],
        "cheques": [_cheque_out(c) for c in cheques],
    }


# --- Cheques / promissory notes ------------------------------------------------------------

class ChequeIn(BaseModel):
    kind: Literal["cheque", "note"] = "cheque"
    direction: Literal["received", "issued"] = "received"
    number: str = Field(min_length=1, max_length=40)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    drawer: Optional[str] = Field(default=None, max_length=200)
    counterparty_id: Optional[UUID] = None
    amount_cents: int = Field(gt=0, le=10_000_000_000)
    currency: Currency = "TRY"
    issue_date: Optional[date] = None
    due_date: date
    note: Optional[str] = Field(default=None, max_length=1000)

    clean_text = field_validator("number", "bank_name", "drawer", "note", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("counterparty_id", "issue_date", mode="before")(lambda cls, v: v or None)


def _cheque_out(c: Cheque, cp: Optional[str] = None) -> dict:
    today = _today()
    open_ = c.status in ("portfolio", "deposited")
    return {
        "id": str(c.id), "kind": c.kind, "kind_label": "Çek" if c.kind == "cheque" else "Senet", "direction": c.direction,
        "direction_label": "Alınan" if c.direction == "received" else "Verilen", "number": c.number, "bank_name": c.bank_name,
        "drawer": c.drawer, "counterparty_id": str(c.counterparty_id) if c.counterparty_id else None, "counterparty": cp,
        "amount_cents": c.amount_cents, "currency": c.currency, "issue_date": c.issue_date, "due_date": c.due_date,
        "status": c.status, "status_label": CHEQUE_STATUSES.get(c.status, c.status),
        "days_to_due": (c.due_date - today).days if open_ else None, "overdue": open_ and c.due_date < today,
        "account_id": str(c.account_id) if c.account_id else None, "note": c.note, "history": c.history or [],
        "endorsed_to_id": str(c.endorsed_to_id) if c.endorsed_to_id else None,
    }


@router.get("/cheques")
async def list_cheques(
    request: Request, direction: Optional[Literal["received", "issued"]] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"), due_within_days: Optional[int] = Query(default=None, ge=0, le=3650),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    query = (select(Cheque, Counterparty.name).outerjoin(Counterparty, Counterparty.id == Cheque.counterparty_id)
             .where(Cheque.organization_id == org_id))
    if direction:
        query = query.where(Cheque.direction == direction)
    if status_filter == "open":
        query = query.where(Cheque.status.in_(("portfolio", "deposited")))
    elif status_filter in CHEQUE_STATUSES:
        query = query.where(Cheque.status == status_filter)
    if due_within_days is not None:
        query = query.where(Cheque.due_date <= _today() + timedelta(days=due_within_days))
    rows = (await db.execute(query.order_by(Cheque.due_date).limit(5000))).all()
    return [_cheque_out(c, cp) for c, cp in rows]


@router.post("/cheques", status_code=status.HTTP_201_CREATED)
async def create_cheque(request: Request, payload: ChequeIn, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    cp = await _counterparty(db, org_id, payload.counterparty_id)
    c = Cheque(organization_id=org_id, status="portfolio", history=[{
        "status": "portfolio", "at": datetime.now(timezone.utc).isoformat(), "by": str(current_user.id)}], **payload.model_dump())
    db.add(c)
    _audit(db, org_id, current_user, "cek_senet_ekle", {"number": c.number, "direction": c.direction, "amount_cents": c.amount_cents})
    await db.commit()
    return _cheque_out(c, cp.name if cp else None)


# Alınan: portföy -> bankaya verildi -> tahsil; portföy -> ciro / tahsil (elden); açıkken -> karşılıksız; iptal
# Verilen: portföy (ödenecek) -> ödendi; iptal. Tahsil / ödeme hesaba işlenir; karşılıksız tahsil kaydını geri alır.
TRANSITIONS = {
    "received": {"portfolio": {"deposited", "collected", "endorsed", "bounced", "cancelled"},
                 "deposited": {"collected", "bounced", "portfolio"},
                 "collected": {"bounced"}, "endorsed": {"bounced"}},
    "issued": {"portfolio": {"paid", "cancelled"}, "paid": {"bounced"}},
}


class ChequeStatusIn(BaseModel):
    status: Literal["portfolio", "deposited", "collected", "endorsed", "bounced", "paid", "cancelled"]
    account_id: Optional[UUID] = None
    on: Optional[date] = None
    counterparty_id: Optional[UUID] = None  # ciro edilen cari
    note: Optional[str] = Field(default=None, max_length=300)

    clean_text = field_validator("note", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("account_id", "counterparty_id", mode="before")(lambda cls, v: v or None)


@router.post("/cheques/{cheque_id}/status")
async def change_cheque_status(request: Request, cheque_id: UUID, payload: ChequeStatusIn, db: AsyncSession = Depends(get_db),
                               current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    c = await _owned(db, Cheque, org_id, cheque_id, "Çek / senet", lock=True)
    allowed = TRANSITIONS[c.direction].get(c.status, set())
    if payload.status not in allowed:
        raise HTTPException(status_code=409, detail=f"{CHEQUE_STATUSES[c.status]} durumundan {CHEQUE_STATUSES[payload.status]} durumuna geçilemez")
    day = _not_future(payload.on)
    label = f"{'Çek' if c.kind == 'cheque' else 'Senet'} {c.number}"
    if payload.status in ("collected", "paid"):
        account_id = payload.account_id or c.account_id
        if not account_id:
            raise HTTPException(status_code=422, detail="Tahsil / ödeme için hesap seçin")
        acc = await ledger.account(db, org_id, account_id, currency=c.currency)
        c.account_id = acc.id
        ledger.post(db, acc, direction="in" if payload.status == "collected" else "out", amount_cents=c.amount_cents,
                    entry_date=day, category="Çek / senet tahsili" if payload.status == "collected" else "Çek / senet ödemesi",
                    description=label, source_type="cheque", source_id=c.id, counterparty_id=c.counterparty_id, user_id=current_user.id)
    elif payload.status == "deposited" and payload.account_id:
        c.account_id = (await ledger.account(db, org_id, payload.account_id, currency=c.currency)).id
    elif payload.status == "endorsed":
        if not payload.counterparty_id:
            raise HTTPException(status_code=422, detail="Ciro edilen cariyi seçin")
        c.endorsed_to_id = (await _counterparty(db, org_id, payload.counterparty_id)).id
    if payload.status == "bounced" or (payload.status == "portfolio" and c.status == "deposited"):
        await ledger.remove_source(db, org_id, "cheque", c.id)
    c.history = [*(c.history or []), {
        "from": c.status, "status": payload.status, "on": day.isoformat(), "note": payload.note,
        "counterparty_id": str(payload.counterparty_id) if payload.counterparty_id else None,
        "at": datetime.now(timezone.utc).isoformat(), "by": str(current_user.id),
    }]
    c.status = payload.status
    _audit(db, org_id, current_user, "cek_senet_durum", {"number": c.number, "status": c.status})
    await db.commit()
    return _cheque_out(c)


# --- Employees, advances, payroll ----------------------------------------------------------

class EmployeeIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    title: Optional[str] = Field(default=None, max_length=120)
    national_id: Optional[str] = Field(default=None, pattern=r"^\d{11}$")
    iban: Optional[str] = Field(default=None, max_length=40)
    phone: Optional[str] = Field(default=None, max_length=32)
    monthly_salary_cents: int = Field(default=0, ge=0, le=1_000_000_000)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_active: bool = True
    user_id: Optional[UUID] = None
    note: Optional[str] = Field(default=None, max_length=1000)

    clean_text = field_validator("full_name", "title", "note", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("national_id", "iban", "phone", "start_date", "end_date", "user_id", mode="before")(
        lambda cls, v: v or None)


def _employee_out(e: Employee, open_advance: int = 0) -> dict:
    return {"id": str(e.id), "full_name": e.full_name, "title": e.title,
            "national_id_masked": f"{e.national_id[:3]}******{e.national_id[-2:]}" if e.national_id else None,
            "iban": e.iban, "phone": e.phone, "monthly_salary_cents": e.monthly_salary_cents, "start_date": e.start_date,
            "end_date": e.end_date, "is_active": e.is_active, "user_id": str(e.user_id) if e.user_id else None, "note": e.note,
            "open_advance_cents": open_advance}


@router.get("/employees")
async def list_employees(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    rows = (await db.execute(select(Employee).where(Employee.organization_id == org_id)
                             .order_by(Employee.is_active.desc(), Employee.full_name))).scalars().all()
    advances = dict((await db.execute(select(SalaryAdvance.employee_id, func.sum(SalaryAdvance.amount_cents)).where(
        SalaryAdvance.organization_id == org_id, SalaryAdvance.payroll_item_id.is_(None)).group_by(SalaryAdvance.employee_id))).all())
    return [_employee_out(e, int(advances.get(e.id, 0))) for e in rows]


@router.post("/employees", status_code=status.HTTP_201_CREATED)
async def create_employee(request: Request, payload: EmployeeIn, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    if payload.user_id:
        await _owned(db, User, org_id, payload.user_id, "Kullanıcı")
    e = Employee(organization_id=org_id, **payload.model_dump())
    db.add(e)
    await db.commit()
    return _employee_out(e)


@router.put("/employees/{employee_id}")
async def update_employee(request: Request, employee_id: UUID, payload: EmployeeIn, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    e = await _owned(db, Employee, org_id, employee_id, "Personel")
    data = payload.model_dump()
    if not data["national_id"]:
        data.pop("national_id")  # maskeli alan boş bırakılırsa kayıtlı numara korunur
    for key, value in data.items():
        setattr(e, key, value)
    await db.commit()
    return _employee_out(e)


class AdvanceIn(BaseModel):
    employee_id: UUID
    amount_cents: int = Field(gt=0, le=1_000_000_000)
    given_on: Optional[date] = None
    account_id: UUID
    note: Optional[str] = Field(default=None, max_length=300)

    clean_text = field_validator("note", mode="before")(lambda cls, v: _clean(v))


@router.post("/advances", status_code=status.HTTP_201_CREATED)
async def give_advance(request: Request, payload: AdvanceIn, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Personele avans: hesaptan çıkar, bir sonraki maaştan otomatik düşülür."""
    org_id = _org_id(request)
    e = await _owned(db, Employee, org_id, payload.employee_id, "Personel")
    acc = await ledger.account(db, org_id, payload.account_id, currency="TRY")
    day = _not_future(payload.given_on)
    adv = SalaryAdvance(organization_id=org_id, employee_id=e.id, amount_cents=payload.amount_cents, given_on=day,
                        account_id=acc.id, note=payload.note)
    db.add(adv)
    await db.flush()
    ledger.post(db, acc, direction="out", amount_cents=adv.amount_cents, entry_date=day, category="Personel avansı",
                description=e.full_name, source_type="advance", source_id=adv.id, user_id=current_user.id)
    _audit(db, org_id, current_user, "avans_ver", {"employee": e.full_name, "amount_cents": adv.amount_cents})
    await db.commit()
    return {"id": str(adv.id)}


def _payroll_out(p: PayrollItem, e: Employee) -> dict:
    return {"id": str(p.id), "employee_id": str(e.id), "full_name": e.full_name, "title": e.title, "iban": e.iban,
            "period": p.period, "salary_cents": p.salary_cents, "overtime_cents": p.overtime_cents, "bonus_cents": p.bonus_cents,
            "deduction_cents": p.deduction_cents, "advance_cents": p.advance_cents, "net_cents": p.net_cents,
            "status": p.status, "paid_on": p.paid_on, "account_id": str(p.account_id) if p.account_id else None, "note": p.note}


class PayrollGenerateIn(BaseModel):
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")


@router.post("/payroll/generate")
async def generate_payroll(request: Request, payload: PayrollGenerateIn, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(get_current_user)):
    """Aktif personele dönem bordrosu açar; açık avanslar bu bordrodan mahsup edilir. Tekrar çalıştırmak güvenlidir."""
    org_id = _org_id(request)
    employees = (await db.execute(select(Employee).where(Employee.organization_id == org_id, Employee.is_active.is_(True)))).scalars().all()
    existing = set((await db.execute(select(PayrollItem.employee_id).where(
        PayrollItem.organization_id == org_id, PayrollItem.period == payload.period))).scalars().all())
    created = 0
    for e in employees:
        if e.id in existing:
            continue
        item = PayrollItem(organization_id=org_id, employee_id=e.id, period=payload.period, salary_cents=e.monthly_salary_cents,
                           overtime_cents=0, bonus_cents=0, deduction_cents=0, advance_cents=0, status="draft")
        db.add(item)
        await db.flush()
        advances = (await db.execute(select(SalaryAdvance).where(
            SalaryAdvance.employee_id == e.id, SalaryAdvance.payroll_item_id.is_(None)).with_for_update())).scalars().all()
        for adv in advances:
            adv.payroll_item_id = item.id
            item.advance_cents += adv.amount_cents
        created += 1
    _audit(db, org_id, current_user, "bordro_ac", {"period": payload.period, "created": created})
    await db.commit()
    return {"period": payload.period, "created": created, "already_had": len(existing)}


@router.get("/payroll")
async def list_payroll(request: Request, period: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
                       db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    rows = (await db.execute(select(PayrollItem, Employee).join(Employee, Employee.id == PayrollItem.employee_id)
                             .where(PayrollItem.organization_id == org_id, PayrollItem.period == period)
                             .order_by(Employee.full_name))).all()
    items = [_payroll_out(p, e) for p, e in rows]
    return {"period": period, "items": items, "total_net_cents": sum(i["net_cents"] for i in items),
            "unpaid_net_cents": sum(i["net_cents"] for i in items if i["status"] == "draft")}


class PayrollItemIn(BaseModel):
    salary_cents: int = Field(ge=0, le=1_000_000_000)
    overtime_cents: int = Field(default=0, ge=0, le=1_000_000_000)
    bonus_cents: int = Field(default=0, ge=0, le=1_000_000_000)
    deduction_cents: int = Field(default=0, ge=0, le=1_000_000_000)
    note: Optional[str] = Field(default=None, max_length=300)

    clean_text = field_validator("note", mode="before")(lambda cls, v: _clean(v))


@router.put("/payroll/{item_id}")
async def update_payroll_item(request: Request, item_id: UUID, payload: PayrollItemIn, db: AsyncSession = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    p = await _owned(db, PayrollItem, org_id, item_id, "Bordro satırı", lock=True)
    if p.status != "draft":
        raise HTTPException(status_code=409, detail="Ödenmiş bordro değiştirilemez")
    net = payload.salary_cents + payload.overtime_cents + payload.bonus_cents - payload.deduction_cents - p.advance_cents
    if net < 0:
        raise HTTPException(status_code=422, detail="Net ödeme eksi olamaz; kesinti veya avansı azaltın")
    for key, value in payload.model_dump().items():
        setattr(p, key, value)
    e = await _owned(db, Employee, org_id, p.employee_id, "Personel")
    await db.commit()
    return _payroll_out(p, e)


@router.delete("/payroll/{item_id}")
async def delete_payroll_item(request: Request, item_id: UUID, db: AsyncSession = Depends(get_db),
                              current_user: User = Depends(get_current_user)):
    """Taslak bordro satırını siler; mahsup edilen avanslar yeniden açık olur."""
    org_id = _org_id(request)
    p = await _owned(db, PayrollItem, org_id, item_id, "Bordro satırı", lock=True)
    if p.status != "draft":
        raise HTTPException(status_code=409, detail="Ödenmiş bordro silinemez")
    for adv in (await db.execute(select(SalaryAdvance).where(SalaryAdvance.payroll_item_id == p.id))).scalars().all():
        adv.payroll_item_id = None
    await db.delete(p)
    await db.commit()
    return {"deleted": True}


class PayrollPayIn(BaseModel):
    item_ids: List[UUID] = Field(min_length=1, max_length=1000)
    account_id: UUID
    paid_on: Optional[date] = None


@router.post("/payroll/pay")
async def pay_payroll(request: Request, payload: PayrollPayIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Seçili taslak bordroları öder: her personel için net tutar hesaptan çıkar."""
    org_id = _org_id(request)
    acc = await ledger.account(db, org_id, payload.account_id, currency="TRY")
    day = _not_future(payload.paid_on)
    rows = (await db.execute(select(PayrollItem, Employee).join(Employee, Employee.id == PayrollItem.employee_id).where(
        PayrollItem.organization_id == org_id, PayrollItem.id.in_(payload.item_ids)).with_for_update(of=PayrollItem))).all()
    if len(rows) != len(set(payload.item_ids)):
        raise HTTPException(status_code=404, detail="Bordro satırlarından bazıları bulunamadı")
    if any(p.status != "draft" for p, _ in rows):
        raise HTTPException(status_code=409, detail="Seçilenlerden bazıları zaten ödenmiş")
    total = 0
    for p, e in rows:
        if p.net_cents > 0:
            ledger.post(db, acc, direction="out", amount_cents=p.net_cents, entry_date=day, category="Personel maaşı",
                        description=f"{e.full_name} · {p.period}", source_type="payroll", source_id=p.id, user_id=current_user.id)
        p.status, p.paid_on, p.account_id = "paid", day, acc.id
        total += p.net_cents
    _audit(db, org_id, current_user, "maas_ode", {"count": len(rows), "total_cents": total, "account": acc.name})
    await db.commit()
    return {"paid": len(rows), "total_cents": total}


# --- Summary -------------------------------------------------------------------------------

@router.get("/summary")
async def accounting_summary(request: Request, start: Optional[date] = None, end: Optional[date] = None,
                             db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Hesap bakiyeleri, dönem gelir-gider kırılımı (TL), yaklaşan çek-senet, ödenmemiş gider ve maaş."""
    org_id = _org_id(request)
    end = end or _today()
    start = start or end.replace(day=1)
    accounts = await list_accounts(request, db, current_user)
    by_category = (await db.execute(
        select(LedgerEntry.direction, LedgerEntry.category, func.sum(LedgerEntry.amount_cents))
        .join(FinanceAccount, FinanceAccount.id == LedgerEntry.account_id)
        .where(LedgerEntry.organization_id == org_id, LedgerEntry.entry_date >= start, LedgerEntry.entry_date <= end,
               FinanceAccount.currency == "TRY", LedgerEntry.source_type != "transfer")
        .group_by(LedgerEntry.direction, LedgerEntry.category).order_by(func.sum(LedgerEntry.amount_cents).desc())
    )).all()
    income = [{"category": c, "total_cents": int(t)} for d, c, t in by_category if d == "in"]
    expense = [{"category": c, "total_cents": int(t)} for d, c, t in by_category if d == "out"]
    upcoming = await list_cheques(request, None, "open", 30, db, current_user)
    unpaid_expenses = (await db.execute(select(func.coalesce(func.sum(Expense.amount_cents), 0)).where(
        Expense.organization_id == org_id, Expense.account_id.is_(None), Expense.currency == "TRY",
        Expense.expense_card_id.isnot(None)))).scalar_one()
    draft_payroll = (await db.execute(select(PayrollItem).where(
        PayrollItem.organization_id == org_id, PayrollItem.status == "draft"))).scalars().all()
    by_cur_rows = (await db.execute(
        select(FinanceAccount.currency, LedgerEntry.direction, func.sum(LedgerEntry.amount_cents))
        .join(FinanceAccount, FinanceAccount.id == LedgerEntry.account_id)
        .where(LedgerEntry.organization_id == org_id, LedgerEntry.entry_date >= start, LedgerEntry.entry_date <= end,
               LedgerEntry.source_type != "transfer")
        .group_by(FinanceAccount.currency, LedgerEntry.direction)
    )).all()
    income_by_currency = {cur: int(t) for cur, d, t in by_cur_rows if d == "in"}
    expense_by_currency = {cur: int(t) for cur, d, t in by_cur_rows if d == "out"}
    return {
        "start": start, "end": end, "accounts": accounts,
        "totals_by_currency": {cur: sum(a["balance_cents"] for a in accounts if a["currency"] == cur and a["is_active"])
                               for cur in sorted({a["currency"] for a in accounts})},
        "income": income, "expense": expense,
        "income_by_currency": income_by_currency,
        "expense_by_currency": expense_by_currency,
        "income_cents": sum(i["total_cents"] for i in income), "expense_cents": sum(i["total_cents"] for i in expense),
        "upcoming_cheques": upcoming,
        "unpaid_expense_cents": int(unpaid_expenses),
        "draft_payroll_cents": sum(p.net_cents for p in draft_payroll),
    }
