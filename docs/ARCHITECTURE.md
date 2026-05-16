# Agent Architecture

Sikizana uses a **Parent-Child (Manager-Worker)** architecture built on the **Google Agent Development Kit (ADK)** and **Gemini 3.1 Pro**.

## Core Engine
- **Model**: `gemini-3.1-pro` (Flagship reasoning model).
- **Orchestration**: Google ADK `LlmAgent` and `Runner`.

## Agentic Components
1. **Arbitrator (Root Agent)**:
   - Receives user input (English, Kiswahili, or Sheng).
   - Plans the mediation steps.
   - Delegates to specialized tools or sub-agents.
   
2. **Bylaw Retriever (Sub-Agent)**:
   - Specialized in **RAG**.
   - Uses `VertexAiSearchTool` to query chama governance documents.
   - Provides citations (e.g., "According to Section 3.2...").

3. **Financial Analyzer (Custom Tool)**:
   - Python-based logic using **Pandas** and **PyPDF**.
   - Verifies claims against M-Pesa transaction history.

## Reasoning Loop
1. **Input**: User reports a dispute.
2. **Analyze**: Agent identifies if it's a rule dispute or a money dispute.
3. **Act**: Calls the relevant tool (Search or Finance).
4. **Synthesize**: Merges evidence with community-first mediation principles.
5. **Output**: Transparent recommendation in the user's preferred language.
