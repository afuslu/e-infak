"""Kurban hisselerini hayvanlara yerleştirme — tek kural.

Hem "Hisseleri dağıt" ucu hem de bağış onayı (kampanyada `auto_assign` açıksa) burayı
çağırır; böylece kurban numarası her yoldan aynı kuralla verilir.

Kural: bir bağışın hisseleri mümkünse aynı hayvanda kalır (bir hayvana sığmayan grup
bölünür); gruplar büyükten küçüğe, bekleyen ve yeri olan en küçük numaralı hayvana
konur; yer yoksa sıradaki boş numarayla yeni hayvan açılır. Kampanya satırı kilitlenir:
aynı anda gelen iki bağış aynı hisse yerini ya da aynı numarayı alamaz.
"""
from collections import OrderedDict
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kurban import SHARES_PER_ANIMAL, KurbanAnimal, KurbanCampaign, KurbanShare, KurbanStatus


async def kurban_numbers(db: AsyncSession, donation_ids: list[UUID]) -> dict[UUID, list[dict]]:
    """Per donation: its shares with the animal number they got (None while unassigned)."""
    if not donation_ids:
        return {}
    rows = (await db.execute(
        select(KurbanShare, KurbanAnimal.animal_number)
        .outerjoin(KurbanAnimal, KurbanAnimal.id == KurbanShare.animal_id)
        .where(KurbanShare.donation_id.in_(donation_ids))
        .order_by(KurbanAnimal.animal_number, KurbanShare.share_number, KurbanShare.id)
    )).all()
    result: dict[UUID, list[dict]] = {}
    for share, number in rows:
        result.setdefault(share.donation_id, []).append({
            "share_id": str(share.id), "animal_number": number, "share_number": share.share_number,
            "name": share.on_behalf_of or share.donor_name,
        })
    return result


def free_numbers(taken: set[int], capacity: int) -> list[int]:
    return [n for n in range(1, capacity + 1) if n not in taken]


async def place_shares(db: AsyncSession, campaign: KurbanCampaign,
                       shares: Optional[list[KurbanShare]] = None) -> tuple[int, list[KurbanAnimal]]:
    """Place `shares` (default: every unassigned share of the campaign). Returns (assigned, new animals).

    The caller commits. Shares that already sit on an animal are left alone.
    """
    await db.execute(select(KurbanCampaign.id).where(KurbanCampaign.id == campaign.id).with_for_update())
    capacity = SHARES_PER_ANIMAL[campaign.animal_type]
    if shares is None:
        shares = list((await db.execute(
            select(KurbanShare).where(KurbanShare.campaign_id == campaign.id, KurbanShare.animal_id.is_(None))
            .order_by(KurbanShare.created_at, KurbanShare.id).with_for_update()
        )).scalars().all())
    pending = [s for s in shares if s.animal_id is None]
    if not pending:
        return 0, []

    animals = list((await db.execute(
        select(KurbanAnimal).where(KurbanAnimal.campaign_id == campaign.id, KurbanAnimal.status == KurbanStatus.WAITING)
        .order_by(KurbanAnimal.animal_number).with_for_update()
    )).scalars().all())
    taken: dict[UUID, set[int]] = {a.id: set() for a in animals}
    if animals:
        for animal_id, number in (await db.execute(
            select(KurbanShare.animal_id, KurbanShare.share_number).where(KurbanShare.animal_id.in_([a.id for a in animals]))
        )).all():
            taken[animal_id].add(number or 0)

    # Keep each donation's shares together; groups larger than one animal are split.
    groups: "OrderedDict[UUID | str, list[KurbanShare]]" = OrderedDict()
    for share in pending:
        groups.setdefault(share.donation_id or f"share-{share.id}", []).append(share)
    chunks = []
    for group in groups.values():
        for i in range(0, len(group), capacity):
            chunks.append(group[i:i + capacity])
    # Largest first packs animals tighter (first-fit decreasing), order is otherwise stable.
    chunks.sort(key=len, reverse=True)

    used_numbers = set((await db.execute(
        select(KurbanAnimal.animal_number).where(KurbanAnimal.campaign_id == campaign.id)
    )).scalars().all())
    counter = 0

    def next_number() -> str:
        nonlocal counter
        while True:
            counter += 1
            candidate = f"{campaign.animal_prefix}-{counter:03d}"
            if candidate not in used_numbers:
                used_numbers.add(candidate)
                return candidate

    new_animals: list[KurbanAnimal] = []
    assigned = 0
    for chunk in chunks:
        target = next((a for a in animals if capacity - len(taken[a.id]) >= len(chunk)), None)
        if target is None:
            target = KurbanAnimal(
                organization_id=campaign.organization_id, campaign_id=campaign.id, animal_number=next_number(),
                type=campaign.animal_type, status=KurbanStatus.WAITING, country=campaign.country,
            )
            db.add(target)
            await db.flush()
            animals.append(target)
            new_animals.append(target)
            taken[target.id] = set()
        for share, number in zip(chunk, free_numbers(taken[target.id], capacity)):
            share.animal_id, share.share_number = target.id, number
            taken[target.id].add(number)
            assigned += 1
    return assigned, new_animals
