"""Expo Push Notification sender helper."""
import logging
from typing import Iterable, Optional
from uuid import UUID

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.device_token import DeviceToken

logger = logging.getLogger(__name__)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
CHUNK = 100  # Expo accepts at most 100 messages per request


def _is_expo_token(token: Optional[str]) -> bool:
    return bool(token) and (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken["))


async def _post(messages: list[dict], errors: Optional[list[str]] = None) -> tuple[int, list[str]]:
    """Send one chunk. Returns (accepted, tokens Expo says no longer exist).

    Every other rejection is logged and its code appended to `errors`: a refused push is not a missing device.
    """
    dead: list[str] = []
    errors = [] if errors is None else errors
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(EXPO_PUSH_URL, json=messages)
        if resp.status_code >= 400:
            logger.warning("Expo push HTTP %s: %s", resp.status_code, resp.text[:300])
            errors.append(f"HTTP {resp.status_code}")
            return 0, dead
        tickets = (resp.json() or {}).get("data") or []
    except Exception as exc:  # noqa: BLE001 - a push must never break the caller
        logger.warning("Expo push failed: %s", exc)
        errors.append("Unreachable")
        return 0, dead
    accepted = 0
    for message, ticket in zip(messages, tickets if isinstance(tickets, list) else []):
        if ticket.get("status") == "ok":
            accepted += 1
        elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
            dead.append(message["to"])
        else:
            code = (ticket.get("details") or {}).get("error") or "Unknown"
            errors.append(code)
            logger.error("Expo push rejected (%s): %s", code, ticket.get("message"))
    if accepted + len(dead) < len(messages) and not errors:
        logger.error("Expo push returned an unexpected response: %s", resp.text[:300])
        errors.append("Unknown")
    return accepted, dead


async def push_messages(tokens: Iterable[str], title: str, body: str, data: Optional[dict] = None,
                        *, badge: Optional[int] = None, channel_id: str = "default",
                        category_id: Optional[str] = None,
                        errors: Optional[list[str]] = None) -> tuple[int, list[str]]:
    valid = list(dict.fromkeys(t for t in tokens if _is_expo_token(t)))
    messages = []
    for token in valid:
        message = {"to": token, "sound": "default", "title": title, "body": body, "data": data or {},
                   "channelId": channel_id, "priority": "high"}
        if badge is not None:
            message["badge"] = badge
        if category_id:
            message["categoryId"] = category_id
        messages.append(message)
    accepted, dead = 0, []
    for start in range(0, len(messages), CHUNK):
        ok, gone = await _post(messages[start:start + CHUNK], errors)
        accepted += ok
        dead.extend(gone)
    return accepted, dead


async def send_expo_push(tokens: Iterable[str], title: str, body: str, data: Optional[dict] = None) -> int:
    accepted, _dead = await push_messages(tokens, title, body, data)
    return accepted


async def forget_tokens(db: AsyncSession, tokens: list[str]) -> None:
    """Remove device tokens Expo reported as uninstalled / logged out."""
    if tokens:
        await db.execute(delete(DeviceToken).where(DeviceToken.token.in_(tokens)))


async def bind_device_token(
    db: AsyncSession,
    *,
    token: str,
    platform: str = "expo",
    organization_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    donor_id: Optional[UUID] = None,
    platform_user_id: Optional[UUID] = None,
) -> DeviceToken:
    """Bind a physical device token to exactly one active principal (staff, donor, or platform operator).

    Reassigning an existing token atomically clears any previous account on the same device so a
    logged-out or expired session can never leak notifications to the next person using the phone.
    """
    existing = (await db.execute(select(DeviceToken).where(DeviceToken.token == token))).scalar_one_or_none()
    if existing:
        existing.platform = platform
        existing.organization_id = organization_id
        existing.user_id = user_id
        existing.donor_id = donor_id
        existing.platform_user_id = platform_user_id
        return existing
    row = DeviceToken(
        organization_id=organization_id,
        user_id=user_id,
        donor_id=donor_id,
        platform_user_id=platform_user_id,
        token=token,
        platform=platform,
    )
    db.add(row)
    return row


async def unbind_device_token(
    db: AsyncSession,
    *,
    token: str,
    user_id: Optional[UUID] = None,
    donor_id: Optional[UUID] = None,
    platform_user_id: Optional[UUID] = None,
) -> None:
    conds = [DeviceToken.token == token]
    if user_id is not None:
        conds.append(DeviceToken.user_id == user_id)
    if donor_id is not None:
        conds.append(DeviceToken.donor_id == donor_id)
    if platform_user_id is not None:
        conds.append(DeviceToken.platform_user_id == platform_user_id)
    await db.execute(delete(DeviceToken).where(*conds))


async def user_tokens(db: AsyncSession, user_id: UUID, organization_id: Optional[UUID] = None) -> list[str]:
    query = select(DeviceToken.token).where(DeviceToken.user_id == user_id)
    if organization_id:
        query = query.where((DeviceToken.organization_id == organization_id) | DeviceToken.organization_id.is_(None))
    return list((await db.execute(query)).scalars().all())


async def donor_tokens(db: AsyncSession, donor_ids: Iterable[UUID], organization_id: Optional[UUID] = None) -> list[str]:
    from app.models.donation import Donor

    ids = list(dict.fromkeys(donor_ids))
    if not ids:
        return []
    query = (
        select(DeviceToken.token)
        .join(Donor, Donor.id == DeviceToken.donor_id)
        .where(DeviceToken.donor_id.in_(ids), Donor.push_opt_out.is_(False))
    )
    if organization_id:
        query = query.where((DeviceToken.organization_id == organization_id) | DeviceToken.organization_id.is_(None))
    return list((await db.execute(query)).scalars().all())


async def platform_tokens(db: AsyncSession) -> list[str]:
    from app.models.platform import PlatformUser

    query = (
        select(DeviceToken.token)
        .join(PlatformUser, PlatformUser.id == DeviceToken.platform_user_id)
        .where(PlatformUser.is_active.is_(True))
    )
    return list((await db.execute(query)).scalars().all())


async def notify_user_push(
    db: AsyncSession,
    user_id: UUID,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    accepted, dead = await push_messages(await user_tokens(db, user_id), title, body, data)
    await forget_tokens(db, dead)
    return accepted


async def notify_donor_push(
    db: AsyncSession,
    donor_id: UUID,
    organization_id: Optional[UUID],
    title: str,
    body: str,
    data: Optional[dict] = None,
    *,
    channel_id: str = "money_in",
) -> int:
    """Send a push notification to all devices of a donor (matching duplicate donor rows by phone if any)."""
    from app.models.donation import Donor
    from app.utils.phone import phone_key, phone_matches

    donor = await db.get(Donor, donor_id)
    if not donor or donor.push_opt_out:
        return 0
    ids: set[UUID] = {donor.id}
    if donor.phone and len(phone_key(donor.phone)) == 10:
        same_phone = (
            await db.execute(
                select(Donor.id).where(
                    Donor.organization_id == donor.organization_id,
                    Donor.push_opt_out.is_(False),
                    phone_matches(Donor.phone, donor.phone),
                )
            )
        ).scalars().all()
        ids.update(same_phone)
    tokens = await donor_tokens(db, ids, organization_id or donor.organization_id)
    if not tokens:
        return 0
    accepted, dead = await push_messages(tokens, title, body, data, channel_id=channel_id)
    await forget_tokens(db, dead)
    return accepted


async def notify_platform_push(
    db: AsyncSession,
    title: str,
    body: str,
    data: Optional[dict] = None,
    *,
    channel_id: str = "urgent",
) -> int:
    """Send a push notification to all active platform operators."""
    tokens = await platform_tokens(db)
    if not tokens:
        return 0
    accepted, dead = await push_messages(tokens, title, body, data, channel_id=channel_id)
    await forget_tokens(db, dead)
    return accepted
