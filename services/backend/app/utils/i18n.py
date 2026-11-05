"""Content translations.

Translatable records keep the default (Turkish) text in their own columns and
other languages in a `translations` JSON object: {"en": {"title": "..."}, ...}.
Public endpoints overlay the requested language; missing fields fall back to
the default text.
"""
import re
from typing import Any, Iterable, Optional

from fastapi import Request

from app.utils.content import sanitize_long_text, sanitize_public_text

DEFAULT_LANGUAGE = "tr"
MAX_LANGUAGES = 30
_LANG = re.compile(r"^[a-z]{2}$")
RTL_LANGUAGES = {"ar", "fa", "ur", "he"}


def valid_language(value: Any) -> Optional[str]:
    text = str(value or "").strip().lower()
    return text if _LANG.fullmatch(text) else None


def request_language(request: Request) -> Optional[str]:
    """`?lang=xx` or the `x-locale` header set by the website; None means default language."""
    lang = valid_language(request.query_params.get("lang")) or valid_language(request.headers.get("x-locale"))
    return None if lang in (None, DEFAULT_LANGUAGE) else lang


def clean_translations(value: Any, fields: Iterable[str], long_fields: Iterable[str] = (),
                       max_lengths: Optional[dict] = None) -> dict:
    """Keep only valid language codes and known fields; strip markup like the base fields."""
    if not isinstance(value, dict):
        return {}
    fields, long_fields = set(fields), set(long_fields)
    max_lengths = max_lengths or {}
    result: dict = {}
    for lang, entries in list(value.items())[:MAX_LANGUAGES]:
        code = valid_language(lang)
        if not code or code == DEFAULT_LANGUAGE or not isinstance(entries, dict):
            continue
        cleaned = {}
        for field, text in entries.items():
            if field not in fields or text is None or not str(text).strip():
                continue
            text = sanitize_long_text(str(text)) if field in long_fields else sanitize_public_text(str(text))
            if field not in long_fields:
                text = (text or "").replace("\n", " ")
            if text:
                cleaned[field] = text[: max_lengths.get(field, 100_000)]
        if cleaned:
            result[code] = cleaned
    return result


def localize(data: dict, translations: Optional[dict], lang: Optional[str], fields: Iterable[str]) -> dict:
    """Overlay translated fields onto an output dict (in place) and report the language served."""
    data["lang"] = DEFAULT_LANGUAGE
    if not lang:
        return data
    overlay = (translations or {}).get(lang) or {}
    applied = False
    for field in fields:
        if overlay.get(field):
            data[field] = overlay[field]
            applied = True
    if applied:
        data["lang"] = lang
    return data
