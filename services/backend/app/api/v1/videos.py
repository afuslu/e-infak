"""Donation videos: chunked upload, linking to kurban animals / donations / campaigns, bulk kurban
matching by file name, view report, SMS notification, and the public watch page with streaming."""
import os
import re
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_feature, require_module
from app.core.db import get_db
from app.core.plans import Feature
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign
from app.models.channels import DonationVideo, VideoView
from app.models.donation import Donation, Donor
from app.models.kurban import KurbanAnimal, KurbanCampaign, KurbanShare
from app.models.organization import Organization
from app.models.user import User
from app.services import videos as vs

router = APIRouter(prefix="/admin-features/videos", tags=["videos"],
                   dependencies=[Depends(require_feature(Feature.DONATION_VIDEO))])
public_router = APIRouter(prefix="/media/video", tags=["videos-public"])
reader = require_module("kurban", "receipts", "donors", write=False)
writer = require_module("kurban", "receipts")


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


async def _video(db: AsyncSession, org_id: UUID, video_id: UUID) -> DonationVideo:
    video = await db.get(DonationVideo, video_id)
    if not video or video.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Video bulunamadı")
    return video


async def _attach_to_animal(db: AsyncSession, video: DonationVideo, animal: KurbanAnimal) -> None:
    video.kurban_animal_id = animal.id
    animal.video_url = vs.watch_path(video.id)
    if animal.video_status in (None, "none"):
        animal.video_status = "recorded"


async def _row(db: AsyncSession, v: DonationVideo) -> dict:
    views, viewers = (await db.execute(select(func.coalesce(func.sum(VideoView.view_count), 0),
                                              func.count(VideoView.donor_id)).where(VideoView.video_id == v.id))).one()
    target = None
    if v.kurban_animal_id:
        animal = await db.get(KurbanAnimal, v.kurban_animal_id)
        target = {"type": "kurban", "label": f"Kurban #{animal.animal_number}" if animal else "Kurban"}
    elif v.donation_id:
        donation = await db.get(Donation, v.donation_id)
        target = {"type": "donation", "label": f"Makbuz {donation.receipt_number}" if donation else "Bağış"}
    elif v.campaign_id:
        campaign = await db.get(Campaign, v.campaign_id)
        target = {"type": "campaign", "label": campaign.title if campaign else "Bağış kalemi"}
    return {
        "id": str(v.id), "title": v.title or v.original_name, "original_name": v.original_name,
        "size_bytes": v.size_bytes, "received_bytes": v.received_bytes, "status": v.status,
        "content_type": v.content_type, "target": target,
        "kurban_animal_id": str(v.kurban_animal_id) if v.kurban_animal_id else None,
        "donation_id": str(v.donation_id) if v.donation_id else None,
        "campaign_id": str(v.campaign_id) if v.campaign_id else None,
        "views": int(views or 0), "viewers": int(viewers or 0), "watch_path": vs.watch_path(v.id),
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


# --- upload ------------------------------------------------------------------------------------

class UploadIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0, le=vs.MAX_VIDEO_BYTES)
    content_type: Optional[str] = Field(default=None, max_length=60)
    title: Optional[str] = Field(default=None, max_length=200)
    kurban_animal_id: Optional[UUID] = None
    donation_id: Optional[UUID] = None
    campaign_id: Optional[UUID] = None


@router.post("/uploads")
async def start_upload(payload: UploadIn, request: Request, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(writer)):
    org_id = _org_id(request)
    try:
        ext = vs.extension_for(payload.filename, payload.content_type)
    except vs.VideoError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    video = DonationVideo(organization_id=org_id, original_name=os.path.basename(payload.filename)[:255],
                          file_name="pending", content_type=vs.CONTENT_TYPES[ext], size_bytes=payload.size,
                          title=(payload.title or "").strip() or None, uploaded_by=current_user.id)
    db.add(video)
    await db.flush()
    video.file_name = f"{video.id}{ext}"
    await _link(db, org_id, video, payload.kurban_animal_id, payload.donation_id, payload.campaign_id)
    await db.commit()
    return {"id": str(video.id), "chunk_bytes": vs.CHUNK_BYTES, "received_bytes": 0}


@router.put("/uploads/{video_id}/chunks/{index}")
async def upload_chunk(video_id: UUID, request: Request, index: int = PathParam(ge=0),
                       db: AsyncSession = Depends(get_db), _: User = Depends(writer)):
    org_id = _org_id(request)
    video = (await db.execute(select(DonationVideo).where(
        DonationVideo.id == video_id, DonationVideo.organization_id == org_id).with_for_update())).scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Video bulunamadı")
    if video.status == "ready":
        return {"received_bytes": video.received_bytes, "status": video.status}
    data = await request.body()
    if len(data) > vs.CHUNK_BYTES:
        raise HTTPException(status_code=413, detail="Parça 5 MB'tan büyük")
    try:
        video.received_bytes = vs.write_chunk(video, index, data)
    except vs.VideoError as exc:
        raise HTTPException(status_code=409, detail={"message": str(exc), "received_bytes": video.received_bytes}) from exc
    if video.received_bytes >= video.size_bytes:
        video.status = "ready"
        if video.kurban_animal_id:
            animal = await db.get(KurbanAnimal, video.kurban_animal_id)
            if animal:
                await _attach_to_animal(db, video, animal)
    await db.commit()
    return {"received_bytes": video.received_bytes, "status": video.status}


# --- library -----------------------------------------------------------------------------------

@router.get("")
async def list_videos(request: Request, unattached: bool = False, q: Optional[str] = Query(default=None, max_length=80),
                      page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
                      db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    query = select(DonationVideo).where(DonationVideo.organization_id == org_id)
    if unattached:
        query = query.where(DonationVideo.kurban_animal_id.is_(None), DonationVideo.donation_id.is_(None),
                            DonationVideo.campaign_id.is_(None))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(DonationVideo.original_name.ilike(like) | DonationVideo.title.ilike(like))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    used = (await db.execute(select(func.coalesce(func.sum(DonationVideo.size_bytes), 0)).where(
        DonationVideo.organization_id == org_id))).scalar_one()
    rows = (await db.execute(query.order_by(DonationVideo.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"total": total, "used_bytes": int(used or 0), "items": [await _row(db, v) for v in rows]}


class LinkIn(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    kurban_animal_id: Optional[UUID] = None
    donation_id: Optional[UUID] = None
    campaign_id: Optional[UUID] = None


async def _link(db: AsyncSession, org_id: UUID, video: DonationVideo, animal_id: Optional[UUID],
                donation_id: Optional[UUID], campaign_id: Optional[UUID]) -> None:
    if animal_id:
        animal = await db.get(KurbanAnimal, animal_id)
        if not animal or animal.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Kurban hayvanı bulunamadı")
        video.kurban_animal_id = animal.id
        if video.status == "ready":
            await _attach_to_animal(db, video, animal)
    if donation_id:
        donation = await db.get(Donation, donation_id)
        if not donation or donation.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağış bulunamadı")
        video.donation_id = donation.id
    if campaign_id:
        campaign = await db.get(Campaign, campaign_id)
        if not campaign or campaign.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağış kalemi bulunamadı")
        video.campaign_id = campaign.id


@router.patch("/{video_id}")
async def update_video(video_id: UUID, payload: LinkIn, request: Request, db: AsyncSession = Depends(get_db),
                       _: User = Depends(writer)):
    org_id = _org_id(request)
    video = await _video(db, org_id, video_id)
    if "title" in payload.model_fields_set:
        video.title = (payload.title or "").strip() or None
    await _link(db, org_id, video, payload.kurban_animal_id, payload.donation_id, payload.campaign_id)
    await db.commit()
    return await _row(db, video)


@router.delete("/{video_id}")
async def delete_video(video_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(writer)):
    org_id = _org_id(request)
    video = await _video(db, org_id, video_id)
    if video.kurban_animal_id:
        animal = await db.get(KurbanAnimal, video.kurban_animal_id)
        if animal and animal.video_url == vs.watch_path(video.id):
            animal.video_url = None
            if animal.video_status == "recorded":
                animal.video_status = "none"
    vs.remove_file(video)
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="video_sil",
                    details={"video": str(video.id), "name": video.original_name}))
    await db.delete(video)
    await db.commit()
    return {"ok": True}


class MatchIn(BaseModel):
    kurban_campaign_id: UUID
    video_ids: list[UUID] = Field(default_factory=list, max_length=2000)


def _number_key(value: str) -> str:
    """'K-012.mp4' / 'k12' / '12' all become '12'; non-numeric names compare case-insensitively."""
    stem = os.path.splitext(value or "")[0].strip().lower()
    digits = re.findall(r"\d+", stem)
    return str(int(digits[-1])) if digits else re.sub(r"\s+", "", stem)


@router.post("/match-kurban")
async def match_kurban(payload: MatchIn, request: Request, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(writer)):
    """Bulk matching: a video named after an animal number (e.g. 12.mp4, K-12.mov) goes to that animal."""
    org_id = _org_id(request)
    campaign = await db.get(KurbanCampaign, payload.kurban_campaign_id)
    if not campaign or campaign.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Kurban kampanyası bulunamadı")
    animals = (await db.execute(select(KurbanAnimal).where(
        KurbanAnimal.organization_id == org_id, KurbanAnimal.campaign_id == campaign.id))).scalars().all()
    by_number: dict[str, KurbanAnimal] = {}
    for a in animals:
        by_number.setdefault(_number_key(a.animal_number), a)
    query = select(DonationVideo).where(DonationVideo.organization_id == org_id, DonationVideo.status == "ready")
    query = query.where(DonationVideo.id.in_(payload.video_ids)) if payload.video_ids else query.where(
        DonationVideo.kurban_animal_id.is_(None), DonationVideo.donation_id.is_(None),
        DonationVideo.campaign_id.is_(None))
    matched, unmatched = [], []
    for video in (await db.execute(query)).scalars().all():
        animal = by_number.get(_number_key(video.original_name))
        if not animal:
            unmatched.append(video.original_name)
            continue
        await _attach_to_animal(db, video, animal)
        matched.append({"video": video.original_name, "animal_number": animal.animal_number})
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="video_toplu_eslestirme",
                    details={"campaign": str(campaign.id), "matched": len(matched), "unmatched": len(unmatched)}))
    await db.commit()
    return {"matched": matched, "unmatched": unmatched}


async def _audience(db: AsyncSession, org_id: UUID, video: DonationVideo) -> list[dict]:
    """Donors the video is meant for: the animal's shareholders, the donation's donor, or the campaign's donors."""
    people: dict[UUID, dict] = {}
    if video.kurban_animal_id:
        rows = (await db.execute(select(KurbanShare).where(KurbanShare.animal_id == video.kurban_animal_id))).scalars()
        for s in rows:
            if s.donor_id and s.donor_id not in people:
                people[s.donor_id] = {"donor_id": s.donor_id, "name": s.donor_name, "phone": s.donor_phone}
    elif video.donation_id:
        donation = await db.get(Donation, video.donation_id)
        donor = await db.get(Donor, donation.donor_id) if donation else None
        if donor:
            people[donor.id] = {"donor_id": donor.id, "name": donor.full_name, "phone": donor.phone}
    elif video.campaign_id:
        rows = (await db.execute(select(Donor).join(Donation, Donation.donor_id == Donor.id).where(
            Donation.organization_id == org_id, Donation.campaign_id == video.campaign_id).distinct().limit(5000)))
        for d in rows.scalars():
            people[d.id] = {"donor_id": d.id, "name": d.full_name, "phone": d.phone}
    return list(people.values())


@router.get("/{video_id}/views")
async def views(video_id: UUID, request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(reader)):
    org_id = _org_id(request)
    video = await _video(db, org_id, video_id)
    seen = {v.donor_id: v for v in (await db.execute(select(VideoView).where(VideoView.video_id == video.id))).scalars()}
    people = await _audience(db, org_id, video)
    out = []
    for p in people:
        v = seen.pop(p["donor_id"], None)
        out.append({**p, "donor_id": str(p["donor_id"]), "viewed": bool(v), "view_count": v.view_count if v else 0,
                    "last_viewed_at": v.last_viewed_at.isoformat() if v else None})
    anonymous = sum(v.view_count for v in seen.values())
    return {"items": out, "viewed": sum(1 for r in out if r["viewed"]), "audience": len(out),
            "other_views": anonymous}


class NotifyIn(BaseModel):
    message: str = Field(min_length=5, max_length=600)
    only_unviewed: bool = True


@router.post("/{video_id}/notify")
async def notify(video_id: UUID, payload: NotifyIn, request: Request, db: AsyncSession = Depends(get_db),
                 current_user: User = Depends(writer)):
    """SMS each donor of the video their own watch link ({video} in the text; added at the end otherwise)."""
    from app.services.sms_service import enqueue_sms, valid_phone

    org_id = _org_id(request)
    video = await _video(db, org_id, video_id)
    if video.status != "ready":
        raise HTTPException(status_code=400, detail="Video yüklemesi tamamlanmadı")
    viewed = set((await db.execute(select(VideoView.donor_id).where(VideoView.video_id == video.id))).scalars())
    queued = skipped = 0
    for person in await _audience(db, org_id, video):
        if payload.only_unviewed and person["donor_id"] in viewed:
            skipped += 1
            continue
        phone = valid_phone(person.get("phone") or "")
        if not phone:
            skipped += 1
            continue
        link = await vs.watch_url(db, org_id, video.id, person["donor_id"])
        body = payload.message.replace("{video}", link).replace("{ad_soyad}", person.get("name") or "")
        if link not in body:
            body = f"{body} {link}"
        msg = await enqueue_sms(db, org_id, phone, body, donor_id=person["donor_id"], source="kurban",
                                created_by=current_user.id)
        queued += 1 if msg else 0
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="video_sms",
                    details={"video": str(video.id), "queued": queued, "skipped": skipped}))
    await db.commit()
    return {"queued": queued, "skipped": skipped}


# --- public watch page and stream --------------------------------------------------------------

async def _public_video(db: AsyncSession, token: str) -> tuple[DonationVideo, Optional[UUID]]:
    parsed = vs.parse_token(token)
    if not parsed:
        raise HTTPException(status_code=404, detail="Video bulunamadı")
    video = await db.get(DonationVideo, parsed[0])
    if not video or video.status != "ready":
        raise HTTPException(status_code=404, detail="Video bulunamadı")
    return video, parsed[1]


@public_router.get("/{token}", response_class=HTMLResponse)
async def watch(token: str, db: AsyncSession = Depends(get_db)):
    video, donor_id = await _public_video(db, token)
    await vs.record_view(db, video, donor_id)
    await db.commit()
    org = await db.get(Organization, video.organization_id)
    title = video.title or "Bağış videonuz"
    return HTMLResponse(vs.watch_page(org.name if org else "", title, f"/api/v1/media/video/{token}/file"),
                        headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex"})


@public_router.get("/{token}/file")
async def stream(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    video, _ = await _public_video(db, token)
    path = vs.video_path(video)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video dosyası bulunamadı")
    size = path.stat().st_size
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600",
               "Content-Disposition": f'inline; filename="video{os.path.splitext(video.file_name)[1]}"'}
    rng = vs.parse_range(request.headers.get("range"), size)
    if request.headers.get("range") and rng is None:
        return StreamingResponse(iter(()), status_code=416, headers={"Content-Range": f"bytes */{size}"})
    start, end = rng or (0, size - 1)
    headers["Content-Length"] = str(end - start + 1)
    if rng:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(vs.iter_file(path, start, end), status_code=206 if rng else 200,
                             media_type=video.content_type, headers=headers)
