"""Failed / under-review card payments: the staff list and the reason kept by the bank inquiry."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1 import mobile as api
from app.models.automation import OutboxEvent
from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderItem, PaymentOrderStatus
from app.payments.base import PaymentResult
from tests.test_staff_notify import _donation, _request, _setup


async def _order(db, org, donor, campaign, status, *, cents=20000, at=None, **extra):
    order = PaymentOrder(organization_id=org.id, donor_id=donor.id, merchant_payment_id=uuid.uuid4().hex,
                         idempotency_key=uuid.uuid4().hex, payment_method="credit_card", status=status,
                         total_cents=cents, created_at=at or datetime.now(timezone.utc), **extra)
    db.add(order)
    await db.flush()
    db.add(PaymentOrderItem(order_id=order.id, campaign_id=campaign.id, unit_amount_cents=cents, total_amount_cents=cents))
    db.add(PaymentAttempt(order_id=order.id, provider="vakifkatilim", session_token=uuid.uuid4().hex,
                          response_code="51", response_message="Limit yetersiz", safe_response={"secret": "x"}))
    await db.flush()
    return order


@pytest.mark.asyncio
async def test_list_matches_count_and_hides_secrets(db_session):
    org, admin, crm, campaign, donor = await _setup(db_session)
    other, _, _, other_campaign, other_donor = await _setup(db_session)
    failed = await _order(db_session, org, donor, campaign, PaymentOrderStatus.FAILED, failure_message="Limit yetersiz")
    review = await _order(db_session, org, donor, campaign, PaymentOrderStatus.REVIEW, cents=250000)
    await _order(db_session, org, donor, campaign, PaymentOrderStatus.PAID, cents=20000,
                 at=datetime.now(timezone.utc) + timedelta(seconds=2))
    old = await _order(db_session, org, donor, campaign, PaymentOrderStatus.FAILED,
                       at=datetime.now(timezone.utc) - timedelta(days=40))
    foreign = await _order(db_session, other, other_donor, other_campaign, PaymentOrderStatus.FAILED)

    out = await api.failed_payments(_request(org), period="today", order_id=None, db=db_session, current_user=admin)
    assert {i["id"] for i in out["items"]} == {str(failed.id), str(review.id)}
    inflow = await api.inflow_overview(_request(org), period="today", db=db_session, current_user=admin)
    assert out["total"] == inflow["failed_payments_today"] == 2
    rows = {i["id"]: i for i in out["items"]}
    assert rows[str(failed.id)]["retried_paid"] is True
    assert rows[str(review.id)]["retried_paid"] is False  # a later, different amount is no retry
    assert rows[str(review.id)]["later_payments"][0]["total_cents"] == 20000
    assert rows[str(failed.id)]["donor"]["name"] == "Ali Veli"
    assert rows[str(failed.id)]["items"][0]["campaign_title"] == "Su Kuyusu"
    assert rows[str(failed.id)]["attempts"][0]["response_message"] == "Limit yetersiz"
    assert "safe_response" not in str(out) and "session_token" not in str(out)

    one = await api.failed_payments(_request(org), period="today", order_id=old.id, db=db_session, current_user=admin)
    assert [i["id"] for i in one["items"]] == [str(old.id)]
    none = await api.failed_payments(_request(org), period="today", order_id=foreign.id, db=db_session, current_user=admin)
    assert none["items"] == []
    with pytest.raises(HTTPException) as err:
        await api.failed_payments(_request(org), period="today", order_id=None, db=db_session, current_user=crm)
    assert err.value.status_code == 403


@pytest.mark.asyncio
async def test_channel_items_match_channel_total(db_session):
    org, admin, crm, campaign, donor = await _setup(db_session)
    db_session.add_all([_donation(org, campaign, donor, cents=5000), _donation(org, campaign, donor, cents=7000, issued_by=crm.id),
                        _donation(org, campaign, donor, cents=900, provider="iyzico")])
    await db_session.flush()
    out = await api.inflow_items(_request(org), channel="cash", period="today", db=db_session, current_user=admin)
    assert (out["total"], out["total_cents"]) == (2, 12000)
    mine = await api.inflow_items(_request(org), channel="cash", period="today", db=db_session, current_user=crm)
    assert (mine["total"], mine["total_cents"]) == (1, 7000)


@pytest.mark.asyncio
@pytest.mark.parametrize("tries,status,events", [(2, PaymentOrderStatus.PENDING, 0), (7, PaymentOrderStatus.REVIEW, 1)])
async def test_inquiry_keeps_reason_and_notifies_once(db_session, monkeypatch, tries, status, events):
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app import tasks
    from app.api.v1 import checkout

    org, admin, crm, campaign, donor = await _setup(db_session)
    order = await _order(db_session, org, donor, campaign, PaymentOrderStatus.PENDING, query_attempts=tries,
                         query_next_at=datetime.now(timezone.utc) - timedelta(minutes=1))
    await db_session.commit()

    class Provider:
        async def query(self, *_):
            return PaymentResult(approved=False, merchant_payment_id=order.merchant_payment_id, code="NOTFOUND",
                                 message="Banka bu siparişi bulamadı")

    async def provider(*_):
        return Provider()

    monkeypatch.setattr(checkout, "attempt_provider", provider)
    monkeypatch.setattr(tasks, "AsyncSessionLocal", async_sessionmaker(db_session.bind, expire_on_commit=False))
    await tasks._reconcile_pending_ziraat_payments()
    await tasks._reconcile_pending_ziraat_payments()

    await db_session.refresh(order)
    attempt = (await db_session.execute(select(PaymentAttempt).where(PaymentAttempt.order_id == order.id))).scalar_one()
    await db_session.refresh(attempt)
    assert order.status == status
    assert attempt.response_code == "NOTFOUND" and attempt.completed_at is None
    queued = (await db_session.execute(select(OutboxEvent).where(OutboxEvent.aggregate_id == order.id))).scalars().all()
    assert len(queued) == events


@pytest.mark.asyncio
async def test_donor_segment_list_matches_its_count(db_session):
    from app.api.v1 import reports

    org, admin, crm, campaign, donor = await _setup(db_session)
    donor.total_donations, donor.total_donated_cents = 3, 2_000_000
    donor.last_donation_at = datetime.now(timezone.utc) - timedelta(days=100)
    await db_session.flush()
    segments = (await reports.donor_segments(_request(org), db=db_session))["segments"]
    for segment in segments:
        members = await reports.donor_segment_members(segment["key"], _request(org), db=db_session)
        assert members["total"] == segment["count"] == 1
    with pytest.raises(HTTPException):
        await reports.donor_segment_members("unknown", _request(org), db=db_session)


@pytest.mark.parametrize("token,expired", [("expired", True), ("valid", False), (None, False)])
def test_expired_token_on_platform_host_is_401_not_404(token, expired):
    from starlette.requests import Request
    from app.core.security import create_access_token
    from app.middleware.tenant import TenantMiddleware

    delta = timedelta(minutes=-1 if token == "expired" else 5)
    headers = [(b"authorization", f"Bearer {create_access_token({'sub': str(uuid.uuid4())}, delta)}".encode())] if token else []
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": headers, "query_string": b""})
    assert TenantMiddleware._token_expired(request) is expired
