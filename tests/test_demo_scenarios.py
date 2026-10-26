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
    # Field Day Festival is the big overdue invoice (30 days late); Camden
    # Rehearsal Studios is 12 days late but can be netted against the
    # rehearsal-space bill the band owes them.
    assert data["counts"]["overdue"] == 2
    overdue = next(f for f in data["findings"] if "Field Day Festival" in f["title"])
    assert overdue["amount"] == 2400.0
    assert overdue["kind"] == "overdue_invoice"
    # The duplicate SoundStage payment is seeded with two evidence rows.
    duplicate = next(f for f in data["findings"] if f["kind"] == "ap_duplicate_payment")
    assert duplicate["amount"] == 680.0
    assert len(duplicate["evidence"]) == 2
    assert data["counts"]["unreconciled"] == 4


def test_music_findings_surface_the_net_offset():
    """The two-sided Camden relationship shows the cash-route analysis: a
    net offset card plus an overdue invoice whose cheapest route is a
    set-off rather than a chase."""
    from src.services.findings import build_findings

    set_session_pref("scenario-offset", "demo_scenario", "music")
    data = build_findings("scenario-offset")

    offset = next(f for f in data["findings"] if f["kind"] == "net_offset_opportunity")
    assert "Camden Rehearsal Studios" in offset["title"]
    assert offset["amount"] == 600.0
    assert data["counts"]["receivables"] == 1

    camden = next(f for f in data["findings"] if "Camden Rehearsal Studios" in f["title"])
    assert camden["kind"] == "overdue_invoice"
    # The plain "chase the full amount" prompt is replaced by a route
    # comparison, because chasing cash we could have cancelled is the worst
    # of both routes.
    assert camden["action"]["type"] == "review"
    assert "net" in camden["action"]["prompt"].lower()
    # The one-click auto-chase is still available (it keys off invoice_number).
    assert camden["invoice_number"] == "INV-0005"
