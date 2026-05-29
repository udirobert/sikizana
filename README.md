# Sikizana: The Global Protocol for Informal Trust

**Autonomous AI Arbitration for the World's Unbanked Communities.**

Sikizana is an AI-native Decentralized Agent Service (DAS) designed to resolve disputes in informal savings groups—known globally as **ROSCAs** (*Chamas* in Kenya, *Sou-sou* in West Africa, *Tandas* in Latin America, and *Stokvels* in South Africa). 

By blending AI reasoning (Gemini 1.5/3.1) with financial evidence and decentralized trust (Vara Network), Sikizana turns informal social capital into verifiable financial data.

---

### 🏆 Hackathon Participation
This project is currently competing in:
1.  **Vara Agents Arena Season 1**: Focusing on the **Social & Coordination** track with decentralized arbitration.
2.  **XPRIZE Build with Gemini**: Leveraging AI to solve the "Grand Challenge" of global financial inclusion.

---

## The "Grand Challenge"
Over **2.4 billion people** globally manage their savings through informal groups. However, these groups frequently collapse due to **unresolved internal disputes**, trust deficits, and poor record-keeping. 

Sikizana moves beyond "Passive Bookkeeping" into **Active Arbitration**, providing an impartial, evidence-based mediator that is available 24/7 in local languages (English, Kiswahili, Sheng, and more).

---

## Solo Build
Sikizana is currently being developed and maintained by a **solo developer** (@udirobert), focusing on the intersection of LLM reasoning, local linguistic nuances, and blockchain-based transparency.

---

## Our Solution

Sikizana acts as an **Active Arbitrator**. It doesn't just record what happened; it resolves what went wrong.

The system ingests:
- **Governance Documents**: Bylaws, rules, and penalties.
- **Financial Evidence**: M-Pesa statements, bank PDFs, and CSV records.
- **Natural Language Context**: Member testimonies and dispute details.

It then:
- **Analyzes Evidence**: Using Gemini 1.5/3.1 to reason across financial records and legal bylaws.
- **Multilingual Mediation**: Handles English, Kiswahili, and Sheng naturally to ensure accessibility.
- **Commits Resolutions to Blockchain**: Once a verdict is reached, the agent signs and submits the resolution hash to the **Vara Network**, creating an immutable audit trail for banks and members.

## Features

- **On-chain Dispute Management**: Decentralized tracking of group conflicts.
- **AI-powered mediation** (Gemini 1.5/3.1 & Google ADK).
- **Multilingual support** (English, Kiswahili, Sheng).
- **Deep Multimodal Audit**: AI-driven analysis of M-Pesa and financial PDFs.
- **Premium Resolution**: Professional-grade auditing with M-Pesa payment integration.
- **Transparent Audit Trail**: Every mediation step is verifiable on the Vara blockchain.

## Technical Architecture

### 1. On-chain (Vara Network)
- **Sails Program**: Located in `contracts/sikizana`. Manages the registration and resolution of disputes.
- **Language**: Rust.
- **Framework**: Sails.

### 2. Off-chain (Python Agent)
- **Brain**: Gemini 1.5/3.1 Pro.
- **Orchestration**: Google Agent Development Kit (ADK).
- **Business Logic**: Native "Premium Resolution" workflow with payment simulation.

### 3. Frontend (Next.js)
- **Web3 Layer**: `@gear-js/api` and `@gear-js/react-hooks` for blockchain interaction.
- **Wallet**: Support for Polkadot/Vara extensions (SubWallet, Enkrypt).

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
- [**Business Model & Impact**](docs/BUSINESS_MODEL.md): Global vision, revenue streams, and the ROSCA "Grand Challenge."
- [**Competitive Landscape**](docs/COMPETITIVE_LANDSCAPE.md): The "Active Arbitrator" moat vs. "Passive Ledgers."
- [**Vara Integration Guide**](docs/VARA.md): Details on the on-chain logic and Sails implementation.
- [**Architecture**](docs/ARCHITECTURE.md): Agent logic, tools, and reasoning loops.

## Deployment
Sikizana is deployed on **Google Cloud Run**.
- **Live Demo**: [URL Placeholder]
- **Deployment Guide**: See `infra/deploy.sh`.
