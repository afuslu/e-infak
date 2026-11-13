"""Setting a staff user's password from any of the three places that may do it:
the user themself, an organisation manager, or a platform operator."""
import secrets
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.user import Session as UserSession, User

MIN_LENGTH = 10


def temporary_password() -> str:
    return secrets.token_urlsafe(12)


async def set_password(db: AsyncSession, user: User, password: str, keep_session: Optional[UUID] = None) -> None:
    """Store the new hash and sign the user out everywhere (except `keep_session`), so an old
    password or a stolen refresh token stops working at once. The caller commits."""
    user.hashed_password = get_password_hash(password)
    query = update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
    if keep_session is not None:
        query = query.where(UserSession.id != keep_session)
    await db.execute(query.values(revoked_at=datetime.now(timezone.utc)))


async def current_session_id(db: AsyncSession, user: User, refresh_token: Optional[str]) -> Optional[UUID]:
    if not refresh_token:
        return None
    return (await db.execute(select(UserSession.id).where(
        UserSession.user_id == user.id, UserSession.refresh_token == refresh_token))).scalar_one_or_none()
