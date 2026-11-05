from sqlalchemy import Column, DateTime, Numeric, String
from sqlalchemy.sql import func
from app.core.db import Base


class FxRate(Base):
    """Latest successfully fetched TCMB selling rate: 1 unit of `currency` = `rate_try` TL."""
    __tablename__ = "fx_rates"

    currency = Column(String(3), primary_key=True)
    rate_try = Column(Numeric(14, 6), nullable=False)
    fetched_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
