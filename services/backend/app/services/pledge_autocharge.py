"""Charge due pledge installments (sponsorluk / su kuyusu taksitleri) from a stored card.

The card belongs to one of the donor's card instructions (Subscription.mode == "card"); its encrypted
provider reference is reused, never a card number. One payment order per installment
(idempotency key "pledge:<installment id>") means an installment can never be charged twice; the
order's item carries pledge_installment_id, so the normal finalize path marks the installment paid.
"""
import logging
from datetime import date, datetime, timezone
from typing import Optional
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.sponsorship import Pledge, PledgeInstallment
from app.models.subscription import Subscription

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Europe/Istanbul")
MAX_ATTEMPTS = 3


async def charge_installment(db: AsyncSession, pledge: Pledge, installment: PledgeInstallment, sub: Subscription,
                             now: Optional[datetime] = None) -> dict:
    """Charge one installment; the caller commits."""
    from app.api.v1.checkout import _finalize_paid_order, _load_order, apply_result
    from app.models.donation import Donor
    from app.models.organization import Organization
    from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderItem, PaymentOrderStatus
    from app.payments import build_provider
    from app.payments.base import CheckoutContext, CheckoutLine, PaymentProviderError
    from app.services.tenant_credentials import decrypt, get_credentials

    now = now or datetime.now(timezone.utc)
    key = f"pledge:{installment.id}"
    order = (await db.execute(select(PaymentOrder).where(
        PaymentOrder.organization_id == pledge.organization_id, PaymentOrder.idempotency_key == key))).scalar_one_or_none()
    if order and order.status == PaymentOrderStatus.PAID:
        return {"status": "already_paid"}
    if order:
        tries = (await db.execute(select(func.count(PaymentAttempt.id)).where(PaymentAttempt.order_id == order.id))).scalar_one()
        if tries >= MAX_ATTEMPTS:
            pledge.auto_charge = False
            pledge.last_charge_error = f"{MAX_ATTEMPTS} deneme başarısız; otomatik çekim kapatıldı. Son hata: {order.failure_message or '-'}"[:500]
            return {"status": "gave_up"}
    else:
        order = PaymentOrder(
            organization_id=pledge.organization_id, donor_id=pledge.donor_id,
            merchant_payment_id=f"PL{pledge.organization_id.hex[:6]}{uuid4().hex[:20]}".upper(), idempotency_key=key,
            payment_method="credit_card", status=PaymentOrderStatus.PENDING, total_cents=installment.amount_cents,
            currency=pledge.currency, locale="tr",
        )
        db.add(order)
        await db.flush()
        db.add(PaymentOrderItem(order_id=order.id, campaign_id=pledge.campaign_id, quantity=1,
                                unit_amount_cents=installment.amount_cents, total_amount_cents=installment.amount_cents,
                                donor_message=f"{pledge.title or 'Taahhüt'} — {installment.seq}. taksit",
                                metadata_json={"pledge_installment_id": str(installment.id), "auto_charge": True}))
        await db.flush()
    attempt = PaymentAttempt(order_id=order.id, provider=sub.provider or "iyzico", session_token=uuid4().hex)
    db.add(attempt)
    await db.flush()
    org = await db.get(Organization, pledge.organization_id)
    donor = await db.get(Donor, pledge.donor_id)
    try:
        provider = build_provider(sub.provider, await get_credentials(db, pledge.organization_id, sub.provider), tenant_slug=org.slug)
        if not provider.supports_stored_cards:
            raise PaymentProviderError(f"{provider.label} kayıtlı karttan çekim desteklemiyor")
        ctx = CheckoutContext(
            merchant_payment_id=order.merchant_payment_id, total_cents=installment.amount_cents, currency=pledge.currency,
            locale="tr", lines=[CheckoutLine(name=pledge.title or "Taksit", quantity=1, unit_cents=installment.amount_cents,
                                             product_code=str(pledge.campaign_id))],
            customer_id=str(donor.id), customer_first_name=donor.first_name or "", customer_last_name=donor.last_name or "",
            customer_email=donor.email or "", customer_phone=donor.phone or "", customer_ip="127.0.0.1",
            user_agent="e-infak-pledge", return_url="", notify_url="", success_url="", fail_url="",
            customer_identity=donor.tc_no or "",
        )
        result = await provider.charge_stored(ctx, decrypt(sub.card_ref))
    except Exception as exc:  # provider down, credentials missing, card ref unreadable
        result, error = None, str(exc)[:500]
    else:
        error = None if result.approved else (result.message or result.code or "Banka çekimi reddetti")[:500]
    if result is not None:
        apply_result(attempt, result)
    pledge.last_charge_at = now
    if error is None:
        await _finalize_paid_order(db, await _load_order(db, order.id), attempt, commit=False)
        pledge.last_charge_error = None
        return {"status": "paid", "order_id": str(order.id)}
    order.failure_message = error
    pledge.last_charge_error = error
    from app.services import staff_notify

    staff_notify.queue(
        db,
        pledge.organization_id,
        "push.recurring.failed",
        "payment_attempt",
        attempt.id,  # one event per attempt: the outbox allows one per aggregate
        {
            "subscription_id": str(sub.id) if sub else str(pledge.id),
            "donor_id": str(pledge.donor_id) if pledge.donor_id else None,
            "donor_name": (donor.full_name if donor else None) or "Bağışçı",
            "amount_cents": installment.amount_cents,
            "currency": pledge.currency,
            "reason": error,
            "label": f"{pledge.title or 'Taahhüt'} ({installment.seq}. taksit)",
        },
    )
    return {"status": "failed", "error": error}


def usable_card(sub: Optional[Subscription], pledge: Pledge) -> bool:
    return bool(sub and sub.organization_id == pledge.organization_id and sub.donor_id == pledge.donor_id
                and sub.mode == "card" and sub.card_ref and sub.status in ("active", "paused"))


async def run_due(db_factory, today: Optional[date] = None, limit: int = 200) -> dict:
    """Once a day: each due, unpaid installment of an auto-charge pledge, one transaction each."""
    from app.services.offboarding import closed_organizations

    today = today or datetime.now(TZ).date()
    async with db_factory() as db:
        ids = (await db.execute(
            select(PledgeInstallment.id).join(Pledge, Pledge.id == PledgeInstallment.pledge_id).where(
                Pledge.auto_charge.is_(True), Pledge.status == "active", PledgeInstallment.status == "pending",
                PledgeInstallment.due_date <= today,
                Pledge.organization_id.not_in(closed_organizations()),
            ).order_by(PledgeInstallment.due_date).limit(limit)
        )).scalars().all()
    stats: dict[str, int] = {}
    for installment_id in ids:
        async with db_factory() as db:
            installment = (await db.execute(select(PledgeInstallment).where(PledgeInstallment.id == installment_id)
                                            .with_for_update(skip_locked=True))).scalar_one_or_none()
            if not installment or installment.status != "pending":
                continue
            pledge = (await db.execute(select(Pledge).options(selectinload(Pledge.installments))
                                       .where(Pledge.id == installment.pledge_id))).scalar_one()
            sub = await db.get(Subscription, pledge.card_subscription_id) if pledge.card_subscription_id else None
            if not pledge.auto_charge or not usable_card(sub, pledge):
                pledge.auto_charge = False
                pledge.last_charge_error = "Kayıtlı kart bulunamadı; otomatik çekim kapatıldı"
                await db.commit()
                stats["no_card"] = stats.get("no_card", 0) + 1
                continue
            try:
                outcome = await charge_installment(db, pledge, installment, sub)
                await db.commit()
            except Exception:
                logger.exception("Taksit çekilemedi: %s", installment_id)
                await db.rollback()
                outcome = {"status": "error"}
            stats[outcome["status"]] = stats.get(outcome["status"], 0) + 1
    return stats
