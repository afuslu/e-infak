"""Hatırlatıcı API: each staff member's own reminders, and the open reminders on a donor's card."""
from datetime import datetime, timedelta
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    ensure_capability,
    ensure_donor_visible,
    get_current_user,
    has_capability,
    masked,
    require_admin_route_feature,
    require_admin_route_permission,
    require_capability,
)
from app.core.db import get_db
from app.models.donation import Donor
from app.models.donor_reminder import REPEAT_CHOICES, DonorReminder
from app.models.user import User
from app.services import reminders as svc

router = APIRouter(
    prefix="/admin-features",
    tags=["reminders"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

Repeat = Literal["none", "daily", "weekly", "monthly", "yearly"]
assert set(Repeat.__args__) == set(REPEAT_CHOICES)  # type: ignore[attr-defined]


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=svc.TZ)


class ReminderIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    remind_at: datetime
    repeat: Repeat = "none"
    donor_id: Optional[UUID] = None

    @field_validator("content")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Hatırlatma metni boş olamaz")
        return v


class ReminderPatch(BaseModel):
    content: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    remind_at: Optional[datetime] = None
    repeat: Optional[Repeat] = None
    donor_id: Optional[UUID] = None
    clear_donor: bool = False


def _out(reminder: DonorReminder, donor: Optional[Donor], author: Optional[User] = None) -> dict:
    return {
        "id": str(reminder.id),
        "content": reminder.content,
        "remind_at": reminder.remind_at.isoformat(),
        "repeat": reminder.repeat,
        "source": reminder.source,
        "notified_at": reminder.notified_at.isoformat() if reminder.notified_at else None,
        "completed_at": reminder.completed_at.isoformat() if reminder.completed_at else None,
        "phone": reminder.phone,
        "donor": {"id": str(donor.id), "name": donor.full_name, "phone": masked(donor.phone)} if donor else None,
        "author": f"{author.first_name or ''} {author.last_name or ''}".strip() or author.email if author else None,
    }


def _org(request: Request) -> UUID:
    return UUID(request.state.organization_id)


async def _link_donor(db: AsyncSession, org_id: UUID, user: User, reminder: DonorReminder,
                      donor_id: Optional[UUID]) -> Optional[Donor]:
    """An explicitly chosen donor, else the donor whose phone is written in the text (if this user may see them)."""
    reminder.phone = svc.find_phone(reminder.content)
    donor: Optional[Donor] = None
    if donor_id:
        donor = (await db.execute(select(Donor).where(Donor.id == donor_id, Donor.organization_id == org_id))).scalar_one_or_none()
        if donor is None:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
        ensure_donor_visible(user, donor)
    elif reminder.phone:
        found = await svc.donor_for_phone(db, org_id, reminder.phone)
        if found is not None and (found.assigned_user_id == user.id or has_capability(user, "donors.view_all")):
            donor = found
    reminder.donor_id = donor.id if donor else None
    return donor


async def _own(db: AsyncSession, org_id: UUID, user: User, reminder_id: UUID) -> DonorReminder:
    reminder = (await db.execute(select(DonorReminder).where(
        DonorReminder.id == reminder_id,
        DonorReminder.organization_id == org_id,
        DonorReminder.created_by_id == user.id,
    ))).scalar_one_or_none()
    if reminder is None:
        raise HTTPException(status_code=404, detail="Hatırlatma bulunamadı")
    return reminder


async def _with_donor(db: AsyncSession, reminder: DonorReminder) -> dict:
    donor = await db.get(Donor, reminder.donor_id) if reminder.donor_id else None
    return _out(reminder, donor)


@router.get("/reminders")
async def list_reminders(
    request: Request,
    kapsam: Literal["acik", "tamamlanan", "vadesi_gelen"] = "acik",
    q: Optional[str] = Query(default=None, max_length=100),
    limit: int = Query(default=300, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The current staff member's reminders. acik = not done (overdue first), vadesi_gelen = time has come."""
    org_id = _org(request)
    query = (
        select(DonorReminder, Donor)
        .outerjoin(Donor, Donor.id == DonorReminder.donor_id)
        .where(DonorReminder.organization_id == org_id, DonorReminder.created_by_id == current_user.id)
    )
    if kapsam == "tamamlanan":
        query = query.where(DonorReminder.completed_at.is_not(None)).order_by(DonorReminder.completed_at.desc())
    else:
        query = query.where(DonorReminder.completed_at.is_(None))
        if kapsam == "vadesi_gelen":
            query = query.where(DonorReminder.remind_at <= func.now())
        query = query.order_by(DonorReminder.remind_at)
    if q and q.strip():
        term = f"%{q.strip()}%"
        digits = "".join(ch for ch in q if ch.isdigit())
        conditions = [DonorReminder.content.ilike(term), Donor.first_name.ilike(term), Donor.last_name.ilike(term)]
        if len(digits) >= 3:
            conditions.append(DonorReminder.phone.contains(digits[-10:]))
        query = query.where(or_(*conditions))
    rows = (await db.execute(query.limit(limit))).all()
    return [_out(reminder, donor) for reminder, donor in rows]


@router.get("/reminders/summary")
async def reminder_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Counts for the menu badge and the dashboard card: overdue, today (still ahead), due now."""
    now = datetime.now(svc.TZ)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    base = and_(
        DonorReminder.organization_id == _org(request),
        DonorReminder.created_by_id == current_user.id,
        DonorReminder.completed_at.is_(None),
    )
    overdue, today_left = (await db.execute(select(
        func.count().filter(DonorReminder.remind_at < start),
        func.count().filter(and_(DonorReminder.remind_at >= start, DonorReminder.remind_at < end)),
    ).where(base))).one()
    due = (await db.execute(select(func.count()).where(base, DonorReminder.remind_at <= now))).scalar_one()
    return {"geciken": overdue, "bugun": today_left, "vadesi_gelen": due}


@router.post("/reminders", status_code=status.HTTP_201_CREATED)
async def create_reminder(
    request: Request,
    payload: ReminderIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org(request)
    reminder = DonorReminder(
        organization_id=org_id, created_by_id=current_user.id, content=payload.content,
        remind_at=_aware(payload.remind_at), repeat=payload.repeat, source="manual",
    )
    donor = await _link_donor(db, org_id, current_user, reminder, payload.donor_id)
    db.add(reminder)
    await db.commit()
    await db.refresh(reminder)
    return _out(reminder, donor)


@router.patch("/reminders/{reminder_id}")
async def update_reminder(
    request: Request,
    reminder_id: UUID,
    payload: ReminderPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit the text, move the time (snooze) or change the repeat. A new time is pushed again when it comes."""
    org_id = _org(request)
    reminder = await _own(db, org_id, current_user, reminder_id)
    if payload.content is not None:
        reminder.content = payload.content.strip()
    if payload.remind_at is not None:
        reminder.remind_at = _aware(payload.remind_at)
        reminder.notified_at = None
    if payload.repeat is not None:
        reminder.repeat = payload.repeat
    if payload.clear_donor:
        reminder.donor_id = None
        reminder.phone = svc.find_phone(reminder.content)
    elif payload.donor_id is not None or payload.content is not None:
        await _link_donor(db, org_id, current_user, reminder, payload.donor_id or None)
    await db.commit()
    await db.refresh(reminder)
    return await _with_donor(db, reminder)


@router.post("/reminders/{reminder_id}/complete")
async def complete_reminder(
    request: Request,
    reminder_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reminder = await _own(db, _org(request), current_user, reminder_id)
    if reminder.completed_at is not None:
        return await _with_donor(db, reminder)
    done = svc.complete(reminder, current_user.id, datetime.now(svc.TZ))
    if done is not None:
        db.add(done)
    await db.commit()
    await db.refresh(reminder)
    return await _with_donor(db, reminder)


@router.post("/reminders/{reminder_id}/reopen")
async def reopen_reminder(
    request: Request,
    reminder_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reminder = await _own(db, _org(request), current_user, reminder_id)
    reminder.completed_at = None
    reminder.completed_by_id = None
    await db.commit()
    await db.refresh(reminder)
    return await _with_donor(db, reminder)


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
    request: Request,
    reminder_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reminder = await _own(db, _org(request), current_user, reminder_id)
    await db.delete(reminder)
    await db.commit()


# --- On the donor's card ---------------------------------------------------------------------------

@router.get("/donors/{donor_id}/reminders", dependencies=[Depends(require_capability("donors.notes_view"))])
async def donor_reminders(
    request: Request,
    donor_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Open reminders anyone wrote for this donor, plus the last few done ones."""
    org_id = _org(request)
    donor = (await db.execute(select(Donor).where(Donor.id == donor_id, Donor.organization_id == org_id))).scalar_one_or_none()
    if donor is None:
        raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    ensure_donor_visible(current_user, donor)
    rows = (await db.execute(
        select(DonorReminder, User)
        .outerjoin(User, User.id == DonorReminder.created_by_id)
        .where(DonorReminder.organization_id == org_id, DonorReminder.donor_id == donor_id)
        .order_by(DonorReminder.completed_at.is_not(None), DonorReminder.remind_at.desc())
        .limit(50)
    )).all()
    return [{**_out(reminder, donor, author), "mine": reminder.created_by_id == current_user.id} for reminder, author in rows]


# --- Wise Reminder import ---------------------------------------------------------------------------

class ImportIn(BaseModel):
    text: str = Field(min_length=1, max_length=2_000_000)
    completed: bool = False  # the list came from Wise Reminder's "Tamamlanmış" tab
    dry_run: bool = True
    create_donors: bool = False  # make a donor for numbers nobody has yet (name guessed from the text)


@router.post("/reminders/import")
async def import_reminders(
    request: Request,
    payload: ImportIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bring the old Wise Reminder list in once. dry_run shows what would happen; nothing is pushed for old times."""
    org_id = _org(request)
    if payload.create_donors:
        ensure_capability(current_user, "donors.create")
    rows = svc.parse_wise_reminder_text(payload.text)
    if len(rows) > 5000:
        raise HTTPException(status_code=400, detail="Tek seferde en çok 5000 hatırlatma aktarılabilir")
    now = datetime.now(svc.TZ)

    existing = {
        (content, remind_at) for content, remind_at in (await db.execute(
            select(DonorReminder.content, DonorReminder.remind_at).where(
                DonorReminder.organization_id == org_id,
                DonorReminder.created_by_id == current_user.id,
                DonorReminder.source == "wise_reminder",
            ))).all()
    }
    preview, created, skipped = [], 0, 0
    new_donors: dict[str, Donor] = {}
    for row in rows:
        when = row.remind_at or now
        donor = await svc.donor_for_phone(db, org_id, row.phone)
        if donor is not None and not (donor.assigned_user_id == current_user.id or has_capability(current_user, "donors.view_all")):
            donor = None
        first, last = svc.suggested_name(row.content)
        duplicate = (row.content, when) in existing
        preview.append({
            "content": row.content,
            "remind_at": when.isoformat(),
            "date_missing": row.remind_at is None,
            "phone": row.phone,
            "donor": {"id": str(donor.id), "name": donor.full_name} if donor else None,
            "suggested_name": f"{first} {last}".strip() or None,
            "duplicate": duplicate,
        })
        if payload.dry_run:
            continue
        if duplicate:
            skipped += 1
            continue
        if donor is None and payload.create_donors and row.phone and first:
            donor = new_donors.get(row.phone)
            if donor is None:
                donor = Donor(organization_id=org_id, first_name=first, last_name=last or None,
                              phone=f"0{row.phone}", assigned_user_id=current_user.id,
                              total_donations=0, total_donated_cents=0)
                db.add(donor)
                await db.flush()
                new_donors[row.phone] = donor
        past = when <= now
        db.add(DonorReminder(
            organization_id=org_id, created_by_id=current_user.id, donor_id=donor.id if donor else None,
            content=row.content, phone=row.phone, remind_at=when, repeat="none", source="wise_reminder",
            notified_at=now if (past or payload.completed) else None,
            completed_at=now if payload.completed else None,
            completed_by_id=current_user.id if payload.completed else None,
        ))
        existing.add((row.content, when))
        created += 1
    if not payload.dry_run:
        await db.commit()
    return {
        "rows": preview,
        "total": len(rows),
        "matched": sum(1 for p in preview if p["donor"]),
        "created": created,
        "skipped": skipped,
        "new_donors": len(new_donors),
    }
