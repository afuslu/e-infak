import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import Permission, require_permission
from app.services.donation_hooks import on_donation_cancelled, on_donation_confirmed
from app.services.fx import add_to_campaign, remove_from_campaign
from app.payments import PROVIDERS, build_provider, provider_for, provider_key_for
from app.payments.base import CheckoutContext, CheckoutLine, PaymentProviderError, PaymentResult
from app.services.tenant_credentials import get_credentials
from app.models.kurban import KurbanShare, KurbanStatus
from app.core.config import settings
from app.core.db import get_db
from app.models.campaign import Campaign, CampaignStatus
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderItem, PaymentOrderStatus
from app.models.automation import ConsentRecord, OutboxEvent, PaymentRefund
from app.models.user import User, UserRole
from app.schemas.checkout import (
    CheckoutSessionCreate,
    CheckoutSessionResponse,
    CheckoutStatusItem,
    CheckoutStatusResponse,
)
from app.utils.ziraatpay import ZiraatPayClient
from app.core.rate_limit import rate_limit

router = APIRouter(tags=["checkout"])

ORDER_LOAD_OPTIONS = (
    selectinload(PaymentOrder.items).selectinload(PaymentOrderItem.campaign),
    selectinload(PaymentOrder.attempts),
    selectinload(PaymentOrder.donor),
    selectinload(PaymentOrder.organization),
)


def _callback_base(request: Request) -> str:
    return settings.PAYMENT_CALLBACK_BASE_URL.rstrip("/") or str(request.base_url).rstrip("/")


async def _web_base(db: AsyncSession, organization) -> str:
    if settings.ENVIRONMENT != "production":
        return settings.PUBLIC_WEB_URL.rstrip("/")
    from app.api.v1.site import site_url
    return await site_url(db, organization)


async def attempt_provider(db: AsyncSession, order: PaymentOrder, attempt: PaymentAttempt):
    """The provider an attempt was started with (not necessarily the organisation's current choice)."""
    key = attempt.provider if attempt.provider in PROVIDERS else provider_key_for(order.organization)
    credentials = await get_credentials(db, order.organization_id, key)
    return build_provider(key, credentials, tenant_slug=order.organization.slug)


def apply_result(attempt: PaymentAttempt, result: PaymentResult) -> None:
    attempt.safe_response = result.safe_response
    attempt.response_code = (result.code or ("00" if result.approved else None) or "")[:16] or None
    attempt.response_message = (result.message or "")[:500] or None
    attempt.pg_tran_id = (result.provider_transaction_id or "")[:64] or attempt.pg_tran_id
    attempt.card_last_4 = result.card_last_4 or attempt.card_last_4
    attempt.card_brand = (result.card_brand or "")[:32] or attempt.card_brand
    attempt.completed_at = datetime.now(timezone.utc)


def result_matches_order(order: PaymentOrder, result: PaymentResult) -> bool:
    if result.amount_cents is not None and result.amount_cents != order.total_cents:
        return False
    if result.currency and result.currency != order.currency:
        return False
    return True


def _receipt_number(org_id: UUID) -> str:
    return f"BG-{str(org_id)[:6].upper()}-{datetime.now():%Y%m%d}-{secrets.token_hex(4).upper()}"


async def _get_or_create_donor(org_id: UUID, payload, db: AsyncSession) -> Donor:
    result = await db.execute(
        select(Donor).where(
            Donor.organization_id == org_id,
            (Donor.email == str(payload.email)) | (Donor.phone == payload.phone),
        )
    )
    donor = result.scalars().first()
    values = payload.model_dump()
    values["email"] = str(values["email"])
    if donor:
        for key, value in values.items():
            setattr(donor, key, value)
        return donor
    donor = Donor(organization_id=org_id, donor_type="individual", **values)
    db.add(donor)
    await db.flush()
    return donor


async def _load_order(db: AsyncSession, checkout_id: UUID) -> PaymentOrder | None:
    result = await db.execute(
        select(PaymentOrder)
        .options(
            selectinload(PaymentOrder.items).selectinload(PaymentOrderItem.campaign),
            selectinload(PaymentOrder.attempts),
            selectinload(PaymentOrder.donor),
            selectinload(PaymentOrder.organization),
        )
        .where(PaymentOrder.id == checkout_id)
    )
    return result.scalar_one_or_none()


async def _finalize_paid_order(
    db: AsyncSession,
    order: PaymentOrder,
    attempt: PaymentAttempt,
    commit: bool = True,
    issued_by_id: UUID | None = None,
) -> list[str]:
    if order.status == PaymentOrderStatus.PAID:
        result = await db.execute(
            select(Donation.id).where(
                Donation.payment_order_item_id.in_([item.id for item in order.items])
            )
        )
        return [str(row[0]) for row in result.all()]

    order.status = PaymentOrderStatus.PROCESSING
    await db.flush()
    donation_ids: list[str] = []
    now = datetime.now(timezone.utc)
    for item in order.items:
        existing = await db.execute(
            select(Donation).where(Donation.payment_order_item_id == item.id)
        )
        if existing.scalar_one_or_none():
            continue
        donation = Donation(
            # Assigned here (not at flush) because the outbox events below reference it.
            id=uuid4(),
            organization_id=order.organization_id,
            campaign_id=item.campaign_id,
            donor_id=order.donor_id,
            receipt_number=_receipt_number(order.organization_id),
            amount_cents=item.total_amount_cents,
            currency=order.currency,
            payment_method=PaymentMethod(order.payment_method),
            status=DonationStatus.CONFIRMED,
            transaction_id=attempt.pg_tran_id,
            payment_provider=attempt.provider,
            payment_details=attempt.safe_response,
            card_last_4=attempt.card_last_4,
            card_brand=attempt.card_brand,
            paid_at=now,
            donor_message=item.donor_message,
            on_behalf_of=(item.metadata_json or {}).get("on_behalf_of"),
            is_anonymous=order.donor.is_anonymous,
            idempotency_key=f"{order.idempotency_key}:{item.id}",
            payment_order_item_id=item.id,
            issued_by_id=issued_by_id,
        )
        db.add(donation)
        db.add(
            OutboxEvent(
                organization_id=order.organization_id,
                aggregate_type="donation",
                aggregate_id=donation.id,
                event_type="receipt.send",
                payload={
                    "donation_id": str(donation.id),
                    "order_id": str(order.id),
                    "receipt_number": donation.receipt_number,
                },
            )
        )
        db.add(
            OutboxEvent(
                organization_id=order.organization_id,
                aggregate_type="donation",
                aggregate_id=donation.id,
                event_type="webhook.donation.paid",
                payload={"donation_id": str(donation.id), "order_id": str(order.id)},
            )
        )
        await db.flush()
        await add_to_campaign(db, donation, item.campaign)
        await on_donation_confirmed(
            db, donation, order.donor, quantity=item.quantity, metadata=item.metadata_json or {},
        )
        donation_ids.append(str(donation.id))

    donor = order.donor
    donor.total_donations += len(order.items)
    donor.total_donated_cents += order.total_cents
    donor.last_donation_at = now
    donor.first_donation_at = donor.first_donation_at or now
    order.status = PaymentOrderStatus.PAID
    order.paid_at = now
    db.add(
        OutboxEvent(
            organization_id=order.organization_id,
            aggregate_type="payment_order",
            aggregate_id=order.id,
            event_type="payment.paid",
            payload={"order_id": str(order.id), "total_cents": order.total_cents, "currency": order.currency},
        )
    )
    if commit:
        await db.commit()
    else:
        await db.flush()
    return donation_ids


@router.post("/checkout/sessions", response_model=CheckoutSessionResponse, status_code=201)
async def create_checkout_session(
    request: Request,
    payload: CheckoutSessionCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("checkout", limit=10, window_seconds=300)),
):
    org_id = UUID(request.state.organization_id)
    organization = request.state.organization
    enabled_currencies = (organization.settings or {}).get("enabled_payment_currencies", ["TRY"])
    if payload.currency not in enabled_currencies:
        raise HTTPException(
            status_code=400,
            detail=f"{payload.currency} tahsilatı bu kurumun banka hesabında etkin değil",
        )
    if payload.payment_method == "credit_card":
        provider_class = PROVIDERS[provider_key_for(organization)]
        if payload.currency not in provider_class.currencies:
            raise HTTPException(status_code=400, detail=f"{payload.currency} {provider_class.label} ile alınamıyor")
    existing = await db.execute(
        select(PaymentOrder).where(
            PaymentOrder.organization_id == org_id,
            PaymentOrder.idempotency_key == payload.idempotency_key,
        )
    )
    previous = existing.scalar_one_or_none()
    if previous:
        attempt_result = await db.execute(
            select(PaymentAttempt)
            .where(PaymentAttempt.order_id == previous.id)
            .order_by(PaymentAttempt.created_at.desc())
        )
        attempt = attempt_result.scalars().first()
        return CheckoutSessionResponse(
            checkout_id=previous.id,
            status=previous.status.value,
            redirect_url=_attempt_redirect(request, attempt),
            transfer_reference=previous.transfer_reference,
            bank_name=request.state.organization.bank_name,
            iban=request.state.organization.iban,
            account_holder=request.state.organization.account_holder,
        )

    campaign_ids = {item.campaign_id for item in payload.items}
    result = await db.execute(
        select(Campaign).where(
            Campaign.id.in_(campaign_ids),
            Campaign.organization_id == org_id,
            Campaign.status == CampaignStatus.ACTIVE,
        )
    )
    campaigns = {campaign.id: campaign for campaign in result.scalars().all()}
    if len(campaigns) != len(campaign_ids):
        raise HTTPException(status_code=400, detail="Sepette geçersiz veya pasif kampanya var")

    total_cents = 0
    for item in payload.items:
        campaign = campaigns[item.campaign_id]
        if item.unit_amount_cents < campaign.min_donation_cents:
            raise HTTPException(status_code=400, detail=f"{campaign.title} için minimum tutar karşılanmıyor")
        if len(json.dumps(item.metadata, ensure_ascii=False)) > 10_000:
            raise HTTPException(status_code=400, detail="Kampanya ek bilgileri çok büyük")
        for field in campaign.checkout_fields_schema or []:
            key = field.get("key")
            value = item.metadata.get(key) if key else None
            if field.get("required") and value in (None, "", []):
                raise HTTPException(
                    status_code=400,
                    detail=f"{campaign.title}: {field.get('label', key)} alanı zorunludur",
                )
            if value is not None and field.get("type") == "list" and not isinstance(value, list):
                raise HTTPException(status_code=400, detail=f"{campaign.title}: {key} liste olmalıdır")
        total_cents += item.unit_amount_cents * item.quantity

    donor = await _get_or_create_donor(org_id, payload.donor, db)
    for consent_type, granted in (
        ("kvkk_notice", payload.kvkk_accepted),
        ("distance_contract", payload.terms_accepted),
        ("email_marketing", payload.donor.allow_email),
        ("sms_marketing", payload.donor.allow_sms),
    ):
        db.add(
            ConsentRecord(
                organization_id=org_id,
                donor_id=donor.id,
                consent_type=consent_type,
                granted=granted,
                document_version=payload.consent_version,
                locale=payload.locale,
                source="checkout",
                ip_address=request.client.host if request.client else None,
            )
        )
    merchant_payment_id = f"EINF{org_id.hex[:6]}{uuid4().hex[:20]}".upper()
    order = PaymentOrder(
        organization_id=org_id,
        donor_id=donor.id,
        merchant_payment_id=merchant_payment_id,
        idempotency_key=payload.idempotency_key,
        payment_method=payload.payment_method,
        status=(
            PaymentOrderStatus.AWAITING_TRANSFER
            if payload.payment_method == "bank_transfer"
            else PaymentOrderStatus.PENDING
        ),
        total_cents=total_cents,
        currency=payload.currency,
        locale=payload.locale,
        consent_version=payload.consent_version,
        query_next_at=(
            datetime.now(timezone.utc) + timedelta(seconds=90)
            if payload.payment_method == "credit_card"
            else None
        ),
        transfer_reference=(
            f"HVL-{secrets.token_hex(4).upper()}"
            if payload.payment_method == "bank_transfer"
            else None
        ),
    )
    db.add(order)
    await db.flush()
    for item in payload.items:
        db.add(
            PaymentOrderItem(
                order_id=order.id,
                campaign_id=item.campaign_id,
                quantity=item.quantity,
                unit_amount_cents=item.unit_amount_cents,
                total_amount_cents=item.unit_amount_cents * item.quantity,
                donor_message=item.donor_message,
                metadata_json={**item.metadata, **({"on_behalf_of": item.on_behalf_of} if item.on_behalf_of else {})},
            )
        )

    if payload.payment_method == "bank_transfer":
        await db.commit()
        organization = request.state.organization
        return CheckoutSessionResponse(
            checkout_id=order.id,
            status=order.status.value,
            transfer_reference=order.transfer_reference,
            bank_name=organization.bank_name,
            iban=organization.iban,
            account_holder=organization.account_holder,
        )

    provider = await provider_for(db, organization)
    callback_base = _callback_base(request)
    ctx = CheckoutContext(
        merchant_payment_id=merchant_payment_id,
        total_cents=total_cents,
        currency=payload.currency,
        locale=payload.locale,
        lines=[
            CheckoutLine(name=campaigns[item.campaign_id].title, quantity=item.quantity,
                         unit_cents=item.unit_amount_cents, product_code=str(item.campaign_id))
            for item in payload.items
        ],
        customer_id=str(donor.id),
        customer_first_name=donor.first_name,
        customer_last_name=donor.last_name or "",
        customer_email=donor.email or "",
        customer_phone=donor.phone or "",
        customer_ip=request.client.host if request.client else "127.0.0.1",
        user_agent=request.headers.get("user-agent", ""),
        return_url=f"{callback_base}/api/v1/payments/{provider.key}/return",
        notify_url=f"{callback_base}/api/v1/payments/{provider.key}/notify",
        # Providers shown in a frame return the browser here; the finish page leaves the frame.
        success_url=f"{callback_base}/api/v1/payments/finish/{order.id}/ok",
        fail_url=f"{callback_base}/api/v1/payments/finish/{order.id}/fail",
    )
    try:
        started = await provider.start(ctx)
    except PaymentProviderError as exc:
        await db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    redirect_url = started.redirect_url or f"{callback_base}/api/v1/payments/launch/{started.session_token}"
    launch = None
    if not started.redirect_url:
        launch = {"action": started.post_action, "fields": started.post_fields, "iframe": started.iframe_url}
    attempt = PaymentAttempt(
        order_id=order.id,
        provider=provider.key,
        session_token=started.session_token,
        response_code=started.safe_response.get("responseCode"),
        response_message=started.safe_response.get("responseMsg"),
        safe_response={**started.safe_response, "redirect_url": redirect_url, **({"launch": launch} if launch else {})},
    )
    db.add(attempt)
    await db.commit()
    return CheckoutSessionResponse(
        checkout_id=order.id,
        status=order.status.value,
        redirect_url=redirect_url,
        expires_at=started.expires_at,
    )


def _attempt_redirect(request: Request, attempt: PaymentAttempt | None) -> str | None:
    if not attempt or not attempt.session_token:
        return None
    stored = (attempt.safe_response or {}).get("redirect_url")
    if stored:
        return stored
    if attempt.provider == "ziraatpay":  # attempts created before providers were pluggable
        return ZiraatPayClient(request.state.organization_slug).payment_url(attempt.session_token)
    return None


LAUNCH_PAGE = """<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Güvenli ödeme</title><style>body{{margin:0;font-family:system-ui,sans-serif;background:#f6f7f9;color:#222}}
main{{max-width:760px;margin:0 auto;padding:16px}}p{{text-align:center}}iframe{{width:100%;min-height:640px;border:0;background:#fff;border-radius:12px}}
button{{display:block;margin:12px auto;padding:10px 18px;border:0;border-radius:8px;background:#059669;color:#fff;font-weight:600}}</style>
</head><body><main>{body}</main>{script}</body></html>"""


@router.get("/payments/launch/{session_token}", response_class=HTMLResponse)
async def launch_payment(session_token: str, db: AsyncSession = Depends(get_db)):
    """Hands the browser to providers that need a posted form or an embedded page."""
    import html as html_lib

    attempt = (await db.execute(
        select(PaymentAttempt).where(PaymentAttempt.session_token == session_token)
    )).scalar_one_or_none()
    launch = (attempt.safe_response or {}).get("launch") if attempt else None
    if not attempt or not launch or attempt.completed_at:
        raise HTTPException(status_code=404, detail="Ödeme oturumu bulunamadı veya tamamlandı")
    order = await _load_order(db, attempt.order_id)
    if not order or order.status != PaymentOrderStatus.PENDING:
        raise HTTPException(status_code=404, detail="Ödeme oturumu bulunamadı veya tamamlandı")
    provider_class = PROVIDERS.get(attempt.provider)
    nonce = secrets.token_urlsafe(16)
    csp = ["default-src 'none'", "style-src 'unsafe-inline'", f"script-src 'nonce-{nonce}'", "base-uri 'none'",
           "frame-ancestors 'none'"]
    if launch.get("iframe"):
        frame_hosts = " ".join(["'self'", *(getattr(provider_class, "frame_hosts", ()) or ())])
        body = f'<iframe src="{html_lib.escape(launch["iframe"])}" title="Ödeme"></iframe>'
        script = ""
        csp += [f"frame-src {frame_hosts}", "form-action 'none'"]
    else:
        action = launch.get("action") or ""
        inputs = "".join(
            f'<input type="hidden" name="{html_lib.escape(str(k))}" value="{html_lib.escape(str(v))}">'
            for k, v in (launch.get("fields") or {}).items()
        )
        body = (f'<form id="pay" method="post" action="{html_lib.escape(action)}">{inputs}'
                '<p>Bankanın güvenli ödeme sayfasına yönlendiriliyorsunuz…</p>'
                '<noscript><button type="submit">Devam et</button></noscript></form>')
        script = f'<script nonce="{nonce}">document.getElementById("pay").submit()</script>'
        from urllib.parse import urlsplit
        target = urlsplit(action)
        csp.append(f"form-action {target.scheme}://{target.netloc}")
    return HTMLResponse(
        LAUNCH_PAGE.format(body=body, script=script),
        headers={"Content-Security-Policy": "; ".join(csp), "Cache-Control": "no-store",
                 "Referrer-Policy": "no-referrer"},
    )


@router.get("/payments/finish/{checkout_id}/{outcome}", response_class=HTMLResponse)
async def finish_payment(checkout_id: UUID, outcome: str, db: AsyncSession = Depends(get_db)):
    """Provider's browser return for framed payment pages: open the result page in the top window.

    The outcome only picks the page; the page itself shows the verified status.
    """
    import html as html_lib

    order = await _load_order(db, checkout_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    web_base = await _web_base(db, order.organization)
    target = f"{web_base}/bagis/{'basarili' if outcome == 'ok' else 'hata'}?checkout={order.id}"
    nonce = secrets.token_urlsafe(16)
    body = (f'<p><a href="{html_lib.escape(target)}" target="_top">Devam et</a></p>'
            f'<script nonce="{nonce}">window.top.location.href = {json.dumps(target)}</script>')
    return HTMLResponse(
        LAUNCH_PAGE.format(body=body, script=""),
        headers={"Content-Security-Policy": f"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'; "
                                            "frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
                 "X-Frame-Options": "SAMEORIGIN", "Cache-Control": "no-store"},
    )


async def _order_for_callback(db: AsyncSession, provider_key: str, data: dict) -> tuple[PaymentOrder, PaymentAttempt]:
    provider_class = PROVIDERS.get(provider_key)
    if not provider_class:
        raise HTTPException(status_code=404, detail="Bilinmeyen ödeme sağlayıcısı")
    merchant_payment_id, token = provider_class.callback_reference(data)
    query = select(PaymentOrder).options(*ORDER_LOAD_OPTIONS)
    if merchant_payment_id:
        query = query.where(PaymentOrder.merchant_payment_id == str(merchant_payment_id)[:128])
    elif token:
        query = query.join(PaymentAttempt, PaymentAttempt.order_id == PaymentOrder.id).where(
            PaymentAttempt.session_token == str(token)[:64], PaymentAttempt.provider == provider_key,
        )
    else:
        raise HTTPException(status_code=400, detail="Ödeme referansı eksik")
    order = (await db.execute(query)).scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Ödeme siparişi bulunamadı")
    attempts = [a for a in order.attempts if a.provider == provider_key]
    attempt = next((a for a in attempts if token and a.session_token == token), None) or (
        max(attempts, key=lambda a: a.created_at) if attempts else None
    )
    if not attempt:
        raise HTTPException(status_code=400, detail="Ödeme denemesi bulunamadı")
    return order, attempt


async def _settle(db: AsyncSession, provider_key: str, data: dict) -> tuple[PaymentOrder, bool]:
    """Verify a provider callback and record its outcome. Returns (order, paid)."""
    order, attempt = await _order_for_callback(db, provider_key, data)
    provider = await attempt_provider(db, order, attempt)
    try:
        result = await provider.parse_callback(data, attempt.session_token if provider_key != "nestpay" else None)
    except PaymentProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if result.merchant_payment_id and result.merchant_payment_id != order.merchant_payment_id:
        raise HTTPException(status_code=400, detail="Ödeme siparişi eşleşmiyor")
    if order.status == PaymentOrderStatus.PAID:
        return order, True
    if order.status not in (PaymentOrderStatus.PENDING, PaymentOrderStatus.REVIEW, PaymentOrderStatus.FAILED):
        return order, False
    apply_result(attempt, result)
    if result.approved and result_matches_order(order, result):
        await _finalize_paid_order(db, order, attempt)
        return order, True
    if result.approved:
        order.status = PaymentOrderStatus.REVIEW
        order.failure_message = "Ödeme onaylandı ancak tutar/para birimi siparişle eşleşmiyor; manuel inceleme gerekli"
        order.query_next_at = None
    elif order.status != PaymentOrderStatus.FAILED:
        order.status = PaymentOrderStatus.FAILED
        order.failure_code = (result.code or "")[:64] or None
        order.failure_message = result.message or "Ödeme banka tarafından onaylanmadı"
    await db.commit()
    return order, False


@router.api_route("/payments/{provider_key}/return", methods=["GET", "POST"])
async def payment_return(provider_key: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Browser return from the provider's payment page."""
    data = dict(await request.form()) if request.method == "POST" else dict(request.query_params)
    order, paid = await _settle(db, provider_key, data)
    web_base = await _web_base(db, order.organization)
    page = "basarili" if paid else "hata"
    return RedirectResponse(f"{web_base}/bagis/{page}?checkout={order.id}", status_code=303)


@router.post("/payments/{provider_key}/notify")
async def payment_notify(provider_key: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Server-to-server payment notification (PayTR)."""
    provider_class = PROVIDERS.get(provider_key)
    if not provider_class or not provider_class.uses_notification:
        raise HTTPException(status_code=404, detail="Bu sağlayıcı bildirim kullanmıyor")
    data = dict(await request.form())
    order, paid = await _settle(db, provider_key, data)
    reply = provider_class.notification_reply(paid)
    return Response(content=reply.body, media_type=reply.media_type)


@router.get("/checkout/{checkout_id}/status", response_model=CheckoutStatusResponse)
async def checkout_status(
    request: Request,
    checkout_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    order = await _load_order(db, checkout_id)
    if not order or str(order.organization_id) != request.state.organization_id:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    donation_result = await db.execute(
        select(Donation).where(
            Donation.payment_order_item_id.in_([item.id for item in order.items])
        )
    )
    receipts = {d.payment_order_item_id: d.receipt_number for d in donation_result.scalars().all()}
    return CheckoutStatusResponse(
        checkout_id=order.id,
        status=order.status.value,
        total_cents=order.total_cents,
        currency=order.currency,
        transfer_reference=order.transfer_reference,
        failure_message=order.failure_message,
        refunded_cents=order.refunded_cents,
        items=[
            CheckoutStatusItem(
                campaign_id=item.campaign_id,
                campaign_title=item.campaign.title,
                quantity=item.quantity,
                total_amount_cents=item.total_amount_cents,
                receipt_number=receipts.get(item.id),
            )
            for item in order.items
        ],
    )


@router.post("/admin/payments/{checkout_id}/refund")
async def refund_payment(
    request: Request,
    checkout_id: UUID,
    amount_cents: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    order = await _load_order(db, checkout_id)
    if not order or str(order.organization_id) != request.state.organization_id:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    if order.status not in (PaymentOrderStatus.PAID, PaymentOrderStatus.PARTIALLY_REFUNDED):
        raise HTTPException(status_code=409, detail="Yalnızca tamamlanan ödeme iade edilebilir")
    attempt = next((item for item in order.attempts if item.pg_tran_id and item.provider != "bank_transfer"), None)
    if not attempt:
        raise HTTPException(status_code=409, detail="Banka işlem numarası bulunamadı")
    remaining_cents = order.total_cents - order.refunded_cents
    cents = amount_cents or remaining_cents
    if cents <= 0 or cents > remaining_cents:
        raise HTTPException(status_code=400, detail="Geçersiz iade tutarı")
    # Check before calling the bank: a refund cannot be undone, a slaughtered kurban neither.
    slaughtered = (await db.execute(
        select(KurbanShare.id).join(Donation, Donation.id == KurbanShare.donation_id).where(
            Donation.payment_order_item_id.in_([item.id for item in order.items]),
            KurbanShare.status == KurbanStatus.SLAUGHTERED,
        )
    )).first()
    if slaughtered:
        raise HTTPException(status_code=409, detail="Bu ödemeye ait kurban kesilmiş; iade yapılamaz")
    provider = await attempt_provider(db, order, attempt)
    try:
        outcome = await provider.refund(
            merchant_payment_id=order.merchant_payment_id,
            provider_transaction_id=attempt.pg_tran_id,
            amount_cents=cents,
            currency=order.currency,
            customer_ip=request.client.host if request.client else "127.0.0.1",
        )
    except PaymentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    refund = PaymentRefund(
        organization_id=order.organization_id,
        payment_order_id=order.id,
        amount_cents=cents,
        status="pending",
        requested_by_id=current_user.id,
    )
    db.add(refund)
    if not outcome.ok:
        refund.status = "failed"
        refund.failure_message = outcome.message
        await db.commit()
        raise HTTPException(status_code=502, detail=outcome.message or "Banka iadeyi reddetti")
    refund.status = "completed"
    refund.provider_transaction_id = outcome.provider_transaction_id
    refund.completed_at = datetime.now(timezone.utc)
    order.refunded_cents += cents
    if order.refunded_cents == order.total_cents:
        order.status = PaymentOrderStatus.REFUNDED
        donation_result = await db.execute(
            select(Donation).where(Donation.payment_order_item_id.in_([item.id for item in order.items]))
        )
        for donation in donation_result.scalars().all():
            donation.status = DonationStatus.REFUNDED
            donation.refunded_at = datetime.now(timezone.utc)
            await on_donation_cancelled(db, donation)
            refunded_campaign = await db.get(Campaign, donation.campaign_id)
            if refunded_campaign:
                remove_from_campaign(donation, refunded_campaign)
    else:
        order.status = PaymentOrderStatus.PARTIALLY_REFUNDED
    db.add(
        OutboxEvent(
            organization_id=order.organization_id,
            aggregate_type="payment_order",
            aggregate_id=order.id,
            event_type="payment.refunded",
            payload={"order_id": str(order.id), "amount_cents": cents},
        )
    )
    await db.commit()
    return {"status": "refunded", "amount_cents": cents, "pg_tran_id": outcome.provider_transaction_id}


@router.post("/admin/payments/{checkout_id}/reconcile")
async def reconcile_payment(
    request: Request,
    checkout_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    order = await _load_order(db, checkout_id)
    if not order or str(order.organization_id) != request.state.organization_id:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    if order.status == PaymentOrderStatus.PAID:
        return {"status": "paid", "message": "Ödeme daha önce doğrulandı"}
    attempt = next((item for item in sorted(order.attempts, key=lambda a: a.created_at, reverse=True)
                    if item.session_token), None)
    if not attempt:
        raise HTTPException(status_code=409, detail="Ödeme denemesi bulunamadı")
    provider = await attempt_provider(db, order, attempt)
    try:
        result = await provider.query(order.merchant_payment_id, order.total_cents, order.currency)
    except PaymentProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if result is None:
        return {"status": order.status.value, "message": f"{provider.label} ödeme sorgulamayı desteklemiyor"}
    if not result.approved or not result_matches_order(order, result):
        return {"status": order.status.value, "message": "Bankada onaylı ve tutarı eşleşen işlem bulunamadı"}
    apply_result(attempt, result)
    donation_ids = await _finalize_paid_order(db, order, attempt)
    return {"status": "paid", "donation_count": len(donation_ids)}


@router.post("/admin/payments/{checkout_id}/confirm-transfer")
async def confirm_bank_transfer(
    request: Request,
    checkout_id: UUID,
    bank_transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.FINANCE_MANAGE)),
):
    order = await _load_order(db, checkout_id)
    if not order or str(order.organization_id) != request.state.organization_id:
        raise HTTPException(status_code=404, detail="Havale kaydı bulunamadı")
    if order.payment_method != "bank_transfer":
        raise HTTPException(status_code=409, detail="Bu sipariş havale/EFT değildir")
    if order.status == PaymentOrderStatus.PAID:
        return {"status": "paid", "message": "Havale daha önce eşleştirildi"}
    attempt = PaymentAttempt(
        order_id=order.id,
        provider="bank_transfer",
        pg_tran_id=bank_transaction_id,
        response_code="00",
        response_message="Banka hareketi muhasebe tarafından eşleştirildi",
        safe_response={"bank_transaction_id": bank_transaction_id, "matched_by": str(current_user.id)},
    )
    db.add(attempt)
    await db.flush()
    donation_ids = await _finalize_paid_order(db, order, attempt, issued_by_id=current_user.id)
    return {"status": "paid", "donation_count": len(donation_ids)}
