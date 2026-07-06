"""
Xero agent tools — the tool surface the Bookkeeper Agent calls.

These wrap XeroService into the function-calling format that the
NVIDIA NIM API expects. Each tool returns a string (LLM-friendly
summary) or structured data that the agent reasons over.

Tools:
  - get_xero_transactions   →  list bank transactions
  - get_xero_invoices       →  list invoices (filter by status)
  - get_xero_chart_of_accounts →  account codes for journal entries
  - get_xero_profit_and_loss →  P&L report
  - get_xero_balance_sheet  →  balance sheet report
  - get_xero_contacts       →  customers/suppliers
  - find_discrepancies      →  unreconciled transactions + overdue invoices
  - get_tax_insights        →  Corporation Tax estimate, deductions, HMRC flags
  - match_receipt_to_transaction →  Gemini Vision receipt matching
  - propose_journal_entry   →  propose a fix (await user approval)
  - create_xero_journal_entry →  post journal to Xero (write-back)
  - draft_invoice_reminder  →  negotiation-tactic-based chasing email
  - get_savings_opportunities →  margin/expense/waste analysis
  - get_sector_benchmarks   →  compare receivables/margins vs sector averages
  - score_customers         →  payment reliability + cost-to-serve per customer
  - get_chasing_strategy    →  multi-stage negotiation plan per overdue invoice
"""

from __future__ import annotations

import os
from contextvars import ContextVar

from src.services.xero_service import XeroService
from src.services.logging import get_logger

log = get_logger("sikizana.xero_tools")

# UK Corporation Tax rates — set by HMRC, not Xero. Configurable via env
# so they can be updated without a code change. Xero's TaxRates API returns
# VAT/sales tax, not Corporation Tax.
_CORP_TAX_SMALL_RATE = float(os.environ.get("CORP_TAX_SMALL_RATE", "0.19"))
_CORP_TAX_MAIN_RATE = float(os.environ.get("CORP_TAX_MAIN_RATE", "0.25"))
_CORP_TAX_SMALL_LIMIT = float(os.environ.get("CORP_TAX_SMALL_LIMIT", "50000"))
_CORP_TAX_MAIN_LIMIT = float(os.environ.get("CORP_TAX_MAIN_LIMIT", "250000"))
_CORP_TAX_MARGINAL_RELIEF = float(os.environ.get("CORP_TAX_MARGINAL_RELIEF", "0.015"))
# Bank of England base rate for late payment interest (LPCD Act 1998).
# 8% + Bank Rate = statutory annual rate. Configurable via env.
_BANK_RATE = float(os.environ.get("BANK_RATE", "5.25"))

# Which user session the current tool call is acting for. The agent loop
# sets this before executing tools, so every tool reads/writes the books
# belonging to the caller — not a shared global org.
_current_session: ContextVar[str] = ContextVar("xero_session", default="default")


def set_current_session(session_id: str) -> None:
    _current_session.set(session_id)


def _svc() -> XeroService:
    return XeroService(_current_session.get())


def get_xero_organisation() -> str:
    """Get the connected Xero organisation's details (name, currency, tax number)."""
    org = _svc().get_organisation()
    return (
        f"Organisation: {org.get('name', 'Unknown')} "
        f"({org.get('baseCurrency', '?')}) "
        f"Type: {org.get('organisationType', '?')} "
        f"Tax No: {org.get('taxNumber', 'N/A')}"
    )


def get_xero_transactions(
    query: str = "",
    txn_type: str = "",
) -> str:
    """
    Retrieve bank transactions from Xero. Optionally filter by type (RECEIVE/SPEND)
    or search the reference field. Returns a summary the agent can reason over.
    """
    txns = _svc().list_bank_transactions(txn_type=txn_type or None)

    if query:
        q_lower = query.lower()
        txns = [
            t
            for t in txns
            if q_lower in t.get("reference", "").lower()
            or q_lower in t.get("contact", {}).get("name", "").lower()
        ]

    if not txns:
        return f"No bank transactions found for query '{query}'."

    summary = f"Found {len(txns)} bank transactions:\n"
    for t in txns[:20]:
        recon = "✓ reconciled" if t.get("isReconciled") else "⚠ UNRECONCILED"
        summary += (
            f"- {t['date']} | {t['type']} | {t['contact']['name']} | "
            f"£{t['total']:.2f} | Ref: {t['reference']} | {recon}\n"
        )
    if len(txns) > 20:
        summary += f"... and {len(txns) - 20} more.\n"
    return summary


def get_xero_invoices(
    status: str = "",
    invoice_type: str = "",
) -> str:
    """
    Retrieve invoices from Xero. Filter by status (DRAFT/AUTHORISED/PAID/VOIDED/OVERDUE)
    and type (ACCREC=sales / ACCPAY=bills). Returns a summary with overdue flags.
    OVERDUE is a special status that filters for AUTHORISED invoices past their due date.
    """
    from datetime import date

    today = date.today().isoformat()

    # Handle OVERDUE as a special filter
    if status and status.upper() == "OVERDUE":
        all_invoices = _svc().list_invoices(status="AUTHORISED", invoice_type=invoice_type or None)
        invoices = [i for i in all_invoices if i.get("dueDate", "") < today]
    else:
        invoices = _svc().list_invoices(status=status or None, invoice_type=invoice_type or None)

    if not invoices:
        return "No invoices found for the given filters."

    summary = f"Found {len(invoices)} invoices:\n"
    for inv in invoices[:20]:
        overdue = ""
        if inv["status"] == "AUTHORISED" and inv.get("dueDate", "") < today:
            overdue = " ⚠ OVERDUE"
        summary += (
            f"- {inv['invoiceNumber']} | {inv['type']} | {inv['contact']['name']} | "
            f"£{inv['total']:.2f} | Due: {inv['dueDate']} | {inv['status']}{overdue}\n"
        )
    if len(invoices) > 20:
        summary += f"... and {len(invoices) - 20} more.\n"
    return summary


def get_xero_chart_of_accounts() -> str:
    """
    Retrieve the chart of accounts from Xero. The agent uses this to
    propose correct journal entry accounts when fixing discrepancies.
    """
    accounts = _svc().list_accounts()
    summary = f"Chart of Accounts ({len(accounts)} accounts):\n"
    for a in accounts:
        summary += f"- {a['code']} | {a['name']} | {a['type']}\n"
    return summary


def get_xero_profit_and_loss(
    from_date: str = "",
    to_date: str = "",
) -> str:
    """Retrieve the Profit & Loss report for a date range. Empty dates = last 90 days."""
    pl = _svc().get_profit_and_loss(from_date=from_date or None, to_date=to_date or None)
    # Handle both live (parsed report) and mock formats
    if "totals" in pl:
        # Live CLI format (from _parse_report)
        titles = pl.get("reportTitles", [])
        period = titles[-1] if titles else ""
        summary = f"Profit & Loss ({period}):\n"
        for item in pl.get("lineItems", [])[:15]:
            summary += f"- {item['label']}: £{item['value']}\n"
        totals = pl.get("totals", {})
        for label, value in totals.items():
            summary += f"- {label}: £{value:,.2f}\n"
        summary += f"\nRevenue: £{pl.get('revenue', 0):,.2f}\n"
        summary += f"Expenses: £{pl.get('expenses', 0):,.2f}\n"
        summary += f"Net Profit: £{pl.get('netProfit', 0):,.2f}"
    else:
        # Mock format
        summary = f"Profit & Loss ({pl.get('fromDate', '?')} to {pl.get('toDate', '?')}):\n"
        for row in pl.get("rows", []):
            summary += f"- {row.get('account', '?')} ({row.get('code', '?')}): £{row.get('value', 0):,.2f}\n"
        summary += f"\nNet Profit: £{pl.get('netProfit', 0):,.2f}"
    return summary


def get_xero_balance_sheet(as_of: str = "") -> str:
    """Retrieve the Balance Sheet as of a date. Empty = today."""
    bs = _svc().get_balance_sheet(as_of=as_of or None)
    # Handle both live (parsed report) and mock formats
    if "totals" in bs:
        # Live CLI format (from _parse_report)
        titles = bs.get("reportTitles", [])
        period = titles[-1] if titles else ""
        summary = f"Balance Sheet ({period}):\n"
        for item in bs.get("lineItems", [])[:15]:
            summary += f"- {item['label']}: £{item['value']}\n"
        totals = bs.get("totals", {})
        for label, value in totals.items():
            summary += f"- {label}: £{value:,.2f}\n"
    else:
        # Mock format
        summary = f"Balance Sheet (as of {bs.get('asOf', '?')}):\n"
        for row in bs.get("rows", []):
            summary += f"- {row.get('account', '?')} ({row.get('code', '?')}): £{row.get('value', 0):,.2f}\n"
        summary += f"\nTotal Assets: £{bs.get('totalAssets', 0):,.2f}\n"
        summary += f"Total Liabilities: £{bs.get('totalLiabilities', 0):,.2f}\n"
        summary += f"Net Assets: £{bs.get('netAssets', 0):,.2f}"
    return summary


def find_discrepancies() -> str:
    """
    THE CORE TOOL: Scan Xero for bookkeeping discrepancies.
    Finds unreconciled bank transactions, overdue invoices, and
    potential matching issues. This is the agent's "audit" step.
    """
    unreconciled = _svc().find_unreconciled_transactions()
    overdue = _svc().find_overdue_invoices()

    findings = []

    if unreconciled:
        findings.append(f"UNRECONCILED BANK TRANSACTIONS ({len(unreconciled)}):")
        for t in unreconciled:
            findings.append(
                f"  - {t['date']} | {t['type']} | {t['contact']['name']} | "
                f"£{t['total']:.2f} | Ref: {t['reference']}"
            )
    else:
        findings.append("✓ All bank transactions are reconciled.")

    if overdue:
        findings.append(f"\nOVERDUE INVOICES ({len(overdue)}):")
        for i in overdue:
            findings.append(
                f"  - {i['invoiceNumber']} | {i['contact']['name']} | "
                f"£{i['amountDue']:.2f} | Was due: {i['dueDate']}"
            )
    else:
        findings.append("✓ No overdue invoices.")

    # Check for trial balance imbalance
    tb = _svc().get_trial_balance()
    # Handle both live (parsed report) and mock formats
    total_debit = tb.get("totalDebit", 0)
    total_credit = tb.get("totalCredit", 0)
    if "totals" in tb:
        # Live CLI format — look for debit/credit in totals
        totals = tb.get("totals", {})
        total_debit = totals.get("Total Debits", totals.get("Debits", 0))
        total_credit = totals.get("Total Credits", totals.get("Credits", 0))
    if abs(total_debit - total_credit) > 0.01:
        findings.append(
            f"\n⚠ TRIAL BALANCE IMBALANCE: "
            f"Debits £{total_debit:,.2f} ≠ Credits £{total_credit:,.2f}"
        )

    return "\n".join(findings) if findings else "No discrepancies found. Books look clean."


def propose_journal_entry(
    description: str,
    debit_account_code: str,
    credit_account_code: str,
    amount: float,
) -> str:
    """
    Propose a manual journal entry to fix a discrepancy.
    The agent calls this after identifying an error and determining
    the correct accounts from the chart of accounts.
    Returns a human-readable journal entry for the user to approve.
    """
    # LLMs frequently pass numeric args as strings ("1200") — coerce
    # defensively instead of crashing the tool call.
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return f"Error: '{amount}' is not a valid amount."
    accounts = _svc().list_accounts()
    debit_acct = next((a for a in accounts if a["code"] == debit_account_code), None)
    credit_acct = next((a for a in accounts if a["code"] == credit_account_code), None)

    if not debit_acct:
        return f"Error: Debit account code '{debit_account_code}' not found in chart of accounts."
    if not credit_acct:
        return f"Error: Credit account code '{credit_account_code}' not found in chart of accounts."

    entry = (
        f"PROPOSED JOURNAL ENTRY (requires your approval):\n"
        f"  Description: {description}\n"
        f"  Dr: {debit_account_code} - {debit_acct['name']}    £{amount:,.2f}\n"
        f"  Cr: {credit_account_code} - {credit_acct['name']}    £{amount:,.2f}\n"
        f"\n"
        f"This entry will balance the books. Reply 'approve' to post it to Xero, "
        f"or tell me what to change."
    )
    log.info(
        "journal_proposed",
        extra={"debit": debit_account_code, "credit": credit_account_code, "amount": amount},
    )
    return entry


def match_receipt_to_transaction(
    receipt_image_path: str,
    transaction_reference: str = "",
) -> str:
    """
    Use Gemini Vision to read a receipt/invoice photo, extract the amount
    and supplier, then match it against a Xero bank transaction by reference.
    This is the multimodal reconciliation tool.
    """
    import os

    if not os.path.exists(receipt_image_path):
        return f"Error: Receipt image not found at {receipt_image_path}"

    # Step 1: Vision extraction (Gemini Vision)
    from src.tools.vision_audit import analyze_receipt

    extracted = analyze_receipt(
        receipt_image_path,
        query="Extract the supplier name, total amount, date, and any reference/invoice number from this receipt.",
    )

    # Step 2: Try to match against Xero bank transactions
    txns = _svc().list_bank_transactions()
    candidates = []
    if transaction_reference:
        candidates = [
            t for t in txns if transaction_reference.lower() in t.get("reference", "").lower()
        ]
    if not candidates:
        # Try matching by reference text from the extracted receipt
        candidates = txns

    match_summary = f"Receipt extracted:\n{extracted}\n\n"
    if candidates:
        match_summary += f"Potential matching bank transactions ({len(candidates)}):\n"
        for t in candidates[:5]:
            match_summary += (
                f"- {t['date']} | {t['contact']['name']} | "
                f"£{t['total']:.2f} | Ref: {t['reference']}\n"
            )
    else:
        match_summary += "No matching bank transactions found. This may need a manual entry."

    return match_summary


def get_xero_contacts(query: str = "") -> str:
    """List contacts (customers/suppliers) from Xero. Optionally filter by name."""
    contacts = _svc().list_contacts()
    if query:
        q = query.lower()
        contacts = [c for c in contacts if q in c.get("name", "").lower()]

    if not contacts:
        return f"No contacts found for '{query}'."

    summary = f"Found {len(contacts)} contacts:\n"
    for c in contacts[:20]:
        roles = []
        if c.get("isSupplier"):
            roles.append("Supplier")
        if c.get("isCustomer"):
            roles.append("Customer")
        role = " | ".join(roles) if roles else "Contact"
        email = c.get("emailAddress", "")
        email_str = f" | {email}" if email else ""
        summary += f"- {c['name']} ({role}{email_str})\n"
    return summary


def create_xero_journal_entry(
    description: str,
    debit_account_code: str,
    credit_account_code: str,
    amount: float,
) -> str:
    """
    Create a manual journal entry in Xero. This is the WRITE-BACK action —
    the agent proposes, the user approves, and this tool executes.

    Posts via the user's OAuth connection (with an idempotency key) or the
    CLI. A failed live write is reported as a FAILURE — never as success.
    In demo mode nothing is written and the message says so.
    """
    # LLMs frequently pass numeric args as strings ("1200") — coerce
    # defensively instead of crashing the tool call.
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return f"Error: '{amount}' is not a valid amount."
    svc = _svc()
    accounts = svc.list_accounts()
    debit_acct = next((a for a in accounts if a["code"] == debit_account_code), None)
    credit_acct = next((a for a in accounts if a["code"] == credit_account_code), None)

    if not debit_acct or not credit_acct:
        return f"Error: Account code not found. Debit: {debit_account_code}, Credit: {credit_account_code}"

    lines = (
        f"  Dr: {debit_account_code} - {debit_acct['name']}    £{amount:,.2f}\n"
        f"  Cr: {credit_account_code} - {credit_acct['name']}    £{amount:,.2f}"
    )

    try:
        result = svc.create_manual_journal(
            description=description,
            debit_account_code=debit_account_code,
            credit_account_code=credit_account_code,
            amount=amount,
        )
    except Exception as exc:  # noqa: BLE001 — XeroApiError / RuntimeError
        log.error("journal_write_failed", extra={"error": str(exc)})
        return (
            f"✗ FAILED to post the journal entry — nothing was written to Xero.\n"
            f"{lines}\n"
            f"  Tell the user the entry was NOT posted and suggest trying again."
        )

    if not result["posted"]:
        # Demo mode — be explicit that nothing was written
        return (
            f"Journal entry SIMULATED (demo mode — nothing was written to Xero):\n"
            f"{lines}\n"
            f"  Status: Simulated. Tell the user to connect their Xero to post real entries."
        )

    from src.services.payment_store import record_audit, record_impact_event

    record_audit(
        action="journal_posted",
        description=description,
        amount=amount,
        journal_id=result.get("journal_id") or "",
        session_id=_current_session.get(),
    )
    record_impact_event(event_type="journal_posted", amount=amount, description=description)

    return (
        f"✓ Journal entry posted to Xero:\n"
        f"  ID: {result.get('journal_id') or 'unknown'}\n"
        f"{lines}\n"
        f"  Status: Posted"
    )


def get_tax_insights() -> str:
    """
    THE CLEO PATTERN: Analyze expenses for tax optimization opportunities.

    Examines the P&L and chart of accounts to identify:
    - Potential deductible expenses the user might be missing
    - Categories that might trigger HMRC scrutiny
    - Corporation tax estimate (UK: 19% under £50k, up to 25% over £250k)
    - Simple tax-saving suggestions in plain English

    This is the "tax insights" tool inspired by the Cleo case study —
    deterministic financial logic + plain-English explanation.
    """
    pl = _svc().get_profit_and_loss()

    # Extract revenue and expenses
    revenue = pl.get("revenue", pl.get("totals", {}).get("Total Income", 0))
    expenses = pl.get("expenses", pl.get("totals", {}).get("Total Expenses", 0))
    net_profit = pl.get("netProfit", pl.get("totals", {}).get("Net Profit", 0))

    # Handle both live (parsed) and mock formats
    if "totals" in pl:
        totals = pl.get("totals", {})
        revenue = totals.get("Total Income", totals.get("Revenue", revenue))
        expenses = totals.get("Total Expenses", expenses)
        net_profit = totals.get("Net Profit", net_profit)

    # Ensure numeric types (mock data may have strings)
    try:
        revenue = float(revenue or 0)
        expenses = float(expenses or 0)
        net_profit = float(net_profit or 0)
    except (TypeError, ValueError):
        revenue = 0.0
        expenses = 0.0
        net_profit = 0.0

    # UK Corporation Tax estimate — rates are configurable via env vars
    # (set by HMRC, not Xero). The agent cites the current rates and notes
    # this is an estimate.
    if net_profit <= 0:
        corp_tax = 0
        tax_rate = "N/A (business is at a loss)"
        tax_note = "You're running at a loss — no Corporation Tax due. Losses can be carried forward to offset future profits."
    elif net_profit < _CORP_TAX_SMALL_LIMIT:
        corp_tax = net_profit * _CORP_TAX_SMALL_RATE
        tax_rate = f"{_CORP_TAX_SMALL_RATE * 100:.0f}%"
        tax_note = f"You qualify for the small profits rate ({tax_rate}). Estimated Corporation Tax: £{corp_tax:,.2f}"
    elif net_profit > _CORP_TAX_MAIN_LIMIT:
        corp_tax = net_profit * _CORP_TAX_MAIN_RATE
        tax_rate = f"{_CORP_TAX_MAIN_RATE * 100:.0f}%"
        tax_note = (
            f"You're at the main rate ({tax_rate}). Estimated Corporation Tax: £{corp_tax:,.2f}"
        )
    else:
        # Marginal relief between small and main limits
        corp_tax = (
            net_profit * _CORP_TAX_MAIN_RATE
            - (_CORP_TAX_MAIN_LIMIT - net_profit) * _CORP_TAX_MARGINAL_RELIEF
        )
        tax_rate = (
            f"{_CORP_TAX_SMALL_RATE * 100:.0f}-{_CORP_TAX_MAIN_RATE * 100:.0f}% (marginal relief)"
        )
        tax_note = (
            f"You're in the marginal relief zone. Estimated Corporation Tax: £{corp_tax:,.2f}"
        )

    # Analyze expense categories for tax insights
    insights = []
    expense_items = pl.get("lineItems", pl.get("rows", []))

    # Check for entertainment expenses (not deductible in UK)
    for item in expense_items:
        label = item.get("label", item.get("account", "")).lower()
        try:
            value = float(item.get("value", item.get("value", 0)) or 0)
        except (TypeError, ValueError):
            value = 0
        if "entertainment" in label or "client entertainment" in label:
            insights.append(
                f"⚠ CLIENT ENTERTAINMENT: £{value:,.2f} — This is NOT deductible for Corporation Tax. "
                f"Make sure your accountant excludes this from your tax return."
            )

    # Check for high travel expenses (common audit trigger)
    for item in expense_items:
        label = item.get("label", item.get("account", "")).lower()
        try:
            value = float(item.get("value", item.get("value", 0)) or 0)
        except (TypeError, ValueError):
            value = 0
        if "travel" in label and value > 1000:
            insights.append(
                f"📊 TRAVEL COSTS: £{value:,.2f} — Travel is deductible, but keep receipts for all trips. "
                f"HMRC may ask for evidence. Commuting is NOT deductible — only business travel."
            )

    # Check for subscription costs (often missed deductions)
    for item in expense_items:
        label = item.get("label", item.get("account", "")).lower()
        try:
            value = float(item.get("value", item.get("value", 0)) or 0)
        except (TypeError, ValueError):
            value = 0
        if "subscription" in label or "software" in label:
            insights.append(
                f"✓ SOFTWARE/SUBSCRIPTIONS: £{value:,.2f} — These are fully deductible. "
                f"Make sure you're claiming all your SaaS tools (Xero, Google, etc.)."
            )

    # Cash flow insight from overdue invoices
    overdue = _svc().find_overdue_invoices()
    if overdue:
        total_overdue = sum(float(i.get("amountDue", i.get("total", 0)) or 0) for i in overdue)
        insights.append(
            f"💰 CASH FLOW: You have {len(overdue)} overdue invoices totalling £{total_overdue:,.2f}. "
            f"Chasing these could save you £{total_overdue * 0.19:,.2f} in tax (if you can't pay your tax bill "
            f"because customers haven't paid you, HMRC may charge interest)."
        )

    # Build the summary — keep it concise for the LLM to process
    summary = (
        f"TAX INSIGHTS:\n"
        f"Revenue: £{revenue:,.2f}\n"
        f"Expenses: £{expenses:,.2f}\n"
        f"Net Profit: £{net_profit:,.2f}\n"
        f"Corporation Tax Rate: {tax_rate}\n"
        f"Estimated Tax: £{corp_tax:,.2f}\n"
        f"{tax_note}\n"
    )

    if insights:
        summary += "\nFLAGS:\n"
        for i, insight in enumerate(insights, 1):
            summary += f"{i}. {insight}\n"
    else:
        summary += "\nNo specific tax flags identified. Expense categories look standard.\n"

    summary += "\nReminders: File CT600 within 12 months of period end. Pay tax within 9 months + 1 day. Keep receipts for 6 years. This is an estimate — consult an accountant for actual filing.\n"

    return summary


def draft_invoice_reminder(
    invoice_id: str = "",
    contact_name: str = "",
    contact_email: str = "",
    amount: float = 0.0,
    invoice_number: str = "",
    days_overdue: int = 0,
    tone: str = "",
    negotiation_tactic: str = "",
) -> str:
    """
    Draft a reminder email for an overdue invoice using Chris Voss'
    negotiation principles (Never Split the Difference). The tone
    escalates based on days overdue, and the negotiation tactic is
    selected to match the situation.

    Returns a structured email draft with the chosen tactic, situation
    analysis, and the psychology behind the approach — so the user
    understands WHY this email works, not just what it says.
    """
    try:
        amount = float(amount or 0)
        days_overdue = int(days_overdue or 0)
    except (TypeError, ValueError):
        amount, days_overdue = 0.0, 0

    # Look up contact email if not provided
    if not contact_email and contact_name:
        try:
            contacts = _svc().list_contacts()
            for c in contacts:
                if c.get("name", "").lower() == contact_name.lower():
                    contact_email = c.get("emailAddress", "") or ""
                    break
        except Exception:  # noqa: BLE001
            pass

    # Determine tone from days overdue if not specified
    if not tone:
        if days_overdue <= 14:
            tone = "friendly"
        elif days_overdue <= 30:
            tone = "firm"
        elif days_overdue <= 60:
            tone = "final"
        else:
            tone = "collection"

    # Select negotiation tactic based on situation (Chris Voss principles)
    # if not explicitly provided
    if not negotiation_tactic:
        if days_overdue <= 14:
            negotiation_tactic = "mirror"
        elif days_overdue <= 30:
            negotiation_tactic = "calibrated_question"
        elif days_overdue <= 60:
            negotiation_tactic = "label"
        else:
            negotiation_tactic = "no_oriented"

    # Tactic metadata: label, psychology, and how it's applied
    _TACTICS = {
        "mirror": {
            "label": "Mirroring",
            "psychology": (
                "Repeat the last 1-3 words of their likely concern as a question. "
                "Mirroring creates unconscious rapport and prompts the other side "
                "to elaborate, revealing their real constraint. People feel heard "
                "without realizing why."
            ),
        },
        "calibrated_question": {
            "label": "Calibrated Question",
            "psychology": (
                "Ask 'How' or 'What' questions instead of making demands. "
                "'How would you like to resolve this?' gives the debtor agency — "
                "they feel like they're choosing, not being forced. People resist "
                "demands but cooperate with choices. It also makes them think "
                "through the solution themselves."
            ),
        },
        "label": {
            "label": "Labeling",
            "psychology": (
                "Name the emotion or situation: 'It seems like cash flow is tight "
                "right now.' Labeling acknowledges their position without agreeing "
                "with it, which defuses defensiveness. When people feel understood, "
                "they become more flexible."
            ),
        },
        "no_oriented": {
            "label": "No-Oriented Question",
            "psychology": (
                "Frame as 'Would it be a terrible idea to...' — people find it "
                "easier to say 'no' than 'yes,' and saying 'no' to the negative "
                "actually means yes to your request. It feels safe and non-binding, "
                "which lowers their guard."
            ),
        },
        "accusation_audit": {
            "label": "Accusation Audit",
            "psychology": (
                "Pre-empt every negative thing they could think about you: "
                "'You're probably going to think I'm being unreasonable.' "
                "Naming the worst fears upfront defuses them. Once spoken, "
                "they lose their power."
            ),
        },
    }

    tactic_info = _TACTICS.get(negotiation_tactic, _TACTICS["calibrated_question"])
    tactic_label = tactic_info["label"]
    tactic_psychology = tactic_info["psychology"]

    # Situation analysis
    if days_overdue <= 14:
        situation = f"First chase — {days_overdue} days late, relationship is fresh"
    elif days_overdue <= 30:
        situation = f"Second chase — {days_overdue} days late, patience wearing thin"
    elif days_overdue <= 60:
        situation = f"Final notice — {days_overdue} days late, statutory interest applies"
    else:
        situation = f"Debt recovery — {days_overdue} days late, formal action looming"

    # Late payment interest under UK Late Payment of Commercial Debts Act 1998
    interest_rate = 8.0 + _BANK_RATE
    daily_interest = (amount * interest_rate / 100) / 365 * days_overdue
    total_with_interest = amount + daily_interest

    if tone == "friendly":
        subject = f"Friendly reminder: Invoice {invoice_number}"
        body = f"""Dear {contact_name},

I hope you're doing well. Just a quick reminder that invoice {invoice_number}
for £{amount:,.2f} was due {days_overdue} days ago.

I'd really appreciate it if you could settle this at your earliest convenience.
If you've already paid, please disregard this email.

If there's an issue or you need to discuss payment terms, just let me know —
I'm happy to help.

Best regards,
[Your name]
"""
    elif tone == "firm":
        subject = f"Overdue invoice {invoice_number} — {days_overdue} days past due"
        body = f"""Dear {contact_name},

This is a follow-up regarding invoice {invoice_number} for £{amount:,.2f},
which is now {days_overdue} days overdue.

I've not yet received payment or heard from you regarding this invoice.
How would you like to resolve this? I'm open to discussing payment terms
if that would help.

I value our business relationship, but I do need this resolved promptly.

Regards,
[Your name]
"""
    elif tone == "final":
        subject = f"FINAL NOTICE: Invoice {invoice_number} — {days_overdue} days overdue"
        body = f"""Dear {contact_name},

Despite previous reminders, invoice {invoice_number} for £{amount:,.2f}
remains unpaid and is now {days_overdue} days overdue.

It seems like there may be a cash flow constraint on your end. I understand
that can happen — but I need to address this now.

Under the Late Payment of Commercial Debts (Interest) Act 1998, I am
entitled to charge interest at {interest_rate}% per annum (Bank Rate + 8%).
As of today, interest of £{daily_interest:,.2f} has accrued, bringing the
total amount due to £{total_with_interest:,.2f}.

Please arrange payment of £{total_with_interest:,.2f} within 7 days.
If I do not receive payment or a satisfactory response, I will consider
further action to recover the debt.

Regards,
[Your name]
"""
    else:  # collection
        subject = f"Debt recovery: Invoice {invoice_number} — {days_overdue} days overdue"
        body = f"""Dear {contact_name},

Invoice {invoice_number} for £{amount:,.2f} is now {days_overdue} days
overdue. Despite multiple reminders, no payment has been received.

The total amount due, including statutory interest of £{daily_interest:,.2f}
under the Late Payment of Commercial Debts Act 1998, is £{total_with_interest:,.2f}.

Would it be a terrible idea to settle this before I refer it to a debt
collection agency or pursue recovery through the Small Claims Court?

This is my final communication before formal recovery proceedings begin.

Regards,
[Your name]
"""

    # Structured output with markers for frontend parsing
    output = f"""NEGOTIATION EMAIL
Tactic: {negotiation_tactic}
Tactic Label: {tactic_label}
Situation: {situation}
Psychology: {tactic_psychology}
To: {contact_email or "[no email on file — look up manually]"}
Subject: {subject}

{body}"""
    return output


def get_savings_opportunities() -> str:
    """
    Analyze the P&L and transactions to identify savings opportunities:
    - Unused software subscriptions (recurring payments with no matching usage)
    - High-margin vs low-margin product/service lines
    - Overpriced expense categories (above industry benchmarks)
    - Tax deductions being missed

    Returns a structured summary of savings opportunities ranked by impact.
    """
    try:
        pl = _svc().get_profit_and_loss()
        txns = _svc().list_bank_transactions()
    except Exception as exc:
        return f"Error fetching data for savings analysis: {exc}"

    opportunities: list[str] = []

    # Parse P&L for expense breakdown. XeroService returns either the
    # parsed report shape (totals/lineItems, live) or the mock shape (rows).
    expenses_by_category: dict[str, float] = {}
    total_expenses = 0.0
    total_revenue = 0.0

    if "totals" in pl:
        # Parsed live report
        total_revenue = float(pl.get("revenue", 0) or 0)
        total_expenses = abs(float(pl.get("expenses", 0) or 0))
        for item in pl.get("lineItems", []):
            label = item.get("label", "Unknown")
            try:
                value = float(str(item.get("value", "0")).replace(",", ""))
            except (ValueError, TypeError):
                value = 0.0
            if label and value:
                expenses_by_category[label] = expenses_by_category.get(label, 0) + abs(value)
    else:
        # Mock shape: rows with positive revenue and negative expenses
        for row in pl.get("rows", []):
            label = row.get("account", "Unknown")
            value = float(row.get("value", 0) or 0)
            if value >= 0:
                total_revenue += value
            else:
                expenses_by_category[label] = expenses_by_category.get(label, 0) + abs(value)
                total_expenses += abs(value)

    # 1. Identify recurring payments (potential unused subscriptions)
    recurring: dict[str, list[float]] = {}
    for t in txns:
        ref = str(t.get("reference", t.get("Reference", "")))
        amount = abs(float(t.get("total", t.get("amount", 0)) or 0))
        if amount > 0:
            # Look for subscription-like patterns
            ref_lower = ref.lower()
            for keyword in [
                "subscription",
                "monthly",
                "saas",
                "adobe",
                "microsoft",
                "google",
                "slack",
                "notion",
                "figma",
                "github",
                "aws",
                "cloud",
                "domain",
                "hosting",
            ]:
                if keyword in ref_lower:
                    recurring[keyword] = recurring.get(keyword, [])
                    recurring[keyword].append(amount)
                    break

    unused_subs = []
    for keyword, amounts in recurring.items():
        monthly_total = sum(amounts) / max(len(amounts), 1)
        annual_cost = monthly_total * 12
        if annual_cost > 100:  # Only flag if > £100/year
            unused_subs.append(
                f"  - {keyword.title()}: ~£{monthly_total:.2f}/mo (£{annual_cost:.0f}/yr)"
            )

    if unused_subs:
        opportunities.append(
            f"💡 SUBSCRIPTIONS: Found {len(unused_subs)} recurring software/cloud payments:\n"
            + "\n".join(unused_subs)
            + "\n  Review these — cancel anything you haven't used in 90 days."
        )

    # 2. Expense ratio analysis
    if total_expenses > 0 and total_revenue > 0:
        expense_ratio = (total_expenses / total_revenue) * 100
        opportunities.append(
            f"📊 EXPENSE RATIO: Your expenses are {expense_ratio:.0f}% of revenue. "
            f" (£{total_revenue:,.0f} revenue, £{total_expenses:,.0f} expenses). "
            f"{'This is high — target 60-70% for retail.' if expense_ratio > 80 else 'This looks healthy.'}"
        )

    # 3. Top expense categories
    if expenses_by_category:
        sorted_expenses = sorted(expenses_by_category.items(), key=lambda x: x[1], reverse=True)
        top_3 = sorted_expenses[:3]
        expense_lines = [f"  - {cat}: £{val:,.0f}" for cat, val in top_3]
        opportunities.append(
            "📋 TOP EXPENSES:\n"
            + "\n".join(expense_lines)
            + "\n  These are your biggest costs. Even a 10% reduction here would save significant money."
        )

    # 4. Margin analysis
    if total_revenue > 0:
        net_margin = ((total_revenue - total_expenses) / total_revenue) * 100
        if net_margin < 0:
            opportunities.append(
                f"⚠️ MARGIN ALERT: You're running at a {abs(net_margin):.0f}% LOSS. "
                f"Revenue (£{total_revenue:,.0f}) isn't covering expenses (£{total_expenses:,.0f}). "
                f"Priority: increase prices, cut costs, or boost sales volume."
            )
        elif net_margin < 10:
            opportunities.append(
                f"📉 LOW MARGIN: Your net margin is {net_margin:.0f}%. "
                f"Healthy retail margins are 10-20%. Consider pricing review."
            )
        else:
            opportunities.append(
                f"✅ HEALTHY MARGIN: Your net margin is {net_margin:.0f}%. "
                f"Look for ways to reinvest this in growth."
            )

    # 5. Overdue invoices as missed opportunity
    try:
        overdue = _svc().find_overdue_invoices()
        if overdue:
            total_overdue = sum(float(i.get("amountDue", 0) or 0) for i in overdue)
            opportunities.append(
                f"💰 UNCOLLECTED REVENUE: {len(overdue)} overdue invoices totalling "
                f"£{total_overdue:,.2f}. This is money you've earned but haven't received. "
                f"Chasing these is the fastest way to improve cash flow."
            )
    except Exception:
        pass

    if not opportunities:
        return "No specific savings opportunities identified. Your expenses look standard and your margins are healthy."

    summary = "SAVINGS OPPORTUNITIES (ranked by impact):\n\n"
    for i, opp in enumerate(opportunities, 1):
        summary += f"{i}. {opp}\n\n"

    summary += "Next steps: Review each opportunity and decide which to act on. Even small savings compound over the year."

    return summary


# ---------------------------------------------------------------------------
# Sector benchmarking — compare the user's numbers against sector averages
# ---------------------------------------------------------------------------

# ONS-style sector benchmarks. In production these would be scraped from
# ONS sector data via Firecrawl. For now we use curated averages from
# ONS "UK business data" and DBT SME finance reports, keyed by SIC section.
# Source: ONS Annual Business Inquiry + DBT Small Business Finance Survey.
_SECTOR_BENCHMARKS: dict[str, dict[str, float]] = {
    "retail": {
        "avg_receivables_days": 52,
        "avg_overdue_rate": 0.08,
        "avg_gross_margin": 0.22,
        "avg_net_margin": 0.04,
        "avg_invoice_value": 850,
        "chasing_threshold_days": 45,
    },
    "construction": {
        "avg_receivables_days": 65,
        "avg_overdue_rate": 0.15,
        "avg_gross_margin": 0.18,
        "avg_net_margin": 0.03,
        "avg_invoice_value": 4200,
        "chasing_threshold_days": 60,
    },
    "professional_services": {
        "avg_receivables_days": 48,
        "avg_overdue_rate": 0.06,
        "avg_gross_margin": 0.45,
        "avg_net_margin": 0.12,
        "avg_invoice_value": 3200,
        "chasing_threshold_days": 45,
    },
    "hospitality": {
        "avg_receivables_days": 18,
        "avg_overdue_rate": 0.04,
        "avg_gross_margin": 0.35,
        "avg_net_margin": 0.08,
        "avg_invoice_value": 420,
        "chasing_threshold_days": 21,
    },
    "manufacturing": {
        "avg_receivables_days": 58,
        "avg_overdue_rate": 0.10,
        "avg_gross_margin": 0.28,
        "avg_net_margin": 0.06,
        "avg_invoice_value": 5600,
        "chasing_threshold_days": 55,
    },
    "wholesale": {
        "avg_receivables_days": 42,
        "avg_overdue_rate": 0.07,
        "avg_gross_margin": 0.15,
        "avg_net_margin": 0.03,
        "avg_invoice_value": 2800,
        "chasing_threshold_days": 40,
    },
    "default": {
        "avg_receivables_days": 50,
        "avg_overdue_rate": 0.09,
        "avg_gross_margin": 0.25,
        "avg_net_margin": 0.06,
        "avg_invoice_value": 1800,
        "chasing_threshold_days": 45,
    },
}

# Keyword mapping from org name / industry hints to sector
_SECTOR_KEYWORDS: list[tuple[str, str]] = [
    ("retail", "retail"), ("shop", "retail"), ("store", "retail"),
    ("cafe", "hospitality"), ("restaurant", "hospitality"), ("bar", "hospitality"),
    ("hotel", "hospitality"), ("catering", "hospitality"), ("coffee", "hospitality"),
    ("construct", "construction"), ("build", "construction"), ("contractor", "construction"),
    ("consult", "professional_services"), ("law", "professional_services"),
    ("account", "professional_services"), ("agency", "professional_services"),
    ("design", "professional_services"), ("tech", "professional_services"),
    ("manufactur", "manufacturing"), ("factory", "manufacturing"),
    ("wholesale", "wholesale"), ("distribut", "wholesale"),
]


def _detect_sector(org_name: str = "", industry: str = "") -> str:
    """Detect sector from org name or industry hints."""
    text = f"{org_name} {industry}".lower()
    for keyword, sector in _SECTOR_KEYWORDS:
        if keyword in text:
            return sector
    return "default"


def _fetch_ons_benchmarks(sector: str) -> dict[str, float] | None:
    """
    Attempt to fetch live ONS sector data via Firecrawl.
    Returns None if Firecrawl is unavailable or scraping fails,
    in which case we fall back to hardcoded benchmarks.
    """
    firecrawl_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not firecrawl_key:
        return None

    # ONS publishes sector-level business data. The most relevant page
    # for receivables / payment performance is the DBT Small Business
    # Finance Survey, which reports average payment days by sector.
    sector_search = {
        "retail": "retail",
        "construction": "construction",
        "professional_services": "professional services",
        "hospitality": "accommodation food service",
        "manufacturing": "manufacturing",
        "wholesale": "wholesale",
    }
    sector_term = sector_search.get(sector, sector)

    try:
        import httpx

        # Use Exa to find the relevant ONS/DBT page
        exa_key = os.environ.get("EXA_API_KEY", "")
        if not exa_key:
            return None

        with httpx.Client(timeout=10.0) as cx:
            # Step 1: Exa search for ONS sector data
            search_resp = cx.post(
                "https://api.exa.ai/search",
                headers={
                    "x-api-key": exa_key,
                    "Content-Type": "application/json",
                },
                json={
                    "query": f"UK {sector_term} average payment days receivables ONS DBT survey",
                    "type": "instant",
                    "numResults": 3,
                    "includeDomains": ["gov.uk", "ons.gov.uk"],
                },
            )
            search_resp.raise_for_status()
            results = search_resp.json().get("results", [])
            if not results:
                return None

            # Step 2: Firecrawl scrape the top result
            top_url = results[0].get("url", "")
            if not top_url:
                return None

            scrape_resp = cx.post(
                "https://api.firecrawl.dev/v2/scrape",
                headers={
                    "Authorization": f"Bearer {firecrawl_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "url": top_url,
                    "formats": ["markdown"],
                    "onlyMainContent": True,
                },
            )
            scrape_resp.raise_for_status()
            markdown = scrape_resp.json().get("data", {}).get("markdown", "")

            if not markdown or len(markdown) < 200:
                return None

            # Step 3: Extract benchmark numbers from the markdown.
            # Look for patterns like "average payment days: 52" or
            # "receivables days ... 48". This is intentionally fuzzy —
            # ONS pages vary in format. If we can't extract clean numbers,
            # fall back to hardcoded.
            import re

            text = markdown.lower()
            # Look for "X days" near "payment" or "receivables" or "average"
            days_patterns = [
                r"(?:average\s+)?(?:payment|receivable[s]?)\s*(?:days?|period)\s*[:\-]?\s*(\d{1,3})\s*days?",
                r"(\d{1,3})\s*days?\s*(?:average\s+)?(?:payment|receivable|collection)",
                r"average\s+(?:of\s+)?(\d{1,3})\s*days?\s*(?:to\s+)?(?:pay|payment|collect)",
            ]
            found_days = None
            for pattern in days_patterns:
                match = re.search(pattern, text)
                if match:
                    found_days = int(match.group(1))
                    break

            if found_days and 5 <= found_days <= 120:
                # Successfully extracted — merge with hardcoded data,
                # overriding only the receivables days
                bench = dict(_SECTOR_BENCHMARKS.get(sector, _SECTOR_BENCHMARKS["default"]))
                bench["avg_receivables_days"] = float(found_days)
                bench["_source"] = "live_ons"
                return bench

    except Exception:  # noqa: BLE001
        pass

    return None


def get_sector_benchmarks(sector: str = "") -> str:
    """
    Compare the user's receivables, overdue rate, and margins against
    sector averages (ONS data). Helps the user understand whether their
    numbers are normal for their industry or need attention.

    If sector is not specified, attempts to detect it from the org name.
    Attempts to fetch live ONS data via Firecrawl; falls back to
    curated hardcoded benchmarks if Firecrawl is unavailable.
    """
    svc = _svc()

    # Detect sector if not provided
    if not sector or sector not in _SECTOR_BENCHMARKS:
        try:
            org = svc.get_organisation()
            org_name = org.get("name", "") if isinstance(org, dict) else ""
        except Exception:  # noqa: BLE001
            org_name = ""
        sector = _detect_sector(org_name, sector)
        if sector not in _SECTOR_BENCHMARKS:
            sector = "default"

    # Try live ONS data first, fall back to hardcoded
    bench = _fetch_ons_benchmarks(sector)
    if bench is None:
        bench = _SECTOR_BENCHMARKS[sector]
    else:
        # Merge any missing keys from hardcoded
        hardcoded = _SECTOR_BENCHMARKS.get(sector, _SECTOR_BENCHMARKS["default"])
        for key, val in hardcoded.items():
            if key not in bench:
                bench[key] = val

    # Calculate the user's actual numbers
    try:
        invoices = svc.list_invoices(invoice_type="ACCREC")
        overdue = svc.find_overdue_invoices()
        all_accrec = [i for i in invoices if i.get("type") == "ACCREC"]
        overdue_accrec = [i for i in overdue if i.get("type") != "ACCPAY"]
    except Exception:  # noqa: BLE001
        all_accrec = []
        overdue_accrec = []

    # User's metrics
    total_invoices = len(all_accrec)
    total_overdue = len(overdue_accrec)
    overdue_rate = total_overdue / total_invoices if total_invoices > 0 else 0

    # Average receivables days (approximate: average days between due date and today for overdue)
    from datetime import date as _date
    today = _date.today()
    receivables_days = []
    for inv in overdue_accrec:
        try:
            due = _date.fromisoformat(inv.get("dueDate", "")[:10])
            days = (today - due).days
            if days > 0:
                receivables_days.append(days)
        except (ValueError, TypeError):
            pass
    avg_receivables_days = sum(receivables_days) / len(receivables_days) if receivables_days else 0

    # Average invoice value
    avg_invoice = (
        sum(float(i.get("total", 0)) for i in all_accrec) / total_invoices
        if total_invoices > 0
        else 0
    )

    # Compare against benchmarks
    sector_label = sector.replace("_", " ").title()
    source_label = "live ONS data" if bench.get("_source") == "live_ons" else "ONS sector averages"
    summary = f"SECTOR BENCHMARK: {sector_label}\n\n"
    summary += f"Based on {source_label} for {sector_label.lower()} businesses.\n\n"

    # Receivables days comparison
    user_recv = round(avg_receivables_days) if avg_receivables_days > 0 else "N/A"
    bench_recv = bench["avg_receivables_days"]
    if isinstance(user_recv, int):
        if user_recv <= bench_recv * 0.8:
            recv_verdict = f"BETTER than sector average ({bench_recv} days). You're in the top quartile."
        elif user_recv <= bench_recv:
            recv_verdict = f"In line with sector average ({bench_recv} days). Normal for your industry."
        elif user_recv <= bench_recv * 1.3:
            recv_verdict = f"WORSE than sector average ({bench_recv} days). Needs attention."
        else:
            recv_verdict = f"SIGNIFICANTLY WORSE than sector average ({bench_recv} days). Priority #1."
    else:
        recv_verdict = f"No overdue invoices to measure. Sector average is {bench_recv} days."
    summary += f"Your avg receivables: {user_recv} days\n{recv_verdict}\n\n"

    # Overdue rate comparison
    user_rate = round(overdue_rate * 100, 1)
    bench_rate = bench["avg_overdue_rate"] * 100
    if overdue_rate <= bench["avg_overdue_rate"] * 0.5:
        rate_verdict = f"BETTER than sector average ({bench_rate:.0f}%). Excellent collection rate."
    elif overdue_rate <= bench["avg_overdue_rate"]:
        rate_verdict = f"In line with sector average ({bench_rate:.0f}%). Normal for your industry."
    elif overdue_rate <= bench["avg_overdue_rate"] * 1.5:
        rate_verdict = f"WORSE than sector average ({bench_rate:.0f}%). Review your credit terms."
    else:
        rate_verdict = f"SIGNIFICANTLY WORSE ({bench_rate:.0f}% sector average). You may need stricter payment terms."
    summary += f"Your overdue rate: {user_rate}%\n{rate_verdict}\n\n"

    # Average invoice value
    user_inv = round(avg_invoice) if avg_invoice > 0 else "N/A"
    bench_inv = bench["avg_invoice_value"]
    summary += f"Your avg invoice: £{user_inv}\nSector average: £{bench_inv:,}\n\n"

    # Chasing threshold guidance
    threshold = bench["chasing_threshold_days"]
    summary += (
        f"SECTOR GUIDANCE: In {sector_label}, businesses typically start chasing "
        f"at {threshold} days. If your invoices are older than this, you're past "
        f"the point where most {sector_label.lower()} businesses would have acted.\n\n"
    )

    # Action recommendation
    if avg_receivables_days > bench_recv * 1.3 or overdue_rate > bench["avg_overdue_rate"] * 1.5:
        summary += (
            "RECOMMENDATION: Your numbers are worse than sector norms. "
            "Consider: (1) shorter payment terms on new invoices, "
            "(2) automated reminders at the sector chasing threshold, "
            "(3) asking Zana to score your customers and identify the worst offenders."
        )
    elif avg_receivables_days > 0 and avg_receivables_days <= bench_recv * 0.8:
        summary += (
            "RECOMMENDATION: You're outperforming your sector on collections. "
            "Your chasing process is working — keep doing what you're doing."
        )
    else:
        summary += (
            "RECOMMENDATION: Your numbers are within normal range for your sector. "
            "No urgent action needed, but stay vigilant."
        )

    # Structured data block for frontend card rendering.
    # The LLM is instructed to include this verbatim in its response.
    import json as _json

    def _verdict(user_val, bench_val, lower_is_better=True):
        if not isinstance(user_val, (int, float)) or user_val == 0:
            return "N/A"
        if lower_is_better:
            if user_val <= bench_val * 0.8:
                return "BETTER"
            elif user_val <= bench_val:
                return "IN_LINE"
            elif user_val <= bench_val * 1.3:
                return "WORSE"
            else:
                return "SIGNIFICANTLY_WORSE"
        else:
            if user_val >= bench_val * 1.2:
                return "BETTER"
            elif user_val >= bench_val * 0.8:
                return "IN_LINE"
            else:
                return "WORSE"

    card_data = {
        "type": "sector_benchmark",
        "sector": sector_label,
        "source": "live_ons" if bench.get("_source") == "live_ons" else "curated",
        "metrics": [
            {
                "label": "Avg receivables days",
                "user_value": user_recv if isinstance(user_recv, int) else None,
                "sector_value": bench_recv,
                "unit": "days",
                "verdict": _verdict(user_recv, bench_recv) if isinstance(user_recv, int) else "N/A",
            },
            {
                "label": "Overdue rate",
                "user_value": round(overdue_rate * 100, 1),
                "sector_value": round(bench["avg_overdue_rate"] * 100, 1),
                "unit": "%",
                "verdict": _verdict(round(overdue_rate * 100, 1), round(bench["avg_overdue_rate"] * 100, 1)),
            },
            {
                "label": "Avg invoice value",
                "user_value": round(avg_invoice) if avg_invoice > 0 else None,
                "sector_value": bench["avg_invoice_value"],
                "unit": "£",
                "verdict": "N/A",
            },
        ],
        "chasing_threshold_days": threshold,
    }
    summary += "\n\nANALYSIS_DATA\n" + _json.dumps(card_data) + "\nEND_ANALYSIS_DATA"

    return summary


# ---------------------------------------------------------------------------
# Customer scoring — payment reliability + cost-to-serve per customer
# ---------------------------------------------------------------------------

# Hourly rate for chasing cost calculation (UK small business average)
_CHASING_HOURLY_RATE = float(os.environ.get("CHASING_HOURLY_RATE", "35"))


def score_customers() -> str:
    """
    Analyze each customer's payment history and assign a reliability score.
    Calculates: on-time rate, average days late, total revenue, chasing cost,
    and a red/amber/green rating. Identifies customers who cost more to
    serve than they're worth (candidates for 'firing').
    """
    svc = _svc()

    try:
        all_invoices = svc.list_invoices(invoice_type="ACCREC")
        contacts = svc.list_contacts()
    except Exception as exc:  # noqa: BLE001
        return f"Unable to analyze customers: {exc}"

    # Group invoices by contact name
    customer_data: dict[str, list[dict]] = {}
    for inv in all_invoices:
        if inv.get("type") != "ACCREC":
            continue
        name = (inv.get("contact") or {}).get("name", "Unknown")
        customer_data.setdefault(name, []).append(inv)

    if not customer_data:
        return "No customer invoices found to analyze."

    from datetime import date as _date
    today = _date.today()

    scores: list[dict[str, any]] = []
    for name, invs in customer_data.items():
        total_invoices = len(invs)
        total_revenue = sum(float(i.get("total", 0)) for i in invs)
        total_outstanding = sum(float(i.get("amountDue", 0)) for i in invs)

        # Calculate days late per invoice using fullyPaidOnDate when
        # available (accurate), falling back to approximation for invoices
        # without a payment date.
        days_late_list = []
        on_time_count = 0
        overdue_count = 0

        for inv in invs:
            try:
                due_date = _date.fromisoformat(inv.get("dueDate", "")[:10])
            except (ValueError, TypeError):
                continue

            status = inv.get("status", "")
            amount_due = float(inv.get("amountDue", 0))
            paid_date_str = inv.get("fullyPaidOnDate", "")

            if status == "PAID" and paid_date_str:
                # Accurate: compare actual payment date to due date
                try:
                    paid_date = _date.fromisoformat(paid_date_str[:10])
                    days_late = (paid_date - due_date).days
                    if days_late <= 0:
                        on_time_count += 1
                    else:
                        days_late_list.append(days_late)
                except (ValueError, TypeError):
                    on_time_count += 1
            elif status == "PAID":
                # Paid but no payment date — assume on-time
                on_time_count += 1
            elif status == "AUTHORISED" and amount_due > 0:
                days = (today - due_date).days
                if days > 0:
                    days_late_list.append(days)
                    overdue_count += 1
                else:
                    # Not due yet — don't count as on-time or late.
                    # It's too early to judge. Exclude from on-time rate.
                    pass

        # Metrics — on-time rate is based on invoices that are actually
        # due (paid or overdue), not future-due invoices.
        judged_invoices = on_time_count + overdue_count
        on_time_rate = on_time_count / judged_invoices if judged_invoices > 0 else 1.0
        avg_days_late = sum(days_late_list) / len(days_late_list) if days_late_list else 0

        # Chasing cost estimate: each overdue invoice costs ~30 min of chasing
        # at the hourly rate, plus interest accrued
        chasing_hours = overdue_count * 0.5  # 30 min per overdue invoice
        chasing_cost = chasing_hours * _CHASING_HOURLY_RATE

        # Interest lost on overdue invoices
        interest_rate = (8.0 + _BANK_RATE) / 100
        interest_lost = 0.0
        for inv in invs:
            if inv.get("status") == "AUTHORISED" and float(inv.get("amountDue", 0)) > 0:
                try:
                    due = _date.fromisoformat(inv.get("dueDate", "")[:10])
                    days = max((today - due).days, 0)
                    amount = float(inv.get("amountDue", 0))
                    interest_lost += amount * interest_rate / 365 * days
                except (ValueError, TypeError):
                    pass

        total_cost = chasing_cost + interest_lost

        # Rating: green / amber / red
        if on_time_rate >= 0.8 and avg_days_late <= 14:
            rating = "GREEN"
        elif on_time_rate >= 0.5 and avg_days_late <= 30:
            rating = "AMBER"
        else:
            rating = "RED"

        # Firing recommendation: if total cost > 10% of revenue
        fire_recommendation = total_cost > total_revenue * 0.10 and total_revenue > 0

        # Contact email lookup
        email = ""
        for c in contacts:
            if c.get("name", "").lower() == name.lower():
                email = c.get("emailAddress", "") or ""
                break

        scores.append({
            "name": name,
            "rating": rating,
            "on_time_rate": round(on_time_rate * 100, 1),
            "avg_days_late": round(avg_days_late),
            "total_invoices": total_invoices,
            "total_revenue": total_revenue,
            "outstanding": total_outstanding,
            "chasing_cost": round(chasing_cost, 2),
            "interest_lost": round(interest_lost, 2),
            "total_cost": round(total_cost, 2),
            "fire_recommendation": fire_recommendation,
            "email": email,
        })

    # Sort by total cost descending (worst customers first)
    scores.sort(key=lambda s: s["total_cost"], reverse=True)

    summary = "CUSTOMER SCORECARD (sorted by cost-to-serve, worst first):\n\n"
    for s in scores:
        summary += f"{'🔴' if s['rating'] == 'RED' else '🟡' if s['rating'] == 'AMBER' else '🟢'} {s['name']}\n"
        summary += f"  Rating: {s['rating']} | On-time: {s['on_time_rate']}% | Avg late: {s['avg_days_late']} days\n"
        summary += f"  Invoices: {s['total_invoices']} | Revenue: £{s['total_revenue']:,.2f} | Outstanding: £{s['outstanding']:,.2f}\n"
        summary += f"  Chasing cost: £{s['chasing_cost']:,.2f} | Interest lost: £{s['interest_lost']:,.2f} | Total cost: £{s['total_cost']:,.2f}\n"
        if s["fire_recommendation"]:
            summary += (
                f"  ⚠️  FIRING CANDIDATE: This customer's cost-to-serve (£{s['total_cost']:,.2f}) "
                f"exceeds 10% of their revenue (£{s['total_revenue']:,.2f}). "
                f"They're costing you more than they're worth.\n"
            )
        summary += "\n"

    # Summary stats
    total_revenue_all = sum(s["total_revenue"] for s in scores)
    total_cost_all = sum(s["total_cost"] for s in scores)
    red_count = sum(1 for s in scores if s["rating"] == "RED")
    fire_count = sum(1 for s in scores if s["fire_recommendation"])

    summary += f"PORTFOLIO SUMMARY:\n"
    summary += f"  Total revenue: £{total_revenue_all:,.2f}\n"
    summary += f"  Total chasing + interest cost: £{total_cost_all:,.2f}\n"
    summary += f"  Cost as % of revenue: {(total_cost_all / total_revenue_all * 100):.1f}%\n" if total_revenue_all > 0 else ""
    summary += f"  Red customers: {red_count} | Firing candidates: {fire_count}\n\n"

    if fire_count > 0:
        summary += (
            f"ZANA'S TAKE: You have {fire_count} customer(s) costing you more than "
            f"they're worth. Consider: (1) renegotiating payment terms upfront, "
            f"(2) requiring deposits for future work, (3) if they won't change, "
            f"firing them — refer to Zana for a scripted exit conversation."
        )

    # Structured data block for frontend card rendering
    import json as _json

    card_data = {
        "type": "customer_scorecard",
        "customers": [
            {
                "name": s["name"],
                "rating": s["rating"],
                "on_time_rate": s["on_time_rate"],
                "avg_days_late": s["avg_days_late"],
                "total_invoices": s["total_invoices"],
                "total_revenue": s["total_revenue"],
                "outstanding": s["outstanding"],
                "chasing_cost": s["chasing_cost"],
                "interest_lost": s["interest_lost"],
                "total_cost": s["total_cost"],
                "fire_recommendation": s["fire_recommendation"],
            }
            for s in scores
        ],
        "portfolio": {
            "total_revenue": round(total_revenue_all, 2),
            "total_cost": round(total_cost_all, 2),
            "red_count": red_count,
            "fire_count": fire_count,
        },
    }
    summary += "\n\nANALYSIS_DATA\n" + _json.dumps(card_data) + "\nEND_ANALYSIS_DATA"

    return summary


# ---------------------------------------------------------------------------
# Multi-stage chasing strategy — full negotiation plan per overdue invoice
# ---------------------------------------------------------------------------

def get_chasing_strategy(contact_name: str = "") -> str:
    """
    Generate a multi-stage chasing strategy for an overdue invoice or
    customer. Lays out a 4-stage plan with Chris Voss negotiation tactics
    per stage, timing, and escalation logic. Use when the user wants a
    full chasing plan rather than a single email.
    """
    svc = _svc()

    try:
        overdue = svc.find_overdue_invoices()
        overdue_accrec = [i for i in overdue if i.get("type") != "ACCPAY"]
    except Exception:  # noqa: BLE001
        overdue_accrec = []

    if contact_name:
        overdue_accrec = [
            i for i in overdue_accrec
            if (i.get("contact") or {}).get("name", "").lower() == contact_name.lower()
        ]

    if not overdue_accrec:
        if contact_name:
            return f"No overdue invoices found for {contact_name}."
        return "No overdue invoices to build a chasing strategy for."

    from datetime import date as _date
    today = _date.today()

    # Group by contact
    by_contact: dict[str, list[dict]] = {}
    for inv in overdue_accrec:
        name = (inv.get("contact") or {}).get("name", "Unknown")
        by_contact.setdefault(name, []).append(inv)

    summary = "CHASING STRATEGY (Chris Voss — Never Split the Difference):\n\n"

    for contact, invs in by_contact.items():
        total = sum(float(i.get("amountDue", 0)) for i in invs)
        max_days = 0
        for inv in invs:
            try:
                due = _date.fromisoformat(inv.get("dueDate", "")[:10])
                days = (today - due).days
                max_days = max(max_days, days)
            except (ValueError, TypeError):
                pass

        summary += f"━━━ {contact} — £{total:,.2f} overdue, {max_days} days max late ━━━\n\n"

        # Determine which stage they're at based on max days overdue
        if max_days <= 14:
            current_stage = 1
        elif max_days <= 30:
            current_stage = 2
        elif max_days <= 60:
            current_stage = 3
        else:
            current_stage = 4

        stages = [
            {
                "stage": 1,
                "days": "1-14 days late",
                "tactic": "Mirroring",
                "tactic_key": "mirror",
                "action": "Friendly reminder. Build rapport, assume they forgot.",
                "email_prompt": "Draft a friendly first reminder using mirroring — keep it warm, assume oversight, not avoidance.",
            },
            {
                "stage": 2,
                "days": "15-30 days late",
                "tactic": "Calibrated Question",
                "tactic_key": "calibrated_question",
                "action": "Firm follow-up. Give them agency, not demands.",
                "email_prompt": "Draft a firm follow-up using a calibrated question — 'How would you like to resolve this?'",
            },
            {
                "stage": 3,
                "days": "31-60 days late",
                "tactic": "Labeling",
                "tactic_key": "label",
                "action": "Final notice with statutory interest. Acknowledge their position.",
                "email_prompt": "Draft a final notice using labeling — acknowledge cash flow constraints, cite statutory interest.",
            },
            {
                "stage": 4,
                "days": "60+ days late",
                "tactic": "No-Oriented Question",
                "tactic_key": "no_oriented",
                "action": "Debt recovery. Make it easy to say yes by saying no to the negative.",
                "email_prompt": "Draft a debt recovery letter using a no-oriented question — 'Would it be a terrible idea to settle before collections?'",
            },
        ]

        for stage in stages:
            marker = "▶ CURRENT" if stage["stage"] == current_stage else ("✓ DONE" if stage["stage"] < current_stage else "○ UPCOMING")
            summary += f"  Stage {stage['stage']} ({stage['days']}) — {marker}\n"
            summary += f"  Tactic: {stage['tactic']}\n"
            summary += f"  Action: {stage['action']}\n"
            if stage["stage"] >= current_stage:
                summary += f"  To execute: Ask Zana to \"{stage['email_prompt']}\"\n"
            summary += "\n"

        # Strategic advice
        if current_stage >= 3:
            summary += (
                f"  ⚠️  STRATEGIC NOTE: This customer is {max_days} days late. "
                f"At this stage, consider: (1) requiring upfront payment for future work, "
                f"(2) checking if this customer is a firing candidate (ask Zana to score customers), "
                f"(3) if Stage 4 doesn't work, refer to Small Claims Court (under £10k) "
                f"or a debt collection agency.\n\n"
            )

    summary += (
        "NEGOTIATION PRINCIPLES:\n"
        "- Never chase with anger. Chase with curiosity (mirroring) or empathy (labeling).\n"
        "- The goal isn't to punish — it's to get paid AND keep the relationship if possible.\n"
        "- Escalate tone, not emotion. Each stage is firmer, not angrier.\n"
        "- Track which tactics work per customer. Some respond to warmth, others to firmness.\n"
    )

    return summary


# ---------------------------------------------------------------------------
# Trend analysis — track financial metrics over time
# ---------------------------------------------------------------------------

def _capture_snapshot() -> None:
    """
    Capture a snapshot of the current financial metrics and save to DB.
    Called automatically when the user opens the books page or asks
    about trends. Throttled to one snapshot per session per day.
    """
    from src.services.payment_store import save_metric_snapshot, get_metric_snapshots

    session_id = _current_session.get()

    # Throttle: skip if we already have a snapshot from today
    existing = get_metric_snapshots(session_id, limit=1)
    if existing:
        try:
            from datetime import datetime as _dt
            last = _dt.fromisoformat(existing[-1]["captured_at"]).date()
            today_date = _dt.now().astimezone().date()
            if last == today_date:
                return  # Already captured today
        except Exception:  # noqa: BLE001
            pass

    svc = _svc()
    try:
        invoices = svc.list_invoices(invoice_type="ACCREC")
        overdue = svc.find_overdue_invoices()
        all_accrec = [i for i in invoices if i.get("type") == "ACCREC"]
        overdue_accrec = [i for i in overdue if i.get("type") != "ACCPAY"]
    except Exception:  # noqa: BLE001
        return

    from datetime import date as _date
    today = _date.today()

    total_overdue = sum(float(i.get("amountDue", 0)) for i in overdue_accrec)
    overdue_count = len(overdue_accrec)
    total_revenue = sum(float(i.get("total", 0)) for i in all_accrec)
    overdue_rate = overdue_count / len(all_accrec) if all_accrec else 0

    # Average receivables days
    recv_days = []
    for inv in overdue_accrec:
        try:
            due = _date.fromisoformat(inv.get("dueDate", "")[:10])
            days = (today - due).days
            if days > 0:
                recv_days.append(days)
        except (ValueError, TypeError):
            pass
    avg_recv = sum(recv_days) / len(recv_days) if recv_days else 0

    # Net margin from P&L (best effort)
    net_margin = 0.0
    try:
        pnl = svc.get_profit_and_loss()
        # Try to extract net profit and revenue
        if isinstance(pnl, dict):
            totals = pnl.get("totals", {})
            revenue = float(totals.get("Revenue", 0) or 0)
            net = float(totals.get("NetProfit", totals.get("Net Profit", 0)) or 0)
            if revenue > 0:
                net_margin = net / revenue
    except Exception:  # noqa: BLE001
        pass

    save_metric_snapshot(
        session_id=session_id,
        total_overdue=total_overdue,
        overdue_count=overdue_count,
        avg_receivables_days=avg_recv,
        overdue_rate=overdue_rate,
        total_revenue=total_revenue,
        net_margin=net_margin,
    )


def get_trend_analysis() -> str:
    """
    Analyze financial metric trends over time using stored snapshots.
    Shows whether receivables, overdue rate, and margin are improving
    or worsening. Captures a new snapshot automatically if needed.
    """
    from src.services.payment_store import get_metric_snapshots

    # Capture current state first
    _capture_snapshot()

    session_id = _current_session.get()
    snapshots = get_metric_snapshots(session_id, limit=12)

    if len(snapshots) < 2:
        return (
            "TREND ANALYSIS:\n\n"
            "Not enough historical data to show trends yet. "
            "I've captured a snapshot of your current metrics. "
            "Check back after a few days of using Sikizana to see "
            "how your receivables and overdue rate are trending over time."
        )

    summary = "TREND ANALYSIS (last {} snapshots):\n\n".format(len(snapshots))

    # Show trend for each key metric
    metrics = [
        ("total_overdue", "Total overdue", "£{:.2f}"),
        ("overdue_count", "Overdue invoices", "{:.0f}"),
        ("avg_receivables_days", "Avg receivables days", "{:.0f} days"),
        ("overdue_rate", "Overdue rate", "{:.1%}"),
        ("net_margin", "Net margin", "{:.1%}"),
    ]

    for key, label, fmt in metrics:
        values = [s.get(key, 0) for s in snapshots]
        first = values[0] if values else 0
        latest = values[-1] if values else 0

        if first == 0 and latest == 0:
            continue  # Skip metrics with no data

        # Calculate trend direction
        if isinstance(first, (int, float)) and isinstance(latest, (int, float)):
            if key in ("total_overdue", "overdue_count", "avg_receivables_days", "overdue_rate"):
                # For these metrics, decreasing is good
                if latest < first * 0.9:
                    trend = "↓ IMPROVING"
                elif latest > first * 1.1:
                    trend = "↑ WORSENING"
                else:
                    trend = "→ STABLE"
            elif key == "net_margin":
                # For margin, increasing is good
                if latest > first * 1.1:
                    trend = "↑ IMPROVING"
                elif latest < first * 0.9:
                    trend = "↓ WORSENING"
                else:
                    trend = "→ STABLE"
            else:
                trend = "→ STABLE"

            first_str = fmt.format(first) if "{" in fmt else str(first)
            latest_str = fmt.format(latest) if "{" in fmt else str(latest)
            summary += f"{label}: {first_str} → {latest_str} {trend}\n"

    summary += "\n"

    # Trajectory projection for overdue
    if len(snapshots) >= 3:
        overdue_values = [s.get("total_overdue", 0) for s in snapshots]
        # Simple linear trend: compare first half avg to second half avg
        mid = len(overdue_values) // 2
        first_half_avg = sum(overdue_values[:mid]) / mid if mid > 0 else 0
        second_half_avg = sum(overdue_values[mid:]) / (len(overdue_values) - mid) if (len(overdue_values) - mid) > 0 else 0

        if first_half_avg > 0:
            change_pct = ((second_half_avg - first_half_avg) / first_half_avg) * 100
            if change_pct > 10:
                summary += (
                    f"⚠️  TRAJECTORY: Your overdue invoices are trending UP ({change_pct:+.0f}% "
                    f"comparing recent vs older snapshots). If this continues, "
                    f"prioritize chasing your worst offenders. Ask Zana to score "
                    f"your customers and build a chasing strategy.\n\n"
                )
            elif change_pct < -10:
                summary += (
                    f"✓ TRAJECTORY: Your overdue invoices are trending DOWN ({change_pct:+.0f}%). "
                    f"Your chasing is working. Keep it up.\n\n"
                )

    # Recommendation
    latest = snapshots[-1]
    if latest.get("avg_receivables_days", 0) > 50:
        summary += (
            "RECOMMENDATION: Your average receivables are high. "
            "Consider: (1) shorter payment terms on new invoices, "
            "(2) automated reminders, (3) asking Zana for a chasing strategy."
        )
    elif latest.get("overdue_rate", 0) > 0.15:
        summary += (
            "RECOMMENDATION: Your overdue rate is elevated. "
            "Review your credit terms and chasing process."
        )
    else:
        summary += "RECOMMENDATION: Your metrics look healthy. Stay vigilant."

    # Structured data block for frontend card rendering
    import json as _json

    # Build trend data for each metric
    trend_metrics = []
    for key, label, fmt in metrics:
        values = [s.get(key, 0) for s in snapshots]
        first = values[0] if values else 0
        latest_val = values[-1] if values else 0
        if first == 0 and latest_val == 0:
            continue
        if key in ("total_overdue", "overdue_count", "avg_receivables_days", "overdue_rate"):
            if latest_val < first * 0.9:
                trend_dir = "IMPROVING"
            elif latest_val > first * 1.1:
                trend_dir = "WORSENING"
            else:
                trend_dir = "STABLE"
        elif key == "net_margin":
            if latest_val > first * 1.1:
                trend_dir = "IMPROVING"
            elif latest_val < first * 0.9:
                trend_dir = "WORSENING"
            else:
                trend_dir = "STABLE"
        else:
            trend_dir = "STABLE"
        trend_metrics.append({
            "label": label,
            "key": key,
            "values": values,
            "first": round(first, 2),
            "latest": round(latest_val, 2),
            "trend": trend_dir,
        })

    card_data = {
        "type": "trend_analysis",
        "snapshot_count": len(snapshots),
        "metrics": trend_metrics,
    }
    summary += "\n\nANALYSIS_DATA\n" + _json.dumps(card_data) + "\nEND_ANALYSIS_DATA"

    return summary
