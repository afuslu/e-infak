"""Pulling bank movements and running them through the matcher."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.banking import CONNECTORS, BankConnectorError, credential_key
from app.banking.matching import Matcher, analyse, approve
from app.models.automation import BankAccount, BankTransaction, ReconciliationStatus
from app.models.campaign import Campaign
from app.models.donation import Donor

log = logging.getLogger(__name__)
OVERLAP = timedelta(days=2)  # banks book late (FAST at night, weekends): always re-read the last two days
FIRST_SYNC = timedelta(days=7)


async def process_transactions(db: AsyncSession, transactions: Iterable[BankTransaction], *,
                               account: Optional[BankAccount] = None, user_id: Optional[UUID] = None,
                               matcher: Optional[Matcher] = None) -> dict:
    """Checkout-order match first (transfer reference), then donor/campaign suggestion and optional auto approval."""
    from app.api.v1.reconciliation import _auto_match

    matcher = matcher or Matcher(db, account.organization_id if account else None)
    stats = {"orders": 0, "suggested": 0, "auto_approved": 0, "ignored": 0}
    for transaction in transactions:
        if matcher.org_id is None:
            matcher.org_id = transaction.organization_id
        if transaction.amount_cents > 0:
            await _auto_match(db, transaction, user_id)
        if transaction.status == ReconciliationStatus.MATCHED:
            stats["orders"] += 1
            continue
        suggestion = await analyse(db, transaction, matcher, account)
        if transaction.status == ReconciliationStatus.IGNORED:
            stats["ignored"] += 1
            continue
        stats["suggested"] += 1
        if account and account.auto_approve and suggestion.get("auto"):
            donor = await db.get(Donor, UUID(suggestion["donor"]["id"]))
            campaign = await db.get(Campaign, UUID(suggestion["campaign"]["id"]))
            if donor and campaign and donor.organization_id == campaign.organization_id == transaction.organization_id:
                await approve(db, transaction, donor=donor, campaign=campaign, user_id=user_id,
                              kurban_type=suggestion.get("kurban_type"), matcher=matcher, automatic=True)
                stats["auto_approved"] += 1
    return stats


async def sync_account(db: AsyncSession, account: BankAccount, *, until: Optional[datetime] = None) -> dict:
    """Fetch the account's movements since the last sync (with overlap), store new ones, match them. Commits."""
    from app.services.tenant_credentials import get_credentials

    connector_cls = CONNECTORS.get(account.bank_key)
    if not connector_cls:
        account.last_error = f"Bilinmeyen banka: {account.bank_key}"
        await db.commit()
        return {"error": account.last_error}
    until = until or datetime.now(timezone.utc)
    since = (account.last_synced_at - OVERLAP) if account.last_synced_at else until - FIRST_SYNC
    try:
        credentials = await get_credentials(db, account.organization_id, credential_key(account.bank_key)) or {}
        movements = await connector_cls(credentials).fetch(account, since, until)
    except BankConnectorError as exc:
        account.last_error = str(exc)[:1000]
        await db.commit()
        return {"error": account.last_error}
    except Exception as exc:  # network errors, unexpected bank responses
        log.exception("bank sync failed for account %s", account.id)
        account.last_error = f"Bankaya ulaşılamadı: {type(exc).__name__}"
        await db.commit()
        return {"error": account.last_error}

    external_ids = [f"{account.bank_key}:{m.external_id}" for m in movements]
    known = set((await db.execute(select(BankTransaction.external_id).where(
        BankTransaction.organization_id == account.organization_id,
        BankTransaction.external_id.in_(external_ids)))).scalars().all()) if external_ids else set()
    new = []
    for movement, external_id in zip(movements, external_ids):
        if external_id in known or movement.currency != account.currency and account.currency != "*":
            continue
        known.add(external_id)
        transaction = BankTransaction(
            organization_id=account.organization_id, bank_account_id=account.id, source="api",
            external_id=external_id, booked_at=movement.booked_at, amount_cents=movement.amount_cents,
            currency=movement.currency, sender_name=movement.sender_name, description=movement.description,
            raw_data={**{str(k): str(v) for k, v in (movement.raw or {}).items()}, "_bank": account.bank_key,
                      "sender_iban": movement.sender_iban or ""},
        )
        db.add(transaction)
        new.append(transaction)
    await db.flush()
    stats = await process_transactions(db, new, account=account)
    account.last_synced_at, account.last_error = until, None
    await db.commit()
    return {"fetched": len(movements), "new": len(new), **stats}


async def sync_all(db: AsyncSession) -> list[dict]:
    accounts = (await db.execute(select(BankAccount).where(BankAccount.enabled.is_(True)))).scalars().all()
    results = []
    for account in accounts:
        if not CONNECTORS.get(account.bank_key) or not CONNECTORS[account.bank_key].ready:
            continue  # bank web service not connected yet: statements come as uploads
        results.append({"account_id": str(account.id), **await sync_account(db, account)})
    return results
