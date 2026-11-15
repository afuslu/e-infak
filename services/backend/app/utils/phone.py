"""Phone matching that tolerates the formats stored over time (0532…, 90532…, +90 532 …)."""
from sqlalchemy import func


def phone_digits(value: str | None) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def phone_key(value: str | None) -> str:
    """Last 10 digits: the national number for Turkish phones, and stable across prefixes."""
    return phone_digits(value)[-10:]


def phone_key_sql(column):
    return func.right(func.regexp_replace(column, r"\D", "", "g"), 10)


def phone_matches(column, value: str | None):
    key = phone_key(value)
    if len(key) < 10:
        return column == value
    return phone_key_sql(column) == key
