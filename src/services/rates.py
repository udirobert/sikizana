"""
UK statutory late-payment figures — single source of truth.

Late Payment of Commercial Debts (Interest) Act 1998:
  - Statutory interest: 8% + Bank of England base rate, per annum.
  - Fixed-sum compensation per invoice: £40 / £70 / £100 by debt size.

Every surface that quotes an interest figure (findings panel, agent
tools, chase emails, digests) must import from here — two surfaces
quoting different rates for the same invoice destroys trust.
"""

from __future__ import annotations

import os

# Bank of England base rate, configurable via env (set by the operator
# when the MPC moves it — there is no free live API worth a runtime call).
BANK_RATE = float(os.environ.get("BANK_RATE", "5.25"))

# Statutory annual interest rate on late commercial payments.
STATUTORY_INTEREST_APR = 8.0 + BANK_RATE


def statutory_interest_apr(base_rate: float = BANK_RATE) -> float:
    """Statutory APR for a given base rate (8 points above base, simple).

    Exists so callers that label a base rate they did not get from the
    environment — the game's assumptions sheet, for one — use the same
    arithmetic as the live surfaces.
    """
    return 8.0 + base_rate


def daily_statutory_interest(amount: float) -> float:
    """Interest accruing per day on an overdue commercial debt."""
    return amount * STATUTORY_INTEREST_APR / 100 / 365


def fixed_sum_compensation(amount: float) -> int:
    """
    Fixed-sum debt-recovery compensation per invoice under the LPCD Act
    s.5A: £40 where the debt does not exceed £1,000, £70 where it exceeds
    £1,000 but does not exceed £10,000, £100 where it exceeds £10,000.
    Claimable per invoice, on top of statutory interest.

    Boundaries belong to the lower band (a £1,000 debt is a £40 debt), which
    is also how `game/src/engine/rates.ts` reads the section.
    """
    if amount <= 1000:
        return 40
    if amount <= 10000:
        return 70
    return 100
