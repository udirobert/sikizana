# Sikizana — Xero App & Agent Hackathon Submission

## Live URL

**https://sikizana.persidian.com**

- `/` — Landing page with Siki the Owl mascot
- `/books` — AI Finance Assistant chat (live Xero data)
- `/pricing` — Freemium pricing tiers (Stripe-ready)
- `/impact` — Live impact metrics (money found, issues caught, tax savings)

## The Pitch (30 seconds)

Sikizana is an AI finance assistant with two personalities: **Siki**
finds you money (savings, deductions, margin improvements), and **Zana**
makes sure you get paid (chases overdue invoices, drafts reminder emails,
flags cash flow cliffs). Both run on live Xero data with 15 tools,
human-in-the-loop journal entries, HMRC rule citations, and live gov.uk
guidance fetched in real-time via Exa + Firecrawl.

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

Sikizana is an AI agent that does what a bookkeeper does — and
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

**Siki the Owl** is the friendly face of Sikizana — warm orange
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

Sikizana integrates with Xero via:

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
Bookkeeper Agent (Llama 3.3 70B via NVIDIA NIM, Venice fallback)
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
While Siki Works (educational content while the agent runs)
  ├── Layer 1: Curated tips rotated by tool type (25+ tips, every 4s)
  ├── Layer 2: Personalized insights from findings data
  └── Layer 3: Live HMRC guidance via Exa search + Firecrawl deep scrape
  ↓
Plain-English response with findings + recommended actions
  ↓
Contextual Zana nudge (if overdue/tax/savings detected)
  ↓
Sign-in nudge (if anonymous, after first answer or at 3/5 queries)
```

The agent uses OpenAI-compatible function calling via NVIDIA NIM
(Llama 3.3 70B, primary). If NVIDIA times out or errors, it falls
back to Venice AI (llama-3.3-70b). The tool-calling loop is
model-agnostic — any OpenAI-compatible provider works.

**Streaming transparency**: The agent streams tool calls and results
in real-time via Server-Sent Events (SSE). Users see exactly which
Xero tools the agent is calling and what it found — no black box.

**While Siki Works**: Instead of a blank spinner, the wait time is
filled with three layers of educational content:
1. Curated tips relevant to the current tool (rotated every 4s)
2. Personalized insights from the user's findings data
3. Live HMRC guidance from gov.uk, fetched via Exa instant search
   (~250ms) and deep-scraped via Firecrawl for the actual guidance text

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
- **While Siki Works** — while the agent runs tools, the user sees
  rotating educational tips, personalized insights from their findings,
  and live HMRC guidance from gov.uk (Exa search + Firecrawl scrape)
- **Contextual Zana nudges** — after Siki finds overdue invoices,
  tax issues, or savings opportunities, a chip appears suggesting
  switching to Zana for the action Zana does better (chasing, tax
  bluntness, savings analysis)
- **Sign-in nudges** — anonymous users get contextual prompts to sign
  in after their first answer, at 3/5 queries, and at 5/5 (upgrade)
- **Clear chat with confirmation** — trash icon + two-step confirm
  so users don't accidentally lose their conversation
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
| Agent brain | Llama 3.3 70B (NVIDIA NIM, primary) → Llama 3.3 70B (Venice, fallback) |
| Agent orchestration | Custom tool-calling loop (OpenAI-compatible, model-agnostic) |
| Xero integration | Xero CLI + Xero Webhooks + direct Accounting API (OAuth2 PKCE) |
| Live HMRC content | Exa instant search (discovery) + Firecrawl deep scrape (extraction) |
| Backend | Python / FastAPI |
| Frontend | Next.js 16 / React 19 / Tailwind CSS |
| Mascot | Siki the Owl — pure SVG pixel art, CSS keyframe animations |
| Vision | Google Gemini (receipt matching) |
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
   savings, and the enforcer who chases payments. Contextual nudges
   in the chat suggest switching to Zana at the right moment — after
   finding overdue invoices, tax issues, or savings opportunities.

2. **Real agent, not a chatbot wrapper.** 15 tools orchestrated
   autonomously — it plans, gathers evidence, cross-references, drafts
   communications, and proposes fixes. That's agentic AI, not a prompt
   template.

3. **While Siki Works — educational wait time.** Instead of a blank
   spinner, the 30-60s wait becomes value delivery: rotating tips
   relevant to the current tool, personalized insights from the user's
   findings, and live HMRC guidance from gov.uk fetched via Exa +
   Firecrawl. Users learn while they wait.

4. **Live HMRC guidance with deep content.** Exa instant search finds
   the right gov.uk page (~250ms), Firecrawl scrapes it for clean
   markdown (~2-5s), and the most relevant paragraph is extracted and
   shown inline. Users get the actual HMRC guidance text without
   leaving the chat — a critical trust signal for a finance product.

5. **Invoice chasing with legal teeth.** Zana drafts reminder emails
   that escalate from friendly to final notice, citing the Late Payment
   of Commercial Debts Act 1998 and calculating statutory interest.
   No other Xero app does this.

6. **HMRC rule citations.** When the agent says "client entertainment
   isn't deductible," it cites BIM45010 — and the While Siki Works
   panel shows the actual HMRC manual page from gov.uk.

7. **Savings finder.** Analyzes the P&L for unused subscriptions, high
   expense ratios, and margin improvement opportunities. Ranked by
   financial impact. Goes beyond bookkeeping into financial advisory.

8. **Streaming transparency.** Users see every tool call and result in
   real-time. No black box — you watch the agent investigate your books.

9. **Human-in-the-loop.** The agent proposes, the human approves. No
   autonomous journal entries or sent emails without consent.

10. **Conversion-aware UX.** Contextual sign-in nudges at key moments
    (after first answer, at 3/5 queries), upgrade prompt at 5/5, and
    a clear chat flow with two-step confirmation. The product is
    designed for the funnel, not just the demo.

11. **Memorable mascots.** Siki (warm, orange) and Zana (dark, sharp)
    give the product personality and make AI bookkeeping feel
    approachable — not intimidating.

## Team

Solo build by @udirobert, using AI-assisted development tools.

## What's Next

### Completed Post-Hackathon

- **Behavioral design system** — loss aversion framing ("£340 slipping
  away"), cost-of-inaction counters (daily statutory interest), peak-end
  summary cards, commitment ladder (Save findings), social proof banner
  on activity page.
- **Negotiation mode** — Chris Voss "Never Split the Difference" tactics
  integrated into Zana's chasing emails. Each email shows the tactic,
  situation analysis, and psychology. Copy + mailto: for zero-infrastructure
  sending.
- **Persona handoff** — Siki ↔ Zana switching now includes context handoff
  with persona markers in history, so the new persona knows it's taking
  over. Persona persists across page refreshes.
- **Agent robustness** — two-tier streaming timeout (60s first token, 15s
  inter-token), duplicate tool-call detection, retry after stream failure.
- **Aggregate activity** — social proof banner showing weekly queries,
  tool calls, journals posted, and active users.

### Roadmap

- **Xero App Store listing** — package as a Xero app for distribution
  to 4.4M subscribers.
- **Premium tier** — free audit, paid auto-fix (Siki posts the
  journal entries for you after approval).
- **Receipt inbox** — WhatsApp/email forwarding for receipt matching
  without leaving the chat.
- **Tax readiness** — generate VAT returns and year-end preparation
  summaries from the reconciled data.
- **Industry benchmarking** — use Firecrawl to scrape ONS sector data
  and compare the user's margins against their industry average.
- **Email automation (Make/Zapier)** — let users connect their email
  (Gmail/Outlook) via Make or Zapier webhooks so Zana's drafted emails
  can be sent directly. Currently uses copy + mailto: (zero setup,
  works with any email client). Make/Zapier is the upgrade path for
  power users who want automated sending with audit trails.
- **Cross-session memory (cognee)** — evaluate cognee.ai for knowledge
  graph + vector store memory across sessions. Would enable remembering
  user preferences, past findings, actions taken, and negotiation
  history. Currently uses SQLite conversation history with persona
  markers (sufficient for single-session, not cross-session).
- **Workflow automation** — evaluate TinyFish Agent API for automating
  browser-based workflows (HMRC filing navigation, Xero reconciliation
  UI automation) with human-in-the-loop safeguards.
- **Live regulatory alerts** — monitor gov.uk for tax rate changes and
  filing deadline updates, push proactive alerts to users.
