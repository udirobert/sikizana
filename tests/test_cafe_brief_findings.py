"""Café briefing findings — composition into the canonical findings stream.

Mirrors test_findings.py / test_ap_integrity.py: the analyzer's edge cases,
the build_cafe_findings contract, and the build_findings composition gate.
All POS data is the deterministic demo fixture (no external CSV dependency),
so the suite is reproducible on any machine.
"""

import datetime as dt
import importlib

import pytest

from src.services.cafe_brief import build_cafe_findings
from src.services.cafe_brief.analyzer import analyse, MIN_WEEKLY_UNITS
from src.services.cafe_brief.demo_pos import demo_rows
from src.services.cafe_brief.facts import build_sales_facts
from src.services.cafe_brief.pos_ingest import SaleRow
from src.services.cafe_brief.store import (
    get_review_outcomes as get_cafe_review_outcomes,
    set_review_outcome as set_cafe_review_outcome,
    get_review_summary as get_cafe_review_summary,
)
from src.services.connectors import get_connector
from src.services.payment_store import delete_session_data


# ---- analyzer edge cases (the deterministic "code owns numbers" layer) ----

def _row(item, qty=1, gross=4.5, date="2026-05-04", time="08:15:00",
         category="Coffee", txn_id="T1", modifiers=""):
    d = date if isinstance(date, dt.date) else dt.date.fromisoformat(date)
    return SaleRow(
        date=d, time=time, category=category,
        item=item, qty=qty, price_point="Regular", modifiers=modifiers,
        gross=gross, txn_id=txn_id,
    )


def test_analyzer_raises_on_empty():
    with pytest.raises(ValueError, match="no sales rows"):
        analyse([])


def test_attach_keyword_scoping_does_not_widen_base():
    """'Matcha Cake Slice' must NOT count as a matcha drink — only drinks."""
    rows = [
        # one matcha-latte basket WITH a cake slice (a food, not a drink)
        _row("Matcha Latte", txn_id="A"), _row("Matcha Cake Slice", txn_id="A"),
        # one matcha-latte basket with NO treat
        _row("Matcha Latte", txn_id="B"),
    ]
    facts = analyse(rows)
    # only drink baskets count; attach = 1 of 2
    assert facts["attach"]["matcha_transactions"] == 2
    assert facts["attach"]["with_treat"] == 1


def test_retail_items_excluded_from_trends():
    """Retail shelf noise must not produce trend findings."""
    # 12 identical weeks of a retail item at high volume, no trend
    rows = []
    for w in range(12):
        for d in range(7):
            rows.append(_row("Packaged Beans", category="Retail",
                             date=dt.date(2026, 4, 27) + dt.timedelta(days=w * 7 + d),
                             txn_id=f"R{w}{d}"))
    facts = analyse(rows)
    assert facts["risers"] == [] and facts["fallers"] == []


def test_trend_threshold_ignores_low_volume():
    """Items under MIN_WEEKLY_UNITS are filtered out of risers/fallers."""
    rows = []
    for w in range(12):
        for d in range(7):
            # low-volume item that ramps but stays under the threshold
            if (w * 7 + d) % 5 == 0:
                rows.append(_row("Rare Syrup", category="Coffee",
                                 date=dt.date(2026, 4, 27) + dt.timedelta(days=w * 7 + d),
                                 txn_id=f"L{w}{d}"))
    facts = analyse(rows)
    assert not any(m["item"] == "Rare Syrup" for m in facts["risers"])


# ---- build_cafe_findings contract (the composition point) ----

def _cafe_findings(monkeypatch):
    """Force the demo fixture (no external CSV) so tests are deterministic."""
    monkeypatch.setenv("CAFE_POS_CSV", "/nonexistent/cafe-test.csv")
    import src.services.cafe_brief.findings as mod
    importlib.reload(mod)
    svc = get_connector("test-session")
    return mod.build_cafe_findings("test-session", svc)


def test_build_cafe_findings_produces_three_nudges(monkeypatch):
    findings = _cafe_findings(monkeypatch)
    kinds = {f["kind"] for f in findings}
    assert kinds == {"cafe_rising_item", "cafe_declining_item", "cafe_attach_gap"}


def test_every_cafe_finding_has_action_and_evidence(monkeypatch):
    findings = _cafe_findings(monkeypatch)
    for f in findings:
        assert f["action"]["prompt"], f"finding {f['id']} has no action prompt"
        assert f["action"]["label"]
        assert f["severity"] in ("high", "medium", "low")
        assert f["evidence"], f"finding {f['id']} has no evidence"


def test_attach_gap_finding_names_the_opportunity(monkeypatch):
    findings = _cafe_findings(monkeypatch)
    gap = next(f for f in findings if f["kind"] == "cafe_attach_gap")
    assert "18%" in gap["detail"]
    assert gap["amount"] > 0  # annualized opportunity


def test_cafe_finding_ids_are_stable_and_opaque():
    from src.services.cafe_brief.findings import _build_candidates

    sales = build_sales_facts(demo_rows())
    once = _build_candidates(sales, None)
    again = _build_candidates(sales, None)
    assert [c.id for c in once] == [c.id for c in again]
    for c in once:
        assert c.id.startswith("cafe-") and ":" in c.id


def test_kill_switch_disables_cafe_findings(monkeypatch):
    monkeypatch.setenv("CAFE_BRIEF_DISABLED", "true")
    import src.services.cafe_brief.config as cfg
    importlib.reload(cfg)
    assert not cfg.is_cafe_brief_enabled()


# ---- build_findings composition (one stream) ----

def test_build_findings_includes_cafe_findings(monkeypatch):
    monkeypatch.setenv("CAFE_POS_CSV", "/nonexistent/cafe-test.csv")
    monkeypatch.delenv("CAFE_BRIEF_DISABLED", raising=False)
    import src.services.cafe_brief.findings as cmod
    importlib.reload(cmod)
    import src.services.findings as fmod
    importlib.reload(fmod)
    data = fmod.build_findings("test-session")
    cafe = [f for f in data["findings"] if str(f["kind"]).startswith("cafe_")]
    assert len(cafe) >= 3
    assert data["counts"]["cafe"] >= 3
    assert data["cafe_reviewed"] is not None


# ---- café review-state persistence (mirrors AP review tests) ----

def _cafe_findings_for_review(monkeypatch, session_id="session-cafe-review"):
    monkeypatch.setenv("CAFE_POS_CSV", "/nonexistent/cafe-test.csv")
    import src.services.cafe_brief.findings as mod
    importlib.reload(mod)
    svc = get_connector(session_id)
    return mod.build_cafe_findings(session_id, svc)


def test_cafe_review_state_persists_and_is_erased(monkeypatch):
    session_id = "session-cafe-review"
    findings = _cafe_findings_for_review(monkeypatch, session_id)
    finding_id = next(f["id"] for f in findings if f["kind"] == "cafe_attach_gap")
    assert findings[0]["review"]["state"] == "open"

    set_cafe_review_outcome(session_id, finding_id, "dismissed", dismissal_reason="already addressed")
    refreshed = _cafe_findings_for_review(monkeypatch, session_id)
    finding = next(f for f in refreshed if f["id"] == finding_id)
    assert finding["review"]["state"] == "dismissed"
    assert finding["review"]["dismissal_reason"] == "already addressed"

    deleted = delete_session_data(session_id)
    assert deleted["cafe_finding_reviews"] == 1


def test_cafe_confirmed_value_captured_in_summary(monkeypatch):
    session_id = "session-cafe-confirmed"
    findings = _cafe_findings_for_review(monkeypatch, session_id)
    finding_id = next(f["id"] for f in findings if f["kind"] == "cafe_attach_gap")

    set_cafe_review_outcome(session_id, finding_id, "confirmed", confirmed_amount=468.0)
    summary = get_cafe_review_summary(session_id)
    assert summary == {
        "confirmed_value": 468.0,
        "confirmed_count": 1,
        "dismissed_count": 0,
    }
    delete_session_data(session_id)
