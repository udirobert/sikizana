"""Compose AP Integrity rules into canonical Sikizana findings."""

from __future__ import annotations

from typing import Any

from src.services.ap_integrity.config import is_ap_integrity_enabled
from src.services.ap_integrity.facts import build_facts, build_facts_from_raw
from src.services.ap_integrity.rules.duplicate_bills import find_duplicate_bills
from src.services.ap_integrity.rules.duplicate_payments import find_duplicate_payments
from src.services.ap_integrity.rules.payment_anomalies import find_payment_anomalies
from src.services.ap_integrity.rules.supplier_detail_changes import find_supplier_detail_changes
from src.services.ap_integrity.store import get_review_outcomes, sync_supplier_fingerprints
from src.services.connectors.base import AccountingConnector


def build_ap_findings(session_id: str, svc: AccountingConnector, user_id: int | None = None) -> list[dict]:
    """Evaluate one session's payable facts and return canonical finding dicts."""
    if not is_ap_integrity_enabled(user_id):
        return []

    bills, payments, suppliers = build_facts(svc)
    changed_supplier_ids = sync_supplier_fingerprints(session_id, suppliers)
    candidates = [
        *find_duplicate_bills(bills),
        *find_duplicate_payments(payments, bills),
        *find_supplier_detail_changes(suppliers, changed_supplier_ids),
        *find_payment_anomalies(payments),
    ]
    reviews = get_review_outcomes(session_id, [candidate.id for candidate in candidates])
    return [candidate.as_dict(reviews.get(candidate.id)) for candidate in candidates]


def _changed_suppliers(
    suppliers: list, prior_fingerprints: dict[str, str] | None
) -> set[str]:
    """Supplier IDs whose bank-detail fingerprint differs from the caller's baseline.

    Mirrors `sync_supplier_fingerprints` semantics: a supplier is "changed"
    only when a prior fingerprint exists and differs. Suppliers with no prior
    baseline are new, not changes, so they do not raise a finding.
    """
    if not prior_fingerprints:
        return set()
    changed: set[str] = set()
    for supplier in suppliers:
        prior = prior_fingerprints.get(supplier.id)
        if prior and supplier.bank_details_fingerprint and prior != supplier.bank_details_fingerprint:
            changed.add(supplier.id)
    return changed


def build_ap_findings_stateless(
    invoices: list[dict[str, Any]],
    contacts: list[dict[str, Any]],
    payments: list[dict[str, Any]],
    prior_fingerprints: dict[str, str] | None = None,
) -> list[dict]:
    """Stateless AP Integrity scan for the MCP / pay-per-call surface.

    Takes raw normalized dicts (the same shapes a connector returns) and
    returns canonical findings with no session, DB, or connector dependency.
    Review state is always "open" (the caller owns any review workflow), and
    supplier-detail-change detection uses `prior_fingerprints` the caller
    manages across calls instead of the session-scoped baseline table.
    """
    bills, ap_payments, suppliers = build_facts_from_raw(invoices, contacts, payments)
    changed_supplier_ids = _changed_suppliers(suppliers, prior_fingerprints)
    candidates = [
        *find_duplicate_bills(bills),
        *find_duplicate_payments(ap_payments, bills),
        *find_supplier_detail_changes(suppliers, changed_supplier_ids),
        *find_payment_anomalies(ap_payments),
    ]
    return [candidate.as_dict(None) for candidate in candidates]
