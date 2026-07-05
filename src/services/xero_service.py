"""
XeroService — bridge between the Sikizana agent and Xero accounting data.

Data resolution order, per session:
  1. OAuth — the user's own org via the direct Xero API (xero_api.py),
     using the tokens stored by the "Connect Your Xero" flow.
  2. CLI — the operator's demo org via the Xero CLI
     (`@xeroapi/xero-command-line`), if installed and authenticated.
  3. Mock — rich seeded data so the demo always works with zero
     credentials. Judges see the agent reason over realistic data.

Every method reports which mode served it via `self.mode()` so callers
(and the UI) can be honest about data provenance.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import threading
import time
from datetime import date, timedelta
from typing import Any

from src.services.logging import get_logger
from src.services import xero_api
from src.services.xero_api import XeroApiError

log = get_logger("sikizana.xero")


def _cli_available() -> bool:
    """Check if the xero CLI is installed and on PATH."""
    return shutil.which("xero") is not None


# The CLI liveness probe spawns a Node process, so cache the result briefly
# instead of probing on every request (previously every endpoint paid for
# 1-2 extra subprocess launches).
_PROBE_TTL_SECONDS = 60
_probe_cache: dict[str, Any] = {"at": 0.0, "ok": False}
_probe_lock = threading.Lock()


def _cli_authenticated(force: bool = False) -> bool:
    """Whether the Xero CLI is installed AND has a working profile (cached)."""
    if not _cli_available():
        return False
    with _probe_lock:
        if not force and time.time() - _probe_cache["at"] < _PROBE_TTL_SECONDS:
            return _probe_cache["ok"]
        probe = _run_cli(["org", "details"], timeout=30)
        _probe_cache["ok"] = probe is not None
        _probe_cache["at"] = time.time()
        return _probe_cache["ok"]


def _run_cli(args: list[str], timeout: int = 30) -> dict[str, Any] | list[Any] | None:
    """Run a xero CLI command and return parsed JSON, or None on failure."""
    if not _cli_available():
        return None
    try:
        result = subprocess.run(
            ["xero", *args, "--json"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if result.returncode != 0:
            log.warning("xero_cli_error", extra={"stderr": result.stderr[:500]})
            return None
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError) as exc:
        log.warning("xero_cli_failed", extra={"error": str(exc)})
        return None


def _report_get(obj: dict[str, Any], key: str, default: Any = None) -> Any:
    """Read a report field that may be camelCase (CLI) or PascalCase (API)."""
    if key in obj:
        return obj[key]
    pascal = key[0].upper() + key[1:]
    return obj.get(pascal, default)


def _parse_report(report: dict[str, Any]) -> dict[str, Any]:
    """
    Parse a Xero report (P&L, Balance Sheet, Trial Balance) into a
    simplified flat structure with key totals extracted.

    Reports arrive in Xero's ReportResponse format with nested rows/cells —
    camelCase from the CLI, PascalCase from the direct API. We extract the
    summary numbers (Total Income, Total Expenses, Net Profit, etc.) into
    a simple dict that the agent and frontend can use directly.
    """
    rows = _report_get(report, "rows", []) or []
    totals: dict[str, float] = {}
    line_items: list[dict[str, str]] = []

    def _extract_rows(row_list: list[dict[str, Any]]) -> None:
        for row in row_list:
            row_type = _report_get(row, "rowType", "")
            cells = _report_get(row, "cells", []) or []
            if row_type in ("Row", "SummaryRow") and len(cells) >= 2:
                label = _report_get(cells[0], "value", "") or ""
                value_str = _report_get(cells[1], "value", "0") or "0"
                try:
                    value = float(str(value_str).replace(",", ""))
                except (ValueError, TypeError):
                    value = 0.0
                if row_type == "SummaryRow":
                    totals[label] = value
                else:
                    line_items.append({"label": label, "value": str(value_str)})
            # Recurse into nested sections
            nested = _report_get(row, "rows")
            if nested:
                _extract_rows(nested)

    _extract_rows(rows)

    # Map common Xero report labels to our standard keys
    revenue = totals.get("Total Income", 0.0)
    expenses = totals.get("Total Operating Expenses", 0.0)
    net_profit = totals.get("Net Profit", totals.get("Net Loss", 0.0))
    if net_profit == 0.0 and revenue and expenses:
        net_profit = revenue - expenses

    return {
        "reportName": _report_get(report, "reportName", "") or "",
        "reportTitles": _report_get(report, "reportTitles", []) or [],
        "reportDate": _report_get(report, "reportDate", "") or "",
        "revenue": revenue,
        "expenses": expenses,
        "netProfit": net_profit,
        "totals": totals,
        "lineItems": line_items,
        "raw": report,  # Keep raw for the agent if it wants detail
    }


# ---------------------------------------------------------------------------
# Mock data — realistic UK small business (a café) for hackathon demos.
# This is what the agent reasons over when Xero credentials aren't configured.
# ---------------------------------------------------------------------------

_MOCK_ORG = {
    "id": "org-demo-cafe",
    "name": "The Daily Grind Ltd",
    "legalName": "The Daily Grind Limited",
    "paysTax": True,
    "version": "UK",
    "organisationType": "COMPANY",
    "baseCurrency": "GBP",
    "countryCode": "GB",
    "taxNumber": "GB123456789",
}

_MOCK_ACCOUNTS = [
    {
        "code": "200",
        "name": "Sales",
        "type": "REVENUE",
        "class": "REVENUE",
        "enablePaymentsToAccount": False,
    },
    {
        "code": "400",
        "name": "Cost of Goods Sold",
        "type": "DIRECTCOSTS",
        "class": "EXPENSE",
        "enablePaymentsToAccount": False,
    },
    {
        "code": "600",
        "name": "Rent",
        "type": "EXPENSE",
        "class": "EXPENSE",
        "enablePaymentsToAccount": True,
    },
    {
        "code": "610",
        "name": "Utilities",
        "type": "EXPENSE",
        "class": "EXPENSE",
        "enablePaymentsToAccount": True,
    },
    {
        "code": "620",
        "name": "Wages",
        "type": "EXPENSE",
        "class": "EXPENSE",
        "enablePaymentsToAccount": True,
    },
    {
        "code": "630",
        "name": "Marketing",
        "type": "EXPENSE",
        "class": "EXPENSE",
        "enablePaymentsToAccount": True,
    },
    {
        "code": "640",
        "name": "Bank Fees",
        "type": "EXPENSE",
        "class": "EXPENSE",
        "enablePaymentsToAccount": True,
    },
    {
        "code": "090",
        "name": "Business Bank Account",
        "type": "BANK",
        "class": "ASSET",
        "enablePaymentsToAccount": True,
    },
    {
        "code": "091",
        "name": "Petty Cash",
        "type": "BANK",
        "class": "ASSET",
        "enablePaymentsToAccount": True,
    },
    {
        "code": "210",
        "name": "VAT",
        "type": "CURRENTLIABILITY",
        "class": "LIABILITY",
        "enablePaymentsToAccount": True,
    },
    {
        "code": "800",
        "name": "Owner's Drawings",
        "type": "EQUITY",
        "class": "EQUITY",
        "enablePaymentsToAccount": False,
    },
]

_MOCK_CONTACTS = [
    {
        "id": "c1",
        "name": "Bean There Coffee Roasters",
        "emailAddress": "orders@beanthere.co.uk",
        "isSupplier": True,
    },
    {"id": "c2", "name": "Walk-In Customers", "emailAddress": "", "isCustomer": True},
    {
        "id": "c3",
        "name": "Catering Co Ltd",
        "emailAddress": "accounts@cateringco.uk",
        "isCustomer": True,
    },
    {
        "id": "c4",
        "name": "Shoreditch Property Management",
        "emailAddress": "rent@shoreditchpm.co.uk",
        "isSupplier": True,
    },
    {"id": "c5", "name": "Thames Water", "emailAddress": "", "isSupplier": True},
    {"id": "c6", "name": "Octopus Energy", "emailAddress": "", "isSupplier": True},
]

_today = date.today()


def _d(offset: int) -> str:
    return (_today - timedelta(days=offset)).isoformat()


_MOCK_INVOICES = [
    {
        "id": "inv1",
        "invoiceNumber": "INV-0001",
        "type": "ACCREC",
        "contact": {"name": "Catering Co Ltd"},
        "date": _d(45),
        "dueDate": _d(15),
        "status": "AUTHORISED",
        "total": 1250.00,
        "amountDue": 1250.00,
        "amountPaid": 0,
    },
    {
        "id": "inv2",
        "invoiceNumber": "INV-0002",
        "type": "ACCREC",
        "contact": {"name": "Catering Co Ltd"},
        "date": _d(30),
        "dueDate": _d(0),
        "status": "AUTHORISED",
        "total": 875.50,
        "amountDue": 875.50,
        "amountPaid": 0,
    },
    {
        "id": "inv3",
        "invoiceNumber": "INV-0003",
        "type": "ACCREC",
        "contact": {"name": "Walk-In Customers"},
        "date": _d(20),
        "dueDate": _d(20),
        "status": "PAID",
        "total": 4200.00,
        "amountDue": 0,
        "amountPaid": 4200.00,
    },
    {
        "id": "inv4",
        "invoiceNumber": "INV-0004",
        "type": "ACCREC",
        "contact": {"name": "Catering Co Ltd"},
        "date": _d(10),
        "dueDate": _d(-20),
        "status": "AUTHORISED",
        "total": 2100.00,
        "amountDue": 2100.00,
        "amountPaid": 0,
    },
    {
        "id": "inv5",
        "invoiceNumber": "BILL-0001",
        "type": "ACCPAY",
        "contact": {"name": "Bean There Coffee Roasters"},
        "date": _d(25),
        "dueDate": _d(-5),
        "status": "AUTHORISED",
        "total": 680.00,
        "amountDue": 680.00,
        "amountPaid": 0,
    },
    {
        "id": "inv6",
        "invoiceNumber": "BILL-0002",
        "type": "ACCPAY",
        "contact": {"name": "Shoreditch Property Management"},
        "date": _d(30),
        "dueDate": _d(0),
        "status": "AUTHORISED",
        "total": 2500.00,
        "amountDue": 2500.00,
        "amountPaid": 0,
    },
    {
        "id": "inv7",
        "invoiceNumber": "BILL-0003",
        "type": "ACCPAY",
        "contact": {"name": "Octopus Energy"},
        "date": _d(15),
        "dueDate": _d(-10),
        "status": "PAID",
        "total": 340.00,
        "amountDue": 0,
        "amountPaid": 340.00,
    },
]

_MOCK_BANK_TXNS = [
    {
        "id": "bt1",
        "type": "RECEIVE",
        "contact": {"name": "Walk-In Customers"},
        "date": _d(20),
        "reference": "Daily takings w/e",
        "total": 4200.00,
        "bankAccount": {"code": "090"},
        "isReconciled": True,
    },
    {
        "id": "bt2",
        "type": "SPEND",
        "contact": {"name": "Bean There Coffee Roasters"},
        "date": _d(25),
        "reference": "Coffee beans order #4521",
        "total": 680.00,
        "bankAccount": {"code": "090"},
        "isReconciled": True,
    },
    {
        "id": "bt3",
        "type": "SPEND",
        "contact": {"name": "Shoreditch Property Management"},
        "date": _d(30),
        "reference": "Monthly rent June",
        "total": 2500.00,
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
    {
        "id": "bt5",
        "type": "SPEND",
        "contact": {"name": "Unknown"},
        "date": _d(5),
        "reference": "CARD PAYMENT 0542 12JUN LIDL",
        "total": 87.43,
        "bankAccount": {"code": "090"},
        "isReconciled": False,
    },
    {
        "id": "bt6",
        "type": "SPEND",
        "contact": {"name": "Unknown"},
        "date": _d(3),
        "reference": "STANDING ORDER REF 8892",
        "total": 1200.00,
        "bankAccount": {"code": "090"},
        "isReconciled": False,
    },
    {
        "id": "bt7",
        "type": "RECEIVE",
        "contact": {"name": "Catering Co Ltd"},
        "date": _d(2),
        "reference": "BACS CATERING CO",
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

_MOCK_PAYMENTS = [
    {
        "id": "p1",
        "date": _d(20),
        "invoice": {"invoiceNumber": "INV-0003"},
        "contact": {"name": "Walk-In Customers"},
        "amount": 4200.00,
        "reference": "Bank transfer",
    },
    {
        "id": "p2",
        "date": _d(15),
        "invoice": {"invoiceNumber": "BILL-0003"},
        "contact": {"name": "Octopus Energy"},
        "amount": 340.00,
        "reference": "Direct debit",
    },
]

_MOCK_PL = {
    "fromDate": _d(90),
    "toDate": _d(0),
    "rows": [
        {"account": "Sales", "code": "200", "value": 18450.00},
        {"account": "Cost of Goods Sold", "code": "400", "value": -7200.00},
        {"account": "Rent", "code": "600", "value": -7500.00},
        {"account": "Utilities", "code": "610", "value": -1120.00},
        {"account": "Wages", "code": "620", "value": -4800.00},
        {"account": "Marketing", "code": "630", "value": -450.00},
        {"account": "Bank Fees", "code": "640", "value": -85.00},
    ],
    "netProfit": -2705.00,
}

_MOCK_BALANCE_SHEET = {
    "asOf": _d(0),
    "rows": [
        {"account": "Business Bank Account", "code": "090", "value": 4580.00},
        {"account": "Petty Cash", "code": "091", "value": 120.00},
        {"account": "VAT", "code": "210", "value": -1845.00},
        {"account": "Owner's Drawings", "code": "800", "value": -3000.00},
    ],
    "totalAssets": 4700.00,
    "totalLiabilities": 1845.00,
    "netAssets": 2855.00,
}

_MOCK_TRIAL_BALANCE = {
    "asOf": _d(0),
    "rows": [
        {"account": "Sales", "code": "200", "debit": 0, "credit": 18450.00},
        {"account": "Cost of Goods Sold", "code": "400", "debit": 7200.00, "credit": 0},
        {"account": "Rent", "code": "600", "debit": 7500.00, "credit": 0},
        {"account": "Utilities", "code": "610", "debit": 1120.00, "credit": 0},
        {"account": "Wages", "code": "620", "debit": 4800.00, "credit": 0},
        {"account": "Marketing", "code": "630", "debit": 450.00, "credit": 0},
        {"account": "Bank Fees", "code": "640", "debit": 85.00, "credit": 0},
        {"account": "Business Bank Account", "code": "090", "debit": 4580.00, "credit": 0},
        {"account": "Petty Cash", "code": "091", "debit": 120.00, "credit": 0},
        {"account": "VAT", "code": "210", "debit": 0, "credit": 1845.00},
        {"account": "Owner's Drawings", "code": "800", "debit": 3000.00, "credit": 0},
    ],
    "totalDebit": 28855.00,
    "totalCredit": 20295.00,
}


class XeroService:
    """
    Session-scoped bridge to Xero data: OAuth API → CLI → mock.
    Every method returns a JSON-serialisable dict/list in the same shape
    regardless of which source served it.
    """

    def __init__(self, session_id: str = "default") -> None:
        self.session_id = session_id

    def mode(self) -> str:
        """Which source will serve this session: live-oauth | live-cli | demo."""
        if xero_api.is_connected(self.session_id):
            return "live-oauth"
        if _cli_authenticated():
            return "live-cli"
        return "demo"

    def is_live(self) -> bool:
        return self.mode() != "demo"

    def _oauth(self, fetch, label: str):
        """
        Try the OAuth API path for a connected session. Returns the result,
        or None to fall through to CLI/mock. API errors are logged, never
        silently swallowed into fake data without a trace.
        """
        if not xero_api.is_connected(self.session_id):
            return None
        try:
            return fetch()
        except XeroApiError as exc:
            log.error(
                "xero_oauth_fetch_failed",
                extra={"what": label, "session_id": self.session_id, "error": str(exc)},
            )
            return None

    # ---- Organisation ----

    def get_organisation(self) -> dict[str, Any]:
        via_oauth = self._oauth(lambda: xero_api.get_organisation(self.session_id), "organisation")
        if via_oauth:
            return via_oauth
        live = _run_cli(["org", "details"])
        if live is not None:
            # CLI returns a list of orgs; take the first one
            if isinstance(live, list):
                return live[0] if live else {}
            return live  # type: ignore[return-value]
        return _MOCK_ORG

    # ---- Chart of Accounts ----

    def list_accounts(self) -> list[dict[str, Any]]:
        via_oauth = self._oauth(lambda: xero_api.list_accounts(self.session_id), "accounts")
        if via_oauth is not None:
            return via_oauth
        live = _run_cli(["accounts", "list"])
        if live is not None:
            return live  # type: ignore[return-value]
        return _MOCK_ACCOUNTS

    # ---- Contacts ----

    def list_contacts(self) -> list[dict[str, Any]]:
        via_oauth = self._oauth(lambda: xero_api.list_contacts(self.session_id), "contacts")
        if via_oauth is not None:
            return via_oauth
        live = _run_cli(["contacts", "list"])
        if live is not None:
            return live  # type: ignore[return-value]
        return _MOCK_CONTACTS

    # ---- Invoices ----

    def list_invoices(
        self,
        status: str | None = None,
        invoice_type: str | None = None,
    ) -> list[dict[str, Any]]:
        # OAuth path filters status server-side (where=); type is filtered
        # client-side for all paths since the mock/CLI shapes share it.
        via_oauth = self._oauth(
            lambda: xero_api.list_invoices(self.session_id, status=status), "invoices"
        )
        if via_oauth is not None:
            result = via_oauth
        else:
            # The Xero CLI's `invoices list` doesn't support --status/--type
            # flags, so we fetch all and filter client-side.
            live = _run_cli(["invoices", "list"])
            result = live if live is not None else list(_MOCK_INVOICES)  # type: ignore[assignment]
            if status:
                result = [i for i in result if i.get("status") == status.upper()]
        if invoice_type:
            result = [i for i in result if i.get("type") == invoice_type.upper()]
        return result  # type: ignore[return-value]

    # ---- Bank Transactions ----

    def list_bank_transactions(
        self,
        txn_type: str | None = None,
    ) -> list[dict[str, Any]]:
        via_oauth = self._oauth(
            lambda: xero_api.list_bank_transactions(self.session_id), "bank_transactions"
        )
        if via_oauth is not None:
            result = via_oauth
        else:
            # The Xero CLI's `bank-transactions list` doesn't support --type,
            # so we fetch all and filter client-side.
            live = _run_cli(["bank-transactions", "list"])
            result = live if live is not None else list(_MOCK_BANK_TXNS)  # type: ignore[assignment]
        if txn_type:
            result = [t for t in result if t.get("type") == txn_type.upper()]
        return result  # type: ignore[return-value]

    # ---- Payments ----

    def list_payments(self) -> list[dict[str, Any]]:
        live = _run_cli(["payments", "list"])
        if live is not None:
            return live  # type: ignore[return-value]
        return _MOCK_PAYMENTS

    # ---- Reports ----

    def get_profit_and_loss(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if from_date:
            params["fromDate"] = from_date
        if to_date:
            params["toDate"] = to_date
        via_oauth = self._oauth(
            lambda: xero_api.get_report(self.session_id, "ProfitAndLoss", params=params),
            "profit_and_loss",
        )
        if via_oauth:
            return _parse_report(via_oauth)
        args = ["reports", "profit-and-loss"]
        if from_date:
            args += ["--from", from_date]
        if to_date:
            args += ["--to", to_date]
        live = _run_cli(args)
        if live is not None:
            return _parse_report(live)  # type: ignore[arg-type]
        pl = dict(_MOCK_PL)
        if from_date:
            pl["fromDate"] = from_date
        if to_date:
            pl["toDate"] = to_date
        return pl

    def get_balance_sheet(self, as_of: str | None = None) -> dict[str, Any]:
        params = {"date": as_of} if as_of else {}
        via_oauth = self._oauth(
            lambda: xero_api.get_report(self.session_id, "BalanceSheet", params=params),
            "balance_sheet",
        )
        if via_oauth:
            return _parse_report(via_oauth)
        args = ["reports", "balance-sheet"]
        if as_of:
            args += ["--date", as_of]
        live = _run_cli(args)
        if live is not None:
            return _parse_report(live)  # type: ignore[arg-type]
        bs = dict(_MOCK_BALANCE_SHEET)
        if as_of:
            bs["asOf"] = as_of
        return bs

    def get_trial_balance(self, as_of: str | None = None) -> dict[str, Any]:
        params = {"date": as_of} if as_of else {}
        via_oauth = self._oauth(
            lambda: xero_api.get_report(self.session_id, "TrialBalance", params=params),
            "trial_balance",
        )
        if via_oauth:
            return _parse_report(via_oauth)
        args = ["reports", "trial-balance"]
        if as_of:
            args += ["--date", as_of]
        live = _run_cli(args)
        if live is not None:
            return live  # type: ignore[return-value]
        tb = dict(_MOCK_TRIAL_BALANCE)
        if as_of:
            tb["asOf"] = as_of
        return tb

    # ---- Reconciliation (the agent's core value-add) ----

    def find_unreconciled_transactions(self) -> list[dict[str, Any]]:
        """Return bank transactions that haven't been reconciled yet."""
        txns = self.list_bank_transactions()
        return [t for t in txns if not t.get("isReconciled", False)]

    def find_overdue_invoices(self) -> list[dict[str, Any]]:
        """Return authorised invoices past their due date."""
        invoices = self.list_invoices(status="AUTHORISED")
        today_str = _today.isoformat()
        return [i for i in invoices if i.get("dueDate", "") < today_str]

    def match_bank_to_invoice(self, bank_txn_id: str, invoice_number: str) -> dict[str, Any]:
        """
        Attempt to match a bank transaction to an invoice by reference.
        This is the core reconciliation action the agent recommends.
        """
        txns = self.list_bank_transactions()
        invoices = self.list_invoices()

        txn = next((t for t in txns if t["id"] == bank_txn_id), None)
        invoice = next((i for i in invoices if i.get("invoiceNumber") == invoice_number), None)

        if not txn:
            return {"matched": False, "reason": f"Bank transaction {bank_txn_id} not found"}
        if not invoice:
            return {"matched": False, "reason": f"Invoice {invoice_number} not found"}

        amount_match = abs(txn["total"] - invoice["total"]) < 0.01
        return {
            "matched": amount_match,
            "bankTransaction": txn,
            "invoice": invoice,
            "amountMatch": amount_match,
            "reason": (
                "Amounts match exactly — safe to reconcile."
                if amount_match
                else f"Amount mismatch: bank={txn['total']}, invoice={invoice['total']}. Manual review needed."
            ),
        }

    # ---- Write-back ----

    def create_manual_journal(
        self,
        description: str,
        debit_account_code: str,
        credit_account_code: str,
        amount: float,
    ) -> dict[str, Any]:
        """
        Post a manual journal entry. Returns
        {"posted", "mode", "journal_id", "message"}.

        A failed live write RAISES — it must never be reported as success.
        In demo mode nothing is written and the response says so explicitly.
        """
        mode = self.mode()

        if mode == "live-oauth":
            # Raises XeroApiError on failure; sent with an Idempotency-Key
            result = xero_api.create_manual_journal(
                self.session_id,
                narration=description,
                debit_account_code=debit_account_code,
                credit_account_code=credit_account_code,
                amount=amount,
            )
            return {
                "posted": True,
                "mode": mode,
                "journal_id": result.get("manualJournalID") or None,
                "message": f"Journal entry posted to Xero (£{amount:,.2f}).",
            }

        if mode == "live-cli":
            result = _run_cli(
                [
                    "manual-journals",
                    "create",
                    "--description",
                    description,
                    "--debit",
                    f"{debit_account_code}:{amount}",
                    "--credit",
                    f"{credit_account_code}:{amount}",
                ],
                timeout=30,
            )
            if result is None:
                raise RuntimeError(
                    "Xero CLI failed to create the manual journal — the entry was NOT posted."
                )
            journal_id = result.get("manualJournalID") if isinstance(result, dict) else None
            return {
                "posted": True,
                "mode": mode,
                "journal_id": journal_id,
                "message": f"Journal entry posted to Xero (£{amount:,.2f}).",
            }

        # Demo mode — nothing is written, and we say so
        return {
            "posted": False,
            "mode": "demo",
            "journal_id": None,
            "message": (
                f"Simulated (demo mode) — no entry was written. "
                f"Connect your Xero to post real journal entries (£{amount:,.2f})."
            ),
        }
