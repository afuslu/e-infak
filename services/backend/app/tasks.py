import asyncio
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from celery import Celery
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import requests
from app.core.config import settings
from app.core.db import AsyncSessionLocal
from sqlalchemy.future import select

# Initialize Celery app
celery_app = Celery(
    "tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

@celery_app.task(name="app.tasks.send_email_task")
def send_email_task(to_email: str, subject: str, content: str):
    """Send an email. Production never reports success without a provider."""
    if settings.SENDGRID_API_KEY:
        try:
            sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
            message = Mail(
                from_email=(settings.FROM_EMAIL, settings.FROM_NAME),
                to_emails=to_email,
                subject=subject,
                html_content=content
            )
            sg.send(message)
            print(f"Email sent successfully to {to_email}")
        except Exception as e:
            print(f"SendGrid sending error: {e}")
            raise
    else:
        raise RuntimeError("SENDGRID_API_KEY yapılandırılmadı")
    return True

@celery_app.task(name="app.tasks.send_sms_task")
def send_sms_task(phone: str, message: str):
    """Send an SMS. Production never reports success without a provider."""
    if settings.NETGSM_USERNAME and settings.NETGSM_PASSWORD:
        try:
            url = "https://api.netgsm.com.tr/sms/send/get/"
            params = {
                "usercode": settings.NETGSM_USERNAME,
                "password": settings.NETGSM_PASSWORD,
                "gsmno": phone,
                "message": message,
                "msgheader": settings.NETGSM_SENDER,
                "dil": "TR"
            }
            res = requests.get(url, params=params, timeout=10)
            print(f"Netgsm response: {res.text}")
        except Exception as e:
            print(f"Netgsm sending error: {e}")
            raise
    else:
        raise RuntimeError("Netgsm bilgileri yapılandırılmadı")
    return True

async def _fetch_donation_and_send_receipt(donation_id: str):
    """Async helper to load donation data from database and compose receipt email"""
    from app.models.donation import Donation
    from app.models.campaign import Campaign
    from app.models.organization import Organization
    from app.models.donation import Donor
    import uuid

    async with AsyncSessionLocal() as session:
        # Fetch donation details along with campaign, organization, and donor
        try:
            db_uuid = uuid.UUID(donation_id) if isinstance(donation_id, str) else donation_id
        except ValueError:
            print(f"Invalid donation_id UUID string: {donation_id}")
            return False

        result = await session.execute(
            select(Donation, Campaign, Organization, Donor)
            .join(Campaign, Donation.campaign_id == Campaign.id)
            .join(Organization, Donation.organization_id == Organization.id)
            .join(Donor, Donation.donor_id == Donor.id)
            .where(Donation.id == db_uuid)
        )
        row = result.first()
        if not row:
            print(f"Donation with id {donation_id} not found in database.")
            return False
        
        donation, campaign, org, donor = row
        
        # Compose receipt HTML
        subject = f"Bağış Makbuzu - {org.name}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <h2 style="color: #0d9488; text-align: center;">TEŞEKKÜR EDERİZ</h2>
            <p>Sayın <b>{donor.first_name} {donor.last_name or ''}</b>,</p>
            <p>{org.name} bünyesinde yürüttüğümüz <b>{campaign.title}</b> kampanyasına yaptığınız yardım başarıyla alınmıştır.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background-color: #f9fafb;">
                    <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Bağış No</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">#{donation.receipt_number}</td>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Tutar</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold; color: #0d9488;">{donation.amount_lira} ₺</td>
                </tr>
                <tr style="background-color: #f9fafb;">
                    <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Tarih</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">{donation.created_at.strftime('%Y-%m-%d %H:%M') if donation.created_at else ''}</td>
                </tr>
            </table>
            
            <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 30px;">
                Bu e-posta E-İnfak sistemi tarafından otomatik olarak gönderilmiştir.
            </p>
        </div>
        """
        
        # Trigger sending
        if donor.email:
            send_email_task(donor.email, subject, html_content)
        
        # Trigger SMS notification as well
        if donor.phone:
            sms_msg = f"Sayin {donor.first_name} {donor.last_name or ''}, {campaign.title} bagisiniz alinmistir. Makbuz No: #{donation.receipt_number}. Tesekkur ederiz."
            send_sms_task(donor.phone, sms_msg)
        
        return True

@celery_app.task(name="app.tasks.send_donation_receipt_task")
def send_donation_receipt_task(donation_id: str):
    """Celery task wrapper to invoke async DB fetch and email send"""
    return asyncio.run(_fetch_donation_and_send_receipt(donation_id))


async def _process_subscriptions():
    # Automatic charging is deliberately disabled until the bank enables
    # tokenized recurring payments for this merchant.
    return {"processed": 0, "reason": "ziraatpay_recurring_not_enabled"}


@celery_app.task(name="app.tasks.process_subscriptions_task")
def process_subscriptions_task():
    """Celery task wrapper to bill monthly subscriptions"""
    return asyncio.run(_process_subscriptions())


async def _reconcile_pending_ziraat_payments():
    """Recover browser callbacks that never reached us by querying the bank."""
    from decimal import Decimal, InvalidOperation
    from app.api.v1.checkout import _finalize_paid_order, _load_order
    from app.models.payment import PaymentOrder, PaymentOrderStatus
    from app.utils.ziraatpay import ZiraatPayClient

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(PaymentOrder.id)
            .where(
                PaymentOrder.status == PaymentOrderStatus.PENDING,
                PaymentOrder.payment_method == "credit_card",
                PaymentOrder.query_next_at <= now,
            )
            .order_by(PaymentOrder.query_next_at)
            .limit(25)
            .with_for_update(skip_locked=True)
        )
        order_ids = [row[0] for row in result.all()]
        if order_ids:
            await session.execute(
                PaymentOrder.__table__.update()
                .where(PaymentOrder.id.in_(order_ids))
                .values(query_next_at=now + timedelta(minutes=30))
            )
        await session.commit()

    paid = 0
    reviewed = 0
    for order_id in order_ids:
        async with AsyncSessionLocal() as session:
            order = await _load_order(session, order_id)
            if not order or order.status != PaymentOrderStatus.PENDING:
                continue
            order.query_attempts += 1
            try:
                response = await ZiraatPayClient(order.organization.slug).query_transaction(
                    order.merchant_payment_id
                )
                transactions = response.get("transactionList") or []
                approved = None
                for transaction in transactions:
                    try:
                        amount_cents = int(
                            (Decimal(str(transaction.get("amount", "0"))) * 100)
                            .quantize(Decimal("1"))
                        )
                    except (InvalidOperation, ValueError):
                        continue
                    if (
                        transaction.get("transactionStatus") == "AP"
                        and amount_cents == order.total_cents
                        and transaction.get("currency") == order.currency
                    ):
                        approved = transaction
                        break
                if approved:
                    attempt = next((item for item in order.attempts if item.session_token), None)
                    if attempt:
                        attempt.pg_tran_id = approved.get("pgTranId")
                        attempt.response_code = approved.get("pgTranReturnCode") or "00"
                        attempt.response_message = approved.get("responseMsg")
                        attempt.card_last_4 = approved.get("panLast4")
                        attempt.card_brand = approved.get("paymentSystemType")
                        attempt.safe_response = ZiraatPayClient(order.organization.slug).safe_callback(approved)
                        attempt.completed_at = now
                        await _finalize_paid_order(session, order, attempt, commit=False)
                        paid += 1
                elif order.query_attempts >= 8:
                    order.status = PaymentOrderStatus.REVIEW
                    order.failure_message = "Banka sonucu otomatik doğrulanamadı; manuel inceleme gerekli"
                    order.query_next_at = None
                    reviewed += 1
                else:
                    delay_minutes = min(2 ** order.query_attempts, 120)
                    order.query_next_at = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)
            except Exception as exc:
                order.failure_message = f"Banka sorgusu geçici olarak başarısız: {str(exc)[:300]}"
                if order.query_attempts >= 8:
                    order.status = PaymentOrderStatus.REVIEW
                    order.query_next_at = None
                    reviewed += 1
                else:
                    delay_minutes = min(2 ** order.query_attempts, 120)
                    order.query_next_at = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)
            await session.commit()
    return {"checked": len(order_ids), "paid": paid, "review": reviewed}


@celery_app.task(name="app.tasks.reconcile_pending_ziraat_payments_task")
def reconcile_pending_ziraat_payments_task():
    return asyncio.run(_reconcile_pending_ziraat_payments())


async def _deliver_webhooks(event):
    from app.models.webhook_setting import WebhookSetting
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(WebhookSetting).where(
                WebhookSetting.organization_id == event.organization_id,
                WebhookSetting.is_active.is_(True),
            )
        )
        body = json.dumps(event.payload, separators=(",", ":"), sort_keys=True).encode()
        for hook in result.scalars().all():
            if "donation.paid" not in hook.subscribed_events.split(","):
                continue
            env_name = hook.secret_ref.removeprefix("env:")
            secret = os.environ.get(env_name)
            if not secret:
                raise RuntimeError(f"Webhook secret bulunamadı: {env_name}")
            signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            response = requests.post(
                hook.target_url,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "X-EInfak-Event": "donation.paid",
                    "X-EInfak-Signature": f"sha256={signature}",
                    "X-EInfak-Delivery": str(event.id),
                },
                timeout=15,
            )
            response.raise_for_status()


async def _process_outbox():
    from app.models.automation import OutboxEvent, OutboxStatus
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(minutes=30)
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(OutboxEvent)
            .where(
                (
                    OutboxEvent.status.in_([OutboxStatus.PENDING, OutboxStatus.FAILED])
                    | (
                        (OutboxEvent.status == OutboxStatus.PROCESSING)
                        & (OutboxEvent.processing_started_at < stale_before)
                    )
                ),
                OutboxEvent.next_attempt_at <= now,
            )
            .order_by(OutboxEvent.created_at)
            .limit(50)
            .with_for_update(skip_locked=True)
        )
        events = result.scalars().all()
        for event in events:
            event.status = OutboxStatus.PROCESSING
            event.processing_started_at = now
        await session.commit()

    processed = 0
    for event in events:
        async with AsyncSessionLocal() as session:
            current = await session.get(OutboxEvent, event.id)
            try:
                if current.event_type == "receipt.send":
                    ok = await _fetch_donation_and_send_receipt(str(current.aggregate_id))
                    if not ok:
                        raise RuntimeError("Makbuz verisi bulunamadı")
                elif current.event_type == "webhook.donation.paid":
                    await _deliver_webhooks(current)
                current.status = OutboxStatus.DELIVERED
                current.processing_started_at = None
                current.delivered_at = datetime.now(timezone.utc)
                current.last_error = None
                processed += 1
            except Exception as exc:
                current.attempts += 1
                current.status = OutboxStatus.FAILED
                current.processing_started_at = None
                current.last_error = str(exc)[:2000]
                delay_minutes = min(2 ** current.attempts, 360)
                current.next_attempt_at = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)
            await session.commit()
    return {"processed": processed, "total": len(events)}


@celery_app.task(name="app.tasks.process_outbox_task")
def process_outbox_task():
    return asyncio.run(_process_outbox())


celery_app.conf.beat_schedule = {
    "process-outbox-every-minute": {
        "task": "app.tasks.process_outbox_task",
        "schedule": 60.0,
    },
    "reconcile-ziraat-payments-every-minute": {
        "task": "app.tasks.reconcile_pending_ziraat_payments_task",
        "schedule": 60.0,
    },
}
