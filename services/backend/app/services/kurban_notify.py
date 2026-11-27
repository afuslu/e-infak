"""'Kurbanınız kesildi' bildirimleri: hissedara bir kez SMS (kişiye özel video linkiyle) ve push.

İki yerden çağrılır: kesim işaretlenirken (POST /kurban/animals/slaughter) ve kasap tabletinden
kesim videosu yüklenip tamamlandığında — tablet kesimi bildirimsiz işaretler, SMS video hazır
olunca gider ki link boş/yanlış olmasın.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings


def portal_url(organization) -> str:
    if settings.ENVIRONMENT == "production" and getattr(organization, "primary_domain", None):
        return f"https://{organization.primary_domain}/portal"
    return f"{settings.PUBLIC_WEB_URL.rstrip('/')}/portal"


async def sms_enabled(db: AsyncSession, org_id: UUID) -> bool:
    """Kurum 'kurban kesildi' SMS şablonunu kapatabilir (otomatik değilse gönderilmez)."""
    from app.services.sms_service import event_template

    return (await event_template(db, org_id, "kurban_kesildi"))[1] == "auto"


async def sms_for_shares(db: AsyncSession, org_id: UUID, animal, shares, portal: str,
                         now: Optional[datetime] = None) -> tuple[int, int]:
    """Bildirilmemiş, telefonu olan hissedarlara SMS; aynı telefona bir kez. (kuyruğa alınan, başarısız)"""
    from app.services.sms_service import send_event_sms
    from app.services.videos import video_for_animal, watch_url

    now = now or datetime.now(timezone.utc)
    queued_n = failed_n = 0
    notified_phones: set[str] = set()
    stored_video = None
    looked_up = False
    for share in shares:
        if share.notified_at or not share.donor_phone:
            continue
        if share.donor_phone in notified_phones:
            share.notified_at = now
            continue
        # {video}: sunucuya yüklenmiş videoda bağışçıya özel izleme linki (izlenme görülür),
        # yoksa elle girilen bağlantı, o da yoksa bağışçı paneli.
        if not looked_up:
            stored_video = await video_for_animal(db, animal.id)
            looked_up = True
        video_link = (await watch_url(db, org_id, stored_video.id, share.donor_id) if stored_video
                      else animal.video_url or portal)
        queued = await send_event_sms(
            db, org_id, "kurban_kesildi", share.donor_phone, related=("kurban_share", share.id), source="kurban",
            extra={"ad_soyad": share.donor_name, "kimin_adina": share.on_behalf_of or share.donor_name,
                   "kurban_no": animal.animal_number, "portal": portal, "video": video_link},
        )
        if queued:
            queued.donor_id = share.donor_id
            share.notified_at = now
            notified_phones.add(share.donor_phone)
            queued_n += 1
        else:
            failed_n += 1
    return queued_n, failed_n


async def push_slaughtered(db: AsyncSession, org_id: UUID, targets: dict[UUID, tuple[str, str]]) -> None:
    """targets: donor_id → (hayvan no, kimin adına). Hatalar kesimi durdurmaz."""
    if not targets:
        return
    from app.services.push_service import notify_donor_push

    for donor_id, (animal_no, behalf) in targets.items():
        try:
            await notify_donor_push(
                db, donor_id, org_id,
                title=f"Kurbanınız kesildi · {animal_no}",
                body=f"{behalf} adına kurban vekaletiniz yerine getirilmiştir. Allah kabul etsin.",
                data={"route": "donor_kurban", "animal_number": animal_no},
            )
        except Exception:  # noqa: BLE001
            pass


async def notify_on_video(db: AsyncSession, animal, organization) -> dict:
    """Kesilmiş hayvanın videosu tamamlandı: ayar açıksa bildirilmemiş hissedarlara SMS + push.

    Bir kez çalışır: sonunda video durumu "sent" olur; tekrar yüklenen videoda yeniden gitmez.
    Çağıran commit eder.
    """
    from app.models.kurban import KurbanShare, KurbanStatus

    if organization is None or animal.status != KurbanStatus.SLAUGHTERED or animal.video_status == "sent":
        return {"sms_queued": 0, "skipped": True}
    if not ((organization.settings or {}).get("kurban_settings") or {}).get("auto_notify_video", True):
        return {"sms_queued": 0, "skipped": True}
    org_id = animal.organization_id
    shares = (await db.execute(
        select(KurbanShare).where(KurbanShare.animal_id == animal.id).with_for_update()
    )).scalars().all()
    pending = [s for s in shares if not s.notified_at]
    if not pending:  # kesimde zaten bildirildi; videoyu personel ayrıca gönderebilir
        return {"sms_queued": 0, "skipped": True}
    targets = {s.donor_id: (animal.animal_number, s.on_behalf_of or s.donor_name) for s in pending if s.donor_id}
    queued = 0
    if await sms_enabled(db, org_id):
        queued, _ = await sms_for_shares(db, org_id, animal, pending, portal_url(organization))
    await push_slaughtered(db, org_id, targets)
    animal.video_status = "sent"
    return {"sms_queued": queued, "skipped": False}
