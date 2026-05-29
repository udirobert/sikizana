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

### Workflow:
1. **Detection**: The agent can monitor the Vara Network for new `DisputeRegistered` events.
2. **Analysis**: Once a dispute is detected, the agent fetches the `metadata_cid` (containing bylaws and transaction references) from IPFS.
3. **Reasoning**: The agent uses Gemini 3.1 Pro to analyze the evidence.
4. **Resolution**: After reaching a verdict, the agent sends a `ResolveDispute` message to the Vara program, including the `verdict_cid`.

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
