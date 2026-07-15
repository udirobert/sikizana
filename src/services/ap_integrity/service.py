"""Compose AP Integrity rules into canonical Sikizana findings."""

from __future__ import annotations

from src.services.ap_integrity.facts import build_facts
from src.services.ap_integrity.rules.duplicate_bills import find_duplicate_bills
from src.services.ap_integrity.rules.duplicate_payments import find_duplicate_payments
from src.services.ap_integrity.rules.payment_anomalies import find_payment_anomalies
from src.services.ap_integrity.rules.supplier_detail_changes import find_supplier_detail_changes
from src.services.ap_integrity.store import get_review_states, sync_supplier_fingerprints
from src.services.connectors.base import AccountingConnector


def build_ap_findings(session_id: str, svc: AccountingConnector) -> list[dict]:
    """Evaluate one session's payable facts and return canonical finding dicts."""
    bills, payments, suppliers = build_facts(svc)
    changed_supplier_ids = sync_supplier_fingerprints(session_id, suppliers)
    candidates = [
        *find_duplicate_bills(bills),
        *find_duplicate_payments(payments, bills),
        *find_supplier_detail_changes(suppliers, changed_supplier_ids),
        *find_payment_anomalies(payments),
    ]
    reviews = get_review_states(session_id, [candidate.id for candidate in candidates])
    return [candidate.as_dict(reviews.get(candidate.id)) for candidate in candidates]
