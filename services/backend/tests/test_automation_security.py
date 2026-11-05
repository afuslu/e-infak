import asyncio
import hashlib
import hmac
import time
import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.api.deps import Permission, ROLE_PERMISSIONS
from app.api.v1.reconciliation import _amount_to_cents, _normalize_row
from app.core.config import Settings, settings
from app.api.v1.admin_features import OrgSettingsUpdate
from app.middleware.tenant import TenantMiddleware
from app.models.user import UserRole
from app.utils.content import sanitize_public_text


def test_role_matrix_separates_finance_content_and_operations():
    assert Permission.FINANCE_MANAGE in ROLE_PERMISSIONS[UserRole.MUHASEBE]
    assert Permission.CONTENT_MANAGE not in ROLE_PERMISSIONS[UserRole.MUHASEBE]
    assert Permission.CONTENT_MANAGE in ROLE_PERMISSIONS[UserRole.EDITOR]
    assert Permission.FINANCE_MANAGE not in ROLE_PERMISSIONS[UserRole.EDITOR]
    assert Permission.OPERATIONS_MANAGE in ROLE_PERMISSIONS[UserRole.OPERASYON]
    assert ROLE_PERMISSIONS[UserRole.PLATFORM_ADMIN] == set(Permission)


def test_turkish_statement_amount_and_headers_are_normalized():
    row = _normalize_row(
        {
            "İşlem No": "ZRT-42",
            "Tarih": "17.07.2026",
            "Tutar": "1.250,50",
            "Para Birimi": "try",
            "Gönderen": "Test Bağışçı",
            "Açıklama": "HVL-ABCD1234",
        },
        2,
    )
    assert row["external_id"] == "ZRT-42"
    assert row["amount_cents"] == 125050
    assert row["currency"] == "TRY"
    assert row["description"] == "HVL-ABCD1234"


def test_decimal_comma_amount_parser():
    assert _amount_to_cents("10,25") == 1025


def test_tenant_proxy_signature_rejects_browser_controlled_header(monkeypatch):
    monkeypatch.setattr(settings, "TENANT_PROXY_SECRET", "x" * 32)
    monkeypatch.setattr(settings, "TENANT_SIGNATURE_MAX_AGE_SECONDS", 60)
    timestamp = str(int(time.time()))
    slug = "hicret-dernegi"
    signature = hmac.new(("x" * 32).encode(), f"{slug}:{timestamp}".encode(), hashlib.sha256).hexdigest()
    request = Request({
        "type": "http", "method": "GET", "path": "/", "headers": [
            (b"x-einfak-tenant-timestamp", timestamp.encode()),
            (b"x-einfak-tenant-signature", signature.encode()),
        ],
    })
    assert TenantMiddleware._valid_proxy_signature(slug, request)
    assert not TenantMiddleware._valid_proxy_signature("kardeslik-payi", request)


def test_campaign_story_is_plain_text_before_public_rendering():
    story = '<p>Güvenli içerik</p><img src=x onerror="alert(1)"><script>alert(2)</script>'
    cleaned = sanitize_public_text(story)
    assert cleaned == "Güvenli içerik"
    assert "<" not in cleaned


def test_public_document_urls_must_be_http_or_https():
    assert OrgSettingsUpdate(bylaws_url="https://example.org/tuzuk.pdf").bylaws_url
    with pytest.raises(ValidationError):
        OrgSettingsUpdate(bylaws_url="javascript:alert(1)")


def test_production_gate_rejects_debug_and_test_payment_urls():
    common = {
        "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost/db",
        "SECRET_KEY": "a-secure-production-secret-key-123456",
        "ENVIRONMENT": "production",
    }
    with pytest.raises(ValidationError, match="DEBUG=false"):
        Settings(**common, DEBUG=True)
    with pytest.raises(ValidationError, match="test URLs"):
        Settings(**common, DEBUG=False, PAYMENTS_LIVE_ENABLED=True)
