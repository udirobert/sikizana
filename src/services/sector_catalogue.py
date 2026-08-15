"""Single sector catalogue — aliases, typicals, extra ratios, demo flavour.

Source of truth: ``web/lib/sector-catalogue.json`` (shared with the Next app).
Sector is a benchmark + teaching lens, not a product fork.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_CATALOGUE_PATH = (
    Path(__file__).resolve().parents[2] / "web" / "lib" / "sector-catalogue.json"
)


@lru_cache(maxsize=1)
def _raw() -> dict[str, Any]:
    return json.loads(_CATALOGUE_PATH.read_text(encoding="utf-8"))


def _sectors() -> list[dict[str, Any]]:
    return list(_raw()["sectors"])


def default_entry() -> dict[str, Any]:
    return dict(_raw()["default"])


def canonical_ids() -> list[str]:
    return [s["id"] for s in _sectors()]


def sector_labels() -> dict[str, str]:
    return {s["id"]: s["label"] for s in _sectors()}


def alias_map() -> dict[str, str]:
    out: dict[str, str] = {}
    for s in _sectors():
        out[s["id"]] = s["id"]
        for alias in s.get("aliases") or []:
            out[str(alias).lower()] = s["id"]
    return out


def keyword_pairs() -> list[tuple[str, str]]:
    return [(str(k), str(sid)) for k, sid in _raw()["keywords"]]


def get_entry(sector_id: str | None) -> dict[str, Any]:
    if not sector_id:
        return default_entry()
    for s in _sectors():
        if s["id"] == sector_id:
            return s
    return default_entry()


def benchmarks_map() -> dict[str, dict[str, float]]:
    """Shape expected by ``get_sector_benchmarks`` / check facts."""

    def _bench(entry: dict[str, Any]) -> dict[str, float]:
        return {
            "avg_receivables_days": float(entry["avgReceivablesDays"]),
            "avg_overdue_rate": float(entry["avgOverdueRate"]),
            "avg_gross_margin": float(entry["avgGrossMargin"]),
            "avg_net_margin": float(entry["avgNetMargin"]),
            "avg_invoice_value": float(entry["avgInvoiceValue"]),
            "chasing_threshold_days": float(entry["chasingThresholdDays"]),
        }

    out = {s["id"]: _bench(s) for s in _sectors()}
    out["default"] = _bench(default_entry())
    return out


def ratios_for(sector_id: str | None) -> list[dict[str, Any]]:
    """Extra operational bars. Empty = gross/net only."""
    return list(get_entry(sector_id).get("ratios") or [])


def demo_scenario_for(sector_id: str | None) -> str:
    return str(get_entry(sector_id).get("demoScenario") or "cafe")


def demo_meta(sector_id: str | None, sector_label: str | None = None) -> dict[str, Any]:
    """Honest copy about which sample books the scan actually uses."""
    sid = sector_id or "default"
    label = sector_label or get_entry(sid)["label"]
    scenario = demo_scenario_for(sid)
    if scenario == "music":
        return {
            "scenario": "music",
            "fits_sector": True,
            "cta": "Still not your books — a demo music scan for duplicates, overdue invoices, and payment risks.",
            "scan_note": "Demo music books.",
        }
    if sid == "hospitality":
        return {
            "scenario": "cafe",
            "fits_sector": True,
            "cta": "Still not your books — a demo café scan for duplicates, overdue invoices, and payment risks.",
            "scan_note": "Demo café books.",
        }
    return {
        "scenario": "cafe",
        "fits_sector": False,
        "cta": (
            f"Sample books are café-shaped (same kind of scan — duplicates, overdue, "
            f"payment risk), not {label.lower()} invoices."
        ),
        "scan_note": "Café-shaped sample books — illustrative, not this sector's invoices.",
    }


def watch_for(sector_id: str | None) -> str:
    return str(get_entry(sector_id).get("watchFor") or default_entry()["watchFor"])


def normalize_slug(slug: str) -> str:
    return slug.lower().strip().replace(" ", "_").replace("-", "_")


def display_label(slug: str, resolved: str | None = None) -> str:
    """Visitor-facing name: alias label, else title-cased slug, else canonical."""
    key = normalize_slug(slug)
    sid = resolved or alias_map().get(key)
    if sid:
        entry = get_entry(sid)
        labels = entry.get("aliasLabels") or {}
        if key in labels:
            return str(labels[key])
        if key == sid:
            return str(entry["label"])
    words = key.replace("_", " ").strip()
    if not words:
        return get_entry(sid)["label"] if sid else slug
    return words.title()


def resolve_sync(slug: str) -> str | None:
    """Alias → keyword. No LLM. Does not fall back to default (caller shows picker)."""
    key = normalize_slug(slug)
    aliases = alias_map()
    if key in aliases:
        return aliases[key]
    for keyword, sector in keyword_pairs():
        if keyword in key:
            return sector
    return None
