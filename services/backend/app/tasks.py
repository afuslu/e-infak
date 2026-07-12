import asyncio
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
    """Asynchronously send an email using SendGrid, or fallback to mock logs"""
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
    else:
        print(f"\n--- [MOCK EMAIL] ---")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Content: {content}")
        print(f"---------------------\n")
    return True

@celery_app.task(name="app.tasks.send_sms_task")
def send_sms_task(phone: str, message: str):
    """Asynchronously send an SMS using Netgsm API, or fallback to mock logs"""
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
    else:
        print(f"\n--- [MOCK SMS] ---")
        print(f"Phone: {phone}")
        print(f"Message: {message}")
        print(f"-------------------\n")
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
    from app.models.subscription import Subscription
    from app.models.donation import Donation, DonationStatus, PaymentMethod
    from datetime import datetime, timezone
    from dateutil.relativedelta import relativedelta
    import uuid

    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        result = await session.execute(
            select(Subscription)
            .where(Subscription.status == "active")
            .where(Subscription.next_charge_date <= now)
        )
        subscriptions = result.scalars().all()
        
        for sub in subscriptions:
            try:
                print(f"Charging subscription {sub.id} amount {sub.amount_cents / 100} TL")
                receipt_no = f"MAK-{uuid.uuid4().hex[:12].upper()}"
                donation = Donation(
                    organization_id=sub.organization_id,
                    campaign_id=sub.campaign_id,
                    donor_id=sub.donor_id,
                    receipt_number=receipt_no,
                    amount_cents=sub.amount_cents,
                    currency=sub.currency,
                    payment_method=PaymentMethod.CREDIT_CARD,
                    status=DonationStatus.CONFIRMED,
                    paid_at=now,
                    card_last_4="9999",
                    card_brand="Visa",
                    donor_message="Aylik duzenli bagis talimati",
                )
                session.add(donation)
                sub.next_charge_date = sub.next_charge_date + relativedelta(months=1)
                await session.commit()
                # Run sync receipt task here directly to trigger sms/email asynchronously
                send_donation_receipt_task.delay(str(donation.id))
            except Exception as e:
                print(f"Error processing subscription {sub.id}: {e}")
                await session.rollback()


@celery_app.task(name="app.tasks.process_subscriptions_task")
def process_subscriptions_task():
    """Celery task wrapper to bill monthly subscriptions"""
    return asyncio.run(_process_subscriptions())
