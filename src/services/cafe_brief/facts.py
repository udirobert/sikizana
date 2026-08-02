"""Normalize POS rows and connector responses into café-domain facts.

Two fact sources, one honest boundary:
  - `build_sales_facts(rows)` — pure, from parsed `SaleRow`s (the analyzer is
    the source of every number on the sell side; no LLM, no frozen snapshot).
  - `build_spend_facts(svc)` — supplier spend through the accounting connector,
    NOT a direct `demo_scenarios` import. In demo mode the connector returns
    the café scenario's bills; in live mode it returns the real org's. This is
    the boundary fix: connectors fetch normalized facts, the café domain
    evaluates them.
"""

from __future__ import annotations

from typing import Any

from src.services.cafe_brief.analyzer import analyse
from src.services.cafe_brief.models import SalesFact, SpendFact
from src.services.cafe_brief.pos_ingest import SaleRow
from src.services.connectors.base import AccountingConnector


def build_sales_facts(rows: list[SaleRow]) -> SalesFact:
    """Run the deterministic analyzer over parsed POS rows.

    Every café figure shown anywhere downstream is computed here. Raises
    `ValueError` for empty input — callers guard against that.
    """
    facts = analyse(rows)
    return SalesFact(
        window=facts["window"],
        totals=facts["totals"],
        risers=facts["risers"],
        fallers=facts["fallers"],
        attach=facts["attach"],
        rhythm=facts["rhythm"],
        modifiers=facts["modifiers"],
        mix=facts["mix"],
        daypart_share=facts["daypart_share"],
        top_items_by_revenue=facts["top_items_by_revenue"],
    )


def _contact_name(obj: Any) -> str | None:
    if isinstance(obj, dict):
        return obj.get("name")
    return obj


def build_spend_facts(svc: AccountingConnector) -> SpendFact:
    """Supplier spend + P&L anchor sourced through the accounting connector.

    Spend = supplier bills (ACCPAY). Bank SPEND txns are the cash leg of the
    same bills — only use them if no bills exist, never both. Connectors own
    this normalized source; the café domain never imports `XeroService` or
    `demo_scenarios` directly.
    """
    contacts = svc.list_contacts()
    supplier_names = {c["name"] for c in contacts if c.get("isSupplier")}
    supplier_emails = {
        c["name"]: c.get("emailAddress", "")
        for c in contacts if c.get("isSupplier")
    }

    by_supplier: dict[str, float] = {}

    def _add(name: str | None, amount: float) -> None:
        if name and float(amount or 0):
            by_supplier[name] = by_supplier.get(name, 0.0) + float(amount)

    bills = [inv for inv in svc.list_invoices(invoice_type="ACCPAY") if inv.get("type") == "ACCPAY"]
    if bills:
        for inv in bills:
            _add(_contact_name(inv.get("contact")), inv.get("total"))
    else:
        # Fall back to bank SPEND transactions only when there are no bills —
        # they are the cash leg of the same payables, never additive.
        for txn in svc.list_bank_transactions(txn_type="SPEND"):
            name = _contact_name(txn.get("contact"))
            if name in supplier_names and str(txn.get("type", "")).upper().startswith("SPEND"):
                _add(name, abs(float(txn.get("total") or 0)))

    pl = svc.get_profit_and_loss() or {}
    pl_totals = pl.get("totals") or pl
    return SpendFact(
        by_supplier_gbp=[
            {"supplier": k, "total_gbp": round(v, 2), "email": supplier_emails.get(k, "")}
            for k, v in sorted(by_supplier.items(), key=lambda kv: -kv[1])
        ],
        net_profit_gbp=pl_totals.get("netProfit"),
        period=f"{pl.get('fromDate', '')} to {pl.get('toDate', '')}".strip(),
    )
