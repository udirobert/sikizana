"""Deterministic duplicate and near-duplicate payable-bill detection."""

from __future__ import annotations

from collections import defaultdict

from src.services.ap_integrity.models import ApFinding, Evidence, PayableBill
from src.services.ap_integrity.rules._common import days_between, normalized, stable_id


def find_duplicate_bills(bills: list[PayableBill]) -> list[ApFinding]:
    findings: list[ApFinding] = []
    exact_groups: dict[tuple[str, str], list[PayableBill]] = defaultdict(list)
    for bill in bills:
        number = normalized(bill.invoice_number)
        if number:
            exact_groups[(bill.supplier_id, number)].append(bill)

    covered_bill_ids: set[str] = set()
    for (supplier_id, number), group in exact_groups.items():
        if len(group) < 2:
            continue
        ordered = sorted(group, key=lambda bill: bill.id)
        covered_bill_ids.update(bill.id for bill in ordered)
        exposure = max(sum(bill.total for bill in ordered) - max(bill.total for bill in ordered), 0)
        supplier = ordered[0].supplier_name
        evidence = tuple(
            Evidence(bill.id, bill.invoice_number or "Unnumbered bill", f"{bill.date} · £{bill.total:,.2f}")
            for bill in ordered
        )
        findings.append(
            ApFinding(
                id=stable_id("ap-duplicate-bill", supplier_id, number, *(bill.id for bill in ordered)),
                kind="ap_duplicate_bill",
                severity="high" if exposure >= 500 else "medium",
                title=f"Possible duplicate bill: {supplier}",
                amount=exposure,
                detail=f"{len(ordered)} bills share invoice number {ordered[0].invoice_number or number}.",
                action_label="Review evidence",
                action_prompt=(
                    f"Review these possible duplicate purchase bills from {supplier}. Show the shared invoice "
                    f"number {ordered[0].invoice_number or number}, the source records, and the safest next step. "
                    "Do not change or pay anything."
                ),
                evidence=evidence,
            )
        )

    # A near match needs the same supplier, reference, amount, and a short
    # timing window. Requiring all four keeps recurring monthly bills quiet.
    candidate_groups: dict[tuple[str, str, int], list[PayableBill]] = defaultdict(list)
    for bill in bills:
        if bill.id in covered_bill_ids or not normalized(bill.reference):
            continue
        candidate_groups[(bill.supplier_id, normalized(bill.reference), round(bill.total * 100))].append(bill)
    for (supplier_id, reference, _amount), group in candidate_groups.items():
        ordered = sorted(group, key=lambda bill: (bill.date, bill.id))
        for left, right in zip(ordered, ordered[1:]):
            gap = days_between(left.date, right.date)
            if gap is None or gap > 7 or normalized(left.invoice_number) == normalized(right.invoice_number):
                continue
            findings.append(
                ApFinding(
                    id=stable_id("ap-near-duplicate-bill", supplier_id, reference, left.id, right.id),
                    kind="ap_duplicate_bill",
                    severity="medium",
                    title=f"Similar bills need review: {left.supplier_name}",
                    amount=min(left.total, right.total),
                    detail=f"Same reference and amount, entered {gap} day{'s' if gap != 1 else ''} apart.",
                    action_label="Review evidence",
                    action_prompt=(
                        f"Compare two similar purchase bills from {left.supplier_name} with reference {left.reference}. "
                        "Explain the matching fields and what I should verify before paying either bill."
                    ),
                    evidence=(
                        Evidence(left.id, left.invoice_number or "First bill", f"{left.date} · £{left.total:,.2f}"),
                        Evidence(right.id, right.invoice_number or "Second bill", f"{right.date} · £{right.total:,.2f}"),
                    ),
                )
            )
    return findings
