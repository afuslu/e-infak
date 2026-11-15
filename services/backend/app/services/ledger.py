"""Kasa / banka hareket defteri yardımcıları."""
from datetime import date, datetime
import time
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import case, delete, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting import FinanceAccount, LedgerEntry

TZ = ZoneInfo("Europe/Istanbul")
_LAST_SYNC_TS: dict[UUID, float] = {}
_SYNC_COOLDOWN_SEC = 10.0


def invalidate_sync_cache(org_id: Optional[UUID] = None) -> None:
    if org_id is None:
        _LAST_SYNC_TS.clear()
    else:
        _LAST_SYNC_TS.pop(org_id, None)


async def account(db: AsyncSession, org_id: UUID, account_id: UUID, currency: Optional[str] = None) -> FinanceAccount:
    row = (await db.execute(select(FinanceAccount).where(
        FinanceAccount.id == account_id, FinanceAccount.organization_id == org_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Kasa / banka hesabı bulunamadı")
    if not row.is_active:
        raise HTTPException(status_code=409, detail=f"{row.name} hesabı pasif")
    if currency and row.currency != currency:
        raise HTTPException(status_code=422, detail=f"{row.name} hesabı {row.currency}; işlem para birimi {currency}")
    return row


def post(db: AsyncSession, acc: FinanceAccount, *, direction: str, amount_cents: int, entry_date: date,
         category: str, description: Optional[str] = None, source_type: str = "manual", source_id: Optional[UUID] = None,
         counterparty_id: Optional[UUID] = None, user_id: Optional[UUID] = None) -> LedgerEntry:
    if direction not in ("in", "out") or amount_cents <= 0:
        raise HTTPException(status_code=422, detail="Geçersiz hareket")
    entry = LedgerEntry(
        organization_id=acc.organization_id, account_id=acc.id, entry_date=entry_date, direction=direction,
        amount_cents=amount_cents, category=category[:60], description=(description or None) and description[:500],
        source_type=source_type, source_id=source_id, counterparty_id=counterparty_id, created_by_id=user_id,
    )
    db.add(entry)
    return entry


async def remove_source(db: AsyncSession, org_id: UUID, source_type: str, source_id: UUID) -> int:
    result = await db.execute(delete(LedgerEntry).where(
        LedgerEntry.organization_id == org_id, LedgerEntry.source_type == source_type, LedgerEntry.source_id == source_id))
    return result.rowcount or 0


def signed():
    return case((LedgerEntry.direction == "in", LedgerEntry.amount_cents), else_=-LedgerEntry.amount_cents)


async def balances(db: AsyncSession, org_id: UUID, until: Optional[date] = None) -> dict[UUID, int]:
    query = select(LedgerEntry.account_id, func.coalesce(func.sum(signed()), 0)).where(LedgerEntry.organization_id == org_id)
    if until:
        query = query.where(LedgerEntry.entry_date <= until)
    moves = dict((await db.execute(query.group_by(LedgerEntry.account_id))).all())
    accounts = (await db.execute(select(FinanceAccount).where(FinanceAccount.organization_id == org_id))).scalars().all()
    return {a.id: a.opening_balance_cents + int(moves.get(a.id, 0)) for a in accounts}


def local_day(value: Optional[datetime]) -> date:
    if value is None:
        return datetime.now(TZ).date()
    return value.astimezone(TZ).date() if value.tzinfo else value.date()


async def post_donation(db: AsyncSession, donation) -> Optional[LedgerEntry]:
    """Onaylı bağışı, ödeme yöntemi veya banka hesabına göre ilgili hesaba giriş olarak işler."""
    from app.models.automation import BankAccount

    existing = (await db.execute(select(LedgerEntry).where(
        LedgerEntry.organization_id == donation.organization_id,
        LedgerEntry.source_type == "donation",
        LedgerEntry.source_id == donation.id,
    ))).scalars().first()
    if existing:
        return existing

    method = getattr(donation.payment_method, "value", donation.payment_method) or "credit_card"
    currency = donation.currency or "TRY"
    details = donation.payment_details or {}
    acc: Optional[FinanceAccount] = None

    # 1. Banka havalesinden geldiyse ilgili BankAccount ile eşleşen FinanceAccount'u bul/oluştur
    bank_acc_id = details.get("bank_account_id")
    if bank_acc_id:
        try:
            ba = await db.get(BankAccount, UUID(str(bank_acc_id)))
        except ValueError:
            ba = None
        if ba and ba.organization_id == donation.organization_id:
            acc = await ensure_finance_account_for_bank(db, ba)

    # 2. Ödeme yöntemi için varsayılan işaretlenen aktif hesabı ara
    if not acc:
        acc = (await db.execute(select(FinanceAccount).where(
            FinanceAccount.organization_id == donation.organization_id,
            FinanceAccount.default_for == method,
            FinanceAccount.currency == currency,
            FinanceAccount.is_active.is_(True),
        ).order_by(FinanceAccount.created_at))).scalars().first()

    # 3. Aynı tipte (cash / bank / pos) aktif bir hesap ara
    if not acc:
        target_kinds = ["cash"] if method == "cash" else (["bank"] if method == "bank_transfer" else ["pos", "bank"])
        acc = (await db.execute(select(FinanceAccount).where(
            FinanceAccount.organization_id == donation.organization_id,
            FinanceAccount.kind.in_(target_kinds),
            FinanceAccount.currency == currency,
            FinanceAccount.is_active.is_(True),
        ).order_by(FinanceAccount.created_at))).scalars().first()

    # 4. Hiç hesap yoksa otomatik varsayılan hesap oluştur
    if not acc:
        default_names = {
            "cash": ("Merkez Kasa", "cash"),
            "bank_transfer": ("Ana Banka Hesabı", "bank"),
            "credit_card": ("Sanal POS / Kart Hesabı", "pos"),
        }
        acc_name, acc_kind = default_names.get(method, ("Merkez Kasa", "cash"))
        acc = FinanceAccount(
            organization_id=donation.organization_id,
            name=acc_name if currency == "TRY" else f"{acc_name} ({currency})",
            kind=acc_kind,
            currency=currency,
            default_for=method,
            opening_balance_cents=0,
            is_active=True,
        )
        db.add(acc)
        await db.flush()

    return post(
        db, acc, direction="in", amount_cents=donation.amount_cents,
        entry_date=local_day(donation.paid_at or donation.created_at),
        category="Bağış", description=f"Makbuz {donation.official_receipt_no or donation.receipt_number}",
        source_type="donation", source_id=donation.id,
    )


def _clean_iban(iban: Optional[str]) -> str:
    return "".join((iban or "").split()).upper()


async def ensure_finance_account_for_bank(db: AsyncSession, ba) -> FinanceAccount:
    """BankAccount (otomasyon/ekstre) kaydının FinanceAccount (muhasebe) karşılığını bulur veya oluşturur."""
    from app.banking import CONNECTORS

    clean_iban = _clean_iban(ba.iban)
    accounts = (await db.execute(select(FinanceAccount).where(
        FinanceAccount.organization_id == ba.organization_id,
        FinanceAccount.kind == "bank",
    ))).scalars().all()
    for acc in accounts:
        if clean_iban and _clean_iban(acc.iban) == clean_iban:
            return acc
        if acc.name.strip().lower() == (ba.label or "").strip().lower() and acc.currency == (ba.currency or "TRY"):
            if clean_iban and not acc.iban:
                acc.iban = clean_iban
            return acc

    connector = CONNECTORS.get(ba.bank_key)
    bank_label = connector.label if connector else ba.bank_key
    new_acc = FinanceAccount(
        organization_id=ba.organization_id,
        name=(ba.label or bank_label)[:120],
        kind="bank",
        currency=(ba.currency or "TRY")[:3],
        bank_name=bank_label[:120],
        iban=clean_iban[:40] if clean_iban else None,
        opening_balance_cents=0,
        is_active=bool(ba.enabled),
    )
    db.add(new_acc)
    await db.flush()
    return new_acc


async def sync_organization_finance(db: AsyncSession, org_id: UUID, *, force: bool = False) -> bool:
    """Mevcut BankAccount, onaylı Donation ve eski Expense kayıtlarını muhasebe defteriyle (LedgerEntry) senkronize eder."""
    now_mono = time.monotonic()
    if not force and (now_mono - _LAST_SYNC_TS.get(org_id, 0.0)) < _SYNC_COOLDOWN_SEC:
        return False

    from app.models.automation import BankAccount
    from app.models.donation import Donation, DonationStatus
    from app.models.expense import Expense
    from app.models.organization import Organization

    # Önce kilit almadan hızlı kontrol: işlenmemiş bağış, gider veya eksik hesap var mı?
    donation_posted_exists = exists(
        select(LedgerEntry.id).where(
            LedgerEntry.organization_id == org_id,
            LedgerEntry.source_type == "donation",
            LedgerEntry.source_id == Donation.id,
        )
    )
    unposted_donations = (await db.execute(
        select(Donation).where(
            Donation.organization_id == org_id,
            Donation.status == DonationStatus.CONFIRMED,
            Donation.amount_cents > 0,
            ~donation_posted_exists,
        ).order_by(Donation.created_at)
    )).scalars().all()

    expense_posted_exists = exists(
        select(LedgerEntry.id).where(
            LedgerEntry.organization_id == org_id,
            LedgerEntry.source_type == "expense",
            LedgerEntry.source_id == Expense.id,
        )
    )
    unposted_expenses = (await db.execute(
        select(Expense).where(
            Expense.organization_id == org_id,
            Expense.amount_cents > 0,
            ~expense_posted_exists,
        ).order_by(Expense.expense_date)
    )).scalars().all()

    fin_accounts = (await db.execute(
        select(FinanceAccount).where(FinanceAccount.organization_id == org_id).order_by(FinanceAccount.created_at)
    )).scalars().all()
    bank_accounts = (await db.execute(
        select(BankAccount).where(BankAccount.organization_id == org_id)
    )).scalars().all()

    has_active_try_cash = any(a.kind == "cash" and a.currency == "TRY" and a.is_active for a in fin_accounts)
    existing_ibans = {_clean_iban(a.iban) for a in fin_accounts if a.kind == "bank" and a.iban}
    existing_bank_names = {(a.name.strip().lower(), a.currency) for a in fin_accounts if a.kind == "bank"}
    missing_bank = any(
        (_clean_iban(ba.iban) not in existing_ibans if _clean_iban(ba.iban) else ((ba.label or "").strip().lower(), (ba.currency or "TRY")) not in existing_bank_names)
        for ba in bank_accounts
    )

    if not unposted_donations and not unposted_expenses and has_active_try_cash and not missing_bank:
        _LAST_SYNC_TS[org_id] = now_mono
        return False

    # Yalnızca gerçek senkronizasyon gerektiğinde kurum satırını kilitle
    await db.execute(select(Organization.id).where(Organization.id == org_id).with_for_update())

    changed = False

    # 1. BankAccount -> FinanceAccount eşitlemesi
    for ba in bank_accounts:
        await ensure_finance_account_for_bank(db, ba)
        changed = True

    # 2. En az 1 aktif Kasa (Merkez Kasa) olduğundan emin ol
    cash_acc = next((a for a in fin_accounts if a.kind == "cash" and a.currency == "TRY"), None)
    if not cash_acc:
        cash_acc = FinanceAccount(
            organization_id=org_id,
            name="Merkez Kasa",
            kind="cash",
            currency="TRY",
            default_for="cash",
            opening_balance_cents=0,
            is_active=True,
        )
        db.add(cash_acc)
        await db.flush()
        changed = True
    elif not cash_acc.is_active:
        cash_acc.is_active = True
        changed = True

    # 3. Geçmiş onaylı bağışlardan LedgerEntry kaydı olmayanları deftere işle
    for don in unposted_donations:
        await post_donation(db, don)
        changed = True

    # 4. Geçmiş giderlerden (Expense) LedgerEntry kaydı olmayanları işle
    for exp in unposted_expenses:
        exp_cur = (exp.currency or "TRY").upper().strip()
        if exp_cur == "TL":
            exp_cur = "TRY"
            exp.currency = "TRY"
        if exp.account_id is None:
            if exp_cur == "TRY":
                exp.account_id = cash_acc.id
            else:
                fx_cash = (await db.execute(select(FinanceAccount).where(
                    FinanceAccount.organization_id == org_id,
                    FinanceAccount.kind == "cash",
                    FinanceAccount.currency == exp_cur,
                ).order_by(FinanceAccount.created_at))).scalars().first()
                if not fx_cash:
                    fx_cash = FinanceAccount(
                        organization_id=org_id,
                        name=f"Merkez Kasa ({exp_cur})",
                        kind="cash",
                        currency=exp_cur[:3],
                        opening_balance_cents=0,
                        is_active=True,
                    )
                    db.add(fx_cash)
                    await db.flush()
                exp.account_id = fx_cash.id
        if exp.account_id:
            acc = await db.get(FinanceAccount, exp.account_id)
            if acc and acc.organization_id == org_id:
                existing_exp_le = (await db.execute(select(LedgerEntry.id).where(
                    LedgerEntry.organization_id == org_id,
                    LedgerEntry.source_type == "expense",
                    LedgerEntry.source_id == exp.id,
                ).limit(1))).first()
                if not existing_exp_le:
                    post(
                        db, acc, direction="out", amount_cents=exp.amount_cents,
                        entry_date=local_day(exp.expense_date or exp.created_at),
                        category=(exp.category or "Gider")[:60],
                        description=(exp.description or exp.title)[:500] if (exp.description or exp.title) else None,
                        source_type="expense", source_id=exp.id,
                        counterparty_id=exp.counterparty_id, user_id=exp.created_by_id,
                    )
                    changed = True

    if changed:
        await db.commit()
    _LAST_SYNC_TS[org_id] = time.monotonic()
    return changed
