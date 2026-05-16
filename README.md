# Sikizana

AI-powered dispute resolution for chamas.

Sikizana is an autonomous AI mediation agent built for Kenyan chamas. It analyzes bylaws, contribution histories, and M-Pesa records to help resolve disputes fairly and transparently in English, Kiswahili, and Sheng.

Built for the GDG Nairobi Agentathon.

## The Problem

Kenya has over 300,000 registered chamas managing billions of shillings in collective savings, lending, and investments.

Most chamas do not collapse because of poor financial performance — they collapse because of unresolved internal disputes:
- Missed contributions
- Loan repayment disagreements
- Treasurer transparency concerns
- Conflicting interpretations of bylaws
- Withdrawal disputes
- Poor record keeping

These conflicts are often emotional, undocumented, and difficult to mediate fairly.

## Our Solution

Sikizana acts as an AI arbitration and mediation agent for chamas.

The system ingests:
- Chama bylaws
- M-Pesa statements
- Contribution records
- Loan histories
- Meeting notes and dispute context

It then:
- Understands disputes in natural language
- Handles English, Kiswahili, and Sheng inputs
- Retrieves relevant chama rules using RAG
- Verifies claims against financial records
- Generates transparent mediation recommendations
- Maintains memory and context across conversations

Rather than replacing chama leadership, Sikizana acts as an impartial assistant that helps groups reach faster, evidence-based resolutions.

## Why “Sikizana”

“Sikizana” means listen to each other in Kiswahili.

The project is built around the idea that most community disputes escalate because people stop listening, trust breaks down, and records become difficult to verify. Sikizana combines AI reasoning with financial evidence and community governance rules to rebuild trust through transparent mediation.

## Features

- AI-powered dispute mediation
- Multilingual support (English, Kiswahili, Sheng)
- Retrieval-Augmented Generation (RAG)
- M-Pesa statement analysis
- Contribution verification
- Loan repayment reconstruction
- Transparent bylaw citation
- Agent memory and context retention
- Conversational arbitration workflow
- Audit trail for decisions

## Example Use Cases

### Missed Contribution Claim
A member says they already sent their monthly contribution through M-Pesa. Sikizana checks transaction records and validates the payment.

### Loan Balance Dispute
Two members disagree on the remaining balance of a chama loan. Sikizana reconstructs repayment history and references the chama’s lending policies.

### Rule Interpretation Conflict
Members disagree about whether someone can withdraw funds early. Sikizana retrieves the relevant bylaw clauses and explains the applicable rules.

## Agent Architecture

Sikizana is designed as a genuine AI agent system — not just a chatbot.

The system demonstrates:
- Tool use
- Memory
- Retrieval
- Multi-step reasoning
- Autonomous evidence gathering
- Context-aware mediation

### Workflow
1. User submits dispute through chat or voice
2. Agent retrieves relevant bylaws and financial records
3. Agent analyzes contribution and transaction history
4. Agent evaluates conflicting claims
5. Agent generates mediation recommendation with citations
6. Conversation memory preserves dispute context over time

## Tech Stack

### Core AI
- Gemini 1.5 Pro / Flash
- Google AI Studio
- Vertex AI Agent Builder
- Google ADK
- Gemini CLI

### Infrastructure
- Firebase
- Firestore
- Cloud Run
- Firebase Hosting

### Intelligence Layer
- RAG pipeline for bylaws and records
- OCR + document parsing
- M-Pesa statement ingestion
- Multilingual prompt orchestration

## Google Cloud & Agentathon Requirements

Sikizana is built in compliance with all mandatory GDG Nairobi Agentathon technical requirements:
- Uses Gemini models for core reasoning and mediation
- Built using Google AI tooling
- Deployed on Google Cloud Run
- Public GitHub repository
- Demonstrates genuine agent behavior
- Supports autonomous reasoning and retrieval workflows

## Vision

Trust is infrastructure.

Chamas are one of Africa’s most important systems for collective finance and community coordination. Sikizana strengthens that trust layer using AI that is culturally local, multilingual, transparent, and community-first.

## Future Roadmap

- WhatsApp integration
- Voice-first mediation
- SACCO support
- Cooperative governance tooling
- Fraud and anomaly detection
- Meeting summarization
- AI-generated financial transparency reports
- Multi-agent negotiation simulations

## Team

Built at the GDG Nairobi Agentathon — exploring how autonomous AI agents can solve real Kenyan problems through practical, deployable systems.

## Pre-commit hooks (secrets & linting)

This project uses `pre-commit` to run lightweight checks before commits. It protects against accidentally committing secrets and runs project linters.

Setup (one-time for each developer):

```bash
# Install Python pre-commit and detect-secrets
pip install --user pre-commit detect-secrets

# Install Node dev dependencies
npm install

# Create a secrets baseline (inspect results before committing it)
detect-secrets scan > .secrets.baseline

# Install the git hooks
pre-commit install

# Verify hooks against all files once
pre-commit run --all-files
```

Notes:
- The hooks are defined in `.pre-commit-config.yaml` and include `detect-secrets-hook` plus a local hook that runs `npm run lint`.
- If `detect-secrets` finds secrets in the initial scan, review them carefully and remove or rotate them before committing the baseline.

