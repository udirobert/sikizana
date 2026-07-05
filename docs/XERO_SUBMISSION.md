# Sikizana Books — Xero App & Agent Hackathon Submission

## Live URL

**https://sikizana.persidian.com**

- `/` — Landing page with Siki the Owl mascot
- `/books` — AI Finance Assistant chat (live Xero data)
- `/pricing` — Freemium pricing tiers (Stripe-ready)
- `/impact` — Live impact metrics (money found, issues caught, tax savings)

## The Pitch (30 seconds)

Sikizana Books is an AI finance assistant with two personalities: **Siki**
finds you money (savings, deductions, margin improvements), and **Zana**
makes sure you get paid (chases overdue invoices, drafts reminder emails,
flags cash flow cliffs). Both run on live Xero data with 15 tools,
human-in-the-loop journal entries, and HMRC rule citations.

## The Problem

Xero has 4.4 million small business subscribers. Most of them are not
accountants. They log transactions but never reconcile. They ignore
overdue invoices — money they're owed. They don't understand their P&L.
And when tax season arrives, they pay an accountant £200+ to clean up
months of mess — or they file wrong and pay HMRC penalties.

The bookkeeping gap is not a knowledge problem. It's a time and cost
problem. Small businesses know they should reconcile. They just can't
afford the £50-100/month a bookkeeper charges, and they don't have
time to dig through Xero's reports.

## The Solution

Sikizana Books is an AI agent that does what a bookkeeper does — and
more:

1. **Finds money you're owed** — identifies overdue invoices, shows
   who hasn't paid, how much is outstanding, and how long it's overdue.
   Validated pain point: "automatically send invoice reminders for all
   overdue invoices" is a top-voted request on productideas.xero.com.
2. **Drafts invoice reminders** — Zana drafts reminder emails with
   escalating tone (friendly → firm → final notice with late payment
   interest → debt collection), citing the Late Payment of Commercial
   Debts Act 1998. The user reviews and sends — no autonomous emails.
3. **Estimates your tax bill** — calculates UK Corporation Tax, flags
   non-deductible expenses (client entertainment), identifies missed
   deductions (software/subscriptions), and connects cash flow to tax
   liability. Cites HMRC rules (BIM45010, EIM31240) with source
   references.
4. **Finds savings opportunities** — analyzes the P&L and transactions
   to identify unused software subscriptions, high expense ratios, and
   margin improvement opportunities. Ranked by financial impact.
5. **Audits your books** — finds unreconciled bank transactions, overdue
   invoices, and trial balance imbalances automatically.
6. **Explains your finances** — translates "Net Profit: -£2,705" into
   "You're running at a loss. Your rent is 41% of expenses. Sales
   aren't covering costs yet."
7. **Fixes discrepancies** — proposes journal entries with the right
   account codes, waits for your approval, then posts directly to Xero.
   Human-in-the-loop by design.
8. **Matches receipts** — multimodal vision AI reads receipt photos and
   matches them to Xero bank transactions.

## Siki & Zana — Dual Persona Mascots

**Siki the Owl** is the friendly face of Sikizana Books — warm orange
plumage, sky-blue eyes, gentle animations. Siki finds savings, explains
finances in plain English, and celebrates when you fix things.

**Zana the Owl** is Siki's alter ego — dark slate plumage, rose-red
eyes, sharper presence. Zana chases payments, drafts firm reminder
emails, flags non-deductible expenses bluntly, and warns about cash
flow cliffs. The "bad cop" to Siki's "good cop."

Both mascots are built entirely from SVG `<rect>` elements (pixel art
style, inspired by Claude AI's mascot approach). Siki has five animated
moods:

- **Idle** — gentle breathing (waiting for you)
- **Look** — eyes shift left/right (investigating your books)
- **Wave** — wing rotates up/down (greeting)
- **Walk** — body bobs, wings sway (strolling through transactions)
- **Celebrate** — hops with confetti (journal entry approved!)

All animations are CSS keyframe-based — no images, no GIFs, no video
files. Pure code, ~5KB total.

Users toggle between Siki and Zana with a pill switch in the chat
header. The mascot, system prompt, sample queries, and action center
all adapt to the selected persona.

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
User asks a question (as Siki or Zana)
  ↓
Bookkeeper Agent (Llama 3.1 via NVIDIA NIM)
  ├── find_discrepancies()           → scans for unreconciled + overdue
  ├── get_xero_transactions()        → searches bank transactions by reference
  ├── get_xero_invoices()            → lists invoices with overdue flags
  ├── get_xero_chart_of_accounts()   → gets account codes for journal entries
  ├── get_xero_profit_and_loss()     → pulls P&L for plain-English explanation
  ├── get_xero_balance_sheet()       → pulls balance sheet
  ├── get_xero_contacts()            → searches customers/suppliers
  ├── get_xero_organisation()        → reads org details
  ├── match_receipt_to_transaction() → Vision AI reads receipt photo
  ├── propose_journal_entry()        → generates the fixing entry (awaiting approval)
  ├── create_xero_journal_entry()    → posts journal to Xero (after approval)
  ├── get_tax_insights()             → estimates CT, flags non-deductible expenses
  ├── lookup_tax_rule()              → cites HMRC rules (BIM45010, EIM31240, etc.)
  ├── draft_invoice_reminder()       → drafts reminder email (escalating tone)
  └── get_savings_opportunities()    → finds unused subscriptions, margin gaps
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

**As Siki (good cop):**
1. "Can you check my books and tell me if everything is reconciled?"
2. "Give me my P&L and explain it in plain English."
3. "Can you estimate my Corporation Tax and check if I'm missing any deductible expenses?"

**As Zana (bad cop — toggle in chat header):**
4. "Draft a firm reminder email for my most overdue invoice. Include late payment interest."
5. "What am I overpaying in tax? Check for non-deductible expenses and missed deductions."
6. "Analyze my expenses and find savings opportunities. What am I wasting money on?"

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

1. **Dual persona — Siki & Zana.** The good cop / bad cop pattern maps
   to how real accounting firms work: the friendly advisor who finds
   savings, and the enforcer who chases payments. This is the demo
   moment judges remember.

2. **Real agent, not a chatbot wrapper.** 15 tools orchestrated
   autonomously — it plans, gathers evidence, cross-references, drafts
   communications, and proposes fixes. That's agentic AI, not a prompt
   template.

3. **Action Center.** Not just a chat — the sidebar shows a prioritized
   action list based on the proactive audit. "1. Chase overdue invoices
   (£270). 2. Reconcile 9 transactions. 3. Check tax & deductions."
   Click to act.

4. **Invoice chasing with legal teeth.** Zana drafts reminder emails
   that escalate from friendly to final notice, citing the Late Payment
   of Commercial Debts Act 1998 and calculating statutory interest.
   No other Xero app does this.

5. **HMRC rule citations.** When the agent says "client entertainment
   isn't deductible," it cites BIM45010. This builds trust and
   credibility — it's not making things up.

6. **Savings finder.** Analyzes the P&L for unused subscriptions, high
   expense ratios, and margin improvement opportunities. Ranked by
   financial impact. Goes beyond bookkeeping into financial advisory.

7. **Streaming transparency.** Users see every tool call and result in
   real-time. No black box — you watch the agent investigate your books.

8. **Human-in-the-loop.** The agent proposes, the human approves. No
   autonomous journal entries or sent emails without consent.

9. **Multimodal.** Receipt photos → Vision AI → matched to Xero
   transactions.

10. **Memorable mascots.** Siki (warm, orange) and Zana (dark, sharp)
    give the product personality and make AI bookkeeping feel
    approachable — not intimidating.

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
