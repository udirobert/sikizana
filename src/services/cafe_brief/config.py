"""Release controls and benchmarks for the Café Briefing findings domain.

Mirrors the AP Integrity release-control pattern: a global kill switch and an
authenticated-user allowlist, so the café vertical stays opt-in and reversible
until the design-partner pilot graduates. Every figure the findings cite comes
from the deterministic analyzer; the benchmarks here are the labelled context
(the "code owns numbers, agents own prose" line).
"""

from __future__ import annotations

import os


def _csv_set(value: str) -> set[str]:
    return {item.strip() for item in value.split(",") if item.strip()}


def is_cafe_brief_enabled(user_id: int | None = None) -> bool:
    """Return whether café findings should evaluate for this request.

    `CAFE_BRIEF_DISABLED=true` is the global kill switch (preserves any
    reviewed records). When `CAFE_BRIEF_USER_IDS` is set, only those
    authenticated users receive café findings. With no allowlist the feature
    is enabled by default for demo sessions — the café is the default demo
    scenario, so the briefing belongs on the demo books page.
    """
    if os.getenv("CAFE_BRIEF_DISABLED", "").strip().lower() in {"1", "true", "yes", "on"}:
        return False

    allowlist = _csv_set(os.getenv("CAFE_BRIEF_USER_IDS", ""))
    if not allowlist:
        return True
    return user_id is not None and str(user_id) in allowlist


# Benchmarks harvested from a cited corpus (Manus research run, 2026-08-01).
# The frozen fixture and the analyzer both use this 18% attach benchmark; the
# corpus nudges it to 20–25% (The Happy Manager). The findings cite the value
# the analyzer actually computed against, so the page and the finding agree.
BENCHMARK_ATTACH = 0.18
BENCHMARK_COGS = "hospitality COGS typically ~25–35% of revenue"
BENCHMARK_COGS_SOURCE = {
    "name": "Notions Coffee Consult",
    "url": "https://www.thenotions.com.au/blog/coffee-shop-profit-margin",
}
BENCHMARK_SOURCES = {
    "labour_pct": {"value": "38–48% of revenue", "source": "Brikly"},
    "net_margin_pct": {"value": "5–12% (2026, UK independents)", "source": "Brikly"},
    "attach_rate": {"value": "20–25% pastry/cake add-on", "source": "The Happy Manager"},
    "food_waste_pct": {"value": "4–10% of items purchased", "source": "Business Waste"},
    "matcha_market": {
        "value": "US$40.1m in 2025 (projected to double)",
        "source": "Grand View Research",
    },
    "delivery_commission": {
        "value": "Deliveroo 25–35% · Uber Eats ~30% · Just Eat ~14–16%",
        "source": "WaveGrocery / Aexir",
    },
}
