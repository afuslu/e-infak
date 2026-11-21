"""Sequential "Makbuz No" per organisation (STK PRO numbering continues: last imported + 1).

One receipt (all lines of a manual receipt, all items of an online order) shares one number.
"""
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.donation import Donation


async def next_receipt_seq(db: AsyncSession, organization_id: UUID) -> int:
    """Next number; a transaction-scoped advisory lock keeps two receipts from taking the same one."""
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"receipt_seq:{organization_id}"})
    from app.models.organization import Organization

    org = await db.get(Organization, organization_id)
    start = 0
    try:
        start = int(((org.settings or {}) if org else {}).get("receipt_seq_start") or 0)
    except (TypeError, ValueError):
        start = 0
    current = (await db.execute(
        select(func.max(Donation.receipt_seq)).where(Donation.organization_id == organization_id)
    )).scalar_one() or 0
    return max(current + 1, start)
