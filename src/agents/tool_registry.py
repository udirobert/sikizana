"""Bookkeeper tool registry — OpenAI function-calling definitions and the
synchronous executor that binds them to Python functions.

Extracted from bookkeeper.py so the "what tools exist and how they run"
surface is separate from the streaming/fallback reasoning loop.

SAFETY RULE that must survive every future edit: `create_journal_entry`
is NOT in `_TOOL_DEFS` and NOT in `_TOOL_FUNCS`. Posting to Xero is a
real-money write that only happens through the /api/xero/journal endpoint
behind the user's Approve button. Do not wire a write tool into the LLM's
surface without a product-level decision — this module is where the gate
is enforced.
"""

from __future__ import annotations

import json
from typing import Any

from src.services.logging import get_logger
from src.tools.accounting_tools import (
    draft_invoice_reminder,
    find_discrepancies,
    get_chasing_strategy,
    get_receivables_aging,
    get_savings_opportunities,
    get_sector_benchmarks,
    get_tax_insights,
    get_trend_analysis,
    get_balance_sheet,
    get_chart_of_accounts,
    get_contacts,
    get_invoices,
    get_organisation,
    get_profit_and_loss,
    get_bank_transactions,
    match_receipt_to_transaction,
    propose_journal_entry,
    score_customers,
)
from src.tools.rag_engine import lookup_tax_rule
from src.tools.session import set_current_session

log = get_logger("sikizana.bookkeeper")

# ---- Tool definitions in OpenAI function-calling format ----

_TOOL_DEFS = [
    {
        "type": "function",
        "function": {
            "name": "find_discrepancies",
            "description": "Audit the Xero books for unreconciled bank transactions and overdue invoices. Call this first when the user asks about their books or wants a health check.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_organisation",
            "description": "Get the connected Xero organisation's details (name, currency, country, tax number).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_bank_transactions",
            "description": "List bank transactions from Xero. Returns date, contact, amount, reference, and reconciliation status for each.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_invoices",
            "description": "List invoices from Xero with status, amount due, and due date. Optionally filter by status (e.g. AUTHORISED, PAID, OVERDUE).",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by invoice status: AUTHORISED, PAID, DRAFT, VOIDED, OVERDUE",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_receivables_aging",
            "description": "Aged receivables report — buckets every unpaid sales invoice into not-yet-due / 1-30 / 31-60 / 61-90 / 90+ days overdue, grouped by debtor, with average days-to-get-paid from real payment history. THE standard view of who owes what and how urgently. Call this first when the user asks who owes them money, about cash flow, or about their receivables.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chart_of_accounts",
            "description": "List the chart of accounts from Xero — account codes, names, and types. Useful for proposing journal entries.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_profit_and_loss",
            "description": "Get the profit and loss report from Xero. Returns revenue, expenses, and net profit for the current period.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_balance_sheet",
            "description": "Get the balance sheet report from Xero. Returns total assets, liabilities, and equity.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_contacts",
            "description": "List contacts (customers/suppliers) from Xero. Optionally filter by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Optional search query to filter contacts by name",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "match_receipt_to_transaction",
            "description": "Use vision AI to read a receipt/invoice photo, extract supplier name, amount, and date, then match it to a Xero bank transaction. This is the multimodal reconciliation tool.",
            "parameters": {
                "type": "object",
                "properties": {
                    "receipt_image_path": {
                        "type": "string",
                        "description": "File path to the receipt image",
                    },
                    "transaction_reference": {
                        "type": "string",
                        "description": "Optional transaction reference to narrow the match",
                    },
                },
                "required": ["receipt_image_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_journal_entry",
            "description": "Propose a journal entry to fix a discrepancy. Requires debit and credit account codes and an amount. The entry must balance (debit = credit). The proposal is shown to the user as a card with an Approve button — posting to Xero happens ONLY through that button, never through you.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "Description of what the journal entry is for",
                    },
                    "debit_account_code": {
                        "type": "string",
                        "description": "The account code to debit (from the chart of accounts)",
                    },
                    "credit_account_code": {
                        "type": "string",
                        "description": "The account code to credit (from the chart of accounts)",
                    },
                    "amount": {
                        "type": "number",
                        "description": "The amount in the organisation's base currency",
                    },
                },
                "required": ["description", "debit_account_code", "credit_account_code", "amount"],
            },
        },
    },
    # NOTE: create_journal_entry is deliberately NOT exposed to the
    # LLM. Posting to Xero is a real-money write; the only path is the
    # /api/xero/journal endpoint behind the Approve button, so a model
    # that misreads "sounds right" as approval can never move money.
    {
        "type": "function",
        "function": {
            "name": "get_tax_insights",
            "description": "Analyze expenses for tax optimization — estimates UK Corporation Tax, flags non-deductible expenses (client entertainment), identifies missed deductions (software/subscriptions), and checks cash flow impact of overdue invoices. Call this when the user asks about tax, deductions, or HMRC.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_tax_rule",
            "description": "Look up a tax rule by natural language query. Returns the relevant tax rule text with source citation from the user's regional tax authority (HMRC for UK, ATO for Australia, IRS for US). Use this to cite official guidance when answering tax questions about deductibility, tax rates, VAT/GST/sales tax, mileage, capital allowances, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The tax question or topic to look up (e.g. 'client entertainment deductibility', 'corporation tax rate', 'mileage allowance')",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "draft_invoice_reminder",
            "description": "Draft a reminder email for an overdue invoice using Chris Voss negotiation principles. The tone escalates based on days overdue (friendly → firm → final notice with late payment interest → debt collection). Returns a structured email with the negotiation tactic, situation analysis, and psychology. Use this when the user wants to chase an overdue invoice or asks for help collecting payments.",
            "parameters": {
                "type": "object",
                "properties": {
                    "invoice_id": {
                        "type": "string",
                        "description": "The Xero invoice ID (optional if other fields are provided)",
                    },
                    "contact_name": {
                        "type": "string",
                        "description": "The customer name to address the email to",
                    },
                    "contact_email": {
                        "type": "string",
                        "description": "The customer's email address. If omitted, the tool will look it up from contacts.",
                    },
                    "amount": {"type": "number", "description": "The invoice amount due in pounds"},
                    "invoice_number": {
                        "type": "string",
                        "description": "The invoice number/reference",
                    },
                    "days_overdue": {
                        "type": "integer",
                        "description": "How many days past the due date",
                    },
                    "tone": {
                        "type": "string",
                        "description": "Override tone: 'friendly', 'firm', 'final', or 'collection'. If omitted, tone is determined by days_overdue.",
                    },
                    "negotiation_tactic": {
                        "type": "string",
                        "description": "Override negotiation tactic: 'mirror', 'calibrated_question', 'label', 'no_oriented', or 'accusation_audit'. If omitted, tactic is selected based on days_overdue.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_savings_opportunities",
            "description": "Analyze the P&L and transactions to identify savings opportunities: unused software subscriptions, high expense ratios, top expense categories, margin analysis, and uncollected revenue. Returns a ranked list of savings opportunities. Use this when the user asks about savings, margins, cost cutting, or improving profitability.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sector_benchmarks",
            "description": "Compare the user's receivables days, overdue rate, and average invoice value against typical UK ranges for their sector (curated from ONS/DBT small-business publications — indicative, not live statistics; the tool labels its sources honestly). Uses the sector the user set during onboarding when available; otherwise guesses from the org name and says so. Use when the user asks 'is this normal', 'how do I compare', or about industry benchmarks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sector": {
                        "type": "string",
                        "description": "Sector to compare against: 'retail', 'construction', 'professional_services', 'hospitality', 'manufacturing', 'wholesale'. If omitted, auto-detects from org name.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "score_customers",
            "description": "Analyze each customer's payment history and assign a reliability score (RED/AMBER/GREEN). Calculates on-time rate, average days late, total revenue, chasing cost, interest lost, and identifies 'firing candidates' — customers whose cost-to-serve exceeds 10% of their revenue. Use when the user asks about customer quality, who their worst customers are, or whether to drop a customer.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chasing_strategy",
            "description": "Generate a multi-stage chasing strategy (4 stages) for overdue invoices using Chris Voss negotiation tactics. Shows which stage the customer is currently at, what tactic to use, and what to do next. Use when the user wants a full chasing plan rather than a single email, or asks 'what should I do about this overdue invoice'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "contact_name": {
                        "type": "string",
                        "description": "Customer name to build a strategy for. If omitted, builds strategies for all overdue customers.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_trend_analysis",
            "description": "Analyze financial metric trends over time using stored snapshots. Shows whether receivables, overdue rate, and margin are improving or worsening. Captures a new snapshot automatically (one per day per session). Use when the user asks about trends, progress, whether things are getting better/worse, or 'how am I doing over time'.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# Map tool names to actual Python functions
_TOOL_FUNCS = {
    "find_discrepancies": find_discrepancies,
    "get_receivables_aging": get_receivables_aging,
    "get_organisation": get_organisation,
    "get_bank_transactions": get_bank_transactions,
    "get_invoices": get_invoices,
    "get_chart_of_accounts": get_chart_of_accounts,
    "get_profit_and_loss": get_profit_and_loss,
    "get_balance_sheet": get_balance_sheet,
    "get_contacts": get_contacts,
    "match_receipt_to_transaction": match_receipt_to_transaction,
    "propose_journal_entry": propose_journal_entry,
    "get_tax_insights": get_tax_insights,
    "lookup_tax_rule": lookup_tax_rule,
    "draft_invoice_reminder": draft_invoice_reminder,
    "get_savings_opportunities": get_savings_opportunities,
    "get_sector_benchmarks": get_sector_benchmarks,
    "score_customers": score_customers,
    "get_chasing_strategy": get_chasing_strategy,
    "get_trend_analysis": get_trend_analysis,
}


def _execute_tool(name: str, arguments: dict[str, Any], session_id: str = "default") -> str:
    """Execute a tool function and return its string result.

    Runs synchronously — callers offload it with asyncio.to_thread so
    Xero subprocess/HTTP calls never block the event loop.
    """
    func = _TOOL_FUNCS.get(name)
    if func is None:
        return f"Error: Unknown tool '{name}'"
    set_current_session(session_id)
    try:
        result = func(**arguments)
        return result if isinstance(result, str) else json.dumps(result, default=str)
    except Exception as exc:  # noqa: BLE001
        log.error("tool_execution_error", extra={"tool": name, "error": str(exc)}, exc_info=True)
        return f"Error calling {name}: {exc}"
