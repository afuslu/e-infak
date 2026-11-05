"""Kurum medya kütüphanesi: listeleme, yükleme, meta veri, kırpma, klasörler, kota, kullanım yerleri."""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Text, cast, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_permission
from app.core.db import get_db
from app.core.rate_limit import rate_limit
from app.models.audit_log import AuditLog
from app.models.media import MediaAsset, MediaFolder
from app.models.organization import Organization
from app.models.user import User
from app.services import media as media_service
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features/media",
    tags=["media"],
    dependencies=[Depends(require_admin_route_permission)],
)


async def _org(request: Request, db: AsyncSession) -> Organization:
    return await db.get(Organization, UUID(request.state.organization_id))


async def _asset(db: AsyncSession, org_id, asset_id: UUID) -> MediaAsset:
    asset = (await db.execute(
        select(MediaAsset).where(MediaAsset.id == asset_id, MediaAsset.organization_id == org_id)
    )).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    return asset


async def _folder(db: AsyncSession, org_id, folder_id: UUID | None) -> MediaFolder | None:
    if folder_id is None:
        return None
    folder = (await db.execute(
        select(MediaFolder).where(MediaFolder.id == folder_id, MediaFolder.organization_id == org_id)
    )).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Klasör bulunamadı")
    return folder


def asset_out(asset: MediaAsset) -> dict:
    variants = sorted(asset.variants or [], key=lambda v: v["width"])
    base = asset.url.rsplit("/", 1)[0]
    current = [v for v in variants if ("-k" in v["file"]) == bool(asset.crop)]
    srcset = ", ".join(f"{base}/{v['file']} {v['width']}w" for v in current)
    thumb = next((v for v in current if v["width"] >= 320), current[-1] if current else None)
    # Uncropped full image, the canvas of the crop tool (the kept original itself is never served).
    plain = [v for v in variants if "-k" not in v["file"]]
    if plain:
        source = f"{base}/{plain[-1]['file']}"
    elif asset.original_file and ".orig." not in asset.original_file:
        source = f"{base}/{asset.original_file}"
    else:
        source = asset.url
    return {
        "id": str(asset.id),
        "url": asset.url,
        "thumbnail_url": f"{base}/{thumb['file']}" if thumb else asset.url,
        "source_url": source,
        "srcset": srcset,
        "folder_id": str(asset.folder_id) if asset.folder_id else None,
        "original_name": asset.original_name,
        "mime": asset.mime,
        "size_bytes": asset.size_bytes,
        "width": asset.width,
        "height": asset.height,
        "alt_text": asset.alt_text,
        "caption": asset.caption,
        "credit": asset.credit,
        "focal_x": asset.focal_x,
        "focal_y": asset.focal_y,
        "tags": asset.tags or [],
        "variants": [{"width": v["width"], "height": v["height"], "url": f"{base}/{v['file']}", "size": v["size"]}
                     for v in current],
        "cropped": bool(asset.crop),
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


# --- Listing / upload ---------------------------------------------------------------------

@router.get("")
async def list_media(
    request: Request,
    folder: Optional[str] = Query(None, description="klasör kimliği veya 'root'"),
    q: Optional[str] = Query(None, max_length=100),
    tag: Optional[str] = Query(None, max_length=40),
    unused: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    org = await _org(request, db)
    if await media_service.register_legacy_files(db, org.id):
        await db.commit()
    query = select(MediaAsset).where(MediaAsset.organization_id == org.id)
    if folder == "root":
        query = query.where(MediaAsset.folder_id.is_(None))
    elif folder:
        try:
            query = query.where(MediaAsset.folder_id == UUID(folder))
        except ValueError:
            raise HTTPException(status_code=422, detail="Geçersiz klasör")
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(MediaAsset.original_name.ilike(like), MediaAsset.alt_text.ilike(like),
                                MediaAsset.caption.ilike(like), cast(MediaAsset.tags, Text).ilike(like)))
    if tag:
        query = query.where(MediaAsset.tags.contains([tag.strip().lower()]))
    if unused:
        used = await media_service.used_tokens(db, org)
        if used:
            query = query.where(MediaAsset.token.not_in(used))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(
        query.order_by(MediaAsset.created_at.desc(), MediaAsset.id).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return {"items": [asset_out(a) for a in rows], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_media(
    request: Request,
    file: UploadFile = File(...),
    folder_id: Optional[UUID] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(rate_limit("media-upload", limit=120, window_seconds=300)),
):
    org = await _org(request, db)
    await _folder(db, org.id, folder_id)
    content = await file.read(media_service.MAX_UPLOAD_BYTES + 1)
    asset = await media_service.create_asset(db, org, content, file.filename, current_user.id, folder_id)
    await db.commit()
    return asset_out(asset)


@router.get("/usage")
async def storage_usage(request: Request, db: AsyncSession = Depends(get_db)):
    return await media_service.usage(db, await _org(request, db))


@router.get("/tags")
async def list_tags(request: Request, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(func.jsonb_array_elements_text(MediaAsset.tags)).where(
            MediaAsset.organization_id == UUID(request.state.organization_id)).distinct()
    )).scalars().all()
    return sorted(rows)


# --- Folders --------------------------------------------------------------------------------

class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name", mode="before")
    @classmethod
    def clean(cls, value):
        text = sanitize_public_text(str(value or "")).strip() if value else ""
        if not text:
            raise ValueError("Klasör adı boş olamaz")
        return text


@router.get("/folders")
async def list_folders(request: Request, db: AsyncSession = Depends(get_db)):
    org_id = UUID(request.state.organization_id)
    counts = dict((await db.execute(
        select(MediaAsset.folder_id, func.count()).where(MediaAsset.organization_id == org_id).group_by(MediaAsset.folder_id)
    )).all())
    folders = (await db.execute(
        select(MediaFolder).where(MediaFolder.organization_id == org_id).order_by(MediaFolder.name)
    )).scalars().all()
    return {
        "folders": [{"id": str(f.id), "name": f.name, "count": counts.get(f.id, 0)} for f in folders],
        "root_count": counts.get(None, 0),
        "total": sum(counts.values()),
    }


async def _save_folder(db: AsyncSession, folder: MediaFolder) -> dict:
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu adla bir klasör zaten var")
    return {"id": str(folder.id), "name": folder.name}


@router.post("/folders", status_code=status.HTTP_201_CREATED)
async def create_folder(request: Request, payload: FolderIn, db: AsyncSession = Depends(get_db)):
    folder = MediaFolder(organization_id=UUID(request.state.organization_id), name=payload.name)
    db.add(folder)
    return await _save_folder(db, folder)


@router.put("/folders/{folder_id}")
async def rename_folder(request: Request, folder_id: UUID, payload: FolderIn, db: AsyncSession = Depends(get_db)):
    folder = await _folder(db, UUID(request.state.organization_id), folder_id)
    folder.name = payload.name
    return await _save_folder(db, folder)


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(request: Request, folder_id: UUID, db: AsyncSession = Depends(get_db)):
    """Klasör silinir, içindeki görseller "Klasörsüz"e taşınır."""
    org_id = UUID(request.state.organization_id)
    folder = await _folder(db, org_id, folder_id)
    await db.execute(update(MediaAsset).where(MediaAsset.organization_id == org_id, MediaAsset.folder_id == folder.id)
                     .values(folder_id=None))
    await db.delete(folder)
    await db.commit()


class MoveIn(BaseModel):
    ids: List[UUID] = Field(min_length=1, max_length=200)
    folder_id: Optional[UUID] = None


@router.post("/move")
async def move_assets(request: Request, payload: MoveIn, db: AsyncSession = Depends(get_db)):
    org_id = UUID(request.state.organization_id)
    await _folder(db, org_id, payload.folder_id)
    result = await db.execute(
        update(MediaAsset).where(MediaAsset.organization_id == org_id, MediaAsset.id.in_(payload.ids))
        .values(folder_id=payload.folder_id)
    )
    await db.commit()
    return {"moved": result.rowcount}


# --- Single asset ---------------------------------------------------------------------------

class AssetUpdate(BaseModel):
    original_name: Optional[str] = Field(None, max_length=255)
    alt_text: Optional[str] = Field(None, max_length=300)
    caption: Optional[str] = Field(None, max_length=500)
    credit: Optional[str] = Field(None, max_length=200)
    focal_x: Optional[float] = Field(None, ge=0, le=1)
    focal_y: Optional[float] = Field(None, ge=0, le=1)
    tags: Optional[List[str]] = Field(None, max_length=20)
    folder_id: Optional[UUID] = None

    @field_validator("original_name", "alt_text", "caption", "credit", mode="before")
    @classmethod
    def clean_text(cls, value):
        return (sanitize_public_text(str(value)) or "").strip() if value is not None else None

    @field_validator("tags", mode="before")
    @classmethod
    def clean_tags(cls, value):
        if value is None:
            return None
        tags: list[str] = []
        for raw in value:
            tag = (sanitize_public_text(str(raw)) or "").strip().lower()[:40]
            if tag and tag not in tags:
                tags.append(tag)
        return tags


@router.get("/{asset_id}")
async def get_asset(request: Request, asset_id: UUID, db: AsyncSession = Depends(get_db)):
    return asset_out(await _asset(db, UUID(request.state.organization_id), asset_id))


@router.patch("/{asset_id}")
async def update_asset(request: Request, asset_id: UUID, payload: AssetUpdate, db: AsyncSession = Depends(get_db)):
    org_id = UUID(request.state.organization_id)
    asset = await _asset(db, org_id, asset_id)
    data = payload.model_dump(exclude_unset=True)
    if "folder_id" in data:
        await _folder(db, org_id, data["folder_id"])
    for key, value in data.items():
        if value is None and key != "folder_id":
            continue
        setattr(asset, key, value)
    await db.commit()
    return asset_out(asset)


class CropIn(BaseModel):
    x: float = Field(ge=0, lt=1)
    y: float = Field(ge=0, lt=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)


@router.post("/{asset_id}/crop")
async def crop_asset(request: Request, asset_id: UUID, payload: CropIn, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    """Görseli kırpar (oranlar özgün görsele göre 0–1) ve yeni WebP boyutlarını üretir."""
    org = await _org(request, db)
    asset = await _asset(db, org.id, asset_id)
    if payload.x + payload.width > 1.0001 or payload.y + payload.height > 1.0001:
        raise HTTPException(status_code=422, detail="Kırpma alanı görselin dışına taşıyor")
    await media_service.crop_asset(db, org, asset, payload.x, payload.y, payload.width, payload.height)
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="medya_kirp",
                    details={"asset_id": str(asset.id), "crop": asset.crop}))
    await db.commit()
    return asset_out(asset)


@router.get("/{asset_id}/usage")
async def asset_usage(request: Request, asset_id: UUID, db: AsyncSession = Depends(get_db)):
    org = await _org(request, db)
    asset = await _asset(db, org.id, asset_id)
    return await media_service.where_used(db, org, asset)


@router.delete("/{asset_id}")
async def delete_asset(request: Request, asset_id: UUID, force: bool = False, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Kullanılan bir görsel `force=true` verilmedikçe silinmez (409 ve kullanım yerleri döner)."""
    org = await _org(request, db)
    asset = await _asset(db, org.id, asset_id)
    refs = await media_service.where_used(db, org, asset)
    if refs and not force:
        raise HTTPException(status_code=409, detail={
            "code": "media_in_use", "message": "Bu görsel sitede kullanılıyor", "usages": refs,
        })
    token = asset.token
    await db.delete(asset)
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="medya_sil",
                    details={"name": asset.original_name, "forced": bool(refs)}))
    await db.commit()
    media_service.delete_files(org.id, token)
    return {"deleted": True, "was_used": bool(refs)}
