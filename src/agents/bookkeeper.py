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
from collections import OrderedDict
from typing import Any

from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

from src.tools.xero_tools import (
    create_xero_journal_entry,
    draft_invoice_reminder,
    find_discrepancies,
    get_savings_opportunities,
    get_tax_insights,
    get_xero_balance_sheet,
    get_xero_chart_of_accounts,
    get_xero_contacts,
    get_xero_invoices,
    get_xero_organisation,
    get_xero_profit_and_loss,
    get_xero_transactions,
    match_receipt_to_transaction,
    propose_journal_entry,
    set_current_session,
)
from src.tools.rag_engine import lookup_tax_rule
from src.services.logging import get_logger

log = get_logger("sikizana.bookkeeper")

# NVIDIA NIM API (OpenAI-compatible)
_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
# Primary model for tool-calling; fallback if it times out
_NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct")
_NVIDIA_FALLBACK_MODEL = os.environ.get("NVIDIA_FALLBACK_MODEL", "meta/llama-3.1-8b-instruct")
_NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

_client: AsyncOpenAI | None = None

# Conversations keyed by "{session_id}:{thread_id}" so one visitor's chat
# can never bleed into another's. LRU-evicted so memory stays bounded.
_MAX_CONVERSATIONS = 200
_conversations: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()


def _get_conversation(session_id: str, thread_id: str | None) -> list[dict[str, Any]]:
    key = f"{session_id}:{thread_id or 'default'}"
    if key not in _conversations:
        _conversations[key] = []
    _conversations.move_to_end(key)
    while len(_conversations) > _MAX_CONVERSATIONS:
        _conversations.popitem(last=False)
    return _conversations[key]


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=_NVIDIA_BASE_URL,
            api_key=_NVIDIA_API_KEY,
        )
    return _client


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
            "name": "get_xero_organisation",
            "description": "Get the connected Xero organisation's details (name, currency, country, tax number).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_xero_transactions",
            "description": "List bank transactions from Xero. Returns date, contact, amount, reference, and reconciliation status for each.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_xero_invoices",
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
            "name": "get_xero_chart_of_accounts",
            "description": "List the chart of accounts from Xero — account codes, names, and types. Useful for proposing journal entries.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_xero_profit_and_loss",
            "description": "Get the profit and loss report from Xero. Returns revenue, expenses, and net profit for the current period.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_xero_balance_sheet",
            "description": "Get the balance sheet report from Xero. Returns total assets, liabilities, and equity.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_xero_contacts",
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
            "description": "Propose a journal entry to fix a discrepancy. Requires debit and credit account codes and an amount. The entry must balance (debit = credit). Returns the proposed entry for user approval.",
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
    {
        "type": "function",
        "function": {
            "name": "create_xero_journal_entry",
            "description": "Create and post a manual journal entry directly to Xero. This is the WRITE-BACK action — only call this AFTER the user has approved a proposed journal entry. Requires the same parameters as propose_journal_entry.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "Description of what the journal entry is for",
                    },
                    "debit_account_code": {
                        "type": "string",
                        "description": "The account code to debit",
                    },
                    "credit_account_code": {
                        "type": "string",
                        "description": "The account code to credit",
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
            "description": "Look up an HMRC tax rule by keyword. Returns the relevant UK tax rule text with source citation (e.g. HMRC BIM45010). Use this to cite official guidance when answering tax questions about deductibility, Corporation Tax rates, VAT, mileage, capital allowances, etc.",
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
            "description": "Draft a reminder email for an overdue invoice. The tone escalates based on days overdue (friendly → firm → final notice with late payment interest → debt collection). Returns the drafted email text for the user to review and send. Use this when the user wants to chase an overdue invoice or asks for help collecting payments.",
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
]

# Map tool names to actual Python functions
_TOOL_FUNCS = {
    "find_discrepancies": find_discrepancies,
    "get_xero_organisation": get_xero_organisation,
    "get_xero_transactions": get_xero_transactions,
    "get_xero_invoices": get_xero_invoices,
    "get_xero_chart_of_accounts": get_xero_chart_of_accounts,
    "get_xero_profit_and_loss": get_xero_profit_and_loss,
    "get_xero_balance_sheet": get_xero_balance_sheet,
    "get_xero_contacts": get_xero_contacts,
    "match_receipt_to_transaction": match_receipt_to_transaction,
    "propose_journal_entry": propose_journal_entry,
    "create_xero_journal_entry": create_xero_journal_entry,
    "get_tax_insights": get_tax_insights,
    "lookup_tax_rule": lookup_tax_rule,
    "draft_invoice_reminder": draft_invoice_reminder,
    "get_savings_opportunities": get_savings_opportunities,
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
) -> str:
    """
    Run the bookkeeper agent on user input with conversation persistence.

    Uses NVIDIA NIM with function calling. The agent can call multiple
    tools in sequence to gather evidence before responding.
    """
    events: list[dict[str, Any]] = []
    async for event in run_bookkeeper_streaming(
        user_input, thread_id, persona=persona, session_id=session_id
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
    if not _NVIDIA_API_KEY:
        yield {
            "type": "text",
            "text": "I'm not connected to an AI model yet. Set NVIDIA_API_KEY in .env to enable the bookkeeper agent.",
        }
        yield {"type": "done"}
        return

    # Emit an immediate status event so the UI never appears frozen
    yield {"type": "status", "message": _generate_status_message(user_input)}

    client = _get_client()

    history = _get_conversation(session_id, thread_id)
    history.append({"role": "user", "content": user_input})

    messages = [{"role": "system", "content": _load_prompt(persona)}] + history

    # Human-readable tool name mapping
    tool_labels = {
        "find_discrepancies": "Auditing books for discrepancies",
        "get_xero_organisation": "Reading organisation details",
        "get_xero_transactions": "Fetching bank transactions",
        "get_xero_invoices": "Fetching invoices",
        "get_xero_chart_of_accounts": "Loading chart of accounts",
        "get_xero_profit_and_loss": "Pulling P&L report",
        "get_xero_balance_sheet": "Pulling balance sheet",
        "get_xero_contacts": "Searching contacts",
        "match_receipt_to_transaction": "Reading receipt with vision AI",
        "propose_journal_entry": "Preparing journal entry",
        "create_xero_journal_entry": "Posting journal entry to Xero",
        "get_tax_insights": "Analyzing tax insights",
        "lookup_tax_rule": "Looking up HMRC tax rules",
        "draft_invoice_reminder": "Drafting invoice reminder email",
        "get_savings_opportunities": "Finding savings opportunities",
    }

    # Agent loop: stream the model, execute tools, feed results back
    max_iterations = 5
    current_model = _NVIDIA_MODEL
    retried = False
    for iteration in range(max_iterations):
        try:
            stream = await asyncio.wait_for(
                client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    tools=_TOOL_DEFS,
                    temperature=0.3,
                    max_tokens=2000,
                    stream=True,
                ),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            log.error("nvidia_api_timeout", extra={"iteration": iteration, "model": current_model})
            # One retry before giving up — on the fallback model if one is configured
            if not retried:
                retried = True
                if current_model != _NVIDIA_FALLBACK_MODEL:
                    current_model = _NVIDIA_FALLBACK_MODEL
                    yield {"type": "status", "message": "Switching to a faster model…"}
                else:
                    yield {"type": "status", "message": "Taking a moment — retrying…"}
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
                "nvidia_api_error", extra={"error": str(exc), "iteration": iteration}, exc_info=True
            )
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
            async for chunk in _iter_with_timeout(stream, per_chunk_timeout=60.0):
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
                "nvidia_stream_error",
                extra={"error": str(exc), "iteration": iteration},
                exc_info=True,
            )
            stream_failed = True

        if stream_failed:
            if streamed_text:
                # Partial answer already reached the user — close it honestly
                partial = "".join(streamed_text)
                history.append({"role": "assistant", "content": partial})
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
            proposed_this_turn = False
            for i, t in enumerate(ordered):
                tool_name = t["name"]
                tool_call_id = t["id"] or f"call_{i}"
                try:
                    tool_args = json.loads(t["arguments"]) if t["arguments"] else {}
                except json.JSONDecodeError:
                    tool_args = {}

                # Safety: block create_xero_journal_entry if proposed in same turn
                if tool_name == "create_xero_journal_entry" and proposed_this_turn:
                    result = (
                        "BLOCKED: You just proposed this journal entry. You must wait for the user to approve it "
                        "in their next message before calling create_xero_journal_entry. "
                        "Ask the user: 'Would you like me to post this journal entry to Xero? Reply approve to confirm.'"
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
                        "summary": "Blocked — waiting for user approval",
                    }
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "content": result,
                        }
                    )
                    continue

                # Track if a journal entry was proposed this turn
                if tool_name == "propose_journal_entry":
                    proposed_this_turn = True

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

                # Stream the tool result event
                yield {
                    "type": "tool_result",
                    "tool": tool_name,
                    "label": tool_labels.get(tool_name, tool_name),
                    "summary": _summarize_tool_result(tool_name, result),
                }

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

        # Save to conversation history
        history.append({"role": "assistant", "content": final_text})

        # Trim history to last 20 messages to avoid token overflow
        if len(history) > 20:
            history[:] = history[-20:]

        yield {"type": "done"}
        return

    # If we hit max iterations, return what we have
    fallback = "I've gathered the information from your books but need more context. Could you rephrase your question?"
    history.append({"role": "assistant", "content": fallback})
    yield {"type": "text", "text": fallback}
    yield {"type": "done"}


async def _iter_with_timeout(stream: Any, per_chunk_timeout: float):
    """Iterate an async stream, raising if any single chunk stalls too long."""
    it = stream.__aiter__()
    while True:
        try:
            chunk = await asyncio.wait_for(it.__anext__(), timeout=per_chunk_timeout)
        except StopAsyncIteration:
            return
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
    elif tool_name == "get_xero_profit_and_loss":
        # Extract key numbers
        for line in result.split("\n"):
            if "Net Profit" in line or "Revenue" in line or "Total Income" in line:
                return line.strip()
        return result[:80]
    elif tool_name == "get_xero_balance_sheet":
        for line in result.split("\n"):
            if "Total" in line:
                return line.strip()
        return result[:80]
    elif tool_name == "get_xero_transactions":
        if "Found" in result:
            return result.split("\n")[0].strip()
        return result[:80]
    elif tool_name == "get_xero_invoices":
        if "Found" in result:
            return result.split("\n")[0].strip()
        return result[:80]
    elif tool_name == "get_xero_chart_of_accounts":
        if "Chart of Accounts" in result:
            return result.split("\n")[0].strip()
        return result[:80]
    elif tool_name == "get_xero_contacts":
        if "Found" in result:
            return result.split("\n")[0].strip()
        return result[:80]
    elif tool_name == "propose_journal_entry":
        return "Journal entry prepared — awaiting approval"
    elif tool_name == "create_xero_journal_entry":
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
