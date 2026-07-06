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

**Writing any user-facing copy?** Read [docs/BRAND.md](docs/BRAND.md)
first — the Siki/Zana duo rule (Siki explains, Zana enforces), honesty
rules, and canonical copy live there.

---

## Live URL

**https://sikizana.persidian.com**

- `/` — Landing page with Siki the Owl mascot
- `/books` — AI Finance Assistant chat (live Xero data)
- `/pricing` — Freemium pricing tiers
- `/impact` — Live impact metrics (money found, issues caught, tax savings)
- `/security` — Plain-English trust page (what we read, what we can't touch, how to leave)
- `/activity` — Session audit trail (journals, chase sends, recoveries)
- `/account` — Plan, billing, weekly digest toggle, and data deletion

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
                                           → Exa search (live HMRC guidance, 24h cache)
                                           → Firecrawl (deep page extraction, 24h cache)
                                           → Gemini Vision (receipt matching)
                                           → Postmark SMTP (chase emails + digest, sender = user's business)
                                           → SQLite (tokens, feedback, audit, impact, webhooks,
                                             chase sequences, session prefs, API cache)
```

Every browser session gets an anonymous HttpOnly cookie; Xero tokens,
conversations, and journal write-backs are scoped to it. A `?session=`
query param is honoured for non-browser clients only — it is never
written into the cookie, so a crafted link can't fixate a victim's
session. Data resolves per session: the user's own org via OAuth (direct
Xero API with `Xero-Tenant-Id`, `Idempotency-Key` on writes, 429 backoff,
pagination), falling back to an allowlisted operator CLI org
(`CLI_SESSION_IDS` — unset disables the fallback entirely so anonymous
visitors never see the operator's real books), falling back to seeded
demo data — with the active mode reported honestly in the UI. A 45s
session-scoped read-through cache sits over every Xero fetch, invalidated
immediately on write.

**Writes are approval-gated at the tool layer, not just the prompt
layer**: `create_xero_journal_entry` is not in the LLM's tool list at
all — the model can only `propose_journal_entry` (renders a card); the
only path that ever posts to Xero is the user clicking Approve, which
calls `/api/xero/journal` directly. Same principle for chasing: the
agent can `draft_invoice_reminder` for a one-off email, but scheduled
follow-ups only start when the user clicks ⚡ Auto-chase.

### Backend (Python / FastAPI)
- **Agent**: `src/agents/bookkeeper.py` — tool-calling loop with NVIDIA NIM (Llama 3.3 70B), Venice fallback, real token streaming. `create_xero_journal_entry` is deliberately NOT in the LLM's tool list (see Architecture above)
- **Tools**: `src/tools/xero_tools.py` — 19 tools (discrepancies, aged receivables, invoices, P&L, tax, journal proposals, chasing, benchmarks, customer scoring, trend analysis)
- **Tax rules**: `src/tools/rag_engine.py` — embedded HMRC rules with citations
- **Context search**: `src/api/main.py` — `/api/context/search`, Exa + Firecrawl, 24h SQLite cache keyed on the intent-mapped query (never the raw user text — chat can contain customer names/amounts)
- **Xero service**: `src/services/xero_service.py` — session-scoped OAuth → allowlisted CLI → mock resolution, with a 45s read-through cache
- **Xero API client**: `src/services/xero_api.py` — direct Accounting API (tenant header, client-supplied idempotency key, rate-limit retry)
- **OAuth**: `src/services/xero_oauth.py` — Connect Your Xero flow (SQLite state store, locked token refresh, session-bound callback to prevent login-CSRF)
- **Vision**: `src/tools/vision_audit.py` — Gemini Vision receipt matching
- **Storage**: `src/services/payment_store.py` — feedback, audit history, impact + webhook events, session prefs, and `delete_session_data` (right-to-erasure)
- **Chase loop**: `src/services/chasing.py` (5-stage ladder incl. Letter Before Action + post-ladder MCOL/DCA checklist), `src/services/chase_store.py` (sequences), `src/jobs/run_chases.py` (daily cron: re-checks payment in Xero, sends the due stage under the user's business name, stops on payment, settles instantly on the Xero payment webhook too)
- **Rates**: `src/services/rates.py` — single source of truth for statutory interest (8% + Bank Rate) and £40/£70/£100 fixed-sum compensation
- **Receivables**: `src/services/receivables.py` — aged 30/60/90 buckets by debtor + true days-to-get-paid (from payment history, not just overdue invoices)
- **API cache**: `src/services/cache.py` — SQLite TTL cache for Exa/Firecrawl results (bounded, survives deploys, shared across workers)
- **Data deletion**: `POST /api/data/delete` — revokes Xero + erases conversations, audit trail, chase sequences, snapshots, and prefs for the session
- **Tests**: `tests/` — 77 tests: report parsing, OAuth state, webhook HMAC, rate limiting, demo-mode tools, chase ladder/scheduling/settlement, caching, data erasure

### Frontend (Next.js / React / Tailwind)
- **Chat**: `web/app/books/page.tsx` — streaming agent chat with tool-call visualization, pre-OAuth consent screen, sector onboarding question, payment-moment celebration
- **WhileAgentWorks**: `web/components/WhileAgentWorks.tsx` — educational content while the agent works (tips + insights + live HMRC)
- **Edu tips**: `web/lib/edu-tips.ts` — curated tip library keyed by tool type
- **Impact**: `web/app/impact/page.tsx` — live metrics dashboard
- **Security**: `web/app/security/page.tsx` — Siki-voiced plain-English trust page
- **Components**: SikiMascot, ZanaMascot, JournalEntryCard, NegotiationEmailCard, AnalysisCard (benchmarks/scorecard/trends/aging), ReceiptUpload, ProactiveAlert, FindingsPanel, WhileAgentWorks, ResponseSummary, etc.
- **Brand**: [`docs/BRAND.md`](docs/BRAND.md) — the Siki/Zana duo rule, honesty rules, canonical copy

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
The agent can `propose_journal_entry` (renders an approval card) but has
no tool to post it — `create_xero_journal_entry` isn't in its tool list
at all. The ONLY path that writes to Xero is the user clicking Approve
on the card, which calls `/api/xero/journal` directly, validates the
account codes server-side, and posts with a client-supplied idempotency
key (so a double-click can't double-post). One-tap reversal available
on any posted entry.

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
confirmation. The pricing page shows the user's own live overdue total
next to the price (never shown for demo data).

### 13. Aged Receivables + True Days-to-Get-Paid
`get_receivables_aging` buckets every unpaid sales invoice into
not-yet-due / 1-30 / 31-60 / 61-90 / 90+ days, grouped by debtor, and
reports how long customers actually take to pay — measured from real
payment history (invoice date → paid date), not just days-past-due on
currently overdue invoices. Renders as a card and a strip in the
findings panel.

### 14. The Chase Loop
⚡ Auto-chase on any overdue invoice schedules a 5-stage escalation
ladder (friendly → firm → final notice with statutory interest + £40/70/100
fixed-sum compensation → recovery warning → Letter Before Action). A
daily cron re-checks each invoice against Xero before sending — a paid
invoice is never chased — and a Xero payment webhook settles sequences
instantly when it fires. Emails send under the user's business name
(not Sikizana's) with Reply-To routed to the user; a distribution
footer rides stages 1-2 only, never the legal-toned later stages.

### 15. The Payment Moment
When a chased invoice gets paid, it's the product's climax, not a log
line: a full-screen celebration on the next visit, a running "£X
recovered by Siki's chasing" tally in the findings panel, and the
weekly digest leads with it plus a week-over-week delta ("your overdue
book SHRANK £X — the chasing is working").

### 16. Trust & Data Control
A pre-OAuth consent screen (what Siki reads, what it can't change, who
else sees your data, how to leave) appears before Xero's own permissions
page. `/security` answers the five questions a nervous user actually
asks, in plain English. "Delete my data" on the Account page revokes the
Xero connection and erases everything stored for the session — available
to anonymous sessions too.

### 17. Honest Sector Benchmarks
`get_sector_benchmarks` uses the sector the user picked during
onboarding (one-tap chips, asked once) before falling back to guessing
from the org name — and says so either way. Figures are labelled
"typical UK ranges · indicative," never presented as live official
statistics.

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
- Postmark (or any SMTP provider) — optional; chase emails and the
  weekly digest log-and-skip safely without it

### Backend
```bash
cp .env.example .env
# Fill in XERO_CLIENT_ID, XERO_CLIENT_SECRET, NVIDIA_API_KEY, GEMINI_API_KEY
# Optional: EXA_API_KEY, FIRECRAWL_API_KEY (for live HMRC guidance)
# Optional: SMTP_HOST/PORT/USER/PASS/FROM (for real chase + digest sends)
# Optional: CLI_SESSION_IDS (comma-separated allowlist for the Xero CLI
#   fallback — unset means every session gets demo data, never the
#   operator's real org)
pip install -r requirements.txt
python -m src.api.main
```

### Scheduled jobs (cron on the VPS)
```bash
# Daily: send due chase-sequence emails, re-checking payment status first
python -m src.jobs.run_chases
# Weekly: send the digest to opted-in users
python -m src.jobs.send_digests
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
| Live web content | Exa instant search + Firecrawl deep scrape (24h cache) |
| Email | Postmark SMTP (chase emails send under the user's business name) |
| Backend | FastAPI, Python 3.11 |
| Frontend | Next.js 16, React 19, Tailwind 4 |
| Database | SQLite (WAL mode) |
| Auth | Xero OAuth2 PKCE |
| Deploy | Docker Compose, Traefik |
| Hosting | Vultr VPS |

---

## Solo Build

Developed by @udirobert for the Xero Hackathon.
