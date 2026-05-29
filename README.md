# Sikizana: AI-Powered Decentralized Arbitration

**Resolving chama disputes with AI and Decentralized Trust.**

Sikizana is an autonomous AI mediation agent built for Kenyan chamas (self-help groups). It blends financial evidence (M-Pesa) with community governance (Bylaws) and decentralized coordination to resolve disputes fairly and transparently in English, Kiswahili, and Sheng.

---

### 🏆 Hackathon Participation
This project is currently competing in:
1.  **Vara Agents Arena Season 1**: Focusing on the **Social & Coordination** track with decentralized arbitration.
2.  **XPRIZE Connect Hackathon**: Leveraging AI to enhance community resilience and financial inclusion.

---

## Solo Build
Sikizana is currently being developed and maintained by a **solo developer** (@udirobert), focusing on the intersection of LLM reasoning, local linguistic nuances, and blockchain-based transparency.

---

## The Problem
...

Kenya has over 300,000 registered chamas managing billions of shillings in collective savings, lending, and investments.

Most chamas do not collapse because of poor financial performance — they collapse because of unresolved internal disputes. These conflicts are often emotional, undocumented, and difficult to verify fairly.

## Our Solution

Sikizana acts as an AI arbitration and mediation agent for chamas. By integrating with the **Vara Network**, Sikizana moves beyond a simple chatbot into a **Decentralized Agent Service (DAS)**.

The system ingests:
- Chama bylaws
- M-Pesa statements
- Contribution records
- Loan histories

It then:
- **Analyzes Evidence**: Using Gemini 3.1 Pro to reason across financial records and legal bylaws.
- **Multilingual Mediation**: Handles English, Kiswahili, and Sheng naturally.
- **Commits Resolutions to Blockchain**: Once a verdict is reached, the agent signs and submits the resolution hash to the Vara Network.

## Features

- **On-chain Dispute Management**: Decentralized tracking of chama conflicts.
- **AI-powered mediation** (Gemini 3.1 Pro & Google ADK).
- **Multilingual support** (English, Kiswahili, Sheng).
- **M-Pesa statement analysis** & **RAG** for bylaws.
- **Wallet Integration**: Support for Vara/Polkadot wallets (SubWallet, Enkrypt).
- **Transparent Audit Trail**: Every mediation step is verifiable on-chain.

## Technical Architecture

### 1. On-chain (Vara Network)
- **Sails Program**: Located in `contracts/sikizana`. Manages the registration and resolution of disputes.
- **Language**: Rust.
- **Framework**: Sails.

### 2. Off-chain (Python Agent)
- **Brain**: Gemini 3.1 Pro.
- **Orchestration**: Google Agent Development Kit (ADK).
- **Vara Service**: Python client interacting with the Vara testnet/mainnet.

### 3. Frontend (Next.js)
- **Web3 Layer**: `@gear-js/api` and `@gear-js/react-hooks` for blockchain interaction.
- **Wallet**: Polkadot/Vara extension support.

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- Google Cloud Project with Gemini API access
- **Rust & Cargo** (for building Vara contracts)

### Installation & Local Run
1. **Contracts**:
   ```bash
   cd contracts/sikizana
   cargo build --release
   ```
2. **Backend**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   pip install gear-py
   python src/api/main.py
   ```
3. **Frontend**:
   ```bash
   cd web
   pnpm install
   pnpm dev
   ```

## Documentation Deep Dives
- [**Vara Integration Guide**](docs/VARA.md): Details on the on-chain logic and Sails implementation.
- [**Architecture**](docs/ARCHITECTURE.md): Agent logic, tools, and reasoning loops.
- [**Frontend**](docs/FRONTEND.md): Tech stack and UI components.

## Deployment
Sikizana is deployed on **Google Cloud Run**.
- **Live Demo**: [URL Placeholder]
- **Deployment Guide**: See `infra/deploy.sh`.
