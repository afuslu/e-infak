"""Currency conversion for campaign progress (TRY / USD / EUR) using stored TCMB rates."""
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fx import FxRate

MAX_RATE_AGE = timedelta(days=7)
SUPPORTED = {"TRY", "USD", "EUR"}


async def current_rates(db: AsyncSession) -> dict[str, tuple[Decimal, datetime]]:
    rows = (await db.execute(select(FxRate))).scalars().all()
    return {r.currency: (Decimal(r.rate_try), r.fetched_at) for r in rows}


async def convert(db: AsyncSession, amount_cents: int, source: str, target: str) -> tuple[Optional[int], Optional[str]]:
    """Return (converted cents, rate note). (None, reason) when no fresh rate is available."""
    if source == target:
        return amount_cents, None
    if source not in SUPPORTED or target not in SUPPORTED:
        return None, f"desteklenmeyen para birimi {source}->{target}"
    rates = await current_rates(db)
    now = datetime.now(timezone.utc)

    def to_try(currency: str) -> Optional[Decimal]:
        if currency == "TRY":
            return Decimal(1)
        entry = rates.get(currency)
        if not entry or now - entry[1] > MAX_RATE_AGE:
            return None
        return entry[0]

    src, dst = to_try(source), to_try(target)
    if src is None or dst is None:
        return None, f"{source}->{target} için güncel TCMB kuru yok"
    converted = (Decimal(amount_cents) * src / dst).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(converted), f"1 {source} = {(src / dst).quantize(Decimal('0.000001'))} {target}"


async def add_to_campaign(db: AsyncSession, donation, campaign) -> None:
    """Add the donation to campaign progress in the campaign's currency and remember what was added."""
    target = getattr(campaign, "currency", None) or "TRY"
    converted, note = await convert(db, donation.amount_cents, donation.currency or "TRY", target)
    details = dict(donation.payment_details or {})
    if converted is None:
        details["campaign_progress"] = {"added_cents": 0, "currency": target, "note": note}
    else:
        campaign.collected_cents = (campaign.collected_cents or 0) + converted
        details["campaign_progress"] = {"added_cents": converted, "currency": target, "rate": note}
    donation.payment_details = details


def remove_from_campaign(donation, campaign) -> None:
    progress = (donation.payment_details or {}).get("campaign_progress")
    if progress is not None:
        added = int(progress.get("added_cents") or 0)
    else:
        # Donations confirmed before conversion existed were added as-is when in TRY.
        added = donation.amount_cents if (donation.currency or "TRY") == "TRY" else 0
    campaign.collected_cents = max(0, (campaign.collected_cents or 0) - added)
