import os
from google.adk.agents import LlmAgent
from google.adk.tools import VertexAiSearchTool
from dotenv import load_dotenv

load_dotenv()

def get_bylaw_retriever():
    """
    Returns a specialized agent for retrieving information from chama bylaws.
    Uses Vertex AI Agent Builder (Search) if configured, otherwise falls back to a mock tool.
    """
    data_store_id = os.getenv("VERTEX_AI_DATA_STORE_ID")
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    
    if data_store_id and project_id:
        # Full RAG implementation with Vertex AI
        search_tool = VertexAiSearchTool(
            data_store_id=f"projects/{project_id}/locations/global/collections/default_collection/dataStores/{data_store_id}"
        )
        return LlmAgent(
            name="bylaw_retriever",
            model="gemini-3.1-flash-lite", # Cheaper model for retrieval tasks
            instruction="You are a legal assistant. Search the chama bylaws and provide concise answers with citations.",
            tools=[search_tool]
        )
    else:
        # Mock RAG for local development/prototype without GCP credentials
        def mock_bylaw_search(query: str) -> str:
            """Searches the local sample bylaws for information."""
            data_path = os.path.join("data", "sample_bylaws.txt")
            if not os.path.exists(data_path):
                return "Error: Bylaws file not found."
            
            with open(data_path, 'r') as f:
                content = f.read()
            
            # Simple keyword check for the prototype
            query_lower = query.lower()
            if "loan" in query_lower:
                return "Section 3: Members eligible for loans after 6 months. Max 3x savings. 10% interest."
            if "contribution" in query_lower or "pay" in query_lower:
                return "Section 1: Monthly contributions are 2,000 KES by the 5th."
            if "fine" in query_lower or "penalty" in query_lower:
                return "Section 2: Late contributions fine is 200 KES/week. Missed meeting fine is 500 KES."
            
            return f"No specific section found in bylaws for '{query}'.\nFull Bylaws Content:\n{content[:500]}..."

        return LlmAgent(
            name="bylaw_retriever",
            model="gemini-3.1-flash-lite",
            instruction="Search the chama bylaws and provide concise answers.",
            tools=[mock_bylaw_search]
        )
