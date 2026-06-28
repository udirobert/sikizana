import os
from antigravity import Agent, Tool
from src.tools.finance import analyze_mpesa_records
from src.tools.rag_engine import get_bylaw_retriever
from src.services.vara_service import VaraService

vara = VaraService()

# --- Tools ---

def submit_verdict_to_blockchain(dispute_id: int, verdict_summary: str) -> str:
    """Records the final mediation verdict on the Vara Network."""
    mock_cid = f"ipfs://{hash(verdict_summary)}"
    success = vara.submit_verdict(dispute_id, mock_cid, private_key=os.getenv("VARA_PRIVATE_KEY", ""))
    if success:
        return f"Verdict recorded on Vara. CID: {mock_cid}"
    return "Failed to record on-chain."

# --- Antigravity Agent Definition ---

def create_agent():
    # Load system instruction from external file for cleanliness
    with open("src/agents/prompts/arbitrator_v2.txt", "r") as f:
        instruction = f.read()

    agent = Agent(
        name="sikizana-arbitrator",
        model="gemini-1.5-pro",
        instruction=instruction,
    )

    # Register Tools
    agent.add_tool(analyze_mpesa_records)
    agent.add_tool(submit_verdict_to_blockchain)

    # RAG tool wrapper
    bylaw_agent = get_bylaw_retriever()
    def bylaw_search(query: str):
        return bylaw_agent.run(query)

    agent.add_tool(Tool(
        name="bylaw_retriever",
        description="Search chama bylaws for rules and penalties.",
        func=bylaw_search
    ))

    return agent

if __name__ == "__main__":
    # Test locally using antigravity runner
    agent = create_agent()
    # agent.serve() # In production
    print("Sikizana Antigravity Agent Initialized.")
