import asyncio
import pytest
from pydantic import ValidationError

from app.api.deps import Permission, ROLE_PERMISSIONS
from app.api.v1.reconciliation import _amount_to_cents, _normalize_row
from app.core.config import Settings
from app.middleware.tenant import TenantMiddleware
from app.models.user import UserRole


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


def test_tenant_hostname_matching_rejects_lookalike_domains():
    middleware = TenantMiddleware(lambda scope, receive, send: None)
    assert asyncio.run(middleware.get_org_slug_from_hostname("hicretdernegi.org")) == "hicret-dernegi"
    assert asyncio.run(middleware.get_org_slug_from_hostname("kardeslikpayi.org.evil.test")) is None
    assert asyncio.run(middleware.get_org_slug_from_hostname("tenant.e-infak.org")) == "tenant"


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
