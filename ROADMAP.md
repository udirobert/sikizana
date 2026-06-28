# Sikizana Project Roadmap

This roadmap tracks the journey from hackathon prototype to a revenue-generating AI mediation business for informal savings groups.

## Phase 1: Foundation (Complete)
*Core agent infrastructure and tooling.*

- [x] **Core Agent Infrastructure**: Python/FastAPI backend with Gemini 1.5/3.1 Pro.
- [x] **Multilingual Persona**: Sheng/Kiswahili grounding for authentic mediation.
- [x] **Tool Foundation**: RAG (Bylaws), Financial Analysis (M-Pesa PDFs/CSVs), Vision Audit (ledger photos).
- [x] **On-chain Verdicts**: Vara Network (Sails/Rust) smart contract for immutable dispute resolution.
- [x] **IPFS Evidence Storage**: Pinata integration for verifiable evidence CIDs.
- [x] **Reputation Service**: Chama Health Score and Bank Readiness Report generation.
- [x] **Web3 Frontend**: Next.js + Vara wallet integration (SubWallet/Enkrypt).

## Phase 2: Real Revenue (In Progress)
*Targeting the 90-Day AI Business hackathon. The hurdle: real customers, real M-Pesa payments, real revenue.*

- [x] **Daraja STK Push Integration**: Real M-Pesa payments via Safaricom Daraja API (replaces simulation).
- [x] **Payment Persistence**: SQLite store tracking every payment from PENDING to CONFIRMED.
- [x] **Revenue Dashboard API**: `GET /api/revenue` endpoint for hackathon revenue evidence.
- [x] **Agent Payment Gating**: `verify_premium_payment` tool prevents deep audit without confirmed payment.
- [ ] **Safaricom Business Onboarding**: Register paybill/till number for production Daraja access.
- [ ] **Business Registration**: Kenyan LLC/Ltd for corporate ID submission.
- [ ] **Pilot Chama Acquisition**: Onboard 3-5 real chamas as paying customers.
- [ ] **Production Deployment**: Cloud Run with public callback URL for Daraja webhooks.
- [ ] **Marketing & GTM**: Community outreach, SACCO partnerships, chama federation networks.

## Phase 3: Scale & Intelligence
*Expanding usability, intelligence, and reach beyond the pilot.*

- [ ] **Voice-First Mediation**: Google Speech-to-Text for voice-based disputes (Sheng/Kiswahili).
- [ ] **WhatsApp Bot**: Twilio/WhatsApp interface for low-bandwidth community access.
- [ ] **Direct M-Pesa Tracking**: Daraja C2B/B2C for automatic transaction verification (no manual uploads).
- [ ] **Document Ingestion**: Robust OCR for handwritten meeting notes and legacy ledgers.
- [ ] **SACCO & Microfinance Support**: Expand beyond chamas to formal cooperative societies.
- [ ] **Fraud & Anomaly Detection**: AI that alerts treasurers to suspicious transaction patterns.
- [ ] **Automated Legal Prep**: Generate mediation summaries ready for Small Claims Court.
- [ ] **Multi-Agent Negotiation**: Specialized agents for each party (Member vs. Treasurer).

## Phase 4: Global ROSCA Protocol
*Transforming the trust infrastructure of collective finance worldwide.*

- [ ] **Multi-country Expansion**: Adapt for Sou-sou (West Africa), Tandas (Latin America), Stokvels (South Africa).
- [ ] **Bank Integration API**: Sell Chama Health Scores to microfinance institutions for credit scoring.
- [ ] **Governance Layer**: On-chain bylaw execution with automatic penalty enforcement.

---
*Last updated: 28 June 2026*
