"""
XeroService — bridge between the Sikizana agent and Xero accounting data.

Primary path: shell out to the Xero CLI (`@xeroapi/xero-command-line`)
which handles OAuth2 PKCE, token refresh, and tenant selection. The CLI
outputs JSON via `--json` flag, making it perfect for agent tool calls.

Fallback: rich mock data so the demo always works at the hackathon even
without Xero credentials. This is critical — judges need to see the agent
reason over realistic data, not error out on auth.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import date, timedelta
from typing import Any

from src.services.logging import get_logger

log = get_logger("sikizana.xero")


def _cli_available() -> bool:
    """Check if the xero CLI is installed and on PATH."""
    return shutil.which("xero") is not None


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
    {"code": "200", "name": "Sales", "type": "REVENUE", "class": "REVENUE", "enablePaymentsToAccount": False},
    {"code": "400", "name": "Cost of Goods Sold", "type": "DIRECTCOSTS", "class": "EXPENSE", "enablePaymentsToAccount": False},
    {"code": "600", "name": "Rent", "type": "EXPENSE", "class": "EXPENSE", "enablePaymentsToAccount": True},
    {"code": "610", "name": "Utilities", "type": "EXPENSE", "class": "EXPENSE", "enablePaymentsToAccount": True},
    {"code": "620", "name": "Wages", "type": "EXPENSE", "class": "EXPENSE", "enablePaymentsToAccount": True},
    {"code": "630", "name": "Marketing", "type": "EXPENSE", "class": "EXPENSE", "enablePaymentsToAccount": True},
    {"code": "640", "name": "Bank Fees", "type": "EXPENSE", "class": "EXPENSE", "enablePaymentsToAccount": True},
    {"code": "090", "name": "Business Bank Account", "type": "BANK", "class": "ASSET", "enablePaymentsToAccount": True},
    {"code": "091", "name": "Petty Cash", "type": "BANK", "class": "ASSET", "enablePaymentsToAccount": True},
    {"code": "210", "name": "VAT", "type": "CURRENTLIABILITY", "class": "LIABILITY", "enablePaymentsToAccount": True},
    {"code": "800", "name": "Owner's Drawings", "type": "EQUITY", "class": "EQUITY", "enablePaymentsToAccount": False},
]

_MOCK_CONTACTS = [
    {"id": "c1", "name": "Bean There Coffee Roasters", "emailAddress": "orders@beanthere.co.uk", "isSupplier": True},
    {"id": "c2", "name": "Walk-In Customers", "emailAddress": "", "isCustomer": True},
    {"id": "c3", "name": "Catering Co Ltd", "emailAddress": "accounts@cateringco.uk", "isCustomer": True},
    {"id": "c4", "name": "Shoreditch Property Management", "emailAddress": "rent@shoreditchpm.co.uk", "isSupplier": True},
    {"id": "c5", "name": "Thames Water", "emailAddress": "", "isSupplier": True},
    {"id": "c6", "name": "Octopus Energy", "emailAddress": "", "isSupplier": True},
]

_today = date.today()
_d = lambda offset: (_today - timedelta(days=offset)).isoformat()

_MOCK_INVOICES = [
    {"id": "inv1", "invoiceNumber": "INV-0001", "type": "ACCREC", "contact": {"name": "Catering Co Ltd"}, "date": _d(45), "dueDate": _d(15), "status": "AUTHORISED", "total": 1250.00, "amountDue": 1250.00, "amountPaid": 0},
    {"id": "inv2", "invoiceNumber": "INV-0002", "type": "ACCREC", "contact": {"name": "Catering Co Ltd"}, "date": _d(30), "dueDate": _d(0), "status": "AUTHORISED", "total": 875.50, "amountDue": 875.50, "amountPaid": 0},
    {"id": "inv3", "invoiceNumber": "INV-0003", "type": "ACCREC", "contact": {"name": "Walk-In Customers"}, "date": _d(20), "dueDate": _d(20), "status": "PAID", "total": 4200.00, "amountDue": 0, "amountPaid": 4200.00},
    {"id": "inv4", "invoiceNumber": "INV-0004", "type": "ACCREC", "contact": {"name": "Catering Co Ltd"}, "date": _d(10), "dueDate": _d(-20), "status": "AUTHORISED", "total": 2100.00, "amountDue": 2100.00, "amountPaid": 0},
    {"id": "inv5", "invoiceNumber": "BILL-0001", "type": "ACCPAY", "contact": {"name": "Bean There Coffee Roasters"}, "date": _d(25), "dueDate": _d(-5), "status": "AUTHORISED", "total": 680.00, "amountDue": 680.00, "amountPaid": 0},
    {"id": "inv6", "invoiceNumber": "BILL-0002", "type": "ACCPAY", "contact": {"name": "Shoreditch Property Management"}, "date": _d(30), "dueDate": _d(0), "status": "AUTHORISED", "total": 2500.00, "amountDue": 2500.00, "amountPaid": 0},
    {"id": "inv7", "invoiceNumber": "BILL-0003", "type": "ACCPAY", "contact": {"name": "Octopus Energy"}, "date": _d(15), "dueDate": _d(-10), "status": "PAID", "total": 340.00, "amountDue": 0, "amountPaid": 340.00},
]

_MOCK_BANK_TXNS = [
    {"id": "bt1", "type": "RECEIVE", "contact": {"name": "Walk-In Customers"}, "date": _d(20), "reference": "Daily takings w/e", "total": 4200.00, "bankAccount": {"code": "090"}, "isReconciled": True},
    {"id": "bt2", "type": "SPEND", "contact": {"name": "Bean There Coffee Roasters"}, "date": _d(25), "reference": "Coffee beans order #4521", "total": 680.00, "bankAccount": {"code": "090"}, "isReconciled": True},
    {"id": "bt3", "type": "SPEND", "contact": {"name": "Shoreditch Property Management"}, "date": _d(30), "reference": "Monthly rent June", "total": 2500.00, "bankAccount": {"code": "090"}, "isReconciled": True},
    {"id": "bt4", "type": "SPEND", "contact": {"name": "Octopus Energy"}, "date": _d(15), "reference": "Electricity bill", "total": 340.00, "bankAccount": {"code": "090"}, "isReconciled": True},
    {"id": "bt5", "type": "SPEND", "contact": {"name": "Unknown"}, "date": _d(5), "reference": "CARD PAYMENT 0542 12JUN LIDL", "total": 87.43, "bankAccount": {"code": "090"}, "isReconciled": False},
    {"id": "bt6", "type": "SPEND", "contact": {"name": "Unknown"}, "date": _d(3), "reference": "STANDING ORDER REF 8892", "total": 1200.00, "bankAccount": {"code": "090"}, "isReconciled": False},
    {"id": "bt7", "type": "RECEIVE", "contact": {"name": "Catering Co Ltd"}, "date": _d(2), "reference": "BACS CATERING CO", "total": 500.00, "bankAccount": {"code": "090"}, "isReconciled": False},
    {"id": "bt8", "type": "SPEND", "contact": {"name": "Unknown"}, "date": _d(1), "reference": "CARD PAYMENT 0542 14JUN UBER", "total": 23.50, "bankAccount": {"code": "090"}, "isReconciled": False},
]

_MOCK_PAYMENTS = [
    {"id": "p1", "date": _d(20), "invoice": {"invoiceNumber": "INV-0003"}, "contact": {"name": "Walk-In Customers"}, "amount": 4200.00, "reference": "Bank transfer"},
    {"id": "p2", "date": _d(15), "invoice": {"invoiceNumber": "BILL-0003"}, "contact": {"name": "Octopus Energy"}, "amount": 340.00, "reference": "Direct debit"},
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
    Thin wrapper around the Xero CLI with mock fallback.
    Every method returns a JSON-serialisable dict/list.
    """

    def __init__(self) -> None:
        # CLI binary must exist AND be authenticated (a profile configured).
        # We probe with `org details` — if it fails for any reason (not
        # installed, no profile, expired token), we use mock data.
        if not _cli_available():
            self.use_mock = True
            log.info("xero_using_mock", extra={"reason": "cli_not_found"})
        else:
            probe = _run_cli(["org", "details"], timeout=10)
            if probe is not None:
                self.use_mock = False
            else:
                self.use_mock = True
                log.info("xero_using_mock", extra={"reason": "cli_not_authenticated"})

    def is_live(self) -> bool:
        return not self.use_mock

    # ---- Organisation ----

    def get_organisation(self) -> dict[str, Any]:
        live = _run_cli(["org", "details"])
        if live is not None:
            return live  # type: ignore[return-value]
        return _MOCK_ORG

    # ---- Chart of Accounts ----

    def list_accounts(self) -> list[dict[str, Any]]:
        live = _run_cli(["accounts", "list"])
        if live is not None:
            return live  # type: ignore[return-value]
        return _MOCK_ACCOUNTS

    # ---- Contacts ----

    def list_contacts(self) -> list[dict[str, Any]]:
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
        # The Xero CLI's `invoices list` doesn't support --status/--type
        # flags, so we fetch all and filter client-side.
        live = _run_cli(["invoices", "list"])
        if live is not None:
            result = live  # type: ignore[assignment]
            if status:
                result = [i for i in result if i.get("status") == status.upper()]
            if invoice_type:
                result = [i for i in result if i.get("type") == invoice_type.upper()]
            return result  # type: ignore[return-value]
        result = _MOCK_INVOICES
        if status:
            result = [i for i in result if i["status"] == status.upper()]
        if invoice_type:
            result = [i for i in result if i["type"] == invoice_type.upper()]
        return result

    # ---- Bank Transactions ----

    def list_bank_transactions(
        self,
        txn_type: str | None = None,
    ) -> list[dict[str, Any]]:
        # The Xero CLI's `bank-transactions list` doesn't support --type,
        # so we fetch all and filter client-side.
        live = _run_cli(["bank-transactions", "list"])
        if live is not None:
            result = live  # type: ignore[assignment]
            if txn_type:
                result = [t for t in result if t.get("type") == txn_type.upper()]
            return result  # type: ignore[return-value]
        result = _MOCK_BANK_TXNS
        if txn_type:
            result = [t for t in result if t["type"] == txn_type.upper()]
        return result

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
        args = ["reports", "profit-and-loss"]
        if from_date:
            args += ["--from", from_date]
        if to_date:
            args += ["--to", to_date]
        live = _run_cli(args)
        if live is not None:
            return live  # type: ignore[return-value]
        pl = dict(_MOCK_PL)
        if from_date:
            pl["fromDate"] = from_date
        if to_date:
            pl["toDate"] = to_date
        return pl

    def get_balance_sheet(self, as_of: str | None = None) -> dict[str, Any]:
        args = ["reports", "balance-sheet"]
        if as_of:
            args += ["--date", as_of]
        live = _run_cli(args)
        if live is not None:
            return live  # type: ignore[return-value]
        bs = dict(_MOCK_BALANCE_SHEET)
        if as_of:
            bs["asOf"] = as_of
        return bs

    def get_trial_balance(self, as_of: str | None = None) -> dict[str, Any]:
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

    def match_bank_to_invoice(
        self, bank_txn_id: str, invoice_number: str
    ) -> dict[str, Any]:
        """
        Attempt to match a bank transaction to an invoice by reference.
        This is the core reconciliation action the agent recommends.
        """
        txns = self.list_bank_transactions()
        invoices = self.list_invoices()

        txn = next((t for t in txns if t["id"] == bank_txn_id), None)
        invoice = next(
            (i for i in invoices if i.get("invoiceNumber") == invoice_number), None
        )

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
