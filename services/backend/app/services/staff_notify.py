"""Notifications to organisation staff: an in-app inbox plus a push to their phones.

Every money-in path queues an outbox event (`push.*`) in the same transaction as the money, so a
notification is never sent for a payment that rolled back and never lost for one that committed.
The event is handed to a worker right after commit (seconds); the minute-by-minute outbox runner is
the safety net.

Event types (payload keys):
  push.donation.paid      offline / bank / kumbara / dues / SMS donation   {donation_id}
  push.payment.paid       online order (virtual POS, online transfer)      {order_id}
  push.payment.failed     card payment declined or held for review         {order_id, attempt_id}
  push.payment.refunded   online refund                                    {order_id, refund_id, amount_cents}
  push.transfer.waiting   incoming transfers the bank sync could not match {transaction_ids}
"""
from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, time, timedelta, timezone
from typing import Any, Iterable, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import event as sa_event, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.automation import OutboxEvent
from app.models.campaign import Campaign
from app.models.device_token import DeviceToken
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.staff_notification import StaffNotification, StaffNotificationSetting
from app.models.user import User

logger = logging.getLogger(__name__)
TZ = ZoneInfo("Europe/Istanbul")

# --- Settings ------------------------------------------------------------------------------------

DEFAULTS: dict[str, Any] = {
    "online": True,              # online bağış / sanal POS
    "transfer": True,            # havale / EFT girişi (otomatik ya da elle eşleşen)
    "transfer_waiting": True,    # eşleşmeyi bekleyen havaleler
    "offline": True,             # elden nakit, POS cihazı, kumbara, aidat, SMS bağışı
    "payment_failed": True,      # reddedilen / incelemeye düşen kart ödemesi
    "refund": True,              # iade
    "digest": True,              # gün sonu özeti (21:00)
    "weekly_digest": True,       # haftalık yönetici özeti
    "tasks": True,               # görev atamaları ve son teslim tarihleri
    "donor_reminders": True,     # bağışçı arama / takip hatırlatmaları
    "money_box_due": True,       # kumbara toplama / değişim zamanı
    "large_donation": True,      # yüksek tutarlı bağış özel alarmı
    "large_donation_cents": 1_000_000,  # 10.000 TL üstü büyük bağış alarmı
    "recurring_failed": True,    # düzenli bağış / aidat tahsilat uyarısı
    "campaign_milestone": True,  # kampanya hedefi %50 / %80 / %100 bildirimi
    "system_alert": True,        # SMS kredisi azaldı / banka senkron koptu
    "min_amount_cents": 0,       # bunun altındaki girişler yalnız kutuya düşer, telefona gelmez
    "quiet_hours": False,        # 22:00–08:00 arası sessiz (kutuya düşer, telefona gelmez)
}
BOOL_KEYS = [k for k, v in DEFAULTS.items() if isinstance(v, bool)]
INT_KEYS = ("min_amount_cents", "large_donation_cents")


def merged(settings: Optional[dict]) -> dict:
    out = dict(DEFAULTS)
    for key, value in (settings or {}).items():
        if key in BOOL_KEYS and isinstance(value, bool):
            out[key] = value
        elif key in INT_KEYS and isinstance(value, int) and 0 <= value <= 10_000_000_000:
            out[key] = value
    return out


async def settings_for(db: AsyncSession, user_ids: Iterable[UUID]) -> dict[UUID, dict]:
    ids = list(user_ids)
    rows = (await db.execute(select(StaffNotificationSetting).where(StaffNotificationSetting.user_id.in_(ids)))).scalars().all() if ids else []
    stored = {r.user_id: r.settings for r in rows}
    return {uid: merged(stored.get(uid)) for uid in ids}


# --- Channels ------------------------------------------------------------------------------------

CARD_PROVIDERS = {"ziraatpay", "iyzico", "nestpay", "paytr", "vakifkatilim"}
SILENT_PROVIDERS = {"import", "stkpro"}  # bulk imports never notify

CHANNEL_LABELS = {
    "online": "Online bağış (sanal POS)",
    "online_transfer": "Online havale bildirimi",
    "transfer": "Havale / EFT",
    "cash": "Elden nakit",
    "pos": "Kartla (POS cihazı)",
    "money_box": "Kumbara",
    "dues": "Üye aidatı",
    "sms": "SMS bağışı",
    "import": "Aktarım",
}
# Which on/off setting a channel falls under.
CHANNEL_SETTING = {"online": "online", "online_transfer": "transfer", "transfer": "transfer"}


def channel_of(donation: Donation) -> str:
    return channel_for(donation.payment_provider, donation.payment_details, donation.payment_method)


def channel_for(provider: Optional[str], details: Optional[dict], method: Any) -> str:
    provider = provider or ""
    details = details or {}
    if isinstance(method, str):
        method = PaymentMethod(method) if method in {m.value for m in PaymentMethod} else None
    if provider in SILENT_PROVIDERS:
        return "import"
    if provider == "money_box":
        return "money_box"
    if provider == "sms_donation":
        return "sms"
    if provider.startswith("bank:"):
        return "transfer"
    if provider == "manual":
        if "member_no" in details or "periods" in details:
            return "dues"
        if method == PaymentMethod.CASH:
            return "cash"
        if method == PaymentMethod.CREDIT_CARD:
            return "pos"
        return "transfer"
    if provider in CARD_PROVIDERS or method == PaymentMethod.CREDIT_CARD:
        return "online"
    if method == PaymentMethod.BANK_TRANSFER:
        return "online_transfer"
    return "cash" if method == PaymentMethod.CASH else "online"


# --- Formatting ----------------------------------------------------------------------------------

SYMBOLS = {"TRY": "₺", "USD": "$", "EUR": "€", "GBP": "£"}


def money(cents: int, currency: str = "TRY") -> str:
    value = (cents or 0) / 100
    whole = f"{int(abs(value)):,}".replace(",", ".")
    fraction = round(abs(value) * 100) % 100
    text = whole if fraction == 0 else f"{whole},{fraction:02d}"
    sign = "-" if value < 0 else ""
    symbol = SYMBOLS.get((currency or "TRY").upper())
    return f"{sign}{symbol}{text}" if symbol else f"{sign}{text} {currency}"


def _donor_name(donor: Optional[Donor], anonymous: bool = False) -> str:
    name = (donor.full_name if donor else None) or "İsimsiz bağışçı"
    return f"{name} (gizli)" if anonymous else name


def _quiet(now: Optional[datetime] = None) -> bool:
    hour = (now or datetime.now(TZ)).astimezone(TZ).hour
    return hour >= 22 or hour < 8


# --- Recipients ----------------------------------------------------------------------------------

async def _staff(db: AsyncSession, organization_id: UUID) -> list[User]:
    from app.models.user import UserRole

    return list((await db.execute(
        select(User).options(selectinload(User.staff_role))
        .where(User.organization_id == organization_id, User.is_active.is_(True),
               User.role != UserRole.PLATFORM_ADMIN)
    )).scalars().all())


def _can(user: User, capability: str) -> bool:
    from app.api.deps import has_capability

    return has_capability(user, capability)


# --- Delivery ------------------------------------------------------------------------------------

async def _tokens(db: AsyncSession, organization_id: UUID, user_ids: list[UUID]) -> dict[UUID, list[str]]:
    if not user_ids:
        return {}
    rows = (await db.execute(select(DeviceToken.user_id, DeviceToken.token).where(
        DeviceToken.user_id.in_(user_ids),
        (DeviceToken.organization_id == organization_id) | DeviceToken.organization_id.is_(None),
    ))).all()
    out: dict[UUID, list[str]] = {}
    for user_id, token in rows:
        out.setdefault(user_id, []).append(token)
    return out


async def _unread(db: AsyncSession, user_id: UUID) -> int:
    return int((await db.execute(select(func.count()).select_from(StaffNotification).where(
        StaffNotification.user_id == user_id, StaffNotification.read_at.is_(None)))).scalar() or 0)


async def deliver(db: AsyncSession, organization_id: UUID, recipients: list[User], *, kind: str, title: str,
                  body: str, setting: str, amount_cents: Optional[int] = None, currency: Optional[str] = None,
                  channel: Optional[str] = None, data: Optional[dict] = None) -> int:
    """Write an inbox line for every recipient; push to those whose settings allow it. Returns pushes."""
    from app.services.push_service import forget_tokens, push_messages

    if not recipients:
        return 0
    prefs = await settings_for(db, [u.id for u in recipients])
    tokens = await _tokens(db, organization_id, [u.id for u in recipients])
    quiet_now = _quiet()
    pushed_total = 0
    for user in recipients:
        note = StaffNotification(organization_id=organization_id, user_id=user.id, kind=kind, channel=channel,
                                 title=title[:200], body=body, amount_cents=amount_cents, currency=currency,
                                 data=dict(data or {}))
        db.add(note)
        await db.flush()
        from app.api.deps import has_capability
        pref = prefs[user.id]
        is_large = (
            amount_cents is not None
            and (currency or "TRY") == "TRY"
            and has_capability(user, "receipts.view_all")
            and pref.get("large_donation", True)
            and pref.get("large_donation_cents", 1_000_000) > 0
            and amount_cents >= pref.get("large_donation_cents", 1_000_000)
            and setting in {"online", "transfer", "offline"}
        )
        wanted = (pref.get(setting, True) or is_large) and not (pref["quiet_hours"] and quiet_now and not is_large)
        if wanted and not is_large and amount_cents is not None and (currency or "TRY") == "TRY" and amount_cents < pref["min_amount_cents"]:
            wanted = False
        if not wanted or not tokens.get(user.id):
            continue
        if is_large or setting in {"payment_failed", "system_alert", "recurring_failed"}:
            push_channel = "urgent"
        elif setting in {"online", "transfer", "transfer_waiting", "offline", "refund"}:
            push_channel = "money_in"
        elif setting in {"tasks", "donor_reminders", "money_box_due"}:
            push_channel = "tasks"
        elif setting in {"digest", "weekly_digest"}:
            push_channel = "summary"
        else:
            push_channel = "default"

        category_id: Optional[str] = None
        if setting == "transfer_waiting":
            category_id = "transfer_waiting"
        elif setting in {"online", "transfer", "offline"}:
            category_id = "donation"
        elif setting == "tasks":
            category_id = "task_assigned"

        push_title = f"Büyük Bağış · {title}" if is_large and not title.startswith("Büyük Bağış") else title
        payload = {**(data or {}), "type": kind, "notification_id": str(note.id)}
        accepted, dead = await push_messages(
            tokens[user.id],
            push_title,
            body,
            payload,
            badge=await _unread(db, user.id),
            channel_id=push_channel,
            category_id=category_id,
        )
        await forget_tokens(db, dead)
        note.pushed = accepted
        pushed_total += accepted
    return pushed_total


# --- Event handlers ------------------------------------------------------------------------------

async def _donation_paid(db: AsyncSession, organization_id: UUID, payload: dict) -> None:
    donation = (await db.execute(select(Donation).options(selectinload(Donation.donor), selectinload(Donation.campaign))
                                 .where(Donation.id == UUID(payload["donation_id"])))).scalar_one_or_none()
    if not donation or donation.status != DonationStatus.CONFIRMED:
        return
    channel = channel_of(donation)
    if channel == "import":
        return
    details = donation.payment_details or {}
    lines = [donation]
    group = details.get("receipt_group")
    if group:
        # A receipt with several lines is one notification, sent for its first line only.
        lines = list((await db.execute(select(Donation).options(selectinload(Donation.campaign)).where(
            Donation.organization_id == organization_id, Donation.payment_details["receipt_group"].astext == group,
            Donation.status == DonationStatus.CONFIRMED).order_by(Donation.receipt_number))).scalars().all()) or [donation]
        if lines[0].id != donation.id:
            return
    total = sum(d.amount_cents for d in lines if d.currency == donation.currency)
    campaigns = [d.campaign.title for d in lines if d.campaign]
    what = campaigns[0] if campaigns else "Bağış"
    if len(lines) > 1:
        what += f" (+{len(lines) - 1} kalem)"

    extra: list[str] = []
    if channel == "transfer":
        extra.append("otomatik eşleşti" if details.get("automatic") else "eşleştirildi")
        if details.get("bank_account_label"):
            extra.append(str(details["bank_account_label"]))
        if details.get("sender") and details.get("sender") != (donation.donor.full_name if donation.donor else None):
            extra.append(f"gönderen: {details['sender']}")
    elif channel == "money_box" and details.get("money_box_code"):
        extra.append(f"kumbara {details['money_box_code']}")
    elif channel == "dues" and details.get("member_no"):
        extra.append(f"üye no {details['member_no']}")
    elif channel == "sms" and details.get("operator"):
        extra.append(str(details["operator"]))
    if donation.on_behalf_of:
        extra.append(f"{donation.on_behalf_of} adına")
    extra.append(f"makbuz {donation.receipt_number}")

    staff = await _staff(db, organization_id)
    issuer = donation.issued_by_id if not (details.get("automatic") or details.get("auto_assigned_staff")) else None
    recipients = [
        u for u in staff
        if u.id != issuer and (_can(u, "receipts.view_all") or donation.issued_by_id == u.id
                               or (donation.donor and donation.donor.assigned_user_id == u.id))
    ]
    issuer_name = None
    if donation.issued_by_id and channel not in ("transfer",) and issuer:
        issuer_user = next((u for u in staff if u.id == donation.issued_by_id), None)
        issuer_name = f"{issuer_user.first_name} {issuer_user.last_name}".strip() if issuer_user else None
    if issuer_name:
        extra.append(f"kesen: {issuer_name}")

    label = CHANNEL_LABELS.get(channel, "Bağış")
    await deliver(
        db, organization_id, recipients, kind="donation", channel=channel,
        setting=CHANNEL_SETTING.get(channel, "offline"),
        title=f"{money(total, donation.currency)} · {label}",
        body=f"{_donor_name(donation.donor, donation.is_anonymous)} · {what}\n" + " · ".join(extra),
        amount_cents=total, currency=donation.currency,
        data={"donation_id": str(donation.id), "receipt_number": donation.receipt_number,
              "donor_id": str(donation.donor_id), "route": "donation"},
    )


async def _payment_paid(db: AsyncSession, organization_id: UUID, payload: dict) -> None:
    from app.models.payment import PaymentAttempt, PaymentOrder

    order = (await db.execute(select(PaymentOrder).options(selectinload(PaymentOrder.donor), selectinload(PaymentOrder.items))
                              .where(PaymentOrder.id == UUID(payload["order_id"])))).scalar_one_or_none()
    if not order:
        return
    donations: list[Donation] = []
    if order.items:
        result = await db.execute(select(Donation).options(selectinload(Donation.campaign)).where(
            Donation.organization_id == organization_id,
            Donation.payment_order_item_id.in_([i.id for i in order.items])).order_by(Donation.receipt_number))
        donations = list(result.scalars().all())
    if not donations:
        return
    first = donations[0]
    channel = "online" if order.payment_method == "credit_card" else "online_transfer"
    attempt = (await db.execute(select(PaymentAttempt).where(PaymentAttempt.order_id == order.id)
                                .order_by(PaymentAttempt.created_at.desc()).limit(1))).scalar_one_or_none()
    what = first.campaign.title if first.campaign else "Bağış"
    if len(donations) > 1:
        what += f" (+{len(donations) - 1} kalem)"
    extra = []
    if attempt and attempt.card_last_4:
        extra.append(f"{attempt.card_brand or 'Kart'} ••{attempt.card_last_4}")
    if attempt and attempt.provider:
        extra.append(attempt.provider)
    if first.on_behalf_of:
        extra.append(f"{first.on_behalf_of} adına")
    if first.donor_message:
        extra.append(f"“{first.donor_message[:80]}”")
    staff = await _staff(db, organization_id)
    recipients = [u for u in staff if _can(u, "receipts.view_all") or (order.donor and order.donor.assigned_user_id == u.id)]
    await deliver(
        db, organization_id, recipients, kind="online", channel=channel, setting=CHANNEL_SETTING[channel],
        title=f"{money(order.total_cents, order.currency)} · {CHANNEL_LABELS[channel]}",
        body=f"{_donor_name(order.donor, first.is_anonymous)} · {what}" + (f"\n{' · '.join(extra)}" if extra else ""),
        amount_cents=order.total_cents, currency=order.currency,
        data={"donation_id": str(first.id), "receipt_number": first.receipt_number, "donor_id": str(order.donor_id),
              "order_id": str(order.id), "route": "donation"},
    )


async def _payment_failed(db: AsyncSession, organization_id: UUID, payload: dict) -> None:
    from app.models.payment import PaymentOrder, PaymentOrderStatus

    order = (await db.execute(select(PaymentOrder).options(selectinload(PaymentOrder.donor))
                              .where(PaymentOrder.id == UUID(payload["order_id"])))).scalar_one_or_none()
    if not order or order.status == PaymentOrderStatus.PAID:
        return
    review = order.status == PaymentOrderStatus.REVIEW
    reason = order.failure_message or "Banka ödemeyi onaylamadı"
    staff = await _staff(db, organization_id)
    recipients = [u for u in staff if _can(u, "receipts.view_all")]
    await deliver(
        db, organization_id, recipients, kind="payment_failed", channel="online", setting="payment_failed",
        title=f"{'İncelenecek ödeme' if review else 'Başarısız ödeme'} · {money(order.total_cents, order.currency)}",
        body=f"{_donor_name(order.donor)} · {reason[:160]}",
        amount_cents=order.total_cents, currency=order.currency,
        data={"order_id": str(order.id), "donor_id": str(order.donor_id), "route": "donor"},
    )


async def _payment_refunded(db: AsyncSession, organization_id: UUID, payload: dict) -> None:
    from app.models.payment import PaymentOrder

    order = (await db.execute(select(PaymentOrder).options(selectinload(PaymentOrder.donor))
                              .where(PaymentOrder.id == UUID(payload["order_id"])))).scalar_one_or_none()
    if not order:
        return
    cents = int(payload.get("amount_cents") or 0)
    staff = await _staff(db, organization_id)
    recipients = [u for u in staff if _can(u, "receipts.view_all")]
    await deliver(
        db, organization_id, recipients, kind="refund", channel="online", setting="refund",
        title=f"İade · {money(cents, order.currency)}",
        body=f"{_donor_name(order.donor)} · online bağış iade edildi (sipariş toplamı {money(order.total_cents, order.currency)})",
        amount_cents=cents, currency=order.currency,
        data={"order_id": str(order.id), "donor_id": str(order.donor_id), "route": "donor"},
    )


async def _transfers_waiting(db: AsyncSession, organization_id: UUID, payload: dict) -> None:
    from app.models.automation import BankAccount, BankTransaction, ReconciliationStatus

    ids = [UUID(i) for i in payload.get("transaction_ids") or []]
    if not ids:
        return
    rows = list((await db.execute(select(BankTransaction).where(
        BankTransaction.id.in_(ids), BankTransaction.organization_id == organization_id,
        BankTransaction.status.in_([ReconciliationStatus.UNMATCHED, ReconciliationStatus.AMBIGUOUS]),
        BankTransaction.amount_cents > 0).order_by(BankTransaction.amount_cents.desc()))).scalars().all())
    if not rows:
        return
    currency = rows[0].currency
    total = sum(r.amount_cents for r in rows if r.currency == currency)
    account = await db.get(BankAccount, rows[0].bank_account_id) if rows[0].bank_account_id else None
    biggest = rows[0]
    if len(rows) == 1:
        title = f"{money(biggest.amount_cents, biggest.currency)} havale eşleşme bekliyor"
        body = f"{biggest.sender_name or 'Gönderen bilinmiyor'}" + (f" · {biggest.description[:90]}" if biggest.description else "")
    else:
        title = f"{len(rows)} havale eşleşme bekliyor · {money(total, currency)}"
        body = f"En büyüğü: {biggest.sender_name or 'Gönderen bilinmiyor'} {money(biggest.amount_cents, biggest.currency)}"
    if account:
        body += f"\n{account.label}"
    staff = await _staff(db, organization_id)
    recipients = [u for u in staff if _can(u, "bank.approve")]
    await deliver(
        db, organization_id, recipients, kind="transfer_waiting", channel="transfer", setting="transfer_waiting",
        title=title, body=body, amount_cents=total, currency=currency,
        data={"transaction_ids": [str(r.id) for r in rows], "route": "transfers"},
    )


HANDLERS = {
    "push.donation.paid": _donation_paid,
    "push.payment.paid": _payment_paid,
    "push.payment.failed": _payment_failed,
    "push.payment.refunded": _payment_refunded,
    "push.transfer.waiting": _transfers_waiting,
}


async def handle_event(db: AsyncSession, event: OutboxEvent) -> None:
    handler = HANDLERS.get(event.event_type)
    if handler:
        await handler(db, event.organization_id, event.payload or {})


# --- Queueing ------------------------------------------------------------------------------------

def queue(db: AsyncSession, organization_id: UUID, event_type: str, aggregate_type: str, aggregate_id: UUID,
          payload: dict) -> None:
    """Add a push event to the current transaction; it is handed to a worker as soon as it commits."""
    event = OutboxEvent(organization_id=organization_id, aggregate_type=aggregate_type, aggregate_id=aggregate_id,
                        event_type=event_type, payload=payload)
    db.add(event)
    sa_event.listen(db.sync_session, "after_commit", lambda _session: _kick(event), once=True)


def _kick(event: OutboxEvent) -> None:
    event_id = getattr(event, "id", None)
    if event_id:
        threading.Thread(target=_hand_over, args=(str(event_id),), daemon=True, name="push-kick").start()


def _hand_over(event_id: str) -> None:
    try:
        from app.tasks import deliver_outbox_event_task
        deliver_outbox_event_task.apply_async((event_id,), retry=False, ignore_result=True)
    except Exception as exc:  # noqa: BLE001 - no broker: send from this process; the outbox runner retries later
        logger.info("Bildirim işçisine ulaşılamadı (%s); bu süreçten gönderiliyor", exc)
        try:
            from app.tasks import deliver_outbox_event
            asyncio.run(deliver_outbox_event(event_id, own_engine=True))
        except Exception:  # noqa: BLE001
            logger.exception("Bildirim gönderilemedi; kuyrukta bekliyor")


# --- Daily digest --------------------------------------------------------------------------------

def day_bounds(day: datetime) -> tuple[datetime, datetime]:
    start = datetime.combine(day.astimezone(TZ).date(), time.min, TZ)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


async def inflow_by_channel(db: AsyncSession, organization_id: UUID, start: datetime, end: datetime,
                            issued_by_id: Optional[UUID] = None) -> dict:
    """Confirmed money in [start, end) grouped by channel. TRY totals; other currencies listed apart."""
    query = select(Donation.amount_cents, Donation.currency, Donation.payment_provider, Donation.payment_details,
                   Donation.payment_method).where(
        Donation.organization_id == organization_id, Donation.status == DonationStatus.CONFIRMED,
        Donation.paid_at >= start, Donation.paid_at < end)
    if issued_by_id:
        query = query.where(Donation.issued_by_id == issued_by_id)
    channels: dict[str, dict] = {}
    others: dict[str, dict] = {}
    total = count = 0
    for amount, currency, provider, details, method in (await db.execute(query)).all():
        channel = channel_for(provider, details, method)
        if channel == "import":
            continue
        if (currency or "TRY") != "TRY":
            bucket = others.setdefault(currency, {"currency": currency, "count": 0, "total_cents": 0})
            bucket["count"] += 1
            bucket["total_cents"] += amount
            continue
        bucket = channels.setdefault(channel, {"key": channel, "label": CHANNEL_LABELS.get(channel, channel), "count": 0, "total_cents": 0})
        bucket["count"] += 1
        bucket["total_cents"] += amount
        total += amount
        count += 1
    ordered = sorted(channels.values(), key=lambda c: -c["total_cents"])
    return {"total_cents": total, "count": count, "channels": ordered, "other_currencies": list(others.values())}


async def send_daily_digest(db: AsyncSession, organization_id: UUID, now: Optional[datetime] = None) -> int:
    now = now or datetime.now(TZ)
    start, end = day_bounds(now)
    today = await inflow_by_channel(db, organization_id, start, end)
    if not today["count"]:
        return 0
    yesterday = await inflow_by_channel(db, organization_id, start - timedelta(days=1), start)
    date_key = now.astimezone(TZ).date().isoformat()
    staff = [u for u in await _staff(db, organization_id) if _can(u, "receipts.view_all")]
    already = set((await db.execute(select(StaffNotification.user_id).where(
        StaffNotification.organization_id == organization_id, StaffNotification.kind == "digest",
        StaffNotification.data["date"].astext == date_key))).scalars().all())
    recipients = [u for u in staff if u.id not in already]
    parts = [f"{c['label'].split(' (')[0]} {money(c['total_cents'])}" for c in today["channels"][:4]]
    change = ""
    if yesterday["total_cents"]:
        pct = round((today["total_cents"] - yesterday["total_cents"]) * 100 / yesterday["total_cents"])
        change = f"\nDüne göre {'+' if pct >= 0 else ''}{pct}%"
    return await deliver(
        db, organization_id, recipients, kind="digest", setting="digest",
        title=f"Gün sonu: {money(today['total_cents'])} · {today['count']} bağış",
        body=" · ".join(parts) + change,
        amount_cents=today["total_cents"], currency="TRY",
        data={"date": date_key, "route": "inflow"},
    )


async def send_weekly_digest(db: AsyncSession, organization_id: UUID, now: Optional[datetime] = None) -> int:
    """7-day inflow summary pushed on Sunday evenings to staff who see every receipt."""
    now = now or datetime.now(TZ)
    _, end = day_bounds(now)
    start = end - timedelta(days=7)
    week = await inflow_by_channel(db, organization_id, start, end)
    if not week["count"]:
        return 0
    prev = await inflow_by_channel(db, organization_id, start - timedelta(days=7), start)
    week_key = now.astimezone(TZ).strftime("%G-W%V")
    staff = [u for u in await _staff(db, organization_id) if _can(u, "receipts.view_all")]
    already = set((await db.execute(select(StaffNotification.user_id).where(
        StaffNotification.organization_id == organization_id, StaffNotification.kind == "weekly_digest",
        StaffNotification.data["week"].astext == week_key))).scalars().all())
    recipients = [u for u in staff if u.id not in already]
    parts = [f"{c['label'].split(' (')[0]} {money(c['total_cents'])}" for c in week["channels"][:4]]
    change = ""
    if prev["total_cents"]:
        pct = round((week["total_cents"] - prev["total_cents"]) * 100 / prev["total_cents"])
        change = f"\nGeçen haftaya göre {'+' if pct >= 0 else ''}{pct}%"
    return await deliver(
        db, organization_id, recipients, kind="weekly_digest", setting="weekly_digest",
        title=f"Haftalık özet: {money(week['total_cents'])} · {week['count']} bağış",
        body=" · ".join(parts) + change,
        amount_cents=week["total_cents"], currency="TRY",
        data={"week": week_key, "route": "inflow"},
    )


async def send_money_box_due_alerts(db: AsyncSession, organization_id: UUID, now: Optional[datetime] = None) -> int:
    """Notify operations staff about active money boxes overdue for collection (> 30 days)."""
    from app.models.field_ops import MoneyBox
    now = now or datetime.now(TZ)
    cutoff = now - timedelta(days=30)
    date_key = now.astimezone(TZ).date().isoformat()
    due_boxes = (await db.execute(select(MoneyBox).where(
        MoneyBox.organization_id == organization_id,
        MoneyBox.status == "active",
        func.coalesce(MoneyBox.last_collected_at, MoneyBox.created_at) <= cutoff,
    ).limit(50))).scalars().all()
    if not due_boxes:
        return 0
    staff = [u for u in await _staff(db, organization_id) if _can(u, "operations.manage") or _can(u, "receipts.view_all")]
    already = set((await db.execute(select(StaffNotification.user_id).where(
        StaffNotification.organization_id == organization_id, StaffNotification.kind == "money_box_due",
        StaffNotification.data["date"].astext == date_key))).scalars().all())
    recipients = [u for u in staff if u.id not in already]
    sample = ", ".join(b.code for b in due_boxes[:4])
    return await deliver(
        db, organization_id, recipients, kind="money_box_due", setting="money_box_due",
        title=f"{len(due_boxes)} kumbara tahsilat bekliyor",
        body=f"30+ gündür toplanmayan kumbaralar: {sample}{'…' if len(due_boxes) > 4 else ''}",
        data={"route": "money_box", "date": date_key, "count": len(due_boxes)},
    )


async def notify_recurring_failed(db: AsyncSession, organization_id: UUID, donor_name: str, amount_cents: int,
                                  currency: str, reason: str, subscription_id: UUID) -> int:
    staff = [u for u in await _staff(db, organization_id) if _can(u, "receipts.view_all")]
    return await deliver(
        db, organization_id, staff, kind="recurring_failed", setting="recurring_failed",
        title=f"Düzenli bağış çekilemedi · {money(amount_cents, currency)}",
        body=f"{donor_name} · {reason[:120]}",
        amount_cents=amount_cents, currency=currency,
        data={"route": "recurring", "subscription_id": str(subscription_id)},
    )


async def notify_campaign_milestone(db: AsyncSession, campaign: Campaign) -> int:
    """Emit a milestone notification when a campaign crosses 50%, 80%, or 100% of its target."""
    if not campaign.target_cents or campaign.target_cents <= 0:
        return 0
    pct = int((campaign.collected_cents or 0) * 100 / campaign.target_cents)
    milestone = 100 if pct >= 100 else 80 if pct >= 80 else 50 if pct >= 50 else 0
    if not milestone:
        return 0
    already = (await db.execute(select(StaffNotification.id).where(
        StaffNotification.organization_id == campaign.organization_id,
        StaffNotification.kind == "campaign_milestone",
        StaffNotification.data["campaign_id"].astext == str(campaign.id),
        StaffNotification.data["milestone"].astext == str(milestone),
    ).limit(1))).first()
    if already:
        return 0
    staff = [u for u in await _staff(db, campaign.organization_id) if _can(u, "receipts.view_all")]
    return await deliver(
        db, campaign.organization_id, staff, kind="campaign_milestone", setting="campaign_milestone",
        title=f"Kampanya %{milestone} hedefine ulaştı!",
        body=f"{campaign.title} · {money(campaign.collected_cents or 0)} / {money(campaign.target_cents)}",
        amount_cents=campaign.collected_cents or 0, currency=campaign.currency or "TRY",
        data={"route": "campaign", "campaign_id": str(campaign.id), "milestone": str(milestone)},
    )


async def notify_system_alert(db: AsyncSession, organization_id: UUID, title: str, body: str,
                              data: Optional[dict[str, Any]] = None) -> int:
    staff = [u for u in await _staff(db, organization_id) if _can(u, "settings.manage") or _can(u, "receipts.view_all")]
    return await deliver(
        db, organization_id, staff, kind="system_alert", setting="system_alert",
        title=title, body=body, data=data or {},
    )
