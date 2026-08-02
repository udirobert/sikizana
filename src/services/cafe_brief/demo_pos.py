"""Deterministic demo POS fixture for the café briefing.

The canonical `build_findings()` flow must *compute* café findings from POS
rows — never read pre-computed/frozen facts ("code owns numbers"). The real
Square export (`matcha-hack/out/...`) is a local dev artefact that is not
shipped, so in the demo/test environment this fixture is the honest source:
a compact, clearly-synthetic 13-week till set for the Matcha Mochi demo twin.

Shape is chosen so the analyzer produces its three canonical nudges:
  - one riser  (Iced Matcha Latte, trending up >10%)
  - one faller (Filter Coffee, trending down >10%)
  - an attach gap (matcha-latte baskets rarely include a cake/pastry, <18%)

It is NOT real customer data; the briefing labels it as a demo twin.
"""

from __future__ import annotations

import datetime as dt

from src.services.cafe_brief.pos_ingest import SaleRow

_START = dt.date(2026, 4, 27)  # a Monday, 13 weeks to late July


def _week_dates(week: int) -> list[dt.date]:
    return [_START + dt.timedelta(days=week * 7 + d) for d in range(7)]


def demo_rows() -> list[SaleRow]:
    """Return a deterministic ~13-week café POS fixture for the demo flow.

    Tuned so the analyzer produces its three canonical nudges:
      - Iced Matcha Latte: volume ramps across weeks → clear riser (>10%)
      - Filter Coffee:     volume declines across weeks → clear faller (<-10%)
      - Attach gap:        ~1 in 8 matcha-drink baskets adds a Mochi Donut
                           (~12.5% < the 18% benchmark) → attach-gap finding
    Every transaction is a *basket*: items share one txn_id so the analyzer's
    attach logic (drink basket also containing a treat) works correctly.
    """
    rows: list[SaleRow] = []
    txn = 10_000
    matcha_basket_count = 0  # for sparse, even treat attachment
    # 5 transactions/day × 7 days = 35/week baseline — enough to clear the
    # 15-units/week trend filter in the last 4 weeks for the ramping item.
    txns_per_day = 5
    for week in range(13):
        # Iced Matcha Latte share ramps 30% → 82% across the window.
        iced_share = 0.30 + 0.04 * week
        # Filter Coffee share declines 90% → 38%.
        coffee_share = max(0.90 - 0.04 * week, 0.38)
        # Matcha Latte (hot) is a steady ~90% — the attach base.
        matcha_share = 0.90
        for day in _week_dates(week):
            for n in range(txns_per_day):
                basket: list[tuple[str, str, float]] = []
                # Hot matcha latte — the attach-base drink.
                if (week * 71 + day.weekday() * 13 + n) % 100 < matcha_share * 100:
                    basket.append(("Matcha Latte", "Matcha", 4.50))
                # Iced matcha latte — the rising item.
                if (week * 53 + day.weekday() * 17 + n) % 100 < iced_share * 100:
                    basket.append(("Iced Matcha Latte", "Matcha", 5.20))
                # Filter coffee — the falling item.
                if (week * 29 + day.weekday() * 11 + n) % 100 < coffee_share * 100:
                    basket.append(("Filter Coffee", "Coffee", 3.00))
                # Mochi donut — the treat. Attached to every ~8th matcha-drink
                # basket so the attach rate lands ~12% (below the 18% benchmark).
                has_matcha_drink = any("matcha latte" in i.lower() for i, _, _ in basket)
                if has_matcha_drink:
                    matcha_basket_count += 1
                    if matcha_basket_count % 8 == 0:
                        basket.append(("Mochi Donut", "Bakery", 4.00))

                hour = 8 + (day.weekday() % 4)
                for item, cat, price in basket:
                    rows.append(SaleRow(
                        date=day,
                        time=f"{hour:02d}:15:00",
                        category=cat,
                        item=item,
                        qty=1,
                        price_point="Regular",
                        modifiers="Oat Milk" if "Latte" in item and day.weekday() % 2 == 0 else "",
                        gross=price,
                        txn_id=f"TXN-{txn}",  # shared across this basket only
                    ))
                txn += 1  # one txn_id per basket, not per day
    return rows

