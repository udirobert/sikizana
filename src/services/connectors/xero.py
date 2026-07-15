"""
XeroConnector — adapts the existing XeroService to the AccountingConnector protocol.

This is a thin wrapper, not a rewrite. XeroService already has all the
methods; we just make it conform to the connector contract so the agent
and API layer can call through the abstraction.

When a second connector is added (e.g. QuickBooksConnector), it implements
the same protocol directly.
"""

from __future__ import annotations

from typing import Any

from src.services.connectors.base import AccountingConnector, ConnectorInfo
from src.services.xero_service import XeroService, _invalidate_session_reads


class XeroConnector(AccountingConnector):
    """Xero implementation of the AccountingConnector protocol."""

    @staticmethod
    def info() -> ConnectorInfo:
        return ConnectorInfo(
            platform="xero",
            display_name="Xero",
            auth_type="oauth2-pkce",
            supports_webhooks=True,
            supports_journal_write=True,
        )

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self._svc = XeroService(session_id)

    def mode(self) -> str:
        return self._svc.mode()

    def is_live(self) -> bool:
        return self._svc.is_live()

    # ---- Organisation ----

    def get_organisation(self) -> dict[str, Any]:
        return self._svc.get_organisation()

    # ---- Accounting data (read) ----

    def list_accounts(self) -> list[dict[str, Any]]:
        return self._svc.list_accounts()

    def list_tax_rates(self) -> list[dict[str, Any]]:
        return self._svc.list_tax_rates()

    def list_contacts(self) -> list[dict[str, Any]]:
        return self._svc.list_contacts()

    def list_invoices(
        self,
        status: str | None = None,
        invoice_type: str | None = None,
        contact_id: str | None = None,
        limit: int = 0,
    ) -> list[dict[str, Any]]:
        # XeroService.list_invoices takes status and invoice_type natively.
        result = self._svc.list_invoices(status=status, invoice_type=invoice_type)
        # Filter by contact_id client-side (XeroService doesn't support it)
        if contact_id:
            result = [
                i for i in result
                if i.get("contactId") == contact_id or i.get("contact_id") == contact_id
            ]
        return result[:limit] if limit else result

    def list_bank_transactions(
        self,
        txn_type: str | None = None,
        limit: int = 0,
    ) -> list[dict[str, Any]]:
        result = self._svc.list_bank_transactions(txn_type=txn_type)
        return result[:limit] if limit else result

    def list_payments(self, limit: int = 0) -> list[dict[str, Any]]:
        result = self._svc.list_payments()
        return result[:limit] if limit else result

    def get_profit_and_loss(self, from_date: str | None = None, to_date: str | None = None) -> dict[str, Any]:
        return self._svc.get_profit_and_loss(from_date=from_date, to_date=to_date)

    def get_balance_sheet(self, as_of: str | None = None) -> dict[str, Any]:
        return self._svc.get_balance_sheet(as_of=as_of)

    def get_trial_balance(self, as_of: str | None = None) -> dict[str, Any]:
        return self._svc.get_trial_balance(as_of=as_of)

    def find_unreconciled_transactions(self) -> list[dict[str, Any]]:
        return self._svc.find_unreconciled_transactions()

    def find_overdue_invoices(self) -> list[dict[str, Any]]:
        return self._svc.find_overdue_invoices()

    def match_bank_to_invoice(self, bank_txn_id: str, invoice_number: str) -> dict[str, Any]:
        return self._svc.match_bank_to_invoice(bank_txn_id, invoice_number)

    # ---- Accounting data (write) ----

    def create_manual_journal(
        self,
        description: str,
        debit_account_code: str,
        credit_account_code: str,
        amount: float,
        reference: str | None = None,
    ) -> dict[str, Any]:
        # XeroService uses idempotency_key; we map the generic 'reference'
        # param to it for the connector protocol.
        return self._svc.create_manual_journal(
            description=description,
            debit_account_code=debit_account_code,
            credit_account_code=credit_account_code,
            amount=amount,
            idempotency_key=reference,
        )

    # ---- Connection lifecycle ----

    def disconnect(self) -> bool:
        from src.services.xero_oauth import disconnect as xero_disconnect

        return xero_disconnect(self.session_id)

    def get_connection_status(self) -> dict[str, Any]:
        from src.services.xero_oauth import get_connection_status

        return get_connection_status(self.session_id)

    def invalidate_reads(self) -> None:
        """Drop the read-through cache for this session."""
        _invalidate_session_reads(self.session_id)
