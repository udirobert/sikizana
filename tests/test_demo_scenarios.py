"""Demo scenario switching — café (default) and music sample books.

The café must stay the default so the classic demo and every existing test
behave exactly as before; music is opt-in via a per-session preference set by
the sector landing pages. Only demo-mode reads are affected — the mode stays
"demo" so "sample data" labels remain honest.
"""

from __future__ import annotations

from src.services.payment_store import set_session_pref
from src.services.xero_service import XeroService


def test_default_scenario_is_cafe():
    svc = XeroService("scenario-default")
    assert svc.get_organisation()["name"] == "The Daily Grind Ltd"


def test_music_scenario_serves_music_books():
    set_session_pref("scenario-music", "demo_scenario", "music")
    svc = XeroService("scenario-music")
    assert svc.get_organisation()["name"] == "Ember & Oak Ltd"
    contact_names = {c["name"] for c in svc.list_contacts()}
    assert "SoundStage Backline Hire" in contact_names
    assert "Field Day Festival" in contact_names


def test_music_scenario_keeps_demo_mode_label():
    set_session_pref("scenario-music-mode", "demo_scenario", "music")
    svc = XeroService("scenario-music-mode")
    assert svc.mode() == "demo"
    assert svc.is_live() is False


def test_unknown_scenario_falls_back_to_cafe():
    set_session_pref("scenario-bogus", "demo_scenario", "not-a-scenario")
    svc = XeroService("scenario-bogus")
    assert svc.get_organisation()["name"] == "The Daily Grind Ltd"


def test_scenarios_are_isolated_per_session():
    set_session_pref("scenario-a", "demo_scenario", "music")
    assert XeroService("scenario-a").get_organisation()["name"] == "Ember & Oak Ltd"
    assert XeroService("scenario-b").get_organisation()["name"] == "The Daily Grind Ltd"


def test_music_findings_detect_duplicate_and_late_festival():
    """The seeded music books surface the same finding kinds as the café:
    a duplicate backline payment, a late festival invoice, and unreconciled
    transactions."""
    from src.services.findings import build_findings

    set_session_pref("scenario-findings", "demo_scenario", "music")
    data = build_findings("scenario-findings")

    assert data["mode"] == "demo"
    assert data["clean"] is False
    # Field Day Festival is the single overdue invoice (30 days late).
    assert data["counts"]["overdue"] == 1
    overdue = next(f for f in data["findings"] if f["kind"] == "overdue_invoice")
    assert overdue["amount"] == 2400.0
    assert "Field Day Festival" in overdue["title"]
    # The duplicate SoundStage payment is seeded with two evidence rows.
    duplicate = next(f for f in data["findings"] if f["kind"] == "ap_duplicate_payment")
    assert duplicate["amount"] == 680.0
    assert len(duplicate["evidence"]) == 2
    assert data["counts"]["unreconciled"] == 4
