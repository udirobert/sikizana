import asyncio
import os
from google.adk.agents import LlmAgent
from google.adk.runtime import Runner
from dotenv import load_dotenv

load_dotenv()

from google.adk.tools import AgentTool
from src.tools.rag_engine import get_bylaw_retriever
from src.tools.finance import analyze_mpesa_records
from src.services.vara_service import VaraService

vara = VaraService()

def submit_verdict_to_blockchain(dispute_id: int, verdict_summary: str) -> str:
    """
    Submits the final mediation verdict to the Vara Network on-chain program.
    This ensures the resolution is transparent, immutable, and verifiable.
    """
    # In a production hackathon entry, we would upload the verdict_summary to IPFS 
    # and get a CID, then submit that CID to the Vara contract.
    mock_cid = f"ipfs://{hash(verdict_summary)}"
    success = vara.submit_verdict(dispute_id, mock_cid, private_key=os.getenv("VARA_PRIVATE_KEY", ""))
    
    if success:
        return f"Successfully recorded verdict on Vara Network. CID: {mock_cid}"
    return "Failed to record verdict on-chain."

# System Instruction for the Arbitrator
SYSTEM_INSTRUCTION = """
You are Sikizana, a wise, impartial, and firm AI mediator for Kenyan chamas. 
Your goal is to resolve disputes by blending financial evidence (M-Pesa) with chama governance (Bylaws) and a deep understanding of Kenyan community culture.

### 1. Persona & Tone
... (rest of persona)

### 5. Finalizing Resolution
- Once you have analyzed both the bylaws and financial records, you MUST provide a final verdict.
- You SHOULD use 'submit_verdict_to_blockchain' to record your final decision on the Vara Network for transparency.
"""

def get_arbitrator_agent():
    # Initialize tools
    bylaw_agent = get_bylaw_retriever()
    
    return LlmAgent(
        name="arbitrator",
        model="gemini-3.1-pro",
        instruction=SYSTEM_INSTRUCTION,
        tools=[
            AgentTool(agent=bylaw_agent),
            analyze_mpesa_records,
            submit_verdict_to_blockchain
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
    # Test run
    async def test():
        ans = await run_arbitrator("Sasa? Kuna mshikemshike kwa chama yetu.")
        print(f"Agent response: {ans}")
        
    asyncio.run(test())
