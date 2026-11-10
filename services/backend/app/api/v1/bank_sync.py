"""Bank accounts pulled automatically, and the 'Gelen Havaleler' review queue."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Permission, require_feature, require_permission
from app.banking import CONNECTORS, credential_key
from app.banking.matching import Matcher, analyse, approve
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
    currency: str = Field(default="TRY", pattern="^(TRY|USD|EUR)$")
    enabled: bool = True
    auto_approve: bool = False
    default_campaign_id: Optional[UUID] = None


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
    iban = (payload.iban or "").replace(" ", "").upper() or None
    account = BankAccount(organization_id=org_id, **payload.model_dump(exclude={"iban"}), iban=iban)
    db.add(account)
    await db.commit()
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
    account.iban = (payload.iban or "").replace(" ", "").upper() or None
    await db.commit()
    return _account_out(account)


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

def _transfer_out(t: BankTransaction) -> dict:
    return {"id": str(t.id), "booked_at": t.booked_at, "amount_cents": t.amount_cents, "currency": t.currency,
            "sender_name": t.sender_name, "description": t.description, "status": t.status.value, "source": t.source,
            "bank_account_id": str(t.bank_account_id) if t.bank_account_id else None,
            "donation_id": str(t.donation_id) if t.donation_id else None,
            "payment_order_id": str(t.payment_order_id) if t.payment_order_id else None,
            "suggestion": t.suggestion or {}}


@router.get("/admin/incoming-transfers")
async def list_transfers(request: Request, status: ReconciliationStatus = ReconciliationStatus.UNMATCHED,
                         limit: int = Query(200, le=500), offset: int = Query(0, ge=0),
                         db: AsyncSession = Depends(get_db), _: User = Depends(finance)):
    org_id = _org_id(request)
    base = select(BankTransaction).where(BankTransaction.organization_id == org_id, BankTransaction.status == status)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(BankTransaction.booked_at.desc()).limit(limit).offset(offset))).scalars().all()
    return {"total": total, "items": [_transfer_out(t) for t in rows]}


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


class ApproveIn(BaseModel):
    donor_id: Optional[UUID] = None
    new_donor: Optional[NewDonorIn] = None
    campaign_id: UUID
    on_behalf_of: Optional[str] = Field(default=None, max_length=200)
    kurban_type: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = Field(default=None, max_length=1000)
    receipt_book_id: Optional[UUID] = None
    send_receipt: bool = True


async def _transfer(db: AsyncSession, org_id: UUID, transfer_id: UUID) -> BankTransaction:
    transfer = (await db.execute(select(BankTransaction).where(
        BankTransaction.id == transfer_id, BankTransaction.organization_id == org_id).with_for_update())).scalar_one_or_none()
    if not transfer:
        raise HTTPException(status_code=404, detail="Hareket bulunamadı")
    return transfer


@router.post("/admin/incoming-transfers/{transfer_id}/approve")
async def approve_transfer(transfer_id: UUID, payload: ApproveIn, request: Request, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(finance)):
    org_id = _org_id(request)
    transfer = await _transfer(db, org_id, transfer_id)
    if transfer.status not in (ReconciliationStatus.UNMATCHED, ReconciliationStatus.AMBIGUOUS):
        raise HTTPException(status_code=409, detail="Bu hareket zaten işlenmiş")
    campaign = await _campaign(db, org_id, payload.campaign_id)
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
    try:
        donation = await approve(db, transfer, donor=donor, campaign=campaign, user_id=current_user.id,
                                 on_behalf_of=payload.on_behalf_of, kurban_type=payload.kurban_type, note=payload.note,
                                 receipt_book_id=payload.receipt_book_id, send_receipt=payload.send_receipt)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await db.commit()
    return {"status": "matched", "donation_id": str(donation.id), "receipt_number": donation.receipt_number,
            "official_receipt_no": donation.official_receipt_no}


@router.post("/admin/incoming-transfers/{transfer_id}/ignore")
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
    rows = (await db.execute(select(BankMatchRule).where(
        BankMatchRule.organization_id == _org_id(request), BankMatchRule.kind == kind)
        .order_by(BankMatchRule.hits.desc(), BankMatchRule.pattern).limit(1000))).scalars().all()
    return [{"id": str(r.id), "kind": r.kind, "pattern": r.pattern, "hits": r.hits, "source": r.source,
             "donor_id": str(r.donor_id) if r.donor_id else None,
             "campaign_id": str(r.campaign_id) if r.campaign_id else None} for r in rows]


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
