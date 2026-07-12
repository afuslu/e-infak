from typing import List
from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl


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

    # VPOS
    VPOS_MERCHANT_ID: str = ""
    VPOS_TERMINAL_ID: str = ""
    VPOS_PASSWORD: str = ""
    VPOS_TEST_MODE: bool = True

    # SMS
    NETGSM_USERNAME: str = ""
    NETGSM_PASSWORD: str = ""
    NETGSM_SENDER: str = "EINFAK"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # Monitoring
    SENTRY_DSN: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
