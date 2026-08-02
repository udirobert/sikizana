"""Typed, platform-neutral facts used by the Café Briefing rules.

Mirrors the AP Integrity fact layer: typed dataclasses the analyzer produces,
and a `CafeFinding` that serializes to the canonical Sikizana finding shape
(evidence + action + review) so it composes straight into `build_findings()`.
Review state reuses the AP `ReviewOutcome`/`ReviewState` vocabulary so the
panel, digest, and chat describe every domain's finding the same way.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.services.ap_integrity.models import ReviewOutcome


@dataclass(frozen=True)
class SalesFact:
    """The deterministic analyzer output for one café's POS window."""

    window: dict
    totals: dict
    risers: list[dict]
    fallers: list[dict]
    attach: dict
    rhythm: dict
    modifiers: dict
    mix: dict
    daypart_share: dict
    top_items_by_revenue: list[dict]


@dataclass(frozen=True)
class SpendFact:
    """Supplier spend anchor for the café — sourced through the connector."""

    by_supplier_gbp: list[dict]
    net_profit_gbp: float | None
    period: str


@dataclass(frozen=True)
class Evidence:
    source_id: str
    label: str
    detail: str

    def as_dict(self) -> dict[str, str]:
        return {"source_id": self.source_id, "label": self.label, "detail": self.detail}


@dataclass(frozen=True)
class CafeFinding:
    """One café nudge as a canonical finding (mirrors `ApFinding`)."""

    id: str
    kind: str
    severity: str
    title: str
    amount: float
    detail: str
    action_label: str
    action_prompt: str
    action_type: str
    evidence: tuple[Evidence, ...]

    def as_dict(self, review: ReviewOutcome | None = None) -> dict:
        review_payload: dict = {"state": review.state if review else "open"}
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
                "type": self.action_type,
                "label": self.action_label,
                "prompt": self.action_prompt,
            },
        }
