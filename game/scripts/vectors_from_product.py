"""Emit the shared-quantity golden vectors the game's tests are pinned to.

Provenance matters here: these numbers must come from Sikizana's own rate
module, not from the game. `game/tests/vectors.test.ts` asserts the game's
engine reproduces every row, so "checked against the product" is a test, not
a claim.

Regenerate after any rate change:

    python game/scripts/vectors_from_product.py

The base rates include both the game's labelled input (3.75% — Bank of England
base since 18 Dec 2025) and the product's env default (5.25%), so a divergence
in either direction fails the suite instead of hiding.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.services.rates import (  # noqa: E402
    STATUTORY_INTEREST_APR,
    fixed_sum_compensation,
    statutory_interest_apr,
)

BACKEND = 8.0
BASE_RATES = [3.75, 5.25]
PRINCIPALS = [500, 1000, 1000.01, 2400, 5952, 10000, 10000.01, 15500]
DAYS = [1, 30, 42, 60, 90, 365]


def main() -> None:
    rows = []
    for base in BASE_RATES:
        apr = BACKEND + base
        for principal in PRINCIPALS:
            for days in DAYS:
                rows.append(
                    {
                        "base_rate_pct": base,
                        "apr_pct": apr,
                        "principal": principal,
                        "days_late": days,
                        # Same formula the product accrues with, at this base.
                        "interest": principal * apr / 100 / 365 * days,
                        "compensation": fixed_sum_compensation(principal),
                    }
                )
    payload = {
        "generator": "game/scripts/vectors_from_product.py",
        "source": "src/services/rates.py",
        "note": "Shared quantities only: statutory interest + fixed compensation.",
        "product_default_apr_pct": STATUTORY_INTEREST_APR,
        "product_apr_at_game_base_pct": statutory_interest_apr(BASE_RATES[0]),
        "rows": rows,
    }
    out = ROOT / "game" / "tests" / "fixtures" / "product-vectors.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"{len(rows)} vectors → {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
