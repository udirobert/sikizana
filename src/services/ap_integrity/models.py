"""Typed, platform-neutral facts used by AP Integrity rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ReviewState = Literal["safe", "investigating", "confirmed", "dismissed"]


@dataclass(frozen=True)
class ReviewOutcome:
    state: ReviewState
    confirmed_amount: float | None = None
    dismissal_reason: str | None = None
    updated_at: str | None = None


@dataclass(frozen=True)
class PayableBill:
    id: str
    supplier_id: str
    supplier_name: str
    invoice_number: str
    reference: str
    date: str
    total: float
    status: str


@dataclass(frozen=True)
class Payment:
    id: str
    bill_id: str
    bill_number: str
    supplier_id: str
    supplier_name: str
    date: str
    amount: float
    reference: str


@dataclass(frozen=True)
class SupplierProfile:
    id: str
    name: str
    bank_details_fingerprint: str = ""


@dataclass(frozen=True)
class Evidence:
    source_id: str
    label: str
    detail: str

    def as_dict(self) -> dict[str, str]:
        return {"source_id": self.source_id, "label": self.label, "detail": self.detail}


@dataclass(frozen=True)
class ApFinding:
    id: str
    kind: str
    severity: str
    title: str
    amount: float
    detail: str
    action_label: str
    action_prompt: str
    evidence: tuple[Evidence, ...]

    def as_dict(self, review: ReviewOutcome | None = None) -> dict:
        review_payload = {"state": review.state if review else "open"}
        if review and review.confirmed_amount is not None:
            review_payload["confirmed_amount"] = round(review.confirmed_amount, 2)
        if review and review.dismissal_reason:
            review_payload["dismissal_reason"] = review.dismissal_reason
        if review and review.updated_at:
            review_payload["updated_at"] = review.updated_at
        return {
            "id": self.id,
            "kind": self.kind,
            "severity": self.severity,
            "title": self.title,
            "amount": round(self.amount, 2),
            "detail": self.detail,
            "evidence": [item.as_dict() for item in self.evidence],
            "review": review_payload,
            "action": {
                "type": "review",
                "label": self.action_label,
                "prompt": self.action_prompt,
            },
        }
