import asyncio
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_process_init
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


@worker_process_init.connect
def _fresh_connections_per_task(**_kwargs):
    """Every task runs in its own asyncio.run() loop. Pooled asyncpg connections stay bound to the
    loop that opened them, so the next task failed with "another operation is in progress" and the
    SMS dispatcher, outbox and payment checks stopped. In the worker, open a connection per use."""
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool
    AsyncSessionLocal.configure(bind=create_async_engine(settings.DATABASE_URL, poolclass=NullPool))

@celery_app.task(name="app.tasks.send_email_task")
def send_email_task(to_email: str, subject: str, content: str, attachment: dict | None = None):
    """Send an email. Production never reports success without a provider.

    attachment: {"filename": str, "content_b64": str, "type": str} (isteğe bağlı PDF eki)
    """
    if settings.SENDGRID_API_KEY:
        try:
            sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
            message = Mail(
                from_email=(settings.FROM_EMAIL, settings.FROM_NAME),
                to_emails=to_email,
                subject=subject,
                html_content=content
            )
            if attachment and attachment.get("content_b64"):
                from sendgrid.helpers.mail import (
                    Attachment, FileContent, FileName, FileType, Disposition,
                )
                message.attachment = Attachment(
                    FileContent(attachment["content_b64"]),
                    FileName(attachment.get("filename", "makbuz.pdf")),
                    FileType(attachment.get("type", "application/pdf")),
                    Disposition("attachment"),
                )
            sg.send(message)
            print(f"Email sent successfully to {to_email}")
        except Exception as e:
            print(f"SendGrid sending error: {e}")
            raise
    else:
        raise RuntimeError("SENDGRID_API_KEY yapılandırılmadı")
    return True

def deliver_sms(phone: str, message: str, account: dict) -> bool:
    """Send one SMS with the organisation's provider account. Never reports success without a provider."""
    from app.sms import deliver
    if account.get("disabled"):
        raise RuntimeError("Kurumun SMS hesabı yapılandırılmadı")
    result = deliver(phone, message, account)
    print(f"SMS sent via {result.provider}: {result.reference}")
    return True


async def _sms_account(organization_id):
    from app.services.tenant_credentials import sms_account
    async with AsyncSessionLocal() as session:
        return await sms_account(session, organization_id)


async def _enqueue_org_sms(phone: str, message: str, organization_id: str) -> bool:
    import uuid
    from app.services.sms_service import enqueue_sms
    async with AsyncSessionLocal() as session:
        await enqueue_sms(session, uuid.UUID(str(organization_id)), phone, message, source="auto")
        await session.commit()
    return True


@celery_app.task(name="app.tasks.send_sms_task")
def send_sms_task(phone: str, message: str, organization_id: str | None = None):
    """Older entry point. An organisation's SMS goes through its queue (and log); platform SMS is sent directly."""
    from app.services.tenant_credentials import platform_sms
    if organization_id:
        return asyncio.run(_enqueue_org_sms(phone, message, organization_id))
    return deliver_sms(phone, message, platform_sms())


@celery_app.task(name="app.tasks.send_sms_message_task", ignore_result=True)
def send_sms_message_task(message_id: str):
    """Send one queued SmsMessage."""
    from app.services.sms_service import process_message
    return asyncio.run(process_message(message_id))


@celery_app.task(name="app.tasks.send_sms_batch_task", ignore_result=True)
def send_sms_batch_task(batch_id: str):
    """Send the messages of one bulk SMS."""
    from app.services.sms_service import run_batch
    return asyncio.run(run_batch(batch_id))


@celery_app.task(name="app.tasks.dispatch_due_sms_task", ignore_result=True)
def dispatch_due_sms_task():
    """Every minute: scheduled SMS whose time has come, retries, and messages no worker picked up."""
    from app.services.sms_service import dispatch_due
    return asyncio.run(dispatch_due())


@celery_app.task(name="app.tasks.send_mail_batch_task", ignore_result=True)
def send_mail_batch_task(batch_id: str):
    """Send one bulk e-mail ("Mail Gönderimleri")."""
    from app.services.mailing import run_batch
    return asyncio.run(run_batch(AsyncSessionLocal, batch_id))


@celery_app.task(name="app.tasks.dispatch_due_mail_task", ignore_result=True)
def dispatch_due_mail_task():
    """Every minute: scheduled bulk e-mails whose time has come."""
    from app.services.mailing import due_batches, run_batch

    async def _run():
        for batch_id in await due_batches(AsyncSessionLocal):
            await run_batch(AsyncSessionLocal, batch_id)
    return asyncio.run(_run())


@celery_app.task(name="app.tasks.dispatch_whatsapp_task", ignore_result=True)
def dispatch_whatsapp_task():
    """Every minute (and right after a bulk send): queued WhatsApp messages."""
    from app.services.whatsapp import dispatch
    return asyncio.run(dispatch(AsyncSessionLocal))


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
        
        # Compose receipt HTML (donor-entered values are escaped)
        from html import escape
        donor_html = escape(f"{donor.first_name} {donor.last_name or ''}".strip())
        campaign_html = escape(campaign.title or "")
        on_behalf_html = (
            f"<p>Bu bağış <b>{escape(donation.on_behalf_of)}</b> adına yapılmıştır.</p>"
            if donation.on_behalf_of else ""
        )
        subject = f"Bağış Makbuzu - {org.name}"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <h2 style="color: #0d9488; text-align: center;">TEŞEKKÜR EDERİZ</h2>
            <p>Sayın <b>{donor_html}</b>,</p>
            <p>{escape(org.name)} bünyesinde yürüttüğümüz <b>{campaign_html}</b> kampanyasına yaptığınız yardım başarıyla alınmıştır.</p>
            {on_behalf_html}
            
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
        
        # Resmi PDF makbuzu üret (mümkünse) ve e-posta ekine bağla
        attachment = None
        try:
            import base64
            from app.services.receipt_lines import receipt_print_data
            from app.utils.receipt_pdf import build_receipt_pdf

            verify_base = (
                f"https://{org.primary_domain}"
                if settings.ENVIRONMENT == "production" and getattr(org, "primary_domain", None)
                else settings.PUBLIC_WEB_URL
            )
            pdf_bytes = build_receipt_pdf(
                organization=org,
                campaign=campaign,
                donor_name=donor.full_name if not donation.is_anonymous else "Anonim Bağışçı",
                receipt_number=donation.receipt_number,
                **await receipt_print_data(session, donation),
                currency=donation.currency or "TRY",
                payment_method=donation.payment_method.value if hasattr(donation.payment_method, "value") else str(donation.payment_method),
                paid_at=donation.paid_at or donation.created_at,
                status=getattr(donation.status, "value", donation.status) if getattr(donation.status, "value", donation.status) in {"refunded", "cancelled"} else "valid",
                verify_base_url=verify_base,
                on_behalf_of=donation.on_behalf_of,
                official_receipt_no=donation.official_receipt_no,
            )
            attachment = {
                "filename": f"makbuz-{donation.receipt_number}.pdf",
                "content_b64": base64.b64encode(pdf_bytes).decode("ascii"),
                "type": "application/pdf",
            }
        except Exception as pdf_err:  # PDF üretimi makbuz e-postasını engellemez
            print(f"Receipt PDF generation failed for {donation.receipt_number}: {pdf_err}")

        # Trigger sending
        if donor.email:
            send_email_task(donor.email, subject, html_content, attachment)

        # Trigger SMS notification as well
        from app.services.sms_service import receipt_event, receipt_key, send_event_sms
        honoree_phone = (donation.payment_details or {}).get("on_behalf_of_phone")
        if donor.phone or honoree_phone:
            # Staff-entered receipts and online donations have their own template and on/off switch.
            try:
                if donor.phone:
                    await send_event_sms(
                        session, donation.organization_id, receipt_event(donation.payment_provider), donor.phone,
                        donor=donor, donation=donation, related=("donation", donation.id), source="receipt",
                        dedupe_key=receipt_key(donation.id),
                    )
                if honoree_phone and donation.on_behalf_of:
                    await send_event_sms(
                        session, donation.organization_id, "adina_bagis", honoree_phone,
                        donor=donor, donation=donation, related=("donation", donation.id), source="receipt",
                        dedupe_key=f"adina_bagis:{donation.id}",
                    )
                await session.commit()
            except Exception as sms_err:
                await session.rollback()
                print(f"Receipt SMS failed for {donation.receipt_number}: {sms_err}")
        
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


def _note_query_result(attempt, result) -> None:
    """Keep what the bank said about an unapproved order, without closing the attempt (it may still be paid)."""
    attempt.response_code = (result.code or "")[:16] or attempt.response_code
    attempt.response_message = (result.message or "")[:500] or attempt.response_message


def _hold_for_review(session, order, attempt) -> None:
    from app.models.payment import PaymentOrderStatus
    from app.services import staff_notify

    order.status = PaymentOrderStatus.REVIEW
    order.query_next_at = None
    staff_notify.queue(session, order.organization_id, "push.payment.failed", "payment_order", order.id,
                       {"order_id": str(order.id), "attempt_id": str(attempt.id) if attempt else None})


async def _reconcile_pending_ziraat_payments():
    """Recover browser callbacks that never reached us by querying the bank."""
    from app.api.v1.checkout import _finalize_paid_order, _load_order, apply_result, attempt_provider, result_matches_order
    from app.models.payment import PaymentOrder, PaymentOrderStatus

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
            attempt = None
            try:
                attempt = next((item for item in sorted(order.attempts, key=lambda a: a.created_at, reverse=True)
                                if item.session_token), None)
                result = None
                if attempt:
                    provider = await attempt_provider(session, order, attempt)
                    result = await provider.query(order.merchant_payment_id, order.total_cents, order.currency)
                if result is not None and result.approved and result_matches_order(order, result):
                    apply_result(attempt, result)
                    await _finalize_paid_order(session, order, attempt, commit=False)
                    paid += 1
                elif order.query_attempts >= 8:
                    if result is not None:
                        _note_query_result(attempt, result)
                        order.failure_code = (result.code or "")[:64] or None
                    reason = f" Banka yanıtı: {result.message}" if result is not None and result.message else ""
                    order.failure_message = f"Bağışçı bankadan dönmedi, banka onayı bulunamadı; elle kontrol gerekli.{reason}"
                    _hold_for_review(session, order, attempt)
                    reviewed += 1
                else:
                    if result is not None:
                        _note_query_result(attempt, result)
                    delay_minutes = min(2 ** order.query_attempts, 120)
                    order.query_next_at = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)
            except Exception as exc:
                order.failure_message = f"Banka sorgusu geçici olarak başarısız: {str(exc)[:300]}"
                if order.query_attempts >= 8:
                    _hold_for_review(session, order, attempt)
                    reviewed += 1
                else:
                    delay_minutes = min(2 ** order.query_attempts, 120)
                    order.query_next_at = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)
            await session.commit()
    return {"checked": len(order_ids), "paid": paid, "review": reviewed}


@celery_app.task(name="app.tasks.reconcile_pending_ziraat_payments_task")
def reconcile_pending_ziraat_payments_task():
    return asyncio.run(_reconcile_pending_ziraat_payments())


def _webhook_secret(hook) -> str:
    ref = hook.secret_ref or ""
    if ref.startswith("enc:"):
        from app.services.tenant_credentials import decrypt
        return decrypt(ref[4:])["secret"]
    # Older hooks named an environment variable. Only dedicated variables are honoured, so a hook
    # cannot sign with (and leak through signatures) DATABASE_URL, SECRET_KEY and the like.
    env_name = ref.removeprefix("env:")
    if not env_name.startswith("EINFAK_WEBHOOK_"):
        raise RuntimeError("Webhook sırrı geçersiz; webhook'u silip yeniden ekleyin")
    secret = os.environ.get(env_name)
    if not secret:
        raise RuntimeError(f"Webhook secret bulunamadı: {env_name}")
    return secret


async def _deliver_webhooks(event):
    from app.models.webhook_setting import WebhookSetting
    from app.utils.net import assert_public_url

    event_name = event.event_type.removeprefix("webhook.")
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(WebhookSetting).where(
                WebhookSetting.organization_id == event.organization_id,
                WebhookSetting.is_active.is_(True),
            )
        )
        body = json.dumps({"event": event_name, "data": event.payload}, separators=(",", ":"), sort_keys=True).encode()
        failures = []
        for hook in result.scalars().all():
            if event_name not in hook.subscribed_events.split(","):
                continue
            try:
                # Checked again at send time: DNS may have changed since the hook was saved.
                url = assert_public_url(hook.target_url)
                signature = hmac.new(_webhook_secret(hook).encode(), body, hashlib.sha256).hexdigest()
                response = requests.post(
                    url,
                    data=body,
                    headers={
                        "Content-Type": "application/json",
                        "X-EInfak-Event": event_name,
                        "X-EInfak-Signature": f"sha256={signature}",
                        "X-EInfak-Delivery": str(event.id),
                    },
                    timeout=10,
                    allow_redirects=False,
                )
                response.raise_for_status()
            except Exception as exc:
                failures.append(f"{hook.target_url}: {exc}")
        if failures:
            raise RuntimeError("; ".join(failures)[:1500])


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
                elif current.event_type.startswith("webhook."):
                    await _deliver_webhooks(current)
                elif current.event_type.startswith("push."):
                    from app.services.staff_notify import handle_event
                    await handle_event(session, current)
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


@celery_app.task(name="app.tasks.sync_zakat_rates_task")
def sync_zakat_rates_task():
    """Sync TCMB gold & currency rates to ZakatSetting for all active organizations."""
    from app.utils.tcmb import fetch_tcmb_rates
    from app.models.zakat_setting import ZakatSetting

    rates = fetch_tcmb_rates(force_refresh=True)
    # Only a fresh price is written; otherwise every organisation keeps its last real one.
    gold_price = None if rates.get("stale") else rates.get("GOLD_GRAM")
    nisap = None if rates.get("stale") else rates.get("NISAP_LIRA")

    async def _sync_fx(session):
        """Store currency rates only from a successful fetch; conversion refuses stale rates."""
        from datetime import datetime, timezone
        from decimal import Decimal
        from sqlalchemy.dialects.postgresql import insert
        from app.models.fx import FxRate
        from app.utils.tcmb import fetch_tcmb_currency_rates

        try:
            fx = fetch_tcmb_currency_rates()
        except Exception as exc:  # keep the previous rates; they expire after 7 days
            print(f"TCMB currency sync failed: {exc}")
            return
        now = datetime.now(timezone.utc)
        for code, rate in fx.items():
            stmt = insert(FxRate).values(currency=code, rate_try=Decimal(str(rate)), fetched_at=now)
            await session.execute(stmt.on_conflict_do_update(
                index_elements=[FxRate.currency], set_={"rate_try": stmt.excluded.rate_try, "fetched_at": now},
            ))

    async def _sync():
        async with AsyncSessionLocal() as session:
            await _sync_fx(session)
            if not gold_price:
                await session.commit()
                return 0
            res = await session.execute(select(ZakatSetting).where(ZakatSetting.is_auto_sync.is_(True)))
            settings_list = res.scalars().all()
            for st in settings_list:
                st.gold_price_per_gram = gold_price
                st.nisap_amount_lira = nisap
            await session.commit()
            return len(settings_list)

    return asyncio.run(_sync())


@celery_app.task(name="app.tasks.process_outbox_task")
def process_outbox_task():
    return asyncio.run(_process_outbox())


async def deliver_outbox_event(event_id: str, own_engine: bool = False) -> bool:
    """Deliver one push event right after the request that queued it committed.

    Claims the row only if it is still pending, so the minute-by-minute outbox runner and this
    never send the same notification twice. A failure leaves the row for the runner to retry.
    """
    from uuid import UUID as _UUID
    from sqlalchemy import update
    from app.models.automation import OutboxEvent, OutboxStatus
    from app.services.staff_notify import handle_event

    engine = None
    maker = AsyncSessionLocal
    if own_engine:  # called from a request thread with its own event loop: do not share the app pool
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
        from sqlalchemy.pool import NullPool
        engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
        maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with maker() as session:
            now = datetime.now(timezone.utc)
            claimed = (await session.execute(
                update(OutboxEvent)
                .where(OutboxEvent.id == _UUID(event_id), OutboxEvent.status == OutboxStatus.PENDING)
                .values(status=OutboxStatus.PROCESSING, processing_started_at=now)
                .returning(OutboxEvent.id)
            )).scalar_one_or_none()
            await session.commit()
            if not claimed:
                return False
            current = await session.get(OutboxEvent, claimed)
            try:
                await handle_event(session, current)
                current.status = OutboxStatus.DELIVERED
                current.delivered_at = datetime.now(timezone.utc)
                current.last_error = None
            except Exception as exc:  # noqa: BLE001 - the outbox runner retries with backoff
                await session.rollback()
                current = await session.get(OutboxEvent, claimed)
                current.status = OutboxStatus.FAILED
                current.attempts += 1
                current.last_error = str(exc)[:2000]
                current.next_attempt_at = datetime.now(timezone.utc) + timedelta(minutes=2)
            current.processing_started_at = None
            await session.commit()
            return current.status == OutboxStatus.DELIVERED
    finally:
        if engine is not None:
            await engine.dispose()


@celery_app.task(name="app.tasks.deliver_outbox_event_task")
def deliver_outbox_event_task(event_id: str):
    return asyncio.run(deliver_outbox_event(event_id))


async def _send_daily_digests():
    from app.models.organization import Organization
    from app.services.staff_notify import send_daily_digest

    sent = 0
    async with AsyncSessionLocal() as session:
        org_ids = (await session.execute(select(Organization.id).where(Organization.is_active.is_(True)))).scalars().all()
    for org_id in org_ids:
        async with AsyncSessionLocal() as session:
            try:
                sent += await send_daily_digest(session, org_id)
                await session.commit()
            except Exception:  # noqa: BLE001 - one organisation must not stop the others
                await session.rollback()
    return {"pushed": sent, "organizations": len(org_ids)}


@celery_app.task(name="app.tasks.send_daily_digests_task")
def send_daily_digests_task():
    """21:00 in Türkiye: today's money in, by channel, to staff who see every receipt."""
    return asyncio.run(_send_daily_digests())


async def _send_weekly_digests():
    from app.models.organization import Organization
    from app.services.staff_notify import send_weekly_digest

    sent = 0
    async with AsyncSessionLocal() as session:
        org_ids = (await session.execute(select(Organization.id).where(Organization.is_active.is_(True)))).scalars().all()
    for org_id in org_ids:
        async with AsyncSessionLocal() as session:
            try:
                sent += await send_weekly_digest(session, org_id)
                await session.commit()
            except Exception:  # noqa: BLE001
                await session.rollback()
    return {"pushed": sent, "organizations": len(org_ids)}


@celery_app.task(name="app.tasks.send_weekly_digests_task")
def send_weekly_digests_task():
    """Sunday 20:00 in Türkiye: weekly inflow digest."""
    return asyncio.run(_send_weekly_digests())


async def _send_money_box_due_alerts():
    from app.models.organization import Organization
    from app.services.staff_notify import send_money_box_due_alerts

    sent = 0
    async with AsyncSessionLocal() as session:
        org_ids = (await session.execute(select(Organization.id).where(Organization.is_active.is_(True)))).scalars().all()
    for org_id in org_ids:
        async with AsyncSessionLocal() as session:
            try:
                sent += await send_money_box_due_alerts(session, org_id)
                await session.commit()
            except Exception:  # noqa: BLE001
                await session.rollback()
    return {"pushed": sent, "organizations": len(org_ids)}


@celery_app.task(name="app.tasks.send_money_box_due_alerts_task")
def send_money_box_due_alerts_task():
    """Daily 09:00 in Türkiye: alert operations staff about overdue money boxes."""
    return asyncio.run(_send_money_box_due_alerts())


async def _verify_pending_domains():
    from app.services import domains
    async with AsyncSessionLocal() as session:
        return await domains.verify_pending(session)


@celery_app.task(name="app.tasks.verify_pending_domains_task")
def verify_pending_domains_task():
    return asyncio.run(_verify_pending_domains())


@celery_app.task(name="app.tasks.warm_certificates_task")
def warm_certificates_task(hosts: list[str]):
    """Make the Caddy certificate service obtain (or renew) certificates for these names."""
    from app.services import domains
    return asyncio.run(domains.warm_hosts(hosts))


async def _warm_all_certificates():
    from app.services import domains
    async with AsyncSessionLocal() as session:
        hosts = await domains.served_hosts(session)
    return await domains.warm_hosts(hosts)


@celery_app.task(name="app.tasks.warm_all_certificates_task")
def warm_all_certificates_task():
    """Daily: loads every certificate into Caddy so it renews them before they expire."""
    return asyncio.run(_warm_all_certificates())


BANK_ERROR_PAUSE_SECONDS = 15 * 60


async def _sync_bank_accounts():
    import redis.asyncio as aioredis

    from app.banking.sync import sync_all

    client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

    async def paused(account_id: str) -> bool:
        return bool(await client.exists(f"bank-sync:pause:{account_id}"))

    async def pause(account_id: str) -> None:
        await client.set(f"bank-sync:pause:{account_id}", "1", ex=BANK_ERROR_PAUSE_SECONDS)

    try:
        # one run at a time: a slow bank must not let the next tick query the same accounts again
        if not await client.set("bank-sync:running", "1", nx=True, ex=900):
            return []
        try:
            async with AsyncSessionLocal() as session:
                return await sync_all(session, paused=paused, pause=pause)
        finally:
            await client.delete("bank-sync:running")
    finally:
        await client.aclose()


@celery_app.task(name="app.tasks.sync_bank_accounts_task")
def sync_bank_accounts_task():
    """Every minute: pull new movements of the bank accounts that are due (per-bank interval) and match them to donors."""
    return asyncio.run(_sync_bank_accounts())


async def _collect_sms_reports():
    from app.services.sms_service import collect_reports
    async with AsyncSessionLocal() as session:
        totals = await collect_reports(session)
        await session.commit()
        return totals


@celery_app.task(name="app.tasks.collect_sms_reports_task", ignore_result=True)
def collect_sms_reports_task():
    """Every two minutes: delivery reports of recently sent SMS."""
    return asyncio.run(_collect_sms_reports())


async def _send_sms_reminders():
    from app.services.sms_reminders import send_due_reminders
    async with AsyncSessionLocal() as session:
        queued = await send_due_reminders(session)
        await session.commit()
        return queued


@celery_app.task(name="app.tasks.send_sms_reminders_task", ignore_result=True)
def send_sms_reminders_task():
    """Every morning: dues and pledge-installment reminders of organisations that switched them on."""
    return asyncio.run(_send_sms_reminders())


@celery_app.task(name="app.tasks.charge_due_pledge_installments_task", ignore_result=True)
def charge_due_pledge_installments_task():
    """Sponsorluk / su kuyusu taksitleri: due installments of auto-charge pledges, from the stored card."""
    from app.services.pledge_autocharge import run_due
    return asyncio.run(run_due(AsyncSessionLocal))


@celery_app.task(name="app.tasks.process_recurring_donations_task")
def process_recurring_donations_task():
    """Monthly donations whose day has come: charge saved cards or send the reminder SMS."""
    from app.services.recurring import run_due

    return asyncio.run(run_due(AsyncSessionLocal))


@celery_app.task(name="app.tasks.compute_donor_insights_task")
def compute_donor_insights_task():
    """Nightly donor analysis (RFM segments, churn risk, expected next gift) for every organisation."""
    from app.services.insights import compute_all

    return asyncio.run(compute_all(AsyncSessionLocal))


async def _send_due_reminders():
    from app.services.reminders import send_due

    async with AsyncSessionLocal() as db:
        return await send_due(db)


@celery_app.task(name="app.tasks.send_due_reminders_task", ignore_result=True)
def send_due_reminders_task():
    """Every minute: push Hatırlatıcı reminders whose time has come to the staff member who wrote them."""
    return asyncio.run(_send_due_reminders())


async def _build_data_export(export_id: str):
    from uuid import UUID
    from sqlalchemy.orm import selectinload
    from app.models.data_export import DataExport
    from app.models.user import User
    from app.services import data_export, staff_notify

    async with AsyncSessionLocal() as session:
        export = (await session.execute(select(DataExport).where(
            DataExport.id == UUID(export_id), DataExport.status == "queued").with_for_update(skip_locked=True))).scalar_one_or_none()
        if not export:
            return {"skipped": True}
        export.status = "running"
        await session.commit()
        try:
            await data_export.build(session, export)
            title, body = "Tam yedek hazır", f"{data_export.KEEP_DAYS} gün boyunca Verilerim ve Ayrılma sayfasından indirebilirsiniz."
        except Exception as exc:
            await session.rollback()
            export = await session.get(DataExport, UUID(export_id), populate_existing=True)
            data_export.export_path(export).unlink(missing_ok=True)
            export.status, export.finished_at = "failed", datetime.now(timezone.utc)
            export.password_enc = None
            export.error = str(exc)[:500] if isinstance(exc, RuntimeError) else "Yedek hazırlanamadı; destekle görüşün"
            print(f"data export {export_id} failed: {exc!r}")
            title, body = "Tam yedek hazırlanamadı", export.error
        status = export.status
        await session.commit()
        if export.requested_by:
            user = (await session.execute(select(User).options(selectinload(User.staff_role))
                                          .where(User.id == export.requested_by))).scalar_one_or_none()
            if user:
                await staff_notify.deliver(session, export.organization_id, [user], kind="system_alert", setting="system_alert",
                                           title=title, body=body, data={"export_id": export_id})
                await session.commit()
        return {"status": status}


@celery_app.task(name="app.tasks.build_data_export_task")
def build_data_export_task(export_id: str):
    return asyncio.run(_build_data_export(export_id))


async def _clean_data_exports():
    """Remove expired backup files and mark interrupted ones as failed."""
    from app.models.data_export import DataExport
    from app.services.data_export import export_path

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as session:
        for export in (await session.execute(select(DataExport).where(
                DataExport.status == "ready", DataExport.expires_at < now))).scalars().all():
            export_path(export).unlink(missing_ok=True)
            export.status = "expired"
        for export in (await session.execute(select(DataExport).where(
                DataExport.status.in_(("queued", "running")), DataExport.created_at < now - timedelta(hours=6)))).scalars().all():
            export_path(export).unlink(missing_ok=True)
            export.password_enc = None
            export.status, export.error = "failed", "Yedek yarıda kaldı; yeniden başlatın"
        await session.commit()


@celery_app.task(name="app.tasks.clean_data_exports_task")
def clean_data_exports_task():
    return asyncio.run(_clean_data_exports())


@celery_app.task(name="app.tasks.send_closing_reminders_task")
def send_closing_reminders_task():
    from app.services.offboarding import send_reminders
    return asyncio.run(send_reminders(AsyncSessionLocal))


celery_app.conf.beat_schedule = {
    "closing-reminders-daily": {
        "task": "app.tasks.send_closing_reminders_task",
        "schedule": crontab(hour=7, minute=0),  # 10:00 Istanbul
    },
    "clean-data-exports-hourly": {
        "task": "app.tasks.clean_data_exports_task",
        "schedule": 3600.0,
    },
    "send-due-reminders-every-minute": {
        "task": "app.tasks.send_due_reminders_task",
        "schedule": 60.0,
    },
    "recurring-donations-hourly": {
        "task": "app.tasks.process_recurring_donations_task",
        "schedule": 3600.0,  # instructions are due at 10:00 Istanbul time; hourly also retries soon after
    },
    "charge-due-pledge-installments": {
        "task": "app.tasks.charge_due_pledge_installments_task",
        "schedule": crontab(hour=7, minute=30),  # 10:30 Istanbul; one try per day per installment
    },
    "donor-insights-nightly": {
        "task": "app.tasks.compute_donor_insights_task",
        "schedule": crontab(hour=0, minute=30),  # 03:30 in Türkiye
    },
    "collect-sms-reports": {
        "task": "app.tasks.collect_sms_reports_task",
        "schedule": 120.0,
    },
    "sms-reminders-every-morning": {
        "task": "app.tasks.send_sms_reminders_task",
        "schedule": crontab(hour=7, minute=0),  # 10:00 in Türkiye (Celery runs on UTC)
    },
    "sync-bank-accounts": {
        "task": "app.tasks.sync_bank_accounts_task",
        "schedule": 60.0,
        "options": {"expires": 50},  # a tick that waited in the queue is replaced by the next one
    },
    "verify-pending-domains": {
        "task": "app.tasks.verify_pending_domains_task",
        "schedule": 300.0,
    },
    "warm-certificates-daily": {
        "task": "app.tasks.warm_all_certificates_task",
        "schedule": 86400.0,
    },
    "dispatch-whatsapp-every-minute": {
        "task": "app.tasks.dispatch_whatsapp_task",
        "schedule": 60.0,
    },
    "dispatch-due-mail-every-minute": {
        "task": "app.tasks.dispatch_due_mail_task",
        "schedule": 60.0,
    },
    "dispatch-due-sms-every-minute": {
        "task": "app.tasks.dispatch_due_sms_task",
        "schedule": 60.0,
    },
    "staff-daily-digest": {
        "task": "app.tasks.send_daily_digests_task",
        "schedule": crontab(hour=18, minute=0),  # 21:00 in Türkiye (Celery runs on UTC)
    },
    "staff-weekly-digest": {
        "task": "app.tasks.send_weekly_digests_task",
        "schedule": crontab(hour=17, minute=0, day_of_week="sun"),  # Pazar 20:00 TR
    },
    "money-box-due-alerts": {
        "task": "app.tasks.send_money_box_due_alerts_task",
        "schedule": crontab(hour=6, minute=0),  # Her gün 09:00 TR
    },
        "process-outbox-every-minute": {
        "task": "app.tasks.process_outbox_task",
        "schedule": 60.0,
    },
    "reconcile-ziraat-payments-every-minute": {
        "task": "app.tasks.reconcile_pending_ziraat_payments_task",
        "schedule": 60.0,
    },
    "sync-zakat-rates-hourly": {
        "task": "app.tasks.sync_zakat_rates_task",
        "schedule": 3600.0,
    },
    "check-platform-subscriptions-daily": {
        "task": "app.tasks.check_platform_subscriptions_task",
        "schedule": crontab(hour=6, minute=0),
    },
    "recover-abandoned-donations-hourly": {
        "task": "app.tasks.recover_abandoned_donations_task",
        "schedule": 3600.0,
    },
}


@celery_app.task(name="app.tasks.check_platform_subscriptions_task")
def check_platform_subscriptions_task():
    """Mark expired active subscriptions as past_due and remind expiring ones."""
    from datetime import datetime, timedelta, timezone
    from html import escape
    from sqlalchemy import select
    from app.core.config import settings
    from app.models.organization import Organization

    async def _run():
        now = datetime.now(timezone.utc)
        soon = now + timedelta(days=3)
        async with _session() as db:
            orgs = (await db.execute(
                select(Organization).where(
                    Organization.is_active.is_(True),
                    Organization.subscription_ends_at.isnot(None),
                )
            )).scalars().all()
            from app.models.platform import PlatformAuditLog
            expired_count = 0
            reminded_count = 0
            for org in orgs:
                ends = org.subscription_ends_at
                if ends.tzinfo is None:
                    ends = ends.replace(tzinfo=timezone.utc)
                status_now = org.subscription_status or "active"
                if ends < now and status_now in ("active", "trial"):
                    org.subscription_status = "past_due"
                    db.add(PlatformAuditLog(
                        platform_user_id=None,
                        organization_id=org.id,
                        action="abonelik_suresi_doldu",
                        details={"previous_status": status_now, "ended_at": ends.isoformat()},
                    ))
                    expired_count += 1
                elif now <= ends <= soon and status_now in ("active", "trial"):
                    if settings.SENDGRID_API_KEY and org.email:
                        days_left = max(1, (ends - now).days)
                        html = (
                            f"<p>Merhaba {escape(org.name)} yetkilisi,</p>"
                            f"<p>E-İnfak platform aboneliğinizin bitmesine {days_left} gün kalmıştır "
                            f"(Bitiş: {ends.strftime('%d.%m.%Y')}).</p>"
                            f"<p>Kesintisiz hizmet için yenileme işlemini gerçekleştirebilirsiniz.</p>"
                        )
                        try:
                            send_email_task(org.email, f"{org.name} — Abonelik Yenileme Hatırlatması", html)
                            reminded_count += 1
                        except Exception:
                            pass
            await db.commit()
            return {"expired_marked": expired_count, "reminded": reminded_count}

    return _run_async(_run())


@celery_app.task(name="app.tasks.recover_abandoned_donations_task")
def recover_abandoned_donations_task():
    """Send a gentle single SMS reminder for pending donations abandoned 1-2 hours ago (for SMS-enabled orgs)."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from app.core.plans import Feature, org_features
    from app.models.organization import Organization
    from app.models.payment import PaymentOrder, PaymentOrderStatus
    from app.models.sms_message import SmsMessage

    async def _run():
        now = datetime.now(timezone.utc)
        start = now - timedelta(hours=2)
        end = now - timedelta(hours=1)
        async with _session() as db:
            orders = (await db.execute(
                select(PaymentOrder).where(
                    PaymentOrder.status == PaymentOrderStatus.PENDING,
                    PaymentOrder.donor_phone.isnot(None),
                    PaymentOrder.created_at >= start,
                    PaymentOrder.created_at <= end,
                ).limit(50)
            )).scalars().all()
            sent = 0
            for order in orders:
                org = await db.get(Organization, order.organization_id)
                if not org or not org.is_active or Feature.SMS_DONATION not in org_features(org):
                    continue
                marker = f"abandoned:{order.id}"
                already = (await db.execute(
                    select(SmsMessage.id).where(
                        SmsMessage.organization_id == org.id,
                        SmsMessage.provider_ref == marker,
                    )
                )).scalar_one_or_none()
                if already:
                    continue
                db.add(SmsMessage(
                    organization_id=org.id,
                    phone=order.donor_phone,
                    body=f"{org.name}: Yarim kalan bagis isleminizi dilediginiz zaman web sitemizden tamamlayabilirsiniz. Tesekkur ederiz.",
                    status="queued",
                    provider_ref=marker,
                ))
                sent += 1
            await db.commit()
            return {"queued": sent}

    return _run_async(_run())
