# Sikizana — Find Money. Stop Leaks. Get Paid.

**See money at risk, stop preventable leakage, and recover what you are owed — with Xero.**

Sikizana is an AI finance assistant that connects to Xero and remembers every
conversation in Supermemory Local. It builds an aged receivables view (30/60/90
days by debtor), scores payment reliability, compares numbers against typical
UK sector ranges, drafts escalating chasing emails with statutory interest and
fixed-sum compensation, and lays out the escalation path from friendly reminder
to formal action. It also explains the P&L, estimates UK Corporation Tax with
HMRC citations, proposes approval-gated bookkeeping fixes, and includes AP
Integrity: evidence-backed duplicate bill/payment and payable-risk review.

**Writing any user-facing copy?** Read [docs/BRAND.md](docs/BRAND.md)
first — the Siki/Zana duo rule (Siki explains, Zana enforces), honesty
rules, and canonical copy live there.

---

## Live URL

**https://sikizana.persidian.com**

- `/` — Product landing page focused on money found, protected, and recovered
- `/books` — AI Finance Assistant workspace and finance-check flow
- `/books?flow=check` — Landing/pricing/Xero callback handoff into the first finance check
- `/pricing` — Freemium pricing tiers with a clear path home and into the finance check
- `/impact` — Live impact metrics (money found, issues caught, tax savings)
- `/security` — Plain-English trust page (what we read, what we can't touch, how to leave)
- `/activity` — Session audit trail (journals, chase sends, recoveries)
- `/account` — Plan, billing, weekly digest toggle, and data deletion

---

## The Problem

Small businesses lose money in two directions: customers pay late, and
preventable mistakes or risks leave through accounts payable. They often lack
a credit controller or finance controls team, do not know whether a payment
pattern is normal for their industry, and do not have time to trace every
exception through the books. Sikizana makes the evidence and the next safe
action clear.

## The Solution

Siki the Owl is an AI agent that:
1. **Audits automatically** — runs on page load, before the user types anything
2. **Ages the receivables** — who owes what, bucketed 30/60/90 days, plus true days-to-get-paid
3. **Chases effectively** — escalating reminder emails (negotiation-psychology based) with statutory interest and compensation calculated
4. **Protects AP** — flags duplicate bills/payments and other evidence-backed payable risks in the same findings workflow
5. **Benchmarks honestly** — compares against typical UK sector ranges, clearly labelled as indicative
6. **Scores customers** — RED/AMBER/GREEN payment reliability, flags customers who cost more than they're worth
7. **Estimates tax** — UK Corporation Tax, non-deductible flags, HMRC citations (BIM45010, EIM31240, etc.)
8. **Fixes things** — proposes journal entries; posting happens only via the user's Approve button
9. **Explains everything** — translates accounting jargon into plain English

AP Integrity enhances the existing findings, chat, weekly-digest, and
audit-history workflow. It does not change suppliers, payments, or bank
details. See [the implementation plan](docs/AP_INTEGRITY_PLAN.md).

---

## Architecture

```
User → Next.js frontend → FastAPI backend → NVIDIA NIM (Llama 3.3 70B, streamed)
                                           → Venice AI (fallback when NVIDIA is down)
                                           → Xero API (per-session OAuth2 → CLI → mock)
                                           → Supermemory Local (optional: persistent memory + RAG)
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
layer**: `create_journal_entry` is not in the LLM's tool list at
all — the model can only `propose_journal_entry` (renders a card); the
only path that ever posts to Xero is the user clicking Approve, which
calls `/api/xero/journal` directly. Same principle for chasing: the
agent can `draft_invoice_reminder` for a one-off email, but scheduled
follow-ups only start when the user clicks ⚡ Auto-chase.

### Backend (Python / FastAPI)
- **Agent**: `src/agents/bookkeeper.py` — tool-calling loop with NVIDIA NIM (Llama 3.3 70B), Venice fallback, real token streaming. `create_journal_entry` is deliberately NOT in the LLM's tool list (see Architecture above)
- **Tools**: `src/tools/accounting_tools.py` — 19 tools (discrepancies, aged receivables, invoices, P&L, tax, journal proposals, chasing, benchmarks, customer scoring, trend analysis)
- **Tax rules**: `src/tools/rag_engine.py` — multi-region embedded rules (UK HMRC, AU ATO, US IRS) with citations, enhanced by Supermemory semantic RAG when available. Region auto-detected from the Xero org's country code. Falls back to region-specific keyword lookup when Supermemory is unavailable.
- **Memory + RAG**: `src/services/supermemory.py` — Supermemory Local is the persistent memory layer. It gives the agent persistent cross-session memory (recalls customer patterns, chasing outcomes, user preferences), proactive memory alerts (surfaces past context about overdue customers automatically), and semantic RAG over multi-region tax rules. When unset or unreachable, the app falls back to keyword tax rules and no recall — a graceful degradation that is itself a demo moment.
- **Memory inspection**: `GET /api/memory` + `DELETE /api/memory/{id}` — list and delete individual memories. The `/memory` page makes the memory layer transparent and user-controllable (GDPR-aligned right-to-erasure at the individual memory level).
- **Context search**: `src/api/main.py` — `/api/context/search`, Exa + Firecrawl, 24h SQLite cache keyed on the intent-mapped query (never the raw user text — chat can contain customer names/amounts)
- **Xero service**: `src/services/xero_service.py` — session-scoped OAuth → allowlisted CLI → mock resolution, with a 45s read-through cache
- **Xero API client**: `src/services/xero_api.py` — direct Accounting API (tenant header, client-supplied idempotency key, rate-limit retry)
- **OAuth**: `src/services/xero_oauth.py` — Connect Your Xero flow (SQLite state store, locked token refresh, session-bound callback to prevent login-CSRF)
- **Vision**: `src/tools/vision_audit.py` — Gemini Vision receipt matching
- **Storage**: `src/services/payment_store.py` — feedback, audit history, impact + webhook events, session prefs, user profiles, and `delete_session_data` (right-to-erasure)
- **Chase loop**: `src/services/chasing.py` (5-stage ladder incl. Letter Before Action + post-ladder MCOL/DCA checklist), `src/services/chase_store.py` (sequences), `src/jobs/run_chases.py` (daily cron: re-checks payment in Xero, sends the due stage under the user's business name, stops on payment, settles instantly on the Xero payment webhook too)
- **Rates**: `src/services/rates.py` — single source of truth for statutory interest (8% + Bank Rate) and £40/£70/£100 fixed-sum compensation
- **Receivables**: `src/services/receivables.py` — aged 30/60/90 buckets by debtor + true days-to-get-paid (from payment history, not just overdue invoices)
- **API cache**: `src/services/cache.py` — SQLite TTL cache for Exa/Firecrawl results (bounded, survives deploys, shared across workers)
- **Data deletion**: `POST /api/data/disconnect` (disconnect platform, keep memories) + `POST /api/data/delete` (full erasure — revokes Xero + erases conversations, audit trail, chase sequences, snapshots, prefs, and memories)
- **User profiles**: `GET/PUT /api/profile` — name, business name, industry, timezone, language. User-scoped (persists across sessions). Injected into agent system prompt for personalization. Industry feeds sector benchmarks.
- **Security**: Brute-force protection (5 failed logins → 15min lockout), password reset (token-based, 1h expiry), email verification (token-based, 24h expiry), 30-day sliding session timeout
- **Tests**: `tests/` — 167 tests: report parsing, OAuth state, webhook HMAC, rate limiting, demo-mode tools, chase ladder/scheduling/settlement, caching, data erasure, Supermemory graceful degradation, multi-region tax RAG (UK/AU/US), security hardening, user profiles, connector abstraction, and AP Integrity rules

### Frontend (Next.js / React / Tailwind)
- **Chat**: `web/app/books/page.tsx` — streaming agent chat with tool-call visualization, memory recall panels, pre-OAuth consent screen, sector onboarding question, payment-moment celebration
- **Memory page**: `web/app/memory/page.tsx` — inspect what Siki remembers about your business. Lists all Supermemory entries with delete capability. Makes the memory layer transparent and user-controllable.
- **Memory badge**: `web/components/MemoryBadge.tsx` — "Memory: ON/OFF" pill in the chat header. Polls `/api/health` for Supermemory status. Flips to OFF when the server is down — making graceful degradation visible.
- **Memory recall trace**: `web/components/MemoryRecallTrace.tsx` — collapsible "What Siki remembered" panel that appears above the agent's response when Supermemory returns past context. Shows recalled facts grouped by source.
- **WhileAgentWorks**: `web/components/WhileAgentWorks.tsx` — educational content while the agent works (tips + insights + live HMRC)
- **Edu tips**: `web/lib/edu-tips.ts` — curated tip library keyed by tool type
- **Impact**: `web/app/impact/page.tsx` — live metrics dashboard
- **Security**: `web/app/security/page.tsx` — Siki-voiced plain-English trust page
- **Components**: SikiMascot, ZanaMascot, JournalEntryCard, NegotiationEmailCard, AnalysisCard (benchmarks/scorecard/trends/aging), ReceiptUpload, ProactiveAlert, FindingsPanel, WhileAgentWorks, ResponseSummary, MemoryBadge, MemoryRecallTrace, etc.
- **Brand**: [`docs/BRAND.md`](docs/BRAND.md) — the Siki/Zana duo rule, honesty rules, canonical copy

### Deployment
- Docker Compose on VPS (Traefik reverse proxy)
- `./deploy.sh` — one-command deploy script

---

## Key Features

### 1. Proactive Audit
The agent runs `find_discrepancies` automatically when the user opens
the books page — they see value before typing a single word.

Landing, pricing, and post-Xero-connect CTAs route into `/books?flow=check`.
That handoff opens the same canonical findings workflow with a focused
finance-check summary, then routes the user into the relevant finding action
instead of maintaining a separate marketing dashboard.

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
no tool to post it — `create_journal_entry` isn't in its tool list
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
the correct mascot. Persona persists across page refreshes. UI chrome,
analysis card headers, and chase confirmation copy follow the active
persona — see `web/DESIGN.md` for guardrails.

### 12. Conversion-Aware UX
Contextual sign-in nudges at key moments (after first answer, at 3/5
queries), upgrade prompt at 5/5, and clear chat with two-step
confirmation. The pricing page shows the user's own live overdue total
next to the price (never shown for demo data). When Stripe is not
configured, paid-plan CTAs route to manual design-partner onboarding
instead of promising credits or sending users into disabled checkout.

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

### 18. Persistent Memory + Multi-Region Semantic RAG (Supermemory Local)
Sikizana is built on [Supermemory Local](https://supermemory.ai). The agent
relies on its persistent memory layer to be useful across sessions:

- **Cross-session memory**: Siki recalls past conversations, customer
  payment patterns, chasing outcomes, and user preferences across sessions.
  The user profile (static facts + dynamic context) is injected into the
  system prompt at the start of each turn, so the agent picks up where it
  left off instead of starting from zero. Conversations are ingested
  fire-and-forget after each response — never blocking the user.
- **Proactive memory alerts**: When the agent detects overdue invoices, it
  automatically searches Supermemory for past context about those customers
  and proactively surfaces it — "Acme was late last time too, and a final
  notice got them to pay in 5 days." The memory layer drives value, not
  just passive recall. The alert is emitted as a `memory_recall` streaming
  event so the UI shows it in real time.
- **Multi-region semantic RAG**: `lookup_tax_rule` performs semantic search
  over an ingested corpus of tax guidance from three jurisdictions — UK HMRC
  (11 rules + 12 gov.uk pages), AU ATO (11 rules + 9 ato.gov.au pages), and
  US IRS (11 rules + 8 irs.gov pages) = 62 documents total. The region is
  auto-detected from the Xero org's country code. Better matching on
  natural-language questions like "can I deduct lunch with a client" (which
  doesn't contain the word "entertainment") — and the right rules for the
  right country (45p/mile in the UK, 88c/km in Australia, 67¢/mile in the US).
- **Memory transparency**: The `/memory` page lists everything Siki remembers
  about the business, with individual memory deletion (GDPR-aligned
  right-to-erasure). The "Memory: ON/OFF" badge in the chat header makes the
  Supermemory state visible at a glance. The "What Siki remembered" panel
  appears above each response when memory was recalled.

**When Supermemory is unset or unreachable, the app gracefully degrades —
but it is not the same product.** Every call is wrapped with fallback:
`is_available()` health-checks with a 60s cache, `search()` returns `[]`,
`get_profile()` returns `None`, `lookup_tax_rule` falls back to the
region-specific keyword system, and conversation ingestion is silently
skipped. The badge flips to "Memory: OFF". This is production-grade
architecture: the demo can show memory ON vs OFF side-by-side, and the
product never breaks.

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
- Supermemory Local (optional — persistent memory + semantic RAG; see below)
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
# Optional: AP_INTEGRITY_USER_IDS (comma-separated authenticated design-partner
#   allowlist; unset enables AP Integrity for all users)
# Optional: AP_INTEGRITY_DISABLED=true (global AP Integrity kill switch)
# Optional: SUPERMEMORY_URL + SUPERMEMORY_API_KEY (persistent memory + RAG)
#   Install: curl -fsSL https://supermemory.ai/install | bash
#   Run:     supermemory-server  (prints API key on first boot)
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
| Memory + RAG | Supermemory Local (optional — persistent cross-session memory, proactive alerts, multi-region semantic tax RAG, /memory transparency page) |
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
