"""Recording donations received outside the online checkout (cash, transfer, kumbara)."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import OutboxEvent
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.services.donation_hooks import on_donation_confirmed
from app.services.fx import add_to_campaign


async def record_offline_donation(
    db: AsyncSession,
    *,
    organization_id: UUID,
    campaign: Campaign,
    donor: Donor,
    amount_cents: int,
    currency: str,
    method: PaymentMethod,
    paid_at: datetime,
    issued_by_id: UUID,
    provider: str,
    idempotency_key: str,
    details: Optional[dict] = None,
    note: Optional[str] = None,
    on_behalf_of: Optional[str] = None,
    is_anonymous: bool = False,
    transaction_id: Optional[str] = None,
    send_receipt: bool = True,
    quantity: int = 1,
    metadata: Optional[dict] = None,
) -> tuple[Donation, dict]:
    """Create a confirmed donation with its side effects; the caller commits."""
    from app.api.v1.checkout import _receipt_number

    donation = Donation(
        organization_id=organization_id,
        campaign_id=campaign.id,
        donor_id=donor.id,
        receipt_number=_receipt_number(organization_id),
        amount_cents=amount_cents,
        currency=currency,
        payment_method=method,
        status=DonationStatus.CONFIRMED,
        transaction_id=transaction_id,
        payment_provider=provider,
        payment_details={**(details or {}), "entered_by": str(issued_by_id)},
        paid_at=paid_at,
        donor_message=note,
        on_behalf_of=on_behalf_of,
        is_anonymous=is_anonymous,
        idempotency_key=idempotency_key,
        issued_by_id=issued_by_id,
    )
    db.add(donation)
    await db.flush()

    await add_to_campaign(db, donation, campaign)
    effects = await on_donation_confirmed(db, donation, donor, quantity=quantity, metadata=metadata or {})
    donor.total_donations = (donor.total_donations or 0) + 1
    donor.total_donated_cents = (donor.total_donated_cents or 0) + amount_cents
    donor.first_donation_at = min(filter(None, [donor.first_donation_at, paid_at]))
    donor.last_donation_at = max(filter(None, [donor.last_donation_at, paid_at]))

    if send_receipt:
        db.add(OutboxEvent(
            organization_id=organization_id, aggregate_type="donation", aggregate_id=donation.id,
            event_type="receipt.send",
            payload={"donation_id": str(donation.id), "receipt_number": donation.receipt_number},
        ))
    db.add(OutboxEvent(
        organization_id=organization_id, aggregate_type="donation", aggregate_id=donation.id,
        event_type="webhook.donation.paid", payload={"donation_id": str(donation.id)},
    ))
    return donation, effects
