"""Donor card corrections: remove a receipt with its bank match, move it to another card."""
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1 import bank_sync, crm, data_tools
from app.banking.matching import Matcher, analyse
from app.models.automation import BankMatchRule, ReconciliationStatus
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.kurban import KurbanCampaign, KurbanShare
from app.models.membership import Member, MemberDue
from app.models.user import User, UserRole
from app.services.offline_donation import record_offline_donation
from tests.test_stkpro_bank_sync import _bank_setup, _request, _setup, _tx
from datetime import datetime, timezone

NOW = datetime(2026, 9, 17, 9, tzinfo=timezone.utc)


async def _receipt(db, org, admin, donor, campaign, provider="stkpro", amount=100_000, **kw):
    donation, _ = await record_offline_donation(
        db, organization_id=org.id, campaign=campaign, donor=donor, amount_cents=amount, currency="TRY",
        method=PaymentMethod.BANK_TRANSFER, paid_at=NOW, issued_by_id=admin.id, provider=provider,
        idempotency_key=uuid.uuid4().hex, send_receipt=False, **kw)
    await db.flush()
    return donation


async def _remove(db, org, user, donation, reason="Mükerrer kayıt"):
    return await crm.remove_receipt(_request(org), donation.id, crm.CancelIn(reason=reason), db, user)


async def _move(db, org, user, donation, donor_id):
    return await crm.move_receipt(_request(org), donation.id, crm.MoveReceiptIn(donor_id=donor_id), db, user)


async def test_imported_receipt_is_removed_then_the_card_merges(db_session):
    org, admin, _, _, genel, ali, berna = await _bank_setup(db_session)
    kept = await _receipt(db_session, org, admin, ali, genel)
    extra = await _receipt(db_session, org, admin, berna, genel)
    result = await _remove(db_session, org, admin, extra)
    assert result["status"] == "cancelled" and result["transfer_id"] is None and not result["removable"]
    for row in (genel, berna):
        await db_session.refresh(row)
    assert genel.collected_cents == 100_000
    assert (berna.total_donations, berna.total_donated_cents, berna.last_donation_at) == (0, 0, None)
    with pytest.raises(HTTPException) as exc:
        await _remove(db_session, org, admin, extra)
    assert exc.value.status_code == 409
    await data_tools.merge_donors(_request(org), data_tools.MergeIn(target_id=ali.id, source_ids=[berna.id]), db_session, admin)
    await db_session.refresh(ali)
    assert (ali.total_donations, ali.total_donated_cents) == (1, 100_000)
    assert kept.donor_id == ali.id


@pytest.mark.parametrize("split", [False, True])
async def test_bank_receipt_removal_frees_the_transfer_for_the_right_donor(db_session, split):
    org, admin, _, gazze, genel, ali, berna = await _bank_setup(db_session)
    tx = _tx(org, "Amir- SEDAT YILMAZ Aciklama- su", amount=100_000)
    db_session.add(tx)
    await db_session.flush()
    await analyse(db_session, tx, Matcher(db_session, org.id))
    lines = [bank_sync.ApproveLine(campaign_id=c.id, amount_cents=50_000) for c in (gazze, genel)] if split else None
    payload = {"lines": lines} if lines else {"campaign_id": genel.id}
    await bank_sync.approve_transfer(tx.id, bank_sync.ApproveIn(donor_id=ali.id, **payload), _request(org), db=db_session, current_user=admin)
    donations = (await db_session.execute(select(Donation).where(Donation.donor_id == ali.id))).scalars().all()
    assert len(donations) == (2 if lines else 1)
    last = donations[-1]
    result = await _remove(db_session, org, admin, last)
    assert result["transfer_id"] == str(tx.id) and tx.status == ReconciliationStatus.UNMATCHED and tx.donation_id is None
    for d in donations:
        await db_session.refresh(d)
        assert d.status == DonationStatus.CANCELLED
    again = await bank_sync.approve_transfer(tx.id, bank_sync.ApproveIn(donor_id=berna.id, campaign_id=genel.id),
                                             _request(org), db=db_session, current_user=admin)
    donation = await db_session.get(Donation, uuid.UUID(again["donation_id"]))
    assert donation.donor_id == berna.id and donation.status == DonationStatus.CONFIRMED
    await db_session.refresh(ali)
    assert ali.total_donated_cents == 0


async def test_move_keeps_receipt_bank_match_and_moves_shares(db_session):
    org, admin, kurban, _, _, ali, berna = await _bank_setup(db_session)
    db_session.add(KurbanCampaign(organization_id=org.id, title="Koyun", donation_campaign_id=kurban.id,
                                  price_per_share_cents=100_000))
    tx = _tx(org, "Amir- SEDAT YILMAZ Aciklama- kurban", amount=100_000)
    db_session.add(tx)
    await db_session.flush()
    await analyse(db_session, tx, Matcher(db_session, org.id))
    res = await bank_sync.approve_transfer(tx.id, bank_sync.ApproveIn(donor_id=ali.id, campaign_id=kurban.id),
                                           _request(org), db=db_session, current_user=admin)
    donation = await db_session.get(Donation, uuid.UUID(res["donation_id"]))
    moved = await _move(db_session, org, admin, donation, berna.id)
    assert moved["receipt_number"] == res["receipt_number"] and moved["status"] == "confirmed"
    for row in (ali, berna, donation, tx):
        await db_session.refresh(row)
    assert donation.donor_id == berna.id and tx.status == ReconciliationStatus.MATCHED
    assert (ali.total_donations, ali.total_donated_cents, ali.last_donation_at) == (0, 0, None)
    assert (berna.total_donations, berna.total_donated_cents) == (1, 100_000) and berna.last_donation_at
    share = (await db_session.execute(select(KurbanShare).where(KurbanShare.donation_id == donation.id))).scalar_one()
    await db_session.refresh(share)
    assert share.donor_id == berna.id and share.donor_name == berna.full_name and share.on_behalf_of == berna.full_name
    assert share.donor_phone == berna.phone
    rule = (await db_session.execute(select(BankMatchRule).where(
        BankMatchRule.organization_id == org.id, BankMatchRule.pattern == "sedat yilmaz"))).scalar_one()
    assert rule.donor_id == berna.id


async def test_every_item_of_a_receipt_moves(db_session):
    org, admin, _, gazze, genel, ali, berna = await _bank_setup(db_session)
    a = await _receipt(db_session, org, admin, ali, gazze, provider="manual")
    b = await _receipt(db_session, org, admin, ali, genel, provider="manual", amount=20_000)
    for i, d in enumerate((a, b)):
        d.payment_details = {**d.payment_details, "receipt_group": str(a.id), "line": i}
    await db_session.flush()
    await _move(db_session, org, admin, b, berna.id)
    for row in (a, b, ali, berna):
        await db_session.refresh(row)
    assert a.donor_id == b.donor_id == berna.id
    assert (berna.total_donations, berna.total_donated_cents, ali.total_donated_cents) == (2, 120_000, 0)


async def test_corrections_are_refused(db_session):
    org, admin, _, _, genel, ali, berna = await _bank_setup(db_session)
    other_org, other_admin = await _setup(db_session)
    stranger = Donor(organization_id=other_org.id, first_name="X")
    viewer = User(organization_id=org.id, email=f"{uuid.uuid4().hex}@example.com", hashed_password="x", first_name="V",
                  last_name="V", role=UserRole.EDITOR)
    db_session.add(stranger)
    if viewer:
        db_session.add(viewer)
    await db_session.flush()
    online = await _receipt(db_session, org, admin, ali, genel, provider="vakif_katilim")
    receipt = await _receipt(db_session, org, admin, ali, genel)
    for call, code in (
        (lambda: _remove(db_session, org, admin, online), 409),
        (lambda: _move(db_session, org, admin, online, berna.id), 409),
        (lambda: _move(db_session, org, admin, receipt, ali.id), 422),
        (lambda: _move(db_session, org, admin, receipt, stranger.id), 404),
        (lambda: _remove(db_session, other_org, other_admin, receipt), 404),
    ):
        with pytest.raises(HTTPException) as exc:
            await call()
        assert exc.value.status_code == code
    plain = viewer
    for call in (lambda: _remove(db_session, org, plain, receipt), lambda: _move(db_session, org, plain, receipt, berna.id)):
        with pytest.raises(HTTPException) as exc:
            await call()
        assert exc.value.status_code == 403
    member = Member(organization_id=org.id, donor_id=ali.id, member_no="1", joined_on=NOW.date())
    db_session.add(member)
    await db_session.flush()
    db_session.add(MemberDue(organization_id=org.id, member_id=member.id, donation_id=receipt.id, period="2026-09",
                             amount_cents=100_000, due_date=NOW.date(), status="paid"))
    await db_session.flush()
    with pytest.raises(HTTPException) as exc:
        await _move(db_session, org, admin, receipt, berna.id)
    assert exc.value.status_code == 409
