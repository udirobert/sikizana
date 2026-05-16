import asyncio
import sys
import os

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.agents.arbitrator import run_arbitrator

async def test_multilingual_persona():
    print("--- Testing Sikizana Multilingual Persona ---\n")
    
    # Test case 1: Sheng query about a dispute
    print("Query: 'Yo, huyu treasurer ni mwizi! Nimesukuma mchango yangu ya April lakini anasema sijalipa na bado anataka nilipe faini. Hebu cheki M-Pesa records.'")
    response = await run_arbitrator("Yo, huyu treasurer ni mwizi! Nimesukuma mchango yangu ya April lakini anasema sijalipa na bado anataka nilipe faini. Hebu cheki M-Pesa records.")
    print(f"\nResponse:\n{response}\n")
    print("-" * 50)
    
    # Test case 2: Formal Kiswahili query about loans
    print("\nQuery: 'Naomba kujua sheria ya chama kuhusu riba ya mikopo. Nimevuta mkopo mwezi uliopita na ningependa kujua nitadaiwa kiasi gani.'")
    response = await run_arbitrator("Naomba kujua sheria ya chama kuhusu riba ya mikopo. Nimevuta mkopo mwezi uliopita na ningependa kujua nitadaiwa kiasi gani.")
    print(f"\nResponse:\n{response}\n")
    print("-" * 50)

if __name__ == "__main__":
    if not os.getenv("GOOGLE_API_KEY"):
        print("Error: GOOGLE_API_KEY not found in environment.")
    else:
        asyncio.run(test_multilingual_persona())
