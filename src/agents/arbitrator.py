import asyncio
import os
from google.adk.agents import LlmAgent
from google.adk.runtime import Runner
from google.adk.tools import AgentTool
from dotenv import load_dotenv

load_dotenv()

from src.tools.rag_engine import get_bylaw_retriever
from src.tools.finance import analyze_mpesa_records
from src.services.vara_service import VaraService
from src.tools.payments import initiate_premium_resolution

vara = VaraService()

def submit_verdict_to_blockchain(dispute_id: int, verdict_summary: str) -> str:
    """
    Submits the final mediation verdict to the Vara Network on-chain program.
    This ensures the resolution is transparent, immutable, and verifiable.
    """
    mock_cid = f"ipfs://{hash(verdict_summary)}"
    success = vara.submit_verdict(dispute_id, mock_cid, private_key=os.getenv("VARA_PRIVATE_KEY", ""))
    
    if success:
        return f"Successfully recorded verdict on Vara Network. CID: {mock_cid}"
    return "Failed to record verdict on-chain."

def get_arbitrator_agent():
    # Load the professional, business-oriented instruction
    with open("src/agents/prompts/arbitrator_v2.txt", "r") as f:
        instruction = f.read()

    bylaw_agent = get_bylaw_retriever()
    
    return LlmAgent(
        name="arbitrator",
        model="gemini-1.5-pro", # Aligning with XPRIZE preference for 1.5/3.1
        instruction=instruction,
        tools=[
            AgentTool(agent=bylaw_agent),
            analyze_mpesa_records,
            submit_verdict_to_blockchain,
            initiate_premium_resolution
        ]
    )

async def run_arbitrator(user_input: str, thread_id: str = None):
    agent = get_arbitrator_agent()
    runner = Runner()
    
    response_text = ""
    async for event in runner.run(agent, user_input):
        if event.agent_name == "arbitrator" and event.event_type == "text_chunk":
            response_text += event.text
            
    return response_text

if __name__ == "__main__":
    async def test():
        ans = await run_arbitrator("Sasa? Kuna mzozo wa KES 10,000 kwa chama yetu.")
        print(f"Agent response: {ans}")
    asyncio.run(test())
