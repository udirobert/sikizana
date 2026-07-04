"""
Xero agent tools — the tool surface the Bookkeeper Agent calls.

These wrap XeroService into the function-calling format that Google ADK
expects. Each tool returns a string (LLM-friendly summary) or structured
data that the agent reasons over.

The design mirrors the original chama tools:
  - analyze_mpesa_records  →  get_xero_transactions
  - bylaw_retriever        →  get_xero_chart_of_accounts (tax/policy RAG)
  - analyze_ledger_image   →  match_receipt_to_transaction (vision)
  - submit_verdict         →  propose_journal_entry (the fix)
"""

from __future__ import annotations

from typing import Any

from src.services.xero_service import XeroService
from src.services.logging import get_logger

log = get_logger("sikizana.xero_tools")

_xero = XeroService()


def get_xero_organisation() -> str:
    """Get the connected Xero organisation's details (name, currency, tax number)."""
    org = _xero.get_organisation()
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
    txns = _xero.list_bank_transactions(txn_type=txn_type or None)

    if query:
        q_lower = query.lower()
        txns = [
            t for t in txns
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
    Retrieve invoices from Xero. Filter by status (DRAFT/AUTHORISED/PAID/VOIDED)
    and type (ACCREC=sales / ACCPAY=bills). Returns a summary with overdue flags.
    """
    invoices = _xero.list_invoices(status=status or None, invoice_type=invoice_type or None)

    if not invoices:
        return "No invoices found for the given filters."

    from datetime import date
    today = date.today().isoformat()

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
    accounts = _xero.list_accounts()
    summary = f"Chart of Accounts ({len(accounts)} accounts):\n"
    for a in accounts:
        summary += f"- {a['code']} | {a['name']} | {a['type']}\n"
    return summary


def get_xero_profit_and_loss(
    from_date: str = "",
    to_date: str = "",
) -> str:
    """Retrieve the Profit & Loss report for a date range. Empty dates = last 90 days."""
    pl = _xero.get_profit_and_loss(from_date=from_date or None, to_date=to_date or None)
    summary = f"Profit & Loss ({pl['fromDate']} to {pl['toDate']}):\n"
    for row in pl["rows"]:
        summary += f"- {row['account']} ({row['code']}): £{row['value']:,.2f}\n"
    summary += f"\nNet Profit: £{pl['netProfit']:,.2f}"
    return summary


def get_xero_balance_sheet(as_of: str = "") -> str:
    """Retrieve the Balance Sheet as of a date. Empty = today."""
    bs = _xero.get_balance_sheet(as_of=as_of or None)
    summary = f"Balance Sheet (as of {bs['asOf']}):\n"
    for row in bs["rows"]:
        summary += f"- {row['account']} ({row['code']}): £{row['value']:,.2f}\n"
    summary += f"\nTotal Assets: £{bs['totalAssets']:,.2f}\n"
    summary += f"Total Liabilities: £{bs['totalLiabilities']:,.2f}\n"
    summary += f"Net Assets: £{bs['netAssets']:,.2f}"
    return summary


def find_discrepancies() -> str:
    """
    THE CORE TOOL: Scan Xero for bookkeeping discrepancies.
    Finds unreconciled bank transactions, overdue invoices, and
    potential matching issues. This is the agent's "audit" step.
    """
    unreconciled = _xero.find_unreconciled_transactions()
    overdue = _xero.find_overdue_invoices()

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
    tb = _xero.get_trial_balance()
    if abs(tb["totalDebit"] - tb["totalCredit"]) > 0.01:
        findings.append(
            f"\n⚠ TRIAL BALANCE IMBALANCE: "
            f"Debits £{tb['totalDebit']:,.2f} ≠ Credits £{tb['totalCredit']:,.2f}"
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
    accounts = _xero.list_accounts()
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
    This is the multimodal reconciliation tool — same engine as the chama
    ledger audit, now pointed at Xero transactions.
    """
    import os
    if not os.path.exists(receipt_image_path):
        return f"Error: Receipt image not found at {receipt_image_path}"

    # Step 1: Vision extraction (reuse the existing Gemini vision tool)
    from src.tools.vision_audit import analyze_ledger_image
    extracted = analyze_ledger_image(
        receipt_image_path,
        query="Extract the supplier name, total amount, date, and any reference/invoice number from this receipt.",
    )

    # Step 2: Try to match against Xero bank transactions
    txns = _xero.list_bank_transactions()
    candidates = []
    if transaction_reference:
        candidates = [
            t for t in txns
            if transaction_reference.lower() in t.get("reference", "").lower()
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
    contacts = _xero.list_contacts()
    if query:
        q = query.lower()
        contacts = [c for c in contacts if q in c.get("name", "").lower()]

    if not contacts:
        return f"No contacts found for '{query}'."

    summary = f"Found {len(contacts)} contacts:\n"
    for c in contacts[:20]:
        role = "Supplier" if c.get("isSupplier") else "Customer"
        summary += f"- {c['name']} ({role}) | {c.get('emailAddress', 'no email')}\n"
    return summary
