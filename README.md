# Sikizana — AI Finance Assistant for Xero

**Find money you're owed. Estimate your tax bill. Fix discrepancies. All in plain English.**

Sikizana is an AI finance assistant that connects to Xero and acts
as a 24/7 bookkeeper for small businesses. It finds overdue invoices,
flags unreconciled transactions, estimates UK Corporation Tax, cites
HMRC rules, and posts journal entries — with human-in-the-loop approval.

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

4.4 million small businesses use Xero. Most don't have an accountant.
They log transactions but never reconcile, ignore overdue invoices, and
don't understand their P&L. When discrepancies pile up, they pay
£200+ for a human bookkeeper — or they let it slide and lose money.

## The Solution

Siki the Owl is an AI agent that:
1. **Audits automatically** — runs on page load, before the user types anything
2. **Finds money** — identifies overdue invoices and unreconciled transactions
3. **Estimates tax** — calculates UK Corporation Tax, flags non-deductible expenses
4. **Cites HMRC rules** — references official guidance (BIM45010, EIM31240, etc.)
5. **Fixes things** — proposes journal entries, posts them to Xero after approval
6. **Explains everything** — translates accounting jargon into plain English

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
- **Tests**: `tests/` — report parsing, OAuth state, webhook HMAC, rate limiting, demo-mode tools

### Frontend (Next.js / React / Tailwind)
- **Chat**: `web/app/books/page.tsx` — streaming agent chat with tool-call visualization
- **WhileSikiWorks**: `web/components/WhileSikiWorks.tsx` — educational content while the agent works (tips + insights + live HMRC)
- **Edu tips**: `web/lib/edu-tips.ts` — curated tip library keyed by tool type
- **Impact**: `web/app/impact/page.tsx` — live metrics dashboard
- **Components**: SikiMascot, ZanaMascot, JournalEntryCard, ReceiptUpload, ProactiveAlert, FindingsPanel, WhileSikiWorks, etc.

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

### 9. Conversion-Aware UX
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
