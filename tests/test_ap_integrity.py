"""AP Integrity rules and durable human review state."""

from __future__ import annotations

from copy import deepcopy

from src.services.ap_integrity.service import build_ap_findings
from src.services.ap_integrity.store import get_review_summary, set_review_outcome, set_review_state
from src.services.payment_store import delete_session_data


class FakeConnector:
    def __init__(self, invoices: list[dict], payments: list[dict], contacts: list[dict]):
        self.invoices = invoices
        self.payments = payments
        self.contacts = contacts

    def list_invoices(self, **_kwargs):
        return deepcopy(self.invoices)

    def list_payments(self, **_kwargs):
        return deepcopy(self.payments)

    def list_contacts(self):
        return deepcopy(self.contacts)


def _connector(bank_details: str = "11-2222-3333333-44") -> FakeConnector:
    return FakeConnector(
        invoices=[
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
        ],
        payments=[
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
        ],
        contacts=[
            {
                "id": "supplier-1",
                "name": "Acme Supplies",
                "isSupplier": True,
                "bankAccountDetails": bank_details,
            }
        ],
    )


def test_duplicate_bill_and_payment_are_evidence_backed():
    findings = build_ap_findings("session-ap", _connector())

    kinds = {finding["kind"] for finding in findings}
    assert "ap_duplicate_bill" in kinds
    assert "ap_duplicate_payment" in kinds
    for finding in findings:
        assert finding["action"]["type"] == "review"
        assert finding["evidence"]
        assert finding["review"]["state"] == "open"


def test_supplier_detail_change_is_detected_without_exposing_details():
    session_id = "session-supplier-change"
    build_ap_findings(session_id, _connector("11-2222-3333333-44"))
    findings = build_ap_findings(session_id, _connector("55-6666-7777777-88"))

    finding = next(item for item in findings if item["kind"] == "ap_supplier_detail_change")
    assert finding["severity"] == "high"
    assert "11-2222" not in str(finding)
    assert "55-6666" not in str(finding)


def test_review_state_persists_and_is_erased_with_session_data():
    session_id = "session-review"
    findings = build_ap_findings(session_id, _connector())
    finding_id = next(item["id"] for item in findings if item["kind"] == "ap_duplicate_bill")

    set_review_state(session_id, finding_id, "investigating")
    refreshed = build_ap_findings(session_id, _connector())
    finding = next(item for item in refreshed if item["id"] == finding_id)
    assert finding["review"]["state"] == "investigating"

    deleted = delete_session_data(session_id)
    assert deleted["ap_finding_reviews"] == 1
    assert deleted["ap_supplier_fingerprints"] == 1


def test_review_outcome_captures_confirmed_value_and_dismissal_reason():
    session_id = "session-review-outcome"
    findings = build_ap_findings(session_id, _connector())
    finding_id = next(item["id"] for item in findings if item["kind"] == "ap_duplicate_payment")

    set_review_outcome(session_id, finding_id, "confirmed", confirmed_amount=1250.0)
    refreshed = build_ap_findings(session_id, _connector())
    finding = next(item for item in refreshed if item["id"] == finding_id)
    assert finding["review"]["state"] == "confirmed"
    assert finding["review"]["confirmed_amount"] == 1250.0
    assert get_review_summary(session_id) == {
        "confirmed_value": 1250.0,
        "confirmed_count": 1,
        "dismissed_count": 0,
    }

    set_review_outcome(session_id, finding_id, "dismissed", dismissal_reason="supplier credit note")
    refreshed = build_ap_findings(session_id, _connector())
    finding = next(item for item in refreshed if item["id"] == finding_id)
    assert finding["review"]["state"] == "dismissed"
    assert finding["review"]["dismissal_reason"] == "supplier credit note"
    assert "confirmed_amount" not in finding["review"]
    assert get_review_summary(session_id) == {
        "confirmed_value": 0.0,
        "confirmed_count": 0,
        "dismissed_count": 1,
    }


def test_ap_integrity_kill_switch(monkeypatch):
    monkeypatch.setenv("AP_INTEGRITY_DISABLED", "true")

    assert build_ap_findings("session-disabled", _connector(), user_id=1) == []


def test_ap_integrity_user_allowlist(monkeypatch):
    monkeypatch.delenv("AP_INTEGRITY_DISABLED", raising=False)
    monkeypatch.setenv("AP_INTEGRITY_USER_IDS", "42,99")

    assert build_ap_findings("session-not-allowed", _connector(), user_id=7) == []
    assert build_ap_findings("session-allowed", _connector(), user_id=42)
