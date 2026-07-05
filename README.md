# Sikizana Books — AI Finance Assistant for Xero

**Find money you're owed. Estimate your tax bill. Fix discrepancies. All in plain English.**

Sikizana Books is an AI finance assistant that connects to Xero and acts
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
User → Next.js frontend → FastAPI backend → NVIDIA NIM (Llama 3.1, streamed)
                                           → Xero API (per-session OAuth2 → CLI → mock)
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
- **Agent**: `src/agents/bookkeeper.py` — tool-calling loop with NVIDIA NIM, real token streaming
- **Tools**: `src/tools/xero_tools.py` — 14 tools (discrepancies, invoices, P&L, tax, journals, reminders, savings)
- **Tax rules**: `src/tools/rag_engine.py` — embedded HMRC rules with citations
- **Xero service**: `src/services/xero_service.py` — session-scoped OAuth → CLI → mock resolution
- **Xero API client**: `src/services/xero_api.py` — direct Accounting API (tenant header, idempotency, rate-limit retry)
- **OAuth**: `src/services/xero_oauth.py` — Connect Your Xero flow (SQLite state store, locked token refresh)
- **Vision**: `src/tools/vision_audit.py` — Gemini Vision receipt matching
- **Storage**: `src/services/payment_store.py` — feedback, audit history, impact + webhook events
- **Tests**: `tests/` — report parsing, OAuth state, webhook HMAC, rate limiting, demo-mode tools

### Frontend (Next.js / React / Tailwind)
- **Chat**: `web/app/books/page.tsx` — streaming agent chat with tool-call visualization
- **Impact**: `web/app/impact/page.tsx` — live metrics dashboard
- **Components**: SikiMascot, JournalEntryCard, ReceiptUpload, ProactiveAlert, etc.

### Deployment
- Docker Compose on VPS (Traefik reverse proxy)
- `./deploy.sh` — one-command deploy script

---

## Key Features

### 1. Proactive Audit
The agent runs `find_discrepancies` automatically when the user opens
the books page — they see value before typing a single word.

### 2. Tax Insights (Cleo Pattern)
`get_tax_insights` estimates Corporation Tax, flags non-deductible
expenses (client entertainment), identifies missed deductions
(software subscriptions), and shows cash flow impact of overdue invoices.

### 3. HMRC Rule Citations
`lookup_tax_rule` returns the relevant UK tax rule with its HMRC source
citation. When the agent says "client entertainment isn't deductible,"
it cites BIM45010.

### 4. Journal Entry Write-Back
`create_xero_journal_entry` posts manual journals directly to Xero —
but only after the user approves a proposed entry. Human-in-the-loop
by design.

### 5. Receipt Matching
Upload a receipt photo → Gemini Vision extracts supplier, amount, date
→ agent matches it to a Xero bank transaction.

### 6. Streaming Tool Calls
The chat streams tool calls in real-time (SSE), so the user sees the
agent's reasoning as it happens — not a black box.

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- Xero OAuth credentials (https://developer.xero.com/myapps)
- NVIDIA NIM API key (or OpenAI-compatible endpoint)
- Google Gemini API key (for vision)

### Backend
```bash
cp .env.example .env
# Fill in XERO_CLIENT_ID, XERO_CLIENT_SECRET, NVIDIA_API_KEY, GEMINI_API_KEY
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
| LLM | NVIDIA NIM (Llama 3.1) |
| Vision | Google Gemini |
| Backend | FastAPI, Python 3.11 |
| Frontend | Next.js 16, React 19, Tailwind 4 |
| Database | SQLite (WAL mode) |
| Auth | Xero OAuth2 |
| Deploy | Docker Compose, Traefik |
| Hosting | Vultr VPS |

---

## Solo Build

Developed by @udirobert for the Xero Hackathon.
