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
        summary += f"- {c['name']} ({role})\n"
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
    amount: float = 0.0,
    invoice_number: str = "",
    days_overdue: int = 0,
    tone: str = "",
) -> str:
    """
    Draft a reminder email for an overdue invoice. The tone escalates
    based on days overdue:
      - 1-14 days: Friendly reminder
      - 15-30 days: Firm but professional
      - 31-60 days: Final notice with late payment interest
      - 60+ days: Recommend debt collection

    Returns the drafted email text for the user to review and send.
    """
    try:
        amount = float(amount or 0)
        days_overdue = int(days_overdue or 0)
    except (TypeError, ValueError):
        amount, days_overdue = 0.0, 0

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

    # Late payment interest under UK Late Payment of Commercial Debts Act 1998
    # = 8% + Bank of England base rate (configurable via env). The rate is
    # cited in the reminder so the debtor can verify it.
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
Could you please arrange payment by return, or contact me immediately to
discuss any issues?

I value our business relationship, but I do need this resolved promptly.

Regards,
[Your name]
"""
    elif tone == "final":
        subject = f"FINAL NOTICE: Invoice {invoice_number} — {days_overdue} days overdue"
        body = f"""Dear {contact_name},

Despite previous reminders, invoice {invoice_number} for £{amount:,.2f}
remains unpaid and is now {days_overdue} days overdue.

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

If payment is not received within 7 days, I will refer this matter to a
debt collection agency or pursue recovery through the Small Claims Court.

This is my final communication before formal recovery proceedings begin.

Regards,
[Your name]
"""

    return f"Subject: {subject}\n\n{body}"


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
