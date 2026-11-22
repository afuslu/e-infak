"""STK PRO Web Sitesi → "Form" (admin + public), and the public campaign tabs the donation pages group by."""
import re
from datetime import datetime, timezone
from typing import Annotated, Any, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.core.rate_limit import rate_limit
from app.models.audit_log import AuditLog
from app.models.campaign import CampaignTab
from app.models.site_form import SiteForm, SiteFormSubmission
from app.models.user import User
from app.utils.cms import slugify
from app.utils.content import sanitize_public_text

admin_router = APIRouter(
    prefix="/admin-features",
    tags=["site-forms"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
public_router = APIRouter(prefix="/public", tags=["site-forms-public"])

FIELD_TYPES = ("text", "textarea", "email", "phone", "number", "date", "select", "radio", "checkbox")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class FieldIn(BaseModel):
    key: Optional[str] = Field(default=None, max_length=60)
    label: str = Field(min_length=1, max_length=120)
    type: Literal["text", "textarea", "email", "phone", "number", "date", "select", "radio", "checkbox"] = "text"
    required: bool = False
    placeholder: Optional[str] = Field(default=None, max_length=120)
    options: List[str] = Field(default_factory=list, max_length=40)

    @field_validator("label", "placeholder", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value.strip()) if isinstance(value, str) else value

    @field_validator("options", mode="before")
    @classmethod
    def opts(cls, value):
        return [sanitize_public_text(str(o).strip())[:120] for o in (value or []) if str(o).strip()]


class FormIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    slug: Optional[str] = Field(default=None, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    fields: List[FieldIn] = Field(min_length=1, max_length=40)
    submit_label: Optional[str] = Field(default=None, max_length=60)
    success_message: Optional[str] = Field(default=None, max_length=400)
    notify_email: Optional[str] = Field(default=None, max_length=255)
    is_active: bool = True

    @field_validator("title", "description", "submit_label", "success_message", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value.strip()) or None if isinstance(value, str) else value

    @field_validator("notify_email", mode="before")
    @classmethod
    def mail(cls, value):
        value = (value or "").strip()
        if value and not EMAIL_RE.match(value):
            raise ValueError("Bildirim e-postası geçersiz")
        return value or None


def _org(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


def _keyed(fields: List[FieldIn]) -> list[dict]:
    out, seen = [], set()
    for f in fields:
        base = slugify(f.key or f.label).replace("-", "_")[:50] or "alan"
        key, n = base, 2
        while key in seen:
            key, n = f"{base}_{n}", n + 1
        seen.add(key)
        if f.type in ("select", "radio") and not f.options:
            raise HTTPException(status_code=422, detail=f"{f.label}: seçenekleri yazın")
        out.append({**f.model_dump(), "key": key})
    return out


def _out(form: SiteForm, count: int = 0, unread: int = 0) -> dict:
    return {"id": str(form.id), "title": form.title, "slug": form.slug, "description": form.description, "fields": form.fields,
            "submit_label": form.submit_label, "success_message": form.success_message, "notify_email": form.notify_email,
            "is_active": form.is_active, "submissions": count, "unread": unread, "updated_at": form.updated_at or form.created_at}


async def _load(db, org_id, form_id) -> SiteForm:
    form = await db.get(SiteForm, form_id)
    if not form or form.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Form bulunamadı")
    return form


@admin_router.get("/site-forms")
async def list_forms(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    org_id = _org(request)
    forms = (await db.execute(select(SiteForm).where(SiteForm.organization_id == org_id).order_by(SiteForm.created_at.desc()))).scalars().all()
    counts = {r[0]: (r[1], r[2]) for r in (await db.execute(
        select(SiteFormSubmission.form_id, func.count(), func.count().filter(SiteFormSubmission.read_at.is_(None)))
        .where(SiteFormSubmission.organization_id == org_id).group_by(SiteFormSubmission.form_id))).all()}
    return [_out(f, *counts.get(f.id, (0, 0))) for f in forms]


async def _unique_slug(db, org_id, wanted: str, exclude: Optional[UUID] = None) -> str:
    base = slugify(wanted) or "form"
    slug, n = base, 2
    while True:
        q = select(SiteForm.id).where(SiteForm.organization_id == org_id, SiteForm.slug == slug)
        if exclude:
            q = q.where(SiteForm.id != exclude)
        if not (await db.execute(q)).first():
            return slug
        slug, n = f"{base}-{n}", n + 1


@admin_router.post("/site-forms", status_code=201)
async def create_form(payload: FormIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    org_id = _org(request)
    form = SiteForm(organization_id=org_id, slug=await _unique_slug(db, org_id, payload.slug or payload.title),
                    **payload.model_dump(exclude={"slug", "fields"}), fields=_keyed(payload.fields))
    db.add(form)
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action="form_olustur", details={"title": form.title}))
    await db.commit()
    return _out(form)


@admin_router.put("/site-forms/{form_id}")
async def update_form(form_id: UUID, payload: FormIn, request: Request, db: AsyncSession = Depends(get_db),
                      user: User = Depends(get_current_user)):
    org_id = _org(request)
    form = await _load(db, org_id, form_id)
    for key, value in payload.model_dump(exclude={"slug", "fields"}).items():
        setattr(form, key, value)
    form.fields = _keyed(payload.fields)
    if payload.slug and slugify(payload.slug) != form.slug:
        form.slug = await _unique_slug(db, org_id, payload.slug, exclude=form.id)
    await db.commit()
    return _out(form)


@admin_router.delete("/site-forms/{form_id}", status_code=204)
async def delete_form(form_id: UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    org_id = _org(request)
    form = await _load(db, org_id, form_id)
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action="form_sil", details={"title": form.title}))
    await db.delete(form)
    await db.commit()


@admin_router.get("/site-forms/{form_id}/submissions")
async def submissions(form_id: UUID, request: Request, page: Annotated[int, Query(ge=1)] = 1,
                      page_size: Annotated[int, Query(ge=1, le=500)] = 50, db: AsyncSession = Depends(get_db),
                      user: User = Depends(get_current_user)):
    org_id = _org(request)
    form = await _load(db, org_id, form_id)
    total = (await db.execute(select(func.count(SiteFormSubmission.id)).where(SiteFormSubmission.form_id == form.id))).scalar_one()
    rows = (await db.execute(select(SiteFormSubmission).where(SiteFormSubmission.form_id == form.id)
                             .order_by(SiteFormSubmission.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    unread = [r.id for r in rows if r.read_at is None]
    out = {"total": total, "fields": form.fields, "items": [{"id": str(r.id), "data": r.data, "read": r.read_at is not None,
                                                            "created_at": r.created_at} for r in rows]}
    if unread:
        from sqlalchemy import update

        await db.execute(update(SiteFormSubmission).where(SiteFormSubmission.id.in_(unread)).values(read_at=datetime.now(timezone.utc)))
        await db.commit()
    return out


@admin_router.delete("/site-forms/{form_id}/submissions/{submission_id}", status_code=204)
async def delete_submission(form_id: UUID, submission_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                            user: User = Depends(get_current_user)):
    org_id = _org(request)
    await _load(db, org_id, form_id)
    row = await db.get(SiteFormSubmission, submission_id)
    if not row or row.form_id != form_id:
        raise HTTPException(status_code=404, detail="Yanıt bulunamadı")
    await db.delete(row)
    await db.commit()


# --- Public ------------------------------------------------------------------------------

@public_router.get("/forms/{slug}")
async def public_form(slug: str, request: Request, db: AsyncSession = Depends(get_db)):
    form = (await db.execute(select(SiteForm).where(
        SiteForm.organization_id == _org(request), SiteForm.slug == slug, SiteForm.is_active.is_(True)))).scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form bulunamadı")
    return {"title": form.title, "slug": form.slug, "description": form.description, "fields": form.fields,
            "submit_label": form.submit_label or "Gönder", "success_message": form.success_message}


class SubmitIn(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)
    website: Optional[str] = None  # honeypot: humans leave it empty


def _check(field: dict, raw: Any) -> Any:
    label, kind = field["label"], field["type"]
    if kind == "checkbox":
        value = bool(raw)
        if field.get("required") and not value:
            raise HTTPException(status_code=422, detail=f"{label}: onaylayın")
        return value
    value = sanitize_public_text(str(raw or "").strip())[:4000 if kind == "textarea" else 300]
    if not value:
        if field.get("required"):
            raise HTTPException(status_code=422, detail=f"{label}: zorunlu")
        return None
    if kind == "email" and not EMAIL_RE.match(value):
        raise HTTPException(status_code=422, detail=f"{label}: geçerli bir e-posta yazın")
    if kind == "phone" and not 10 <= len(re.sub(r"\D", "", value)) <= 15:
        raise HTTPException(status_code=422, detail=f"{label}: geçerli bir telefon yazın")
    if kind == "number":
        try:
            float(value.replace(",", "."))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"{label}: sayı yazın")
    if kind in ("select", "radio") and value not in (field.get("options") or []):
        raise HTTPException(status_code=422, detail=f"{label}: listeden seçin")
    return value


@public_router.post("/forms/{slug}", status_code=201)
async def submit_form(slug: str, payload: SubmitIn, request: Request, db: AsyncSession = Depends(get_db),
                      _: None = Depends(rate_limit("site-form", limit=5, window_seconds=300))):
    org_id = _org(request)
    form = (await db.execute(select(SiteForm).where(
        SiteForm.organization_id == org_id, SiteForm.slug == slug, SiteForm.is_active.is_(True)))).scalar_one_or_none()
    if not form:
        raise HTTPException(status_code=404, detail="Form bulunamadı")
    if payload.website:
        return {"ok": True}  # bot: pretend success, keep nothing
    data = {f["key"]: _check(f, payload.data.get(f["key"])) for f in form.fields}
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = (forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)) or None
    db.add(SiteFormSubmission(organization_id=org_id, form_id=form.id, data=data, ip_address=ip and ip[:64]))
    await db.commit()
    if form.notify_email:
        try:
            import html

            from app.tasks import send_email_task

            rows = "".join(f"<p><b>{html.escape(f['label'])}:</b> {html.escape(str(data.get(f['key']) if data.get(f['key']) is not None else '—'))}</p>"
                           for f in form.fields)
            send_email_task.delay(form.notify_email, f"Yeni form yanıtı: {form.title}", rows)
        except Exception:  # broker down: the answer is saved anyway
            pass
    return {"ok": True, "message": form.success_message or "Teşekkürler, bilgileriniz alındı."}


@public_router.get("/campaign-tabs")
async def public_campaign_tabs(request: Request, db: AsyncSession = Depends(get_db)):
    """Active "Kampanya Sekmeler" for the donation pages (the site groups campaigns by tab_id)."""
    rows = (await db.execute(select(CampaignTab).where(
        CampaignTab.organization_id == _org(request), CampaignTab.is_active.is_(True))
        .order_by(CampaignTab.display_order.desc(), CampaignTab.name))).scalars().all()
    return [{"id": str(t.id), "name": t.name, "slug": t.slug, "parent_id": str(t.parent_id) if t.parent_id else None,
             "show_on_open": t.show_on_open} for t in rows]
