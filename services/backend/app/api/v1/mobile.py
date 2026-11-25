"""Mobile app endpoints: push device tokens, the staff notification inbox and its settings, and the
money-in overview the app's dashboard cards and home-screen widget read."""
from datetime import datetime, timedelta, timezone
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, has_capability
from app.core.db import get_db
from app.models.device_token import DeviceToken
from app.models.staff_notification import StaffNotification, StaffNotificationSetting
from app.models.user import User
from app.services import staff_notify
from app.services.push_service import bind_device_token, forget_tokens, push_messages, unbind_device_token, user_tokens

router = APIRouter(prefix="/mobile", tags=["mobile"])


class DeviceTokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=255)
    platform: Literal["ios", "android", "expo"] = "expo"


@router.post("/device-token", status_code=status.HTTP_201_CREATED)
async def register_device_token(
    request: Request,
    payload: DeviceTokenIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id_raw = getattr(request.state, "organization_id", None)
    org_id = UUID(org_id_raw) if org_id_raw else current_user.organization_id
    await bind_device_token(
        db,
        token=payload.token,
        platform=payload.platform,
        organization_id=org_id,
        user_id=current_user.id,
    )
    await db.commit()
    return {"registered": True}


@router.delete("/device-token", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device_token(
    payload: DeviceTokenIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await unbind_device_token(db, token=payload.token, user_id=current_user.id)
    await db.commit()


@router.post("/test-push")
async def test_push_notification(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tokens = await user_tokens(db, current_user.id)
    errors: List[str] = []
    sent, dead = await push_messages(
        tokens,
        title="e-İnfak Bildirim Testi",
        body="Push bildirim altyapısı başarıyla çalışıyor.",
        data={"type": "test"},
        errors=errors,
    )
    await forget_tokens(db, dead)
    await db.commit()
    if sent == 0:
        if "InvalidCredentials" in errors:
            raise HTTPException(status_code=409, detail=(
                "Telefonunuz kayıtlı, ancak bildirim servisi (Firebase/APNs) anahtarı Expo'da tanımlı değil ya da geçersiz. "
                "Sistem yöneticisine bildirin."))
        if errors:
            raise HTTPException(status_code=409, detail=(
                f"Telefonunuz kayıtlı, ancak bildirim servisi gönderimi kabul etmedi ({errors[0]})."))
        # The app re-registers this phone and retries once on this answer.
        raise HTTPException(status_code=404, detail=(
            "Bu telefonun bildirim kaydı geçersizleşmiş; bildirimleri kapatıp yeniden açın." if dead
            else "Bu hesaba kayıtlı telefon bulunamadı; bildirimleri kapatıp yeniden açın."))
    return {"sent": sent}


def _org(request: Request, user: User) -> UUID:
    raw = getattr(request.state, "organization_id", None)
    return UUID(raw) if raw else user.organization_id


# --- Notification inbox ---------------------------------------------------------------------------

def _note_out(n: StaffNotification) -> dict:
    return {
        "id": str(n.id), "kind": n.kind, "channel": n.channel, "title": n.title, "body": n.body,
        "amount_cents": n.amount_cents, "currency": n.currency, "data": n.data or {},
        "read": n.read_at is not None, "pushed": n.pushed > 0, "created_at": n.created_at,
    }


@router.get("/notifications")
async def list_notifications(
    request: Request,
    kind: Annotated[Optional[str], Query(max_length=32)] = None,
    unread_only: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org(request, current_user)
    base = [StaffNotification.user_id == current_user.id, StaffNotification.organization_id == org_id]
    filters = list(base)
    if kind:
        filters.append(StaffNotification.kind.in_(kind.split(",")))
    if unread_only:
        filters.append(StaffNotification.read_at.is_(None))
    total = (await db.execute(select(func.count()).select_from(StaffNotification).where(*filters))).scalar() or 0
    unread = (await db.execute(select(func.count()).select_from(StaffNotification)
                               .where(*base, StaffNotification.read_at.is_(None)))).scalar() or 0
    rows = (await db.execute(select(StaffNotification).where(*filters)
                             .order_by(StaffNotification.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"items": [_note_out(n) for n in rows], "total": total, "unread": unread, "page": page, "page_size": page_size}


class ReadIn(BaseModel):
    ids: List[UUID] = Field(default_factory=list, max_length=500)
    all: bool = False


@router.post("/notifications/read")
async def mark_read(request: Request, payload: ReadIn, db: AsyncSession = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    org_id = _org(request, current_user)
    query = update(StaffNotification).where(
        StaffNotification.user_id == current_user.id, StaffNotification.organization_id == org_id,
        StaffNotification.read_at.is_(None))
    if not payload.all:
        if not payload.ids:
            return {"updated": 0}
        query = query.where(StaffNotification.id.in_(payload.ids))
    result = await db.execute(query.values(read_at=datetime.now(timezone.utc)))
    await db.commit()
    return {"updated": result.rowcount or 0}


# --- Notification settings ------------------------------------------------------------------------

class SettingsIn(BaseModel):
    online: Optional[bool] = None
    transfer: Optional[bool] = None
    transfer_waiting: Optional[bool] = None
    offline: Optional[bool] = None
    payment_failed: Optional[bool] = None
    refund: Optional[bool] = None
    digest: Optional[bool] = None
    weekly_digest: Optional[bool] = None
    tasks: Optional[bool] = None
    donor_reminders: Optional[bool] = None
    money_box_due: Optional[bool] = None
    large_donation: Optional[bool] = None
    large_donation_cents: Optional[int] = Field(default=None, ge=0, le=10_000_000_000)
    recurring_failed: Optional[bool] = None
    campaign_milestone: Optional[bool] = None
    system_alert: Optional[bool] = None
    quiet_hours: Optional[bool] = None
    min_amount_cents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)


def _settings_out(user: User, values: dict) -> dict:
    # Only the switches this person can actually receive are shown in the app.
    sees_all = has_capability(user, "receipts.view_all")
    can_donors = has_capability(user, "donors.view") or sees_all
    available = {
        "online": sees_all or can_donors,
        "transfer": True,
        "offline": True,
        "transfer_waiting": has_capability(user, "bank.approve"),
        "payment_failed": sees_all,
        "refund": sees_all,
        "digest": sees_all,
        "weekly_digest": sees_all,
        "tasks": True,
        "donor_reminders": True,
        "money_box_due": has_capability(user, "operations.manage") or sees_all,
        "large_donation": sees_all,
        "recurring_failed": sees_all,
        "campaign_milestone": sees_all,
        "system_alert": has_capability(user, "settings.manage") or sees_all,
    }
    return {"settings": values, "available": available}


async def _staff_user(db: AsyncSession, user: User) -> User:
    return (await db.execute(select(User).options(selectinload(User.staff_role)).where(User.id == user.id))).scalar_one()


@router.get("/notification-settings")
async def get_notification_settings(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = await _staff_user(db, current_user)
    return _settings_out(user, (await staff_notify.settings_for(db, [user.id]))[user.id])


@router.put("/notification-settings")
async def put_notification_settings(payload: SettingsIn, db: AsyncSession = Depends(get_db),
                                    current_user: User = Depends(get_current_user)):
    user = await _staff_user(db, current_user)
    row = await db.get(StaffNotificationSetting, user.id)
    current = staff_notify.merged(row.settings if row else None)
    current.update({k: v for k, v in payload.model_dump(exclude_none=True).items()})
    values = staff_notify.merged(current)
    if row:
        row.settings = values
    else:
        db.add(StaffNotificationSetting(user_id=user.id, settings=values))
    await db.commit()
    return _settings_out(user, values)


# --- Money-in overview (dashboard cards, home-screen widget) ---------------------------------------

Period = Literal["today", "week", "month"]


def _period_bounds(period: str, now: datetime) -> tuple[datetime, datetime]:
    day_start, day_end = staff_notify.day_bounds(now)
    if period == "today":
        return day_start, day_end
    if period == "week":
        return day_start - timedelta(days=now.weekday()), day_end
    return staff_notify.day_bounds(now.replace(day=1))[0], day_end


def _problem_payments(org_id: UUID, start: datetime):
    """Conditions of the "failed / under review" count; the list below uses the same ones."""
    from app.models.payment import PaymentOrder, PaymentOrderStatus

    return (PaymentOrder.organization_id == org_id, PaymentOrder.created_at >= start,
            PaymentOrder.status.in_([PaymentOrderStatus.FAILED, PaymentOrderStatus.REVIEW]))


@router.get("/failed-payments")
async def failed_payments(
    request: Request,
    period: Period = "today",
    order_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Card payments the bank declined or whose outcome must be checked by hand, with the reason.

    `order_id` (from a notification) returns that one order whatever its date.
    """
    from app.models.payment import PaymentOrder, PaymentOrderItem, PaymentOrderStatus

    org_id = _org(request, current_user)
    user = await _staff_user(db, current_user)
    if not has_capability(user, "receipts.view_all"):
        raise HTTPException(status_code=403, detail="Online ödemeleri görme yetkiniz yok")
    if order_id:
        where = (PaymentOrder.organization_id == org_id, PaymentOrder.id == order_id)
    else:
        where = _problem_payments(org_id, _period_bounds(period, datetime.now(staff_notify.TZ))[0])
    total = int((await db.execute(select(func.count()).select_from(PaymentOrder).where(*where))).scalar() or 0)
    orders = (await db.execute(
        select(PaymentOrder).options(
            selectinload(PaymentOrder.donor), selectinload(PaymentOrder.attempts),
            selectinload(PaymentOrder.items).selectinload(PaymentOrderItem.campaign),
        ).where(*where).order_by(PaymentOrder.created_at.desc()).limit(100))).scalars().all()
    # Latest paid order per donor; a smaller/unrelated later payment is shown with its amount, not as a retry.
    later: dict[UUID, list[PaymentOrder]] = {}
    if orders:
        for paid in (await db.execute(select(PaymentOrder).where(
                PaymentOrder.organization_id == org_id, PaymentOrder.status == PaymentOrderStatus.PAID,
                PaymentOrder.donor_id.in_({o.donor_id for o in orders}),
                PaymentOrder.created_at > min(o.created_at for o in orders),
        ).order_by(PaymentOrder.created_at))).scalars().all():
            later.setdefault(paid.donor_id, []).append(paid)

    def out(o: PaymentOrder) -> dict:
        after = [p for p in later.get(o.donor_id, []) if p.created_at > o.created_at]
        return {
            "id": str(o.id), "status": o.status.value, "total_cents": o.total_cents, "currency": o.currency,
            "created_at": o.created_at, "merchant_payment_id": o.merchant_payment_id,
            "failure_code": o.failure_code, "failure_message": o.failure_message, "query_attempts": o.query_attempts,
            "retried_paid": any(p.total_cents == o.total_cents and p.currency == o.currency for p in after),
            "later_payments": [{"total_cents": p.total_cents, "currency": p.currency, "created_at": p.created_at}
                               for p in after[:5]],
            "donor": {"id": str(o.donor.id), "name": o.donor.full_name, "phone": o.donor.phone, "email": o.donor.email},
            "items": [{"campaign_title": i.campaign.title, "quantity": i.quantity,
                       "total_amount_cents": i.total_amount_cents} for i in o.items],
            "attempts": [{
                "id": str(a.id), "provider": a.provider, "response_code": a.response_code,
                "response_message": a.response_message, "card_brand": a.card_brand, "card_last_4": a.card_last_4,
                "bank_transaction_id": a.pg_tran_id, "created_at": a.created_at, "completed_at": a.completed_at,
            } for a in sorted(o.attempts, key=lambda a: a.created_at, reverse=True)],
        }

    return {"period": period, "total": total, "items": [out(o) for o in orders]}


async def _review_order(request: Request, order_id: UUID, db: AsyncSession, current_user: User):
    """Locked order of this organisation that is still open for a decision, with the attempt to ask the bank about."""
    from app.api.v1.checkout import _load_order, lock_order
    from app.models.payment import PaymentOrderStatus

    org_id = _org(request, current_user)
    user = await _staff_user(db, current_user)
    if not has_capability(user, "receipts.view_all") or not has_capability(user, "receipts.mark_paid"):
        raise HTTPException(status_code=403, detail="Online ödeme sonuçlandırma yetkiniz yok")
    order = await _load_order(db, order_id)
    if not order or order.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    if await lock_order(db, order) not in (PaymentOrderStatus.REVIEW, PaymentOrderStatus.FAILED):
        raise HTTPException(status_code=409, detail="Bu ödeme zaten sonuçlanmış")
    attempt = next((a for a in sorted(order.attempts, key=lambda a: a.created_at, reverse=True) if a.session_token), None)
    if not attempt:
        raise HTTPException(status_code=409, detail="Bu ödeme için banka sorgusu yapılamıyor")
    return order, attempt, user


async def _ask_bank(db: AsyncSession, order, attempt):
    from app.api.v1.checkout import attempt_provider

    try:
        provider = await attempt_provider(db, order, attempt)
        return await provider.query(order.merchant_payment_id, order.total_cents, order.currency)
    except Exception as exc:  # noqa: BLE001 - bank or network error; nothing is changed
        raise HTTPException(status_code=502, detail="Bankaya ulaşılamadı; biraz sonra yeniden deneyin") from exc


def _money_taken(result) -> bool:
    """The bank knows a sale for this order, even if its amount differs from what we expect."""
    bank = (result.safe_response or {}).get("bank") or {}
    return bool(result.approved) or str(bank.get("ResponseCode") or result.code or "") == "00"


@router.post("/failed-payments/{order_id}/requery")
async def requery_payment(order_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """Ask the bank again. An approved, matching sale becomes a donation; otherwise only the answer is kept."""
    from app.api.v1.checkout import _finalize_paid_order, apply_result, result_matches_order
    from app.models.audit_log import AuditLog

    order, attempt, user = await _review_order(request, order_id, db, current_user)
    result = await _ask_bank(db, order, attempt)
    if result is None:
        raise HTTPException(status_code=409, detail="Bu banka sorgulamayı desteklemiyor; banka panelinden kontrol edin")
    paid = bool(result.approved) and result_matches_order(order, result)
    db.add(AuditLog(organization_id=order.organization_id, user_id=user.id, action="odeme_yeniden_soruldu",
                    details={"order_id": str(order.id), "paid": paid, "code": result.code, "message": result.message}))
    if paid:
        apply_result(attempt, result)
        await _finalize_paid_order(db, order, attempt)
        return {"status": "paid", "message": "Banka ödemeyi onayladı; bağış kaydedildi."}
    attempt.response_code = (result.code or "")[:16] or attempt.response_code
    attempt.response_message = (result.message or "")[:500] or attempt.response_message
    await db.commit()
    if _money_taken(result):
        return {"status": order.status.value, "message": "Bankada bu siparişe ait bir satış var ama tutar/para birimi uyuşmuyor. Banka panelinden kontrol edin."}
    return {"status": order.status.value, "message": f"Bankada onaylı ödeme bulunamadı: {result.message or result.code or 'yanıt yok'}"}


class ClosePaymentIn(BaseModel):
    note: str = Field(min_length=3, max_length=300)


@router.post("/failed-payments/{order_id}/close")
async def close_payment(order_id: UUID, payload: ClosePaymentIn, request: Request, db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Mark a held payment as not paid. The bank is asked first; a sale it knows about can never be closed here."""
    from app.models.audit_log import AuditLog
    from app.models.payment import PaymentOrderStatus

    order, attempt, user = await _review_order(request, order_id, db, current_user)
    if order.status != PaymentOrderStatus.REVIEW:
        raise HTTPException(status_code=409, detail="Yalnızca incelemedeki ödeme kapatılabilir")
    result = await _ask_bank(db, order, attempt)
    if (result is not None and _money_taken(result)) or (attempt.response_code == "00"):
        raise HTTPException(status_code=409, detail="Bankada bu siparişe ait satış görünüyor; kapatılamaz. Önce banka panelinden kontrol edin.")
    order.status, order.query_next_at = PaymentOrderStatus.FAILED, None
    order.failure_message = f"Ödenmedi olarak kapatıldı ({user.first_name} {user.last_name or ''}): {payload.note.strip()}"
    db.add(AuditLog(organization_id=order.organization_id, user_id=user.id, action="odeme_kapatildi",
                    details={"order_id": str(order.id), "note": payload.note.strip()}))
    await db.commit()
    return {"status": "failed", "message": "Ödeme ödenmedi olarak kapatıldı."}


@router.get("/inflow/items")
async def inflow_items(
    request: Request,
    channel: str = "*",
    period: Period = "today",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The TRY donations behind one channel row of the overview."""
    from app.models.donation import Donation, DonationStatus

    org_id = _org(request, current_user)
    user = await _staff_user(db, current_user)
    start, end = _period_bounds(period, datetime.now(staff_notify.TZ))
    query = select(Donation).options(selectinload(Donation.donor), selectinload(Donation.campaign)).where(
        Donation.organization_id == org_id, Donation.status == DonationStatus.CONFIRMED, Donation.currency == "TRY",
        Donation.paid_at >= start, Donation.paid_at < end).order_by(Donation.paid_at.desc())
    if not has_capability(user, "receipts.view_all"):
        query = query.where(Donation.issued_by_id == user.id)
    # The channel is derived in Python, like the totals, so both always agree.
    rows = [d for d in (await db.execute(query)).scalars().all() 
            if (staff_notify.channel_of(d) == channel if channel != "*" else staff_notify.channel_of(d) != "import")]
    return {"total": len(rows), "total_cents": sum(d.amount_cents for d in rows),
            "items": [_inflow_item(d) for d in rows[:200]]}


def _inflow_item(d) -> dict:
    channel = staff_notify.channel_of(d)
    return {
        "id": str(d.id), "receipt_number": d.receipt_number, "amount_cents": d.amount_cents, "currency": d.currency,
        "channel": channel, "channel_label": staff_notify.CHANNEL_LABELS.get(channel, channel),
        "donor_id": str(d.donor_id), "donor_name": d.donor.full_name if d.donor else None, "is_anonymous": d.is_anonymous,
        "campaign_title": d.campaign.title if d.campaign else None, "paid_at": d.paid_at,
    }


@router.get("/inflow")
async def inflow_overview(
    request: Request,
    period: Period = "today",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.automation import BankTransaction, ReconciliationStatus
    from app.models.donation import Donation, DonationStatus
    from app.models.payment import PaymentOrder

    org_id = _org(request, current_user)
    user = await _staff_user(db, current_user)
    sees_all = has_capability(user, "receipts.view_all")
    mine = None if sees_all else user.id
    now = datetime.now(staff_notify.TZ)
    day_start = staff_notify.day_bounds(now)[0]
    start, end = _period_bounds(period, now)
    length = end - start
    current = await staff_notify.inflow_by_channel(db, org_id, start, end, mine)
    previous = await staff_notify.inflow_by_channel(db, org_id, start - length, start, mine)

    # Sparkline: hours for today, days otherwise (TRY only).
    bucket_hours = period == "today"
    query = select(Donation.paid_at, Donation.amount_cents).where(
        Donation.organization_id == org_id, Donation.status == DonationStatus.CONFIRMED, Donation.currency == "TRY",
        Donation.paid_at >= start, Donation.paid_at < end,
        Donation.payment_provider.not_in(list(staff_notify.SILENT_PROVIDERS)) | Donation.payment_provider.is_(None))
    if mine:
        query = query.where(Donation.issued_by_id == mine)
    size = 24 if bucket_hours else max(1, (end - start).days)
    series = [0] * size
    for paid_at, amount in (await db.execute(query)).all():
        local = paid_at.astimezone(staff_notify.TZ)
        index = local.hour if bucket_hours else (local.date() - start.astimezone(staff_notify.TZ).date()).days
        if 0 <= index < size:
            series[index] += amount

    recent_q = (select(Donation).options(selectinload(Donation.donor), selectinload(Donation.campaign))
                .where(Donation.organization_id == org_id, Donation.status == DonationStatus.CONFIRMED,
                       Donation.payment_provider.not_in(list(staff_notify.SILENT_PROVIDERS)) | Donation.payment_provider.is_(None))
                .order_by(Donation.paid_at.desc()).limit(15))
    if mine:
        recent_q = recent_q.where(Donation.issued_by_id == mine)
    recent = []
    for d in (await db.execute(recent_q)).scalars().all():
        recent.append(_inflow_item(d))

    waiting = {"count": 0, "total_cents": 0}
    failed = 0
    if has_capability(user, "bank.approve") or sees_all:
        row = (await db.execute(select(func.count(), func.coalesce(func.sum(BankTransaction.amount_cents), 0)).where(
            BankTransaction.organization_id == org_id, BankTransaction.amount_cents > 0,
            BankTransaction.status.in_([ReconciliationStatus.UNMATCHED, ReconciliationStatus.AMBIGUOUS])))).one()
        waiting = {"count": int(row[0] or 0), "total_cents": int(row[1] or 0)}
    if sees_all:
        failed = int((await db.execute(select(func.count()).select_from(PaymentOrder).where(
            *_problem_payments(org_id, day_start)))).scalar() or 0)
    unread = (await db.execute(select(func.count()).select_from(StaffNotification).where(
        StaffNotification.user_id == user.id, StaffNotification.organization_id == org_id,
        StaffNotification.read_at.is_(None)))).scalar() or 0

    return {
        "period": period, "start": start, "end": end, "sees_all": sees_all, "currency": "TRY",
        **current, "previous_total_cents": previous["total_cents"], "previous_count": previous["count"],
        "series": series, "series_unit": "hour" if bucket_hours else "day",
        "recent": recent, "waiting_transfers": waiting, "failed_payments_today": failed, "unread_notifications": unread,
        "updated_at": datetime.now(timezone.utc),
    }


@router.get("/widget-bundle")
async def widget_bundle(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Single compact payload that refreshes all home-screen widgets in one network call."""
    from app.models.automation import BankTransaction, ReconciliationStatus
    from app.models.campaign import Campaign, CampaignStatus
    from app.models.field_ops import Task

    org_id = _org(request, current_user)
    user = await _staff_user(db, current_user)
    sees_all = has_capability(user, "receipts.view_all")
    mine = None if sees_all else user.id
    now = datetime.now(staff_notify.TZ)
    day_start, day_end = staff_notify.day_bounds(now)
    month_start = staff_notify.day_bounds(now.replace(day=1))[0]

    today = await staff_notify.inflow_by_channel(db, org_id, day_start, day_end, mine)
    yesterday = await staff_notify.inflow_by_channel(db, org_id, day_start - timedelta(days=1), day_start, mine)
    month = await staff_notify.inflow_by_channel(db, org_id, month_start, day_end, mine)

    # Last 7 days daily trend (oldest -> today) for widget sparkline / bar chart
    from app.models.donation import Donation, DonationStatus
    week_start = day_start - timedelta(days=6)
    day_names_tr = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
    daily_buckets: dict[str, dict] = {}
    base_local_date = now.astimezone(staff_notify.TZ).date()
    for offset in range(6, -1, -1):
        d = base_local_date - timedelta(days=offset)
        daily_buckets[d.isoformat()] = {
            "date": d.isoformat(),
            "label": day_names_tr[d.weekday()],
            "total_cents": 0,
            "count": 0,
            "is_today": offset == 0,
        }
    week_q = select(
        Donation.paid_at,
        Donation.amount_cents,
        Donation.currency,
        Donation.payment_provider,
    ).where(
        Donation.organization_id == org_id,
        Donation.status == DonationStatus.CONFIRMED,
        Donation.paid_at >= week_start,
        Donation.paid_at < day_end,
    )
    if mine:
        week_q = week_q.where(Donation.issued_by_id == mine)
    for paid_at, amount_cents, currency, provider in (await db.execute(week_q)).all():
        if (provider or "") in staff_notify.SILENT_PROVIDERS:
            continue
        if (currency or "TRY") != "TRY" or not paid_at:
            continue
        d_key = paid_at.astimezone(staff_notify.TZ).date().isoformat()
        if d_key in daily_buckets:
            daily_buckets[d_key]["total_cents"] += int(amount_cents or 0)
            daily_buckets[d_key]["count"] += 1
    last_7_days = list(daily_buckets.values())

    # Pending bank transfers
    pending_transfers: dict = {"count": 0, "total_cents": 0, "items": []}
    if has_capability(user, "bank.approve") or sees_all:
        base_tx = [
            BankTransaction.organization_id == org_id,
            BankTransaction.amount_cents > 0,
            BankTransaction.status.in_([ReconciliationStatus.UNMATCHED, ReconciliationStatus.AMBIGUOUS]),
        ]
        row = (await db.execute(select(func.count(), func.coalesce(func.sum(BankTransaction.amount_cents), 0)).where(*base_tx))).one()
        tx_rows = (await db.execute(
            select(BankTransaction).where(*base_tx).order_by(BankTransaction.booked_at.desc()).limit(5)
        )).scalars().all()
        pending_transfers = {
            "count": int(row[0] or 0),
            "total_cents": int(row[1] or 0),
            "items": [
                {
                    "id": str(t.id),
                    "sender": (t.sender_name or t.description or "Havale")[:40],
                    "amount_cents": t.amount_cents,
                    "booked_at": t.booked_at,
                    "status": t.status.value if hasattr(t.status, "value") else str(t.status),
                }
                for t in tx_rows
            ],
        }

    # Open tasks assigned to this staff member (or org-wide if manager)
    today_date = now.date()
    task_filters = [Task.organization_id == org_id, Task.status.in_(["todo", "in_progress"])]
    if not sees_all:
        task_filters.append(Task.assigned_to_id == user.id)
    open_count = int((await db.execute(select(func.count()).select_from(Task).where(*task_filters))).scalar() or 0)
    overdue_count = int((await db.execute(
        select(func.count()).select_from(Task).where(*task_filters, Task.due_date.is_not(None), Task.due_date < today_date)
    )).scalar() or 0)
    task_rows = (await db.execute(
        select(Task).where(*task_filters).order_by(Task.due_date.asc().nullslast(), Task.created_at.desc()).limit(5)
    )).scalars().all()

    # Featured / top active campaign with a target (excluding hidden system campaigns)
    from sqlalchemy import or_
    from app.models.campaign import HIDDEN_CAMPAIGN_TAG
    camp = (await db.execute(
        select(Campaign)
        .where(
            Campaign.organization_id == org_id,
            Campaign.status == CampaignStatus.ACTIVE,
            Campaign.target_cents > 0,
            or_(Campaign.tags.is_(None), ~Campaign.tags.any(HIDDEN_CAMPAIGN_TAG)),
        )
        .order_by(Campaign.is_featured.desc(), Campaign.display_order.asc(), Campaign.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    campaign_out = None
    if camp:
        collected = int(camp.collected_cents or 0)
        pct = min(100, round(collected * 100 / max(1, camp.target_cents)))
        campaign_out = {
            "id": str(camp.id),
            "title": camp.title,
            "target_cents": camp.target_cents,
            "collected_cents": collected,
            "remaining_cents": max(0, int(camp.target_cents) - collected),
            "percent": pct,
        }

    unread = int((await db.execute(select(func.count()).select_from(StaffNotification).where(
        StaffNotification.user_id == user.id, StaffNotification.organization_id == org_id,
        StaffNotification.read_at.is_(None)))).scalar() or 0)

    return {
        "today": {
            **today,
            "previous_total_cents": yesterday["total_cents"],
            "previous_count": yesterday["count"],
        },
        "month": {
            "total_cents": month["total_cents"],
            "count": month["count"],
        },
        "last_7_days": last_7_days,
        "pending_transfers": pending_transfers,
        "tasks": {
            "open_count": open_count,
            "overdue_count": overdue_count,
            "items": [
                {
                    "id": str(t.id),
                    "title": t.title,
                    "status": t.status,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "overdue": bool(t.due_date and t.due_date < today_date),
                }
                for t in task_rows
            ],
        },
        "campaign": campaign_out,
        "unread_notifications": unread,
        "updated_at": datetime.now(timezone.utc),
    }
