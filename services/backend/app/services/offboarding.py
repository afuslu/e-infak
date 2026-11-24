"""Closing date rules: no charges after it, and reminders before it. Nothing is deleted here."""
import logging
from datetime import date, datetime
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.models.data_export import OrganizationOffboarding
from app.models.organization import Organization

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Europe/Istanbul")
REMIND_DAYS = (30, 7, 1)


def today_local() -> date:
    return datetime.now(TZ).date()


def closed_organizations(today: Optional[date] = None):
    """Organisations whose closing date has come: their saved cards are no longer charged."""
    return select(OrganizationOffboarding.organization_id).where(
        OrganizationOffboarding.status == "scheduled", OrganizationOffboarding.closes_on <= (today or today_local()))


async def is_closed(db, org_id: UUID) -> bool:
    return (await db.execute(closed_organizations().where(
        OrganizationOffboarding.organization_id == org_id))).first() is not None


async def send_reminders(db_factory, today: Optional[date] = None) -> int:
    """30, 7 and 1 days before closing: panel notification, e-mail and (if the organisation has an SMS account) SMS.

    Each step is sent once per closing date; when a run was missed only the nearest step goes out.
    """
    import asyncio
    import html

    from app.services import staff_notify
    from app.services.sms_service import enqueue_sms
    from app.tasks import send_email_task

    today = today or today_local()
    async with db_factory() as db:
        ids = (await db.execute(select(OrganizationOffboarding.id).where(
            OrganizationOffboarding.status == "scheduled", OrganizationOffboarding.closes_on > today))).scalars().all()
    sent = 0
    for row_id in ids:
        async with db_factory() as db:
            row = (await db.execute(select(OrganizationOffboarding).where(OrganizationOffboarding.id == row_id)
                                    .with_for_update(skip_locked=True))).scalar_one_or_none()
            if not row or row.status != "scheduled" or not row.closes_on:
                continue
            left = (row.closes_on - today).days
            due = [d for d in REMIND_DAYS if left <= d]
            if not due:
                continue
            keys = [f"{row.closes_on.isoformat()}:{d}" for d in due]
            if keys[-1] in (row.reminders_sent or []):
                continue
            row.reminders_sent = sorted({*(row.reminders_sent or []), *keys})
            org = await db.get(Organization, row.organization_id)
            await db.commit()  # recorded first: a failing channel must not repeat the others
            sent += 1
            when = f"{row.closes_on:%d.%m.%Y}"
            backup = "" if row.backup_confirmed_at else " Henüz yedek onayınız yok."
            text = f"{org.name}: e-İnfak hizmetiniz {when} tarihinde kapanıyor ({left} gün kaldı).{backup} Verilerinizi panelde Verilerim ve Ayrılma sayfasından indirin."
            try:
                await staff_notify.notify_system_alert(db, org.id, f"Kapanışa {left} gün kaldı", text)
                await db.commit()
            except Exception:
                await db.rollback()
                logger.exception("Kapanış bildirimi gönderilemedi: %s", org.slug)
            try:
                await asyncio.to_thread(send_email_task, org.email, f"Kapanışa {left} gün kaldı", f"<p>{html.escape(text)}</p>")
            except Exception:
                logger.exception("Kapanış e-postası gönderilemedi: %s", org.slug)
            if org.phone:
                try:
                    await enqueue_sms(db, org.id, org.phone, text, source="system",
                                      dedupe_key=f"offboarding:{row.id}:{keys[-1]}")
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("Kapanış SMS'i sıraya alınamadı: %s", org.slug)
    return sent
