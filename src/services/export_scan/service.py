"""Turn parsed export rows into findings, via the canonical AP rules.

This module is an adapter, not a detector: it normalizes CSV rows into the
same raw dict shapes a connector returns and calls
`build_ap_findings_stateless`. Detection logic lives in
`src/services/ap_integrity/rules/` exactly once.

Honesty rules (docs/TRUST_FUNNEL_PLAN.md):
  - Findings are labelled "from your export" by the caller; we attach the
    file's own date range in `stats` so the UI can say "as of".
  - Rules that need history we don't have are reported in `coverage` as
    not-run, never silently skipped: supplier-detail changes need a live
    baseline, and first-payment anomalies are meaningless inside a partial
    export window (every supplier looks new), so both are excluded.
"""

from __future__ import annotations

import hashlib
from datetime import date
from typing import Any

from src.services.export_scan.csv_parse import ParsedInvoiceRow, ParsedPaymentRow
from src.services.rates import daily_statutory_interest

_MAX_FINDINGS = 20

_SEVERITY_TONE = {"high": "risk", "medium": "watch", "low": "info"}

# Payment anomalies are excluded (see module docstring); supplier-detail
# changes cannot fire without a caller-supplied baseline.
_EXCLUDED_KINDS = {"ap_payment_anomaly"}


def _contact_slug(name: str) -> str:
    """Deterministic ID so bills, contacts, and payments join by supplier."""
    return "csv-" + hashlib.sha1(name.casefold().encode("utf-8")).hexdigest()[:12]


def _norm_status(raw: str, total: float, amount_due: float) -> str:
    status = raw.upper()
    if status in {"PAID", "VOIDED", "DELETED", "DRAFT", "AUTHORISED", "SUBMITTED"}:
        return status
    if status in {"VOID", "CANCELLED", "CANCELED"}:
        return "VOIDED"
    if status in {"APPROVED", "AWAITING PAYMENT", "AWAITING", "OPEN", "UNPAID"}:
        return "AUTHORISED"
    if total > 0 and amount_due <= 0:
        return "PAID"
    return "AUTHORISED"


def _iso(value: date | None) -> str:
    return value.isoformat() if value else ""


def _invoice_raw(row: ParsedInvoiceRow, index: int, invoice_type: str) -> dict[str, Any]:
    status = _norm_status(row.status, row.total, row.amount_due)
    return {
        "id": f"csv-{invoice_type.lower()}-{index}",
        "type": invoice_type,
        "contact": {"id": _contact_slug(row.contact_name), "name": row.contact_name},
        "invoiceNumber": row.invoice_number,
        "reference": row.reference,
        "date": _iso(row.invoice_date),
        "dueDate": _iso(row.due_date),
        "total": row.total,
        "amountPaid": row.amount_paid,
        "amountDue": row.amount_due,
        "status": status,
    }


def _ap_to_quick_finding(finding: dict[str, Any]) -> dict[str, Any]:
    """Reshape a canonical AP finding into the QuickCheck card shape."""
    items = [
        f"{item.get('label', '')}: {item.get('detail', '')}"
        for item in finding.get("evidence") or []
    ]
    detail = finding.get("detail") or ""
    evidence = f"{detail} {'; '.join(items)}".strip() if items else detail
    amount = float(finding.get("amount") or 0)
    return {
        "id": str(finding.get("id", "")),
        "label": str(finding.get("title", "Needs review")),
        "detail": f"£{amount:,.2f} to review" if amount > 0 else "Worth a look",
        "tone": _SEVERITY_TONE.get(str(finding.get("severity", "low")), "info"),
        "evidence": evidence,
    }


def _overdue_findings(
    sales: list[ParsedInvoiceRow], today: date
) -> tuple[list[dict[str, Any]], float]:
    """Overdue receivables from the sales export — mirrors findings.py."""
    findings: list[dict[str, Any]] = []
    total = 0.0
    overdue_rows = [
        row
        for row in sales
        if row.status not in {"PAID", "VOIDED", "DELETED", "DRAFT"}
        and row.due_date is not None
        and (today - row.due_date).days > 0
        and row.amount_due > 0
    ]
    overdue_rows.sort(key=lambda row: row.amount_due, reverse=True)
    for row in overdue_rows[:5]:
        days = (today - row.due_date).days  # type: ignore[operator]
        daily = round(daily_statutory_interest(row.amount_due), 2)
        total += row.amount_due
        findings.append(
            {
                "id": f"csv-overdue-{row.invoice_number or row.contact_name}",
                "label": f"Overdue — {row.contact_name}",
                "detail": f"£{row.amount_due:,.2f} · {days} day{'s' if days != 1 else ''} late",
                "tone": "risk" if (days > 30 or row.amount_due >= 1000) else "watch",
                "evidence": (
                    f"Invoice {row.invoice_number or '(unnumbered)'} was due "
                    f"{row.due_date.isoformat()}. Late-payment interest accrues at "
                    f"~£{daily}/day. From your export — not live data."
                ),
            }
        )
    extra = len(overdue_rows) - len(findings)
    if extra > 0:
        extra_amount = sum(row.amount_due for row in overdue_rows[5:])
        total += extra_amount
        findings.append(
            {
                "id": "csv-overdue-more",
                "label": f"Plus {extra} more overdue invoice{'s' if extra != 1 else ''}",
                "detail": f"£{extra_amount:,.2f} still outstanding",
                "tone": "watch",
                "evidence": "Connect Xero to see every overdue invoice and start chasing.",
            }
        )
    return findings, total


def scan_exports(
    bills: list[ParsedInvoiceRow],
    sales: list[ParsedInvoiceRow] | None = None,
    payments: list[ParsedPaymentRow] | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Run the stateless AP scan + overdue analysis over parsed exports."""
    from src.services.ap_integrity.service import build_ap_findings_stateless

    today = today or date.today()
    sales = sales or []
    payments = payments or []

    contacts_seen: dict[str, str] = {}
    for row in [*bills, *sales]:
        contacts_seen.setdefault(_contact_slug(row.contact_name), row.contact_name)
    for row in payments:
        contacts_seen.setdefault(_contact_slug(row.contact_name), row.contact_name)
    contacts_raw = [{"id": slug, "name": name} for slug, name in contacts_seen.items()]

    bills_raw = [
        _invoice_raw(row, i, "ACCPAY")
        for i, row in enumerate(bills)
        if _norm_status(row.status, row.total, row.amount_due) not in {"VOIDED", "DELETED"}
    ]
    payments_raw = [
        {
            "id": f"csv-pay-{i}",
            "invoice": {"invoiceNumber": row.invoice_number},
            "contact": {"id": _contact_slug(row.contact_name), "name": row.contact_name},
            "date": _iso(row.date),
            "amount": row.amount,
            "reference": row.reference,
        }
        for i, row in enumerate(payments)
    ]

    ap_findings = [
        finding
        for finding in build_ap_findings_stateless(
            invoices=bills_raw, contacts=contacts_raw, payments=payments_raw
        )
        if finding.get("kind") not in _EXCLUDED_KINDS
    ]

    overdue_findings, overdue_total = _overdue_findings(sales, today)

    findings = [*[ _ap_to_quick_finding(f) for f in ap_findings ], *overdue_findings]
    tone_rank = {"risk": 0, "watch": 1, "info": 2}
    findings.sort(key=lambda f: tone_rank.get(f["tone"], 3))
    extra_findings = max(len(findings) - _MAX_FINDINGS, 0)
    findings = findings[:_MAX_FINDINGS]

    dates = [row.invoice_date for row in [*bills, *sales] if row.invoice_date]
    currencies = sorted({row.currency for row in [*bills, *sales] if row.currency})
    ap_at_risk = sum(float(f.get("amount") or 0) for f in ap_findings)

    coverage = {
        "duplicate_bills": bool(bills),
        "overdue_receivables": bool(sales),
        "duplicate_payments": bool(payments),
        "supplier_detail_changes": False,
    }
    notes: list[str] = []
    if not sales:
        notes.append("Add a sales-invoices export to see who owes you money.")
    if not payments:
        notes.append("Add a payments export to catch duplicate payments.")
    notes.append(
        "Supplier bank-detail changes need a baseline — connect Xero and Siki "
        "watches for those continuously."
    )

    return {
        "findings": findings,
        "coverage": coverage,
        "coverage_notes": notes,
        "stats": {
            "bills": len(bills),
            "sales_invoices": len(sales),
            "payments": len(payments),
            "date_from": min(dates).isoformat() if dates else None,
            "date_to": max(dates).isoformat() if dates else None,
            "currency": currencies[0] if len(currencies) == 1 else None,
            "flagged": len(findings),
            "truncated": extra_findings,
            "ap_at_risk": round(ap_at_risk, 2),
            "overdue_total": round(overdue_total, 2),
        },
    }

