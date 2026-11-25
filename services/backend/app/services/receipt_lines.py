"""What a printed receipt shows beyond the donation row: the kurban intention and the items of a grouped receipt."""
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.donation import Donation
from app.models.kurban import KURBAN_TYPES, KurbanShare
from app.models.payment import PaymentOrderItem
from app.services.donation_hooks import campaign_kurban_types, intent_label, intent_value


async def donation_intents(db: AsyncSession, donations: Iterable[Donation]) -> dict[UUID, str]:
    """Kurban intention to print per donation; donations without one are left out.

    Shares default to "vacip" when nothing was chosen, so an all-vacip donation only shows an
    intention that was stated explicitly (or set later by staff on the share).
    """
    donations = list(donations)
    if not donations:
        return {}
    types: dict[UUID, list[str]] = {}
    for donation_id, kind in (await db.execute(
        select(KurbanShare.donation_id, KurbanShare.kurban_type)
        .where(KurbanShare.donation_id.in_([d.id for d in donations])).order_by(KurbanShare.created_at)
    )).all():
        if kind not in types.setdefault(donation_id, []):
            types[donation_id].append(kind)
    item_ids = [d.payment_order_item_id for d in donations if d.payment_order_item_id]
    items = dict((await db.execute(
        select(PaymentOrderItem.id, PaymentOrderItem.metadata_json).where(PaymentOrderItem.id.in_(item_ids))
    )).tuples().all()) if item_ids else {}

    campaign_types = await campaign_kurban_types(db, [d.campaign_id for d in donations if d.campaign_id])

    intents: dict[UUID, str] = {}
    for d in donations:
        details = d.payment_details or {}
        kinds = types.get(d.id, [])
        if kinds and (kinds != ["vacip"] or details.get("niyet_edited")):
            intents[d.id] = ", ".join(KURBAN_TYPES.get(k, k) for k in kinds)
            continue
        label = (
            details.get("niyet")
            or intent_label(intent_value(items.get(d.payment_order_item_id) or {}))
            or intent_label(intent_value((details.get("on_confirm") or {}).get("metadata") or {}))
            or KURBAN_TYPES.get(campaign_types.get(d.campaign_id, ""))
        )
        if label:
            intents[d.id] = label
    return intents


def _line_title(donation: Donation) -> str:
    title = donation.campaign.title if donation.campaign else "-"
    count = (donation.payment_details or {}).get("adet")
    return f"{title} ({count} adet)" if count else title


async def receipt_print_data(db: AsyncSession, donation: Donation) -> dict:
    """amount_cents / lines / intent arguments of build_receipt_pdf: a grouped receipt prints all its items."""
    members = [donation]
    group = (donation.payment_details or {}).get("receipt_group")
    if group:
        members = list((await db.execute(
            select(Donation).options(selectinload(Donation.campaign)).where(
                Donation.organization_id == donation.organization_id,
                Donation.payment_details["receipt_group"].astext == group,
            ).order_by(Donation.payment_details["line"].as_integer(), Donation.created_at)
        )).scalars().all()) or members
    intents = await donation_intents(db, members)
    lines: Optional[list[tuple]] = None
    amount_cents = donation.amount_cents
    if len(members) > 1:
        lines = [(_line_title(m), m.amount_cents, m.currency or "TRY", m.on_behalf_of,
                  intents.get(m.id)) for m in members]
        if len({m.currency for m in members}) == 1:
            amount_cents = sum(m.amount_cents for m in members)
    return {
        "amount_cents": amount_cents,
        # The verification code always belongs to this donation, not to the receipt's total.
        "verify_amount_cents": donation.amount_cents,
        "lines": lines,
        "intent": intents.get(donation.id),
        "quantity": (donation.payment_details or {}).get("adet"),
    }
