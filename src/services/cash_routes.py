"""
Cash routes — the cheapest way to actually get the money, computed from the
user's own books.

Every observation in this module is derived from ONE business's books.
Nothing here reads another user's data, moves money, nets obligations on the
user's behalf, or names a credit provider. This is the v1 implementation of
§8 of ``docs/REGULATORY_PERIMETER.md`` (rails R1–R12); the module is
deliberately read-only and observation-only (R6).

Three deterministic observations:

1. **Net offset** — the same counterparty is both a customer and a supplier,
   so part of what they owe can be settled against what we owe them. This is
   an *observation*: the user proposes and executes the set-off, we never do.
2. **Cash route** — for each overdue receivable, the routes the user can
   execute alone (net, chase, agree a plan), ranked by cash needed and by the
   interest accruing while they wait. Third-party finance is never named or
   ranked (R3).
3. **Credit side** — receivables that are not clean invoices: part-paid
   balances, overpayments sitting as credit, and balances that vanished
   without a payment. The creditor-side mirror of AP Integrity.

The rules are deterministic and platform-agnostic: this module talks to the
connector contract, never to a platform service.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.services.connectors.base import AccountingConnector
from src.services.finding_kinds import CREDIT_SIDE_EXCEPTION, NET_OFFSET
from src.services.rates import daily_statutory_interest

# A set-off conversation costs time and goodwill. Below this, the cash it
# frees does not pay for the conversation, so we do not raise it.
MIN_OFFSET_AMOUNT = 50.0

# Statuses that represent a real, claimable balance. DRAFT is not a claim;
# VOIDED is not a claim; PAID with a zero balance is not a claim.
_LIVE_STATUSES = ("AUTHORISED", "OVERDUE")


def _parse_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _contact_name(inv: dict[str, Any]) -> str:
    contact = inv.get("contact") or {}
    name = str(contact.get("name") or inv.get("contactName") or "").strip()
    return name or "Unknown"


def _contact_key(inv: dict[str, Any]) -> str:
    """
    Match counterparties across the two legs of the books.

    Names are the only field both legs reliably share (the demo and CLI
    shapes carry a name but not always a contact id), so they are the
    primary key. Normalised so "Acme Ltd" and "acme ltd " are one
    counterparty.
    """
    return " ".join(_contact_name(inv).lower().split())


def _days_overdue(due: date | None, today: date) -> int:
    if due is None:
        return 0
    return max((today - due).days, 0)


def _is_live(inv: dict[str, Any]) -> bool:
    return str(inv.get("status", "")).upper() in _LIVE_STATUSES


@dataclass
class _Doc:
    """One normalised invoice or bill."""

    number: str
    contact: str
    key: str
    total: float
    amount_due: float
    amount_paid: float
    days_overdue: int
    status: str
    due: date | None

    @property
    def overdue(self) -> bool:
        return self.days_overdue > 0 and self.amount_due > 0


@dataclass
class Position:
    """A counterparty's position across both legs of the books."""

    name: str
    key: str
    receivable_total: float = 0.0
    receivable_overdue: float = 0.0
    receivable_oldest_days: int = 0
    payable_total: float = 0.0
    payable_overdue: float = 0.0
    payable_oldest_days: int = 0
    receivable_numbers: list[str] = field(default_factory=list)
    payable_numbers: list[str] = field(default_factory=list)

    @property
    def double_relationship(self) -> bool:
        return self.receivable_total > 0 and self.payable_total > 0

    @property
    def offsettable(self) -> float:
        """The smaller leg — the part of the two balances that can cancel."""
        return min(self.receivable_total, self.payable_total)

    @property
    def net_position(self) -> float:
        """Positive: they owe us. Negative: we owe them."""
        return self.receivable_total - self.payable_total


def _collect(svc: AccountingConnector, invoice_type: str, today: date) -> list[_Doc]:
    docs: list[_Doc] = []
    for inv in svc.list_invoices(invoice_type=invoice_type) or []:
        if not _is_live(inv):
            continue
        due = _parse_date(inv.get("dueDate"))
        docs.append(
            _Doc(
                number=str(inv.get("invoiceNumber") or inv.get("id") or "?"),
                contact=_contact_name(inv),
                key=_contact_key(inv),
                total=_num(inv.get("total")),
                amount_due=_num(inv.get("amountDue")),
                amount_paid=_num(inv.get("amountPaid")),
                days_overdue=_days_overdue(due, today),
                status=str(inv.get("status", "")).upper(),
                due=due,
            )
        )
    return docs


def build_positions(svc: AccountingConnector) -> list[Position]:
    """Net position per counterparty across receivables and payables."""
    today = date.today()
    positions: dict[str, Position] = {}

    for doc in _collect(svc, "ACCREC", today):
        if doc.amount_due <= 0:
            continue
        pos = positions.setdefault(doc.key, Position(name=doc.contact, key=doc.key))
        pos.receivable_total += doc.amount_due
        if doc.overdue:
            pos.receivable_overdue += doc.amount_due
        pos.receivable_oldest_days = max(pos.receivable_oldest_days, doc.days_overdue)
        pos.receivable_numbers.append(doc.number)

    for doc in _collect(svc, "ACCPAY", today):
        if doc.amount_due <= 0:
            continue
        pos = positions.setdefault(doc.key, Position(name=doc.contact, key=doc.key))
        pos.payable_total += doc.amount_due
        if doc.overdue:
            pos.payable_overdue += doc.amount_due
        pos.payable_oldest_days = max(pos.payable_oldest_days, doc.days_overdue)
        pos.payable_numbers.append(doc.number)

    for pos in positions.values():
        pos.receivable_total = round(pos.receivable_total, 2)
        pos.receivable_overdue = round(pos.receivable_overdue, 2)
        pos.payable_total = round(pos.payable_total, 2)
        pos.payable_overdue = round(pos.payable_overdue, 2)

    return sorted(positions.values(), key=lambda p: -p.receivable_total)


def _offset_opportunities(positions: list[Position]) -> list[dict[str, Any]]:
    """Counterparties where both legs are open — the set-off candidates."""
    out: list[dict[str, Any]] = []
    for pos in positions:
        if not pos.double_relationship:
            continue
        offsettable = round(pos.offsettable, 2)
        if offsettable < MIN_OFFSET_AMOUNT:
            continue
        out.append(
            {
                "name": pos.name,
                "receivable_total": pos.receivable_total,
                "receivable_overdue": pos.receivable_overdue,
                "payable_total": pos.payable_total,
                "payable_overdue": pos.payable_overdue,
                "offsettable": offsettable,
                "net_position": round(pos.net_position, 2),
                "receivable_numbers": pos.receivable_numbers,
                "payable_numbers": pos.payable_numbers,
                "interest_per_day": round(daily_statutory_interest(offsettable), 2),
            }
        )
    return sorted(out, key=lambda o: -o["offsettable"])


def _cash_routes(
    svc: AccountingConnector, positions: list[Position], today: date
) -> list[dict[str, Any]]:
    """
    Per-overdue-receivable routes the user can execute alone.

    Ranked by cash needed (a net route needs none) and then by how long the
    money is already late. Third-party finance is deliberately absent (R3).
    """
    pos_by_key = {p.key: p for p in positions}
    routes: list[dict[str, Any]] = []

    for doc in _collect(svc, "ACCREC", today):
        if not doc.overdue:
            continue
        interest = round(daily_statutory_interest(doc.amount_due), 2)
        pos = pos_by_key.get(doc.key)
        options: list[dict[str, Any]] = []

        if pos and pos.double_relationship:
            applied = round(min(doc.amount_due, pos.offsettable), 2)
            if applied > 0:
                cash_needed = round(doc.amount_due - applied, 2)
                options.append(
                    {
                        "key": "net",
                        "label": "Net it against what you owe them",
                        "cash_needed": cash_needed,
                        "cash_saved": applied,
                        "detail": (
                            f"You owe {pos.name} £{pos.payable_total:,.2f} and they owe you "
                            f"£{pos.receivable_total:,.2f}. £{applied:,.2f} of this invoice "
                            f"can be settled against the other balance instead of cash"
                            + (
                                f", leaving £{cash_needed:,.2f} to collect"
                                if cash_needed > 0
                                else " — nothing left to chase"
                            )
                            + "."
                        ),
                    }
                )

        options.append(
            {
                "key": "chase",
                "label": "Chase for the full amount",
                "cash_needed": doc.amount_due,
                "cash_saved": 0.0,
                "detail": (
                    f"Full £{doc.amount_due:,.2f} to collect. Statutory interest is running "
                    f"at about £{interest:,.2f} a day on this invoice."
                ),
            }
        )

        options.append(
            {
                "key": "plan",
                "label": "Agree a payment plan",
                "cash_needed": doc.amount_due,
                "cash_saved": 0.0,
                "detail": (
                    "A written instalment plan converts a stalled invoice into a dated "
                    "schedule. Usually the fastest way to stop a relationship deteriorating."
                ),
            }
        )

        best = min(options, key=lambda o: (o["cash_needed"], o["key"] != "net"))
        routes.append(
            {
                "invoice_number": doc.number,
                "contact": doc.contact,
                "amount": doc.amount_due,
                "days_overdue": doc.days_overdue,
                "interest_per_day": interest,
                "routes": options,
                "best": best["key"],
                "best_label": best["label"],
                "cash_needed": best["cash_needed"],
            }
        )

    return sorted(routes, key=lambda r: (-r["cash_needed"], -r["days_overdue"]))


def _credit_side_exceptions(svc: AccountingConnector, today: date) -> list[dict[str, Any]]:
    """
    Receivables that are not clean invoices.

    Three shapes, all of which quietly shrink what actually lands in the
    bank:
      - part-paid: money came in, but the invoice was not settled in full
      - overpaid: the balance went negative, so a credit is sitting there
      - written-off: the balance disappeared with no payment recorded
    """
    out: list[dict[str, Any]] = []

    for doc in _collect(svc, "ACCREC", today):
        if doc.amount_due < 0:
            out.append(
                {
                    "key": "overpaid",
                    "invoice_number": doc.number,
                    "contact": doc.contact,
                    "amount": round(abs(doc.amount_due), 2),
                    "days_overdue": doc.days_overdue,
                    "detail": (
                        f"£{abs(doc.amount_due):,.2f} more was paid on {doc.number} than was "
                        f"invoiced — it is sitting as a credit on the account, not as cash "
                        f"you can use."
                    ),
                }
            )
            continue

        if doc.amount_due > 0 and doc.amount_paid > 0:
            out.append(
                {
                    "key": "part_paid",
                    "invoice_number": doc.number,
                    "contact": doc.contact,
                    "amount": doc.amount_due,
                    "days_overdue": doc.days_overdue,
                    "detail": (
                        f"{doc.number} is part-paid — £{doc.amount_paid:,.2f} came in and "
                        f"£{doc.amount_due:,.2f} is still outstanding"
                        + (f", {doc.days_overdue} days late" if doc.days_overdue else "")
                        + ". A part payment is often a signal that the balance is being lost."
                    ),
                }
            )
            continue

        if doc.total > 0 and doc.amount_due == 0 and doc.amount_paid == 0:
            out.append(
                {
                    "key": "written_off",
                    "invoice_number": doc.number,
                    "contact": doc.contact,
                    "amount": doc.total,
                    "days_overdue": doc.days_overdue,
                    "detail": (
                        f"£{doc.total:,.2f} on {doc.number} has no balance and no payment "
                        f"recorded — it was either written off or credited back. Worth "
                        f"confirming it was deliberate."
                    ),
                }
            )

    order = {"part_paid": 0, "written_off": 1, "overpaid": 2}
    return sorted(out, key=lambda e: (order.get(e["key"], 9), -e["amount"]))


def build_cash_routes(svc: AccountingConnector) -> dict[str, Any]:
    """
    The full cash-route picture for one business's books.

    Returns:
      {
        "positions": [ {name, receivable_total, payable_total, offsettable, ...} ],
        "offsets": [ {name, offsettable, ...} ],
        "routes": [ {invoice_number, contact, amount, routes: [...], best} ],
        "credit_side": [ {key, invoice_number, contact, amount, detail} ],
        "totals": {offsettable_total, cash_at_risk, credit_side_exposure},
      }
    """
    today = date.today()
    positions = build_positions(svc)
    offsets = _offset_opportunities(positions)
    routes = _cash_routes(svc, positions, today)
    credit_side = _credit_side_exceptions(svc, today)

    offsettable_total = round(sum(o["offsettable"] for o in offsets), 2)
    cash_at_risk = round(sum(r["amount"] for r in routes), 2)
    credit_side_exposure = round(sum(e["amount"] for e in credit_side), 2)

    return {
        "positions": [
            {
                "name": p.name,
                "receivable_total": p.receivable_total,
                "receivable_overdue": p.receivable_overdue,
                "payable_total": p.payable_total,
                "payable_overdue": p.payable_overdue,
                "offsettable": round(p.offsettable, 2),
                "net_position": round(p.net_position, 2),
                "double_relationship": p.double_relationship,
            }
            for p in positions
        ],
        "offsets": offsets,
        "routes": routes,
        "credit_side": credit_side,
        "totals": {
            "offsettable_total": offsettable_total,
            "cash_at_risk": cash_at_risk,
            "credit_side_exposure": credit_side_exposure,
        },
    }


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------


def build_cash_route_findings(
    svc: AccountingConnector, data: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """
    Canonical findings for the cash-route observations.

    Same shape as every other finding: id, kind, severity, title, amount,
    detail, and exactly one ready-to-run action prompt.

    ``data`` may be a precomputed ``build_cash_routes()`` result so the
    findings panel does not walk the books twice.
    """
    data = data if data is not None else build_cash_routes(svc)
    findings: list[dict[str, Any]] = []

    for offset in data["offsets"]:
        name = offset["name"]
        amount = offset["offsettable"]
        cash_saved = amount
        findings.append(
            {
                "id": f"offset-{offset['name']}".replace(" ", "-").lower(),
                "kind": NET_OFFSET,
                "severity": "medium",
                "title": f"{name}: £{cash_saved:,.0f} can be settled without cash",
                "amount": cash_saved,
                "detail": (
                    f"You owe {name} £{offset['payable_total']:,.2f} and {name} owes you "
                    f"£{offset['receivable_total']:,.2f}. £{cash_saved:,.2f} of the two "
                    f"balances can cancel out instead of being paid in cash"
                    + (
                        f" — about £{offset['interest_per_day']:,.2f} a day of interest "
                        f"stops running on that part"
                        if offset["interest_per_day"] > 0
                        else ""
                    )
                    + "."
                ),
                "action": {
                    "type": "draft",
                    "label": "Draft a set-off note",
                    "prompt": (
                        f"I owe {name} £{offset['payable_total']:,.2f} and {name} owes me "
                        f"£{offset['receivable_total']:,.2f}. Explain how a set-off works "
                        f"between these two balances, including the VAT and contract-terms "
                        f"points and whether we would need {name}'s agreement. Then draft a "
                        f"short note to {name} proposing that we settle £{cash_saved:,.2f} "
                        f"of the two balances against each other. Flag anything that needs "
                        f"my accountant to confirm, and do not commit us to anything "
                        f"beyond the balances in the books."
                    ),
                },
            }
        )

    for exc in data["credit_side"]:
        severity = "medium" if exc["key"] == "part_paid" else "low"
        findings.append(
            {
                "id": f"credit-side-{exc['key']}-{exc['invoice_number']}"
                .replace(" ", "-")
                .lower(),
                "kind": CREDIT_SIDE_EXCEPTION,
                "severity": severity,
                "title": f"{exc['invoice_number']} — {exc['contact']}",
                "amount": exc["amount"],
                "detail": exc["detail"],
                "action": {
                    "type": "review",
                    "label": "Review",
                    "prompt": (
                        f"Review {exc['invoice_number']} for {exc['contact']}: "
                        f"{exc['detail']} What should I check in the books, and what is the "
                        f"cleanest way to resolve it so the amount either lands or is "
                        f"written off deliberately?"
                    ),
                },
            }
        )

    return findings
