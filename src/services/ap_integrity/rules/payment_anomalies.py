"""Conservative, explainable supplier-payment anomaly checks."""

from __future__ import annotations

from collections import Counter

from src.services.ap_integrity.models import ApFinding, Evidence, Payment
from src.services.ap_integrity.rules._common import stable_id

_FIRST_PAYMENT_REVIEW_THRESHOLD = 1_000.0


def find_payment_anomalies(payments: list[Payment]) -> list[ApFinding]:
    counts = Counter(payment.supplier_id for payment in payments)
    findings: list[ApFinding] = []
    for payment in payments:
        if counts[payment.supplier_id] != 1 or payment.amount < _FIRST_PAYMENT_REVIEW_THRESHOLD:
            continue
        findings.append(
            ApFinding(
                id=stable_id("ap-first-payment", payment.supplier_id, payment.id),
                kind="ap_payment_anomaly",
                severity="low",
                title=f"First recorded payment: {payment.supplier_name}",
                amount=payment.amount,
                detail="A high-value supplier payment with no prior payment history in these books.",
                action_label="Review payment",
                action_prompt=(
                    f"Review the first recorded payment to {payment.supplier_name} for £{payment.amount:,.2f}. "
                    "Explain what evidence I should check before treating it as expected."
                ),
                evidence=(
                    Evidence(payment.id, payment.bill_number or "Payment", f"{payment.date} · £{payment.amount:,.2f}"),
                ),
            )
        )
    return findings
