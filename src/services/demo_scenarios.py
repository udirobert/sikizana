"""Demo scenarios — selectable sample books for anonymous/demo sessions.

Sikizana's demo mode reasons over seeded data when no Xero connection exists.
Two scenarios are offered so visitors can see the product through their own
sector's books, matching what the landing and sector pages promise:

- ``cafe``  — The Daily Grind Ltd (the default). Reuses the existing
  ``_MOCK_*`` constants in ``xero_service.py`` untouched, so every test and
  the default demo experience behave exactly as before.
- ``music`` — Ember & Oak Ltd, a working band's trading company. Seeded with
  the same shapes: a duplicate payment (two identical BACS transfers for one
  backline-rental bill), a late festival client (chase candidate), overdue
  bills, and unreconciled transactions.

Both are UK companies on standard VAT, so the shared chart of accounts,
tax rates, balance sheet, and trial balance apply to both; only the
company identity, contacts, invoices, payments, bank feed, and P&L differ.

Only demo-mode reads go through scenarios. Live OAuth/CLI data is never
affected, and ``XeroService.mode()`` still reports ``demo`` so every
"sample data" label stays honest.
"""

from __future__ import annotations

from typing import Any

from src.services.xero_service import (
    _MOCK_BANK_TXNS,
    _MOCK_CONTACTS,
    _MOCK_INVOICES,
    _MOCK_ORG,
    _MOCK_PAYMENTS,
    _MOCK_PL,
    _d,
)

DEFAULT_SCENARIO = "cafe"

# ---------------------------------------------------------------------------
# Music scenario — Ember & Oak Ltd
# ---------------------------------------------------------------------------

_MUSIC_ORG = {
    "id": "org-demo-music",
    "name": "Ember & Oak Ltd",
    "legalName": "Ember & Oak Limited",
    "paysTax": True,
    "version": "UK",
    "organisationType": "COMPANY",
    "baseCurrency": "GBP",
    "countryCode": "GB",
    "taxNumber": "GB987654321",
}

_MUSIC_CONTACTS = [
    {
        "id": "c1",
        "name": "SoundStage Backline Hire",
        "emailAddress": "accounts@soundstagehire.co.uk",
        "isSupplier": True,
    },
    {
        "id": "c2",
        "name": "Camden Rehearsal Studios",
        "emailAddress": "bookings@camdenstudios.co.uk",
        "isSupplier": True,
    },
    {"id": "c3", "name": "Octopus Energy", "emailAddress": "", "isSupplier": True},
    {
        "id": "c4",
        "name": "The Roundhouse (promoter)",
        "emailAddress": "accounts@roundhouselive.co.uk",
        "isCustomer": True,
    },
    {
        "id": "c5",
        "name": "Field Day Festival",
        "emailAddress": "accounts@fielddayfestivals.co.uk",
        "isCustomer": True,
    },
    {"id": "c6", "name": "Direct gig sales", "emailAddress": "", "isCustomer": True},
]

_MUSIC_INVOICES = [
    # ---- Receivables (money owed to the band) ----
    {
        "id": "inv1",
        "invoiceNumber": "INV-0001",
        "type": "ACCREC",
        "contact": {"name": "The Roundhouse (promoter)"},
        "date": _d(45),
        "dueDate": _d(0),  # due today — not yet overdue
        "status": "AUTHORISED",
        "total": 1850.00,
        "amountDue": 1850.00,
        "amountPaid": 0,
    },
    {
        "id": "inv2",
        "invoiceNumber": "INV-0002",
        "type": "ACCREC",
        "contact": {"name": "The Roundhouse (promoter)"},
        "date": _d(30),
        "dueDate": _d(-20),  # due in 20 days
        "status": "AUTHORISED",
        "total": 1200.00,
        "amountDue": 1200.00,
        "amountPaid": 0,
    },
    {
        "id": "inv3",
        "invoiceNumber": "INV-0003",
        "type": "ACCREC",
        "contact": {"name": "Direct gig sales"},
        "date": _d(20),
        "dueDate": _d(20),
        "fullyPaidOnDate": _d(20),  # paid on time
        "status": "PAID",
        "total": 3400.00,
        "amountDue": 0,
        "amountPaid": 3400.00,
    },
    {
        "id": "inv4",
        "invoiceNumber": "INV-0004",
        "type": "ACCREC",
        "contact": {"name": "Field Day Festival"},
        "date": _d(60),
        "dueDate": _d(30),  # 30 days late — the chase candidate
        "status": "AUTHORISED",
        "total": 2400.00,
        "amountDue": 2400.00,
        "amountPaid": 0,
    },
    # ---- Payables (bills the band owes) ----
    {
        "id": "inv5",
        "invoiceNumber": "BILL-0001",
        "type": "ACCPAY",
        "contact": {"name": "SoundStage Backline Hire"},
        "date": _d(25),
        "dueDate": _d(-5),
        "status": "PAID",
        "total": 680.00,
        "amountDue": 0,
        # Two full payments were recorded below. This is intentional, seeded
        # evidence for the AP Integrity demo; it never reaches Xero.
        "amountPaid": 1360.00,
    },
    {
        "id": "inv6",
        "invoiceNumber": "BILL-0002",
        "type": "ACCPAY",
        "contact": {"name": "Camden Rehearsal Studios"},
        "date": _d(30),
        "dueDate": _d(0),
        "status": "AUTHORISED",
        "total": 950.00,
        "amountDue": 950.00,
        "amountPaid": 0,
    },
    {
        "id": "inv7",
        "invoiceNumber": "BILL-0003",
        "type": "ACCPAY",
        "contact": {"name": "Octopus Energy"},
        "date": _d(15),
        "dueDate": _d(-10),
        "fullyPaidOnDate": _d(-5),  # paid 5 days late
        "status": "PAID",
        "total": 340.00,
        "amountDue": 0,
        "amountPaid": 340.00,
    },
]

_MUSIC_PAYMENTS = [
    {
        "id": "p1",
        "date": _d(20),
        "invoice": {"invoiceNumber": "INV-0003"},
        "contact": {"name": "Direct gig sales"},
        "amount": 3400.00,
        "reference": "Bank transfer",
    },
    {
        "id": "p2",
        "date": _d(15),
        "invoice": {"id": "inv7", "invoiceNumber": "BILL-0003"},
        "contact": {"name": "Octopus Energy"},
        "amount": 340.00,
        "reference": "Direct debit",
    },
    # The seeded duplicate: two identical BACS transfers for BILL-0001.
    {
        "id": "p3",
        "date": _d(24),
        "invoice": {"id": "inv5", "invoiceNumber": "BILL-0001"},
        "contact": {"name": "SoundStage Backline Hire"},
        "amount": 680.00,
        "reference": "BACS-SOUNDSTAGE-8841",
    },
    {
        "id": "p4",
        "date": _d(23),
        "invoice": {"id": "inv5", "invoiceNumber": "BILL-0001"},
        "contact": {"name": "SoundStage Backline Hire"},
        "amount": 680.00,
        "reference": "BACS-SOUNDSTAGE-8841",
    },
]

_MUSIC_BANK_TXNS = [
    {
        "id": "bt1",
        "type": "RECEIVE",
        "contact": {"name": "Direct gig sales"},
        "date": _d(20),
        "reference": "Gig takings w/e",
        "total": 3400.00,
        "bankAccount": {"code": "090"},
        "isReconciled": True,
    },
    {
        "id": "bt2",
        "type": "SPEND",
        "contact": {"name": "SoundStage Backline Hire"},
        "date": _d(25),
        "reference": "Backline hire order #8841",
        "total": 680.00,
        "bankAccount": {"code": "090"},
        "isReconciled": True,
    },
    {
        "id": "bt3",
        "type": "SPEND",
        "contact": {"name": "Camden Rehearsal Studios"},
        "date": _d(30),
        "reference": "Monthly rehearsal room",
        "total": 950.00,
        "bankAccount": {"code": "090"},
        "isReconciled": True,
    },
    {
        "id": "bt4",
        "type": "SPEND",
        "contact": {"name": "Octopus Energy"},
        "date": _d(15),
        "reference": "Electricity bill",
        "total": 340.00,
        "bankAccount": {"code": "090"},
        "isReconciled": True,
    },
    # Unreconciled — same "what needs fixing?" texture as the café.
    {
        "id": "bt5",
        "type": "SPEND",
        "contact": {"name": "Unknown"},
        "date": _d(5),
        "reference": "CARD PAYMENT 0542 12JUN GUITAR CENTER",
        "total": 89.99,
        "bankAccount": {"code": "090"},
        "isReconciled": False,
    },
    {
        "id": "bt6",
        "type": "SPEND",
        "contact": {"name": "Unknown"},
        "date": _d(3),
        "reference": "STANDING ORDER REF 7714",
        "total": 480.00,
        "bankAccount": {"code": "090"},
        "isReconciled": False,
    },
    {
        "id": "bt7",
        "type": "RECEIVE",
        "contact": {"name": "The Roundhouse (promoter)"},
        "date": _d(2),
        "reference": "BACS ROUNDHOUSE",
        "total": 500.00,
        "bankAccount": {"code": "090"},
        "isReconciled": False,
    },
    {
        "id": "bt8",
        "type": "SPEND",
        "contact": {"name": "Unknown"},
        "date": _d(1),
        "reference": "CARD PAYMENT 0542 14JUN UBER",
        "total": 23.50,
        "bankAccount": {"code": "090"},
        "isReconciled": False,
    },
]

_MUSIC_PL = {
    "fromDate": _d(90),
    "toDate": _d(0),
    "rows": [
        {"account": "Sales", "code": "200", "value": 14200.00},
        {"account": "Cost of Goods Sold", "code": "400", "value": -3800.00},
        {"account": "Rent", "code": "600", "value": -2850.00},
        {"account": "Utilities", "code": "610", "value": -680.00},
        {"account": "Wages", "code": "620", "value": -5200.00},
        {"account": "Marketing", "code": "630", "value": -520.00},
        {"account": "Bank Fees", "code": "640", "value": -75.00},
    ],
    "netProfit": 1075.00,
}


# ---------------------------------------------------------------------------
# Scenario registry
# ---------------------------------------------------------------------------


def _music_data() -> dict[str, Any]:
    """Music scenario snapshot. Built per call so the relative dates
    (_d offsets) stay fresh and callers can't mutate shared state."""
    return {
        "org": _MUSIC_ORG,
        "contacts": _MUSIC_CONTACTS,
        "invoices": _MUSIC_INVOICES,
        "payments": _MUSIC_PAYMENTS,
        "bank_txns": _MUSIC_BANK_TXNS,
        "pl": _MUSIC_PL,
    }


def _cafe_data() -> dict[str, Any]:
    """Café scenario snapshot — the existing module-level constants."""
    return {
        "org": _MOCK_ORG,
        "contacts": _MOCK_CONTACTS,
        "invoices": _MOCK_INVOICES,
        "payments": _MOCK_PAYMENTS,
        "bank_txns": _MOCK_BANK_TXNS,
        "pl": _MOCK_PL,
    }


_BUILDERS = {
    "cafe": _cafe_data,
    "music": _music_data,
}


def resolve_scenario(value: str | None) -> str:
    """Normalize a requested scenario to a known key (default: café)."""
    v = (value or "").strip().lower()
    return v if v in _BUILDERS else DEFAULT_SCENARIO


def scenario_data(scenario: str) -> dict[str, Any]:
    """Return the scenario-specific demo dataset (org, contacts, invoices,
    payments, bank transactions, P&L). Shared structures (accounts, balance
    sheet, trial balance) apply to both UK demo companies and are read
    directly from ``xero_service``."""
    return _BUILDERS[resolve_scenario(scenario)]()
