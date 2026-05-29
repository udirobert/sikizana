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
from src.tools.vision_audit import analyze_ledger_image
from src.services.ipfs_service import PinataIPFSService
from src.services.reputation_service import generate_bank_readiness_report

vara = VaraService()
ipfs = PinataIPFSService()

def upload_evidence_to_ipfs(file_path: str) -> str:
    """Uploads a dispute evidence file (ledger photo, PDF) to IPFS."""
    return ipfs.upload_file(file_path)

def submit_verdict_to_blockchain(dispute_id: int, verdict_summary: str, evidence_cid: str = "") -> str:
    """
    Submits the final mediation verdict to the Vara Network on-chain program.
    """
    # In a production hackathon entry, we would upload the verdict_summary to IPFS 
    # and get a CID, then submit that CID to the Vara contract.
    mock_cid = f"ipfs://{hash(verdict_summary)}"
    success = vara.submit_verdict(dispute_id, mock_cid, private_key=os.getenv("VARA_PRIVATE_KEY", ""))
    
    if success:
        return f"Successfully recorded verdict on Vara Network. CID: {mock_cid} | Evidence: {evidence_cid}"
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
            analyze_ledger_image,
            upload_evidence_to_ipfs,
            submit_verdict_to_blockchain,
            initiate_premium_resolution,
            generate_bank_readiness_report
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
