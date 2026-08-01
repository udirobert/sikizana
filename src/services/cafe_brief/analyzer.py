"""Deterministic sales-mix analysis over parsed Item Sales rows.

Every number the briefing shows is computed here. LLMs never see the CSV and
never invent figures — they wordsmith facts and research cited trends only.
"""

from __future__ import annotations

import collections
import datetime as dt
from statistics import mean

from src.services.cafe_brief.pos_ingest import SaleRow

MIN_WEEKLY_UNITS = 15  # ignore retail/noise items for trend calls
LATTE_ITEMS = {"Latte", "Cappuccino", "Matcha Latte", "Iced Matcha Latte", "Hojicha Latte"}


def _week_index(date: dt.date, start: dt.date) -> int:
    return max(0, (date - start).days // 7)


def _trend(weeks: list[int]) -> tuple[float, float]:
    """(pct change, absolute units/wk change) last 4 wks vs prior 4 wks."""
    if len(weeks) < 8:
        return 0.0, 0.0
    prev, last = mean(weeks[-8:-4]), mean(weeks[-4:])
    if prev == 0:
        return (0.0, 0.0) if last == 0 else (100.0, last)
    return round((last - prev) / prev * 100, 1), round(last - prev, 1)


def analyse(
    rows: list[SaleRow],
    matcha_keywords: tuple[str, ...] = ("matcha",),
    treat_keywords: tuple[str, ...] = ("cake", "donut", "loaf", "croissant"),
) -> dict:
    if not rows:
        raise ValueError("no sales rows")

    start, end = min(r.date for r in rows), max(r.date for r in rows)
    n_weeks = min(13, (end - start).days // 7 + 1)

    weekly_units: dict[str, list[int]] = collections.defaultdict(lambda: [0] * n_weeks)
    revenue: collections.Counter = collections.Counter()
    txn_basket: dict[str, float] = collections.defaultdict(float)
    txn_items: dict[str, set[str]] = collections.defaultdict(set)
    txn_dates: set = set()
    hour_units: collections.Counter = collections.Counter()

    item_category: dict[str, str] = {}
    for r in rows:
        wk = _week_index(r.date, start)
        if wk >= n_weeks:
            continue
        item_category.setdefault(r.item, r.category)
        weekly_units[r.item][wk] += r.qty
        revenue[r.item] += r.gross
        txn_basket[r.txn_id] += r.gross
        txn_items[r.txn_id].add(r.item.lower())
        txn_dates.add(r.date)
        try:
            hour_units[int(r.time.split(":")[0])] += r.qty
        except (ValueError, IndexError):
            pass

    # --- risers & fallers (volume-filtered) ---
    moves = []
    for item, weeks in weekly_units.items():
        if mean(weeks[-4:]) < MIN_WEEKLY_UNITS:
            continue
        if item_category.get(item, "").lower() == "retail":
            continue  # shelf noise — trends are about the menu
        pct, abs_delta = _trend(weeks)
        moves.append({"item": item, "pct_change": pct, "units_per_week": round(mean(weeks[-4:])),
                      "abs_delta": abs_delta, "weekly": weeks})
    risers = sorted((m for m in moves if m["pct_change"] > 10), key=lambda m: -m["pct_change"])[:3]
    fallers = sorted((m for m in moves if m["pct_change"] < -10), key=lambda m: m["pct_change"])[:3]

    # --- attach rate: % of keyword-drink baskets that also contain a treat ---
    def has_any(items: set[str], kws: tuple[str, ...]) -> bool:
        return any(kw in i for kw in kws for i in items)

    drink_txns = [t for t, items in txn_items.items() if has_any(items, matcha_keywords)]
    attached = [t for t in drink_txns if has_any(txn_items[t], treat_keywords)]
    attach_rate = len(attached) / len(drink_txns) if drink_txns else 0.0

    dayparts = {
        "morning (6-11)": sum(v for h, v in hour_units.items() if 6 <= h < 11),
        "lunch (11-14)": sum(v for h, v in hour_units.items() if 11 <= h < 14),
        "afternoon (14-17)": sum(v for h, v in hour_units.items() if 14 <= h < 17),
        "evening (17+)": sum(v for h, v in hour_units.items() if h >= 17 or h < 6),
    }
    total_units = sum(dayparts.values()) or 1

    n_txns = max(len(txn_basket), 1)
    n_days = max(len(txn_dates), 1)

    # --- weekly rhythm: 7 days x hours 6..20, unit counts (the heatmap) ---
    H0, H1 = 6, 21
    grid = [[0] * (H1 - H0) for _ in range(7)]
    for r in rows:
        try:
            h = int(r.time.split(":")[0])
        except (ValueError, IndexError):
            continue
        if H0 <= h < H1:
            grid[r.date.weekday()][h - H0] += r.qty
    flat = [v for row in grid for v in row]
    peak_i = flat.index(max(flat)) if flat and max(flat) else 0

    # --- supply signals from modifiers (what to order more of) ---
    latte_like = [r for r in rows if r.item in LATTE_ITEMS]
    oat = sum(1 for r in latte_like if "oat" in r.modifiers.lower())
    matcha_rows = [r for r in rows if any(k in r.item.lower() for k in matcha_keywords)]
    shot = sum(1 for r in matcha_rows if "shot" in r.modifiers.lower())

    # --- weekly revenue mix by category (stacked-bar series) ---
    cat_week: dict[str, list[float]] = collections.defaultdict(lambda: [0.0] * n_weeks)
    for r in rows:
        wk = _week_index(r.date, start)
        if wk < n_weeks:
            cat_week[r.category][wk] += r.gross

    facts_rhythm = {
        "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "hours": list(range(H0, H1)),
        "grid": grid,
        "peak": {
            "day": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][peak_i // (H1 - H0)],
            "hour": H0 + peak_i % (H1 - H0),
        },
    }

    return {
        "window": {"start": start.isoformat(), "end": end.isoformat(), "weeks": n_weeks},
        "totals": {
            "transactions": n_txns,
            "transactions_per_day": round(n_txns / n_days),
            "avg_basket_gbp": round(sum(txn_basket.values()) / n_txns, 2),
            "revenue_gbp": round(sum(revenue.values()), 0),
        },
        "top_items_by_revenue": [
            {"item": k, "revenue_gbp": round(v, 0)} for k, v in revenue.most_common(8)
        ],
        "risers": risers,
        "fallers": fallers,
        "attach": {
            "matcha_transactions": len(drink_txns),
            "with_treat": len(attached),
            "rate": round(attach_rate, 3),
            "weekly_opportunity_gbp": round(
                max(0.0, 0.18 - attach_rate) * len(drink_txns) / n_weeks * 5.0, 0
            ),  # toward an 18% attach benchmark at ~£5/treat
        },
        "daypart_share": {k: round(v / total_units, 3) for k, v in dayparts.items()},
        "rhythm": facts_rhythm,
        "modifiers": {
            "oat_milk_share": round(oat / max(len(latte_like), 1), 3),
            "extra_shot_share": round(shot / max(len(matcha_rows), 1), 3),
        },
        "mix": {
            "categories": sorted(cat_week, key=lambda c: -sum(cat_week[c])),
            "weekly_revenue": {c: [round(v, 0) for v in wks] for c, wks in cat_week.items()},
        },
    }
