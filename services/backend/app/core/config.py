import json
from typing import List
from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl, model_validator


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "E-İnfak API"
    APP_VERSION: str = "2.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = []

    # Email
    SENDGRID_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@e-infak.org"
    FROM_NAME: str = "E-İnfak"

    # File Storage
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_BUCKET_NAME: str = "e-infak-files"
    S3_REGION: str = "auto"

    # Ziraat Pay API v2 / Hosted Payment Page
    ZIRAATPAY_API_URL: str = "https://test.ziraatpay.com.tr/ziraatpay/api/v2"
    ZIRAATPAY_HPP_URL: str = "https://test.ziraatpay.com.tr/payment"
    ZIRAATPAY_MERCHANT: str = ""
    ZIRAATPAY_MERCHANT_USER: str = ""
    ZIRAATPAY_MERCHANT_PASSWORD: str = ""
    ZIRAATPAY_SECRET_KEY: str = ""
    # Optional JSON secret map: {"hicret-dernegi": {"merchant": "...", ...}}
    ZIRAATPAY_TENANT_CREDENTIALS: str = ""
    PAYMENTS_LIVE_ENABLED: bool = False
    PUBLIC_WEB_URL: str = "http://localhost:3000"

    # SMS
    NETGSM_USERNAME: str = ""
    NETGSM_PASSWORD: str = ""
    NETGSM_SENDER: str = "EINFAK"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # Monitoring
    SENTRY_DSN: str = ""

    @model_validator(mode="after")
    def validate_production_gate(self):
        if self.ENVIRONMENT != "production":
            return self
        if self.DEBUG:
            raise ValueError("Production requires DEBUG=false")
        if len(self.SECRET_KEY) < 32 or "change-in-production" in self.SECRET_KEY:
            raise ValueError("Production requires a strong SECRET_KEY")
        if self.PAYMENTS_LIVE_ENABLED:
            if "test." in self.ZIRAATPAY_API_URL or "test." in self.ZIRAATPAY_HPP_URL:
                raise ValueError("Live payments cannot use Ziraat Pay test URLs")
            try:
                tenant_credentials = json.loads(self.ZIRAATPAY_TENANT_CREDENTIALS)
            except (TypeError, ValueError) as exc:
                raise ValueError("Live payments require tenant-specific Ziraat credentials") from exc
            required = {"merchant", "merchant_user", "merchant_password", "secret_key"}
            for tenant in ("hicret-dernegi", "kardeslik-payi"):
                if not required.issubset(tenant_credentials.get(tenant, {})):
                    raise ValueError(f"Missing Ziraat credentials for {tenant}")
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
