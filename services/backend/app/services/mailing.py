"""Bulk e-mail ("Mail Gönderimleri"): recipient resolution, rendering and the send loop."""
import html
import logging
import re
from datetime import datetime, timezone
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.donation import Donor, DonorType
from app.models.mailing import MailBatch, MailMessage, RecipientListMember
from app.models.organization import Organization

logger = logging.getLogger(__name__)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VARIABLES = ("{ad}", "{ad_soyad}", "{kurum}")


def donor_name(d: Donor) -> str:
    if d.donor_type == DonorType.CORPORATE and d.company_name:
        return d.company_name
    return f"{d.first_name} {d.last_name or ''}".strip()


def render_text(text: str, *, name: str, first: str, org_name: str) -> str:
    return (text or "").replace("{ad_soyad}", name).replace("{ad}", first or name).replace("{kurum}", org_name)


def to_html(body: str, *, org_name: str, commercial: bool) -> str:
    """Plain text with blank-line paragraphs → simple, safe HTML (no staff-written markup reaches inboxes)."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body or "") if p.strip()]
    inner = "".join(f"<p style=\"margin:0 0 14px\">{html.escape(p).replace(chr(10), '<br>')}</p>" for p in paragraphs)
    footer = html.escape(org_name)
    if commercial:
        footer += " · Bu e-postayı izin verdiğiniz için aldınız. Almak istemiyorsanız bu e-postayı yanıtlayarak bildirin."
    return (
        "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2933;max-width:620px\">"
        f"{inner}<hr style=\"border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px\">"
        f"<p style=\"font-size:12px;color:#6b7280;margin:0\">{footer}</p></div>"
    )


async def build_recipients(db: AsyncSession, org_id: UUID, donor_ids: Iterable[UUID], *, commercial: bool,
                           include_without_consent: bool) -> tuple[list[tuple[Donor, str]], dict]:
    """Unique valid addresses; commercial mail (and informational unless forced) needs e-mail consent."""
    need_consent = commercial or not include_without_consent
    stats = {"matched": 0, "no_email": 0, "no_consent": 0, "invalid": 0, "duplicate": 0}
    ids = list(donor_ids)
    seen: set[str] = set()
    out: list[tuple[Donor, str]] = []
    for start in range(0, len(ids), 2000):
        donors = (await db.execute(select(Donor).where(Donor.organization_id == org_id, Donor.id.in_(ids[start:start + 2000]))
                                   .order_by(Donor.created_at))).scalars().all()
        for d in donors:
            stats["matched"] += 1
            email = (d.email or "").strip().lower()
            if not email:
                stats["no_email"] += 1
            elif not EMAIL_RE.match(email):
                stats["invalid"] += 1
            elif need_consent and not d.allow_email:
                stats["no_consent"] += 1
            elif email in seen:
                stats["duplicate"] += 1
            else:
                seen.add(email)
                out.append((d, email))
    return out, stats


async def list_donor_ids(db: AsyncSession, list_id: UUID) -> list[UUID]:
    return list((await db.execute(select(RecipientListMember.donor_id).where(RecipientListMember.list_id == list_id))).scalars())


async def create_batch(db: AsyncSession, org_id: UUID, *, source: str, subject: str, body: str, commercial: bool,
                       recipients: list[tuple[Donor, str]], stats: dict, created_by: Optional[UUID],
                       send_after: Optional[datetime] = None) -> MailBatch:
    seq = (await db.execute(select(func.coalesce(func.max(MailBatch.seq_no), 0)).where(MailBatch.organization_id == org_id))).scalar_one()
    batch = MailBatch(organization_id=org_id, seq_no=seq + 1, source=source[:160], subject=subject, body=body,
                      commercial=commercial, total=len(recipients), stats=stats, created_by=created_by,
                      send_after=send_after or datetime.now(timezone.utc))
    db.add(batch)
    await db.flush()
    for donor, email in recipients:
        db.add(MailMessage(organization_id=org_id, batch_id=batch.id, donor_id=donor.id, email=email, name=donor_name(donor)))
    return batch


def deliver(to_email: str, subject: str, html_body: str, *, from_name: str, reply_to: Optional[str]) -> None:
    """One e-mail through SendGrid; raises when no provider is configured (never a silent success)."""
    if not settings.SENDGRID_API_KEY:
        raise RuntimeError("E-posta sağlayıcısı (SendGrid) yapılandırılmadı")
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail, ReplyTo

    message = Mail(from_email=(settings.FROM_EMAIL, from_name), to_emails=to_email, subject=subject, html_content=html_body)
    if reply_to and EMAIL_RE.match(reply_to):
        message.reply_to = ReplyTo(reply_to)
    SendGridAPIClient(settings.SENDGRID_API_KEY).send(message)


async def run_batch(session_factory, batch_id: str) -> dict:
    """Send the queued messages of one batch (called by the Celery task)."""
    sent = failed = 0
    async with session_factory() as db:
        # Claim the batch atomically so the minute dispatcher and the "send now" task never both send it.
        claimed = (await db.execute(
            update(MailBatch).where(MailBatch.id == UUID(batch_id), MailBatch.status == "queued",
                                    MailBatch.send_after <= datetime.now(timezone.utc))
            .values(status="sending").returning(MailBatch.id)
        )).scalar_one_or_none()
        await db.commit()
        if not claimed:
            return {"skipped": True}
        batch = await db.get(MailBatch, UUID(batch_id))
        org = await db.get(Organization, batch.organization_id)
        org_name = (org.name if org else "") or settings.FROM_NAME
        mail_settings = ((org.settings or {}) if org else {}).get("mail") or {}
        from_name = mail_settings.get("from_name") or org_name
        reply_to = mail_settings.get("reply_to") or (org.email if org else None)
        while True:
            messages = (await db.execute(select(MailMessage).where(
                MailMessage.batch_id == batch.id, MailMessage.status == "queued").limit(100))).scalars().all()
            if not messages:
                break
            for m in messages:
                await db.refresh(batch, ["status"])
                if batch.status == "cancelled":
                    return {"cancelled": True, "sent": sent, "failed": failed}
                first = (m.name or "").split(" ")[0]
                subject = render_text(batch.subject, name=m.name or "", first=first, org_name=org_name)
                body = to_html(render_text(batch.body, name=m.name or "", first=first, org_name=org_name),
                               org_name=org_name, commercial=batch.commercial)
                m.attempts += 1
                try:
                    deliver(m.email, subject, body, from_name=from_name, reply_to=reply_to)
                    m.status, m.sent_at, m.error = "sent", datetime.now(timezone.utc), None
                    sent += 1
                except Exception as exc:  # provider error: record it, keep going with the others
                    m.status, m.error = "failed", str(exc)[:500]
                    failed += 1
                await db.commit()
        batch.status, batch.finished_at = "done", datetime.now(timezone.utc)
        await db.commit()
    return {"sent": sent, "failed": failed}


async def due_batches(session_factory) -> list[str]:
    async with session_factory() as db:
        rows = (await db.execute(select(MailBatch.id).where(
            MailBatch.status == "queued", MailBatch.send_after <= datetime.now(timezone.utc)).limit(20))).scalars().all()
        return [str(r) for r in rows]


async def cancel_batch(db: AsyncSession, batch: MailBatch) -> int:
    batch.status = "cancelled"
    result = await db.execute(update(MailMessage).where(MailMessage.batch_id == batch.id, MailMessage.status == "queued")
                              .values(status="cancelled"))
    return result.rowcount or 0
