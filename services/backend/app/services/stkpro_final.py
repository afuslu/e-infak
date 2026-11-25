"""The last STK PRO export of an organisation that already works in e-infak.

Unlike the first import, both systems were used side by side for a while: a transfer may exist here (approved from
the bank feed) and in STK PRO (entered by staff). Such donations are linked, never added twice. On a conflict the
campaign and donor chosen in e-infak stay; STK PRO's receipt numbers win and e-infak-only receipts move after them.
Everything is one transaction, nothing is announced (no receipt, SMS, push or webhook), and re-running adds nothing.
"""
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.banking.parsers import fold, kurban_intent, parse_description
from app.banking.ziraatkatilim import number_parts
from app.models.automation import BankAccount, BankTransaction, ReconciliationStatus
from app.models.campaign import CampaignStatus
from app.models.donation import Donation, DonationStatus, Donor
from app.models.kurban import KurbanAnimal, KurbanCampaign, KurbanShare, KurbanStatus
from app.models.user import User
from app.services.stkpro_import import StkProImporter, _cents, _text, _when, phone_of, read_xlsx


def _minute(value) -> datetime:
    return _when(value).astimezone(timezone.utc).replace(second=0, microsecond=0)


def _utc_minute(value: datetime) -> datetime:
    return value.astimezone(timezone.utc).replace(second=0, microsecond=0)


def _number(value) -> Optional[int]:
    text = _text(value) or ""
    return int(text) if text.isdigit() and len(text) <= 9 else None


def _digits(phone) -> str:
    return re.sub(r"\D", "", phone or "")[-10:]


class StkProFinalImporter(StkProImporter):
    def __init__(self, *args, previous_donors: Iterable[dict] = (), previous_donations: Iterable[dict] = (), **kwargs):
        super().__init__(*args, announce=False, **kwargs)
        self.previous_donors = {_text(r.get("No")): r for r in previous_donors}
        self.previous_donations = {_text(r.get("Bağış No")): r for r in previous_donations}
        self.extra: dict = {"donors_merged_here": [], "donors_changed": 0, "linked": [], "moved": [], "bank": Counter(),
                            "kurban": Counter(), "online": Counter(), "renumbered": [], "warnings": []}
        self._donor_alias: dict[str, Donor] = {}
        self._rows: dict[str, list[dict]] = {}
        self._by_stk: dict[str, Donation] = {}  # Bağış No -> donation here
        self._accounts: dict[str, BankAccount] = {}

    def warn(self, message: str) -> None:
        self.extra["warnings"].append(message)

    async def _prepare(self) -> None:
        await super()._prepare()
        for ref, donor in self._donor_alias.items():
            self._donors.setdefault(ref, donor)
        self._accounts = {a.bank_key: a for a in (await self.db.execute(select(BankAccount).where(
            BankAccount.organization_id == self.org_id))).scalars()}

    # --- donors -------------------------------------------------------------------------------

    async def _skip_donor(self, ref, row, values, donor) -> bool:
        before = self.previous_donors.get(ref)
        if donor:
            if before:  # edited in STK PRO since the first import and not touched here
                old = self._donor_values(before)
                for key, value in values.items():
                    if value and old.get(key) and value != old[key] and getattr(donor, key) == old[key]:
                        setattr(donor, key, value)
                        self.extra["donors_changed"] += 1
            return False
        if not before:
            return False
        # Imported before and gone: merged into another card (or deleted) here by staff. Never bring it back.
        phone = _digits(values["phone"])
        found = [d for d in self._donors.values() if phone and _digits(d.phone) == phone]
        found = list({d.id: d for d in found}.values())
        if len(found) == 1:
            self._donor_alias[ref] = self._donors[ref] = found[0]
            self.extra["donors_merged_here"].append(f"{ref} -> {found[0].external_ref}")
            await self._import_notes(found[0], row.get("Görüşme Notları"))
        else:
            self.warn(f"Bağışçı {ref} ({values['first_name']} {values['last_name'] or ''}) e-infak'ta silinmiş, geri getirilmedi")
        return True

    # --- donations ----------------------------------------------------------------------------

    def _account_for(self, value) -> Optional[BankAccount]:
        head = (_text(value) or "").split("-")[0]
        if not head:
            return None
        if head == "53":  # Ziraat Katılım branch-customer-account; Vakıf Katılım: customer-account
            return self._accounts.get("ziraatkatilim")
        return self._accounts.get("vakifkatilim")

    def _extra_details(self, row: dict) -> dict:
        account = self._account_for(row.get("Ek Hesap"))
        values = {"bank_account_id": str(account.id) if account else None, "stkpro_account": _text(row.get("Ek Hesap")),
                  "on_behalf_of_phone": phone_of("90", row.get("Kimin Adına Telefon")),
                  "zekat": True if fold(row.get("Zekat Durum")) == "evet" else None,
                  "stkpro_kurban_no": _text(row.get("Kurban No"), 20)}
        return {k: v for k, v in values.items() if v}

    async def import_donations(self, rows: list[dict]) -> None:
        await self._prepare()
        self._rows = {}
        for row in rows:
            number = _text(row.get("Bağış No"), 40)
            if number:
                self._rows[number] = row
        donations = list((await self.db.execute(select(Donation).where(
            Donation.organization_id == self.org_id))).scalars())
        by_key = {d.idempotency_key: d for d in donations}
        prefix = f"stkpro:{str(self.org_id)[:8]}:"
        for number in self._rows:
            if f"{prefix}{number}" in by_key:
                self._by_stk[number] = by_key[f"{prefix}{number}"]
        for donation in donations:
            for number in (donation.payment_details or {}).get("stkpro_bagis_nos") or []:
                self._by_stk[str(number)] = donation

        self._claim_moved(by_key, prefix)
        blocked = self._claim_own(donations)
        for number, donation in self._by_stk.items():
            if number in self._rows:
                self._refresh(donation, self._rows[number])
        await self.db.flush()

        todo = [r for n, r in self._rows.items() if n not in self._by_stk and n not in blocked]
        # A kurban gets its STK PRO number below; it must not take a place on another animal first.
        campaigns = (await self.db.execute(select(KurbanCampaign).where(
            KurbanCampaign.organization_id == self.org_id, KurbanCampaign.auto_assign.is_(True)))).scalars().all()
        for campaign in campaigns:
            campaign.auto_assign = False
        await self.db.flush()
        await super().import_donations(todo)
        for campaign in campaigns:
            campaign.auto_assign = True
        await self.db.flush()
        for donation in (await self.db.execute(select(Donation).where(
                Donation.organization_id == self.org_id, Donation.idempotency_key.like(f"{prefix}%")))).scalars():
            self._by_stk.setdefault(donation.idempotency_key[len(prefix):], donation)

    def _claim_moved(self, by_key: dict, prefix: str) -> None:
        """Deleted and entered again in STK PRO under a new number: same time, amount and name."""
        for old_no, old in self.previous_donations.items():
            donation = by_key.get(f"{prefix}{old_no}")
            if old_no in self._rows or not donation:
                continue
            same = [n for n, r in self._rows.items() if n not in self._by_stk and r.get("Bağış Tarihi") == old.get("Bağış Tarihi")
                    and _cents(r.get("Toplam Tutar")) == _cents(old.get("Toplam Tutar"))
                    and fold(r.get("Bağışçı")) == fold(old.get("Bağışçı"))]
            if len(same) != 1:
                self.warn(f"Bağış {old_no} STK PRO'da silinmiş; e-infak'ta duruyor ({donation.amount_cents / 100:.2f} TL)")
                continue
            number, row = same[0], self._rows[same[0]]
            donation.idempotency_key = f"{prefix}{number}"
            receipt = _text(row.get("Makbuz No"), 40)
            if donation.official_receipt_no == _text(old.get("Makbuz No"), 40):
                donation.official_receipt_no = receipt
            donation.receipt_seq = _number(receipt) or donation.receipt_seq
            donation.payment_details = {**(donation.payment_details or {}), "stkpro_bagis_no": number, "stkpro_makbuz_no": receipt,
                                        "stkpro_old_bagis_no": old_no}
            self._by_stk[number] = donation
            self.extra["moved"].append(f"{old_no} -> {number}")

    def _claim_own(self, donations: list[Donation]) -> set[str]:
        """Links receipts of STK PRO to donations that came here through the bank feed. Returns ambiguous Bağış No's."""
        own: dict[tuple, list[Donation]] = defaultdict(list)
        taken = {d.id for d in self._by_stk.values()}
        for d in donations:
            if (d.payment_provider or "").startswith("bank:") and d.status == DonationStatus.CONFIRMED and d.id not in taken and d.paid_at:
                own[(_utc_minute(d.paid_at), d.payment_provider[5:])].append(d)
        receipts: dict[str, list[str]] = defaultdict(list)
        for number, row in self._rows.items():
            if number not in self._by_stk and self._account_for(row.get("Ek Hesap")):
                receipts[_text(row.get("Makbuz No")) or f"-{number}"].append(number)
        blocked: set[str] = set()
        for receipt, numbers in receipts.items():
            first = self._rows[numbers[0]]
            slot = own.get((_minute(first.get("Bağış Tarihi")), self._account_for(first.get("Ek Hesap")).bank_key), [])
            if not slot:
                continue
            total = sum(_cents(self._rows[n].get("Toplam Tutar")) for n in numbers)
            hits = [d for d in slot if d.amount_cents == total]
            if len(hits) > 1:
                donor = self._donors.get(_text(first.get("Bağışçı No"), 64))
                hits = [d for d in hits if donor and d.donor_id == donor.id] or hits
            if not hits and sum(d.amount_cents for d in slot) == total:
                chosen = list(slot)  # one STK PRO receipt, split over campaigns here
            elif len(hits) == 1:
                chosen = hits
            elif hits:
                blocked.update(numbers)
                self.warn(f"Makbuz {receipt}: birden fazla e-infak bağışı uyuyor, aktarılmadı")
                continue
            else:
                continue
            for i, donation in enumerate(chosen):
                slot.remove(donation)
                details = dict(donation.payment_details or {})
                details.update({"stkpro_bagis_nos": numbers, "stkpro_makbuz_no": _text(first.get("Makbuz No"), 40),
                                "stkpro_campaign": ", ".join(dict.fromkeys(_text(self._rows[n].get("Kampanya Adı")) or "-" for n in numbers)),
                                "stkpro_donor": f"{_text(first.get('Bağışçı No'))} {_text(first.get('Bağışçı'))}"})
                number = _number(first.get("Makbuz No"))
                if number and donation.receipt_seq != number:
                    details["old_receipt_seq"] = donation.receipt_seq
                    donation.receipt_seq = number
                donation.payment_details = details
                if i == 0:
                    for n in numbers:
                        self._by_stk[n] = donation
            self.extra["linked"].append({"makbuz": receipt, "bagis": numbers, "tutar": total / 100,
                                         "stk_kampanya": details["stkpro_campaign"], "stk_bagisci": details["stkpro_donor"]})
        return blocked

    def _refresh(self, donation: Donation, row: dict) -> None:
        details = dict(donation.payment_details or {})
        for key, value in {**self._extra_details(row), "country": _text(row.get("Kampanya Ülkesi"))}.items():
            # The ledger entry of an imported donation is already posted: its account is not changed afterwards.
            if key != "bank_account_id" and value and not details.get(key):
                details[key] = value
        if details != (donation.payment_details or {}):
            donation.payment_details = details

    # --- kurban -------------------------------------------------------------------------------

    async def import_kurban(self, rows: list[dict]) -> None:
        info = {_text(r.get("Kurban No")): r for r in rows}
        wanted: dict[str, list[Donation]] = defaultdict(list)
        for number, row in sorted(self._rows.items(), key=lambda kv: int(kv[0])):
            kurban_no = _text(row.get("Kurban No"))
            if kurban_no and number in self._by_stk:
                wanted[kurban_no].append(self._by_stk[number])
        shares: dict = defaultdict(list)
        for share in (await self.db.execute(select(KurbanShare).where(
                KurbanShare.organization_id == self.org_id).order_by(KurbanShare.created_at))).scalars():
            shares[share.donation_id].append(share)
        donor_phones = dict((await self.db.execute(select(Donor.id, Donor.phone).where(
            Donor.organization_id == self.org_id))).all())
        animals = {(a.campaign_id, a.animal_number): a for a in (await self.db.execute(select(KurbanAnimal).where(
            KurbanAnimal.organization_id == self.org_id))).scalars()}
        left: set = set()
        for kurban_no, donations in wanted.items():
            row = info.get(kurban_no)
            group = [s for d in donations for s in shares.get(d.id, [])]
            if not row or len(group) != len(donations) or len({s.campaign_id for s in group}) != 1:
                self.warn(f"Kurban {kurban_no}: {len(donations)} bağış, {len(group)} hisse; taşınmadı")
                continue
            campaign_id = group[0].campaign_id
            campaign = await self.db.get(KurbanCampaign, campaign_id)
            animal = animals.get((campaign_id, kurban_no))
            if not animal:
                animal = KurbanAnimal(organization_id=self.org_id, campaign_id=campaign_id, animal_number=kurban_no,
                                      type=campaign.animal_type, status=KurbanStatus.WAITING, country=_text(row.get("Ülkesi"), 100))
                self.db.add(animal)
                await self.db.flush()
                animals[(campaign_id, kurban_no)] = animal
                self.extra["kurban"]["animals"] += 1
            done = fold(row.get("Durum")) == "kesildi"
            if done:
                animal.status = KurbanStatus.SLAUGHTERED
                self.extra["kurban"]["slaughtered"] += 1
            if fold(row.get("Video Durum")) == "gonderildi":
                animal.video_status = "sent"
                self.extra["kurban"]["video_sent"] += 1
            intent = kurban_intent(_text(row.get("Kurban Türü")) or "")
            for i, share in enumerate(group, start=1):
                if share.animal_id != animal.id:
                    if share.animal_id:
                        left.add(share.animal_id)
                    share.animal_id = animal.id
                    self.extra["kurban"]["shares_moved"] += 1
                share.share_number = i
                if done:
                    share.status = KurbanStatus.SLAUGHTERED
                if intent:
                    share.kurban_type = intent
        for number, row in self._rows.items():
            phone = phone_of("90", row.get("Kimin Adına Telefon"))
            donation = self._by_stk.get(number)
            for share in shares.get(donation.id, []) if phone and donation else []:
                if share.donor_phone != phone and share.donor_phone == (donor_phones.get(share.donor_id) or ""):
                    share.donor_phone = phone
                    self.extra["kurban"]["phones"] += 1
            if fold(row.get("Tür")) == "kurban" and not _text(row.get("Kurban No")) and donation and any(
                    s.animal_id is None for s in shares.get(donation.id, [])):
                self.warn(f"Bağış {number}: STK PRO'da Kurban No yok, hisse dağıtılmadı")
        await self.db.flush()
        used = set((await self.db.execute(select(KurbanShare.animal_id).where(
            KurbanShare.organization_id == self.org_id, KurbanShare.animal_id.isnot(None)))).scalars())
        for animal in list(animals.values()):
            if animal.id in left and animal.id not in used and not animal.video_url and animal.status == KurbanStatus.WAITING:
                await self.db.delete(animal)
                self.extra["kurban"]["empty_animals_removed"] += 1
        for kurban_no in sorted(set(info) - set(wanted), key=int):
            self.warn(f"Kurban {kurban_no}: STK PRO'da hissesi yok, açılmadı")
        await self.db.flush()

    # --- bank movements -----------------------------------------------------------------------

    @staticmethod
    def _external_id(row: dict) -> str:
        bank, key = _text(row.get("Banka")), _text(row.get("İşlem ID"))
        if bank != "ziraatkatilim":
            return f"{bank}:{key}"
        # Same key as the connector (ziraatkatilim.movement_from), so a later sync finds the row.
        number = "-".join(number_parts(_text(row.get("Hesap")) or ""))
        booked = _when(row.get("Tarih")).astimezone(timezone.utc)
        return f"{bank}:{number}:{key}:{booked:%Y%m%d%H%M%S}:{_cents(row.get('Tutar'))}"

    async def import_bank(self, rows: list[dict]) -> None:
        stats = self.extra["bank"]
        known: dict[str, BankTransaction] = {}
        for tx in (await self.db.execute(select(BankTransaction).where(
                BankTransaction.organization_id == self.org_id))).scalars():
            known[tx.external_id] = tx
            parts = tx.external_id.split(":")
            known[f"{parts[0]}:{parts[2] if len(parts) > 2 else parts[-1]}"] = tx
        slots, days = defaultdict(lambda: defaultdict(list)), defaultdict(lambda: defaultdict(list))
        for number, row in self._rows.items():
            account = self._account_for(row.get("Ek Hesap"))
            if account and number in self._by_stk:
                receipt = _text(row.get("Makbuz No"))
                slots[(account.bank_key, _minute(row.get("Bağış Tarihi")))][receipt].append(number)
                days[(account.bank_key, _when(row.get("Bağış Tarihi")).date(), fold(row.get("Bağışçı")))][receipt].append(number)
        claimed: set[str] = set()

        def total(receipts: dict, names: Iterable[str]) -> int:
            return sum(_cents(self._rows[n].get("Toplam Tutar")) for r in names for n in receipts[r])

        def pick(row: dict) -> list[str]:
            bank, amount, name = _text(row.get("Banka")), _cents(row.get("Tutar")), fold(row.get("Bağışçı"))
            for receipts in (slots.get((bank, _minute(row.get("Tarih"))), {}),
                             days.get((bank, _when(row.get("Tarih")).date(), name), {})):
                free = [r for r in receipts if r not in claimed]
                exact = [r for r in free if total(receipts, [r]) == amount]
                if len(exact) > 1:
                    exact = [r for r in exact if fold(self._rows[receipts[r][0]].get("Bağışçı")) == name] or exact
                found = exact if len(exact) == 1 else free if not exact and free and total(receipts, free) == amount else []
                if found:
                    claimed.update(found)
                    return [n for r in found for n in receipts[r]]
            return []

        for row in sorted(rows, key=lambda r: int(_text(r.get("No")) or 0)):
            bank, key = _text(row.get("Banka")), _text(row.get("İşlem ID"))
            account = self._accounts.get(bank)
            external_id, amount = self._external_id(row), _cents(row.get("Tutar"))
            matched = fold(row.get("Durum")) == "eslestirildi"
            numbers = pick(row) if matched else []
            donations = list({self._by_stk[n].id: self._by_stk[n] for n in numbers}.values())
            tx = known.get(external_id) or known.get(f"{bank}:{key}")
            if tx and (tx.amount_cents != amount):
                self.warn(f"Banka {key}: tutar farklı ({tx.amount_cents / 100} / {amount / 100}), dokunulmadı")
                continue
            if tx:
                stats["existing"] += 1
                if tx.status == ReconciliationStatus.MATCHED:
                    if donations and tx.donation_id and tx.source != "stkpro" and not any(
                            d.id == tx.donation_id or (d.payment_details or {}).get("bank_transaction_id") == str(tx.id) for d in donations):
                        self.warn(f"OLASI ÇİFT KAYIT: banka {key}, {amount / 100:.2f} TL, STK bağış {', '.join(numbers)}")
                    continue
                if not donations:
                    continue
                stats["waiting_linked"] += 1
            else:
                description = _text(row.get("Açıklama"))
                tx = BankTransaction(
                    organization_id=self.org_id, bank_account_id=account.id if account else None, source="stkpro",
                    external_id=external_id, booked_at=_when(row.get("Tarih")), amount_cents=amount, currency="TRY",
                    sender_name=parse_description(description or "").sender or _text(row.get("Bağışçı"), 255), description=description,
                    status=ReconciliationStatus.MATCHED if matched else ReconciliationStatus.IGNORED,
                    suggestion={} if matched else {"ignored": "STK PRO'da eşleşmemiş"},
                    raw_data={"_bank": bank, "stkpro_no": _text(row.get("No")), "stkpro_donor": _text(row.get("Bağışçı")),
                              "tc": _text(row.get("TC/Vergi No")) or ""})
                self.db.add(tx)
                await self.db.flush()
                known[external_id] = known[f"{bank}:{key}"] = tx
                stats["created_matched" if matched else "created_ignored"] += 1
                if matched and not donations:
                    stats["matched_without_donation"] += 1
            if donations:
                tx.status, tx.donation_id = ReconciliationStatus.MATCHED, donations[0].id
                tx.matched_at, tx.matched_by_id = tx.matched_at or datetime.now(timezone.utc), tx.matched_by_id or self.actor.id
                stats["linked"] += 1
                for donation in donations:
                    if not (donation.payment_details or {}).get("bank_transaction_id"):
                        donation.payment_details = {**(donation.payment_details or {}), "bank_transaction_id": str(tx.id)}
        await self.db.flush()

    # --- card payments ------------------------------------------------------------------------

    def import_online(self, rows: list[dict]) -> None:
        by_receipt: dict[str, list[str]] = defaultdict(list)
        for number, row in self._rows.items():
            by_receipt[_text(row.get("Makbuz No")) or ""].append(number)
        for row in rows:
            receipt = (_text(row.get("Makbuz")) or "").lstrip("#")
            # Receipt lines of the order; when campaigns tell them apart, only the line it belongs to.
            numbers = by_receipt.get(receipt, []) if receipt.isdigit() else []
            same = [n for n in numbers if fold(self._rows[n].get("Kampanya Adı")) == fold(row.get("Kampanya"))]
            donations = {self._by_stk[n].id: self._by_stk[n] for n in (same or numbers) if n in self._by_stk}
            if not donations:
                self.extra["online"]["not_a_donation"] += 1
                if fold(row.get("Banka Cevap")) == "basarili":
                    self.warn(f"Online {_text(row.get('No'))}: {_text(row.get('Bağışçı'))} {_text(row.get('Toplam Tutar'))} TL başarılı görünüyor, "
                              f"makbuzu yok ({_text(row.get('Makbuz'))})")
                continue
            masked = re.sub(r"\D", "", _text(row.get("Kart Maske")) or "")
            online = {"order_id": _text(row.get("Sipariş ID")), "card": _text(row.get("Kart Maske")), "card_name": _text(row.get("Kart Adı")),
                      "bank": _text(row.get("Banka")), "bank_message": _text(row.get("Banka Mesajı")),
                      "created_type": _text(row.get("Oluşturma Türü")), "note": _text(row.get("Bağış Notu"))}
            for donation in donations.values():
                if donation.payment_provider != "stkpro" or (donation.payment_details or {}).get("stkpro_online"):
                    continue
                donation.payment_details = {**(donation.payment_details or {}), "stkpro_online": {k: v for k, v in online.items() if v}}
                donation.transaction_id = donation.transaction_id or online["order_id"]
                donation.card_last_4 = donation.card_last_4 or (masked[-4:] if len(masked) >= 8 else None)
                donation.donor_message = donation.donor_message or online["note"]
                self.extra["online"]["enriched"] += 1

    # --- receipt numbers ----------------------------------------------------------------------

    async def renumber(self, receipt_rows: Iterable[dict] = ()) -> None:
        """e-infak-only receipts inside STK PRO's range take the numbers after it."""
        numbers = [_number(r.get("Makbuz No")) or 0 for r in [*self._rows.values(), *receipt_rows]]
        top = max(numbers, default=0)
        linked = {d.id for d in self._by_stk.values()}
        groups: dict[int, list[Donation]] = defaultdict(list)
        for d in (await self.db.execute(select(Donation).where(
                Donation.organization_id == self.org_id, Donation.receipt_seq.isnot(None), Donation.receipt_seq <= top)
                .with_for_update())).scalars():
            # "stkpro_bagis_nos": the other halves of a split transfer keep their linked number
            if d.payment_provider != "stkpro" and d.id not in linked and not (d.payment_details or {}).get("stkpro_bagis_nos"):
                groups[d.receipt_seq].append(d)
        following = max((await self.db.execute(select(func.max(Donation.receipt_seq)).where(
            Donation.organization_id == self.org_id))).scalar_one() or 0, top) + 1
        for old, items in sorted(groups.items(), key=lambda kv: min(d.paid_at or d.created_at for d in kv[1])):
            for d in items:
                d.receipt_seq = following
                d.payment_details = {**(d.payment_details or {}), "old_receipt_seq": old}
            self.extra["renumbered"].append(f"{old} -> {following}")
            following += 1
        await self.db.flush()

    async def check(self, receipt_rows: Iterable[dict]) -> dict:
        per_receipt: Counter = Counter()
        for number, row in self._rows.items():
            if number not in self._by_stk:
                self.warn(f"Bağış {number} aktarılmadı")
            per_receipt[_text(row.get("Makbuz No"))] += _cents(row.get("Toplam Tutar"))
        wrong = [no for r in receipt_rows if (no := _text(r.get("Makbuz No"))) in per_receipt
                 and per_receipt[no] != _cents(r.get("Genel Toplam"))]
        donations = {d.id: d for n, d in self._by_stk.items() if n in self._rows}
        seqs: dict[int, int] = defaultdict(int)
        for d in (await self.db.execute(select(Donation).where(
                Donation.organization_id == self.org_id, Donation.status == DonationStatus.CONFIRMED,
                Donation.receipt_seq.isnot(None)))).scalars():
            seqs[d.receipt_seq] += d.amount_cents
        here = [no for no, cents in per_receipt.items() if (n := _number(no)) and seqs.get(n) != cents]
        return {"stk_total": sum(per_receipt.values()) / 100, "traced_total": sum(d.amount_cents for d in donations.values()) / 100,
                "receipts_different_from_file": wrong, "receipts_different_here": here}

    def result(self) -> dict:
        return {**self.report.as_dict(), **{k: dict(v) if isinstance(v, Counter) else v for k, v in self.extra.items()}}


async def run_final(db: AsyncSession, organization_id, *, actor: User, donor_files: list[str], donation_files: list[str],
                    previous_donors: list[str], previous_donations: list[str], kurban_files: list[str], bank_files: list[str],
                    online_files: list[str], receipt_files: list[str], commit: bool, create_campaigns: bool = True,
                    campaign_status: CampaignStatus = CampaignStatus.ACTIVE, aliases: Optional[dict[str, str]] = None,
                    staff_aliases: Optional[dict[str, str]] = None) -> dict:
    def rows(files):
        return [row for path in files for row in read_xlsx(path)]

    importer = StkProFinalImporter(db, organization_id, actor=actor, create_campaigns=create_campaigns,
                                   campaign_status=campaign_status, aliases=aliases, staff_aliases=staff_aliases,
                                   previous_donors=rows(previous_donors), previous_donations=rows(previous_donations))
    try:
        await importer.import_donors(rows(donor_files))
        await importer.import_donations(rows(donation_files))
        await importer.import_kurban(rows(kurban_files))
        await importer.import_bank(rows(bank_files))
        importer.import_online(rows(online_files))
        receipts = rows(receipt_files)
        await importer.renumber(receipts)
        check = await importer.check(receipts)
        await (db.commit() if commit else db.rollback())
    except Exception:
        await db.rollback()
        raise
    return {"committed": commit, "check": check, **importer.result()}
