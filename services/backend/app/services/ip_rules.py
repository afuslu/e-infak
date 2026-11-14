"""Applying organisation IP rules to staff sign-ins and requests."""
import ipaddress
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ip_rule import OrgIpRule
from app.models.user import User, UserRole


def normalise(value: str) -> str:
    """"1.2.3.4" or "1.2.3.0/24" (also IPv6); raises ValueError for anything else."""
    return str(ipaddress.ip_network(value.strip(), strict=False))


def matches(ip: Optional[str], network: str) -> bool:
    try:
        return ip is not None and ipaddress.ip_address(ip) in ipaddress.ip_network(network, strict=False)
    except ValueError:
        return False


def exempt_from_allow_list(user: User) -> bool:
    """Organisation admins cannot lock themselves out with an allow list."""
    return user.role in (UserRole.STK_ADMIN, UserRole.PLATFORM_ADMIN)


async def denial(db: AsyncSession, user: User, ip: Optional[str]) -> Optional[str]:
    """Why this staff member may not use the panel from `ip`, or None when they may."""
    if user.role == UserRole.PLATFORM_ADMIN or not user.organization_id:
        return None
    rules = (await db.execute(select(OrgIpRule).where(
        OrgIpRule.organization_id == user.organization_id,
        or_(OrgIpRule.kind == "block", OrgIpRule.user_id.is_(None), OrgIpRule.user_id == user.id),
    ))).scalars().all()
    if not rules:
        return None
    if any(r.kind == "block" and matches(ip, r.network) for r in rules):
        return "Bu IP adresinden panele erişim engellendi"
    allow = [r for r in rules if r.kind == "allow"]
    if allow and not exempt_from_allow_list(user) and not any(matches(ip, r.network) for r in allow):
        return "Bu IP adresinden panele giriş izniniz yok"
    return None
