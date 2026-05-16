import asyncio
import sys
import os

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.agents.arbitrator import run_arbitrator

async def test_dispute_mediation():
    print("--- Testing Sikizana Agent with Tools ---\n")
    
    # Test case 1: Contribution dispute (Money + Rules)
    print("Query: 'Nimepay contribution ya May lakini treasurer anasema sijalipa. Sheria ya chama inasema nini?'")
    response = await run_arbitrator("Nimepay contribution ya May lakini treasurer anasema sijalipa. Sheria ya chama inasema nini?")
    print(f"\nResponse:\n{response}\n")
    print("-" * 50)
    
    # Test case 2: Loan eligibility (Rules)
    print("\nQuery: 'Can I take a loan of 50,000 KES? I joined 2 months ago.'")
    response = await run_arbitrator("Can I take a loan of 50,000 KES? I joined 2 months ago.")
    print(f"\nResponse:\n{response}\n")
    print("-" * 50)

if __name__ == "__main__":
    if not os.getenv("GOOGLE_API_KEY"):
        print("Error: GOOGLE_API_KEY not found in environment.")
    else:
        asyncio.run(test_dispute_mediation())
