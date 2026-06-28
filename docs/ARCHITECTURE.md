# Agent Architecture

Sikizana uses a **Parent-Child (Manager-Worker)** architecture built on the **Google Agent Development Kit (ADK)** and **Gemini 1.5/3.1 Pro**.

## Core Engine
- **Model**: `gemini-1.5-pro` (aligning with XPRIZE/Google Cloud requirements).
- **Orchestration**: Google ADK `LlmAgent` and `Runner`.

## Agentic Components
1. **Arbitrator (Root Agent)**:
   - Receives user input (English, Kiswahili, or Sheng).
   - Plans the mediation steps.
   - Delegates to specialized tools or sub-agents.

2. **Bylaw Retriever (Sub-Agent)**:
   - Specialized in **RAG**.
   - Searches chama governance documents.
   - Provides citations (e.g., "According to Section 3.2...").

3. **Financial Analyzer (Tool)**:
   - Python-based logic for verifying claims against M-Pesa transaction history (CSV/PDF).

4. **Vision Audit (Tool)**:
   - Multimodal Gemini analysis of ledger photos and handwritten records.

5. **Payment Tools**:
   - `initiate_premium_resolution`: Fires a real Safaricom Daraja STK Push and persists the checkout request.
   - `verify_premium_payment`: Checks whether the M-Pesa payment was confirmed via callback before the agent proceeds with the deep audit.

6. **Blockchain Tools**:
   - `submit_verdict_to_blockchain`: Commits the resolution hash to the Vara Network.
   - `upload_evidence_to_ipfs`: Stores evidence files on IPFS via Pinata for verifiable CIDs.

7. **Reputation Service**:
   - `generate_bank_readiness_report`: Produces a Chama Health Score and credit-worthiness assessment for bank loan applications.

## Reasoning Loop
1. **Input**: User reports a dispute.
2. **Analyze**: Agent identifies if it's a rule dispute or a money dispute.
3. **Pay (Premium)**: If premium audit requested, agent initiates STK Push and waits for confirmation before deep analysis.
4. **Act**: Calls the relevant tools (Bylaw search, Finance analysis, Vision audit, IPFS upload).
5. **Synthesize**: Merges evidence with community-first mediation principles.
6. **Commit**: Records the verdict on the Vara Network for immutable transparency.
7. **Output**: Transparent recommendation in the user's preferred language.

## Payment Flow (Real Revenue)

```
Frontend toggle Premium -> enters phone number
  -> POST /api/payments/stk-push {phone, amount, dispute_context}
    -> DarajaService.stk_push() -> Safaricom sends STK prompt to user's phone
    -> PaymentStore creates PENDING record
  -> User enters M-Pesa PIN on phone
  -> Safaricom POST /api/payments/callback (async webhook)
    -> DarajaService.parse_callback() extracts receipt, amount, status
    -> PaymentStore confirms payment (CONFIRMED/FAILED)
  -> Frontend polls GET /api/payments/status/{checkout_id} every 3s
  -> Once CONFIRMED, frontend sends premium chat to /chat
  -> Agent calls verify_premium_payment before running deep audit
```

All payments are persisted in SQLite (`data/payments.db`) and aggregated at `GET /api/revenue` for business viability evidence.
