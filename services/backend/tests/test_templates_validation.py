"""Regression tests ensuring every Site Builder section, page template and demo validates cleanly."""
from app.services.blocks import validate_blocks
from app.services.templates import DEMOS, PAGE_TEMPLATES, SECTIONS, fresh_ids


def test_template_keys_are_unique():
    for name, items in [("SECTIONS", SECTIONS), ("PAGE_TEMPLATES", PAGE_TEMPLATES), ("DEMOS", DEMOS)]:
        keys = [item["key"] for item in items]
        duplicates = sorted({k for k in keys if keys.count(k) > 1})
        assert not duplicates, f"Duplicate keys in {name}: {duplicates}"


def test_all_sections_validate():
    for section in SECTIONS:
        kind = section.get("kind") if section.get("kind") in ("home", "page", "header", "footer") else "page"
        validated = validate_blocks(fresh_ids(section["blocks"]), kind)
        assert isinstance(validated, list)


def test_all_page_templates_validate():
    for page in PAGE_TEMPLATES:
        validated = validate_blocks(fresh_ids(page["blocks"]), "page")
        assert len(validated) > 0


def test_all_demos_validate():
    for demo in DEMOS:
        for kind in ("home", "header", "footer"):
            validated = validate_blocks(fresh_ids(demo[kind]), kind)
            assert isinstance(validated, list)
