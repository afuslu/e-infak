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
    user.must_change_password = False
    await sign_out_everywhere(db, user, keep_session)


async def sign_out_everywhere(db: AsyncSession, user: User, keep_session: Optional[UUID] = None) -> None:
    query = update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
    if keep_session is not None:
        query = query.where(UserSession.id != keep_session)
    await db.execute(query.values(revoked_at=datetime.now(timezone.utc)))


async def current_session_id(db: AsyncSession, user: User, refresh_token: Optional[str]) -> Optional[UUID]:
    if not refresh_token:
        return None
    return (await db.execute(select(UserSession.id).where(
        UserSession.user_id == user.id, UserSession.refresh_token == refresh_token))).scalar_one_or_none()


async def send_credentials_email(user: User, login_url: str, password: str, *, organization: str,
                                 welcome: bool) -> bool:
    """E-mails a temporary password to its owner. False when no mail provider is set up or it
    failed, so the operator knows to pass the details on by hand."""
    import asyncio
    import logging
    from html import escape

    from app.core.config import settings

    if not (settings.SENDGRID_API_KEY and user.email):
        return False
    from app.tasks import send_email_task

    intro = (f"{escape(organization)} için E-İnfak yönetim paneli hesabınız oluşturuldu."
             if welcome else "E-İnfak yönetim paneli şifreniz yenilendi.")
    html = (
        f"<p>Merhaba {escape(user.first_name or '')},</p>"
        f"<p>{intro}</p>"
        f'<p>Giriş adresi: <a href="{escape(login_url)}">{escape(login_url)}</a><br>'
        f"E-posta: <b>{escape(user.email)}</b><br>"
        f"Geçici şifre: <b>{escape(password)}</b></p>"
        "<p>İlk girişte bu şifreyi değiştirmeniz istenecek.</p>"
    )
    subject = "E-İnfak hesabınız" if welcome else "E-İnfak şifreniz yenilendi"
    try:
        await asyncio.to_thread(send_email_task, user.email, subject, html)
        return True
    except Exception as exc:  # pragma: no cover - provider outage
        logging.getLogger(__name__).warning("Hesap bilgileri e-postası gönderilemedi: %s", exc)
        return False
