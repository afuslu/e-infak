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


@celery_app.task(name="app.tasks.send_sms_task")
def send_sms_task(phone: str, message: str, organization_id: str | None = None):
    """Queue-friendly SMS. With `organization_id` the organisation's own SMS account is used."""
    from app.services.tenant_credentials import platform_sms
    account = asyncio.run(_sms_account(organization_id)) if organization_id else platform_sms()
    return deliver_sms(phone, message, account)


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
                amount_cents=donation.amount_cents,
                currency=donation.currency or "TRY",
                payment_method=donation.payment_method.value if hasattr(donation.payment_method, "value") else str(donation.payment_method),
                paid_at=donation.paid_at or donation.created_at,
                status=getattr(donation.status, "value", donation.status) if getattr(donation.status, "value", donation.status) in {"refunded", "cancelled"} else "valid",
                verify_base_url=verify_base,
                on_behalf_of=donation.on_behalf_of,
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
        if donor.phone:
            sms_msg = f"Sayin {donor.first_name} {donor.last_name or ''}, {campaign.title} bagisiniz alinmistir. Makbuz No: #{donation.receipt_number}. Tesekkur ederiz."
            from app.services.tenant_credentials import sms_account
            try:
                deliver_sms(donor.phone, sms_msg, await sms_account(session, donation.organization_id))
            except Exception as sms_err:
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


@celery_app.task(name="app.tasks.notify_kurban_slaughter_task")
def notify_kurban_slaughter_task(animal_id: str, video_url: str):
    """Notify all shareholders via SMS and Email when their kurban animal is slaughtered."""
    from app.models.kurban import KurbanShare
    from app.models.donation import Donor
    import uuid

    async def _notify():
        async with AsyncSessionLocal() as session:
            try:
                anim_uuid = uuid.UUID(animal_id) if isinstance(animal_id, str) else animal_id
            except ValueError:
                return False

            res = await session.execute(
                select(KurbanShare, Donor)
                .outerjoin(Donor, KurbanShare.donor_id == Donor.id)
                .where(KurbanShare.animal_id == anim_uuid)
            )
            rows = res.all()
            for share, donor in rows:
                phone = share.donor_phone or (donor.phone if donor else None)
                email = donor.email if donor else None
                donor_name = share.donor_name or (f"{donor.first_name} {donor.last_name or ''}" if donor else "Bağışçımız")

                # Send SMS
                if phone:
                    from app.services.tenant_credentials import sms_account
                    sms_msg = f"Sayin {donor_name}, kurbaniniz kesilmistir. Kesim videosunu izlemek icin: {video_url or 'Dernek paneli'}"
                    try:
                        deliver_sms(phone, sms_msg, await sms_account(session, share.organization_id))
                    except Exception as e:
                        print(f"Kurban SMS error: {e}")

                # Send Email
                if email and settings.SENDGRID_API_KEY:
                    email_html = f"""
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                        <h2 style="color: #16a34a; text-align: center;">KURBANINIZ KESİLDİ</h2>
                        <p>Sayın <b>{donor_name}</b>,</p>
                        <p>Kurban vekâletiniz başarıyla yerine getirilmiş ve kurbanınız kesilmiştir. Allah kabul eylesin.</p>
                        {f'<p style="text-align: center; margin: 25px 0;"><a href="{video_url}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">🎥 Kesim Videosunu İzle</a></p>' if video_url else ''}
                    </div>
                    """
                    try:
                        send_email_task(email, "Kurban Kesim Bilgilendirmesi", email_html)
                    except Exception as e:
                        print(f"Kurban Email error: {e}")
            return True

    return asyncio.run(_notify())


@celery_app.task(name="app.tasks.sync_zakat_rates_task")
def sync_zakat_rates_task():
    """Sync TCMB gold & currency rates to ZakatSetting for all active organizations."""
    from app.utils.tcmb import fetch_tcmb_rates
    from app.models.zakat_setting import ZakatSetting

    rates = fetch_tcmb_rates()
    gold_price = rates.get("GOLD_GRAM", 3000.0)
    nisap = rates.get("NISAP_LIRA", 255000.0)

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


celery_app.conf.beat_schedule = {
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
}
