"""STK PRO İletişim: SMS / Mail Listeleri, Mail Şablonları and Mail Gönderimleri."""
from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ensure_capability, get_current_user, mask_phone, require_admin_route_feature, require_admin_route_permission
from app.api.v1.crm import DonorFilter, _donor_conditions
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.donation import Donor
from app.models.mailing import MailBatch, MailMessage, MailTemplate, RecipientList, RecipientListMember
from app.models.user import User
from app.services import mailing
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features",
    tags=["mailing"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
LIST_LIMIT = 50_000


def _org(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


class DonorTarget(BaseModel):
    """Donors picked on the donor list: ids, or every donor matching the filters ("Tüm N kaydı seç")."""
    ids: List[UUID] = Field(default_factory=list, max_length=5000)
    select_all: bool = False
    filters: DonorFilter = Field(default_factory=DonorFilter)


async def _target_ids(db: AsyncSession, org_id: UUID, user: User, target: DonorTarget) -> list[UUID]:
    conditions = _donor_conditions(org_id, user, target.filters if target.select_all else DonorFilter())
    if not target.select_all:
        if not target.ids:
            raise HTTPException(status_code=422, detail="Bağışçı seçin")
        conditions.append(Donor.id.in_(target.ids))
    ids = list((await db.execute(select(Donor.id).where(*conditions).limit(LIST_LIMIT + 1))).scalars())
    if len(ids) > LIST_LIMIT:
        raise HTTPException(status_code=422, detail=f"Tek seferde en çok {LIST_LIMIT:,} bağışçı seçilebilir")
    return ids


# --- Recipient lists ----------------------------------------------------------------

class ListIn(BaseModel):
    channel: Literal["sms", "mail"]
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=300)
    target: Optional[DonorTarget] = None
    # Add to an existing list instead of creating one
    list_id: Optional[UUID] = None

    @field_validator("name", "description", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value.strip()) if isinstance(value, str) else value


def _list_out(lst: RecipientList, names: dict) -> dict:
    return {"id": str(lst.id), "channel": lst.channel, "name": lst.name, "description": lst.description,
            "member_count": lst.member_count, "created_by": names.get(lst.created_by), "created_at": lst.created_at,
            "updated_at": lst.updated_at or lst.created_at}


async def _staff_names(db, org_id) -> dict:
    rows = (await db.execute(select(User.id, User.first_name, User.last_name).where(User.organization_id == org_id))).all()
    return {r[0]: f"{r[1]} {r[2]}".strip() for r in rows}


async def _load_list(db, org_id, list_id) -> RecipientList:
    lst = await db.get(RecipientList, list_id)
    if not lst or lst.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    return lst


async def _recount(db, lst: RecipientList) -> None:
    lst.member_count = (await db.execute(select(func.count()).where(RecipientListMember.list_id == lst.id))).scalar_one()


@router.get("/recipient-lists")
async def list_lists(request: Request, channel: Optional[Literal["sms", "mail"]] = None, db: AsyncSession = Depends(get_db),
                     user: User = Depends(get_current_user)):
    org_id = _org(request)
    query = select(RecipientList).where(RecipientList.organization_id == org_id)
    if channel:
        query = query.where(RecipientList.channel == channel)
    rows = (await db.execute(query.order_by(RecipientList.created_at.desc()))).scalars().all()
    names = await _staff_names(db, org_id)
    return [_list_out(r, names) for r in rows]


@router.post("/recipient-lists", status_code=201)
async def create_list(payload: ListIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """"SMS Listesi Oluştur" / "Mail Listesi Oluştur" from the donor list's bulk actions (or an empty list)."""
    org_id = _org(request)
    if payload.list_id:
        lst = await _load_list(db, org_id, payload.list_id)
        if lst.channel != payload.channel:
            raise HTTPException(status_code=422, detail="Liste türü uyuşmuyor")
    else:
        lst = RecipientList(organization_id=org_id, channel=payload.channel, name=payload.name,
                            description=payload.description, created_by=user.id)
        db.add(lst)
        await db.flush()
    added = 0
    if payload.target:
        ids = await _target_ids(db, org_id, user, payload.target)
        for start in range(0, len(ids), 5000):
            chunk = ids[start:start + 5000]
            if chunk:
                result = await db.execute(pg_insert(RecipientListMember).values(
                    [{"list_id": lst.id, "donor_id": i} for i in chunk]).on_conflict_do_nothing())
                added += result.rowcount or 0
    await _recount(db, lst)
    lst.updated_at = datetime.now(timezone.utc)
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action="alici_listesi",
                    details={"list_id": str(lst.id), "channel": lst.channel, "added": added}))
    await db.commit()
    return {**_list_out(lst, {}), "added": added}


class ListPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=300)
    remove_donor_ids: List[UUID] = Field(default_factory=list, max_length=5000)


@router.patch("/recipient-lists/{list_id}")
async def update_list(list_id: UUID, payload: ListPatch, request: Request, db: AsyncSession = Depends(get_db),
                      user: User = Depends(get_current_user)):
    org_id = _org(request)
    lst = await _load_list(db, org_id, list_id)
    if payload.name:
        lst.name = sanitize_public_text(payload.name.strip())
    if payload.description is not None:
        lst.description = sanitize_public_text(payload.description.strip()) or None
    if payload.remove_donor_ids:
        await db.execute(delete(RecipientListMember).where(
            RecipientListMember.list_id == lst.id, RecipientListMember.donor_id.in_(payload.remove_donor_ids)))
    await _recount(db, lst)
    await db.commit()
    return _list_out(lst, {})


@router.delete("/recipient-lists/{list_id}", status_code=204)
async def delete_list(list_id: UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    org_id = _org(request)
    lst = await _load_list(db, org_id, list_id)
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action="alici_listesi_sil", details={"name": lst.name}))
    await db.delete(lst)
    await db.commit()


@router.get("/recipient-lists/{list_id}/members")
async def list_members(list_id: UUID, request: Request, page: Annotated[int, Query(ge=1)] = 1,
                       page_size: Annotated[int, Query(ge=1, le=200)] = 25, db: AsyncSession = Depends(get_db),
                       user: User = Depends(get_current_user)):
    org_id = _org(request)
    lst = await _load_list(db, org_id, list_id)
    rows = (await db.execute(
        select(Donor).join(RecipientListMember, RecipientListMember.donor_id == Donor.id)
        .where(RecipientListMember.list_id == lst.id).order_by(Donor.first_name)
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return {"total": lst.member_count, "items": [{
        "id": str(d.id), "name": mailing.donor_name(d), "phone": mask_phone(d.phone, user), "email": d.email,
        "allow_sms": bool(d.allow_sms), "allow_email": bool(d.allow_email),
    } for d in rows]}


# --- Mail templates ------------------------------------------------------------------

class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20_000)
    is_active: bool = True

    @field_validator("name", "subject", mode="before")
    @classmethod
    def clean(cls, value):
        return sanitize_public_text(value.strip()) if isinstance(value, str) else value


def _tpl(t: MailTemplate) -> dict:
    return {"id": str(t.id), "name": t.name, "subject": t.subject, "body": t.body, "is_active": t.is_active,
            "updated_at": t.updated_at or t.created_at}


@router.get("/mail/templates")
async def list_templates(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(MailTemplate).where(MailTemplate.organization_id == _org(request))
                             .order_by(MailTemplate.name))).scalars().all()
    return [_tpl(t) for t in rows]


@router.post("/mail/templates", status_code=201)
async def create_template(payload: TemplateIn, request: Request, db: AsyncSession = Depends(get_db),
                          user: User = Depends(get_current_user)):
    org_id = _org(request)
    if (await db.execute(select(MailTemplate.id).where(MailTemplate.organization_id == org_id, MailTemplate.name == payload.name))).first():
        raise HTTPException(status_code=409, detail="Bu adla bir şablon var")
    tpl = MailTemplate(organization_id=org_id, **payload.model_dump())
    db.add(tpl)
    await db.commit()
    return _tpl(tpl)


@router.put("/mail/templates/{template_id}")
async def update_template(template_id: UUID, payload: TemplateIn, request: Request, db: AsyncSession = Depends(get_db),
                          user: User = Depends(get_current_user)):
    tpl = await db.get(MailTemplate, template_id)
    if not tpl or tpl.organization_id != _org(request):
        raise HTTPException(status_code=404, detail="Şablon bulunamadı")
    for key, value in payload.model_dump().items():
        setattr(tpl, key, value)
    await db.commit()
    return _tpl(tpl)


@router.delete("/mail/templates/{template_id}", status_code=204)
async def delete_template(template_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                          user: User = Depends(get_current_user)):
    tpl = await db.get(MailTemplate, template_id)
    if not tpl or tpl.organization_id != _org(request):
        raise HTTPException(status_code=404, detail="Şablon bulunamadı")
    await db.delete(tpl)
    await db.commit()


# --- Mail sends ------------------------------------------------------------------------

class MailSendIn(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20_000)
    list_id: Optional[UUID] = None
    target: Optional[DonorTarget] = None
    commercial: bool = True
    include_without_consent: bool = False
    send_after: Optional[datetime] = None
    preview: bool = False  # count recipients only

    @model_validator(mode="after")
    def audience(self):
        if not self.list_id and not self.target:
            raise ValueError("Mail listesi veya bağışçı seçin")
        if self.commercial and self.include_without_consent:
            raise ValueError("Tanıtım e-postası yalnız izin verenlere gönderilebilir")
        return self


@router.post("/mail/batches")
async def send_mail(payload: MailSendIn, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    org_id = _org(request)
    ensure_capability(user, "sms.bulk", "Toplu gönderim yetkiniz yok")
    if payload.list_id:
        lst = await _load_list(db, org_id, payload.list_id)
        donor_ids, source = await mailing.list_donor_ids(db, lst.id), f"Liste: {lst.name}"
    else:
        donor_ids = await _target_ids(db, org_id, user, payload.target)
        source = f"Bağışçı seçimi ({len(donor_ids)})"
    recipients, stats = await mailing.build_recipients(db, org_id, donor_ids, commercial=payload.commercial,
                                                       include_without_consent=payload.include_without_consent)
    if payload.preview:
        return {"recipients": len(recipients), **stats}
    if not recipients:
        raise HTTPException(status_code=422, detail="Gönderilecek geçerli ve izinli e-posta adresi yok")
    batch = await mailing.create_batch(db, org_id, source=source, subject=payload.subject.strip(), body=payload.body,
                                       commercial=payload.commercial, recipients=recipients, stats=stats,
                                       created_by=user.id, send_after=payload.send_after)
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action="toplu_mail",
                    details={"batch_id": str(batch.id), "recipients": batch.total}))
    await db.commit()
    if batch.send_after <= datetime.now(timezone.utc):
        try:
            from app.tasks import send_mail_batch_task

            send_mail_batch_task.delay(str(batch.id))
        except Exception:  # broker down: the minute dispatcher sends it
            pass
    return {"batch_id": str(batch.id), "seq_no": batch.seq_no, "recipients": batch.total, **stats}


def _batch_out(b: MailBatch, counts: dict, names: dict) -> dict:
    c = counts.get(b.id, {})
    return {"id": str(b.id), "seq_no": b.seq_no, "source": b.source, "subject": b.subject, "body": b.body,
            "commercial": b.commercial, "total": b.total, "sent": c.get("sent", 0), "failed": c.get("failed", 0),
            "queued": c.get("queued", 0), "status": b.status, "send_after": b.send_after, "created_at": b.created_at,
            "created_by": names.get(b.created_by), "stats": b.stats}


async def _counts(db, batch_ids) -> dict:
    out: dict = {}
    if not batch_ids:
        return out
    for batch_id, status, n in (await db.execute(
        select(MailMessage.batch_id, MailMessage.status, func.count()).where(MailMessage.batch_id.in_(batch_ids))
        .group_by(MailMessage.batch_id, MailMessage.status))).all():
        out.setdefault(batch_id, {})[status] = n
    return out


@router.get("/mail/batches")
async def list_batches(request: Request, q: Annotated[Optional[str], Query(max_length=100)] = None,
                       page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=200)] = 25,
                       db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    org_id = _org(request)
    conditions = [MailBatch.organization_id == org_id]
    if q and q.strip():
        like = f"%{q.strip()}%"
        from sqlalchemy import or_
        conditions.append(or_(MailBatch.subject.ilike(like), MailBatch.source.ilike(like)))
    total = (await db.execute(select(func.count(MailBatch.id)).where(*conditions))).scalar_one()
    rows = (await db.execute(select(MailBatch).where(*conditions).order_by(MailBatch.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).scalars().all()
    counts = await _counts(db, [b.id for b in rows])
    names = await _staff_names(db, org_id)
    return {"total": total, "items": [_batch_out(b, counts, names) for b in rows]}


@router.get("/mail/batches/{batch_id}/messages")
async def batch_messages(batch_id: UUID, request: Request, status: Optional[str] = None,
                         page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=200)] = 50,
                         db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    batch = await db.get(MailBatch, batch_id)
    if not batch or batch.organization_id != _org(request):
        raise HTTPException(status_code=404, detail="Gönderim bulunamadı")
    conditions = [MailMessage.batch_id == batch.id]
    if status:
        conditions.append(MailMessage.status == status)
    total = (await db.execute(select(func.count(MailMessage.id)).where(*conditions))).scalar_one()
    rows = (await db.execute(select(MailMessage).where(*conditions).order_by(MailMessage.created_at)
                             .offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"total": total, "items": [{"id": str(m.id), "email": m.email, "name": m.name, "status": m.status,
                                       "error": m.error, "sent_at": m.sent_at, "donor_id": str(m.donor_id) if m.donor_id else None}
                                      for m in rows]}


@router.post("/mail/batches/{batch_id}/cancel")
async def cancel_mail(batch_id: UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    batch = await db.get(MailBatch, batch_id)
    if not batch or batch.organization_id != _org(request):
        raise HTTPException(status_code=404, detail="Gönderim bulunamadı")
    if batch.status == "done":
        raise HTTPException(status_code=409, detail="Gönderim tamamlandı")
    cancelled = await mailing.cancel_batch(db, batch)
    await db.commit()
    return {"cancelled": cancelled}


@router.post("/mail/batches/{batch_id}/retry")
async def retry_mail(batch_id: UUID, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Re-queue the failed messages of a batch."""
    from sqlalchemy import update

    batch = await db.get(MailBatch, batch_id)
    if not batch or batch.organization_id != _org(request):
        raise HTTPException(status_code=404, detail="Gönderim bulunamadı")
    result = await db.execute(update(MailMessage).where(MailMessage.batch_id == batch.id, MailMessage.status == "failed")
                              .values(status="queued", error=None))
    if result.rowcount:
        batch.status, batch.finished_at, batch.send_after = "queued", None, datetime.now(timezone.utc)
    await db.commit()
    if result.rowcount:
        try:
            from app.tasks import send_mail_batch_task

            send_mail_batch_task.delay(str(batch.id))
        except Exception:
            pass
    return {"requeued": result.rowcount or 0}
