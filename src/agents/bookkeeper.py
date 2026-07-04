"""
Bookkeeper Agent — the Xero-mode variant of the Sikizana arbitrator.

Uses NVIDIA NIM (OpenAI-compatible API) with function calling to reason
over live Xero data. The reasoning loop is identical to the chama
arbitrator: gather evidence → analyse → propose a fix → await approval.

The agent calls Xero tools (reconciliation, P&L, invoices, etc.) via
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

from src.tools.xero_tools import (
    find_discrepancies,
    get_xero_balance_sheet,
    get_xero_chart_of_accounts,
    get_xero_contacts,
    get_xero_invoices,
    get_xero_organisation,
    get_xero_profit_and_loss,
    get_xero_transactions,
    match_receipt_to_transaction,
    propose_journal_entry,
)
from src.services.logging import get_logger

log = get_logger("sikizana.bookkeeper")

# NVIDIA NIM API (OpenAI-compatible)
_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
_NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "meta/llama-3.3-70b-instruct")
_NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

_client: AsyncOpenAI | None = None
_conversations: dict[str, list[dict[str, Any]]] = {}


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=_NVIDIA_BASE_URL,
            api_key=_NVIDIA_API_KEY,
        )
    return _client


def _load_prompt() -> str:
    with open("src/agents/prompts/bookkeeper.txt", "r") as f:
        return f.read()


# ---- Contextual status messages ----
# Lightweight keyword matching to give the user immediate feedback
# that their question was understood, before the LLM responds.

_STATUS_PATTERNS: list[tuple[list[str], str]] = [
    (["profit", "loss", "p&l", "pnl", "income statement", "net profit", "revenue"],
     "Pulling your P&L report to answer that…"),
    (["balance sheet", "assets", "liabilities", "equity"],
     "Fetching your balance sheet…"),
    (["invoice", "overdue", "unpaid", "outstanding", "owed"],
     "Checking your invoices for overdue items…"),
    (["reconcil", "unreconciled", "bank transaction", "matching", "match"],
     "Scanning your bank transactions for unreconciled items…"),
    (["discrepanc", "audit", "health check", "wrong", "error", "mistake"],
     "Auditing your books for discrepancies…"),
    (["journal", "entry", "adjust", "correct", "fix"],
     "Preparing a journal entry to fix that…"),
    (["contact", "customer", "supplier", "vendor"],
     "Looking up your contacts in Xero…"),
    (["account", "chart of accounts", "ledger", "code"],
     "Loading your chart of accounts…"),
    (["organisation", "company", "business", "org"],
     "Reading your organisation details…"),
    (["receipt", "photo", "upload", "scan"],
     "Getting ready to read that receipt…"),
    (["hello", "hi ", "hey", "help", "what can you"],
     "Hi! Let me look at your books…"),
    (["thank", "cheers", "appreciate"],
     "You're welcome! Anything else I can check?"),
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
}


def _execute_tool(name: str, arguments: dict[str, Any]) -> str:
    """Execute a tool function and return its string result."""
    func = _TOOL_FUNCS.get(name)
    if func is None:
        return f"Error: Unknown tool '{name}'"
    try:
        result = func(**arguments)
        return result if isinstance(result, str) else json.dumps(result, default=str)
    except Exception as exc:  # noqa: BLE001
        log.error("tool_execution_error", extra={"tool": name, "error": str(exc)}, exc_info=True)
        return f"Error calling {name}: {exc}"


async def run_bookkeeper(user_input: str, thread_id: str | None = None) -> str:
    """
    Run the bookkeeper agent on user input with conversation persistence.

    Uses NVIDIA NIM with function calling. The agent can call multiple
    tools in sequence to gather evidence before responding.
    """
    events: list[dict[str, Any]] = []
    async for event in run_bookkeeper_streaming(user_input, thread_id):
        events.append(event)
    # Extract the final text from the events
    text_parts = [e["text"] for e in events if e["type"] == "text"]
    return "".join(text_parts) or "I couldn't process that request."


async def run_bookkeeper_streaming(
    user_input: str,
    thread_id: str | None = None,
) -> Any:
    """
    Streaming version of run_bookkeeper.

    Yields events as they happen:
      {"type": "status", "message": "Understanding your question..."}
      {"type": "tool_call", "tool": "find_discrepancies", "args": {...}}
      {"type": "tool_result", "tool": "find_discrepancies", "result": "...", "summary": "..."}
      {"type": "text", "text": "chunk of response"}
      {"type": "done"}
    """
    if not _NVIDIA_API_KEY:
        yield {"type": "text", "text": "I'm not connected to an AI model yet. Set NVIDIA_API_KEY in .env to enable the bookkeeper agent."}
        yield {"type": "done"}
        return

    # Emit an immediate status event so the UI never appears frozen
    yield {"type": "status", "message": _generate_status_message(user_input)}

    tid = thread_id or "default"
    client = _get_client()

    # Get or create conversation history
    if tid not in _conversations:
        _conversations[tid] = []

    history = _conversations[tid]
    history.append({"role": "user", "content": user_input})

    messages = [{"role": "system", "content": _load_prompt()}] + history

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
    }

    # Agent loop: call the model, execute tools, feed results back
    max_iterations = 5
    for iteration in range(max_iterations):
        try:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=_NVIDIA_MODEL,
                    messages=messages,
                    tools=_TOOL_DEFS,
                    temperature=0.3,
                    max_tokens=2000,
                ),
                timeout=45.0,
            )
        except asyncio.TimeoutError:
            log.error("nvidia_api_timeout", extra={"iteration": iteration})
            yield {"type": "text", "text": "I'm taking longer than expected to reach the AI model. Please try again in a moment."}
            yield {"type": "done"}
            return
        except Exception as exc:
            log.error("nvidia_api_error", extra={"error": str(exc), "iteration": iteration})
            error_msg = str(exc)
            if "401" in error_msg or "Unauthorized" in error_msg:
                yield {"type": "text", "text": "I'm having trouble connecting to the AI model (authentication error). The team has been notified. Please try again later."}
            else:
                yield {"type": "text", "text": f"I encountered an issue while processing your request: {error_msg[:100]}. Please try again."}
            yield {"type": "done"}
            return

        choice = response.choices[0]
        msg = choice.message

        # If the model wants to call tools
        if msg.tool_calls:
            # Add the assistant message with tool calls to history
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            }
            messages.append(assistant_msg)

            # Execute each tool call
            for tc in msg.tool_calls:
                tool_name = tc.function.name
                try:
                    tool_args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except json.JSONDecodeError:
                    tool_args = {}

                # Stream the tool call event
                yield {
                    "type": "tool_call",
                    "tool": tool_name,
                    "label": tool_labels.get(tool_name, tool_name),
                    "args": tool_args,
                }

                log.info("tool_called", extra={"tool": tool_name, "tool_args": tool_args})
                result = _execute_tool(tool_name, tool_args)
                log.info("tool_result", extra={"tool": tool_name, "result_len": len(result)})

                # Create a short summary of the result for the UI
                summary = _summarize_tool_result(tool_name, result)

                # Stream the tool result event
                yield {
                    "type": "tool_result",
                    "tool": tool_name,
                    "label": tool_labels.get(tool_name, tool_name),
                    "summary": summary,
                }

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

            # Continue the loop — the model will process tool results
            continue

        # No tool calls — this is the final response
        final_text = msg.content or "I couldn't process that request."

        # Save to conversation history
        history.append({"role": "assistant", "content": final_text})

        # Trim history to last 20 messages to avoid token overflow
        if len(history) > 20:
            history[:] = history[-20:]

        # Stream the response text (simulate token-by-token for UX)
        # Split into word-sized chunks for a streaming feel
        words = final_text.split(" ")
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            yield {"type": "text", "text": chunk}
            # Small delay for streaming effect (non-blocking)
            await asyncio.sleep(0.015)

        yield {"type": "done"}
        return

    # If we hit max iterations, return what we have
    fallback = "I've gathered the information from your books but need more context. Could you rephrase your question?"
    history.append({"role": "assistant", "content": fallback})
    yield {"type": "text", "text": fallback}
    yield {"type": "done"}


def _summarize_tool_result(tool_name: str, result: str) -> str:
    """Create a short human-readable summary of a tool result for the UI."""
    if len(result) < 80:
        return result
    # Tool-specific summaries
    if tool_name == "find_discrepancies":
        if "UNRECONCILED" in result:
            lines = result.split("\n")
            unrec_line = next((l for l in lines if "UNRECONCILED" in l), "")
            overdue_line = next((l for l in lines if "OVERDUE" in l), "")
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
    elif tool_name == "match_receipt_to_transaction":
        return "Receipt analyzed and matched"
    return result[:80]


if __name__ == "__main__":
    async def test():
        ans = await run_bookkeeper("Can you check my books and see if everything is reconciled?")
        print(f"Agent response: {ans}")
    asyncio.run(test())
