import json
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import require_role
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
from app.utils.ziraatpay import ZiraatPayClient, ZiraatPayError

router = APIRouter(tags=["checkout"])


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
            is_anonymous=order.donor.is_anonymous,
            idempotency_key=f"{order.idempotency_key}:{item.id}",
            payment_order_item_id=item.id,
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
        item.campaign.collected_cents += item.total_amount_cents
        await db.flush()
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
):
    org_id = UUID(request.state.organization_id)
    organization = request.state.organization
    enabled_currencies = (organization.settings or {}).get("enabled_payment_currencies", ["TRY"])
    if payload.currency not in enabled_currencies:
        raise HTTPException(
            status_code=400,
            detail=f"{payload.currency} tahsilatı bu kurumun banka hesabında etkin değil",
        )
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
            redirect_url=ZiraatPayClient(request.state.organization_slug).payment_url(attempt.session_token) if attempt and attempt.session_token else None,
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
    merchant_payment_id = f"EINF-{str(org_id)[:6]}-{uuid4().hex[:20]}".upper()
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
                metadata_json=item.metadata,
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

    ziraat = ZiraatPayClient(request.state.organization_slug)
    return_url = f"{str(request.base_url).rstrip('/')}/api/v1/payments/ziraatpay/return"
    order_items = json.dumps(
        [
            {
                "productCode": str(item.campaign_id),
                "name": campaigns[item.campaign_id].title[:128],
                "quantity": item.quantity,
                "amount": f"{Decimal(item.unit_amount_cents) / 100:.2f}",
            }
            for item in payload.items
        ],
        ensure_ascii=False,
    )
    try:
        session = await ziraat.create_payment_session(
            merchant_payment_id=merchant_payment_id,
            amount=f"{Decimal(total_cents) / 100:.2f}",
            currency=payload.currency,
            customer_id=str(donor.id),
            customer_name=donor.full_name,
            customer_email=donor.email,
            customer_phone=donor.phone,
            customer_ip=request.client.host if request.client else "127.0.0.1",
            user_agent=request.headers.get("user-agent", ""),
            return_url=return_url,
            order_items=order_items,
        )
    except ZiraatPayError as exc:
        await db.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    attempt = PaymentAttempt(
        order_id=order.id,
        session_token=session["sessionToken"],
        response_code=session.get("responseCode"),
        response_message=session.get("responseMsg"),
        safe_response={"responseCode": session.get("responseCode"), "responseMsg": session.get("responseMsg")},
    )
    db.add(attempt)
    await db.commit()
    return CheckoutSessionResponse(
        checkout_id=order.id,
        status=order.status.value,
        redirect_url=ziraat.payment_url(session["sessionToken"]),
        expires_at=session.get("expiryDate"),
    )


@router.post("/payments/ziraatpay/return")
async def ziraatpay_return(request: Request, db: AsyncSession = Depends(get_db)):
    data = dict(await request.form())
    merchant_payment_id = data.get("merchantPaymentId")
    if not merchant_payment_id:
        raise HTTPException(status_code=400, detail="merchantPaymentId eksik")
    result = await db.execute(
        select(PaymentOrder)
        .options(
            selectinload(PaymentOrder.items).selectinload(PaymentOrderItem.campaign),
            selectinload(PaymentOrder.attempts),
            selectinload(PaymentOrder.donor),
            selectinload(PaymentOrder.organization),
        )
        .where(PaymentOrder.merchant_payment_id == merchant_payment_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Ödeme siparişi bulunamadı")

    ziraat = ZiraatPayClient(order.organization.slug)
    attempt = next((a for a in order.attempts if a.session_token == data.get("sessionToken")), None)
    if not attempt or not ziraat.verify_callback(data):
        raise HTTPException(status_code=400, detail="Geçersiz ödeme imzası")

    attempt.safe_response = ziraat.safe_callback(data)
    attempt.response_code = data.get("responseCode")
    attempt.response_message = data.get("responseMsg")
    attempt.pg_tran_id = data.get("pgTranId")
    attempt.card_last_4 = data.get("panLast4")
    attempt.card_brand = data.get("paymentSystemType")
    attempt.completed_at = datetime.now(timezone.utc)

    if data.get("responseCode") == "00":
        donation_ids = await _finalize_paid_order(db, order, attempt)
        web_base = settings.PUBLIC_WEB_URL.rstrip("/") if settings.ENVIRONMENT != "production" else f"https://{order.organization.primary_domain}"
        return RedirectResponse(
            f"{web_base}/bagis/basarili?checkout={order.id}",
            status_code=303,
        )

    order.status = PaymentOrderStatus.FAILED
    order.failure_code = data.get("responseCode")
    order.failure_message = data.get("responseMsg") or "Ödeme banka tarafından onaylanmadı"
    await db.commit()
    web_base = settings.PUBLIC_WEB_URL.rstrip("/") if settings.ENVIRONMENT != "production" else f"https://{order.organization.primary_domain}"
    return RedirectResponse(
        f"{web_base}/bagis/hata?checkout={order.id}",
        status_code=303,
    )


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
    current_user: User = Depends(require_role(UserRole.STK_ADMIN, UserRole.MUHASEBE)),
):
    order = await _load_order(db, checkout_id)
    if not order or str(order.organization_id) != request.state.organization_id:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    if order.status not in (PaymentOrderStatus.PAID, PaymentOrderStatus.PARTIALLY_REFUNDED):
        raise HTTPException(status_code=409, detail="Yalnızca tamamlanan ödeme iade edilebilir")
    attempt = next((item for item in order.attempts if item.pg_tran_id), None)
    if not attempt:
        raise HTTPException(status_code=409, detail="Banka işlem numarası bulunamadı")
    remaining_cents = order.total_cents - order.refunded_cents
    cents = amount_cents or remaining_cents
    if cents <= 0 or cents > remaining_cents:
        raise HTTPException(status_code=400, detail="Geçersiz iade tutarı")
    response = await ZiraatPayClient(order.organization.slug).refund(
        attempt.pg_tran_id,
        f"{Decimal(cents) / 100:.2f}",
        order.currency,
    )
    refund = PaymentRefund(
        organization_id=order.organization_id,
        payment_order_id=order.id,
        amount_cents=cents,
        status="pending",
        requested_by_id=current_user.id,
    )
    db.add(refund)
    if response.get("responseCode") != "00":
        refund.status = "failed"
        refund.failure_message = response.get("responseMsg")
        await db.commit()
        raise HTTPException(status_code=502, detail=response.get("responseMsg") or "Banka iadeyi reddetti")
    refund.status = "completed"
    refund.provider_transaction_id = response.get("pgTranId")
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
    return {"status": "refunded", "amount_cents": cents, "pg_tran_id": response.get("pgTranId")}


@router.post("/admin/payments/{checkout_id}/reconcile")
async def reconcile_payment(
    request: Request,
    checkout_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.STK_ADMIN, UserRole.MUHASEBE)),
):
    order = await _load_order(db, checkout_id)
    if not order or str(order.organization_id) != request.state.organization_id:
        raise HTTPException(status_code=404, detail="Ödeme bulunamadı")
    if order.status == PaymentOrderStatus.PAID:
        return {"status": "paid", "message": "Ödeme daha önce doğrulandı"}
    response = await ZiraatPayClient(order.organization.slug).query_transaction(order.merchant_payment_id)
    transactions = response.get("transactionList") or []
    approved = next(
        (
            tx for tx in transactions
            if tx.get("transactionStatus") == "AP"
            and round(float(tx.get("amount", 0)) * 100) == order.total_cents
            and tx.get("currency") == order.currency
        ),
        None,
    )
    if not approved:
        return {"status": order.status.value, "message": "Bankada onaylı ve tutarı eşleşen işlem bulunamadı"}
    attempt = next((item for item in order.attempts if item.session_token), None)
    if not attempt:
        raise HTTPException(status_code=409, detail="Ödeme denemesi bulunamadı")
    attempt.pg_tran_id = approved.get("pgTranId")
    attempt.response_code = approved.get("pgTranReturnCode")
    attempt.card_last_4 = approved.get("panLast4")
    attempt.card_brand = approved.get("paymentSystemType")
    attempt.safe_response = ZiraatPayClient(order.organization.slug).safe_callback(approved)
    donation_ids = await _finalize_paid_order(db, order, attempt)
    return {"status": "paid", "donation_count": len(donation_ids)}


@router.post("/admin/payments/{checkout_id}/confirm-transfer")
async def confirm_bank_transfer(
    request: Request,
    checkout_id: UUID,
    bank_transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.STK_ADMIN, UserRole.MUHASEBE)),
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
    donation_ids = await _finalize_paid_order(db, order, attempt)
    return {"status": "paid", "donation_count": len(donation_ids)}
