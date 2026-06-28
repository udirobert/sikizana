# Vara Network Integration Guide

Sikizana is built as a **Decentralized Agent Service (DAS)** on the Vara Network. This document explains the on-chain logic and how the agent interacts with the blockchain.

## On-chain Program (Rust + Sails)

The core logic of Sikizana's decentralized arbitration is handled by a program deployed on the Vara Network, located in `contracts/sikizana`.

### Key Features:
- **Dispute Registry**: A global registry where users can submit dispute details (via IPFS CID).
- **Lifecycle Management**: Tracks disputes from `Pending` -> `Assigned` -> `Resolved`.
- **Arbitrator Assignment**: Allows for the assignment of specific arbitrator addresses (AI or Human) to cases.
- **Verdict Commitment**: Stores the hash of the final mediation verdict on-chain for immutability.

### Data Structures:
```rust
pub struct Dispute {
    pub id: u64,
    pub creator: ActorId,
    pub metadata_cid: String,
    pub arbitrator: Option<ActorId>,
    pub verdict_cid: Option<String>,
    pub status: DisputeStatus,
}
```

## Agent Interaction (Python)

The Sikizana AI agent (Python) interacts with Vara using the `gear-py` SDK.

### Workflow (current implementation):
1. **User-Initiated**: A chama member opens the web app, describes a dispute, and optionally pays 100 KES via M-Pesa for the deep-audit tier. Standard mediation is free; premium is gated on a confirmed Daraja callback.
2. **Evidence Ingestion**: The agent pulls evidence into context - bylaws via RAG, M-Pesa CSVs/PDFs, optional ledger photos via Gemini vision, and any uploaded files pinned to IPFS via Pinata.
3. **Reasoning**: The agent uses Gemini 1.5/3.1 Pro to analyze the evidence against the chama's bylaws, with multilingual support for English, Kiswahili, and Sheng.
4. **Verdict Commitment**: After reaching a verdict, the agent computes an IPFS CID for the resolution summary and calls `submit_verdict_to_blockchain` to record it on Vara via `VaraService.submit_verdict`.
5. **Reputation**: A separate `generate_bank_readiness_report` tool derives a Chama Health Score from the on-chain verdict history for bank loan applications.

### Roadmap (autonomous monitor):
The current implementation is **user-invocable** through the chat UI. The planned autonomous mode - where the agent listens for `DisputeRegistered` events and proactively offers mediation - is on the Phase 3 roadmap.

## Frontend Integration (Next.js)

The web application provides a user-friendly interface for interacting with the Vara Network.

### Tools Used:
- **@gear-js/api**: For communicating with the Vara node.
- **@gear-js/react-hooks**: For managing wallet state and blockchain queries in React.
- **Polkadot Extension Dapp**: For connecting to wallets like SubWallet or Enkrypt.

## Why Vara?

Vara Network's **Actor Model** and **Persistent Memory** make it the ideal platform for autonomous agents.
- **Asynchronous Messaging**: Perfect for agents that need to wait for external data (like financial verification) before committing a result.
- **Scalability**: Low latency and high throughput allow Sikizana to scale to thousands of chamas across Kenya.
- **Security**: Rust-based smart contracts ensure that the arbitration logic is secure and predictable.

## Payment Gating Flow

Vara verdict commitment is the natural end-state of the premium payment flow:

```
User pays 100 KES via M-Pesa -> Daraja callback CONFIRMED
  -> Agent runs deep audit (Gemini + vision + RAG)
  -> Verdict recorded on Vara Network (immutable proof)
  -> Chama Health Score updated
  -> Bank readiness report refreshed
```

This makes the Vara Network the **settlement layer** for every paid dispute, providing the audit trail banks need before extending credit to informal groups.
