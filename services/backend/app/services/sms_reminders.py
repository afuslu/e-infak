"""Daily payment reminders by SMS: member dues and pledge (sponsorship) installments.

An organisation gets them only when it switched the event's template to "Otomatik gönder".
Each due item is reminded once, on its due date (or up to three days later if the day was missed).
"""
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.donation import Donor
from app.models.membership import Member, MemberDue
from app.models.sms_template import SmsTemplate
from app.models.sponsorship import Pledge, PledgeInstallment
from app.services.sms_service import format_amount, send_event_sms

LOOKBACK_DAYS = 3


async def _organisations(db: AsyncSession, event_key: str) -> list:
    return (await db.execute(select(SmsTemplate.organization_id).where(
        SmsTemplate.event_key == event_key, SmsTemplate.auto_mode == "auto", SmsTemplate.is_active.is_(True),
    ))).scalars().all()


def _currency(code: str | None) -> str:
    return "TL" if (code or "TRY") == "TRY" else code


async def send_due_reminders(db: AsyncSession, today: date | None = None) -> dict:
    """Queue today's reminders for every organisation that wants them (the caller commits)."""
    today = today or date.today()
    window = (today - timedelta(days=LOOKBACK_DAYS), today)
    queued = {"aidat_hatirlatma": 0, "sponsor_hatirlatma": 0}

    for org_id in await _organisations(db, "aidat_hatirlatma"):
        rows = (await db.execute(
            select(MemberDue, Donor).join(Member, Member.id == MemberDue.member_id)
            .join(Donor, Donor.id == Member.donor_id)
            .where(MemberDue.organization_id == org_id, MemberDue.status == "open", Member.status == "active",
                   MemberDue.due_date.between(*window))
        )).all()
        for due, donor in rows:
            message = await send_event_sms(
                db, org_id, "aidat_hatirlatma", donor.phone, donor=donor, related=("member_due", due.id),
                extra={"tutar": format_amount(due.amount_cents), "bagis_kalemi": "Üyelik aidatı",
                       "vade": due.due_date.strftime("%d.%m.%Y"), "donem": due.period},
            )
            queued["aidat_hatirlatma"] += bool(message)

    for org_id in await _organisations(db, "sponsor_hatirlatma"):
        rows = (await db.execute(
            select(PledgeInstallment, Pledge, Donor, Campaign.title)
            .join(Pledge, Pledge.id == PledgeInstallment.pledge_id)
            .join(Donor, Donor.id == Pledge.donor_id)
            .outerjoin(Campaign, Campaign.id == Pledge.campaign_id)
            .where(Pledge.organization_id == org_id, Pledge.status == "active",
                   PledgeInstallment.status == "pending", PledgeInstallment.due_date.between(*window))
        )).all()
        for installment, pledge, donor, campaign_title in rows:
            message = await send_event_sms(
                db, org_id, "sponsor_hatirlatma", donor.phone, donor=donor,
                related=("pledge_installment", installment.id), campaign_id=pledge.campaign_id,
                extra={"tutar": format_amount(installment.amount_cents), "para_birimi": _currency(pledge.currency),
                       "bagis_kalemi": pledge.title or campaign_title or "",
                       "vade": installment.due_date.strftime("%d.%m.%Y"),
                       "donem": f"{installment.seq}/{pledge.installment_count}"},
            )
            queued["sponsor_hatirlatma"] += bool(message)
    return queued
