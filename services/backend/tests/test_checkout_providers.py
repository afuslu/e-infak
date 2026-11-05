"""Checkout through a pluggable provider, end to end against the test database."""
import base64
import hashlib
import hmac
import uuid
from urllib.parse import urlencode

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request

from app.api.v1 import checkout
from app.core.config import settings
from app.models.campaign import Campaign, CampaignStatus
from app.models.donation import Donation, DonationStatus
from app.models.organization import Organization
from app.models.payment import PaymentAttempt, PaymentOrderStatus
from app.payments.providers import paytr
from app.schemas.checkout import CheckoutSessionCreate
from app.services.tenant_credentials import save_credentials


def _request(org=None, method="GET", body: bytes = b"", content_type="application/x-www-form-urlencoded"):
    sent = False

    async def receive():
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    scope = {
        "type": "http", "method": method, "path": "/", "query_string": b"", "scheme": "https",
        "server": ("api.example.org", 443), "client": ("203.0.113.5", 1234),
        "headers": [(b"host", b"api.example.org"), (b"content-type", content_type.encode()), (b"user-agent", b"pytest")],
    }
    request = Request(scope, receive)
    if org is not None:
        request.state.organization = org
        request.state.organization_id = str(org.id)
        request.state.organization_slug = org.slug
    return request


def _sign(key: str, text: str) -> str:
    return base64.b64encode(hmac.new(key.encode(), text.encode(), hashlib.sha256).digest()).decode()


async def test_paytr_checkout_launch_notify_and_refund(db_session, monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "PAYMENT_CALLBACK_BASE_URL", "https://api.example.org")
    slug = f"p-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Deneme Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0,
                       subdomain=slug, settings={"payment_provider": "paytr"})
    db_session.add(org)
    await db_session.flush()
    campaign = Campaign(organization_id=org.id, slug="su", title="Su Kuyusu", summary="s", target_cents=0,
                        status=CampaignStatus.ACTIVE)
    db_session.add(campaign)
    await save_credentials(db_session, org.id, "paytr",
                           {"merchant_id": "123", "merchant_key": "KEY", "merchant_salt": "SALT"}, actor="t")
    await db_session.commit()

    sent = {}

    async def fake_post(self, url, data):
        sent[url] = data
        if url == paytr.TOKEN_URL:
            return {"status": "success", "token": "ptok-" + uuid.uuid4().hex}
        if url == paytr.REFUND_URL:
            return {"status": "success", "merchant_oid": data["merchant_oid"], "return_amount": data["return_amount"]}
        return {"status": "error"}

    monkeypatch.setattr(paytr.PaytrProvider, "_post", fake_post)
    payload = CheckoutSessionCreate(
        items=[{"campaign_id": str(campaign.id), "unit_amount_cents": 25_000}],
        donor={"first_name": "Ayşe", "last_name": "Yılmaz", "email": "ayse@example.com", "phone": "05321112233"},
        idempotency_key=uuid.uuid4().hex, kvkk_accepted=True,
    )
    response = await checkout.create_checkout_session(_request(org, "POST"), payload, db_session, None)
    assert response.redirect_url.startswith("https://api.example.org/api/v1/payments/launch/")
    order = await checkout._load_order(db_session, response.checkout_id)
    assert order.merchant_payment_id.isalnum()
    token_request = sent[paytr.TOKEN_URL]
    assert token_request["merchant_oid"] == order.merchant_payment_id and token_request["payment_amount"] == "25000"
    assert token_request["merchant_ok_url"] == f"https://api.example.org/api/v1/payments/finish/{response.checkout_id}/ok"

    # Launch page embeds only PayTR, with a strict policy
    session_token = response.redirect_url.rsplit("/", 1)[1]
    page = await checkout.launch_payment(session_token, db_session)
    assert "https://www.paytr.com/odeme/guvenli/ptok-" in page.body.decode()
    assert "frame-src 'self' https://www.paytr.com" in page.headers["content-security-policy"]

    # Through the real app: the global security middleware must keep the page's own policy
    import httpx
    from app.main import app
    from app.core.db import engine
    await engine.dispose()  # pooled connections belong to an earlier test's event loop
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://api.example.org") as http:
        launched = await http.get(f"/api/v1/payments/launch/{session_token}")
        finish = await http.get(f"/api/v1/payments/finish/{response.checkout_id}/ok")
    assert launched.status_code == 200 and "frame-src 'self' https://www.paytr.com" in launched.headers["content-security-policy"]
    assert finish.headers["x-frame-options"] == "SAMEORIGIN" and "window.top.location.href" in finish.text
    assert f"/bagis/basarili?checkout={response.checkout_id}" in finish.text

    # Forged notification is rejected; a genuine one pays the order once
    note = {"merchant_oid": order.merchant_payment_id, "status": "success", "total_amount": "25000",
            "payment_amount": "25000", "currency": "TL", "payment_type": "card"}
    with pytest.raises(HTTPException) as exc:
        await checkout.payment_notify("paytr", _request(method="POST", body=urlencode({**note, "hash": "x"}).encode()), db_session)
    assert exc.value.status_code == 400
    note["hash"] = _sign("KEY", order.merchant_payment_id + "SALT" + "success" + "25000")
    for _ in range(2):  # PayTR may repeat a notification
        reply = await checkout.payment_notify("paytr", _request(method="POST", body=urlencode(note).encode()), db_session)
        assert reply.body == b"OK"
    order_id = response.checkout_id
    db_session.expire_all()
    order = await checkout._load_order(db_session, order_id)
    assert order.status == PaymentOrderStatus.PAID
    donations = (await db_session.execute(select(Donation).where(Donation.organization_id == org.id))).scalars().all()
    assert len(donations) == 1 and donations[0].payment_provider == "paytr"
    with pytest.raises(HTTPException):
        await checkout.launch_payment(session_token, db_session)  # completed sessions cannot be relaunched

    # Refund goes to PayTR with the decimal amount and its own token
    from app.models.user import User, UserRole
    staff = User(organization_id=org.id, email=f"muhasebe-{slug}@example.com", hashed_password="x",
                 first_name="Mu", last_name="Hasebe", role=UserRole.MUHASEBE)
    db_session.add(staff)
    await db_session.flush()
    result = await checkout.refund_payment(_request(org, "POST"), order_id, None, db_session, staff)
    refund_request = sent[paytr.REFUND_URL]
    assert result["status"] == "refunded" and refund_request["return_amount"] == "250.00"
    assert refund_request["paytr_token"] == _sign("KEY", "123" + order.merchant_payment_id + "250.00" + "SALT")
    donation = (await db_session.execute(select(Donation).where(Donation.organization_id == org.id))).scalar_one()
    assert donation.status == DonationStatus.REFUNDED


async def test_amount_mismatch_goes_to_review(db_session, monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    slug = f"p-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="D", legal_name=slug, email=f"{slug}@example.com", primary_domain=f"{slug}.x",
                       plan="ileri", enabled_addons=[], extra_user_seats=0, subdomain=slug,
                       settings={"payment_provider": "paytr"})
    db_session.add(org)
    await db_session.flush()
    campaign = Campaign(organization_id=org.id, slug="g", title="G", summary="s", target_cents=0, status=CampaignStatus.ACTIVE)
    db_session.add(campaign)
    await save_credentials(db_session, org.id, "paytr", {"merchant_id": "1", "merchant_key": "K", "merchant_salt": "S"}, actor="t")
    await db_session.commit()

    async def fake_post(self, url, data):
        return {"status": "success", "token": "t-" + uuid.uuid4().hex}

    monkeypatch.setattr(paytr.PaytrProvider, "_post", fake_post)
    payload = CheckoutSessionCreate(
        items=[{"campaign_id": str(campaign.id), "unit_amount_cents": 10_000}],
        donor={"first_name": "Ali", "last_name": "V", "email": "ali@example.com", "phone": "05321112244"},
        idempotency_key=uuid.uuid4().hex, kvkk_accepted=True,
    )
    response = await checkout.create_checkout_session(_request(org, "POST"), payload, db_session, None)
    order = await checkout._load_order(db_session, response.checkout_id)
    note = {"merchant_oid": order.merchant_payment_id, "status": "success", "total_amount": "100",
            "payment_amount": "100", "currency": "TL"}
    note["hash"] = _sign("K", order.merchant_payment_id + "S" + "success" + "100")
    await checkout.payment_notify("paytr", _request(method="POST", body=urlencode(note).encode()), db_session)
    order_id = response.checkout_id
    db_session.expire_all()
    order = await checkout._load_order(db_session, order_id)
    assert order.status == PaymentOrderStatus.REVIEW
    attempt = (await db_session.execute(select(PaymentAttempt).where(PaymentAttempt.order_id == order_id))).scalar_one()
    assert attempt.provider == "paytr"
