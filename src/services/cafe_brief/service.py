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
from src.services.cafe_brief.pos_ingest import load_item_sales

DEFAULT_CSV = str(Path(__file__).resolve().parents[4] / "matcha-hack" / "out" / "square_item_sales.csv")
CSV_PATH = os.environ.get("CAFE_POS_CSV", DEFAULT_CSV)

# ------------------------------------------------------------------ spend

def _spend_facts() -> dict:
    """Supplier spend + P&L anchor from the seeded café demo scenario."""
    try:
        from src.services.demo_scenarios import scenario_data

        data = scenario_data("cafe")
        supplier_names = {c["name"] for c in data["contacts"] if c.get("isSupplier")}

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
                {"supplier": k, "total_gbp": round(v, 2)}
                for k, v in sorted(by_supplier.items(), key=lambda kv: -kv[1])
            ],
            "net_profit_gbp": pl.get("netProfit"),
            "period": f"{pl.get('fromDate', '')} to {pl.get('toDate', '')}".strip(),
        }
    except Exception as e:  # never let spend break the briefing
        return {"error": repr(e), "by_supplier_gbp": []}


# ----------------------------------------------------------------- nudges

_BENCHMARK_COGS = "hospitality COGS typically ~25–35% of revenue (industry rule of thumb)"
_BENCHMARK_ATTACH = 0.18


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
    if a["rate"] < _BENCHMARK_ATTACH:
        out.append({
            "title": "Bundle cake with matcha",
            "rationale": f"Only {a['rate']:.0%} of matcha lattes add a cake or pastry "
                         f"(benchmark ~{_BENCHMARK_ATTACH:.0%}). A 'matcha + cake' board at "
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
        "supplier_email_draft": "",
    }


# ----------------------------------------------------------------- manus

_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "sell_summary": {"type": "string"},
        "nudges": {"type": "array", "items": {"type": "object", "properties": {
            "title": {"type": "string"}, "rationale": {"type": "string"},
            "impact_gbp": {"type": "number"}},
            "required": ["title", "rationale", "impact_gbp"], "additionalProperties": False}},
        "industry_trend": {"type": "object", "properties": {
            "claim": {"type": "string"}, "source_name": {"type": "string"},
            "source_url": {"type": "string"}},
            "required": ["claim", "source_name", "source_url"], "additionalProperties": False},
        "supplier_email_draft": {"type": "string"},
    },
    "required": ["headline", "sell_summary", "nudges", "industry_trend", "supplier_email_draft"],
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

Do three things:
1. Write the Monday Briefing copy: a one-line headline, a 2-3 sentence sell
   summary, and sharpen the nudges. Return EXACTLY the three nudges provided,
   in the same order — improve wording and explain "so what" in plain owner
   language, but never change order or numbers (no jargon).
2. Research ONE real, current industry trend relevant to UK matcha cafés
   (e.g. matcha demand, oat-milk pricing, café cost inflation). It must come
   from a real page you browsed — return the claim in one sentence with the
   source name and URL. If you cannot verify one, say so in claim.
3. Draft a short, friendly supplier-order email for the top nudge
   (adjusting this week's order), ready for the owner to review and send.
"""


def build_briefing() -> dict:
    """Fast path: deterministic facts + fallback copy. No network."""
    facts = analyzer.analyse(load_item_sales(CSV_PATH))
    spend = _spend_facts()
    nudges = _nudges(facts, spend)
    return {
        "cafe": {"name": "Matcha Mochi — City Road (demo twin)", "pos": "Square Item Sales export"},
        "sell": facts,
        "spend": spend,
        "nudges": nudges,
        "copy": _fallback_copy(facts, nudges),
        "benchmarks": {"cogs": _BENCHMARK_COGS, "attach": _BENCHMARK_ATTACH},
        "manus": {"status": "not_started"},
    }


_CACHE: dict = {}
_LOCK = threading.Lock()


def briefing_with_manus(refresh: bool = False) -> dict:
    """Facts now; Manus enrichment in a background thread, merged when done."""
    global _CACHE
    with _LOCK:
        if _CACHE and not refresh:
            return _CACHE
        briefing = _CACHE or build_briefing()
        _CACHE = briefing

    if briefing["manus"]["status"] in ("working", "done"):
        return briefing
    if not manus_client.key_available():
        briefing["manus"] = {"status": "unavailable", "reason": "MANUS_API_KEY not set"}
        return briefing

    briefing["manus"] = {"status": "working"}

    def _enrich():
        import sys
        try:
            print(f"[cafe] _enrich start", file=sys.stderr, flush=True)
            # NOTE: str.format explodes on JSON braces in facts; use replace.
            prompt = (_PROMPT
                      .replace("{facts}", json.dumps(briefing["sell"], indent=1, default=str))
                      .replace("{spend}", json.dumps(briefing["spend"], indent=1)))
            created = manus_client.create_task(prompt, title="Café Monday Briefing copy",
                                               schema=_SCHEMA)
            print(f"[cafe] task created {created.get('task_id')}", file=sys.stderr, flush=True)
            with _LOCK:
                # Showcase the agent run itself (a Manus hackathon, after all):
                # status lives in the briefing, activity via /api/cafe/activity.
                briefing["manus"] = {"status": "working", "task_id": created["task_id"],
                                     "task_url": created.get("task_url")}
            result = manus_client.wait_result(created["task_id"], timeout_s=420)
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


FROZEN = Path(__file__).resolve().parents[3] / "data" / "cafe_briefing_frozen.json"


def _freeze(briefing: dict) -> None:
    """Persist the last fully-enriched briefing — the offline demo fixture."""
    try:
        FROZEN.parent.mkdir(parents=True, exist_ok=True)
        FROZEN.write_text(json.dumps(briefing, indent=1, default=str))
    except OSError:
        pass


def frozen_briefing() -> dict | None:
    try:
        return json.loads(FROZEN.read_text())
    except (OSError, json.JSONDecodeError):
        return None
