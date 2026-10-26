"""
Cash routes — net offsets, per-invoice routes, credit-side exceptions.

Also pins the regulatory perimeter: the output of these features must never
contain credit-promotion, guarantee, or creditworthiness language
(docs/REGULATORY_PERIMETER.md R2, R3, R7, R8). A regression that smuggles
a lender recommendation into a bookkeeping assistant fails here.
"""

from __future__ import annotations

from typing import Any

from src.services.cash_routes import build_cash_routes, build_cash_route_findings


class StubConnector:
    """Minimal stand-in for the connector contract — invoices only."""

    def __init__(self, invoices: list[dict[str, Any]]) -> None:
        self._invoices = invoices

    def list_invoices(
        self,
        status: str | None = None,
        invoice_type: str | None = None,
        contact_id: str | None = None,
        limit: int = 0,
    ) -> list[dict[str, Any]]:
        rows = self._invoices
        if invoice_type:
            rows = [i for i in rows if i.get("type") == invoice_type.upper()]
        if status:
            rows = [i for i in rows if i.get("status") == status.upper()]
        return rows[:limit] if limit else rows


def _inv(
    number: str,
    kind: str,
    contact: str,
    total: float,
    due: str,
    *,
    due_amount: float | None = None,
    paid: float = 0.0,
    status: str = "AUTHORISED",
) -> dict[str, Any]:
    return {
        "id": number,
        "invoiceNumber": number,
        "type": kind,
        "contact": {"name": contact},
        "date": "2026-01-01",
        "dueDate": due,
        "status": status,
        "total": total,
        "amountDue": total if due_amount is None else due_amount,
        "amountPaid": paid,
    }


PAST = "2026-01-01"  # long overdue relative to today
FUTURE = "2099-01-01"


def _two_sided_books() -> StubConnector:
    """Acme is both a customer (late) and a supplier (open)."""
    return StubConnector(
        [
            _inv("INV-1", "ACCREC", "Acme Ltd", 1500.0, PAST),
            _inv("BILL-1", "ACCPAY", "Acme Ltd", 2000.0, FUTURE),
            _inv("INV-2", "ACCREC", "Solo Ltd", 400.0, PAST),
        ]
    )


def test_net_offset_detected_when_counterparty_is_on_both_legs() -> None:
    data = build_cash_routes(_two_sided_books())
    offsets = {o["name"]: o for o in data["offsets"]}
    assert "Acme Ltd" in offsets
    acme = offsets["Acme Ltd"]
    assert acme["receivable_total"] == 1500.0
    assert acme["payable_total"] == 2000.0
    assert acme["offsettable"] == 1500.0
    assert acme["net_position"] == -500.0


def test_no_offset_for_one_sided_counterparty() -> None:
    data = build_cash_routes(_two_sided_books())
    assert "Solo Ltd" not in {o["name"] for o in data["offsets"]}


def test_tiny_offsets_are_not_raised() -> None:
    books = StubConnector(
        [
            _inv("INV-1", "ACCREC", "Acme Ltd", 20.0, PAST),
            _inv("BILL-1", "ACCPAY", "Acme Ltd", 30.0, FUTURE),
        ]
    )
    assert build_cash_routes(books)["offsets"] == []


def test_net_route_beats_chase_and_reduces_cash_needed() -> None:
    data = build_cash_routes(_two_sided_books())
    route = next(r for r in data["routes"] if r["invoice_number"] == "INV-1")
    assert route["best"] == "net"
    assert route["cash_needed"] == 0.0
    labels = {o["key"] for o in route["routes"]}
    assert labels == {"net", "chase", "plan"}


def test_chase_is_the_route_when_there_is_nothing_to_net() -> None:
    data = build_cash_routes(_two_sided_books())
    route = next(r for r in data["routes"] if r["invoice_number"] == "INV-2")
    assert route["best"] == "chase"
    assert route["cash_needed"] == 400.0


def test_credit_side_exceptions() -> None:
    books = StubConnector(
        [
            # part-paid: some money came in, balance still open
            _inv("INV-3", "ACCREC", "Part Ltd", 1000.0, PAST, due_amount=300.0, paid=700.0),
            # overpaid: balance went negative
            _inv("INV-4", "ACCREC", "Over Ltd", 500.0, PAST, due_amount=-120.0, paid=620.0),
            # written off: balance gone, no payment recorded
            _inv("INV-5", "ACCREC", "Gone Ltd", 800.0, PAST, due_amount=0.0, paid=0.0),
        ]
    )
    data = build_cash_routes(books)
    keys = {e["invoice_number"]: e["key"] for e in data["credit_side"]}
    assert keys == {
        "INV-3": "part_paid",
        "INV-5": "written_off",
        "INV-4": "overpaid",
    }


def test_findings_carry_actions_and_amounts() -> None:
    findings = build_cash_route_findings(_two_sided_books())
    assert findings
    for f in findings:
        assert f["action"]["prompt"]
        assert f["action"]["label"]
        assert f["severity"] in ("high", "medium", "low")
        assert isinstance(f["amount"], (int, float))
    offset = next(f for f in findings if f["kind"] == "net_offset_opportunity")
    assert offset["amount"] == 1500.0
    assert "Acme Ltd" in offset["title"]


# --- Perimeter guard ------------------------------------------------------
#
# The product is a bookkeeping advisor, not a finance broker. These strings
# must never appear in what we put in front of a user (R2, R3, R7, R8).

_FORBIDDEN = [
    "lender",
    "loan",
    "credit score",
    "creditworthy",
    "pre-approved",
    "preapproved",
    "guarantee",
    "we guarantee",
    "factoring",
    "borrow",
    "afford it",
    "apply now",
]


def _all_user_facing_text() -> str:
    data = build_cash_routes(_two_sided_books())
    findings = build_cash_route_findings(_two_sided_books())
    blobs: list[str] = []
    for f in findings:
        blobs += [f["title"], f["detail"], f["action"]["label"], f["action"]["prompt"]]
    blobs.append(str(data))
    return " ".join(blobs).lower()


def test_no_credit_promotion_or_guarantee_language() -> None:
    text = _all_user_facing_text()
    for phrase in _FORBIDDEN:
        assert phrase not in text, f"perimeter breach — output contains '{phrase}'"


def test_no_guarantee_language_in_the_agent_tool() -> None:
    from src.tools.accounting_tools import get_cash_routes

    # The tool needs a session-bound connector; demo mode is enough here.
    text = get_cash_routes().lower()
    for phrase in _FORBIDDEN:
        assert phrase not in text, f"perimeter breach — tool output contains '{phrase}'"
