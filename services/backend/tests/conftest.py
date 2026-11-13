import os
import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://einfak:einfak123@localhost:5432/einfak_test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters")
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from app.core.db import Base
import app.models  # noqa: F401  (register every table on Base.metadata)
import app.main  # noqa: F401  (routers import the remaining models)

# Test database URL
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://einfak:einfak123@localhost:5432/einfak_test")

_schema_ready = False


@pytest.fixture(autouse=True)
def sms_kicks(monkeypatch):
    """No broker in tests: collect the ids of SMS that would be handed to a worker."""
    from app.services import sms_service
    kicked: list[str] = []
    monkeypatch.setattr(sms_service, "_kick", kicked.append)
    monkeypatch.setattr(sms_service, "_kick_batch", lambda batch_id: kicked.append(f"batch:{batch_id}"))
    return kicked


@pytest.fixture
async def db_session():
    """Database session on a function-scoped engine.

    pytest-asyncio gives each test its own event loop, so the engine (and its
    connections) must not outlive a test. The schema is rebuilt once per run
    so model changes always reach the test database.
    """
    global _schema_ready
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        if not _schema_ready:
            # Test database only: start every run from an empty schema.
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
            _schema_ready = True
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as session:
        yield session
        await session.rollback()
    await engine.dispose()
