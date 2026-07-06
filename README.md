# Sikizana — Get Paid Faster, with Xero

**Stop money slipping away. See who owes you what, learn what's normal for your industry, and chase effectively.**

Sikizana is an AI credit controller (and bookkeeper) that connects to
Xero. It builds an aged receivables view (30/60/90 days by debtor),
scores customers' payment reliability, compares your numbers against
typical UK sector ranges, drafts escalating chasing emails with
statutory interest and fixed-sum compensation calculated, and lays out
the escalation path from friendly reminder to formal action. On the
side: plain-English P&L, UK Corporation Tax estimates with HMRC
citations, and bookkeeping fixes posted to Xero with human-in-the-loop
approval.

Built for the Xero Hackathon.

---

## Live URL

**https://sikizana.persidian.com**

- `/` — Landing page with Siki the Owl mascot
- `/books` — AI Finance Assistant chat (live Xero data)
- `/pricing` — Freemium pricing tiers
- `/impact` — Live impact metrics (money found, issues caught, tax savings)

---

## The Problem

4.4 million small businesses use Xero. Most don't have an accountant —
or a credit controller. They're owed money they never chase, don't know
whether their late payers are normal or outrageous for their industry,
and don't know the escalation options (statutory interest, fixed-sum
compensation, letter before action) that UK law gives them. Meanwhile
the books drift: unreconciled transactions pile up and the P&L stays
opaque.

## The Solution

Siki the Owl is an AI agent that:
1. **Audits automatically** — runs on page load, before the user types anything
2. **Ages the receivables** — who owes what, bucketed 30/60/90 days, plus true days-to-get-paid
3. **Chases effectively** — escalating reminder emails (negotiation-psychology based) with statutory interest and compensation calculated
4. **Benchmarks honestly** — compares against typical UK sector ranges, clearly labelled as indicative
5. **Scores customers** — RED/AMBER/GREEN payment reliability, flags customers who cost more than they're worth
6. **Estimates tax** — UK Corporation Tax, non-deductible flags, HMRC citations (BIM45010, EIM31240, etc.)
7. **Fixes things** — proposes journal entries; posting happens only via the user's Approve button
8. **Explains everything** — translates accounting jargon into plain English

---

## Architecture

```
User → Next.js frontend → FastAPI backend → NVIDIA NIM (Llama 3.3 70B, streamed)
                                           → Venice AI (fallback when NVIDIA is down)
                                           → Xero API (per-session OAuth2 → CLI → mock)
                                           → Exa search (live HMRC guidance discovery)
                                           → Firecrawl (deep page content extraction)
                                           → Gemini Vision (receipt matching)
                                           → SQLite (tokens, feedback, audit, impact, webhooks)
```

Every browser session gets an anonymous HttpOnly cookie; Xero tokens,
conversations, and journal write-backs are scoped to it. Data resolves
per session: the user's own org via OAuth (direct Xero API with
`Xero-Tenant-Id`, `Idempotency-Key` on writes, 429 backoff, pagination),
falling back to the operator's CLI org, falling back to seeded demo data
— with the active mode reported honestly in the UI.

### Backend (Python / FastAPI)
- **Agent**: `src/agents/bookkeeper.py` — tool-calling loop with NVIDIA NIM (Llama 3.3 70B), Venice fallback, real token streaming
- **Tools**: `src/tools/xero_tools.py` — 15 tools (discrepancies, invoices, P&L, tax, journals, reminders, savings)
- **Tax rules**: `src/tools/rag_engine.py` — embedded HMRC rules with citations
- **Context search**: `src/api/main.py` — `/api/context/search` endpoint using Exa + Firecrawl for live HMRC guidance
- **Xero service**: `src/services/xero_service.py` — session-scoped OAuth → CLI → mock resolution
- **Xero API client**: `src/services/xero_api.py` — direct Accounting API (tenant header, idempotency, rate-limit retry)
- **OAuth**: `src/services/xero_oauth.py` — Connect Your Xero flow (SQLite state store, locked token refresh)
- **Vision**: `src/tools/vision_audit.py` — Gemini Vision receipt matching
- **Storage**: `src/services/payment_store.py` — feedback, audit history, impact + webhook events
- **Chase loop**: `src/services/chasing.py` (5-stage ladder incl. Letter Before Action), `src/services/chase_store.py` (sequences), `src/jobs/run_chases.py` (daily cron: re-checks payment in Xero, sends the due stage, stops on payment)
- **Rates**: `src/services/rates.py` — single source of truth for statutory interest (8% + Bank Rate) and £40/£70/£100 fixed-sum compensation
- **Receivables**: `src/services/receivables.py` — aged 30/60/90 buckets by debtor + true days-to-get-paid
- **Tests**: `tests/` — report parsing, OAuth state, webhook HMAC, rate limiting, demo-mode tools

### Frontend (Next.js / React / Tailwind)
- **Chat**: `web/app/books/page.tsx` — streaming agent chat with tool-call visualization
- **WhileAgentWorks**: `web/components/WhileAgentWorks.tsx` — educational content while the agent works (tips + insights + live HMRC)
- **Edu tips**: `web/lib/edu-tips.ts` — curated tip library keyed by tool type
- **Impact**: `web/app/impact/page.tsx` — live metrics dashboard
- **Components**: SikiMascot, ZanaMascot, JournalEntryCard, NegotiationEmailCard, ReceiptUpload, ProactiveAlert, FindingsPanel, WhileAgentWorks, ResponseSummary, etc.

### Deployment
- Docker Compose on VPS (Traefik reverse proxy)
- `./deploy.sh` — one-command deploy script

---

## Key Features

### 1. Proactive Audit
The agent runs `find_discrepancies` automatically when the user opens
the books page — they see value before typing a single word.

### 2. While Siki Works (Educational Wait Time)
Instead of a blank spinner, the 30-60s wait is filled with three layers:
- **Layer 1**: Curated tips relevant to the current tool (25+ tips, rotated every 4s)
- **Layer 2**: Personalized insights from the user's findings data
- **Layer 3**: Live HMRC guidance from gov.uk via Exa search + Firecrawl deep scrape

### 3. Tax Insights
`get_tax_insights` estimates Corporation Tax, flags non-deductible
expenses (client entertainment), identifies missed deductions
(software subscriptions), and shows cash flow impact of overdue invoices.

### 4. HMRC Rule Citations + Live Guidance
`lookup_tax_rule` returns the relevant UK tax rule with its HMRC source
citation. The While Siki Works panel also fetches live guidance from
gov.uk via Exa + Firecrawl, showing the actual HMRC text inline.

### 5. Journal Entry Write-Back
`create_xero_journal_entry` posts manual journals directly to Xero —
but only after the user approves a proposed entry. Human-in-the-loop
by design.

### 6. Receipt Matching
Upload a receipt photo → Gemini Vision extracts supplier, amount, date
→ agent matches it to a Xero bank transaction.

### 7. Streaming Tool Calls
The chat streams tool calls in real-time (SSE), so the user sees the
agent's reasoning as it happens — not a black box.

### 8. Contextual Zana Nudges
After Siki finds overdue invoices, tax issues, or savings opportunities,
a chip appears suggesting switching to Zana for the action Zana does
better (chasing emails, tax bluntness, savings analysis).

### 9. Negotiation Mode (Chris Voss Tactics)
When Zana drafts a chasing email, she applies negotiation principles
from "Never Split the Difference" — automatically selecting the right
tactic based on how late the invoice is:
- **Mirroring** (1-14 days): rapport-building
- **Calibrated Questions** (15-30 days): "How would you like to resolve this?"
- **Labeling** (31-60 days): "It seems like cash flow is tight right now"
- **No-Oriented Questions** (60+ days): "Would it be a terrible idea to settle?"

Each email card shows the tactic, situation analysis, and a "Why this
works" toggle explaining the psychology — turning each email into a
mini-lesson in negotiation. Copy-to-clipboard and mailto: links let
the user send from any email client with zero infrastructure.

### 10. Behavioral Design
The product applies behavioral psychology principles throughout:
- **Loss aversion**: "£340 slipping away" instead of "£340 you're owed"
- **Cost-of-inaction**: "losing £0.47/day in statutory interest"
- **Peak-end rule**: ResponseSummary card after each agent response
- **Commitment ladder**: "Save" button on findings persists across sessions
- **Social proof**: aggregate activity banner on the activity page

### 11. Persona Handoff
Siki ↔ Zana switching includes context handoff — the new persona gets
a system prompt section explaining it's taking over from the other,
with persona markers in conversation history so past messages show
the correct mascot. Persona persists across page refreshes.

### 12. Conversion-Aware UX
Contextual sign-in nudges at key moments (after first answer, at 3/5
queries), upgrade prompt at 5/5, and clear chat with two-step
confirmation.

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- Xero OAuth credentials (https://developer.xero.com/myapps)
- NVIDIA NIM API key (primary LLM) or Venice API key (fallback)
- Google Gemini API key (for vision)
- Exa API key (optional — live HMRC guidance search)
- Firecrawl API key (optional — deep page content extraction)

### Backend
```bash
cp .env.example .env
# Fill in XERO_CLIENT_ID, XERO_CLIENT_SECRET, NVIDIA_API_KEY, GEMINI_API_KEY
# Optional: EXA_API_KEY, FIRECRAWL_API_KEY (for live HMRC guidance)
pip install -r requirements.txt
python -m src.api.main
```

### Frontend
```bash
cd web
npm install
npm run dev
```

### Deploy
```bash
./deploy.sh          # full deploy
./deploy.sh backend  # backend only
./deploy.sh web      # frontend only
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM (primary) | NVIDIA NIM — Llama 3.3 70B |
| LLM (fallback) | Venice AI — Llama 3.3 70B |
| Vision | Google Gemini |
| Live web content | Exa instant search + Firecrawl deep scrape |
| Backend | FastAPI, Python 3.11 |
| Frontend | Next.js 16, React 19, Tailwind 4 |
| Database | SQLite (WAL mode) |
| Auth | Xero OAuth2 PKCE |
| Deploy | Docker Compose, Traefik |
| Hosting | Vultr VPS |

---

## Solo Build

Developed by @udirobert for the Xero Hackathon.
