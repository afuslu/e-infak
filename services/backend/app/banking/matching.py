"""Turning incoming bank transfers into donations.

For every incoming movement that is not the payment of a checkout order, the
matcher proposes a donor and a campaign with a confidence:

donor     phone written in the description  -> 0.95
          a sender name learnt earlier       -> 0.95  (BankMatchRule kind=sender)
          the only donor with that name      -> 0.85
          several donors with that name      -> 0.5   (candidates listed)
          a close spelling of a donor name   -> 0.6
campaign  a word rule of the organisation    -> high  (BankMatchRule kind=keyword)
          the campaign title in the text     -> high
          a category word (kurban, zekat…)   -> medium
          the account's default campaign     -> low

Approving a suggestion (by a person, or automatically when the account allows
it and donor >= 0.85 with a high/medium campaign) records a confirmed
bank-transfer donation and remembers the sender for next time.
"""
import difflib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.banking.parsers import categories_in, fold, is_pos_settlement, kurban_intent, parse_description, phones_in
from app.models.automation import BankAccount, BankMatchRule, BankTransaction, ReconciliationStatus
from app.models.campaign import Campaign, CampaignStatus
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod

AUTO_DONOR_CONFIDENCE = 0.85
STOP_WORDS = {"bagis", "bagisi", "yardim", "yardimi", "genel", "kampanya", "proje", "projesi", "kisilik", "adet",
              "tam", "hisseli", "hissesi", "acil", "icin", "ye", "ya", "ve", "de", "da", "bir", "ile", "bin", "s", "a", "v"}


@dataclass
class _DonorRow:
    id: UUID
    name: str
    phone: Optional[str]


class Matcher:
    """Holds the organisation's donors, campaigns and rules for a batch of transactions."""

    def __init__(self, db: AsyncSession, organization_id: UUID):
        self.db, self.org_id = db, organization_id
        self._loaded = False

    async def load(self) -> "Matcher":
        if self._loaded:
            return self
        rows = (await self.db.execute(select(Donor.id, Donor.first_name, Donor.last_name, Donor.company_name,
                                             Donor.phone).where(Donor.organization_id == self.org_id))).all()
        self.by_name: dict[str, list[_DonorRow]] = {}
        self.by_phone: dict[str, list[_DonorRow]] = {}
        for donor_id, first, last, company, phone in rows:
            name = f"{first or ''} {last or ''}".strip() or company or ""
            row = _DonorRow(donor_id, name, phone)
            if name:
                self.by_name.setdefault(fold(name), []).append(row)
            if phone:
                self.by_phone.setdefault(_phone_key(phone), []).append(row)
        self.campaigns = (await self.db.execute(select(Campaign).where(
            Campaign.organization_id == self.org_id, Campaign.status == CampaignStatus.ACTIVE))).scalars().all()
        self.campaign_by_id = {c.id: c for c in self.campaigns}
        rules = (await self.db.execute(select(BankMatchRule).where(BankMatchRule.organization_id == self.org_id))).scalars().all()
        self.sender_rules = {r.pattern: r for r in rules if r.kind == "sender" and r.donor_id}
        self.keyword_rules = sorted((r for r in rules if r.kind == "keyword" and r.campaign_id),
                                    key=lambda r: -len(r.pattern))
        self._campaign_words()
        self.history: dict[UUID, dict[UUID, int]] = {}
        counts = (await self.db.execute(
            select(Donation.donor_id, Donation.campaign_id, func.count(Donation.id))
            .where(Donation.organization_id == self.org_id, Donation.status == DonationStatus.CONFIRMED)
            .group_by(Donation.donor_id, Donation.campaign_id))).all()
        for donor_id, campaign_id, n in counts:
            self.history.setdefault(donor_id, {})[campaign_id] = n
        since = datetime.now(timezone.utc) - timedelta(days=45)
        recent = dict((await self.db.execute(
            select(Donation.campaign_id, func.count(Donation.id))
            .where(Donation.organization_id == self.org_id, Donation.status == DonationStatus.CONFIRMED,
                   Donation.paid_at >= since).group_by(Donation.campaign_id))).all())
        top = max(recent.values(), default=0) or 1
        self.popularity = {k: v / top for k, v in recent.items()}
        self._loaded = True
        return self

    def add_donor(self, donor: Donor) -> None:
        row = _DonorRow(donor.id, donor.full_name or "", donor.phone)
        if row.name:
            self.by_name.setdefault(fold(row.name), []).append(row)
        if donor.phone:
            self.by_phone.setdefault(_phone_key(donor.phone), []).append(row)

    # --- donor ------------------------------------------------------------------------------

    def donor_for(self, sender: Optional[str], text: str) -> dict:
        for phone in phones_in(text):
            found = self.by_phone.get(_phone_key(phone), [])
            if len(found) == 1:
                return _donor_hit(found[0], 0.95, f"Açıklamadaki telefon ({phone})")
        key = fold(sender)
        if not key:
            return {"confidence": 0, "candidates": []}
        rule = self.sender_rules.get(key)
        if rule:
            row = next((r for rows in self.by_name.values() for r in rows if r.id == rule.donor_id), None)
            return _donor_hit(row or _DonorRow(rule.donor_id, sender or "", None), 0.95, "Bu gönderen daha önce eşleştirildi")
        exact = self.by_name.get(key, [])
        if len(exact) == 1:
            return _donor_hit(exact[0], AUTO_DONOR_CONFIDENCE, "Gönderen adı bağışçıyla aynı")
        if exact:
            return {"confidence": 0.5, "reason": "Bu adla birden fazla bağışçı var",
                    "candidates": [_brief(r) for r in exact[:10]]}
        close = difflib.get_close_matches(key, self.by_name.keys(), n=3, cutoff=0.88)
        if close:
            rows = [r for k in close for r in self.by_name[k]][:10]
            if len(rows) == 1:
                return _donor_hit(rows[0], 0.6, "Gönderen adına çok benzer bağışçı")
            return {"confidence": 0.5, "reason": "Benzer adlı bağışçılar", "candidates": [_brief(r) for r in rows]}
        return {"confidence": 0, "candidates": []}

    # --- campaign ---------------------------------------------------------------------------

    def _campaign_words(self) -> None:
        self.words: dict[UUID, list[str]] = {}
        df: Counter = Counter()
        for campaign in self.campaigns:
            words = [w for w in dict.fromkeys(fold(campaign.title).split())
                     if w not in STOP_WORDS and not w.isdigit() and len(w) >= 2]
            self.words[campaign.id] = words
            df.update({_stem(w) for w in words})
        self.df = df

    def campaign_for(self, note: str, default_campaign_id: Optional[UUID],
                     donor_id: Optional[str] = None) -> Optional[dict]:
        """Score campaigns by the distinctive title words in the text, the category words and the donor's history."""
        text = fold(note)
        padded = f" {text} "
        for rule in self.keyword_rules:
            campaign = self.campaign_by_id.get(rule.campaign_id)
            if campaign and f" {rule.pattern} " in padded:
                return _campaign_hit(campaign, "high", f"'{rule.pattern}' kuralı")
        tokens = text.split()
        categories = set(categories_in(note))
        history = self.history.get(UUID(donor_id), {}) if donor_id else {}
        history_total = sum(history.values()) or 1
        scored = []
        for campaign in self.campaigns:
            words = self.words.get(campaign.id, [])
            matched = [w for w in words if _present(w, tokens)]
            score = sum(0.5 + 0.5 / self.df[_stem(w)] for w in matched)  # written words weigh most
            reasons = []
            if matched:
                reasons.append("açıklamada: " + ", ".join(matched))
            if _category(campaign) in categories:
                score += 0.3
                reasons.append(f"'{_category(campaign)}' kelimesi")
            share = history.get(campaign.id, 0) / history_total
            if share:
                score += 0.3 * share  # history is a weak hint: donors follow the season (kurban, Ramazan…)
                reasons.append(f"bağışçının önceki bağışlarının %{round(share * 100)}'i")
            full = bool(words) and len(matched) == len(words)
            recent = self.popularity.get(campaign.id, 0)
            if recent:
                score += 0.2 * recent  # what the organisation is collecting for these days
            scored.append((score, full and len(words) >= 2, campaign, reasons, bool(matched)))
        scored.sort(key=lambda t: -t[0])
        if scored and scored[0][0] >= 0.3:
            score, full, campaign, reasons, written = scored[0]
            margin = score - (scored[1][0] if len(scored) > 1 else 0)
            confidence = ("high" if full and margin >= 0.5
                          else "medium" if written and score >= 0.8 and margin >= 0.3 else "low")
            return _campaign_hit(campaign, confidence, "; ".join(reasons))
        default = self.campaign_by_id.get(default_campaign_id) if default_campaign_id else None
        if default:
            return _campaign_hit(default, "low", "Hesabın varsayılan kampanyası")
        return None

    # --- whole suggestion -------------------------------------------------------------------

    def suggest(self, transaction: BankTransaction, account: Optional[BankAccount] = None) -> dict:
        parsed = parse_description(transaction.description, transaction.sender_name)
        text = f"{transaction.description or ''}"
        donor = self.donor_for(parsed.sender, text)
        campaign = self.campaign_for(parsed.note if parsed.sender else text,
                                     account.default_campaign_id if account else None, donor.get("id"))
        return {
            "sender": parsed.sender, "note": parsed.note, "donor": donor, "campaign": campaign,
            "kurban_type": kurban_intent(parsed.note) if campaign and _category_key(campaign) == "kurban" else None,
            "auto": bool(donor.get("id") and donor["confidence"] >= AUTO_DONOR_CONFIDENCE and campaign
                         and campaign["confidence"] == "high"),
        }


def _stem(word: str) -> str:
    return word[:5]


def _present(word: str, tokens: list[str]) -> bool:
    """Turkish suffixes: 'medrese' matches 'medresesi', 'kuyu' matches 'kuyusuna'."""
    stem = _stem(word)
    return any(t.startswith(stem) if len(word) >= 4 else t == word for t in tokens)


def _phone_key(phone: str) -> str:
    digits = "".join(c for c in str(phone) if c.isdigit())
    return digits[-10:]


def _brief(row: _DonorRow) -> dict:
    return {"id": str(row.id), "name": row.name, "phone": row.phone}


def _donor_hit(row: _DonorRow, confidence: float, reason: str) -> dict:
    return {**_brief(row), "confidence": confidence, "reason": reason, "candidates": []}


def _category(campaign: Campaign) -> str:
    value = campaign.category.value if hasattr(campaign.category, "value") else str(campaign.category or "")
    return {"adak": "kurban", "akika": "kurban"}.get(value, value)


def _category_key(hit: dict) -> str:
    return hit.get("category", "")


def _campaign_hit(campaign: Campaign, confidence: str, reason: str) -> dict:
    return {"id": str(campaign.id), "title": campaign.title, "category": _category(campaign),
            "confidence": confidence, "reason": reason}


async def learn_sender(db: AsyncSession, organization_id: UUID, sender: Optional[str], donor_id: UUID,
                       source: str = "approval", matcher: Optional[Matcher] = None) -> None:
    pattern = fold(sender)[:255]
    if len(pattern) < 5:
        return
    rule = (await db.execute(select(BankMatchRule).where(
        BankMatchRule.organization_id == organization_id, BankMatchRule.kind == "sender",
        BankMatchRule.pattern == pattern))).scalar_one_or_none()
    if rule:
        rule.donor_id, rule.hits = donor_id, (rule.hits or 0) + 1
    else:
        rule = BankMatchRule(organization_id=organization_id, kind="sender", pattern=pattern, donor_id=donor_id,
                             hits=1, source=source)
        db.add(rule)
    if matcher and matcher._loaded:
        matcher.sender_rules[pattern] = rule


async def analyse(db: AsyncSession, transaction: BankTransaction, matcher: Matcher,
                  account: Optional[BankAccount] = None) -> dict:
    """Store a suggestion on an unmatched transaction; outgoing and card settlements are set aside."""
    if transaction.status not in (None, ReconciliationStatus.UNMATCHED):
        return transaction.suggestion or {}
    transaction.status = ReconciliationStatus.UNMATCHED
    if transaction.amount_cents <= 0 or is_pos_settlement(transaction.description):
        transaction.status = ReconciliationStatus.IGNORED
        transaction.suggestion = {"ignored": "Giden ödeme" if transaction.amount_cents <= 0 else "Kart gün sonu (POS)"}
        return transaction.suggestion
    await matcher.load()
    transaction.suggestion = matcher.suggest(transaction, account)
    return transaction.suggestion


async def approve(
    db: AsyncSession,
    transaction: BankTransaction,
    *,
    donor: Donor,
    campaign: Campaign,
    user_id: UUID,
    on_behalf_of: Optional[str] = None,
    kurban_type: Optional[str] = None,
    note: Optional[str] = None,
    receipt_book_id: Optional[UUID] = None,
    send_receipt: bool = True,
    matcher: Optional[Matcher] = None,
    automatic: bool = False,
) -> Donation:
    """Record the transfer as a confirmed donation; the caller commits."""
    from app.services.offline_donation import record_offline_donation

    if transaction.status == ReconciliationStatus.MATCHED:
        raise ValueError("Bu hareket zaten bağışa dönüştürüldü")
    if transaction.amount_cents <= 0:
        raise ValueError("Yalnız gelen havaleler bağışa dönüştürülebilir")
    suggestion = transaction.suggestion or {}
    bank_key = (transaction.raw_data or {}).get("_bank") or "ekstre"
    donation, _ = await record_offline_donation(
        db, organization_id=transaction.organization_id, campaign=campaign, donor=donor,
        amount_cents=transaction.amount_cents, currency=transaction.currency or "TRY",
        method=PaymentMethod.BANK_TRANSFER, paid_at=transaction.booked_at, issued_by_id=user_id,
        provider=f"bank:{bank_key}", idempotency_key=f"bank:{transaction.id}", transaction_id=transaction.external_id,
        details={"bank_transaction_id": str(transaction.id), "sender": suggestion.get("sender"),
                 "description": transaction.description, "automatic": automatic},
        note=(note if note is not None else suggestion.get("note")) or None,
        on_behalf_of=on_behalf_of, send_receipt=send_receipt,
        metadata={"kurban_type": kurban_type} if kurban_type else {},
    )
    if receipt_book_id:
        from app.services.receipt_books import take_number
        _, label = await take_number(db, transaction.organization_id, receipt_book_id)
        donation.official_receipt_no = label
    transaction.status = ReconciliationStatus.MATCHED
    transaction.donation_id = donation.id
    transaction.matched_by_id = user_id
    transaction.matched_at = datetime.now(timezone.utc)
    if suggestion.get("sender"):
        await learn_sender(db, transaction.organization_id, suggestion["sender"], donor.id,
                           source="auto" if automatic else "approval", matcher=matcher)
    return donation
