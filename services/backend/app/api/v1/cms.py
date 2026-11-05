"""Web sitesi içerik yönetimi: haber/blog, sayfalar, menü, galeri ve gönüllü başvuruları.

Gövde metinleri düz metin olarak saklanır (HTML temizlenir); public site boş
satırları paragraf, "## " ile başlayan satırları ara başlık olarak çizer.
"""
from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.core.rate_limit import rate_limit
from app.models.audit_log import AuditLog
from app.models.cms import GalleryItem, MenuItem, SitePage, VolunteerApplication
from app.models.content_post import ContentPost
from app.models.user import User
from app.utils.cms import (
    parse_video_url,
    slugify,
    validate_image_url,
    validate_link,
    validate_slug,
    video_embed_url,
)
from app.utils.content import sanitize_long_text, sanitize_public_text
from app.utils.i18n import clean_translations, localize, request_language

POST_I18N = ("title", "summary", "body", "seo_title", "seo_description")
PAGE_I18N = ("title", "body", "seo_title", "seo_description")
MENU_I18N = ("label",)
GALLERY_I18N = ("title", "album")
SEO_LIMITS = {"seo_title": 160, "seo_description": 320, "summary": 500, "title": 300, "label": 80, "album": 120}

admin_router = APIRouter(
    prefix="/admin-features",
    tags=["cms"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
public_router = APIRouter(prefix="/public", tags=["cms-public"])

POST_KINDS = ("haber", "blog", "faaliyet")
VOLUNTEER_STATUSES = ("new", "contacted", "accepted", "rejected")
VOLUNTEER_CONSENT_VERSION = "2026-11"


def _org_id(request: Request) -> UUID:
    org_id = getattr(request.state, "organization_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="Kurum bilgisi bulunamadı")
    return UUID(org_id)


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


async def _get_owned(db: AsyncSession, model, org_id: UUID, item_id: UUID, label: str):
    item = (await db.execute(
        select(model).where(model.id == item_id, model.organization_id == org_id)
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail=f"{label} bulunamadı")
    return item


async def _unique_slug(db: AsyncSession, model, org_id: UUID, wanted: str, explicit: bool,
                       exclude_id: UUID | None = None) -> str:
    """Explicit slugs must be free; generated ones get a numeric suffix."""
    base = wanted or "icerik"
    candidate = base
    for n in range(2, 200):
        query = select(model.id).where(model.organization_id == org_id, model.slug == candidate)
        if exclude_id:
            query = query.where(model.id != exclude_id)
        if not (await db.execute(query)).first():
            return candidate
        if explicit:
            raise HTTPException(status_code=409, detail="Bu adres (slug) başka bir içerikte kullanılıyor")
        candidate = f"{base}-{n}"[:150]
    raise HTTPException(status_code=409, detail="Benzersiz adres üretilemedi")


class SeoFields(BaseModel):
    seo_title: Optional[str] = Field(default=None, max_length=160)
    seo_description: Optional[str] = Field(default=None, max_length=320)

    @field_validator("seo_title", "seo_description", mode="before")
    @classmethod
    def clean_seo(cls, value):
        cleaned = sanitize_public_text(value) if value else None
        return cleaned.replace("\n", " ") if cleaned else None


# --- Haber / blog / faaliyet --------------------------------------------------

class ContentPostIn(SeoFields):
    title: str = Field(min_length=2, max_length=300)
    kind: Literal["haber", "blog", "faaliyet"] = "haber"
    slug: Optional[str] = None
    summary: Optional[str] = Field(default=None, max_length=500)
    body: Optional[str] = Field(default=None, max_length=100_000)
    image_url: Optional[str] = None
    gallery_urls: List[str] = Field(default_factory=list, max_length=30)
    video_url: Optional[str] = None
    published_at: Optional[datetime] = None
    display_order: int = 0
    is_active: bool = True
    translations: dict = Field(default_factory=dict)

    @field_validator("translations", mode="before")
    @classmethod
    def clean_i18n(cls, value):
        return clean_translations(value, POST_I18N, long_fields=("body",), max_lengths=SEO_LIMITS)

    @field_validator("title", "summary", mode="before")
    @classmethod
    def clean_short(cls, value):
        return sanitize_public_text(value) if value else value

    @field_validator("body", mode="before")
    @classmethod
    def clean_body(cls, value):
        return sanitize_long_text(value) if value else None

    @field_validator("slug", mode="before")
    @classmethod
    def check_slug(cls, value):
        return validate_slug(value) if value and str(value).strip() else None

    @field_validator("image_url", mode="before")
    @classmethod
    def check_image(cls, value):
        return validate_image_url(value)

    @field_validator("gallery_urls")
    @classmethod
    def check_gallery(cls, value: List[str]) -> List[str]:
        return [url for url in (validate_image_url(v) for v in value) if url]

    @field_validator("video_url", mode="before")
    @classmethod
    def check_video(cls, value):
        if value is None or not str(value).strip():
            return None
        parse_video_url(str(value))
        return str(value).strip()


def _post_out(post: ContentPost, include_body: bool = True, lang: str | None = None, public: bool = False) -> dict:
    data = {
        "id": str(post.id),
        "kind": post.kind,
        "slug": post.slug,
        "title": post.title,
        "summary": post.summary,
        "image_url": post.image_url,
        "published_at": post.published_at,
        "display_order": post.display_order,
        "is_active": post.is_active,
        "seo_title": post.seo_title,
        "seo_description": post.seo_description,
        "video_embed_url": video_embed_url(post.video_provider, post.video_id),
        "gallery_urls": post.gallery_urls or [],
    }
    if include_body:
        data["body"] = post.body
        data["video_url"] = (
            f"https://www.youtube.com/watch?v={post.video_id}" if post.video_provider == "youtube"
            else f"https://vimeo.com/{post.video_id}" if post.video_provider == "vimeo" else None
        )
    if public:
        localize(data, post.translations, lang, POST_I18N if include_body else ("title", "summary"))
        if not include_body:
            data.pop("body", None)
    else:
        data["translations"] = post.translations or {}
    return data


async def _apply_post(db: AsyncSession, post: ContentPost, payload: ContentPostIn, org_id: UUID) -> None:
    post.title = payload.title
    post.kind = payload.kind
    post.slug = await _unique_slug(
        db, ContentPost, org_id, payload.slug or slugify(payload.title), explicit=bool(payload.slug),
        exclude_id=post.id,
    )
    post.summary = payload.summary
    post.body = payload.body
    post.image_url = payload.image_url
    post.gallery_urls = payload.gallery_urls
    post.video_provider, post.video_id = parse_video_url(payload.video_url) if payload.video_url else (None, None)
    if payload.published_at:
        post.published_at = payload.published_at
    post.display_order = payload.display_order
    post.is_active = payload.is_active
    post.seo_title = payload.seo_title
    post.seo_description = payload.seo_description
    post.translations = payload.translations


@admin_router.get("/content-posts")
async def admin_list_posts(
    request: Request,
    kind: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ContentPost).where(ContentPost.organization_id == _org_id(request))
    if kind:
        query = query.where(ContentPost.kind == kind)
    rows = (await db.execute(query.order_by(ContentPost.published_at.desc().nullslast()))).scalars().all()
    return [_post_out(p) for p in rows]


@admin_router.post("/content-posts", status_code=status.HTTP_201_CREATED)
async def admin_create_post(
    request: Request,
    payload: ContentPostIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    post = ContentPost(organization_id=org_id)
    await _apply_post(db, post, payload, org_id)
    db.add(post)
    await db.flush()
    _audit(db, org_id, current_user, "icerik_olustur", {"post_id": str(post.id), "title": post.title, "kind": post.kind})
    await db.commit()
    await db.refresh(post)
    return _post_out(post)


@admin_router.put("/content-posts/{post_id}")
async def admin_update_post(
    request: Request,
    post_id: UUID,
    payload: ContentPostIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    post = await _get_owned(db, ContentPost, org_id, post_id, "İçerik")
    await _apply_post(db, post, payload, org_id)
    _audit(db, org_id, current_user, "icerik_guncelle", {"post_id": str(post.id), "title": post.title})
    await db.commit()
    await db.refresh(post)
    return _post_out(post)


@admin_router.delete("/content-posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_post(
    request: Request,
    post_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org_id(request)
    post = await _get_owned(db, ContentPost, org_id, post_id, "İçerik")
    _audit(db, org_id, current_user, "icerik_sil", {"post_id": str(post.id), "title": post.title})
    await db.delete(post)
    await db.commit()


# --- Sayfalar ----------------------------------------------------------------

class PageIn(SeoFields):
    title: str = Field(min_length=2, max_length=300)
    slug: Optional[str] = None
    body: str = Field(default="", max_length=100_000)
    cover_image_url: Optional[str] = None
    is_published: bool = False
    translations: dict = Field(default_factory=dict)

    @field_validator("translations", mode="before")
    @classmethod
    def clean_i18n(cls, value):
        return clean_translations(value, PAGE_I18N, long_fields=("body",), max_lengths=SEO_LIMITS)

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, value):
        return sanitize_public_text(value) if value else value

    @field_validator("body", mode="before")
    @classmethod
    def clean_body(cls, value):
        return sanitize_long_text(value) or ""

    @field_validator("slug", mode="before")
    @classmethod
    def check_slug(cls, value):
        return validate_slug(value) if value and str(value).strip() else None

    @field_validator("cover_image_url", mode="before")
    @classmethod
    def check_image(cls, value):
        return validate_image_url(value)


def _page_out(page: SitePage, lang: str | None = None, public: bool = False) -> dict:
    data = {
        "id": str(page.id),
        "slug": page.slug,
        "title": page.title,
        "body": page.body,
        "cover_image_url": page.cover_image_url,
        "seo_title": page.seo_title,
        "seo_description": page.seo_description,
        "is_published": page.is_published,
        "updated_at": page.updated_at or page.created_at,
    }
    if public:
        return localize(data, page.translations, lang, PAGE_I18N)
    data["translations"] = page.translations or {}
    return data


async def _apply_page(db: AsyncSession, page: SitePage, payload: PageIn, org_id: UUID) -> None:
    page.title = payload.title
    page.slug = await _unique_slug(
        db, SitePage, org_id, payload.slug or slugify(payload.title), explicit=bool(payload.slug),
        exclude_id=page.id,
    )
    page.body = payload.body
    page.cover_image_url = payload.cover_image_url
    page.seo_title = payload.seo_title
    page.seo_description = payload.seo_description
    page.is_published = payload.is_published
    page.translations = payload.translations


@admin_router.get("/pages")
async def admin_list_pages(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(SitePage).where(SitePage.organization_id == _org_id(request)).order_by(SitePage.title)
    )).scalars().all()
    return [_page_out(p) for p in rows]


@admin_router.post("/pages", status_code=status.HTTP_201_CREATED)
async def admin_create_page(request: Request, payload: PageIn, db: AsyncSession = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    page = SitePage(organization_id=org_id)
    await _apply_page(db, page, payload, org_id)
    db.add(page)
    await db.flush()
    _audit(db, org_id, current_user, "sayfa_olustur", {"page_id": str(page.id), "slug": page.slug})
    await db.commit()
    await db.refresh(page)
    return _page_out(page)


@admin_router.put("/pages/{page_id}")
async def admin_update_page(request: Request, page_id: UUID, payload: PageIn, db: AsyncSession = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    page = await _get_owned(db, SitePage, org_id, page_id, "Sayfa")
    await _apply_page(db, page, payload, org_id)
    _audit(db, org_id, current_user, "sayfa_guncelle", {"page_id": str(page.id), "slug": page.slug})
    await db.commit()
    await db.refresh(page)
    return _page_out(page)


@admin_router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_page(request: Request, page_id: UUID, db: AsyncSession = Depends(get_db),
                            current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    page = await _get_owned(db, SitePage, org_id, page_id, "Sayfa")
    _audit(db, org_id, current_user, "sayfa_sil", {"page_id": str(page.id), "slug": page.slug})
    await db.delete(page)
    await db.commit()


# --- Menü --------------------------------------------------------------------

class MenuItemIn(BaseModel):
    location: Literal["header", "footer"] = "header"
    label: str = Field(min_length=1, max_length=80)
    url: str = Field(max_length=500)
    open_in_new_tab: bool = False
    display_order: int = 0
    is_active: bool = True
    translations: dict = Field(default_factory=dict)

    @field_validator("translations", mode="before")
    @classmethod
    def clean_i18n(cls, value):
        return clean_translations(value, MENU_I18N, max_lengths=SEO_LIMITS)

    @field_validator("label", mode="before")
    @classmethod
    def clean_label(cls, value):
        return sanitize_public_text(value) if value else value

    @field_validator("url")
    @classmethod
    def check_url(cls, value: str) -> str:
        return validate_link(value)


class MenuOrder(BaseModel):
    ids: List[UUID] = Field(max_length=200)


def _menu_out(item: MenuItem) -> dict:
    return {
        "id": str(item.id),
        "location": item.location,
        "label": item.label,
        "url": item.url,
        "open_in_new_tab": item.open_in_new_tab,
        "display_order": item.display_order,
        "is_active": item.is_active,
        "translations": item.translations or {},
    }


@admin_router.get("/menu")
async def admin_list_menu(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(MenuItem).where(MenuItem.organization_id == _org_id(request))
        .order_by(MenuItem.location, MenuItem.display_order, MenuItem.created_at)
    )).scalars().all()
    return [_menu_out(m) for m in rows]


@admin_router.post("/menu", status_code=status.HTTP_201_CREATED)
async def admin_create_menu_item(request: Request, payload: MenuItemIn, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    count = (await db.execute(select(func.count(MenuItem.id)).where(MenuItem.organization_id == org_id))).scalar_one()
    if count >= 200:
        raise HTTPException(status_code=409, detail="En fazla 200 menü bağlantısı eklenebilir")
    item = MenuItem(organization_id=org_id, **payload.model_dump())
    db.add(item)
    await db.flush()
    _audit(db, org_id, current_user, "menu_olustur", {"menu_item_id": str(item.id), "label": item.label, "url": item.url})
    await db.commit()
    return _menu_out(item)


@admin_router.put("/menu/order")
async def admin_reorder_menu(request: Request, payload: MenuOrder, db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    rows = (await db.execute(
        select(MenuItem).where(MenuItem.organization_id == org_id, MenuItem.id.in_(payload.ids))
    )).scalars().all()
    by_id = {m.id: m for m in rows}
    for index, item_id in enumerate(payload.ids):
        if item_id in by_id:
            by_id[item_id].display_order = index
    await db.commit()
    return {"status": "ok"}


@admin_router.put("/menu/{item_id}")
async def admin_update_menu_item(request: Request, item_id: UUID, payload: MenuItemIn, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    item = await _get_owned(db, MenuItem, org_id, item_id, "Menü bağlantısı")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    _audit(db, org_id, current_user, "menu_guncelle", {"menu_item_id": str(item.id), "label": item.label, "url": item.url})
    await db.commit()
    return _menu_out(item)


@admin_router.delete("/menu/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_menu_item(request: Request, item_id: UUID, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    item = await _get_owned(db, MenuItem, org_id, item_id, "Menü bağlantısı")
    _audit(db, org_id, current_user, "menu_sil", {"menu_item_id": str(item.id), "label": item.label})
    await db.delete(item)
    await db.commit()


# --- Galeri ------------------------------------------------------------------

class GalleryItemIn(BaseModel):
    kind: Literal["photo", "video"] = "photo"
    title: str = Field(min_length=1, max_length=200)
    album: Optional[str] = Field(default=None, max_length=120)
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    display_order: int = 0
    is_active: bool = True
    translations: dict = Field(default_factory=dict)

    @field_validator("translations", mode="before")
    @classmethod
    def clean_i18n(cls, value):
        return clean_translations(value, GALLERY_I18N, max_lengths=SEO_LIMITS)

    @field_validator("title", "album", mode="before")
    @classmethod
    def clean_text(cls, value):
        return sanitize_public_text(value) if value else value

    @field_validator("image_url", mode="before")
    @classmethod
    def check_image(cls, value):
        return validate_image_url(value)

    @model_validator(mode="after")
    def check_media(self):
        if self.kind == "photo" and not self.image_url:
            raise ValueError("Fotoğraf için görsel adresi zorunludur")
        if self.kind == "video":
            if not self.video_url:
                raise ValueError("Video için YouTube veya Vimeo bağlantısı zorunludur")
            parse_video_url(self.video_url)
        return self


def _gallery_out(item: GalleryItem, lang: str | None = None, public: bool = False) -> dict:
    thumbnail = item.image_url
    if not thumbnail and item.video_provider == "youtube":
        thumbnail = f"https://i.ytimg.com/vi/{item.video_id}/hqdefault.jpg"
    data = {
        "id": str(item.id),
        "kind": item.kind,
        "title": item.title,
        "album": item.album,
        "image_url": item.image_url,
        "thumbnail_url": thumbnail,
        "video_embed_url": video_embed_url(item.video_provider, item.video_id),
        "display_order": item.display_order,
        "is_active": item.is_active,
        "created_at": item.created_at,
    }
    if public:
        return localize(data, item.translations, lang, GALLERY_I18N)
    data["translations"] = item.translations or {}
    return data


def _apply_gallery(item: GalleryItem, payload: GalleryItemIn) -> None:
    item.kind = payload.kind
    item.title = payload.title
    item.album = payload.album
    item.image_url = payload.image_url
    item.video_provider, item.video_id = parse_video_url(payload.video_url) if payload.kind == "video" else (None, None)
    item.display_order = payload.display_order
    item.is_active = payload.is_active
    item.translations = payload.translations


@admin_router.get("/gallery")
async def admin_list_gallery(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(GalleryItem).where(GalleryItem.organization_id == _org_id(request))
        .order_by(GalleryItem.display_order, GalleryItem.created_at.desc())
    )).scalars().all()
    return [_gallery_out(g) for g in rows]


@admin_router.post("/gallery", status_code=status.HTTP_201_CREATED)
async def admin_create_gallery_item(request: Request, payload: GalleryItemIn, db: AsyncSession = Depends(get_db),
                                    current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    item = GalleryItem(organization_id=org_id)
    _apply_gallery(item, payload)
    db.add(item)
    await db.flush()
    _audit(db, org_id, current_user, "galeri_olustur", {"gallery_item_id": str(item.id), "title": item.title})
    await db.commit()
    await db.refresh(item)
    return _gallery_out(item)


@admin_router.put("/gallery/{item_id}")
async def admin_update_gallery_item(request: Request, item_id: UUID, payload: GalleryItemIn, db: AsyncSession = Depends(get_db),
                                    current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    item = await _get_owned(db, GalleryItem, org_id, item_id, "Galeri öğesi")
    _apply_gallery(item, payload)
    _audit(db, org_id, current_user, "galeri_guncelle", {"gallery_item_id": str(item.id), "title": item.title})
    await db.commit()
    await db.refresh(item)
    return _gallery_out(item)


@admin_router.delete("/gallery/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_gallery_item(request: Request, item_id: UUID, db: AsyncSession = Depends(get_db),
                                    current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    item = await _get_owned(db, GalleryItem, org_id, item_id, "Galeri öğesi")
    _audit(db, org_id, current_user, "galeri_sil", {"gallery_item_id": str(item.id), "title": item.title})
    await db.delete(item)
    await db.commit()


# --- Gönüllü başvuruları --------------------------------------------------------

class VolunteerApplicationIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=200)
    phone: str = Field(min_length=10, max_length=32)
    email: Optional[EmailStr] = None
    city: Optional[str] = Field(default=None, max_length=100)
    areas: List[str] = Field(default_factory=list, max_length=10)
    availability: Optional[str] = Field(default=None, max_length=200)
    message: Optional[str] = Field(default=None, max_length=2000)
    kvkk_accepted: bool
    # Honeypot: real visitors never see or fill this field.
    website: Optional[str] = None

    @field_validator("full_name", "city", "availability", "message", mode="before")
    @classmethod
    def clean_text(cls, value):
        return sanitize_public_text(value) if value else value

    @field_validator("areas")
    @classmethod
    def clean_areas(cls, value: List[str]) -> List[str]:
        return [a for a in (sanitize_public_text(v)[:60] for v in value if v) if a]

    @model_validator(mode="after")
    def require_consent(self):
        if not self.kvkk_accepted:
            raise ValueError("KVKK aydınlatma metni onayı zorunludur")
        return self


class VolunteerUpdate(BaseModel):
    status: Literal["new", "contacted", "accepted", "rejected"]
    staff_notes: Optional[str] = Field(default=None, max_length=2000)


def _volunteer_out(app: VolunteerApplication) -> dict:
    return {
        "id": str(app.id),
        "full_name": app.full_name,
        "phone": app.phone,
        "email": app.email,
        "city": app.city,
        "areas": app.areas or [],
        "availability": app.availability,
        "message": app.message,
        "status": app.status,
        "staff_notes": app.staff_notes,
        "created_at": app.created_at,
    }


@admin_router.get("/volunteers")
async def admin_list_volunteers(
    request: Request,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    q: Optional[str] = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(VolunteerApplication).where(VolunteerApplication.organization_id == _org_id(request))
    if status_filter in VOLUNTEER_STATUSES:
        query = query.where(VolunteerApplication.status == status_filter)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(
            VolunteerApplication.full_name.ilike(like),
            VolunteerApplication.phone.ilike(like),
            VolunteerApplication.city.ilike(like),
        ))
    rows = (await db.execute(query.order_by(VolunteerApplication.created_at.desc()).limit(1000))).scalars().all()
    return [_volunteer_out(v) for v in rows]


@admin_router.put("/volunteers/{application_id}")
async def admin_update_volunteer(request: Request, application_id: UUID, payload: VolunteerUpdate,
                                 db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    app = await _get_owned(db, VolunteerApplication, org_id, application_id, "Başvuru")
    old_status = app.status
    app.status = payload.status
    app.staff_notes = payload.staff_notes
    _audit(db, org_id, current_user, "gonullu_guncelle", {"application_id": str(app.id), "old": old_status, "new": app.status})
    await db.commit()
    return _volunteer_out(app)


# --- Public ------------------------------------------------------------------

@public_router.get("/content-posts")
async def public_list_posts(
    request: Request,
    kind: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    query = select(ContentPost).where(
        ContentPost.organization_id == request.state.organization_id,
        ContentPost.is_active.is_(True),
    )
    if kind in POST_KINDS:
        query = query.where(ContentPost.kind == kind)
    query = query.order_by(ContentPost.display_order, ContentPost.published_at.desc().nullslast())
    rows = (await db.execute(query.offset(offset).limit(limit))).scalars().all()
    lang = request_language(request)
    return [_post_out(p, include_body=False, lang=lang, public=True) for p in rows]


@public_router.get("/content-posts/{slug}")
async def public_get_post(request: Request, slug: str, db: AsyncSession = Depends(get_db)):
    conditions = [ContentPost.slug == slug]
    try:
        conditions.append(ContentPost.id == UUID(slug))
    except ValueError:
        pass
    post = (await db.execute(
        select(ContentPost).where(
            ContentPost.organization_id == request.state.organization_id,
            ContentPost.is_active.is_(True),
            or_(*conditions),
        )
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="İçerik bulunamadı")
    return _post_out(post, lang=request_language(request), public=True)


@public_router.get("/pages")
async def public_list_pages(request: Request, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(SitePage).where(
            SitePage.organization_id == request.state.organization_id, SitePage.is_published.is_(True)
        ).order_by(SitePage.title)
    )).scalars().all()
    lang = request_language(request)
    return [
        localize({"slug": p.slug, "title": p.title, "updated_at": p.updated_at or p.created_at}, p.translations, lang, ("title",))
        for p in rows
    ]


@public_router.get("/pages/{slug}")
async def public_get_page(request: Request, slug: str, db: AsyncSession = Depends(get_db)):
    page = (await db.execute(
        select(SitePage).where(
            SitePage.organization_id == request.state.organization_id,
            SitePage.slug == slug,
            SitePage.is_published.is_(True),
        )
    )).scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Sayfa bulunamadı")
    return _page_out(page, lang=request_language(request), public=True)


@public_router.get("/menu")
async def public_menu(request: Request, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(MenuItem).where(
            MenuItem.organization_id == request.state.organization_id, MenuItem.is_active.is_(True)
        ).order_by(MenuItem.display_order, MenuItem.created_at)
    )).scalars().all()
    lang = request_language(request)
    result = {"header": [], "footer": []}
    for item in rows:
        link = localize({"label": item.label, "url": item.url, "open_in_new_tab": item.open_in_new_tab},
                        item.translations, lang, MENU_I18N)
        link.pop("lang", None)
        result.setdefault(item.location, []).append(link)
    return result


@public_router.get("/gallery")
async def public_gallery(
    request: Request,
    kind: Optional[Literal["photo", "video"]] = None,
    album: Optional[str] = Query(default=None, max_length=120),
    db: AsyncSession = Depends(get_db),
):
    query = select(GalleryItem).where(
        GalleryItem.organization_id == request.state.organization_id, GalleryItem.is_active.is_(True)
    )
    if kind:
        query = query.where(GalleryItem.kind == kind)
    if album:
        query = query.where(GalleryItem.album == album)
    rows = (await db.execute(query.order_by(GalleryItem.display_order, GalleryItem.created_at.desc()).limit(500))).scalars().all()
    lang = request_language(request)
    return [_gallery_out(g, lang=lang, public=True) for g in rows]


@public_router.post("/volunteer-applications", status_code=status.HTTP_201_CREATED)
async def public_create_volunteer_application(
    request: Request,
    payload: VolunteerApplicationIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("volunteer", limit=5, window_seconds=300)),
):
    if payload.website:
        # Bot filled the honeypot: pretend success without storing anything.
        return {"status": "received"}
    db.add(VolunteerApplication(
        organization_id=request.state.organization_id,
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        city=payload.city,
        areas=payload.areas,
        availability=payload.availability,
        message=payload.message,
        consent_version=VOLUNTEER_CONSENT_VERSION,
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return {"status": "received"}
