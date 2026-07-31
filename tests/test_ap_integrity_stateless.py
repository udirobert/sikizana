"""Stateless AP Integrity surface (MCP / pay-per-call entry point)."""

from __future__ import annotations

from src.services.ap_integrity.facts import _fingerprint
from src.services.ap_integrity.service import build_ap_findings_stateless


def _invoices() -> list[dict]:
    return [
        {
            "id": "bill-1",
            "invoiceNumber": "SUP-102",
            "reference": "July materials",
            "type": "ACCPAY",
            "contact": {"id": "supplier-1", "name": "Acme Supplies"},
            "date": "2026-07-01",
            "status": "AUTHORISED",
            "total": 1250.0,
        },
        {
            "id": "bill-2",
            "invoiceNumber": "SUP-102",
            "reference": "July materials",
            "type": "ACCPAY",
            "contact": {"id": "supplier-1", "name": "Acme Supplies"},
            "date": "2026-07-02",
            "status": "AUTHORISED",
            "total": 1250.0,
        },
    ]


def _payments() -> list[dict]:
    return [
        {
            "id": "payment-1",
            "date": "2026-07-03",
            "amount": 1250.0,
            "reference": "BACS-91",
            "invoice": {"id": "bill-1", "invoiceNumber": "SUP-102"},
            "contact": {"id": "supplier-1", "name": "Acme Supplies"},
        },
        {
            "id": "payment-2",
            "date": "2026-07-04",
            "amount": 1250.0,
            "reference": "BACS-91",
            "invoice": {"id": "bill-1", "invoiceNumber": "SUP-102"},
            "contact": {"id": "supplier-1", "name": "Acme Supplies"},
        },
    ]


def _contacts(bank_details: str = "11-2222-3333333-44") -> list[dict]:
    return [
        {
            "id": "supplier-1",
            "name": "Acme Supplies",
            "isSupplier": True,
            "bankAccountDetails": bank_details,
        }
    ]


def test_stateless_scan_detects_duplicate_bills_and_payments():
    findings = build_ap_findings_stateless(_invoices(), _contacts(), _payments())

    kinds = {finding["kind"] for finding in findings}
    assert "ap_duplicate_bill" in kinds
    assert "ap_duplicate_payment" in kinds
    for finding in findings:
        assert finding["action"]["type"] == "review"
        assert finding["evidence"]
        # Stateless path owns no review state — always open.
        assert finding["review"]["state"] == "open"


def test_stateless_scan_does_not_touch_db_or_session_state():
    # No session_id argument exists on the stateless entry point; calling it
    # must not raise and must not depend on any seeded baseline.
    findings = build_ap_findings_stateless(_invoices(), _contacts(), _payments())
    assert findings  # detection still runs without a session


def test_supplier_detail_change_requires_caller_managed_baseline():
    # No prior fingerprints -> no change finding (supplier is new, not changed).
    findings = build_ap_findings_stateless(_invoices(), _contacts("55-6666-7777777-88"), _payments())
    assert not any(f["kind"] == "ap_supplier_detail_change" for f in findings)

    # Prior fingerprint differs -> change finding raised, without exposing details.
    prior = {"supplier-1": _fingerprint("11-2222-3333333-44")}
    findings = build_ap_findings_stateless(
        _invoices(), _contacts("55-6666-7777777-88"), _payments(), prior_fingerprints=prior
    )
    change = next(f for f in findings if f["kind"] == "ap_supplier_detail_change")
    assert change["severity"] == "high"
    assert "11-2222" not in str(change)
    assert "55-6666" not in str(change)


def test_stateless_findings_match_session_findings_shape():
    from copy import deepcopy

    from src.services.ap_integrity.service import build_ap_findings

    class _FakeConnector:
        def __init__(self, invoices, contacts, payments):
            self.invoices, self.contacts, self.payments = invoices, contacts, payments

        def list_invoices(self, **_kw):
            return deepcopy(self.invoices)

        def list_contacts(self):
            return deepcopy(self.contacts)

        def list_payments(self, **_kw):
            return deepcopy(self.payments)

    connector = _FakeConnector(_invoices(), _contacts(), _payments())
    session_findings = build_ap_findings("session-shape-compare", connector)
    stateless_findings = build_ap_findings_stateless(_invoices(), _contacts(), _payments())
    # Same kinds detected; stateless reviews are "open" while session may carry state.
    assert {f["kind"] for f in session_findings} == {f["kind"] for f in stateless_findings}
    for finding in stateless_findings:
        assert set(finding.keys()) == {
            "id",
            "kind",
            "severity",
            "title",
            "amount",
            "detail",
            "evidence",
            "review",
            "action",
        }


def test_stateless_path_not_gated_by_kill_switch(monkeypatch):
    # The MCP surface is gated by MCP_API_KEY, not the in-product release flag.
    monkeypatch.setenv("AP_INTEGRITY_DISABLED", "true")
    findings = build_ap_findings_stateless(_invoices(), _contacts(), _payments())
    assert findings  # kill switch does not suppress the stateless surface
