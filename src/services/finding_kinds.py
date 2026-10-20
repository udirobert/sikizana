"""Canonical finding-kind vocabulary — the single source of truth for the
``finding.kind`` wire values emitted by the backend and consumed by the web
panel, digest, and review endpoints.

Every emitter uses these constants rather than string literals, so a typo or
a new kind added on one side only fails loudly (name error / sync test)
instead of silently rendering a card with no icon or review affordance.

Mirrored on the frontend by ``web/lib/api.ts`` (``FindingKind`` union) and
``web/lib/finding-kinds.ts`` (``FINDING_KIND_META`` — label, icon, gloss,
reviewable, chaseable, domain per kind).
``tests/test_finding_kind_sync.py`` fails if the two vocabularies drift.

Adding a finding kind:
  1. Add the constant here and put it in the right domain set (AP_KINDS,
     CAFE_KINDS, …) — or create a new domain set for a new domain.
  2. Add the literal to ``FindingKind`` in web/lib/api.ts and a meta entry in
     FINDING_KIND_META (tsc enforces exhaustiveness).
  3. Add a digest icon in services/digest.py if the digest should render it.
"""

from __future__ import annotations

from typing import Literal

# --- Receivables / core bookkeeping ---
OVERDUE_INVOICE = "overdue_invoice"
OVERDUE_BILL = "overdue_bill"
UNRECONCILED = "unreconciled"
TAX_FLAG = "tax_flag"

# --- AP Integrity ---
AP_DUPLICATE_BILL = "ap_duplicate_bill"
AP_DUPLICATE_PAYMENT = "ap_duplicate_payment"
AP_SUPPLIER_DETAIL_CHANGE = "ap_supplier_detail_change"
AP_PAYMENT_ANOMALY = "ap_payment_anomaly"

# --- Café briefing ---
CAFE_RISING_ITEM = "cafe_rising_item"
CAFE_DECLINING_ITEM = "cafe_declining_item"
CAFE_ATTACH_GAP = "cafe_attach_gap"

FindingKind = Literal[
    "overdue_invoice",
    "overdue_bill",
    "unreconciled",
    "tax_flag",
    "ap_duplicate_bill",
    "ap_duplicate_payment",
    "ap_supplier_detail_change",
    "ap_payment_anomaly",
    "cafe_rising_item",
    "cafe_declining_item",
    "cafe_attach_gap",
]

OVERDUE_KINDS = frozenset({OVERDUE_INVOICE, OVERDUE_BILL})
AP_KINDS = frozenset(
    {
        AP_DUPLICATE_BILL,
        AP_DUPLICATE_PAYMENT,
        AP_SUPPLIER_DETAIL_CHANGE,
        AP_PAYMENT_ANOMALY,
    }
)
CAFE_KINDS = frozenset({CAFE_RISING_ITEM, CAFE_DECLINING_ITEM, CAFE_ATTACH_GAP})

ALL_KINDS = frozenset(
    {OVERDUE_INVOICE, OVERDUE_BILL, UNRECONCILED, TAX_FLAG} | AP_KINDS | CAFE_KINDS
)


def is_ap_kind(kind: str) -> bool:
    return kind in AP_KINDS


def is_cafe_kind(kind: str) -> bool:
    return kind in CAFE_KINDS
