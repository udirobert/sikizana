# Sikizana Books — Xero App & Agent Hackathon Submission

## The Pitch (30 seconds)

Sikizana Books is an AI bookkeeper that reads your Xero books, finds the
discrepancies your accountant would charge you £200 to find, explains
everything in plain English, and proposes the fixing journal entries.

We built it by repurposing the agent architecture from our Kenyan chama
arbitration platform (Sikizana) — because the core problem is identical:
nobody reconciles their books, and when discrepancies pile up, nobody
can afford to fix them.

## The Problem

Xero has 4.4 million small business subscribers. Most of them are not
accountants. They log transactions but never reconcile. They ignore
overdue invoices. They don't understand their P&L. When tax season
arrives, they pay an accountant £200+ to clean up months of mess — or
they file wrong and pay penalties.

The bookkeeping gap is not a knowledge problem. It's a cost problem.
Small businesses know they should reconcile. They just can't afford
the £50-100/month a bookkeeper charges, and Xero's built-in
reconciliation tools require you to know what you're doing.

## The Solution

Sikizana Books is an AI agent that does what a bookkeeper does:

1. **Audits your books** — finds unreconciled bank transactions, overdue
   invoices, and trial balance imbalances automatically.
2. **Identifies what things are** — reads bank transaction references
   ("CARD PAYMENT 0542 12JUN LIDL") and classifies them correctly.
3. **Matches receipts** — multimodal vision AI reads receipt photos and
   matches them to Xero bank transactions.
4. **Explains your finances** — translates "Net Profit: -£2,705" into
   "You're running at a loss. Your rent is 41% of expenses. Sales
   aren't covering costs yet."
5. **Proposes fixes** — generates correct journal entries with the
   right account codes, and waits for your approval before posting.

## How It Uses Xero

Sikizana Books integrates with Xero via:

- **Xero CLI** — OAuth2 PKCE authentication and full API access. The
  agent shells out to `xero` commands with `--json` output for
  structured data retrieval.
- **Xero Webhooks** — real-time event notifications. When a new
  transaction or invoice lands in Xero, Xero pushes a webhook to our
  endpoint, and the agent proactively alerts the user — no polling
  required.

### Xero data the agent reads:
- Bank transactions (reconciled vs unreconciled)
- Invoices (sales + bills, with overdue detection)
- Chart of accounts (for correct journal entry account codes)
- Profit & Loss report
- Balance Sheet
- Trial Balance
- Contacts (customers + suppliers)
- Organisation details

## Agent Architecture

```
User asks a question
  ↓
Bookkeeper Agent (Llama 3.3 70B via NVIDIA NIM)
  ├── find_discrepancies()        → scans for unreconciled + overdue + TB imbalance
  ├── get_xero_transactions()     → searches bank transactions by reference
  ├── get_xero_invoices()         → lists invoices with overdue flags
  ├── get_xero_chart_of_accounts()→ gets account codes for journal entries
  ├── get_xero_profit_and_loss()  → pulls P&L for plain-English explanation
  ├── get_xero_balance_sheet()    → pulls balance sheet
  ├── get_xero_contacts()         → searches customers/suppliers
  ├── match_receipt_to_transaction() → Vision AI reads receipt photo
  └── propose_journal_entry()     → generates the fixing entry (awaiting approval)
  ↓
Plain-English response with findings + recommended actions
```

The agent uses OpenAI-compatible function calling via NVIDIA NIM. The
NVIDIA API handles tool-call orchestration; we execute the actual
Python functions that call the Xero CLI and feed results back.

The agent always proposes before acting. Journal entries require user
approval. This is human-in-the-loop design — the agent does the
analysis, the human makes the final call.

## Demo

Visit `/books` to chat with the bookkeeper. The demo runs on **live
Xero data** from a Demo Company (UK) with:

- 23 bank transactions (9 unreconciled)
- 10 invoices (1 overdue, £270.63 outstanding)
- P&L: Revenue £5,039.80, Net Profit £4,883.13
- 90 accounts, 52 contacts

Try these queries:
1. "Can you check my books and tell me if everything is reconciled?"
2. "Show me all overdue invoices. Who hasn't paid?"
3. "Give me my P&L and explain it in plain English."
4. "What are these unreconciled transactions?"

### Proactive features:
- **Auto-audit on page load** — the agent runs `find_discrepancies`
  automatically when you open `/books` and shows a notification
- **Webhook alerts** — when Xero pushes a webhook, the agent surfaces
  a proactive alert
- **Receipt upload** — drag a receipt photo onto the chat, the agent
  reads it with vision AI and matches it to a transaction
- **Success animation** — when you approve a journal entry, a
  transitions.dev success check plays

## Tech Stack

| Layer | Technology |
|---|---|
| Agent brain | Llama 3.3 70B (NVIDIA NIM) |
| Agent orchestration | Custom tool-calling loop (OpenAI-compatible) |
| Xero integration | Xero CLI + Xero Webhooks |
| Backend | Python / FastAPI |
| Frontend | Next.js 16 / React 19 / Tailwind CSS |
| Vision | Multimodal receipt matching |
| Motion design | transitions.dev patterns, Emil Kowalski design engineering |

## Why This Wins

1. **Real agent, not a chatbot wrapper.** The agent has 10 tools it
   orchestrates autonomously — it plans, gathers evidence, cross-references,
   and proposes fixes. That's agentic AI, not a prompt template.

2. **Solves a real, expensive problem.** 4.4M Xero subscribers. Most
   can't afford a bookkeeper. This replaces £50-100/month of bookkeeping
   labour with an AI agent that costs pence per query.

3. **Human-in-the-loop.** The agent proposes, the human approves. No
   autonomous journal entries without consent. Safe by design.

4. **Multimodal.** Receipt photos → Vision AI → matched to Xero
   transactions. This is the bridge between physical and digital
   bookkeeping that small businesses actually need.

5. **Proactive, not reactive.** Webhooks mean the agent comes to you —
   "Hey, you have a new unreconciled transaction" — instead of waiting
   for you to notice problems at tax time.

6. **Proven architecture.** We didn't build from scratch — we repurposed
   a working agent architecture from our Kenyan chama arbitration
   platform. The reasoning loop (gather evidence → analyse → propose
   fix → await approval) is battle-tested in a harder domain
   (multilingual, informal financial records).

## Team

Solo build by @udirobert, using AI-assisted development tools. The
underlying agent architecture was built and tested in production for
the Kenyan chama (ROSCA) market.

## What's Next

- **Xero App Store listing** — package as a Xero app for distribution
  to 4.4M subscribers.
- **Premium tier** — free audit, paid auto-fix (the agent posts the
  journal entries for you after approval).
- **Receipt inbox** — WhatsApp/email forwarding for receipt matching
  without leaving the chat.
- **Tax readiness** — generate VAT returns and year-end preparation
  summaries from the reconciled data.
