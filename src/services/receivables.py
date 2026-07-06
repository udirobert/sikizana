"""
Receivables analysis — aged debt buckets and true DSO.

The aging report (0-30/31-60/61-90/90+ by debtor) is the single most
standard credit-control view; DSO here is computed from actual payment
history (invoice date → fullyPaidOnDate), not from overdue invoices
only, which would overstate how slow customers are.

Used by the agent tool (get_receivables_aging), the findings panel,
and the weekly digest, so every surface reports the same numbers.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from src.services.xero_service import XeroService

BUCKETS = [
    ("current", "Not yet due", 0, 0),
    ("b_1_30", "1-30 days", 1, 30),
    ("b_31_60", "31-60 days", 31, 60),
    ("b_61_90", "61-90 days", 61, 90),
    ("b_90_plus", "90+ days", 91, 10**6),
]


def _parse_date(value: str) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def _bucket_key(days_overdue: int) -> str:
    if days_overdue <= 0:
        return "current"
    for key, _label, lo, hi in BUCKETS[1:]:
        if lo <= days_overdue <= hi:
            return key
    return "b_90_plus"


def build_aging(svc: XeroService) -> dict[str, Any]:
    """
    Aged receivables for a session's books.

    Returns:
      {
        "total_outstanding": float,   # all unpaid ACCREC
        "total_overdue": float,       # past due only
        "buckets": [{key, label, amount, count}],
        "debtors": [{name, total, oldest_days, buckets: {key: amount}}],
        "dso": {"days": float|None, "sample": int},  # from paid history
        "invoice_count": int,
      }
    """
    today = date.today()
    invoices = [i for i in svc.list_invoices(invoice_type="ACCREC") if i.get("type") == "ACCREC"]

    bucket_totals: dict[str, dict[str, Any]] = {
        key: {"key": key, "label": label, "amount": 0.0, "count": 0}
        for key, label, _lo, _hi in BUCKETS
    }
    debtors: dict[str, dict[str, Any]] = {}
    total_outstanding = 0.0
    total_overdue = 0.0

    for inv in invoices:
        amount_due = float(inv.get("amountDue", 0) or 0)
        if inv.get("status") != "AUTHORISED" or amount_due <= 0:
            continue
        due = _parse_date(inv.get("dueDate", ""))
        days_overdue = (today - due).days if due else 0
        key = _bucket_key(days_overdue)

        total_outstanding += amount_due
        if days_overdue > 0:
            total_overdue += amount_due
        bucket_totals[key]["amount"] += amount_due
        bucket_totals[key]["count"] += 1

        name = (inv.get("contact") or {}).get("name", "Unknown")
        debtor = debtors.setdefault(
            name,
            {"name": name, "total": 0.0, "oldest_days": 0, "buckets": {}},
        )
        debtor["total"] += amount_due
        debtor["oldest_days"] = max(debtor["oldest_days"], max(days_overdue, 0))
        debtor["buckets"][key] = debtor["buckets"].get(key, 0.0) + amount_due

    # True DSO proxy: average days from invoice date to payment, over PAID
    # invoices with a known payment date. (Classic DSO = AR/sales × days
    # needs a defined sales period; days-to-pay is more explainable and
    # uses the same data.)
    paid_days: list[int] = []
    for inv in invoices:
        if inv.get("status") != "PAID":
            continue
        issued = _parse_date(inv.get("date", ""))
        paid = _parse_date(inv.get("fullyPaidOnDate", ""))
        if issued and paid and paid >= issued:
            paid_days.append((paid - issued).days)
    dso = round(sum(paid_days) / len(paid_days), 1) if paid_days else None

    debtor_rows = sorted(debtors.values(), key=lambda d: -d["total"])
    for d in debtor_rows:
        d["total"] = round(d["total"], 2)
        d["buckets"] = {k: round(v, 2) for k, v in d["buckets"].items()}

    return {
        "total_outstanding": round(total_outstanding, 2),
        "total_overdue": round(total_overdue, 2),
        "buckets": [
            {**b, "amount": round(b["amount"], 2)} for b in bucket_totals.values()
        ],
        "debtors": debtor_rows,
        "dso": {"days": dso, "sample": len(paid_days)},
        "invoice_count": sum(b["count"] for b in bucket_totals.values()),
    }
