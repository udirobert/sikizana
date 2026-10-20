"""
AccountingConnector — the abstract contract for any accounting platform.

Every method returns plain dicts/lists in a normalized shape, regardless
of which platform served the data. Connectors are responsible for
translating their platform's schema into this common shape.

The shapes are deliberately close to what XeroService already returns,
so the existing XeroService can implement this protocol with minimal
changes. When a second connector is added, it normalizes to the same
shapes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class ConnectorInfo:
    """Static metadata about a connector — used for UI and routing."""

    platform: str  # "xero", "quickbooks", "sage", etc.
    display_name: str  # "Xero", "QuickBooks Online"
    auth_type: str  # "oauth2", "oauth2-pkce", "api-key"
    supports_webhooks: bool = True
    supports_journal_write: bool = True
    logo_url: str = ""


class AccountingConnector(ABC):
    """
    Abstract base class for accounting platform connectors.

    A connector instance is session-scoped — it knows which session it's
    serving and resolves tokens, tenant, and data for that session.

    Implementations:
      - XeroConnector (src/services/connectors/xero.py) — wraps XeroService
      - Future: QuickBooksConnector, SageConnector, etc.
    """

    # The session ID this connector is serving. Set by __init__.
    session_id: str

    @staticmethod
    @abstractmethod
    def info() -> ConnectorInfo:
        """Static metadata about this connector."""
        ...

    @abstractmethod
    def __init__(self, session_id: str) -> None:
        """Create a session-scoped connector instance."""
        ...

    @abstractmethod
    def mode(self) -> str:
        """Which data source is active: 'live-oauth', 'live-cli', 'demo', etc."""
        ...

    @abstractmethod
    def is_live(self) -> bool:
        """True if connected to a real platform org (not demo data)."""
        ...

    # ---- Organisation ----

    @abstractmethod
    def get_organisation(self) -> dict[str, Any]:
        """Org details: name, country, base currency, tax regime."""
        ...

    # ---- Accounting data (read) ----

    @abstractmethod
    def list_accounts(self) -> list[dict[str, Any]]:
        """Chart of accounts: code, name, type."""
        ...

    @abstractmethod
    def list_tax_rates(self) -> list[dict[str, Any]]:
        """Tax rates: name, rate, type."""
        ...

    @abstractmethod
    def list_contacts(self) -> list[dict[str, Any]]:
        """Contacts (customers + suppliers): name, email, status."""
        ...

    @abstractmethod
    def list_invoices(
        self,
        status: str | None = None,
        invoice_type: str | None = None,
        contact_id: str | None = None,
        limit: int = 0,
    ) -> list[dict[str, Any]]:
        """Invoices: number, contact, amount, due date, status.

        Args:
            status: Filter by invoice status (e.g. "AUTHORISED", "PAID").
                None = all statuses.
            invoice_type: Filter by type (e.g. "ACCREC" for sales invoices,
                "ACCPAY" for bills). None = all types.
            contact_id: Filter by contact. None = all contacts.
            limit: Max results. 0 = no limit.
        """
        ...

    @abstractmethod
    def list_bank_transactions(
        self,
        txn_type: str | None = None,
        limit: int = 0,
    ) -> list[dict[str, Any]]:
        """Bank transactions: date, amount, account, reference.

        Args:
            txn_type: Filter by type (e.g. "RECEIVE", "SPEND"). None = all.
            limit: Max results. 0 = no limit.
        """
        ...

    @abstractmethod
    def list_payments(self, limit: int = 0) -> list[dict[str, Any]]:
        """Payments applied to invoices and credit notes.

        Each payment must expose stable payment, invoice, and contact IDs where
        the source platform provides them. AP Integrity uses this normalized
        history to detect potential duplicate payments without importing a
        platform-specific service.
        """
        ...

    @abstractmethod
    def get_profit_and_loss(
        self, from_date: str | None = None, to_date: str | None = None
    ) -> dict[str, Any]:
        """P&L report: revenue, expenses, net profit."""
        ...

    def get_spend_by_category(
        self, from_date: str | None = None, to_date: str | None = None
    ) -> dict[str, Any]:
        """Spend grouped by expense category for a period.

        Non-abstract: the default derives categories from the P&L report so
        every connector gets the tool for free. Returns::

            {"period": {"from": ..., "to": ...}, "currency": "GBP",
             "total": float,
             "categories": [{"name": str, "amount": float,
                             "prior_amount": float | None}]}

        sorted descending by amount. Connectors with a native aggregation
        endpoint (e.g. Seapoint's aggregate mode) override this rather than
        paging rows client-side.
        """
        pl = self.get_profit_and_loss(from_date=from_date, to_date=to_date) or {}
        categories = _pl_expense_categories(pl)
        return {
            "period": {
                "from": from_date or pl.get("fromDate"),
                "to": to_date or pl.get("toDate"),
            },
            "currency": "GBP",
            "total": round(sum(categories.values()), 2),
            "categories": [
                {"name": name, "amount": round(amount, 2), "prior_amount": None}
                for name, amount in sorted(
                    categories.items(), key=lambda kv: kv[1], reverse=True
                )
            ],
        }

    @abstractmethod
    def get_balance_sheet(self, as_of: str | None = None) -> dict[str, Any]:
        """Balance sheet: assets, liabilities, equity."""
        ...

    @abstractmethod
    def get_trial_balance(self, as_of: str | None = None) -> dict[str, Any]:
        """Trial balance: account codes with debit/credit balances."""
        ...

    @abstractmethod
    def find_unreconciled_transactions(self) -> list[dict[str, Any]]:
        """Bank transactions that haven't been reconciled yet."""
        ...

    @abstractmethod
    def find_overdue_invoices(self) -> list[dict[str, Any]]:
        """Authorised invoices past their due date."""
        ...

    @abstractmethod
    def match_bank_to_invoice(self, bank_txn_id: str, invoice_number: str) -> dict[str, Any]:
        """Attempt to match a bank transaction to an invoice by reference.

        Returns {'matched': bool, 'reason': str, ...}.
        """
        ...

    # ---- Accounting data (write) ----

    @abstractmethod
    def create_manual_journal(
        self,
        description: str,
        debit_account_code: str,
        credit_account_code: str,
        amount: float,
        reference: str | None = None,
    ) -> dict[str, Any]:
        """Post a manual journal entry. Returns the journal ID or error."""
        ...

    # ---- Connection lifecycle ----

    @abstractmethod
    def disconnect(self) -> bool:
        """Revoke OAuth tokens and delete stored credentials. Does NOT
        delete memories, conversations, or other Sikizana-owned data."""
        ...

    @abstractmethod
    def get_connection_status(self) -> dict[str, Any]:
        """Check connection: {'connected': bool, 'tenant_id': ..., 'tenant_name': ...}"""
        ...


# ---------------------------------------------------------------------------
# P&L → spend-by-category derivation (default for get_spend_by_category).
# ---------------------------------------------------------------------------

_EXPENSE_SECTION_WORDS = ("expense", "cost", "overhead", "direct")
_INCOME_SECTION_WORDS = ("income", "revenue", "sales")


def _rget(obj: dict[str, Any], key: str, default: Any = None) -> Any:
    """CamelCase-or-PascalCase field read (Xero CLI vs API report shapes)."""
    if key in obj:
        return obj[key]
    return obj.get(key[:1].upper() + key[1:], default)


def _to_float(value: Any) -> float:
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def _expense_items_from_report(raw: dict[str, Any]) -> dict[str, float]:
    """Collect line items that live under an expense/cost section of a raw
    Xero report. Returns {} when the report has no section structure."""
    categories: dict[str, float] = {}

    def walk(rows: list[dict[str, Any]], in_expense: bool) -> None:
        for row in rows:
            row_type = _rget(row, "rowType", "")
            cells = _rget(row, "cells", []) or []
            title = str(_rget(cells[0], "value", "") or "") if cells else ""
            nested = _rget(row, "rows") or []
            if row_type == "Section":
                lowered = title.lower()
                if any(w in lowered for w in _INCOME_SECTION_WORDS):
                    walk(nested, False)
                else:
                    walk(
                        nested,
                        in_expense
                        or any(w in lowered for w in _EXPENSE_SECTION_WORDS),
                    )
                continue
            if row_type == "Row" and len(cells) >= 2 and in_expense and title:
                categories[title] = categories.get(title, 0.0) + abs(
                    _to_float(_rget(cells[1], "value", "0"))
                )
            if nested:
                walk(nested, in_expense)

    walk(_rget(raw, "rows", []) or [], False)
    return categories


def _pl_expense_categories(pl: dict[str, Any]) -> dict[str, float]:
    """Best-effort expense-name → amount map from a normalized P&L.

    Two shapes exist: the mock report exposes `rows` where expenses carry
    negative values, and the parsed live report exposes `lineItems` plus the
    raw sectioned report under `raw`.
    """
    categories: dict[str, float] = {}
    rows = pl.get("rows")
    if isinstance(rows, list) and rows and isinstance(rows[0], dict) and "value" in rows[0]:
        # Mock shape: positive rows are revenue, negative rows are spend.
        for row in rows:
            value = _to_float(row.get("value", 0))
            if value < 0:
                name = str(row.get("account") or "Other")
                categories[name] = categories.get(name, 0.0) + abs(value)
        return categories

    # Parsed live report — prefer the section structure in the raw payload
    # so income lines never get counted as spend.
    categories = _expense_items_from_report(pl.get("raw") or {})
    if categories:
        return categories

    # Fallback without sections: only negative line items count as spend;
    # if none exist (flat unsigned exports), take all items as expenses.
    items = pl.get("lineItems") or []
    for item in items:
        value = _to_float(item.get("value", 0))
        if value < 0:
            name = str(item.get("label") or "Other")
            categories[name] = categories.get(name, 0.0) + abs(value)
    if categories:
        return categories
    for item in items:
        value = abs(_to_float(item.get("value", 0)))
        name = str(item.get("label") or "Other")
        if name and value:
            categories[name] = categories.get(name, 0.0) + value
    return categories
