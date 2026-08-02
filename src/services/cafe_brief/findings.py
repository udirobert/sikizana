"""Compose deterministic café analysis into canonical Sikizana findings.

This is the composition point that graduates the café briefing from an
isolated `/cafe` surface into the canonical `build_findings()` stream:
the analyzer stays the numbers engine, POS rows are the source, and nudges
become `CafeFinding` objects with evidence + a one-click chat action — the
same shape AP Integrity returns. Spend facts come through the connector.

POS source resolution (in priority order):
  1. `CAFE_POS_CSV` / the packaged Square export if present on disk
  2. the deterministic demo fixture, only in demo mode (honest synthetic)
  3. otherwise none — a live Xero session without POS data gets no café
     findings (the café is a hospitality vertical, not a default for every org)
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any

from src.services.cafe_brief.config import BENCHMARK_ATTACH, is_cafe_brief_enabled
from src.services.cafe_brief.demo_pos import demo_rows
from src.services.cafe_brief.facts import build_sales_facts, build_spend_facts
from src.services.cafe_brief.models import CafeFinding, Evidence
from src.services.cafe_brief.pos_ingest import SaleRow, load_item_sales
from src.services.connectors.base import AccountingConnector
from src.services.logging import get_logger

log = get_logger("sikizana.cafe_brief")

_DEFAULT_CSV = str(Path(__file__).resolve().parents[4] / "matcha-hack" / "out" / "square_item_sales.csv")
_CSV_PATH = os.environ.get("CAFE_POS_CSV", _DEFAULT_CSV)


def _resolve_rows(svc: AccountingConnector) -> list[SaleRow]:
    """Where the sell-side POS rows come from for this session.

    A real CSV wins if present; otherwise the demo fixture feeds demo sessions
    (so the demo books page shows café findings computed, never frozen). Live
    sessions without a POS source return nothing — café findings are opt-in by
    data availability, not sprayed onto every org.
    """
    try:
        if _CSV_PATH and Path(_CSV_PATH).exists():
            return load_item_sales(_CSV_PATH)
    except Exception as exc:  # noqa: BLE001 — POS source is best-effort
        log.warning("cafe_pos_csv_unreadable", extra={"error": str(exc)})

    if svc.mode() == "demo":
        return demo_rows()
    return []


def _nudge_id(prefix: str, *parts: Any) -> str:
    """Stable, opaque id (mirrors AP's stable_id shape, minus raw PII)."""
    digest = hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]
    return f"cafe-{prefix}:{digest}"


def _build_candidates(sales: Any, spend: Any) -> list[CafeFinding]:
    """Turn the analyzer's risers/fallers/attach into canonical findings."""
    out: list[CafeFinding] = []
    period = f"{sales.window['start']} → {sales.window['end']}"

    if sales.risers:
        r = sales.risers[0]
        weekly = r.get("units_per_week")
        pct = r.get("pct_change")
        out.append(CafeFinding(
            id=_nudge_id("riser", r["item"], period),
            kind="cafe_rising_item",
            severity="low",
            title=f"{r['item']} is taking off",
            amount=0.0,
            detail=f"Up {pct}% vs the prior month — ~{weekly}/week now. Raise the order before the weekend rush.",
            action_type="draft",
            action_label="Draft order",
            action_prompt=(
                f"\"{r['item']}\" averaged {weekly} units/week over the last 4 weeks, "
                f"a {pct}% rise vs the prior 4 weeks (window {period}). Explain what this "
                f"means for my supplier order this week and draft the email to my top "
                f"supplier adjusting the order. Keep it short and owner-friendly."
            ),
            evidence=(
                Evidence("pos-trend", "Weekly units", ", ".join(str(v) for v in r.get("weekly", []))),
                Evidence("pos-window", "Analysis window", period),
            ),
        ))

    if sales.fallers:
        f = sales.fallers[0]
        weekly = f.get("units_per_week")
        pct = f.get("pct_change")
        out.append(CafeFinding(
            id=_nudge_id("faller", f["item"], period),
            kind="cafe_declining_item",
            severity="low",
            title=f"Cut the {f['item']} order",
            amount=0.0,
            detail=f"Down {abs(pct)}% over the last 4 weeks (~{weekly}/week). Waste risk on perishables.",
            action_type="draft",
            action_label="Draft order",
            action_prompt=(
                f"\"{f['item']}\" fell {pct}% using the same last-4-vs-prior-4-week method "
                f"(~{weekly}/week recently, window {period}). Explain the waste risk and "
                f"draft the supplier email trimming the order. Short and owner-friendly."
            ),
            evidence=(
                Evidence("pos-trend", "Weekly units", ", ".join(str(v) for v in f.get("weekly", []))),
                Evidence("pos-window", "Analysis window", period),
            ),
        ))

    a = sales.attach
    if a.get("rate", 1.0) < BENCHMARK_ATTACH:
        opportunity = a.get("weekly_opportunity_gbp") or 0.0
        annual = round(opportunity * 52, 2)
        out.append(CafeFinding(
            id=_nudge_id("attach", period),
            kind="cafe_attach_gap",
            severity="medium",
            title="Bundle cake with matcha",
            amount=annual,
            detail=(
                f"Only {a['rate']:.0%} of matcha-latte transactions add a cake/pastry "
                f"(benchmark ~{BENCHMARK_ATTACH:.0%}). ~£{opportunity:,.0f}/week left "
                f"on the table — about £{annual:,.0f}/year."
            ),
            action_type="explain",
            action_label="Explain",
            action_prompt=(
                f"Only {a['rate']:.1%} of the {a.get('matcha_transactions')} matcha-drink "
                f"transactions in {period} also contained a cake/pastry item "
                f"(benchmark ~{BENCHMARK_ATTACH:.0%}). That's roughly £{opportunity:,.0f}/week "
                f"(~£{annual:,.0f}/year) on the table. Explain the attach-rate opportunity "
                f"and suggest three concrete ways to lift it at the till."
            ),
            evidence=(
                Evidence("pos-attach", "Matcha transactions w/ treat", f"{a.get('with_treat')} of {a.get('matcha_transactions')}"),
                Evidence("pos-attach", "Attach rate", f"{a['rate']:.1%}"),
                Evidence("benchmark", "Pastry/cake add-on benchmark", f"~{BENCHMARK_ATTACH:.0%} (The Happy Manager)"),
            ),
        ))

    return out


def build_cafe_findings(
    session_id: str, svc: AccountingConnector, user_id: int | None = None
) -> list[dict]:
    """Evaluate one session's café facts and return canonical finding dicts.

    Mirrors `build_ap_findings`: gated, best-effort, returns the same finding
    shape the panel, digest, and chat already consume. Review outcomes are
    session-scoped — a dismissed nudge stays dismissed until the POS data
    changes enough to produce a new opaque ID. No POS rows → no findings.
    """
    if not is_cafe_brief_enabled(user_id):
        return []

    rows = _resolve_rows(svc)
    if not rows:
        return []

    try:
        sales = build_sales_facts(rows)
        spend = build_spend_facts(svc)
        candidates = _build_candidates(sales, spend)
    except Exception as exc:  # noqa: BLE001 — café findings are best-effort
        log.warning("cafe_findings_unavailable", extra={"error": str(exc)})
        return []

    from src.services.cafe_brief.store import get_review_outcomes

    reviews = get_review_outcomes(session_id, [c.id for c in candidates])
    return [c.as_dict(reviews.get(c.id)) for c in candidates]
