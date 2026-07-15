"""Deterministic duplicate-payment detection for purchase bills."""

from __future__ import annotations

from collections import defaultdict

from src.services.ap_integrity.models import ApFinding, Evidence, PayableBill, Payment
from src.services.ap_integrity.rules._common import days_between, stable_id


def find_duplicate_payments(payments: list[Payment], bills: list[PayableBill]) -> list[ApFinding]:
    bill_totals = {bill.id: bill.total for bill in bills}
    groups: dict[tuple[str, int], list[Payment]] = defaultdict(list)
    for payment in payments:
        if payment.bill_id and payment.amount > 0:
            groups[(payment.bill_id, round(payment.amount * 100))].append(payment)

    findings: list[ApFinding] = []
    for (bill_id, _amount), group in groups.items():
        ordered = sorted(group, key=lambda payment: (payment.date, payment.id))
        if len(ordered) < 2:
            continue
        total = bill_totals.get(bill_id, 0)
        for left, right in zip(ordered, ordered[1:]):
            gap = days_between(left.date, right.date)
            # A full-value payment repeated within a week is sufficiently
            # specific to surface. Legitimate instalments stay out of scope.
            if gap is None or gap > 7 or left.amount + right.amount < total - 0.01:
                continue
            findings.append(
                ApFinding(
                    id=stable_id("ap-duplicate-payment", bill_id, left.id, right.id),
                    kind="ap_duplicate_payment",
                    severity="high" if left.amount >= 500 else "medium",
                    title=f"Possible duplicate payment: {left.supplier_name}",
                    amount=min(left.amount, right.amount),
                    detail=f"Two payments of £{left.amount:,.2f} were applied to bill {left.bill_number or bill_id} within {gap} day{'s' if gap != 1 else ''}.",
                    action_label="Review evidence",
                    action_prompt=(
                        f"Review two possible duplicate payments to {left.supplier_name} for bill "
                        f"{left.bill_number or bill_id}. Show the payment dates and references, then explain "
                        "what to verify before requesting a credit or refund."
                    ),
                    evidence=(
                        Evidence(left.id, "First payment", f"{left.date} · £{left.amount:,.2f} · {left.reference or 'No reference'}"),
                        Evidence(right.id, "Second payment", f"{right.date} · £{right.amount:,.2f} · {right.reference or 'No reference'}"),
                    ),
                )
            )
    return findings
