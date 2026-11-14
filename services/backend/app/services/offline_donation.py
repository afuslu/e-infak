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
    pending: bool = False,
) -> tuple[Donation, dict]:
    """Create a confirmed donation with its side effects; the caller commits.

    `pending`: payment not received yet (staff wrote a "Beklemede" receipt). The donation is
    stored without touching totals, kurban shares or notifications; confirm_offline_donation()
    applies them when the money arrives.
    """
    from app.api.v1.checkout import _receipt_number

    donation = Donation(
        organization_id=organization_id,
        campaign_id=campaign.id,
        donor_id=donor.id,
        receipt_number=_receipt_number(organization_id),
        amount_cents=amount_cents,
        currency=currency,
        payment_method=method,
        status=DonationStatus.PENDING if pending else DonationStatus.CONFIRMED,
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
    if pending:
        donation.payment_details = {**donation.payment_details, "on_confirm": {
            "quantity": quantity, "metadata": metadata or {}, "send_receipt": send_receipt}}
        return donation, {}
    return donation, await _apply_confirmation(db, donation, campaign, donor, quantity=quantity,
                                               metadata=metadata or {}, send_receipt=send_receipt)


async def confirm_offline_donation(db: AsyncSession, donation: Donation, campaign: Campaign, donor: Donor,
                                   paid_at: Optional[datetime] = None) -> dict:
    """A pending staff receipt was paid: apply what record_offline_donation postponed (the caller commits)."""
    if donation.status != DonationStatus.PENDING:
        raise ValueError("Yalnız bekleyen makbuz ödendi olarak işaretlenebilir")
    plan = dict((donation.payment_details or {}).get("on_confirm") or {})
    donation.status = DonationStatus.CONFIRMED
    if paid_at:
        donation.paid_at = paid_at
    donation.payment_details = {k: v for k, v in (donation.payment_details or {}).items() if k != "on_confirm"}
    return await _apply_confirmation(db, donation, campaign, donor, quantity=int(plan.get("quantity") or 1),
                                     metadata=plan.get("metadata") or {}, send_receipt=bool(plan.get("send_receipt", True)))


async def _apply_confirmation(db: AsyncSession, donation: Donation, campaign: Campaign, donor: Donor, *,
                              quantity: int, metadata: dict, send_receipt: bool) -> dict:
    organization_id, amount_cents, paid_at = donation.organization_id, donation.amount_cents, donation.paid_at
    await add_to_campaign(db, donation, campaign)
    effects = await on_donation_confirmed(db, donation, donor, quantity=quantity, metadata=metadata)
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
    return effects
