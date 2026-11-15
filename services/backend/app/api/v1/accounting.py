"""Muhasebe (İleri paket): kasa / banka / POS hesapları, hareket defteri ve virman, gider kartları ve
giderler, cari kartlar, çek-senet, personel maaş ve avans.

Para hareketi yaratan her işlem (gider ödemesi, çek tahsili, maaş, avans, virman, elle hareket)
hareket defterine (ledger_entries) yazılır; işlem geri alınınca kaynağına bağlı hareket de silinir.
Onaylı bağışlar donation_hooks üzerinden, ödeme yöntemine göre varsayılan hesaba otomatik işlenir.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, List, Literal, Optional
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


def _account_out(a: FinanceAccount, balance: int, bank_acc=None) -> dict:
    from app.banking import CONNECTORS
    cls = CONNECTORS.get(bank_acc.bank_key) if bank_acc else None
    return {
        "id": str(a.id), "name": a.name, "kind": a.kind, "kind_label": ACCOUNT_KINDS.get(a.kind, a.kind), "currency": a.currency,
        "bank_name": a.bank_name or (cls.label if cls else None), "iban": a.iban or (bank_acc.iban if bank_acc else None),
        "opening_balance_cents": a.opening_balance_cents, "opening_date": a.opening_date,
        "default_for": a.default_for, "is_active": a.is_active, "balance_cents": balance,
        "bank_account_id": str(bank_acc.id) if bank_acc else None,
        "bank_key": bank_acc.bank_key if bank_acc else None,
        "account_no": bank_acc.account_no if bank_acc else None,
        "auto_approve": bank_acc.auto_approve if bank_acc else False,
        "default_campaign_id": str(bank_acc.default_campaign_id) if (bank_acc and bank_acc.default_campaign_id) else None,
        "last_synced_at": bank_acc.last_synced_at if bank_acc else None,
        "last_error": bank_acc.last_error if bank_acc else None,
        "ready": bool(cls and cls.ready) if bank_acc else False,
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
    from app.models.automation import BankAccount
    org_id = _org_id(request)
    await ledger.sync_organization_finance(db, org_id)
    rows = (await db.execute(select(FinanceAccount).where(FinanceAccount.organization_id == org_id)
                             .order_by(FinanceAccount.is_active.desc(), FinanceAccount.kind, FinanceAccount.name))).scalars().all()
    bank_rows = (await db.execute(select(BankAccount).where(BankAccount.organization_id == org_id))).scalars().all()
    by_iban = {"".join((b.iban or "").split()).upper(): b for b in bank_rows if b.iban}
    by_label = {(b.label or "").strip().lower(): b for b in bank_rows if b.label}
    bal = await ledger.balances(db, org_id)
    out = []
    for a in rows:
        clean_iban = "".join((a.iban or "").split()).upper()
        matched_ba = (by_iban.get(clean_iban) if clean_iban else None) or (by_label.get(a.name.strip().lower()) if a.kind == "bank" else None)
        out.append(_account_out(a, bal.get(a.id, a.opening_balance_cents), matched_ba))
    return out


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


@router.delete("/accounts/{account_id}")
async def delete_finance_account(request: Request, account_id: UUID, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    acc = await _owned(db, FinanceAccount, org_id, account_id, "Hesap", lock=True)
    has_entry = (await db.execute(select(LedgerEntry.id).where(LedgerEntry.account_id == acc.id).limit(1))).first()
    if has_entry:
        acc.is_active = False
        _audit(db, org_id, current_user, "hesap_pasife_al", {"name": acc.name})
        await db.commit()
        return {"deleted": False, "deactivated": True, "detail": "Hareketi olan hesap silinmedi, pasife alındı"}
    _audit(db, org_id, current_user, "hesap_sil", {"name": acc.name})
    await db.delete(acc)
    await db.commit()
    return {"deleted": True, "deactivated": False}


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
async def list_counterparties(request: Request, q: Annotated[Optional[str], Query(max_length=100)] = None,
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
    status_filter: Annotated[Optional[str], Query(alias="status")] = None, due_within_days: Annotated[Optional[int], Query(ge=0, le=3650)] = None,
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


# --- Ön Muhasebe: Görünüm Tercihleri (Sıralama, Renkler, Varsayılan Dönem) -----------------

class FinancePreferencesIn(BaseModel):
    kasa_sirasi: Optional[List[str]] = None
    banka_sirasi: Optional[List[str]] = None
    hesap_renkleri: Optional[dict[str, int]] = None
    varsayilan_donem: Optional[Literal["aylik", "yillik"]] = None
    ozel_kategoriler: Optional[List[dict]] = None


@router.get("/preferences")
async def get_finance_preferences(request: Request, db: AsyncSession = Depends(get_db),
                                  current_user: User = Depends(get_current_user)):
    from app.models.organization import Organization
    org = await db.get(Organization, _org_id(request))
    settings = (org.settings if org and isinstance(org.settings, dict) else {}) or {}
    prefs = settings.get("finance_preferences") or {}
    return {
        "kasa_sirasi": prefs.get("kasa_sirasi") or [],
        "banka_sirasi": prefs.get("banka_sirasi") or [],
        "hesap_renkleri": prefs.get("hesap_renkleri") or {},
        "varsayilan_donem": prefs.get("varsayilan_donem") or "yillik",
        "ozel_kategoriler": prefs.get("ozel_kategoriler") or [],
    }


@router.put("/preferences")
async def save_finance_preferences(request: Request, payload: FinancePreferencesIn,
                                   db: AsyncSession = Depends(get_db),
                                   current_user: User = Depends(get_current_user)):
    from sqlalchemy.orm.attributes import flag_modified
    from app.models.organization import Organization

    org = await db.get(Organization, _org_id(request))
    if not org:
        raise HTTPException(status_code=404, detail="Kurum bulunamadı")
    settings = dict(org.settings or {})
    prefs = dict(settings.get("finance_preferences") or {})
    if payload.kasa_sirasi is not None:
        prefs["kasa_sirasi"] = [str(x) for x in payload.kasa_sirasi[:200]]
    if payload.banka_sirasi is not None:
        prefs["banka_sirasi"] = [str(x) for x in payload.banka_sirasi[:200]]
    if payload.hesap_renkleri is not None:
        prefs["hesap_renkleri"] = {str(k): int(v) for k, v in payload.hesap_renkleri.items() if isinstance(v, int)}
    if payload.varsayilan_donem is not None:
        prefs["varsayilan_donem"] = payload.varsayilan_donem
    if payload.ozel_kategoriler is not None:
        cleaned_cats = []
        for c in payload.ozel_kategoriler[:200]:
            if isinstance(c, dict) and c.get("ad"):
                cleaned_cats.append({
                    "id": str(c.get("id") or uuid4()),
                    "tur": "GELIR" if c.get("tur") == "GELIR" else "GIDER",
                    "ad": str(c.get("ad")).strip()[:80],
                })
        prefs["ozel_kategoriler"] = cleaned_cats
    settings["finance_preferences"] = prefs
    org.settings = settings
    flag_modified(org, "settings")
    await db.commit()
    return prefs


# --- Ön Muhasebe: Birleşik Gelir/Gider Listesi & İşlemleri (e-Medrese Uyumlu) --------------

def _infer_odeme_yontemi(account_kind: Optional[str], donation_method: Optional[str] = None) -> str:
    if donation_method:
        m = str(donation_method).lower()
        if "cash" in m:
            return "NAKIT"
        if "bank" in m:
            return "BANKA"
        if "card" in m or "credit" in m:
            return "KREDI_KARTI"
    if account_kind == "cash":
        return "NAKIT"
    if account_kind == "bank":
        return "BANKA"
    if account_kind == "pos":
        return "KREDI_KARTI"
    return "DIGER"


ODEME_YONTEMI_LABELS = {
    "NAKIT": "Nakit",
    "BANKA": "Banka / Havale",
    "KREDI_KARTI": "Kredi Kartı",
    "POS": "POS",
    "DIGER": "Diğer",
}


@router.get("/gelir-gider")
async def list_gelir_gider(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    islem_tipi: Optional[Literal["GELIR", "GIDER"]] = None,
    kategori: Optional[str] = None,
    account_id: Optional[UUID] = None,
    odeme_yontemi: Optional[str] = None,
    q: Optional[str] = None,
    min_cents: Optional[int] = None,
    max_cents: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """e-Medrese Ön Muhasebe Gelir/Gider birleşik akışı ve istatistik özeti."""
    from app.models.campaign import Campaign
    from app.models.donation import Donation, Donor

    org_id = _org_id(request)
    await ledger.sync_organization_finance(db, org_id)

    # 1. Tüm hesapları yükle
    acc_rows = (await db.execute(select(FinanceAccount).where(FinanceAccount.organization_id == org_id))).scalars().all()
    acc_map = {a.id: a for a in acc_rows}

    # 2. Cari kartları yükle
    cp_rows = (await db.execute(select(Counterparty).where(Counterparty.organization_id == org_id))).scalars().all()
    cp_map = {c.id: c.name for c in cp_rows}

    # 3. Düzeltme geçmişini (AuditLog) yükle
    audit_rows = (await db.execute(
        select(AuditLog, User.full_name, User.email)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(AuditLog.organization_id == org_id, AuditLog.action == "gelir_gider_duzenle")
        .order_by(AuditLog.created_at.desc())
        .limit(1000)
    )).all()
    revisions_by_item: dict[str, list[dict]] = {}
    for log, u_name, u_email in audit_rows:
        det = log.details or {}
        item_key = str(det.get("item_id") or "")
        if item_key:
            revisions_by_item.setdefault(item_key, []).append({
                "id": str(log.id),
                "tarih": log.created_at.isoformat() if log.created_at else None,
                "kullanici": u_name or u_email or "Yetkili",
                "degisiklikler": det.get("changes") or {},
            })

    # 4. LedgerEntry sorgusu (virmanlar hariç tüm giriş/çıkışlar)
    l_query = select(LedgerEntry).where(
        LedgerEntry.organization_id == org_id,
        LedgerEntry.source_type != "transfer",
    )
    if start:
        l_query = l_query.where(LedgerEntry.entry_date >= start)
    if end:
        l_query = l_query.where(LedgerEntry.entry_date <= end)
    l_entries = (await db.execute(l_query.order_by(LedgerEntry.entry_date.desc(), LedgerEntry.created_at.desc()).limit(5000))).scalars().all()

    # Bağlı bağış ve gider detaylarını tek seferde çek
    donation_ids = {e.source_id for e in l_entries if e.source_type == "donation" and e.source_id}
    expense_ids = {e.source_id for e in l_entries if e.source_type == "expense" and e.source_id}

    don_map: dict[UUID, tuple[Donation, Optional[str], Optional[str]]] = {}
    if donation_ids:
        d_rows = (await db.execute(
            select(Donation, Donor.first_name, Donor.last_name, Donor.company_name, Campaign.title)
            .outerjoin(Donor, Donor.id == Donation.donor_id)
            .outerjoin(Campaign, Campaign.id == Donation.campaign_id)
            .where(Donation.id.in_(donation_ids))
        )).all()
        for d, fn, ln, comp, camp_title in d_rows:
            donor_name = comp or f"{fn or ''} {ln or ''}".strip() or d.on_behalf_of or "Hayırsever"
            don_map[d.id] = (d, donor_name, camp_title)

    exp_map: dict[UUID, Expense] = {}
    if expense_ids:
        e_rows = (await db.execute(select(Expense).where(Expense.id.in_(expense_ids)))).scalars().all()
        exp_map = {e.id: e for e in e_rows}

    items: list[dict] = []
    seen_expense_ids: set[UUID] = set()

    for le in l_entries:
        acc = acc_map.get(le.account_id)
        tip = "GELIR" if le.direction == "in" else "GIDER"
        para_birimi = acc.currency if acc else "TRY"
        kisi_adi = cp_map.get(le.counterparty_id) if le.counterparty_id else None
        kampanya_adi = None
        belge_no = None
        aciklama = le.description
        kat = le.category or ("Gelir" if tip == "GELIR" else "Gider")
        odeme = _infer_odeme_yontemi(acc.kind if acc else None)

        if le.source_type == "donation" and le.source_id in don_map:
            don, donor_name, camp_title = don_map[le.source_id]
            kisi_adi = donor_name
            kampanya_adi = camp_title or "Genel Bağış"
            belge_no = don.official_receipt_no or don.receipt_number
            kat = camp_title or "Bağış"
            odeme = _infer_odeme_yontemi(acc.kind if acc else None, getattr(don.payment_method, "value", don.payment_method))
            if don.donor_message:
                aciklama = f"{aciklama} · {don.donor_message}" if aciklama else don.donor_message
        elif le.source_type == "expense" and le.source_id in exp_map:
            exp = exp_map[le.source_id]
            seen_expense_ids.add(exp.id)
            belge_no = exp.receipt_no or None
            aciklama = exp.description or exp.title or aciklama
            kat = exp.category or kat
            if not kisi_adi and exp.counterparty_id:
                kisi_adi = cp_map.get(exp.counterparty_id)

        item_id_str = str(le.id)
        rev_list = revisions_by_item.get(item_id_str) or (revisions_by_item.get(str(le.source_id)) if le.source_id else []) or []

        items.append({
            "id": item_id_str,
            "source_type": le.source_type,
            "source_id": str(le.source_id) if le.source_id else None,
            "tarih": le.entry_date.isoformat(),
            "olusturma_tarihi": le.created_at.isoformat() if le.created_at else None,
            "islem_tipi": tip,
            "islem_tipi_display": "Gelir" if tip == "GELIR" else "Gider",
            "kategori": kat,
            "kategori_display": kat,
            "miktar_cents": le.amount_cents,
            "miktar": round(le.amount_cents / 100.0, 2),
            "para_birimi": para_birimi,
            "odeme_yontemi": odeme,
            "odeme_yontemi_display": ODEME_YONTEMI_LABELS.get(odeme, odeme),
            "account_id": str(acc.id) if acc else None,
            "account_name": acc.name if acc else None,
            "account_kind": acc.kind if acc else None,
            "kasa_adi": acc.name if (acc and acc.kind == "cash") else None,
            "banka_hesabi_adi": (f"{acc.bank_name} - {acc.name}" if (acc and acc.bank_name and acc.bank_name.lower() not in acc.name.lower()) else (acc.name if acc else None)) if (acc and acc.kind in ("bank", "pos")) else None,
            "kampanya_adi": kampanya_adi,
            "kisi_adi": kisi_adi,
            "counterparty_id": str(le.counterparty_id) if le.counterparty_id else None,
            "belge_no": belge_no,
            "aciklama": aciklama,
            "paid": True,
            "duzeltme_sayisi": len(rev_list),
            "duzeltme_gecmisi": rev_list,
        })

    # 5. Henüz ödenmemiş (borç bekleyen, account_id=None) giderleri de GIDER olarak dahil et
    u_query = select(Expense).where(Expense.organization_id == org_id, Expense.account_id.is_(None))
    if start:
        u_query = u_query.where(Expense.expense_date >= datetime.combine(start, datetime.min.time(), TZ))
    if end:
        u_query = u_query.where(Expense.expense_date < datetime.combine(end + timedelta(days=1), datetime.min.time(), TZ))
    unpaid_exps = (await db.execute(u_query.order_by(Expense.expense_date.desc()))).scalars().all()
    for exp in unpaid_exps:
        if exp.id in seen_expense_ids:
            continue
        exp_day = ledger.local_day(exp.expense_date)
        exp_id_str = str(exp.id)
        rev_list = revisions_by_item.get(exp_id_str) or []
        items.append({
            "id": exp_id_str,
            "source_type": "expense_unpaid",
            "source_id": exp_id_str,
            "tarih": exp_day.isoformat(),
            "olusturma_tarihi": exp.created_at.isoformat() if exp.created_at else None,
            "islem_tipi": "GIDER",
            "islem_tipi_display": "Gider",
            "kategori": exp.category or "Gider",
            "kategori_display": exp.category or "Gider",
            "miktar_cents": exp.amount_cents,
            "miktar": round(exp.amount_cents / 100.0, 2),
            "para_birimi": exp.currency or "TRY",
            "odeme_yontemi": "DIGER",
            "odeme_yontemi_display": "Borç (Ödenmedi)",
            "account_id": None,
            "account_name": None,
            "account_kind": None,
            "kasa_adi": None,
            "banka_hesabi_adi": None,
            "kampanya_adi": "Ödenmemiş Gider",
            "kisi_adi": cp_map.get(exp.counterparty_id) if exp.counterparty_id else None,
            "counterparty_id": str(exp.counterparty_id) if exp.counterparty_id else None,
            "belge_no": exp.receipt_no or None,
            "aciklama": exp.description or exp.title,
            "paid": False,
            "duzeltme_sayisi": len(rev_list),
            "duzeltme_gecmisi": rev_list,
        })

    # 6. Filtreleri uygula
    filtered: list[dict] = []
    q_fold = (q or "").strip().lower()
    for it in items:
        if islem_tipi and it["islem_tipi"] != islem_tipi:
            continue
        if kategori and it["kategori"].lower() != kategori.strip().lower():
            continue
        if account_id and it["account_id"] != str(account_id):
            continue
        if odeme_yontemi and it["odeme_yontemi"] != odeme_yontemi:
            continue
        if min_cents is not None and it["miktar_cents"] < min_cents:
            continue
        if max_cents is not None and it["miktar_cents"] > max_cents:
            continue
        if q_fold:
            haystack = " ".join(str(it.get(k) or "") for k in ("kategori", "aciklama", "kisi_adi", "belge_no", "kampanya_adi", "account_name")).lower()
            if q_fold not in haystack:
                continue
        filtered.append(it)

    filtered.sort(key=lambda x: (x["tarih"], x.get("olusturma_tarihi") or ""), reverse=True)

    # 7. Özet hesaplamaları (TRY ve döviz kırılımlı)
    toplam_gelir_cents = sum(x["miktar_cents"] for x in filtered if x["islem_tipi"] == "GELIR" and x["para_birimi"] == "TRY")
    toplam_gider_cents = sum(x["miktar_cents"] for x in filtered if x["islem_tipi"] == "GIDER" and x["para_birimi"] == "TRY")
    gelir_adedi = sum(1 for x in filtered if x["islem_tipi"] == "GELIR")
    gider_adedi = sum(1 for x in filtered if x["islem_tipi"] == "GIDER")

    doviz_gelir: dict[str, int] = {}
    doviz_gider: dict[str, int] = {}
    kategori_ozet: dict[str, dict[str, int]] = {}
    for x in filtered:
        cur = x["para_birimi"]
        if cur != "TRY":
            if x["islem_tipi"] == "GELIR":
                doviz_gelir[cur] = doviz_gelir.get(cur, 0) + x["miktar_cents"]
            else:
                doviz_gider[cur] = doviz_gider.get(cur, 0) + x["miktar_cents"]
        else:
            k_key = f"{x['islem_tipi']}:{x['kategori']}"
            if k_key not in kategori_ozet:
                kategori_ozet[k_key] = {"tip": x["islem_tipi"], "kategori": x["kategori"], "toplam_cents": 0, "adet": 0}
            kategori_ozet[k_key]["toplam_cents"] += x["miktar_cents"]
            kategori_ozet[k_key]["adet"] += 1

    all_categories = sorted({x["kategori"] for x in items if x.get("kategori")})

    return {
        "items": filtered,
        "summary": {
            "toplam_gelir_cents": toplam_gelir_cents,
            "toplam_gider_cents": toplam_gider_cents,
            "net_cents": toplam_gelir_cents - toplam_gider_cents,
            "gelir_adedi": gelir_adedi,
            "gider_adedi": gider_adedi,
            "toplam_kayit": len(filtered),
            "doviz_gelir": doviz_gelir,
            "doviz_gider": doviz_gider,
            "kategori_dagilimi": list(kategori_ozet.values()),
            "mevcut_kategoriler": all_categories,
        },
    }


class GelirGiderCreateIn(BaseModel):
    islem_tipi: Literal["GELIR", "GIDER"]
    kategori: str = Field(min_length=2, max_length=100)
    amount_cents: int = Field(gt=0, le=10_000_000_000)
    currency: Currency = "TRY"
    tarih: Optional[date] = None
    odeme_yontemi: Optional[str] = None
    account_id: Optional[UUID] = None
    counterparty_id: Optional[UUID] = None
    kisi_adi: Optional[str] = Field(default=None, max_length=200)
    belge_no: Optional[str] = Field(default=None, max_length=100)
    aciklama: Optional[str] = Field(default=None, max_length=1000)

    clean_text = field_validator("kategori", "kisi_adi", "belge_no", "aciklama", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("account_id", "counterparty_id", "kisi_adi", "belge_no", "aciklama", "odeme_yontemi", mode="before")(
        lambda cls, v: v or None)


async def _resolve_or_create_expense_card(db: AsyncSession, org_id: UUID, name: str) -> ExpenseCard:
    clean_name = name.strip()[:120]
    card = (await db.execute(select(ExpenseCard).where(
        ExpenseCard.organization_id == org_id,
        func.lower(ExpenseCard.name) == clean_name.lower(),
    ))).scalars().first()
    if not card:
        card = ExpenseCard(organization_id=org_id, name=clean_name, group="Genel", is_active=True)
        db.add(card)
        await db.flush()
    return card


async def _resolve_or_create_counterparty(db: AsyncSession, org_id: UUID, cp_id: Optional[UUID], kisi_adi: Optional[str], kind: str = "other") -> Optional[Counterparty]:
    if cp_id:
        return await _owned(db, Counterparty, org_id, cp_id, "Cari kart")
    if kisi_adi and kisi_adi.strip():
        clean_name = kisi_adi.strip()[:200]
        cp = (await db.execute(select(Counterparty).where(
            Counterparty.organization_id == org_id,
            func.lower(Counterparty.name) == clean_name.lower(),
        ))).scalars().first()
        if not cp:
            cp = Counterparty(organization_id=org_id, name=clean_name, kind=kind, is_active=True)
            db.add(cp)
            await db.flush()
        return cp
    return None


@router.post("/gelir-gider", status_code=status.HTTP_201_CREATED)
async def create_gelir_gider(
    request: Request,
    payload: GelirGiderCreateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """e-Medrese '+ Gelir Ekle' ve '+ Gider Ekle' modalları için birleşik kayıt oluşturucu."""
    org_id = _org_id(request)
    day = _not_future(payload.tarih)
    cp = await _resolve_or_create_counterparty(
        db, org_id, payload.counterparty_id, payload.kisi_adi,
        kind="customer" if payload.islem_tipi == "GELIR" else "supplier",
    )

    if payload.islem_tipi == "GELIR":
        if payload.account_id:
            acc = await ledger.account(db, org_id, payload.account_id, currency=payload.currency)
        else:
            # 'Diğer' ödeme yönteminde veya hesap seçilmediğinde varsayılan kasayı kullan
            acc = (await db.execute(select(FinanceAccount).where(
                FinanceAccount.organization_id == org_id,
                FinanceAccount.currency == payload.currency,
                FinanceAccount.is_active.is_(True),
            ).order_by(FinanceAccount.created_at))).scalars().first()
            if not acc:
                acc = FinanceAccount(
                    organization_id=org_id, name=f"Merkez Kasa ({payload.currency})",
                    kind="cash", currency=payload.currency, is_active=True,
                )
                db.add(acc)
                await db.flush()
        desc_parts = [p for p in (payload.aciklama, f"Belge: {payload.belge_no}" if payload.belge_no else None) if p]
        desc = " · ".join(desc_parts)[:500] if desc_parts else None
        entry = ledger.post(
            db, acc, direction="in", amount_cents=payload.amount_cents,
            entry_date=day, category=payload.kategori[:60], description=desc,
            source_type="manual", counterparty_id=cp.id if cp else None, user_id=current_user.id,
        )
        _audit(db, org_id, current_user, "gelir_ekle", {
            "category": payload.kategori, "amount_cents": payload.amount_cents, "account": acc.name
        })
        await db.commit()
        return {"id": str(entry.id), "islem_tipi": "GELIR"}

    # GIDER
    card = await _resolve_or_create_expense_card(db, org_id, payload.kategori)
    acc = await ledger.account(db, org_id, payload.account_id, currency=payload.currency) if payload.account_id else None
    e = Expense(
        organization_id=org_id,
        title=(payload.aciklama or card.name)[:300],
        category=card.name[:100],
        amount_cents=payload.amount_cents,
        receipt_no=payload.belge_no or "",
        currency=payload.currency,
        expense_date=datetime.combine(day, datetime.min.time().replace(hour=12), TZ),
        expense_card_id=card.id,
        counterparty_id=cp.id if cp else None,
        account_id=acc.id if acc else None,
        description=payload.aciklama,
        created_by_id=current_user.id,
    )
    db.add(e)
    await db.flush()
    if acc:
        _post_expense(db, acc, e, card, cp, day, current_user)
    _audit(db, org_id, current_user, "gider_ekle", {
        "card": card.name, "amount_cents": e.amount_cents, "paid": acc is not None
    })
    await db.commit()
    return {"id": str(e.id), "islem_tipi": "GIDER"}


@router.put("/gelir-gider/{item_id}")
async def update_gelir_gider(
    request: Request,
    item_id: UUID,
    payload: GelirGiderCreateIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gelir veya gider kaydını günceller ve denetim geçmişine (Düzeltildi rozeti için) revizyon yazar."""
    org_id = _org_id(request)
    day = _not_future(payload.tarih)
    cp = await _resolve_or_create_counterparty(
        db, org_id, payload.counterparty_id, payload.kisi_adi,
        kind="customer" if payload.islem_tipi == "GELIR" else "supplier",
    )

    # Önce LedgerEntry olarak ara
    le = (await db.execute(select(LedgerEntry).where(
        LedgerEntry.id == item_id, LedgerEntry.organization_id == org_id
    ).with_for_update())).scalar_one_or_none()

    if le:
        if le.source_type == "donation":
            raise HTTPException(status_code=409, detail="Bağış makbuzundan oluşan gelirler doğrudan Bağışlar / Gelen Havaleler ekranından yönetilir")
        changes: dict = {}
        if le.amount_cents != payload.amount_cents:
            changes["miktar_cents"] = {"eski": le.amount_cents, "yeni": payload.amount_cents}
        if le.category != payload.kategori[:60]:
            changes["kategori"] = {"eski": le.category, "yeni": payload.kategori[:60]}
        if (le.description or "") != (payload.aciklama or ""):
            changes["aciklama"] = {"eski": le.description, "yeni": payload.aciklama}

        if payload.account_id and payload.account_id != le.account_id:
            acc = await ledger.account(db, org_id, payload.account_id, currency=payload.currency)
            le.account_id = acc.id

        le.amount_cents = payload.amount_cents
        le.category = payload.kategori[:60]
        le.entry_date = day
        le.description = (payload.aciklama or None) and payload.aciklama[:500]
        le.counterparty_id = cp.id if cp else None

        if le.source_type == "expense" and le.source_id:
            exp = await db.get(Expense, le.source_id)
            if exp and exp.organization_id == org_id:
                card = await _resolve_or_create_expense_card(db, org_id, payload.kategori)
                exp.amount_cents = payload.amount_cents
                exp.category = card.name[:100]
                exp.expense_card_id = card.id
                exp.title = (payload.aciklama or card.name)[:300]
                exp.description = payload.aciklama
                exp.receipt_no = payload.belge_no or exp.receipt_no
                exp.counterparty_id = cp.id if cp else None
                exp.account_id = le.account_id
                exp.expense_date = datetime.combine(day, datetime.min.time().replace(hour=12), TZ)

        if changes:
            _audit(db, org_id, current_user, "gelir_gider_duzenle", {"item_id": str(le.id), "changes": changes})
        await db.commit()
        return {"id": str(le.id), "updated": True}

    # Ödenmemiş Expense olarak ara
    exp = (await db.execute(select(Expense).where(
        Expense.id == item_id, Expense.organization_id == org_id
    ).with_for_update())).scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")

    changes = {}
    if exp.amount_cents != payload.amount_cents:
        changes["miktar_cents"] = {"eski": exp.amount_cents, "yeni": payload.amount_cents}
    if exp.category != payload.kategori:
        changes["kategori"] = {"eski": exp.category, "yeni": payload.kategori}

    card = await _resolve_or_create_expense_card(db, org_id, payload.kategori)
    exp.amount_cents = payload.amount_cents
    exp.category = card.name[:100]
    exp.expense_card_id = card.id
    exp.title = (payload.aciklama or card.name)[:300]
    exp.description = payload.aciklama
    exp.receipt_no = payload.belge_no or ""
    exp.counterparty_id = cp.id if cp else None
    exp.expense_date = datetime.combine(day, datetime.min.time().replace(hour=12), TZ)
    if payload.account_id:
        acc = await ledger.account(db, org_id, payload.account_id, currency=payload.currency)
        exp.account_id = acc.id
        _post_expense(db, acc, exp, card, cp, day, current_user)
    if changes:
        _audit(db, org_id, current_user, "gelir_gider_duzenle", {"item_id": str(exp.id), "changes": changes})
    await db.commit()
    return {"id": str(exp.id), "updated": True}


class CancelGelirGiderIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.post("/gelir-gider/{item_id}/cancel")
async def cancel_gelir_gider(
    request: Request,
    item_id: UUID,
    payload: CancelGelirGiderIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gelir veya gider kaydını iptal sebebiyle denetim izi bırakarak iptal eder."""
    org_id = _org_id(request)
    le = (await db.execute(select(LedgerEntry).where(
        LedgerEntry.id == item_id, LedgerEntry.organization_id == org_id
    ).with_for_update())).scalar_one_or_none()

    if le:
        if le.source_type == "donation":
            raise HTTPException(status_code=409, detail="Bağış makbuzundan oluşan kayıtlar Bağışlar veya Gelen Havaleler ekranından iptal edilir")
        if le.source_type == "expense" and le.source_id:
            exp = await db.get(Expense, le.source_id)
            if exp and exp.organization_id == org_id:
                await db.delete(exp)
        _audit(db, org_id, current_user, "gelir_gider_iptal", {
            "item_id": str(le.id), "category": le.category, "amount_cents": le.amount_cents,
            "direction": le.direction, "reason": _clean(payload.reason),
        })
        await db.delete(le)
        await db.commit()
        return {"cancelled": True}

    exp = (await db.execute(select(Expense).where(
        Expense.id == item_id, Expense.organization_id == org_id
    ).with_for_update())).scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    await ledger.remove_source(db, org_id, "expense", exp.id)
    _audit(db, org_id, current_user, "gelir_gider_iptal", {
        "item_id": str(exp.id), "category": exp.category, "amount_cents": exp.amount_cents,
        "direction": "out", "reason": _clean(payload.reason),
    })
    await db.delete(exp)
    await db.commit()
    return {"cancelled": True}


# --- Ön Muhasebe: Tahsilat Sekmesi (Bağış, Aidat, Makbuz Analizi) --------------------------

@router.get("/tahsilatlar")
async def list_tahsilatlar(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    odeme_yontemi: Optional[str] = None,
    tip: Optional[str] = None,
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Onaylanmış bağış ve tahsilatların ödeme yöntemi, kampanya ve son 7 gün analizleriyle listesi."""
    from app.models.campaign import Campaign
    from app.models.donation import Donation, DonationStatus, Donor

    org_id = _org_id(request)
    await ledger.sync_organization_finance(db, org_id)

    query = (
        select(Donation, Donor.first_name, Donor.last_name, Donor.company_name, Campaign.title, Campaign.category)
        .outerjoin(Donor, Donor.id == Donation.donor_id)
        .outerjoin(Campaign, Campaign.id == Donation.campaign_id)
        .where(Donation.organization_id == org_id, Donation.status == DonationStatus.CONFIRMED)
    )
    if start:
        query = query.where(func.coalesce(Donation.paid_at, Donation.created_at) >= datetime.combine(start, datetime.min.time(), TZ))
    if end:
        query = query.where(func.coalesce(Donation.paid_at, Donation.created_at) < datetime.combine(end + timedelta(days=1), datetime.min.time(), TZ))

    rows = (await db.execute(query.order_by(func.coalesce(Donation.paid_at, Donation.created_at).desc()).limit(3000))).all()

    items: list[dict] = []
    q_fold = (q or "").strip().lower()

    for d, fn, ln, comp, camp_title, camp_cat in rows:
        kisi_adi = comp or f"{fn or ''} {ln or ''}".strip() or d.on_behalf_of or "Hayırsever"
        raw_method = getattr(d.payment_method, "value", d.payment_method) or "credit_card"
        yontem = _infer_odeme_yontemi(None, raw_method)
        tip_val = str(getattr(camp_cat, "value", camp_cat) or "BAGIS").upper()
        tip_label = camp_title or "Genel Bağış"
        day_val = ledger.local_day(d.paid_at or d.created_at)
        makbuz = d.official_receipt_no or d.receipt_number

        if odeme_yontemi and yontem != odeme_yontemi:
            continue
        if tip and tip_label.lower() != tip.strip().lower() and tip_val.lower() != tip.strip().lower():
            continue
        if q_fold:
            haystack = f"{kisi_adi} {tip_label} {makbuz} {d.donor_message or ''} {d.on_behalf_of or ''}".lower()
            if q_fold not in haystack:
                continue

        items.append({
            "id": str(d.id),
            "tarih": day_val.isoformat(),
            "tip": tip_val,
            "tip_display": tip_label,
            "miktar_cents": d.amount_cents,
            "miktar": round(d.amount_cents / 100.0, 2),
            "para_birimi": d.currency or "TRY",
            "odeme_yontemi": yontem,
            "odeme_yontemi_display": ODEME_YONTEMI_LABELS.get(yontem, yontem),
            "kisi_id": str(d.donor_id) if d.donor_id else None,
            "kisi_adi": kisi_adi,
            "makbuz_no": makbuz,
            "belge_no": d.transaction_id or None,
            "aciklama": d.donor_message or (f"{d.on_behalf_of} adına" if d.on_behalf_of else None),
        })

    try_items = [x for x in items if x["para_birimi"] == "TRY"]
    toplam_cents = sum(x["miktar_cents"] for x in try_items)
    nakit_cents = sum(x["miktar_cents"] for x in try_items if x["odeme_yontemi"] == "NAKIT")
    banka_cents = sum(x["miktar_cents"] for x in try_items if x["odeme_yontemi"] == "BANKA")
    kart_cents = sum(x["miktar_cents"] for x in try_items if x["odeme_yontemi"] in ("KREDI_KARTI", "POS"))

    # Ödeme yöntemi dağılımı
    by_method: dict[str, dict] = {}
    for x in try_items:
        lbl = x["odeme_yontemi_display"]
        entry = by_method.setdefault(lbl, {"yontem": lbl, "tutar_cents": 0, "adet": 0})
        entry["tutar_cents"] += x["miktar_cents"]
        entry["adet"] += 1
    odeme_dagilimi = [
        {**v, "oran": round((v["tutar_cents"] / toplam_cents) * 100, 1) if toplam_cents > 0 else 0}
        for v in sorted(by_method.values(), key=lambda i: i["tutar_cents"], reverse=True)
    ]

    # Tahsilat tipleri (kampanya) dağılımı
    by_tip: dict[str, dict] = {}
    for x in try_items:
        lbl = x["tip_display"]
        entry = by_tip.setdefault(lbl, {"tip": lbl, "tutar_cents": 0, "adet": 0})
        entry["tutar_cents"] += x["miktar_cents"]
        entry["adet"] += 1
    tip_dagilimi = [
        {**v, "oran": round((v["tutar_cents"] / toplam_cents) * 100, 1) if toplam_cents > 0 else 0}
        for v in sorted(by_tip.values(), key=lambda i: i["tutar_cents"], reverse=True)[:8]
    ]

    # Son 7 gün akışı
    today = _today()
    day_totals = {(today - timedelta(days=i)).isoformat(): 0 for i in range(6, -1, -1)}
    for x in try_items:
        if x["tarih"] in day_totals:
            day_totals[x["tarih"]] += x["miktar_cents"]
    son_7_gun = [{"tarih": k, "tutar_cents": v} for k, v in day_totals.items()]

    # Tahsilat liderleri (En çok bağış yapanlar)
    by_donor: dict[str, dict] = {}
    for x in try_items:
        name = x["kisi_adi"] or "Hayırsever"
        entry = by_donor.setdefault(name, {"kisi_adi": name, "kisi_id": x["kisi_id"], "tutar_cents": 0, "adet": 0})
        entry["tutar_cents"] += x["miktar_cents"]
        entry["adet"] += 1
    liderler = sorted(by_donor.values(), key=lambda i: i["tutar_cents"], reverse=True)[:10]

    return {
        "items": items,
        "summary": {
            "toplam_cents": toplam_cents,
            "nakit_cents": nakit_cents,
            "banka_cents": banka_cents,
            "kart_cents": kart_cents,
            "toplam_adet": len(items),
            "odeme_dagilimi": odeme_dagilimi,
            "tip_dagilimi": tip_dagilimi,
            "son_7_gun": son_7_gun,
            "liderler": liderler,
        },
    }
