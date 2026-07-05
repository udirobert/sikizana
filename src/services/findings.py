"""
Structured audit findings — the data behind the books-page findings
panel and the weekly digest.

Each finding is a card: what it is, how much it's worth, how urgent it
is, and ONE ready-made action prompt the frontend can drop straight
into the agent chat. Keeping the prompts server-side means the panel,
the digest, and the chat all describe the same finding the same way.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from src.services.xero_service import XeroService
from src.services.logging import get_logger

log = get_logger("sikizana.findings")


def build_findings(session_id: str) -> dict[str, Any]:
    """Assemble the structured findings for a session's books."""
    svc = XeroService(session_id)
    mode = svc.mode()
    today = date.today()

    findings: list[dict[str, Any]] = []

    # --- Overdue invoices: money the business is owed ---
    # Loss aversion framing: "£X is slipping away" instead of "£X you're owed"
    # Cost-of-inaction: statutory interest accrues at 8% + Bank Rate (~13.5% APR)
    overdue = svc.find_overdue_invoices()
    money_found = 0.0
    for inv in overdue:
        amount = float(inv.get("amountDue", inv.get("total", 0)) or 0)
        if inv.get("type") == "ACCPAY":
            # Bills the business owes — flag, but they aren't "money found"
            kind = "overdue_bill"
        else:
            kind = "overdue_invoice"
            money_found += amount
        days = _days_overdue(inv.get("dueDate", ""), today)
        number = inv.get("invoiceNumber", "?")
        contact = (inv.get("contact") or {}).get("name", "Unknown")
        # Statutory interest: 8% + Bank Rate (4.75% as of 2025) = ~13.5% APR
        # Daily rate = 13.5% / 365 ≈ 0.037%
        daily_interest = round(amount * 0.135 / 365, 2)
        finding = {
            "id": f"inv-{inv.get('id', number)}",
            "kind": kind,
            "severity": "high" if (days > 30 or amount >= 1000) else "medium",
            "title": f"{number} — {contact}",
            "amount": amount,
            "detail": f"{days} day{'s' if days != 1 else ''} late · losing £{daily_interest}/day in interest",
            "days_overdue": days,
            "daily_interest": daily_interest,
        }
        if kind == "overdue_invoice":
            finding["action"] = {
                "type": "chase",
                "label": "Chase now",
                "prompt": (
                    f"Draft a payment reminder email for invoice {number} to {contact} "
                    f"for £{amount:,.2f}, which is {days} days overdue. "
                    f"I'm losing £{daily_interest}/day in statutory interest."
                ),
            }
        else:
            finding["action"] = {
                "type": "explain",
                "label": "Review bill",
                "prompt": (
                    f"Bill {number} from {contact} for £{amount:,.2f} is {days} days "
                    f"overdue. What are the consequences and what should I do?"
                ),
            }
        findings.append(finding)

    # --- Unreconciled bank transactions ---
    # Loss aversion: "unreconciled = risk of duplicate payment or missed VAT claim"
    unreconciled = svc.find_unreconciled_transactions()
    for txn in unreconciled:
        amount = float(txn.get("total", 0) or 0)
        ref = txn.get("reference", "") or "(no reference)"
        txn_date = txn.get("date", "")
        findings.append(
            {
                "id": f"txn-{txn.get('id', ref)}",
                "kind": "unreconciled",
                "severity": "high" if amount >= 500 else "medium",
                "title": ref,
                "amount": amount,
                "detail": f"{txn.get('type', '?')} on {txn_date} · risk of double-counting",
                "action": {
                    "type": "fix",
                    "label": "Fix now",
                    "prompt": (
                        f"Help me reconcile the bank transaction '{ref}' from {txn_date} "
                        f"for £{amount:,.2f} — work out what it is and propose the "
                        f"correct journal entry."
                    ),
                },
            }
        )

    # --- Tax flags from the P&L ---
    findings.extend(_tax_flags(svc))

    counts = {
        "overdue": sum(1 for f in findings if f["kind"] in ("overdue_invoice", "overdue_bill")),
        "unreconciled": sum(1 for f in findings if f["kind"] == "unreconciled"),
        "tax_flags": sum(1 for f in findings if f["kind"] == "tax_flag"),
    }
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (severity_rank.get(f["severity"], 3), -f.get("amount", 0)))

    return {
        "mode": mode,
        "money_found": round(money_found, 2),
        "counts": counts,
        "clean": not findings,
        "findings": findings,
    }


def _tax_flags(svc: XeroService) -> list[dict[str, Any]]:
    """Expense categories worth a tax conversation (mirrors get_tax_insights)."""
    try:
        pl = svc.get_profit_and_loss()
    except Exception as exc:  # noqa: BLE001 — flags are best-effort
        log.warning("tax_flags_unavailable", extra={"error": str(exc)})
        return []

    items = pl.get("lineItems") if "totals" in pl else pl.get("rows", [])
    flags: list[dict[str, Any]] = []
    for item in items or []:
        label = str(item.get("label", item.get("account", "")))
        try:
            value = abs(float(str(item.get("value", 0)).replace(",", "")))
        except (ValueError, TypeError):
            continue
        lower = label.lower()
        if "entertainment" in lower and value > 0:
            # Loss aversion: "you're paying tax on £X you can't deduct"
            tax_cost = round(value * 0.19, 2)  # 19% Corp Tax
            flags.append(
                {
                    "id": f"tax-{lower.replace(' ', '-')}",
                    "kind": "tax_flag",
                    "severity": "medium",
                    "title": f"{label}: not deductible",
                    "amount": value,
                    "detail": f"Costing you £{tax_cost} in extra Corporation Tax",
                    "action": {
                        "type": "explain",
                        "label": "Explain",
                        "prompt": (
                            f"I have £{value:,.2f} of {label} in my books. Explain the "
                            f"Corporation Tax treatment, citing the HMRC rule."
                        ),
                    },
                }
            )
        elif "travel" in lower and value > 1000:
            flags.append(
                {
                    "id": f"tax-{lower.replace(' ', '-')}",
                    "kind": "tax_flag",
                    "severity": "low",
                    "title": f"{label}: keep receipts",
                    "amount": value,
                    "detail": "HMRC may disallow without evidence · 19% tax at risk",
                    "action": {
                        "type": "explain",
                        "label": "Explain",
                        "prompt": (
                            f"My travel costs are £{value:,.2f}. What records does HMRC "
                            f"expect, and what's deductible vs not?"
                        ),
                    },
                }
            )
    return flags


def _days_overdue(due_date: str, today: date) -> int:
    try:
        due = date.fromisoformat(due_date[:10])
        return max((today - due).days, 0)
    except (ValueError, TypeError):
        return 0
