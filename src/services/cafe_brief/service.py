"""Compose the Monday Briefing: deterministic facts + spend + agent layer.

Structure mirrors the product philosophy: code computes, the agent perceives
and wordsmiths. Manus adds prose + a cited industry trend off the facts JSON;
if the agent is slow or down, template copy ships the demo anyway.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from src.services.cafe_brief import analyzer, manus_client
from src.services.cafe_brief.config import (
    BENCHMARK_ATTACH,
    BENCHMARK_COGS,
    BENCHMARK_COGS_SOURCE,
    BENCHMARK_SOURCES,
)
from src.services.cafe_brief.pos_ingest import load_item_sales
from src.services.connectors.base import AccountingConnector

DEFAULT_CSV = str(Path(__file__).resolve().parents[4] / "matcha-hack" / "out" / "square_item_sales.csv")
CSV_PATH = os.environ.get("CAFE_POS_CSV", DEFAULT_CSV)

# ------------------------------------------------------------------ spend

def _spend_facts() -> dict:
    """Supplier spend + P&L anchor from the seeded café demo scenario.

    LEGACY /cafe-page path. The canonical `build_findings()` flow now sources
    spend through the accounting connector via `facts.build_spend_facts(svc)`
    (which respects the boundary rule: connectors fetch facts, no direct
    `demo_scenarios` import). This stays only for the `/cafe` briefing page
    until that surface reads from `/api/xero/findings`; consolidate there.
    """
    try:
        from src.services.demo_scenarios import scenario_data

        data = scenario_data("cafe")
        supplier_names = {c["name"] for c in data["contacts"] if c.get("isSupplier")}
        supplier_emails = {c["name"]: c.get("emailAddress", "")
                           for c in data["contacts"] if c.get("isSupplier")}

        def _contact_name(obj) -> str | None:
            if isinstance(obj, dict):
                return obj.get("name")
            return obj

        by_supplier: dict[str, float] = {}

        def _add(name, amount):
            if name and float(amount or 0):
                by_supplier[name] = by_supplier.get(name, 0.0) + float(amount)

        # Spend = supplier bills (ACCPAY). Bank SPEND txns are the cash leg of
        # the same bills — only use them if no bills exist, never both.
        bills = [inv for inv in data["invoices"] if inv.get("type") == "ACCPAY"]
        if bills:
            for inv in bills:
                _add(_contact_name(inv.get("contact")), inv.get("total"))
        else:
            for txn in data.get("bank_txns", []):
                name = _contact_name(txn.get("contact"))
                if name in supplier_names and str(txn.get("type", "")).upper().startswith("SPEND"):
                    _add(name, abs(float(txn.get("total") or 0)))
        pl = data.get("pl") or {}
        return {
            "by_supplier_gbp": [
                {"supplier": k, "total_gbp": round(v, 2), "email": supplier_emails.get(k, "")}
                for k, v in sorted(by_supplier.items(), key=lambda kv: -kv[1])
            ],
            "net_profit_gbp": pl.get("netProfit"),
            "period": f"{pl.get('fromDate', '')} to {pl.get('toDate', '')}".strip(),
        }
    except Exception as e:  # never let spend break the briefing
        return {"error": repr(e), "by_supplier_gbp": []}


# ----------------------------------------------------------------- nudges

# Benchmarks are defined once in config.py (the single source of truth) and
# imported above. See LEARNINGS_FROM_HACKATHON.md: the frozen fixture stays
# internally coherent at the 18% attach benchmark for this demo cycle, and
# the next enrichment refresh re-derives with the corpus value (20–25%).


def _nudges(facts: dict, spend: dict) -> list[dict]:
    out = []
    if facts["risers"]:
        r = facts["risers"][0]
        out.append({
            "title": f"Stock up for {r['item']}",
            "rationale": f"Up {r['pct_change']}% vs the prior month — now ~{r['units_per_week']}/week. "
                         f"Raise the matcha and oat-milk order before the weekend rush.",
            "impact_gbp": None,
        })
    if facts["fallers"]:
        f = facts["fallers"][0]
        out.append({
            "title": f"Cut the {f['item']} order",
            "rationale": f"Down {abs(f['pct_change'])}% over the last 4 weeks "
                         f"(~{f['units_per_week']}/week). Waste risk on perishables.",
            "impact_gbp": None,
        })
    a = facts["attach"]
    if a["rate"] < BENCHMARK_ATTACH:
        out.append({
            "title": "Bundle cake with matcha",
            "rationale": f"Only {a['rate']:.0%} of matcha lattes add a cake or pastry "
                         f"(benchmark ~{BENCHMARK_ATTACH:.0%}). A 'matcha + cake' board at "
                         f"the till is worth roughly £{a['weekly_opportunity_gbp']:,.0f}/week.",
            "impact_gbp": a["weekly_opportunity_gbp"],
        })
    return out[:3]


def _fallback_copy(facts: dict, nudges: list[dict]) -> dict:
    r = facts["risers"][0]["item"] if facts["risers"] else "your top seller"
    return {
        "headline": f"{r} is having a moment — the data says lean in.",
        "sell_summary": "Computed from the last 13 weeks of tills, agent copy unavailable.",
        "nudges": nudges,
        "industry_trend": {"claim": "", "source_name": "", "source_url": ""},
        "competitor_prices": [],
        "supplier_email_draft": "",
    }


# ----------------------------------------------------------------- manus

_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "sell_summary": {"type": "string"},
        "verification": {"type": "array", "items": {"type": "object", "properties": {
            "claim": {"type": "string"}, "verified": {"type": "boolean"},
            "note": {"type": "string"}},
            "required": ["claim", "verified", "note"], "additionalProperties": False}},
        "nudges": {"type": "array", "items": {"type": "object", "properties": {
            "title": {"type": "string"}, "rationale": {"type": "string"},
            "impact_gbp": {"type": "number"}},
            "required": ["title", "rationale", "impact_gbp"], "additionalProperties": False}},
        "industry_trend": {"type": "object", "properties": {
            "claim": {"type": "string"}, "source_name": {"type": "string"},
            "source_url": {"type": "string"}},
            "required": ["claim", "source_name", "source_url"], "additionalProperties": False},
        "competitor_prices": {"type": "array", "items": {"type": "object", "properties": {
            "item": {"type": "string"}, "price_gbp": {"type": "number"},
            "place": {"type": "string"}, "source_url": {"type": "string"}},
            "required": ["item", "price_gbp", "place", "source_url"], "additionalProperties": False}},
        "supplier_email_draft": {"type": "string"},
    },
    "required": ["headline", "sell_summary", "nudges", "industry_trend", "supplier_email_draft", "verification", "competitor_prices"],
    "additionalProperties": False,
}

_PROMPT = """You are the analyst layer of Siki, a finance assistant for a small London matcha café.

Below are FACTS computed deterministically from the café's last 13 weeks of
till data (a Square Item Sales export) and its supplier spend. NEVER invent
numbers: every figure in your copy must come from these facts. The one thing
you add is live market research.

Facts:
{facts}

Supplier spend:
{spend}

Attached is the RAW Square Item Sales export itself (CSV). Do four things:

0. VERIFY FIRST: independently recompute these claims from the raw CSV using
   your own code, before writing anything:
{claims}
   For each: verified=true only if your own computation matches within
   rounding; otherwise false with the number you found in note.
1. Write the Monday Briefing copy: a ONE-LINE headline, a ONE-sentence sell
   summary, and sharpen the nudges. Return EXACTLY the three nudges provided,
   in the same order — improve wording and explain "so what" in plain owner
   language, but never change order or numbers (no jargon). Be terse: the
   page shows, you whisper.
2. Research ONE real, current industry trend relevant to UK matcha cafés
   (e.g. matcha demand, oat-milk pricing, café cost inflation). It must come
   from a real page you browsed — return the claim in one sentence with the
   source name and URL. If you cannot verify one, say so in claim.
   ALSO: COMPETITOR PRICE CHECK — mandatory, keep browsing until done. Find
   current menu prices for (a) a matcha latte and (b) a cake or pastry slice
   at 2-4 REAL London cafés. Good hunting grounds: delivery listings
   (Deliveroo/Uber Eats pages), the cafés' own menu pages — try places like
   Tsujiri, Blank Street, Grind, EL&N, or any café near Shoreditch/City Road.
   Each row: item, price in GBP, café name, and the exact URL you read it
   from. Return 4-6 rows; only omit a row you genuinely could not verify on
   a real page. Spend at most a couple of minutes on this; an empty array is
   acceptable only if browsing failed entirely — say so in a verification
   note if it did.
3. Draft a short, friendly supplier-order email for the top nudge
   (adjusting this week's order), ready for the owner to review and send.
"""


def build_briefing(csv_bytes: bytes | None = None,
                   source_note: str | None = None,
                   svc: AccountingConnector | None = None) -> dict:
    """Fast path: deterministic facts + fallback copy. No network.

    csv_bytes: an owner-uploaded Square export (their data analysed fresh,
    client-side nothing — POSTed to us once, parsed, discarded).
    svc: an accounting connector for spend facts. When provided, spend flows
    through the connector (the canonical boundary — connectors fetch facts).
    When None (the offline/frozen-snapshot path), the legacy demo-scenario
    spend is used. The canonical `build_findings()` flow always passes a svc.
    """
    from src.services.cafe_brief.facts import build_sales_facts, build_spend_facts

    sales = build_sales_facts(load_item_sales(csv_bytes if csv_bytes is not None else CSV_PATH))
    facts = {
        "window": sales.window, "totals": sales.totals,
        "top_items_by_revenue": sales.top_items_by_revenue,
        "risers": sales.risers, "fallers": sales.fallers, "attach": sales.attach,
        "daypart_share": sales.daypart_share, "rhythm": sales.rhythm,
        "modifiers": sales.modifiers, "mix": sales.mix,
    }
    spend = build_spend_facts(svc) if svc else _spend_facts()
    spend_dict = {
        "by_supplier_gbp": spend.by_supplier_gbp,
        "net_profit_gbp": spend.net_profit_gbp,
        "period": spend.period,
    } if svc else spend
    nudges = _nudges(facts, spend_dict)
    cafe_label = (source_note or "Matcha Mochi — City Road (demo twin)")
    return {
        "cafe": {"name": cafe_label, "pos": "Square Item Sales export",
                 "uploaded": csv_bytes is not None},
        "sell": facts,
        "spend": spend_dict,
        "nudges": nudges,
        "copy": _fallback_copy(facts, nudges),
        "verification": [],
        "benchmarks": {"cogs": BENCHMARK_COGS, "cogs_source": BENCHMARK_COGS_SOURCE,
                        "attach": BENCHMARK_ATTACH, "sources": BENCHMARK_SOURCES},
        "manus": {"status": "not_started"},
    }


_CACHE: dict = {}
_LOCK = threading.Lock()


def _static_mode() -> bool:
    """Snapshot mode: serve the frozen enriched briefing, never touch Manus.

    Triggered explicitly (CAFE_MANUS_OFF=1) or implicitly when no API key is
    present — which is exactly the production shape (compose has no Manus
    env), so prod serves the snapshot with zero standing agent dependency.
    """
    return os.environ.get("CAFE_MANUS_OFF") == "1" or not manus_client.key_available()


def briefing_with_manus(refresh: bool = False, svc: AccountingConnector | None = None) -> dict:
    """Facts now; Manus enrichment in a background thread, merged when done.
    In static mode: the frozen enriched snapshot, always, no network."""
    global _CACHE
    with _LOCK:
        if _CACHE and not refresh:
            return _CACHE
        if _static_mode():
            frozen = frozen_briefing()
            if frozen:
                briefing = frozen
            else:
                briefing = build_briefing(svc=svc)
                briefing["manus"] = {"status": "unavailable",
                                     "reason": "static mode, no frozen fixture"}
        else:
            briefing = build_briefing(svc=svc)
        _CACHE = briefing

    if briefing["manus"].get("status") in ("working", "done"):
        return briefing
    if _static_mode():
        return briefing

    briefing["manus"] = {"status": "working"}

    def _enrich():
        import sys
        try:
            print(f"[cafe] _enrich start", file=sys.stderr, flush=True)
            # NOTE: str.format explodes on JSON braces in facts; use replace.
            facts = briefing["sell"]
            claims = []
            if facts["risers"]:
                r = facts["risers"][0]
                claims.append(f'- "{r["item"]}" averaged {r["units_per_week"]} units/week over the last 4 weeks, vs a prior-4-week average that makes this a {r["pct_change"]}% rise')
            if facts["fallers"]:
                f = facts["fallers"][0]
                claims.append(f'- "{f["item"]}" fell {f["pct_change"]}% using the same last-4-vs-prior-4-week method (recent avg {f["units_per_week"]}/week)')
            a = facts["attach"]
            claims.append(f'- Only {a["rate"]:.1%} of transactions containing a matcha drink also contained a cake/pastry item ({a["with_treat"]} of {a["matcha_transactions"]} transactions)')
            prompt = (_PROMPT
                      .replace("{facts}", json.dumps(facts, indent=1, default=str))
                      .replace("{spend}", json.dumps(briefing["spend"], indent=1))
                      .replace("{claims}", "\n".join(claims) or "- (none)"))
            # Attach the raw till export — the agent recomputes our claims
            # from the data itself (verification), never just our summary.
            csv_bytes = Path(CSV_PATH).read_bytes()[:20 * 1024 * 1024]
            created = manus_client.create_task(
                prompt, title="Café Monday Briefing copy", schema=_SCHEMA,
                share_visibility="public",
                attachments=[("square_item_sales.csv", csv_bytes)])
            print(f"[cafe] task created {created.get('task_id')}", file=sys.stderr, flush=True)
            with _LOCK:
                # Showcase the agent run itself (a Manus hackathon, after all):
                # status lives in the briefing, activity via /api/cafe/activity.
                # share_url is public so judges/owner can open it after the
                # hackathon credits are gone.
                briefing["manus"] = {"status": "working", "task_id": created["task_id"],
                                     "task_url": created.get("task_url"),
                                     "share_url": created.get("share_url")}
            result = manus_client.wait_result(created["task_id"], timeout_s=600)
            with _LOCK:
                if result:
                    merged = {**_fallback_copy(briefing["sell"], briefing["nudges"]),
                              **{k: v for k, v in result.items() if v}}
                    # Numbers are ours, wording is Manus's: re-pin every nudge's
                    # impact to the deterministic value (or null), never the
                    # agent's arithmetic.
                    det = briefing["nudges"]
                    for i, n in enumerate(merged.get("nudges") or []):
                        n["impact_gbp"] = det[i]["impact_gbp"] if i < len(det) else None
                    # Never show fewer nudges than the deterministic three.
                    if len(merged.get("nudges") or []) < len(det):
                        merged["nudges"] = list(merged.get("nudges") or []) + det[len(merged.get("nudges") or []):]
                    briefing["copy"] = merged
                    briefing["verification"] = result.get("verification") or []
                    briefing["manus"]["status"] = "done"
                    _freeze(briefing)
                    return
                briefing["manus"] = {**briefing["manus"], "status": "failed", "reason": "empty result"}
        except Exception as e:
            import sys, traceback
            traceback.print_exc(file=sys.stderr)
            with _LOCK:
                briefing["manus"] = {**briefing.get("manus", {}), "status": "failed", "reason": str(e)}

    threading.Thread(target=_enrich, daemon=True).start()
    return briefing


def agent_activity() -> list[dict]:
    """Recent events from the current briefing's Manus task (for the demo)."""
    with _LOCK:
        task_id = (_CACHE or {}).get("manus", {}).get("task_id")
    if not task_id:
        return []
    try:
        return manus_client.task_activity(task_id)
    except manus_client.ManusError:
        return []


# Two fixture homes: data/ (freshest, local dev) and the package copy
# (rsync'd to prod — deploy.sh excludes data/, so this is how the snapshot
# ships). Read data/ first; fall back to the packaged snapshot.
_DATA_FROZEN = Path(__file__).resolve().parents[3] / "data" / "cafe_briefing_frozen.json"
_PKG_FROZEN = Path(__file__).resolve().parent / "frozen_briefing.json"


def _freeze(briefing: dict) -> None:
    """Persist the last fully-enriched briefing — the offline demo fixture."""
    for path in (_DATA_FROZEN, _PKG_FROZEN):
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(briefing, indent=1, default=str))
        except OSError:
            pass


def frozen_briefing() -> dict | None:
    for path in (_DATA_FROZEN, _PKG_FROZEN):
        try:
            return json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
    return None
