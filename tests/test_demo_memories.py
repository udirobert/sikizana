"""Demo memory seeding picks memories that match the active demo scenario.

A music visitor should recall the festival/promoter in their sample books,
not the café's customers. The café remains the default.
"""

from __future__ import annotations

from src.services.payment_store import set_session_pref
from src.services.supermemory import (
    _DEMO_MEMORIES_BY_SCENARIO,
    _resolve_demo_scenario,
)


def test_default_scenario_is_cafe():
    assert _resolve_demo_scenario("mem-default") == "cafe"


def test_music_scenario_resolves():
    set_session_pref("mem-music", "demo_scenario", "music")
    assert _resolve_demo_scenario("mem-music") == "music"


def test_unknown_scenario_falls_back_to_cafe():
    set_session_pref("mem-bogus", "demo_scenario", "nope")
    assert _resolve_demo_scenario("mem-bogus") == "cafe"


def test_memory_entities_match_the_scenario_books():
    """The chase-policy signal in each scenario names an entity that actually
    appears in that scenario's sample books, so recall is coherent."""
    from src.services.demo_scenarios import scenario_data

    for scenario in ("cafe", "music"):
        names = {c["name"] for c in scenario_data(scenario)["contacts"]}
        policy = next(
            m for m in _DEMO_MEMORIES_BY_SCENARIO[scenario] if m.get("metadata", {}).get("type") == "chase_policy"
        )
        assert policy["metadata"]["entity"] in names, f"{scenario} policy entity not in books"


def test_memory_ids_are_unique_per_scenario():
    for scenario, memories in _DEMO_MEMORIES_BY_SCENARIO.items():
        ids = [m["id"] for m in memories]
        assert len(ids) == len(set(ids)), f"{scenario} has duplicate memory ids"
