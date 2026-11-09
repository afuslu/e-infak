"""Site design tokens: validation, defaults for old data and theme kits."""
import pytest
from pydantic import ValidationError

from app.services.site import DEFAULT_DESIGN, FONTS, THEME_KITS, Design, SiteAppearance, design_of


def test_design_is_validated():
    design = Design(body_font="inter", heading_font="playfair", page_color="#fafafa", radius="large")
    assert design.page_color == "#FAFAFA"
    for bad in ({"body_font": "comic-sans"}, {"radius": "huge"}, {"text_color": "red;}body{x"},
                {"heading_weight": "1000"}, {"container": "100vw"}):
        with pytest.raises(ValidationError):
            Design(**bad)


def test_old_and_broken_site_data_falls_back_to_defaults():
    assert design_of({}) == DEFAULT_DESIGN
    assert design_of({"design": "x"}) == DEFAULT_DESIGN
    assert design_of({"design": {"body_font": "gone-font"}}) == DEFAULT_DESIGN
    assert design_of({"design": {"radius": "pill"}})["radius"] == "pill"
    # An appearance saved before design existed still validates
    assert SiteAppearance().design.model_dump() == DEFAULT_DESIGN


def test_theme_kits_are_valid():
    keys = [k["key"] for k in THEME_KITS]
    assert len(keys) == len(set(keys)) >= 6
    for kit in THEME_KITS:
        SiteAppearance(primary_color=kit["primary_color"], accent_color=kit["accent_color"], design=kit["design"])
        assert kit["design"]["body_font"] in FONTS and kit["design"]["heading_font"] in FONTS
