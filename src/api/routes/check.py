"""Quick Check endpoint — agentic sector analysis for anonymous visitors.

Runs real analysis (demo data + AP integrity rules + sector benchmarks)
and optionally enriches with a single LLM call for Siki's voice.
Falls back to deterministic template copy if the LLM is unavailable.

Sector resolution uses a three-tier approach:
  1. Exact alias match (instant)
  2. Keyword substring match against known terms (instant)
  3. LLM classification + persistent cache (first-hit ~500ms, cached thereafter)
If all fail, returns suggestions for the frontend to show a picker.

No auth required. Rate-limited by IP (shared with chat limiter).
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time as _time
from datetime import date as _date
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.api.session import _check_rate_limit
from src.services.logging import get_logger

log = get_logger("sikizana.api.check")

router = APIRouter()

# ─── Canonical sectors ───────────────────────────────────────────────────────

CANONICAL_SECTORS = [
    "retail",
    "construction",
    "professional_services",
    "hospitality",
    "manufacturing",
    "wholesale",
    "music",
]

SECTOR_LABELS: dict[str, str] = {
    "retail": "Retail",
    "construction": "Construction",
    "professional_services": "Services",
    "hospitality": "Hospitality",
    "manufacturing": "Manufacturing",
    "wholesale": "Wholesale",
    "music": "Music",
}

# ─── Sector resolution: tier 1 (exact aliases) ──────────────────────────────

_SECTOR_ALIASES: dict[str, str] = {
    "catering": "hospitality",
    "cafe": "hospitality",
    "café": "hospitality",
    "restaurant": "hospitality",
    "restaurants": "hospitality",
    "hospitality": "hospitality",
    "hotel": "hospitality",
    "hotels": "hospitality",
    "pub": "hospitality",
    "bar": "hospitality",
    "accommodation": "hospitality",
    "music": "music",
    "services": "professional_services",
    "professional_services": "professional_services",
    "agency": "professional_services",
    "consulting": "professional_services",
    "retail": "retail",
    "shop": "retail",
    "ecommerce": "retail",
    "construction": "construction",
    "builder": "construction",
    "trades": "construction",
    "manufacturing": "manufacturing",
    "factory": "manufacturing",
    "wholesale": "wholesale",
    "distribution": "wholesale",
}

# ─── Sector resolution: tier 2 (keyword substring match) ────────────────────
# Mirrors _SECTOR_KEYWORDS in src/tools/accounting_tools.py (single source
# of truth there; this is the lead-magnet copy that stays in sync).

_SECTOR_KEYWORDS: list[tuple[str, str]] = [
    ("retail", "retail"),
    ("shop", "retail"),
    ("store", "retail"),
    ("ecommerce", "retail"),
    ("e-commerce", "retail"),
    ("cafe", "hospitality"),
    ("café", "hospitality"),
    ("restaurant", "hospitality"),
    ("bar", "hospitality"),
    ("hotel", "hospitality"),
    ("catering", "hospitality"),
    ("coffee", "hospitality"),
    ("pub", "hospitality"),
    ("hostel", "hospitality"),
    ("lodge", "hospitality"),
    ("bnb", "hospitality"),
    ("b&b", "hospitality"),
    ("food", "hospitality"),
    ("kitchen", "hospitality"),
    ("bakery", "hospitality"),
    ("takeaway", "hospitality"),
    ("construct", "construction"),
    ("build", "construction"),
    ("contractor", "construction"),
    ("plumb", "construction"),
    ("electri", "construction"),
    ("roofing", "construction"),
    ("joiner", "construction"),
    ("carpent", "construction"),
    ("consult", "professional_services"),
    ("law", "professional_services"),
    ("account", "professional_services"),
    ("agency", "professional_services"),
    ("design", "professional_services"),
    ("tech", "professional_services"),
    ("architect", "professional_services"),
    ("market", "professional_services"),
    ("solicit", "professional_services"),
    ("recruit", "professional_services"),
    ("manufactur", "manufacturing"),
    ("factory", "manufacturing"),
    ("production", "manufacturing"),
    ("engineer", "manufacturing"),
    ("wholesale", "wholesale"),
    ("distribut", "wholesale"),
    ("import", "wholesale"),
    ("export", "wholesale"),
    ("music", "music"),
    ("band", "music"),
    ("artist", "music"),
    ("studio", "music"),
    ("label", "music"),
    ("record", "music"),
    ("promot", "music"),
    ("festival", "music"),
]

# ─── Sector resolution: tier 3 (LLM + cache) ────────────────────────────────

_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "sikizana.db")


def _get_cache_db() -> sqlite3.Connection:
    """Open the shared DB and ensure the sector_cache table exists."""
    db_path = os.path.abspath(_DB_PATH)
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sector_cache (
            slug TEXT PRIMARY KEY,
            sector TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    return conn


def _cache_lookup(slug: str) -> str | None:
    """Check persistent cache for a previously resolved slug."""
    try:
        conn = _get_cache_db()
        row = conn.execute("SELECT sector FROM sector_cache WHERE slug = ?", (slug,)).fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None


def _cache_store(slug: str, sector: str) -> None:
    """Store a resolved slug → sector mapping."""
    try:
        conn = _get_cache_db()
        conn.execute(
            "INSERT OR REPLACE INTO sector_cache (slug, sector) VALUES (?, ?)",
            (slug, sector),
        )
        conn.commit()
        conn.close()
    except Exception as exc:
        log.warning("sector_cache_store_failed", extra={"error": str(exc)})


async def _llm_classify_sector(slug: str) -> str | None:
    """Use a single cheap LLM call to classify a business type into a sector.

    Uses the same provider chain as enrichment (GLM 5.2 → NVIDIA → Venice).
    """
    providers = _build_provider_chain()
    if not providers:
        return None

    prompt = f"""Classify this business type into exactly one of these sectors: retail, construction, professional_services, hospitality, manufacturing, wholesale, music.

Business type: "{slug}"

Rules:
- Hotels, restaurants, cafes, bars, pubs, catering, food service → hospitality
- Shops, ecommerce, stores → retail
- Builders, plumbers, electricians, trades → construction
- Consultants, lawyers, accountants, agencies, tech → professional_services
- Factories, production, engineering → manufacturing
- Distribution, import/export, wholesale → wholesale
- Bands, artists, labels, studios, promoters → music

If you cannot confidently classify it, respond with just the word "unknown".
Respond with ONLY the sector name (one word/phrase), nothing else."""

    from openai import AsyncOpenAI

    for provider in providers:
        try:
            headers = provider.get("default_headers")
            client = AsyncOpenAI(
                base_url=provider["base_url"],
                api_key=provider["api_key"],
                timeout=provider.get("timeout", 8.0),
                max_retries=0,
                default_headers=headers,
            )
            response = await client.chat.completions.create(
                model=provider["model"],
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=20,
            )
            result = (response.choices[0].message.content or "").strip().lower().replace(" ", "_")
            if result in CANONICAL_SECTORS:
                return result
        except Exception as exc:
            log.warning(
                "sector_classify_provider_failed",
                extra={
                    "provider": provider["name"],
                    "slug": slug,
                    "error": str(exc),
                },
            )
            continue

    return None


def _resolve_sector(slug: str) -> str | None:
    """Three-tier sector resolution: alias → keyword → cache.

    Returns canonical sector ID or None. Does NOT call LLM (that's async).
    """
    key = slug.lower().strip().replace(" ", "_").replace("-", "_")

    # Tier 1: exact alias
    if key in _SECTOR_ALIASES:
        return _SECTOR_ALIASES[key]

    # Tier 2: keyword substring match
    for keyword, sector in _SECTOR_KEYWORDS:
        if keyword in key:
            return sector

    # Tier 3: check cache (previously LLM-resolved)
    cached = _cache_lookup(key)
    if cached:
        return cached

    return None


async def _resolve_sector_with_llm(slug: str) -> str | None:
    """Full resolution including async LLM fallback. Caches result."""
    # Try synchronous resolution first
    resolved = _resolve_sector(slug)
    if resolved:
        return resolved

    # Tier 4: LLM classification
    key = slug.lower().strip().replace(" ", "_").replace("-", "_")
    classified = await _llm_classify_sector(slug)
    if classified:
        _cache_store(key, classified)
        return classified

    return None


# ─── Sector-specific ratios ──────────────────────────────────────────────────
# Key operational ratios that matter most for each sector. These are the
# "novel indicators" a bookkeeper actually tracks — beyond gross/net margin.

SECTOR_RATIOS: dict[str, list[dict[str, Any]]] = {
    "hospitality": [
        {
            "id": "staff_cost",
            "label": "Staff cost % of revenue",
            "typical": 0.30,
            "range": [0.25, 0.35],
            "unit": "%",
            "multiplier": 100,
        },
        {
            "id": "rent_cost",
            "label": "Rent % of revenue",
            "typical": 0.10,
            "range": [0.06, 0.15],
            "unit": "%",
            "multiplier": 100,
        },
    ],
    "retail": [
        {
            "id": "rent_cost",
            "label": "Rent % of revenue",
            "typical": 0.12,
            "range": [0.08, 0.18],
            "unit": "%",
            "multiplier": 100,
        },
        {
            "id": "shrinkage",
            "label": "Shrinkage % of stock",
            "typical": 0.015,
            "range": [0.01, 0.03],
            "unit": "%",
            "multiplier": 100,
        },
    ],
    "construction": [
        {
            "id": "labour_cost",
            "label": "Labour % of revenue",
            "typical": 0.35,
            "range": [0.28, 0.45],
            "unit": "%",
            "multiplier": 100,
        },
        {
            "id": "materials_cost",
            "label": "Materials % of revenue",
            "typical": 0.40,
            "range": [0.30, 0.50],
            "unit": "%",
            "multiplier": 100,
        },
    ],
    "professional_services": [
        {
            "id": "staff_cost",
            "label": "Staff cost % of revenue",
            "typical": 0.55,
            "range": [0.45, 0.65],
            "unit": "%",
            "multiplier": 100,
        },
        {
            "id": "utilisation",
            "label": "Utilisation rate",
            "typical": 0.70,
            "range": [0.60, 0.80],
            "unit": "%",
            "multiplier": 100,
        },
    ],
    "manufacturing": [
        {
            "id": "materials_cost",
            "label": "Materials % of revenue",
            "typical": 0.45,
            "range": [0.35, 0.55],
            "unit": "%",
            "multiplier": 100,
        },
        {
            "id": "energy_cost",
            "label": "Energy % of revenue",
            "typical": 0.08,
            "range": [0.04, 0.12],
            "unit": "%",
            "multiplier": 100,
        },
    ],
    "wholesale": [
        {
            "id": "logistics_cost",
            "label": "Logistics % of revenue",
            "typical": 0.08,
            "range": [0.05, 0.12],
            "unit": "%",
            "multiplier": 100,
        },
        {
            "id": "inventory_days",
            "label": "Inventory days",
            "typical": 35,
            "range": [20, 50],
            "unit": "days",
            "multiplier": 1,
        },
    ],
    "music": [
        {
            "id": "production_cost",
            "label": "Production % of revenue",
            "typical": 0.25,
            "range": [0.15, 0.40],
            "unit": "%",
            "multiplier": 100,
        },
        {
            "id": "marketing_cost",
            "label": "Marketing % of revenue",
            "typical": 0.15,
            "range": [0.08, 0.25],
            "unit": "%",
            "multiplier": 100,
        },
    ],
}

# ─── Which demo scenario to use ─────────────────────────────────────────────

_SECTOR_TO_SCENARIO: dict[str, str] = {
    "hospitality": "cafe",
    "music": "music",
}


# ─── Core analysis logic ─────────────────────────────────────────────────────


def _compute_facts(sector: str) -> dict[str, Any]:
    """Run deterministic analysis over demo data for the sector."""
    from src.services.demo_scenarios import scenario_data
    from src.services.ap_integrity.service import build_ap_findings_stateless
    from src.tools.accounting_tools import _SECTOR_BENCHMARKS

    scenario_key = _SECTOR_TO_SCENARIO.get(sector, "cafe")
    data = scenario_data(scenario_key)
    bench = _SECTOR_BENCHMARKS.get(sector, _SECTOR_BENCHMARKS["default"])

    invoices = data["invoices"]
    payments = data["payments"]
    contacts = data["contacts"]
    pl = data["pl"]

    # Overdue analysis
    today = _date.today()
    accrec = [i for i in invoices if i.get("type") == "ACCREC"]
    overdue = []
    for inv in accrec:
        due_str = inv.get("dueDate", "")
        if not due_str or inv.get("status") == "PAID":
            continue
        try:
            due = _date.fromisoformat(str(due_str)[:10])
            days_late = (today - due).days
            if days_late > 0:
                overdue.append(
                    {
                        "contact": inv.get("contact", {}).get("name", "Unknown"),
                        "amount": inv.get("amountDue", 0),
                        "days_late": days_late,
                        "invoice_number": inv.get("invoiceNumber", ""),
                    }
                )
        except (ValueError, TypeError):
            pass

    total_overdue_amount = sum(i["amount"] for i in overdue)
    total_accrec = len(accrec)
    overdue_rate = len(overdue) / total_accrec if total_accrec > 0 else 0

    # AP integrity scan
    ap_findings = build_ap_findings_stateless(
        invoices=[i for i in invoices if i.get("type") == "ACCPAY"],
        contacts=contacts,
        payments=payments,
    )

    # P&L metrics
    revenue = 0.0
    cogs = 0.0
    for row in pl.get("rows", []):
        val = row.get("value", 0)
        code = row.get("account", "").lower()
        if "sales" in code or "revenue" in code:
            revenue += val
        elif "cost of goods" in code or "cogs" in code:
            cogs += abs(val)

    net_profit = pl.get("netProfit", 0)
    gross_margin = (revenue - cogs) / revenue if revenue > 0 else 0
    net_margin = net_profit / revenue if revenue > 0 else 0

    return {
        "sector": sector,
        "scenario": scenario_key,
        "org_name": data["org"].get("name", "Demo Ltd"),
        "benchmarks": bench,
        "overdue": overdue,
        "total_overdue_amount": total_overdue_amount,
        "overdue_rate": overdue_rate,
        "overdue_count": len(overdue),
        "total_invoices": total_accrec,
        "ap_findings": ap_findings,
        "ap_findings_count": len(ap_findings),
        "revenue": revenue,
        "gross_margin": gross_margin,
        "net_margin": net_margin,
        "net_profit": net_profit,
    }


def _deterministic_findings(facts: dict[str, Any]) -> list[dict[str, Any]]:
    """Build structured findings from computed facts without an LLM."""
    sector = facts["sector"]
    bench = facts["benchmarks"]
    sector_label = sector.replace("_", " ").title()
    findings: list[dict[str, Any]] = []

    # Finding 1: Margins
    gross_pct = round(facts["gross_margin"] * 100)
    net_pct = round(facts["net_margin"] * 100)
    bench_gross = round(bench["avg_gross_margin"] * 100)
    bench_net = round(bench["avg_net_margin"] * 100)

    if gross_pct >= bench_gross + 5:
        margin_detail = f"Gross margin ({gross_pct}%) sits above the typical {bench_gross}% for {sector_label.lower()}. Net is {net_pct}% vs typical {bench_net}%."
    elif gross_pct <= bench_gross - 5:
        margin_detail = f"Gross margin ({gross_pct}%) sits below the typical {bench_gross}% for {sector_label.lower()}. Mix or COGS is the first place to look."
    else:
        margin_detail = f"Margins ({gross_pct}% gross, {net_pct}% net) are in the typical band for {sector_label.lower()} ({bench_gross}% / {bench_net}%)."

    findings.append(
        {
            "id": "margins",
            "label": "Margin check",
            "detail": f"~{gross_pct}% gross · ~{net_pct}% net",
            "tone": "info",
            "evidence": margin_detail,
        }
    )

    # Finding 2: Overdue exposure
    if facts["overdue_count"] > 0:
        worst = max(facts["overdue"], key=lambda x: x["amount"])
        findings.append(
            {
                "id": "overdue",
                "label": "Overdue exposure",
                "detail": f"£{facts['total_overdue_amount']:,.0f} across {facts['overdue_count']} invoice{'s' if facts['overdue_count'] != 1 else ''}",
                "tone": "risk",
                "evidence": f"Largest: £{worst['amount']:,.0f} from {worst['contact']} ({worst['days_late']}d late). Sector typical overdue rate is ~{round(bench['avg_overdue_rate'] * 100)}%.",
            }
        )
    else:
        findings.append(
            {
                "id": "overdue",
                "label": "Overdue exposure",
                "detail": "No overdue invoices right now",
                "tone": "info",
                "evidence": f"Clean slate — but the typical {sector_label.lower()} overdue rate is ~{round(bench['avg_overdue_rate'] * 100)}%, so worth monitoring.",
            }
        )

    # Finding 3: AP integrity
    if facts["ap_findings_count"] > 0:
        first_ap = facts["ap_findings"][0]
        amount = first_ap.get("amount", 0)
        findings.append(
            {
                "id": "ap_risk",
                "label": "Payment exception",
                "detail": f"{first_ap.get('title', 'Possible duplicate')} · £{amount:,.0f}",
                "tone": "risk",
                "evidence": first_ap.get(
                    "description", "A payment anomaly was detected that warrants review."
                ),
            }
        )
    else:
        findings.append(
            {
                "id": "ap_risk",
                "label": "Payment integrity",
                "detail": "No duplicate or anomalous payments detected",
                "tone": "info",
                "evidence": "AP scan ran clean across all payable transactions in these demo books.",
            }
        )

    return findings


async def _enrich_with_llm(facts: dict[str, Any]) -> list[dict[str, Any]] | None:
    """Multi-provider LLM enrichment: GLM 5.2 (Vercel AI Gateway) → NVIDIA NIM → None.

    Each provider is OpenAI-compatible. Tries them in order; first success wins.
    Returns None if all fail, signalling deterministic fallback.
    """
    sector_label = facts["sector"].replace("_", " ").title()
    bench = facts["benchmarks"]

    prompt = f"""You are Siki, an AI finance assistant. You just scanned demo books for a {sector_label.lower()} business ({facts["org_name"]}).

Here are the computed facts from your analysis:
- Revenue: £{facts["revenue"]:,.0f}, Gross margin: {round(facts["gross_margin"] * 100)}%, Net margin: {round(facts["net_margin"] * 100)}%, Net profit: £{facts["net_profit"]:,.0f}
- Sector typical: {round(bench["avg_gross_margin"] * 100)}% gross, {round(bench["avg_net_margin"] * 100)}% net
- Overdue: {facts["overdue_count"]} invoices totalling £{facts["total_overdue_amount"]:,.0f} (sector typical rate: ~{round(bench["avg_overdue_rate"] * 100)}%)
- AP scan: {facts["ap_findings_count"]} exception(s) found{f" — first: {facts['ap_findings'][0].get('title', '')}" if facts["ap_findings"] else ""}
- Worst overdue: {facts["overdue"][0]["contact"] + ", £" + str(int(facts["overdue"][0]["amount"])) + ", " + str(facts["overdue"][0]["days_late"]) + "d late" if facts["overdue"] else "none"}

Produce exactly 3 findings as a JSON array. Each finding has:
- "id": one of "margins", "overdue", "ap_risk"
- "label": short title (4-6 words)
- "detail": one-line stat summary
- "tone": "info", "watch", or "risk"
- "evidence": 1-2 sentences in Siki's plain-English voice explaining what this means and what to check. Be specific, reference the numbers, never accuse — describe as a risk requiring review.

Return ONLY the JSON array, no markdown fencing, no other text."""

    # Provider chain: try each in order, first success wins
    providers = _build_provider_chain()
    if not providers:
        return None

    from openai import AsyncOpenAI

    for provider in providers:
        try:
            headers = provider.get("default_headers")
            client = AsyncOpenAI(
                base_url=provider["base_url"],
                api_key=provider["api_key"],
                timeout=provider.get("timeout", 10.0),
                max_retries=0,
                default_headers=headers,
            )
            response = await client.chat.completions.create(
                model=provider["model"],
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=600,
            )
            content = (response.choices[0].message.content or "").strip()
            findings = _parse_findings_response(content)
            if findings:
                log.info(
                    "check_enrichment_ok",
                    extra={"provider": provider["name"], "sector": facts["sector"]},
                )
                return findings
        except Exception as exc:
            log.warning(
                "check_enrichment_provider_failed",
                extra={
                    "provider": provider["name"],
                    "error": str(exc),
                },
            )
            continue

    return None


def _build_provider_chain() -> list[dict[str, Any]]:
    """Build the ordered list of LLM providers to try.

    Priority: GLM 5.2 (Vercel AI Gateway, free for Eve agents) → NVIDIA NIM → Venice.
    Only includes providers with configured API keys.
    """
    providers: list[dict[str, Any]] = []

    # 1. GLM 5.2 via Vercel AI Gateway (free for eve agents via Blackbox on AI Gateway)
    vercel_key = os.environ.get("VERCEL_AI_GATEWAY_KEY", "")
    if vercel_key:
        eve_headers = {
            "User-Agent": "eve-agent/1.0.0",
            "x-vercel-ai-agent": "eve",
        }
        primary_model = os.environ.get("VERCEL_AI_MODEL", "zai/glm-5.2")
        providers.append(
            {
                "name": f"glm-5.2 ({primary_model})",
                "base_url": "https://ai-gateway.vercel.sh/v1",
                "api_key": vercel_key,
                "model": primary_model,
                "timeout": 8.0,
                "default_headers": eve_headers,
            }
        )
        if primary_model != "zai/glm-5.2-fast":
            providers.append(
                {
                    "name": "glm-5.2-fast (zai/glm-5.2-fast)",
                    "base_url": "https://ai-gateway.vercel.sh/v1",
                    "api_key": vercel_key,
                    "model": "zai/glm-5.2-fast",
                    "timeout": 8.0,
                    "default_headers": eve_headers,
                }
            )

    # 2. NVIDIA NIM (primary production provider)
    nvidia_key = os.environ.get("NVIDIA_API_KEY", "")
    if nvidia_key:
        providers.append(
            {
                "name": "nvidia-nim",
                "base_url": "https://integrate.api.nvidia.com/v1",
                "api_key": nvidia_key,
                "model": os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct"),
                "timeout": 10.0,
            }
        )

    # 3. Venice AI (cross-provider fallback)
    venice_key = os.environ.get("VENICE_API_KEY", "")
    if venice_key:
        providers.append(
            {
                "name": "venice",
                "base_url": "https://api.venice.ai/api/v1",
                "api_key": venice_key,
                "model": os.environ.get("VENICE_MODEL", "llama-3.3-70b"),
                "timeout": 10.0,
            }
        )

    return providers


def _parse_findings_response(content: str) -> list[dict[str, Any]] | None:
    """Parse and validate LLM response into findings list."""
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    try:
        findings = json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return None

    if not isinstance(findings, list) or len(findings) < 1:
        return None

    for f in findings:
        if not isinstance(f, dict):
            return None
        if not all(k in f for k in ("id", "label", "detail", "tone", "evidence")):
            return None
        if f["tone"] not in ("info", "watch", "risk"):
            f["tone"] = "info"

    return findings[:3]


# ─── Response caching ────────────────────────────────────────────────────────
# Demo data never changes between deploys, so deterministic results are stable
# per sector. LLM-enriched results are cached for 1h (same substance, just voice).

_SCAN_CACHE: dict[str, tuple[float, dict]] = {}  # sector → (timestamp, response)
_SCAN_CACHE_TTL = 3600  # 1 hour for LLM-enriched, effectively infinite for deterministic


def _get_cached_scan(sector: str) -> dict | None:
    """Return cached scan response if fresh."""
    entry = _SCAN_CACHE.get(sector)
    if entry is None:
        return None
    ts, data = entry
    # Deterministic results never expire (demo data is static)
    if data.get("source") == "rules":
        return data
    # LLM-enriched results expire after TTL
    if _time.time() - ts < _SCAN_CACHE_TTL:
        return data
    return None


def _store_scan_cache(sector: str, data: dict) -> None:
    """Cache a scan response."""
    _SCAN_CACHE[sector] = (_time.time(), data)


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/api/check/{sector}/benchmarks")
async def quick_check_benchmarks(sector: str, request: Request):
    """Lightweight benchmarks + ratios — no AP scan, no LLM, fully static.

    Used by the frontend on page load for instant value (benchmarks +
    "yours" inputs). No rate limiting needed — response is pure static data.
    Cacheable indefinitely by CDN/browser.
    """
    # Resolve sector (sync only — no LLM for the lightweight path)
    resolved = _resolve_sector(sector)

    if not resolved:
        # Try async resolution for unknown slugs
        resolved = await _resolve_sector_with_llm(sector)

    if not resolved:
        return JSONResponse(
            status_code=200,
            content={
                "resolved": False,
                "slug": sector,
                "suggestions": [{"id": s, "label": SECTOR_LABELS[s]} for s in CANONICAL_SECTORS],
            },
            headers={"Cache-Control": "public, max-age=86400"},
        )

    from src.tools.accounting_tools import _SECTOR_BENCHMARKS

    bench = _SECTOR_BENCHMARKS.get(resolved, _SECTOR_BENCHMARKS["default"])
    ratios = SECTOR_RATIOS.get(resolved, [])

    return JSONResponse(
        content={
            "resolved": True,
            "sector": resolved,
            "sector_label": SECTOR_LABELS.get(resolved, resolved.replace("_", " ").title()),
            "benchmarks": {
                "gross_margin": round(bench["avg_gross_margin"] * 100),
                "net_margin": round(bench["avg_net_margin"] * 100),
                "avg_receivables_days": bench["avg_receivables_days"],
                "avg_overdue_rate": round(bench["avg_overdue_rate"] * 100),
            },
            "ratios": ratios,
        },
        headers={"Cache-Control": "public, max-age=86400"},  # 24h — static data
    )


@router.get("/api/check/{sector}")
async def quick_check(sector: str, request: Request):
    """Full agentic scan — real AP analysis + LLM enrichment.

    Only called when the user explicitly clicks "Run Siki's check".
    Results are cached in-memory per sector (deterministic: forever,
    LLM-enriched: 1h). Rate-limited.
    """
    _check_rate_limit(request)

    # Attempt full resolution (including async LLM fallback)
    resolved = await _resolve_sector_with_llm(sector)

    if not resolved:
        return JSONResponse(
            status_code=200,
            content={
                "resolved": False,
                "slug": sector,
                "suggestions": [{"id": s, "label": SECTOR_LABELS[s]} for s in CANONICAL_SECTORS],
            },
        )

    # Check cache first
    cached = _get_cached_scan(resolved)
    if cached:
        return JSONResponse(
            content=cached,
            headers={"Cache-Control": "public, max-age=300", "X-Cache": "hit"},
        )

    facts = _compute_facts(resolved)

    # Try LLM enrichment with timeout; fall back to deterministic
    try:
        findings = await asyncio.wait_for(_enrich_with_llm(facts), timeout=12.0)
    except asyncio.TimeoutError:
        log.warning("check_llm_timeout", extra={"sector": resolved})
        findings = None
    source = "agent"
    if findings is None:
        findings = _deterministic_findings(facts)
        source = "rules"

    ratios = SECTOR_RATIOS.get(resolved, [])

    response_data = {
        "resolved": True,
        "sector": resolved,
        "sector_label": SECTOR_LABELS.get(resolved, resolved.replace("_", " ").title()),
        "org_name": facts["org_name"],
        "findings": findings,
        "source": source,
        "ratios": ratios,
        "benchmarks": {
            "gross_margin": round(facts["benchmarks"]["avg_gross_margin"] * 100),
            "net_margin": round(facts["benchmarks"]["avg_net_margin"] * 100),
            "avg_receivables_days": facts["benchmarks"]["avg_receivables_days"],
            "avg_overdue_rate": round(facts["benchmarks"]["avg_overdue_rate"] * 100),
        },
        "meta": {
            "total_invoices": facts["total_invoices"],
            "overdue_count": facts["overdue_count"],
            "total_overdue_amount": facts["total_overdue_amount"],
            "ap_findings_count": facts["ap_findings_count"],
            "gross_margin": round(facts["gross_margin"] * 100),
            "net_margin": round(facts["net_margin"] * 100),
        },
    }

    _store_scan_cache(resolved, response_data)

    return JSONResponse(
        content=response_data,
        headers={"Cache-Control": "public, max-age=300", "X-Cache": "miss"},
    )
