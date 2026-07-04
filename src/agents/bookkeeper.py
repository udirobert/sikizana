"""
Bookkeeper Agent — the Xero-mode variant of the Sikizana arbitrator.

Same Google ADK architecture (LlmAgent + Runner), but with Xero tools
instead of chama/M-Pesa/Vara tools. The reasoning loop is identical:
gather evidence → analyse → propose a fix → await approval.
"""

import asyncio
import os

from google.adk.agents import LlmAgent
from google.adk.runtime import Runner
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


def get_bookkeeper_agent() -> LlmAgent:
    with open("src/agents/prompts/bookkeeper.txt", "r") as f:
        instruction = f.read()

    return LlmAgent(
        name="bookkeeper",
        model="gemini-1.5-pro",
        instruction=instruction,
        tools=[
            find_discrepancies,
            get_xero_organisation,
            get_xero_transactions,
            get_xero_invoices,
            get_xero_chart_of_accounts,
            get_xero_profit_and_loss,
            get_xero_balance_sheet,
            get_xero_contacts,
            match_receipt_to_transaction,
            propose_journal_entry,
        ],
    )


async def run_bookkeeper(user_input: str, thread_id: str | None = None) -> str:
    agent = get_bookkeeper_agent()
    runner = Runner()

    response_text = ""
    async for event in runner.run(agent, user_input):
        if event.agent_name == "bookkeeper" and event.event_type == "text_chunk":
            response_text += event.text

    return response_text


if __name__ == "__main__":
    async def test():
        ans = await run_bookkeeper("Can you check my books and see if everything is reconciled?")
        print(f"Agent response: {ans}")
    asyncio.run(test())
