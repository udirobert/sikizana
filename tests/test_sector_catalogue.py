"""Sector catalogue — one JSON source for aliases, typicals, and ratios."""

from src.services.sector_catalogue import (
    demo_meta,
    display_label,
    ratios_for,
    resolve_sync,
    watch_for,
)


def test_alias_and_keyword_resolution() -> None:
    assert resolve_sync("catering") == "hospitality"
    assert resolve_sync("gastropub") == "hospitality"
    assert resolve_sync("plumbing") == "construction"
    assert resolve_sync("music") == "music"
    assert resolve_sync("zzzz-unknown-xyz") is None


def test_display_label_keeps_research_words() -> None:
    assert display_label("catering", "hospitality") == "Catering"
    assert display_label("gastropub", "hospitality") == "Gastropub"
    assert display_label("hospitality", "hospitality") == "Hospitality"


def test_unknown_family_has_no_extra_ratios() -> None:
    assert ratios_for("default") == []
    assert ratios_for("hospitality")


def test_demo_meta_is_honest_when_books_do_not_fit() -> None:
    hosp = demo_meta("hospitality")
    assert hosp["fits_sector"] is True
    build = demo_meta("construction", "Construction")
    assert build["fits_sector"] is False
    assert "café-shaped" in build["cta"].lower() or "cafe-shaped" in build["cta"].lower()


def test_watch_for_comes_from_catalogue() -> None:
    assert "Wages" in watch_for("hospitality")
