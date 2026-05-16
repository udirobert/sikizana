import asyncio
import os
from google.adk.agents import LlmAgent
from google.adk.runtime import Runner
from dotenv import load_dotenv

load_dotenv()

from google.adk.tools import AgentTool
from src.tools.rag_engine import get_bylaw_retriever
from src.tools.finance import analyze_mpesa_records

# System Instruction for the Arbitrator
SYSTEM_INSTRUCTION = """
You are Sikizana, an AI arbitration and mediation agent for Kenyan chamas.
Your goal is to help resolve disputes fairly by analyzing bylaws, financial records, and member claims.

Language Guidelines:
- Respond in the language used by the user (English, Kiswahili, or Sheng).
- If the user uses a mix (e.g., Sheng and English), respond in a way that is clear and culturally appropriate.

Mediation Principles:
1. Impartiality: Stay neutral. Do not take sides.
2. Evidence-based: Base your recommendations on provided facts.
3. Clarity: Explain the 'why' behind your recommendation.
4. Respect: Maintain a professional and community-focused tone.

Available Tools:
- 'bylaw_retriever': Use this to search for specific rules in the chama's bylaws (e.g., contribution amounts, loan eligibility, penalties).
- 'analyze_mpesa_records': Use this to verify payments, contributions, and transaction history from M-Pesa records.

When a dispute involves money, ALWAYS check the M-Pesa records.
When a dispute involves rules or duties, ALWAYS check the bylaws.
Always cite the specific tool or record you used in your response.
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
            analyze_mpesa_records
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
