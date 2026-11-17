"""Hatırlatıcı rules: phone in the text, repeating reminders, the push when the time comes, Wise Reminder import."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.donation import Donor
from app.models.donor_reminder import DonorReminder

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Europe/Istanbul")

# A Turkish number written the way people type it: "(543) 352 66 28", "0532 223 36 10", "5557352591",
# "+90 212 555 44 33". Area codes start with 2-5 (5 = mobile).
_PHONE = re.compile(
    r"(?<!\d)(?:\+?90[\s.-]*)?\(?0?\s*([2-5]\d{2})\)?[\s.-]*(\d{3})[\s.-]*(\d{2})[\s.-]*(\d{2})(?!\d)"
)
# A date the way Wise Reminder shows it: "23.10.2026 11:15:52", "6.11.2026 11:16".
_DATE = re.compile(r"(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?!\d)")


def find_phone(text: str) -> Optional[str]:
    """Ten digits of the first phone number in the text (no leading 0 / 90), or None."""
    match = _PHONE.search(text or "")
    return "".join(match.groups()) if match else None


def text_without_phone(text: str) -> str:
    return re.sub(r"\s{2,}", " ", _PHONE.sub(" ", text or "", count=1)).strip()


def suggested_name(text: str) -> tuple[str, str]:
    """First and last name guessed from the words right after the phone ("SİNAN BAŞYAPTAN GAZZE İÇİN" → Sinan / Başyaptan)."""
    words = []
    for word in text_without_phone(text).split():
        clean = word.strip(".,;:'\"-")
        if not clean or any(ch.isdigit() for ch in clean) or not clean.isalpha():
            break
        words.append(clean)
        if len(words) == 2:
            break
    titled = [w[:1].replace("i", "İ").replace("ı", "I").upper() + w[1:].replace("İ", "i").replace("I", "ı").lower() for w in words]
    if not titled:
        return "", ""
    return titled[0], " ".join(titled[1:])


async def donor_for_phone(db: AsyncSession, organization_id: UUID, phone10: Optional[str]) -> Optional[Donor]:
    if not phone10:
        return None
    digits = func.regexp_replace(Donor.phone, r"\D", "", "g")
    return (await db.execute(
        select(Donor)
        .where(Donor.organization_id == organization_id, func.right(digits, 10) == phone10)
        .order_by(Donor.created_at)
        .limit(1)
    )).scalar_one_or_none()


def next_time(when: datetime, repeat: str, now: datetime) -> Optional[datetime]:
    """The next occurrence of a repeating reminder after now (Istanbul calendar, so 10:00 stays 10:00)."""
    step = {
        "daily": relativedelta(days=1),
        "weekly": relativedelta(weeks=1),
        "monthly": relativedelta(months=1),
        "yearly": relativedelta(years=1),
    }.get(repeat)
    if step is None:
        return None
    local = when.astimezone(TZ)
    count = 1
    candidate = local + step
    while candidate <= now:
        count += 1
        candidate = local + step * count  # from the original day, so 31 Jan monthly stays at month end
        if count > 5000:
            break
    return candidate


def complete(reminder: DonorReminder, user_id: UUID, now: datetime) -> Optional[DonorReminder]:
    """Mark done. A repeating reminder moves to its next time and leaves a completed copy behind."""
    nxt = next_time(reminder.remind_at, reminder.repeat, now)
    if nxt is None:
        reminder.completed_at = now
        reminder.completed_by_id = user_id
        return None
    done = DonorReminder(
        organization_id=reminder.organization_id, donor_id=reminder.donor_id, created_by_id=reminder.created_by_id,
        content=reminder.content, phone=reminder.phone, remind_at=reminder.remind_at, repeat="none",
        source=reminder.source, notified_at=reminder.notified_at or now, completed_at=now, completed_by_id=user_id,
    )
    reminder.remind_at = nxt
    reminder.notified_at = None
    return done


def push_text(reminder: DonorReminder, donor: Optional[Donor]) -> tuple[str, str]:
    local = reminder.remind_at.astimezone(TZ)
    title = f"Hatırlatma · {local:%H:%M}"
    body = reminder.content.strip()
    if donor is not None and donor.full_name and donor.full_name.lower() not in body.lower():
        body = f"{donor.full_name} · {body}"
    return title, body[:180]


async def send_due(db: AsyncSession, now: Optional[datetime] = None, limit: int = 200) -> int:
    """Push every reminder whose time has come to the person who wrote it, once."""
    from app.services.push_service import notify_user_push

    now = now or datetime.now(TZ)
    rows = (await db.execute(
        select(DonorReminder, Donor)
        .outerjoin(Donor, Donor.id == DonorReminder.donor_id)
        .where(
            DonorReminder.completed_at.is_(None),
            DonorReminder.notified_at.is_(None),
            DonorReminder.remind_at <= now,
        )
        .order_by(DonorReminder.remind_at)
        .limit(limit)
        .with_for_update(of=DonorReminder, skip_locked=True)
    )).all()
    for reminder, donor in rows:
        # Mark first: a slow or failed push must not repeat every minute.
        reminder.notified_at = now
    await db.commit()
    for reminder, donor in rows:
        title, body = push_text(reminder, donor)
        try:
            await notify_user_push(db, reminder.created_by_id, title, body, {
                "type": "reminder", "reminder_id": str(reminder.id),
                "donor_id": str(reminder.donor_id) if reminder.donor_id else None,
            })
        except Exception as exc:  # pragma: no cover - network
            logger.warning("Reminder push failed for %s: %s", reminder.id, exc)
    return len(rows)


# --- Wise Reminder import ------------------------------------------------------------------------

@dataclass
class ImportRow:
    content: str
    remind_at: datetime
    phone: Optional[str]


def _date_from(match: re.Match) -> Optional[datetime]:
    day, month, year, hour, minute, second = match.groups()
    try:
        return datetime(int(year), int(month), int(day), int(hour or 9), int(minute or 0), int(second or 0), tzinfo=TZ)
    except ValueError:
        return None


def parse_wise_reminder_text(raw: str) -> list[ImportRow]:
    """Reminders from text copied or exported out of Wise Reminder.

    Each reminder is its text with a date either on the same line or on the next line, as Wise
    Reminder lists them ("(543) 352 66 28 MESUT ... GAZZE İÇİN" / "23.10.2026 11:15:52"). CSV and
    tab separated exports work too: the date column is found wherever it is on the line.
    """
    rows: list[ImportRow] = []
    pending: Optional[str] = None
    for line in (raw or "").replace("\r", "\n").split("\n"):
        line = line.strip().strip("﻿")
        if not line:
            continue
        match = _DATE.search(line)
        if match is None:
            if pending:
                rows.append(ImportRow(pending, None, find_phone(pending)))  # type: ignore[arg-type]
            pending = line
            continue
        when = _date_from(match)
        rest = (line[:match.start()] + " " + line[match.end():]).strip(" ;,\t\"")
        rest = re.sub(r"\s{2,}", " ", rest.replace("\t", " ").replace(";", " ").replace('","', " ")).strip(" ,\"")
        text = rest if rest else pending
        if rest and pending:
            rows.append(ImportRow(pending, None, find_phone(pending)))  # type: ignore[arg-type]
        pending = None
        if text and when:
            rows.append(ImportRow(text.rstrip(". …"), when, find_phone(text)))
    if pending:
        rows.append(ImportRow(pending, None, find_phone(pending)))  # type: ignore[arg-type]
    # Header lines ("Hatırlatıcılar", "Metin;Tarih") have neither a date nor a phone: drop them.
    return [r for r in rows if r.remind_at is not None or r.phone]
