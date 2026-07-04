# Sikizana Books — Xero App & Agent Hackathon Submission

## Live URL

**https://sikizana.persidian.com**

- `/` — Landing page with Siki the Owl mascot
- `/books` — AI Bookkeeper chat (live Xero data)
- `/arbitrate` — Savings group arbitration (legacy feature)

## The Pitch (30 seconds)

Sikizana Books is an AI bookkeeper that reads your Xero books, finds the
discrepancies your accountant would charge you £200 to find, explains
everything in plain English, and proposes the fixing journal entries.

Meet **Siki the Owl** — your AI bookkeeping companion. Siki watches over
your books, finds what others miss, and talks to you in plain English.

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

## Siki the Owl — Mascot & Brand

Siki is the face of Sikizana Books. Built entirely from SVG `<rect>`
elements (pixel art style, inspired by Claude AI's mascot approach),
Siki has five animated moods that reflect the app's state:

- **Idle** — gentle breathing (waiting for you)
- **Look** — eyes shift left/right (investigating your books)
- **Wave** — wing rotates up/down (greeting)
- **Walk** — body bobs, wings sway (strolling through transactions)
- **Celebrate** — hops with confetti (journal entry approved!)

All animations are CSS keyframe-based — no images, no GIFs, no video
files. Pure code, ~5KB total.

Siki appears in the nav, chat header, empty states, loading
indicators, success overlays, and the homepage hero with a speech
bubble that changes based on mood.

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

**Streaming transparency**: The agent streams tool calls and results
in real-time via Server-Sent Events (SSE). Users see exactly which
Xero tools the agent is calling and what it found — no black box.

The agent always proposes before acting. Journal entries require user
approval. This is human-in-the-loop design — the agent does the
analysis, the human makes the final call.

## Demo

Visit **https://sikizana.persidian.com/books** to chat with Siki. The
demo runs on **live Xero data** from a Demo Company (UK) with:

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
- **Auto-audit on page load** — Siki runs `find_discrepancies`
  automatically when you open `/books` and shows a notification
- **Webhook alerts** — when Xero pushes a webhook, Siki surfaces
  a proactive alert
- **Receipt upload** — drag a receipt photo onto the chat, Siki
  reads it with vision AI and matches it to a transaction
- **Success animation** — when you approve a journal entry, Siki
  celebrates with confetti and a transitions.dev success check
- **Rotated reveal transition** — Codrops-inspired page transition
  when entering the books page

## Tech Stack

| Layer | Technology |
|---|---|
| Agent brain | Llama 3.3 70B (NVIDIA NIM) |
| Agent orchestration | Custom tool-calling loop (OpenAI-compatible) |
| Xero integration | Xero CLI + Xero Webhooks |
| Backend | Python / FastAPI |
| Frontend | Next.js 16 / React 19 / Tailwind CSS |
| Mascot | Siki the Owl — pure SVG pixel art, CSS keyframe animations |
| Vision | Multimodal receipt matching |
| Motion design | transitions.dev patterns, Codrops rotated reveal, Emil Kowalski design engineering |
| Deployment | Docker Compose on VPS, Coolify Traefik proxy, Let's Encrypt HTTPS |

## Deployment

Both frontend and backend run on a single VPS (144.202.117.160) via
Docker Compose, behind Coolify's Traefik proxy:

- `sikizana-api` — FastAPI backend on port 8081
- `sikizana-web` — Next.js standalone on port 3000
- Traefik routes `/api/*` to the backend, everything else to the frontend
- HTTPS via Let's Encrypt (auto-renewed by Traefik)

## Why This Wins

1. **Real agent, not a chatbot wrapper.** The agent has 10 tools it
   orchestrates autonomously — it plans, gathers evidence, cross-references,
   and proposes fixes. That's agentic AI, not a prompt template.

2. **Streaming transparency.** Users see every tool call and result in
   real-time. No black box — you watch Siki investigate your books.

3. **Solves a real, expensive problem.** 4.4M Xero subscribers. Most
   can't afford a bookkeeper. This replaces £50-100/month of bookkeeping
   labour with an AI agent that costs pence per query.

4. **Human-in-the-loop.** The agent proposes, the human approves. No
   autonomous journal entries without consent. Safe by design.

5. **Multimodal.** Receipt photos → Vision AI → matched to Xero
   transactions. This is the bridge between physical and digital
   bookkeeping that small businesses actually need.

6. **Proactive, not reactive.** Webhooks mean Siki comes to you —
   "Hey, you have a new unreconciled transaction" — instead of waiting
   for you to notice problems at tax time.

7. **Memorable mascot.** Siki the Owl gives the product personality
   and makes AI bookkeeping feel approachable — not intimidating.

## Team

Solo build by @udirobert, using AI-assisted development tools.

## What's Next

- **Xero App Store listing** — package as a Xero app for distribution
  to 4.4M subscribers.
- **Premium tier** — free audit, paid auto-fix (Siki posts the
  journal entries for you after approval).
- **Receipt inbox** — WhatsApp/email forwarding for receipt matching
  without leaving the chat.
- **Tax readiness** — generate VAT returns and year-end preparation
  summaries from the reconciled data.
