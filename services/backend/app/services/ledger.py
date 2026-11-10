"""Kasa / banka hareket defteri yardımcıları."""
from datetime import date, datetime
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.accounting import FinanceAccount, LedgerEntry

TZ = ZoneInfo("Europe/Istanbul")


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
    """Onaylı bağışı, ödeme yöntemi için varsayılan işaretlenen hesaba giriş olarak işler."""
    method = getattr(donation.payment_method, "value", donation.payment_method)
    acc = (await db.execute(select(FinanceAccount).where(
        FinanceAccount.organization_id == donation.organization_id, FinanceAccount.default_for == method,
        FinanceAccount.currency == donation.currency, FinanceAccount.is_active.is_(True),
    ).order_by(FinanceAccount.created_at))).scalars().first()
    if not acc:
        return None
    return post(db, acc, direction="in", amount_cents=donation.amount_cents, entry_date=local_day(donation.paid_at),
                category="Bağış", description=f"Makbuz {donation.receipt_number}", source_type="donation", source_id=donation.id)
