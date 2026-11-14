"""Bank accounts pulled automatically, and the 'Gelen Havaleler' review queue."""
from datetime import date, datetime, time, timedelta
from typing import Annotated, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, literal_column, or_, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Permission, mask_phone, require_capability, require_feature, require_permission
from app.banking import CONNECTORS, credential_key
from app.banking.matching import Matcher, analyse, approve, transfer_donations, unmatch
from app.banking.parsers import fold
from app.banking.sync import sync_account
from app.core.db import get_db
from app.core.plans import Feature
from app.models.audit_log import AuditLog
from app.models.automation import BankAccount, BankMatchRule, BankTransaction, ReconciliationStatus
from app.models.campaign import Campaign
from app.models.donation import Donor, DonorType
from app.models.user import User
from app.services.tenant_credentials import CredentialsUnavailable, get_credentials, masked, save_credentials

TZ = ZoneInfo("Europe/Istanbul")
router = APIRouter(tags=["bank-sync"], dependencies=[Depends(require_feature(Feature.BANK_TRANSACTIONS))])
finance = require_permission(Permission.FINANCE_MANAGE)


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


# --- Banks and credentials -------------------------------------------------------------------

@router.get("/admin/banks")
async def list_banks(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    org_id = _org_id(request)
    banks = []
    for key, cls in CONNECTORS.items():
        try:
            stored = await get_credentials(db, org_id, credential_key(key))
        except CredentialsUnavailable:
            stored = None
        banks.append({
            "key": key, "label": cls.label, "ready": cls.ready,
            "fields": [{"key": f, "label": label, "secret": f in cls.secret_fields} for f, label in cls.credential_fields.items()],
            "values": masked(credential_key(key), stored or {}), "configured": bool(stored),
        })
    return banks


class CredentialsIn(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


@router.put("/admin/banks/{bank_key}/credentials")
async def save_bank_credentials(bank_key: str, payload: CredentialsIn, request: Request,
                                db: AsyncSession = Depends(get_db), current_user: User = Depends(finance)):
    if bank_key not in CONNECTORS:
        raise HTTPException(status_code=404, detail="Bilinmeyen banka")
    org_id = _org_id(request)
    try:
        stored = await save_credentials(db, org_id, credential_key(bank_key), payload.values, actor=current_user.email)
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="banka_entegrasyonu_guncelle",
                    details={"bank": bank_key, "fields": sorted(stored)}))
    await db.commit()
    return {"bank": bank_key, "values": masked(credential_key(bank_key), stored)}


# --- Accounts -------------------------------------------------------------------------------

class AccountIn(BaseModel):
    bank_key: str
    label: str = Field(min_length=2, max_length=120)
    iban: Optional[str] = Field(default=None, max_length=34)
    account_no: Optional[str] = Field(default=None, max_length=40)
    currency: str = Field(default="TRY", pattern="^(TRY|USD|EUR|GBP|SAR|CHF)$")
    enabled: bool = True
    auto_approve: bool = False
    default_campaign_id: Optional[UUID] = None


def _normalize_validate_iban(raw: Optional[str]) -> Optional[str]:
    iban = (raw or "").replace(" ", "").upper()
    if not iban:
        return None
    if not iban.isalnum() or len(iban) < 15 or len(iban) > 34:
        raise HTTPException(status_code=422, detail="Geçersiz IBAN uzunluğu veya biçimi")
    if iban.startswith("TR") and (len(iban) != 26 or not iban[2:].isdigit()):
        raise HTTPException(status_code=422, detail="Türkiye IBAN'ı TR ile başlamalı ve toplam 26 karakter olmalıdır")
    rearranged = iban[4:] + iban[:4]
    digits = "".join(ch if ch.isdigit() else str(ord(ch) - 55) for ch in rearranged)
    if int(digits) % 97 != 1:
        raise HTTPException(status_code=422, detail="IBAN kontrol basamağı (MOD-97) hatalı")
    return iban


def _account_out(a: BankAccount) -> dict:
    cls = CONNECTORS.get(a.bank_key)
    return {"id": str(a.id), "bank_key": a.bank_key, "bank": cls.label if cls else a.bank_key, "ready": bool(cls and cls.ready),
            "label": a.label, "iban": a.iban, "account_no": a.account_no, "currency": a.currency, "enabled": a.enabled,
            "auto_approve": a.auto_approve, "default_campaign_id": str(a.default_campaign_id) if a.default_campaign_id else None,
            "last_synced_at": a.last_synced_at, "last_error": a.last_error}


async def _campaign(db: AsyncSession, org_id: UUID, campaign_id: Optional[UUID]) -> Optional[Campaign]:
    if not campaign_id:
        return None
    campaign = await db.get(Campaign, campaign_id)
    if not campaign or campaign.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı")
    return campaign


@router.get("/admin/bank-accounts")
async def list_accounts(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    rows = (await db.execute(select(BankAccount).where(BankAccount.organization_id == _org_id(request))
                             .order_by(BankAccount.created_at))).scalars().all()
    return [_account_out(a) for a in rows]


@router.post("/admin/bank-accounts")
async def create_account(payload: AccountIn, request: Request, db: AsyncSession = Depends(get_db),
                         _: User = Depends(finance)):
    org_id = _org_id(request)
    if payload.bank_key not in CONNECTORS:
        raise HTTPException(status_code=404, detail="Bilinmeyen banka")
    await _campaign(db, org_id, payload.default_campaign_id)
    iban = _normalize_validate_iban(payload.iban)
    account = BankAccount(organization_id=org_id, **payload.model_dump(exclude={"iban"}), iban=iban)
    db.add(account)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu banka ve IBAN ile kayıtlı bir hesap zaten var") from exc
    return _account_out(account)


@router.patch("/admin/bank-accounts/{account_id}")
async def update_account(account_id: UUID, payload: AccountIn, request: Request, db: AsyncSession = Depends(get_db),
                         _: User = Depends(finance)):
    org_id = _org_id(request)
    account = await db.get(BankAccount, account_id)
    if not account or account.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Hesap bulunamadı")
    await _campaign(db, org_id, payload.default_campaign_id)
    for key, value in payload.model_dump(exclude={"iban", "bank_key"}).items():
        setattr(account, key, value)
    account.iban = _normalize_validate_iban(payload.iban)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Bu banka ve IBAN ile kayıtlı bir hesap zaten var") from exc
    return _account_out(account)


@router.delete("/admin/bank-accounts/{account_id}")
async def delete_account(account_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                         _: User = Depends(finance)):
    org_id = _org_id(request)
    account = await db.get(BankAccount, account_id)
    if not account or account.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Hesap bulunamadı")
    tx_count = (
        await db.execute(
            select(func.count(BankTransaction.id)).where(
                BankTransaction.organization_id == org_id,
                BankTransaction.bank_account_id == account_id,
            )
        )
    ).scalar_one()
    if tx_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Bu hesaba bağlı {tx_count} hareket kaydı var; silmek yerine düzenleyip kapatabilirsiniz.",
        )
    await db.delete(account)
    await db.commit()
    return {"deleted": True}


@router.post("/admin/bank-accounts/{account_id}/sync")
async def sync_now(account_id: UUID, request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    account = await db.get(BankAccount, account_id)
    if not account or account.organization_id != _org_id(request):
        raise HTTPException(status_code=404, detail="Hesap bulunamadı")
    result = await sync_account(db, account)
    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])
    return result


# --- Incoming transfers queue -----------------------------------------------------------------

def _transfer_out(t: BankTransaction, donations: Optional[list] = None, viewer: Optional[User] = None) -> dict:
    donor = donations[0].donor if donations else None
    phone = mask_phone(donor.phone, viewer) if donor and viewer else (donor.phone if donor else None)
    return {"donor": {"id": str(donor.id), "name": donor.full_name, "phone": phone} if donor else None,
            "receipts": [{"donation_id": str(d.id), "receipt_number": d.official_receipt_no or d.receipt_number,
                          "campaign_title": d.campaign.title if d.campaign else None, "amount_cents": d.amount_cents}
                         for d in donations or []],
            "id": str(t.id), "booked_at": t.booked_at, "amount_cents": t.amount_cents, "currency": t.currency,
            "sender_name": t.sender_name, "description": t.description, "status": t.status.value, "source": t.source,
            "bank_account_id": str(t.bank_account_id) if t.bank_account_id else None,
            "donation_id": str(t.donation_id) if t.donation_id else None,
            "payment_order_id": str(t.payment_order_id) if t.payment_order_id else None,
            "suggestion": t.suggestion or {}}


NO_ACCOUNT = UUID(int=0)


def _duplicate_key():
    """Same account, same day, same amount and same sender: probably the same movement twice."""
    # literals, not parameters: Postgres must see the GROUP BY expressions as identical to the selected ones
    # (an uploaded statement has no account: a fixed id keeps NULL out of the comparison)
    return (func.coalesce(BankTransaction.bank_account_id, literal_column(f"'{NO_ACCOUNT}'::uuid")),
            func.date(func.timezone(literal_column("'Europe/Istanbul'"), BankTransaction.booked_at)),
            BankTransaction.amount_cents, func.coalesce(BankTransaction.sender_name, literal_column("''")))


@router.get("/admin/incoming-transfers")
async def list_transfers(request: Request, status: Optional[ReconciliationStatus] = ReconciliationStatus.UNMATCHED,
                         q: Annotated[Optional[str], Query(max_length=100)] = None, date_from: Optional[date] = None,
                         date_to: Optional[date] = None, amount_min: Optional[float] = None,
                         amount_max: Optional[float] = None, account_id: Optional[UUID] = None,
                         duplicates: bool = False,
                         limit: int = Query(200, le=500), offset: int = Query(0, ge=0),
                         db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    """Incoming movements of one status, with search; `duplicates` lists look-alike movements of any status."""
    org_id = _org_id(request)
    where = [BankTransaction.organization_id == org_id]
    if status and not duplicates:
        where.append(BankTransaction.status == status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        where.append(or_(BankTransaction.sender_name.ilike(term), BankTransaction.description.ilike(term),
                         BankTransaction.external_id.ilike(term)))
    if date_from:
        where.append(BankTransaction.booked_at >= datetime.combine(date_from, time.min, TZ))
    if date_to:
        where.append(BankTransaction.booked_at < datetime.combine(date_to + timedelta(days=1), time.min, TZ))
    if amount_min is not None:
        where.append(BankTransaction.amount_cents >= round(amount_min * 100))
    if amount_max is not None:
        where.append(BankTransaction.amount_cents <= round(amount_max * 100))
    if account_id:
        where.append(BankTransaction.bank_account_id == account_id)
    groups = (select(*_duplicate_key()).where(BankTransaction.organization_id == org_id, BankTransaction.amount_cents > 0)
              .group_by(*_duplicate_key()).having(func.count() > 1))
    dup_rows = (await db.execute(groups)).all()
    dup_keys = {tuple(r) for r in dup_rows}
    if duplicates:
        if not dup_keys:
            return {"total": 0, "items": [], "duplicate_groups": 0}
        where.append(tuple_(*_duplicate_key()).in_(list(dup_keys)))
    base = select(BankTransaction).where(*where)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    order = [BankTransaction.amount_cents.desc(), BankTransaction.booked_at] if duplicates else [BankTransaction.booked_at.desc()]
    rows = (await db.execute(base.order_by(*order).limit(limit).offset(offset))).scalars().all()
    donations = await transfer_donations(db, list(rows))
    items = []
    for t in rows:
        row = _transfer_out(t, donations.get(str(t.id)), _)
        row["possible_duplicate"] = (t.bank_account_id or NO_ACCOUNT, t.booked_at.astimezone(TZ).date() if t.booked_at else None,
                                     t.amount_cents, t.sender_name or "") in dup_keys
        items.append(row)
    return {"total": total, "items": items, "duplicate_groups": len(dup_keys)}


@router.post("/admin/incoming-transfers/reanalyse")
async def reanalyse(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    """Recompute suggestions of unmatched transfers (after adding donors, campaigns or rules)."""
    org_id = _org_id(request)
    matcher = Matcher(db, org_id)
    rows = (await db.execute(select(BankTransaction).where(
        BankTransaction.organization_id == org_id, BankTransaction.status == ReconciliationStatus.UNMATCHED))).scalars().all()
    accounts = {a.id: a for a in (await db.execute(select(BankAccount).where(BankAccount.organization_id == org_id))).scalars()}
    for t in rows:
        await analyse(db, t, matcher, accounts.get(t.bank_account_id))
    await db.commit()
    return {"analysed": len(rows)}


class NewDonorIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=20)


class ApproveLine(BaseModel):
    campaign_id: UUID
    amount_cents: int = Field(gt=0)
    on_behalf_of: Optional[str] = Field(default=None, max_length=200)
    kurban_type: Optional[str] = Field(default=None, max_length=20)


class ApproveIn(BaseModel):
    donor_id: Optional[UUID] = None
    new_donor: Optional[NewDonorIn] = None
    campaign_id: Optional[UUID] = None
    # One transfer shared between several campaigns; the amounts must add up to the transfer.
    lines: Optional[list[ApproveLine]] = Field(default=None, max_length=20)
    on_behalf_of: Optional[str] = Field(default=None, max_length=200)
    kurban_type: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = Field(default=None, max_length=1000)
    receipt_book_id: Optional[UUID] = None
    send_receipt: bool = True
    # SMS text staff wrote while matching; sent instead of the automatic "bağış ulaştı" SMS
    sms_body: Optional[str] = Field(default=None, max_length=1500)


async def _transfer(db: AsyncSession, org_id: UUID, transfer_id: UUID) -> BankTransaction:
    transfer = (await db.execute(select(BankTransaction).where(
        BankTransaction.id == transfer_id, BankTransaction.organization_id == org_id).with_for_update())).scalar_one_or_none()
    if not transfer:
        raise HTTPException(status_code=404, detail="Hareket bulunamadı")
    return transfer


@router.post("/admin/incoming-transfers/{transfer_id}/approve", dependencies=[Depends(require_capability("bank.approve"))])
async def approve_transfer(transfer_id: UUID, payload: ApproveIn, request: Request, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(finance)):
    org_id = _org_id(request)
    transfer = await _transfer(db, org_id, transfer_id)
    if transfer.status not in (ReconciliationStatus.UNMATCHED, ReconciliationStatus.AMBIGUOUS):
        raise HTTPException(status_code=409, detail="Bu hareket zaten işlenmiş")
    lines = payload.lines or []
    if lines:
        if sum(line.amount_cents for line in lines) != transfer.amount_cents:
            raise HTTPException(status_code=422, detail="Kalemlerin toplamı havale tutarına eşit olmalıdır")
    elif not payload.campaign_id:
        raise HTTPException(status_code=422, detail="Kampanya seçin")
    else:
        lines = [ApproveLine(campaign_id=payload.campaign_id, amount_cents=transfer.amount_cents,
                             on_behalf_of=payload.on_behalf_of, kurban_type=payload.kurban_type)]
    campaigns = [await _campaign(db, org_id, line.campaign_id) for line in lines]
    if payload.donor_id:
        donor = await db.get(Donor, payload.donor_id)
        if not donor or donor.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Bağışçı bulunamadı")
    elif payload.new_donor:
        parts = payload.new_donor.full_name.split()
        first, last = (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else (parts[0], None)
        phone = "".join(c for c in payload.new_donor.phone or "" if c.isdigit()) or None
        if phone and len(phone) == 10:
            phone = "0" + phone
        donor = Donor(organization_id=org_id, donor_type=DonorType.INDIVIDUAL, first_name=first[:100],
                      last_name=(last or "")[:100] or None, phone=phone, country="Türkiye",
                      total_donations=0, total_donated_cents=0)
        db.add(donor)
        await db.flush()
    else:
        raise HTTPException(status_code=422, detail="Bağışçı seçin veya yeni bağışçı bilgisi girin")
    donations = []
    try:
        for index, (line, campaign) in enumerate(zip(lines, campaigns)):
            # One e-mail and one SMS per transfer, not per part.
            donations.append(await approve(
                db, transfer, donor=donor, campaign=campaign, user_id=current_user.id,
                on_behalf_of=line.on_behalf_of or payload.on_behalf_of, kurban_type=line.kurban_type, note=payload.note,
                receipt_book_id=payload.receipt_book_id, send_receipt=payload.send_receipt and index == 0,
                amount_cents=line.amount_cents, line=index))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    donation = donations[0]
    from app.services.sms_service import queue_receipt_sms, receipt_key, send_event_sms
    from app.sms import SmsError
    try:
        written = await queue_receipt_sms(db, donation, donor, payload.sms_body, current_user.id, source="transfer")
    except SmsError as exc:
        raise HTTPException(status_code=422, detail=f"SMS: {exc}") from exc
    if len(donations) > 1 and payload.send_receipt and not written:
        # The automatic text would quote the first part only; send it now with the whole amount.
        await send_event_sms(
            db, org_id, "havale_eslesti", donor.phone, donor=donor, transfer=transfer, source="transfer",
            related=("donation", donation.id), dedupe_key=receipt_key(donation.id),
            extra={"bagis_kalemi": ", ".join(dict.fromkeys(c.title for c in campaigns))},
        )
    await db.commit()
    return {"status": "matched", "donation_id": str(donation.id), "receipt_number": donation.receipt_number,
            "official_receipt_no": donation.official_receipt_no,
            "receipts": [d.official_receipt_no or d.receipt_number for d in donations]}


class UnmatchIn(BaseModel):
    reason: str = Field(default="Eşleştirme kaldırıldı", min_length=3, max_length=500)


@router.post("/admin/incoming-transfers/{transfer_id}/unmatch", dependencies=[Depends(require_capability("bank.unmatch"))])
async def unmatch_transfer(transfer_id: UUID, request: Request, payload: Optional[UnmatchIn] = None,
                           db: AsyncSession = Depends(get_db), current_user: User = Depends(finance)):
    """Undo a wrong match: the receipts made from the transfer are cancelled and it waits again."""
    from app.services.donation_hooks import DonationEffectsLocked

    org_id = _org_id(request)
    transfer = await _transfer(db, org_id, transfer_id)
    try:
        cancelled = await unmatch(db, transfer, user_id=current_user.id, reason=(payload or UnmatchIn()).reason)
    except (ValueError, DonationEffectsLocked) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    accounts = {a.id: a for a in (await db.execute(
        select(BankAccount).where(BankAccount.organization_id == org_id))).scalars()}
    await analyse(db, transfer, Matcher(db, org_id), accounts.get(transfer.bank_account_id))
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="havale_eslesme_kaldir", details={
        "transfer_id": str(transfer.id), "receipts": [d.receipt_number for d in cancelled]}))
    await db.commit()
    return {"status": "unmatched", "cancelled_receipts": [d.official_receipt_no or d.receipt_number for d in cancelled]}


@router.post("/admin/incoming-transfers/{transfer_id}/ignore", dependencies=[Depends(require_capability("bank.ignore"))])
async def ignore_transfer(transfer_id: UUID, request: Request, db: AsyncSession = Depends(get_db),
                          current_user: User = Depends(finance)):
    transfer = await _transfer(db, _org_id(request), transfer_id)
    if transfer.status == ReconciliationStatus.MATCHED:
        raise HTTPException(status_code=409, detail="Bağışa dönüştürülmüş hareket yok sayılamaz")
    transfer.status = ReconciliationStatus.IGNORED
    transfer.suggestion = {**(transfer.suggestion or {}), "ignored": f"{current_user.email} tarafından yok sayıldı"}
    await db.commit()
    return {"status": "ignored"}


# --- Keyword rules ----------------------------------------------------------------------------

class RuleIn(BaseModel):
    pattern: str = Field(min_length=3, max_length=120)
    campaign_id: UUID


@router.get("/admin/bank-match-rules")
async def list_rules(request: Request, kind: str = Query("keyword", pattern="^(keyword|sender)$"),
                     db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    org_id = _org_id(request)
    rows = (await db.execute(select(BankMatchRule).where(
        BankMatchRule.organization_id == org_id, BankMatchRule.kind == kind)
        .order_by(BankMatchRule.hits.desc(), BankMatchRule.pattern).limit(1000))).scalars().all()
    donor_ids = {r.donor_id for r in rows if r.donor_id}
    campaign_ids = {r.campaign_id for r in rows if r.campaign_id}
    donor_names: dict[UUID, str] = {}
    if donor_ids:
        for d in (await db.execute(select(Donor).where(Donor.id.in_(donor_ids)))).scalars().all():
            donor_names[d.id] = d.full_name or ""
    campaign_titles: dict[UUID, str] = {}
    if campaign_ids:
        for c in (await db.execute(select(Campaign).where(Campaign.id.in_(campaign_ids)))).scalars().all():
            campaign_titles[c.id] = c.title
    return [{"id": str(r.id), "kind": r.kind, "pattern": r.pattern, "hits": r.hits, "source": r.source,
             "donor_id": str(r.donor_id) if r.donor_id else None,
             "donor_name": donor_names.get(r.donor_id) if r.donor_id else None,
             "campaign_id": str(r.campaign_id) if r.campaign_id else None,
             "campaign_title": campaign_titles.get(r.campaign_id) if r.campaign_id else None} for r in rows]


@router.post("/admin/bank-match-rules")
async def create_rule(payload: RuleIn, request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    org_id = _org_id(request)
    await _campaign(db, org_id, payload.campaign_id)
    pattern = fold(payload.pattern)
    rule = (await db.execute(select(BankMatchRule).where(
        BankMatchRule.organization_id == org_id, BankMatchRule.kind == "keyword",
        BankMatchRule.pattern == pattern))).scalar_one_or_none()
    if rule:
        rule.campaign_id = payload.campaign_id
    else:
        rule = BankMatchRule(organization_id=org_id, kind="keyword", pattern=pattern, campaign_id=payload.campaign_id)
        db.add(rule)
    await db.commit()
    return {"id": str(rule.id), "pattern": rule.pattern, "campaign_id": str(rule.campaign_id)}


@router.delete("/admin/bank-match-rules/{rule_id}")
async def delete_rule(rule_id: UUID, request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    rule = await db.get(BankMatchRule, rule_id)
    if not rule or rule.organization_id != _org_id(request):
        raise HTTPException(status_code=404, detail="Kural bulunamadı")
    await db.delete(rule)
    await db.commit()
    return {"deleted": True}
