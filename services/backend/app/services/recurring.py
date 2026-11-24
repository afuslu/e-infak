"""Recurring donations ("Her ay düzenli").

An instruction is opened when a donor ticks "monthly" and the first payment is confirmed:
- mode "card": the donor saved the card on the provider's page and the provider can charge saved
  cards (iyzico). Every month the same amount is charged and a normal receipt is written.
- mode "reminder": no saved card (bank transfer, provider without card storage, box unticked).
  Every month the donor gets an SMS with a donation link; nothing is charged automatically.
Three failed charges in a row pause the instruction and the donor is told by SMS.
"""
from __future__ import annotations

import calendar
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.subscription import Subscription

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Europe/Istanbul")
MAX_FAILURES = 3
RETRY_AFTER = timedelta(days=2)
MONTHLY_KEYS = {"aylik", "monthly"}


def next_date(after: datetime, day: int) -> datetime:
    """Same day next month at 10:00 Istanbul time (the last day for short months)."""
    local = after.astimezone(TZ)
    year, month = (local.year + 1, 1) if local.month == 12 else (local.year, local.month + 1)
    day = min(max(day, 1), calendar.monthrange(year, month)[1])
    return datetime(year, month, day, 10, 0, tzinfo=TZ).astimezone(timezone.utc)


def _encrypt(card_ref: dict) -> Optional[str]:
    from app.services.tenant_credentials import CredentialsUnavailable, encrypt

    try:
        return encrypt(card_ref)
    except CredentialsUnavailable:
        logger.error("CREDENTIALS_ENCRYPTION_KEY yok; kart referansı saklanamadı, talimat hatırlatma modunda açıldı")
        return None


async def open_from_order(db: AsyncSession, order, attempt) -> list[Subscription]:
    """Open an instruction for every order line marked monthly (once per order)."""
    opened = []
    card_ref = attempt.__dict__.get("_card_ref") if attempt is not None else None
    for item in order.items:
        meta = item.metadata_json or {}
        if str(meta.get("periyot", "")).lower() not in MONTHLY_KEYS:
            continue
        exists = (await db.execute(select(Subscription.id).where(
            Subscription.source_order_id == order.id, Subscription.campaign_id == item.campaign_id,
        ))).first()
        if exists:
            continue
        stored = _encrypt(card_ref) if card_ref and order.payment_method == "credit_card" else None
        paid = order.paid_at or datetime.now(timezone.utc)
        day = paid.astimezone(TZ).day
        sub = Subscription(
            organization_id=order.organization_id, donor_id=order.donor_id, campaign_id=item.campaign_id,
            amount_cents=item.total_amount_cents, currency=order.currency, status="active",
            mode="card" if stored else "reminder", day_of_month=day, next_charge_date=next_date(paid, day),
            provider=attempt.provider if stored else None, card_ref=stored,
            card_last_4=attempt.card_last_4 if stored else None, card_brand=attempt.card_brand if stored else None,
            last_charged_at=paid if stored else None, source_order_id=order.id,
            manage_token=secrets.token_urlsafe(24),
        )
        db.add(sub)
        opened.append(sub)
    if opened:
        await db.flush()
    return opened


def _site_url(org) -> str:
    from app.core.config import settings

    if settings.ENVIRONMENT == "production" and getattr(org, "primary_domain", None):
        return f"https://{org.primary_domain}"
    return settings.PUBLIC_WEB_URL.rstrip("/")


def links(org, sub: Subscription) -> dict:
    base = _site_url(org)
    slug = sub.campaign.slug if sub.campaign else ""
    return {
        "odeme_linki": f"{base}/kampanyalar/{slug}" if slug else base,
        "yonet_linki": f"{base}/duzenli-bagis/{sub.manage_token}",
    }


async def _notify(db: AsyncSession, sub: Subscription, event: str) -> bool:
    from app.models.organization import Organization
    from app.services.sms_service import send_event_sms

    org = await db.get(Organization, sub.organization_id)
    donor = sub.donor
    if not donor or not donor.phone:
        return False
    from app.services.sms_service import format_amount

    queued = await send_event_sms(
        db, sub.organization_id, event, donor.phone, donor=donor, source="recurring",
        related=("subscription", sub.id),
        dedupe_key=f"{event}:{sub.id}:{sub.next_charge_date:%Y%m}",
        extra={**links(org, sub), "tutar": format_amount(sub.amount_cents), "para_birimi": sub.currency,
               "bagis_kalemi": sub.campaign.title if sub.campaign else "", "gun": sub.day_of_month},
    )
    return queued is not None


async def charge(db: AsyncSession, sub: Subscription, now: Optional[datetime] = None) -> dict:
    """Charge one card instruction now; the caller commits."""
    from app.api.v1.checkout import _finalize_paid_order, _load_order, apply_result
    from app.services.offboarding import is_closed

    if await is_closed(db, sub.organization_id):  # also stops a manual retry
        return {"status": "closed", "error": "Kurumun hizmeti kapandı; çekim yapılmadı"}
    from app.models.organization import Organization
    from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderItem, PaymentOrderStatus
    from app.payments import build_provider
    from app.payments.base import CheckoutContext, CheckoutLine, PaymentProviderError
    from app.services.tenant_credentials import decrypt, get_credentials

    now = now or datetime.now(timezone.utc)
    org = await db.get(Organization, sub.organization_id)
    donor = sub.donor
    period = sub.next_charge_date.astimezone(TZ).strftime("%Y%m")
    key = f"recurring:{sub.id}:{period}"
    # One order per instruction and month, so a retry never charges the month twice.
    order = (await db.execute(select(PaymentOrder).where(
        PaymentOrder.organization_id == sub.organization_id, PaymentOrder.idempotency_key == key,
    ))).scalar_one_or_none()
    if order and order.status == PaymentOrderStatus.PAID:
        return {"status": "already_paid"}
    if not order:
        order = PaymentOrder(
            organization_id=sub.organization_id, donor_id=sub.donor_id,
            merchant_payment_id=f"RC{sub.organization_id.hex[:6]}{uuid4().hex[:20]}".upper(), idempotency_key=key,
            payment_method="credit_card", status=PaymentOrderStatus.PENDING, total_cents=sub.amount_cents,
            currency=sub.currency, locale="tr",
        )
        db.add(order)
        await db.flush()
        db.add(PaymentOrderItem(order_id=order.id, campaign_id=sub.campaign_id, quantity=1,
                                unit_amount_cents=sub.amount_cents, total_amount_cents=sub.amount_cents,
                                donor_message="Düzenli bağış", metadata_json={"subscription_id": str(sub.id)}))
        await db.flush()
    attempt = PaymentAttempt(order_id=order.id, provider=sub.provider or "iyzico", session_token=uuid4().hex)
    db.add(attempt)
    await db.flush()
    try:
        provider = build_provider(sub.provider, await get_credentials(db, sub.organization_id, sub.provider),
                                  tenant_slug=org.slug)
        if not provider.supports_stored_cards:
            raise PaymentProviderError(f"{provider.label} kayıtlı karttan çekim desteklemiyor")
        ctx = CheckoutContext(
            merchant_payment_id=order.merchant_payment_id, total_cents=sub.amount_cents, currency=sub.currency,
            locale="tr", lines=[CheckoutLine(name=sub.campaign.title if sub.campaign else "Bağış", quantity=1,
                                             unit_cents=sub.amount_cents, product_code=str(sub.campaign_id))],
            customer_id=str(donor.id), customer_first_name=donor.first_name or "", customer_last_name=donor.last_name or "",
            customer_email=donor.email or "", customer_phone=donor.phone or "", customer_ip="127.0.0.1",
            user_agent="e-infak-recurring", return_url="", notify_url="", success_url="", fail_url="",
            customer_identity=donor.tc_no or "",
        )
        result = await provider.charge_stored(ctx, decrypt(sub.card_ref))
    except Exception as exc:  # provider down, credentials missing, card ref unreadable
        result = None
        error = str(exc)[:500]
    else:
        error = None if result.approved else (result.message or result.code or "Banka çekimi reddetti")[:500]
    if result is not None:
        apply_result(attempt, result)
    if error is None:
        loaded = await _load_order(db, order.id)
        await _finalize_paid_order(db, loaded, attempt, commit=False)
        sub.failed_attempts, sub.last_error, sub.last_charged_at = 0, None, now
        sub.next_charge_date = next_date(sub.next_charge_date, sub.day_of_month)
        return {"status": "paid", "order_id": str(order.id)}
    order.failure_message = error
    sub.failed_attempts += 1
    sub.last_error = error
    if sub.failed_attempts >= MAX_FAILURES:
        sub.status = "paused"
        await _notify(db, sub, "duzenli_basarisiz")
        return {"status": "paused", "error": error}
    sub.next_charge_date = now + RETRY_AFTER
    return {"status": "failed", "error": error}


async def remind(db: AsyncSession, sub: Subscription, now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    sent = await _notify(db, sub, "duzenli_hatirlatma")
    sub.last_reminded_at = now
    sub.next_charge_date = next_date(sub.next_charge_date, sub.day_of_month)
    return {"status": "reminded" if sent else "skipped"}


async def run_due(db_factory, now: Optional[datetime] = None, limit: int = 200) -> dict:
    """Process instructions whose day has come; one transaction per instruction."""
    from app.services.offboarding import closed_organizations

    now = now or datetime.now(timezone.utc)
    async with db_factory() as db:
        ids = (await db.execute(select(Subscription.id).where(
            Subscription.status == "active", Subscription.next_charge_date <= now,
            Subscription.organization_id.not_in(closed_organizations()),
        ).order_by(Subscription.next_charge_date).limit(limit))).scalars().all()
    stats: dict[str, int] = {}
    for sub_id in ids:
        async with db_factory() as db:
            sub = (await db.execute(select(Subscription).options(
                selectinload(Subscription.donor), selectinload(Subscription.campaign),
            ).where(Subscription.id == sub_id).with_for_update(skip_locked=True))).scalar_one_or_none()
            if not sub or sub.status != "active" or sub.next_charge_date > now:
                continue
            try:
                outcome = await (charge(db, sub, now) if sub.mode == "card" and sub.card_ref else remind(db, sub, now))
                await db.commit()
            except Exception:
                logger.exception("Düzenli bağış işlenemedi: %s", sub_id)
                await db.rollback()
                outcome = {"status": "error"}
            stats[outcome["status"]] = stats.get(outcome["status"], 0) + 1
    return stats
