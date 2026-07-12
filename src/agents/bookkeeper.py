"""
Bookkeeper Agent — Sikizana's AI finance assistant for Xero.

Uses NVIDIA NIM (OpenAI-compatible API) with function calling to reason
over live Xero data. The reasoning loop: gather evidence → analyse →
propose a fix → await approval.

The agent calls Xero tools (reconciliation, P&L, invoices, tax, etc.) via
OpenAI-style function calling. The NVIDIA API handles the tool-call
orchestration; we execute the actual Python functions and feed results
back.
"""

import asyncio
import json
import os
from typing import Any

from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

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
    set_current_session,
)
from src.tools.rag_engine import lookup_tax_rule, set_current_region
from src.services.logging import get_logger

log = get_logger("sikizana.bookkeeper")

# NVIDIA NIM API (OpenAI-compatible) — primary inference provider.
# Multi-model fallback chain (all on NVIDIA NIM, fast failover):
#   1. llama-3.1-70b  — proven tool calling, ~2s response
#   2. qwen3-next-80b — MoE (80B total, 3B active), ~0.8s response
# Then Venice as a cross-provider last resort.
_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
_NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct")
_NVIDIA_FALLBACK_MODEL = os.environ.get("NVIDIA_FALLBACK_MODEL", "qwen/qwen3-next-80b-a3b-instruct")
_NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

# Venice AI — cross-provider fallback when NVIDIA is down entirely.
# OpenAI-compatible API, so the same tool-calling loop works unchanged.
_VENICE_BASE_URL = "https://api.venice.ai/api/v1"
_VENICE_MODEL = os.environ.get("VENICE_MODEL", "llama-3.3-70b")
_VENICE_API_KEY = os.environ.get("VENICE_API_KEY", "")

_client: AsyncOpenAI | None = None
_venice_client: AsyncOpenAI | None = None

# Conversations are keyed by "{session_id}:{thread_id}" so one visitor's
# chat can never bleed into another's, and stored in SQLite so they
# survive restarts and are shared across uvicorn workers.
_HISTORY_LIMIT = 20  # messages kept per thread (token-overflow guard)


def _conversation_key(session_id: str, thread_id: str | None) -> str:
    return f"{session_id}:{thread_id or 'default'}"


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=_NVIDIA_BASE_URL,
            api_key=_NVIDIA_API_KEY,
        )
    return _client


def _get_venice_client() -> AsyncOpenAI:
    """Venice AI client — cross-provider fallback when NVIDIA is unreachable."""
    global _venice_client
    if _venice_client is None:
        _venice_client = AsyncOpenAI(
            base_url=_VENICE_BASE_URL,
            api_key=_VENICE_API_KEY,
        )
    return _venice_client


def _venice_available() -> bool:
    return bool(_VENICE_API_KEY)


_PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")


def _load_prompt(persona: str = "siki") -> str:
    """Load the system prompt for the given persona ('siki' or 'zana')."""
    prompt_file = "zana.txt" if persona == "zana" else "bookkeeper.txt"
    with open(os.path.join(_PROMPTS_DIR, prompt_file), "r") as f:
        return f.read()


# ---- Contextual status messages ----
# Lightweight keyword matching to give the user immediate feedback
# that their question was understood, before the LLM responds.

_STATUS_PATTERNS: list[tuple[list[str], str]] = [
    (
        ["overview", "summary", "quick look", "how are things", "how's my business"],
        "Pulling together your business overview…",
    ),
    (
        ["profit", "loss", "p&l", "pnl", "income statement", "net profit", "revenue", "profitable"],
        "Pulling your P&L report to answer that…",
    ),
    (["balance sheet", "assets", "liabilities", "equity"], "Fetching your balance sheet…"),
    (
        ["invoice", "overdue", "unpaid", "outstanding", "owed", "owes me"],
        "Checking your invoices for overdue items…",
    ),
    (
        ["reconcil", "unreconciled", "bank transaction", "matching", "match"],
        "Scanning your bank transactions for unreconciled items…",
    ),
    (
        [
            "discrepanc",
            "audit",
            "health check",
            "wrong",
            "error",
            "mistake",
            "needs attention",
            "needs fixing",
            "what needs",
        ],
        "Auditing your books for discrepancies…",
    ),
    (
        ["journal", "entry", "adjust", "correct", "fix", "approve", "post it", "create it"],
        "Preparing a journal entry to fix that…",
    ),
    (
        [
            "tax",
            "deduction",
            "deductible",
            "hmrc",
            "corporation tax",
            "ct600",
            "write off",
            "allowable",
        ],
        "Analyzing your expenses for tax insights…",
    ),
    (["cash flow", "cashflow", "liquidity", "runway"], "Checking your cash flow position…"),
    (["contact", "customer", "supplier", "vendor"], "Looking up your contacts in Xero…"),
    (["account", "chart of accounts", "ledger", "code"], "Loading your chart of accounts…"),
    (["organisation", "company", "business", "org"], "Reading your organisation details…"),
    (["receipt", "photo", "upload", "scan"], "Getting ready to read that receipt…"),
    (["hello", "hi ", "hey", "help", "what can you"], "Hi! Let me look at your books…"),
    (["thank", "cheers", "appreciate"], "You're welcome! Anything else I can check?"),
]


def _generate_status_message(user_input: str) -> str:
    """Generate a contextual status message based on keyword matching."""
    lower = user_input.lower()
    for keywords, message in _STATUS_PATTERNS:
        if any(kw in lower for kw in keywords):
            return message
    return "Looking into your books…"


def _extract_customer_names(tool_result: str) -> list[str]:
    """Extract customer/contact names from a tool result string.

    Tool results like get_invoices return lines like:
      - INV-0042 | ACCREC | Acme Ltd | £4200.00 | Due: 2024-03-01 | AUTHORISED ⚠ OVERDUE
    We extract the contact name (3rd pipe-separated field) from lines
    that contain OVERDUE.
    """
    names: list[str] = []
    for line in tool_result.split("\n"):
        if "OVERDUE" not in line:
            continue
        # Split by pipe delimiter
        parts = [p.strip() for p in line.split("|")]
        if len(parts) >= 3:
            name = parts[2]
            # Filter out empty strings and obvious non-names
            if name and len(name) > 1 and not name.startswith("£"):
                names.append(name)
    return names


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


async def run_bookkeeper(
    user_input: str,
    thread_id: str | None = None,
    persona: str = "siki",
    session_id: str = "default",
    disable_memory: bool = False,
) -> str:
    """
    Run the bookkeeper agent on user input with conversation persistence.

    Uses NVIDIA NIM with function calling. The agent can call multiple
    tools in sequence to gather evidence before responding.
    """
    events: list[dict[str, Any]] = []
    async for event in run_bookkeeper_streaming(
        user_input,
        thread_id,
        persona=persona,
        session_id=session_id,
        disable_memory=disable_memory,
    ):
        events.append(event)
    # Extract the final text from the events
    text_parts = [e["text"] for e in events if e["type"] == "text"]
    return "".join(text_parts) or "I couldn't process that request."


async def run_bookkeeper_streaming(
    user_input: str,
    thread_id: str | None = None,
    persona: str = "siki",
    session_id: str = "default",
    disable_memory: bool = False,
) -> Any:
    """
    Streaming version of run_bookkeeper.

    Yields events as they happen:
      {"type": "status", "message": "Understanding your question..."}
      {"type": "tool_call", "tool": "find_discrepancies", "args": {...}}
      {"type": "tool_result", "tool": "find_discrepancies", "result": "...", "summary": "..."}
      {"type": "text", "text": "chunk of response"}
      {"type": "done"}

    Text events are real model tokens (stream=True), not a replay — the
    first words appear as soon as the model produces them.
    """
    if not _NVIDIA_API_KEY and not _venice_available():
        yield {
            "type": "text",
            "text": "I'm not connected to an AI model yet. Set NVIDIA_API_KEY or VENICE_API_KEY in .env to enable the bookkeeper agent.",
        }
        yield {"type": "done"}
        return

    # Emit an immediate status event so the UI never appears frozen
    yield {"type": "status", "message": _generate_status_message(user_input)}

    # Detect the user's tax region from their Xero organisation's country code.
    # This routes tax queries to the correct jurisdiction (HMRC/ATO/IRS).
    # Falls back to GB if the org can't be fetched (e.g. demo mode).
    try:
        from src.services.connectors import get_connector
        _org = await asyncio.to_thread(get_connector(session_id).get_organisation)
        _country = _org.get("countryCode", "GB") if _org else "GB"
        set_current_region(_country)
    except Exception:
        set_current_region("GB")

    # If NVIDIA isn't configured but Venice is, start with Venice directly
    using_venice = not _NVIDIA_API_KEY and _venice_available()
    client = _get_venice_client() if using_venice else _get_client()

    from src.services.payment_store import load_conversation, save_conversation

    conv_key = _conversation_key(session_id, thread_id)
    history = await asyncio.to_thread(load_conversation, conv_key)

    # Detect persona switch: if the last assistant message was from a
    # different persona, inject a handoff context so the new persona
    # understands what was already discussed and by whom.
    _persona_name = "Zana" if persona == "zana" else "Siki"
    _other_persona = "Siki" if persona == "zana" else "Zana"
    _last_persona = None
    for msg in reversed(history):
        if msg.get("role") == "assistant" and msg.get("persona"):
            _last_persona = msg["persona"]
            break
    persona_switched = _last_persona and _last_persona != persona

    history.append({"role": "user", "content": user_input})

    async def _persist_history() -> None:
        if len(history) > _HISTORY_LIMIT:
            history[:] = history[-_HISTORY_LIMIT:]
        await asyncio.to_thread(save_conversation, conv_key, history)

    _system_prompt = _load_prompt(persona)
    # Append a hard guardrail that works across all models (Venice's llama
    # models in particular tend to narrate tool calls and echo raw output).
    _system_prompt += "\n\n### CRITICAL OUTPUT RULES\n- Never mention which tool you are calling or just called. The UI shows tool activity automatically.\n- Never echo raw tool output (e.g. 'UNRECONCILED BANK TRANSACTIONS (4):'). Always rephrase in natural English.\n- Never say 'This response is the result of calling...' or similar meta-commentary.\n- Your text output must be the answer itself, written as if you already know the information.\n"

    # --- Supermemory: inject recalled memory into the system prompt ---
    # When Supermemory Local is available and the user hasn't toggled memory
    # off, the agent recalls past context about this business (customer payment
    # patterns, chasing outcomes, user preferences, prior findings) instead of
    # starting from zero. If Supermemory is unset or unreachable, this entire
    # block is skipped and the agent works identically — just without memory.
    from src.services.supermemory import is_available as _sm_available, get_profile as _sm_profile, search as _sm_search
    from src.services.supermemory import memory_container_tag as _sm_container_tag
    from src.services.payment_store import get_user_for_session as _get_user

    _memory_enabled = _sm_available() and not disable_memory
    _memory_facts: list[str] = []
    _memory_sources: list[dict[str, Any]] = []
    if _memory_enabled:
        try:
            # Resolve the container tag: user-scoped if logged in, session-scoped if anonymous
            _user = await asyncio.to_thread(_get_user, session_id)
            _container = _sm_container_tag(session_id, _user["id"] if _user else None)

            _profile = await asyncio.to_thread(_sm_profile, _container, user_input)
            # Also do a hybrid search (memories + document chunks) — the
            # profile endpoint searches memories only, but the memory
            # extraction pipeline may not have processed recent ingested
            # conversations yet. Hybrid mode catches raw document chunks
            # that are indexed immediately.
            _hybrid_hits = await asyncio.to_thread(_sm_search, user_input, _container, 5, "hybrid")
            if _profile:
                _static = _profile.get("static", [])
                _dynamic = _profile.get("dynamic", [])
                _search_hits = _profile.get("search_results", [])
                _memory_parts: list[str] = []
                if _static:
                    _memory_parts.append("### WHAT YOU ALREADY KNOW ABOUT THIS BUSINESS\n" + "\n".join(f"- {s}" for s in _static))
                    _memory_facts.extend(_static)
                    _memory_sources.append({"type": "profile", "label": "Known facts", "items": _static})
                if _dynamic:
                    _memory_parts.append("### RECENT CONTEXT\n" + "\n".join(f"- {d}" for d in _dynamic))
                    _memory_facts.extend(_dynamic)
                    _memory_sources.append({"type": "profile", "label": "Recent context", "items": _dynamic})
                # Merge profile search hits and hybrid hits, deduplicate
                _all_hits = _search_hits + _hybrid_hits
                _seen = set()
                _relevant = []
                for h in _all_hits:
                    c = h.get("content", "")
                    if c and h.get("score", 0) > 0.5 and c not in _seen:
                        _seen.add(c)
                        _relevant.append(h)
                    if len(_relevant) >= 3:
                        break
                if _relevant:
                    _recall_items = [h["content"] for h in _relevant]
                    _recall_ids = [h.get("id", "") for h in _relevant]
                    _memory_parts.append("### RELEVANT PAST MEMORIES\n" + "\n".join(f"- {h['content']}" for h in _relevant))
                    _memory_facts.extend(_recall_items)
                    _memory_sources.append({
                        "type": "recall",
                        "label": "Recalled memories",
                        "items": _recall_items,
                        "ids": _recall_ids,
                    })
                if _memory_parts:
                    _system_prompt += "\n\n" + "\n\n".join(_memory_parts)
                    _system_prompt += "\n\nUse this remembered context naturally. If it contradicts live Xero data, trust Xero. Never say 'from my memory' — speak as if you remember."

            # --- Preference signals: rules learned from user actions ---
            # These are different from recalled facts — they are behaviour-shaping
            # rules (e.g. "do not propose journal entries" or "do not auto-chase
            # this customer"). They are stored when the user rejects a journal,
            # cancels a chase, etc.
            try:
                from src.services.supermemory import get_preference_signals

                _preference_signals = await asyncio.to_thread(get_preference_signals, session_id)
                if _preference_signals:
                    _preference_text = "\n".join(f"- {s.get('content', '')}" for s in _preference_signals)
                    _system_prompt += (
                        "\n\n### USER PREFERENCE SIGNALS (learned from past actions)\n"
                        f"{_preference_text}\n\n"
                        "These are rules learned from user actions. Apply them automatically. "
                        "Do not ask the user to confirm a preference that is already stored."
                    )
            except Exception:
                pass  # Preference signals are a bonus, never a failure

        except Exception:
            pass  # Memory is a bonus, never a failure

    # Emit a memory_recall event so the UI can show what Siki remembered.
    # This makes the invisible memory layer visible to the user and judges.
    if _memory_facts:
        yield {
            "type": "memory_recall",
            "facts": _memory_facts,
            "sources": _memory_sources,
        }

    # --- User profile: personalize the agent's context ---
    # The user's name, business name, industry, and timezone are injected
    # so the agent addresses them personally and adapts its language.
    from src.services.accounts import get_profile_for_agent as _get_profile

    _profile = await asyncio.to_thread(_get_profile, session_id)
    if _profile:
        _profile_parts: list[str] = []
        _name = _profile.get("name")
        _business = _profile.get("business_name")
        _industry = _profile.get("industry")
        _tz = _profile.get("timezone")
        _lang = _profile.get("language")

        if _name or _business:
            _who = []
            if _name:
                _who.append(_name)
            if _business:
                _who.append(f"runs {_business}")
            _profile_parts.append(f"You are talking to {' '.join(_who)}.")
        if _industry:
            _profile_parts.append(f"Their industry is {_industry}. Use industry-appropriate language and examples.")
        if _tz:
            _profile_parts.append(f"Their timezone is {_tz}. Use it for any time references.")
        if _lang and _lang != "en":
            _profile_parts.append(f"Their preferred language is {_lang}. If you can, respond in that language.")

        if _profile_parts:
            _system_prompt += "\n\n### USER CONTEXT\n" + "\n".join(f"- {p}" for p in _profile_parts)
            _system_prompt += "\n\nUse this context naturally. Address the user by name when greeting. Reference their business and industry where relevant. Never say 'according to your profile' — speak as if you already know."

    # If the persona switched, inject a handoff system message so the new
    # persona knows the conversation context and who said what.
    if persona_switched:
        _system_prompt += (
            f"\n\n### CONTEXT HANDOFF\n"
            f"You are {_persona_name}, taking over from {_other_persona} in the same conversation. "
            f"The message history below contains responses from {_other_persona} — read them to "
            f"understand what has already been discussed, but respond in YOUR own voice as "
            f"{_persona_name}. Do not reference the handoff or mention {_other_persona} unless "
            f"the user asks. Pick up where the conversation left off naturally.\n"
        )

    # Behavioral directive: if a memory contains a policy for a customer or
    # a business rule, apply it. The user is treating Supermemory as
    # infrastructure, not just a fact dump.
    _system_prompt += (
        "\n\n### MEMORY POLICY DIRECTIVE\n"
        "If a recalled memory contains a policy or rule (e.g. 'for Catering Co Ltd, approve a 4-stage chase at 30 days overdue'), "
        "apply that policy immediately by calling the appropriate tool. "
        "Do not ask the user to confirm the policy itself. "
        "Only ask for final approval if the action is irreversible (posting a journal, starting a chase)."
    )

    messages = [{"role": "system", "content": _system_prompt}] + history

    # Human-readable tool name mapping
    tool_labels = {
        "find_discrepancies": "Auditing books for discrepancies",
        "get_receivables_aging": "Building aged receivables report",
        "get_organisation": "Reading organisation details",
        "get_bank_transactions": "Fetching bank transactions",
        "get_invoices": "Fetching invoices",
        "get_chart_of_accounts": "Loading chart of accounts",
        "get_profit_and_loss": "Pulling P&L report",
        "get_balance_sheet": "Pulling balance sheet",
        "get_contacts": "Searching contacts",
        "match_receipt_to_transaction": "Reading receipt with vision AI",
        "propose_journal_entry": "Preparing journal entry",
        "create_journal_entry": "Posting journal entry to Xero",
        "get_tax_insights": "Analyzing tax insights",
        "lookup_tax_rule": "Looking up HMRC tax rules",
        "draft_invoice_reminder": "Drafting invoice reminder email",
        "get_savings_opportunities": "Finding savings opportunities",
        "get_sector_benchmarks": "Comparing against sector benchmarks",
        "score_customers": "Scoring customer payment reliability",
        "get_chasing_strategy": "Building chasing strategy",
        "get_trend_analysis": "Analyzing metric trends",
    }

    # Agent loop: stream the model, execute tools, feed results back.
    # Provider fallback chain: NVIDIA (primary + fallback model) → Venice.
    # Enough headroom for gather→chart-of-accounts→propose chains (retries
    # also consume iterations)
    max_iterations = 8
    current_model = _NVIDIA_MODEL
    retried = False
    # Track tool calls to detect and break duplicate-call loops
    tool_call_history: list[tuple[str, str]] = []
    for iteration in range(max_iterations):
        active_client = _get_venice_client() if using_venice else client
        active_model = _VENICE_MODEL if using_venice else current_model
        try:
            stream = await asyncio.wait_for(
                active_client.chat.completions.create(
                    model=active_model,
                    messages=messages,
                    tools=_TOOL_DEFS,
                    temperature=0.3,
                    max_tokens=2000,
                    stream=True,
                ),
                timeout=15.0,
            )
        except asyncio.TimeoutError:
            log.error("inference_timeout", extra={"iteration": iteration, "model": active_model, "provider": "venice" if using_venice else "nvidia"})
            if not retried and not using_venice:
                retried = True
                if current_model != _NVIDIA_FALLBACK_MODEL:
                    current_model = _NVIDIA_FALLBACK_MODEL
                    yield {"type": "status", "message": "Switching to a faster model…"}
                else:
                    yield {"type": "status", "message": "Taking a moment — retrying…"}
                continue
            # NVIDIA exhausted — try Venice if available
            if not using_venice and _venice_available():
                using_venice = True
                retried = False
                log.warning("nvidia_timeout_fallback_to_venice")
                yield {"type": "status", "message": "Switching to backup AI provider…"}
                continue
            yield {
                "type": "text",
                "text": "I'm taking longer than expected to reach the AI model. Please try again in a moment.",
            }
            yield {"type": "done"}
            return
        except Exception as exc:
            # Log the raw error; never leak provider internals to the user
            log.error(
                "inference_error", extra={"error": str(exc), "iteration": iteration, "provider": "venice" if using_venice else "nvidia"}, exc_info=True
            )
            # NVIDIA error — try Venice if available
            if not using_venice and _venice_available():
                using_venice = True
                retried = False
                log.warning("nvidia_error_fallback_to_venice", extra={"error": str(exc)})
                yield {"type": "status", "message": "Switching to backup AI provider…"}
                continue
            yield {
                "type": "text",
                "text": "I'm having trouble reaching the AI model right now. Please try again in a moment.",
            }
            yield {"type": "done"}
            return

        # Consume the stream: yield text tokens live, assemble tool-call deltas
        streamed_text: list[str] = []
        pending_tools: dict[int, dict[str, Any]] = {}
        stream_failed = False
        try:
            async for chunk in _iter_with_timeout(
                stream,
                first_chunk_timeout=60.0,
                subsequent_chunk_timeout=15.0,
            ):
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta is None:
                    continue
                if delta.content:
                    streamed_text.append(delta.content)
                    yield {"type": "text", "text": delta.content}
                for tc in delta.tool_calls or []:
                    slot = pending_tools.setdefault(
                        tc.index, {"id": "", "name": "", "arguments": ""}
                    )
                    if tc.id:
                        slot["id"] = tc.id
                    if tc.function and tc.function.name:
                        slot["name"] = tc.function.name
                    if tc.function and tc.function.arguments:
                        slot["arguments"] += tc.function.arguments
        except Exception as exc:  # noqa: BLE001 — includes per-chunk timeout
            log.error(
                "stream_error",
                extra={"error": str(exc), "iteration": iteration, "provider": "venice" if using_venice else "nvidia"},
                exc_info=True,
            )
            stream_failed = True

        if stream_failed:
            # If we already have tool results in the message history but no
            # streamed text, the model gathered data but stalled generating
            # the response. Retry once instead of giving up.
            has_tool_results = any(m.get("role") == "tool" for m in messages)
            if not streamed_text and has_tool_results and iteration < max_iterations - 1:
                log.info("stream_retry_after_tool_results", extra={"iteration": iteration})
                yield {"type": "status", "message": "Composing your answer…"}
                continue
            if streamed_text:
                # Partial answer already reached the user — close it honestly
                partial = "".join(streamed_text)
                history.append({"role": "assistant", "content": partial, "persona": persona})
                await _persist_history()
                yield {
                    "type": "text",
                    "text": "\n\n(The connection dropped mid-answer — ask me to continue if I was cut off.)",
                }
            else:
                yield {
                    "type": "text",
                    "text": "I'm having trouble reaching the AI model right now. Please try again in a moment.",
                }
            yield {"type": "done"}
            return

        # If the model wants to call tools
        if pending_tools:
            ordered = [pending_tools[i] for i in sorted(pending_tools)]
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": "".join(streamed_text),
                "tool_calls": [
                    {
                        "id": t["id"] or f"call_{i}",
                        "type": "function",
                        "function": {"name": t["name"], "arguments": t["arguments"]},
                    }
                    for i, t in enumerate(ordered)
                ],
            }
            messages.append(assistant_msg)

            # Execute each tool call
            for i, t in enumerate(ordered):
                tool_name = t["name"]
                tool_call_id = t["id"] or f"call_{i}"
                try:
                    tool_args = json.loads(t["arguments"]) if t["arguments"] else {}
                except json.JSONDecodeError:
                    tool_args = {}

                # Loop detection: if the model calls the same tool with the
                # same args twice, don't re-execute — inject a nudge to use
                # the result it already has.
                call_sig = (tool_name, json.dumps(tool_args, sort_keys=True))
                if call_sig in tool_call_history:
                    log.warning("duplicate_tool_call", extra={"tool": tool_name, "iteration": iteration})
                    result = (
                        f"You already called {tool_name} with these arguments and received the result. "
                        "Use that result to answer the user's question. Do not call the same tool again."
                    )
                    yield {
                        "type": "tool_call",
                        "tool": tool_name,
                        "label": tool_labels.get(tool_name, tool_name),
                        "args": tool_args,
                    }
                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "label": tool_labels.get(tool_name, tool_name),
                        "summary": "Already called — using previous result",
                    }
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": result,
                        }
                    )
                    continue

                tool_call_history.append(call_sig)

                # Hard guard: the write-back tool is not in _TOOL_DEFS, but a
                # model can still hallucinate a call to it (or replay one from
                # an old conversation). Never execute it — posting to Xero
                # only happens via the Approve button's endpoint.
                if tool_name == "create_journal_entry":
                    result = (
                        "BLOCKED: You cannot post journal entries to Xero. The entry you proposed "
                        "is shown to the user as a card with an Approve button — posting happens "
                        "only when the user clicks Approve. Tell the user to review the card and "
                        "approve it there if they're happy with it."
                    )
                    yield {
                        "type": "tool_call",
                        "tool": tool_name,
                        "label": tool_labels.get(tool_name, tool_name),
                        "args": tool_args,
                    }
                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "label": tool_labels.get(tool_name, tool_name),
                        "summary": "Blocked — posting happens via the Approve button",
                    }
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": result,
                        }
                    )
                    continue

                # Stream the tool call event
                yield {
                    "type": "tool_call",
                    "tool": tool_name,
                    "label": tool_labels.get(tool_name, tool_name),
                    "args": tool_args,
                }

                log.info("tool_called", extra={"tool": tool_name, "tool_args": tool_args})
                # Off the event loop: tools shell out to the Xero CLI or make
                # HTTP calls, and must not freeze other requests' streams
                result = await asyncio.to_thread(_execute_tool, tool_name, tool_args, session_id)
                log.info("tool_result", extra={"tool": tool_name, "result_len": len(result)})

                # Extract structured ANALYSIS_DATA block before feeding to LLM.
                # The LLM is unreliable at passing structured blocks through
                # verbatim, so we emit the card data as a separate event and
                # strip the block from the tool result the LLM sees.
                result, card_data = _extract_analysis_data(result)
                if card_data:
                    yield {"type": "analysis_card", "data": card_data}

                # Stream the tool result event
                yield {
                    "type": "tool_result",
                    "tool": tool_name,
                    "label": tool_labels.get(tool_name, tool_name),
                    "summary": _summarize_tool_result(tool_name, result),
                }

                # --- Proactive memory alert ---
                # When a tool returns overdue invoice data, search Supermemory
                # for past context about the customers mentioned. If memories
                # are found, inject them as a system hint so the agent can
                # proactively reference past outcomes — "Acme was late last
                # time too, you sent a final notice and they paid in 5 days."
                if tool_name in ("get_invoices", "find_discrepancies", "score_customers") and "OVERDUE" in result:
                    try:
                        from src.services.supermemory import is_available as _sm_avail, search as _sm_search
                        from src.services.supermemory import memory_container_tag as _sm_ct
                        from src.services.payment_store import get_user_for_session as _get_user3

                        if _sm_avail() and not disable_memory:
                            # Resolve container tag (user-scoped if logged in)
                            _user3 = _get_user3(session_id)
                            _ct = _sm_ct(session_id, _user3["id"] if _user3 else None)
                            # Extract customer names from the tool result
                            _customer_names = _extract_customer_names(result)
                            _proactive_hits: list[dict[str, Any]] = []
                            _proactive_seen: set[str] = set()
                            for _cname in _customer_names[:3]:  # limit to 3 customers
                                _hits = await asyncio.to_thread(_sm_search, _cname, _ct, 2, "hybrid")
                                for _h in _hits:
                                    _c = _h.get("content", "")
                                    if _h.get("score", 0) > 0.5 and _c and _c not in _proactive_seen:
                                        _proactive_seen.add(_c)
                                        _proactive_hits.append(_h)

                            if _proactive_hits:
                                _proactive_facts = [h["content"] for h in _proactive_hits[:3]]
                                _proactive_ids = [h.get("id", "") for h in _proactive_hits[:3]]
                                _proactive_text = "\n".join(f"- {f}" for f in _proactive_facts)
                                messages.append(
                                    {
                                        "role": "system",
                                        "content": f"### PROACTIVE MEMORY ALERT\nYou have past memories about these overdue customers:\n{_proactive_text}\n\nIf a memory contains a chase policy, APPLY IT: call the right tool to draft the next chasing message for the right stage. Do not ask the user to confirm the policy itself. If the memory contradicts live data, trust the live data.",
                                    }
                                )
                                # Also emit a memory_recall event so the UI shows the alert
                                yield {
                                    "type": "memory_recall",
                                    "facts": _proactive_facts,
                                    "sources": [{"type": "recall", "label": "Proactive memory alert", "items": _proactive_facts, "ids": _proactive_ids}],
                                }
                    except Exception:
                        pass  # Proactive alerts are a bonus, never a failure

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call_id,
                        "content": result,
                    }
                )

            # Continue the loop — the model will process tool results
            continue

        # No tool calls — the streamed text is the final response
        final_text = "".join(streamed_text)
        if not final_text:
            final_text = "I couldn't process that request."
            yield {"type": "text", "text": final_text}

        # Save to conversation history (tag with persona for handoff detection)
        history.append({"role": "assistant", "content": final_text, "persona": persona})
        await _persist_history()

        # --- Supermemory: ingest conversation for future recall ---
        # Fire-and-forget — never block the response on memory ingestion.
        # The conversation will be available for recall in future sessions.
        from src.services.supermemory import is_available as _sm_available2, ingest_conversation as _sm_ingest
        from src.services.supermemory import memory_container_tag as _sm_container_tag2
        from src.services.payment_store import get_user_for_session as _get_user2

        if _sm_available2() and not disable_memory:
            _user2 = _get_user2(session_id)
            _container2 = _sm_container_tag2(session_id, _user2["id"] if _user2 else None)
            asyncio.create_task(asyncio.to_thread(_sm_ingest, history, _container2, conv_key))

        yield {"type": "done"}
        return

    # If we hit max iterations, return what we have
    fallback = "I've gathered the information from your books but need more context. Could you rephrase your question?"
    history.append({"role": "assistant", "content": fallback, "persona": persona})
    await _persist_history()
    yield {"type": "text", "text": fallback}
    yield {"type": "done"}


def _extract_analysis_data(result: str) -> tuple[str, dict | None]:
    """
    Extract an ANALYSIS_DATA block from a tool result.

    Returns (cleaned_result, parsed_json or None).
    The cleaned result has the block stripped so the LLM never sees it —
    the LLM doesn't need to pass it through, which is unreliable.
    The structured data is emitted as a separate event to the frontend.
    """
    marker = "ANALYSIS_DATA"
    end_marker = "END_ANALYSIS_DATA"
    start = result.find(marker)
    if start == -1:
        return result, None
    end = result.find(end_marker, start)
    if end == -1:
        return result, None
    json_str = result[start + len(marker) : end].strip()
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        return result, None
    # Strip the block (and surrounding whitespace) from the result
    cleaned = (result[:start] + result[end + len(end_marker) :]).rstrip()
    return cleaned, data


async def _iter_with_timeout(
    stream: Any,
    first_chunk_timeout: float = 60.0,
    subsequent_chunk_timeout: float = 15.0,
):
    """Iterate an async stream with a two-tier timeout.

    The first chunk (time-to-first-token) gets a longer budget because the
    model needs to process the full context before generating anything.
    Subsequent chunks (inter-token latency) get a shorter budget — if the
    stream stalls mid-response, something is wrong.
    """
    it = stream.__aiter__()
    is_first = True
    while True:
        timeout = first_chunk_timeout if is_first else subsequent_chunk_timeout
        try:
            chunk = await asyncio.wait_for(it.__anext__(), timeout=timeout)
        except StopAsyncIteration:
            return
        is_first = False
        yield chunk


def _summarize_tool_result(tool_name: str, result: str) -> str:
    """Create a short human-readable summary of a tool result for the UI."""
    if len(result) < 80:
        return result
    # Tool-specific summaries
    if tool_name == "find_discrepancies":
        if "UNRECONCILED" in result:
            lines = result.split("\n")
            unrec_line = next((ln for ln in lines if "UNRECONCILED" in ln), "")
            overdue_line = next((ln for ln in lines if "OVERDUE" in ln), "")
            parts = []
            if unrec_line:
                parts.append(unrec_line.strip())
            if overdue_line:
                parts.append(overdue_line.strip())
            return " · ".join(parts) if parts else result[:80]
        return result[:80]
    elif tool_name == "get_profit_and_loss":
        # Extract key numbers
        for line in result.split("\n"):
            if "Net Profit" in line or "Revenue" in line or "Total Income" in line:
                return line.strip()
        return result[:80]
    elif tool_name == "get_balance_sheet":
        for line in result.split("\n"):
            if "Total" in line:
                return line.strip()
        return result[:80]
    elif tool_name == "get_bank_transactions":
        if "Found" in result:
            return result.split("\n")[0].strip()
        return result[:80]
    elif tool_name == "get_invoices":
        if "Found" in result:
            return result.split("\n")[0].strip()
        return result[:80]
    elif tool_name == "get_chart_of_accounts":
        if "Chart of Accounts" in result:
            return result.split("\n")[0].strip()
        return result[:80]
    elif tool_name == "get_contacts":
        if "Found" in result:
            return result.split("\n")[0].strip()
        return result[:80]
    elif tool_name == "propose_journal_entry":
        return "Journal entry prepared — awaiting approval"
    elif tool_name == "create_journal_entry":
        if "✓" in result:
            return "Journal entry posted to Xero ✓"
        return result[:80]
    elif tool_name == "get_tax_insights":
        # Extract the tax estimate line
        for line in result.split("\n"):
            if "Estimated Tax" in line or "Corporation Tax" in line:
                return line.strip()
        return "Tax insights generated"
    elif tool_name == "match_receipt_to_transaction":
        return "Receipt analyzed and matched"
    return result[:80]


if __name__ == "__main__":

    async def test():
        ans = await run_bookkeeper("Can you check my books and see if everything is reconciled?")
        print(f"Agent response: {ans}")

    asyncio.run(test())
