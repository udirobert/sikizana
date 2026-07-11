# External API Integrations — Analysis & Roadmap

## Current Integrations (Live)

### Exa AI — Live Web Search
**Status**: Integrated, live on production
**API key**: `EXA_API_KEY` (set in VPS `.env`)
**Endpoint**: `POST https://api.exa.ai/search`
**Usage**: `/api/context/search` — instant search of gov.uk for HMRC guidance

**What it does**: Exa is a search engine built for AI. We use the `instant`
search type (~250ms) with `includeDomains: ["gov.uk"]` to find relevant
HMRC pages for the user's query. Returns titles, URLs, and highlight
snippets.

**Why Exa over alternatives**: Purpose-built for AI/semantic search.
The `instant` mode is fast enough for real-time use. The
`includeDomains` filter lets us restrict to gov.uk for authority.

**Cost**: Free tier available. Paid tiers for higher volume.

**Cache**: `src/services/cache.py` — SQLite-backed, 24-hour TTL, keyed on
the INTENT-MAPPED query (`_map_query_to_exa`), not the raw user text.
"Who owes me money?", "chase Acme", and "overdue invoices" all map to
the same canonical query and share one cache entry — previously each
paid for its own Exa call. Two side benefits of this design: (1) queries
with no matched intent map to `None` and never reach Exa at all, so raw
chat text (which can contain customer names/amounts) is never sent to a
third party; (2) the cache is bounded (500 rows) and survives deploys,
unlike the in-memory dict this replaced.

---

### Firecrawl — Deep Page Content Extraction
**Status**: Integrated, live on production
**API key**: `FIRECRAWL_API_KEY` (set in VPS `.env`)
**Endpoint**: `POST https://api.firecrawl.dev/v2/scrape`
**Usage**: `/api/context/search` — scrapes the top Exa result for clean markdown

**What it does**: Firecrawl takes a URL and returns clean, LLM-ready
markdown. We use `formats: ["markdown"]` with `onlyMainContent: True`
to strip navigation, ads, and boilerplate. The backend then extracts
the most relevant paragraph by keyword matching against the user's
query.

**Why Firecrawl over alternatives**: `onlyMainContent` produces cleaner
output than raw scraping. Handles JS-rendered pages, PDFs, and anti-bot
measures automatically.

**Cost**: Free tier available. Paid tiers for higher volume.

**Pipeline**: Exa finds → Firecrawl reads → backend extracts relevant
paragraph → user sees the actual HMRC guidance text inline.

**Also used for**: `_fetch_ons_benchmarks` in `src/tools/accounting_tools.py`
(sector benchmark comparison). Cached per sector for 7 days (the source
data updates ~annually) — previously every "is this normal for my
industry?" question paid for a fresh Exa search + Firecrawl scrape.
Failed scrapes are cached for 6 hours so a broken source page isn't
hammered on every question.

---

### NVIDIA NIM — Primary LLM
**Status**: Integrated, live on production
**API key**: `NVIDIA_API_KEY` (set in VPS `.env`)
**Model**: `meta/llama-3.3-70b-instruct` (primary), `meta/llama-3.1-70b-instruct` (fallback)
**Endpoint**: `https://integrate.api.nvidia.com/v1`

**Why 70B not 8B**: The 8B model couldn't handle tool-calling — it
looped on `find_discrepancies` (calling it 5 times) and produced
garbage text. The 70B model follows instructions reliably and produces
natural, conversational responses.

**Timeout**: 60s for the initial connection (70B cold start can be slow).

---

### Venice AI — Fallback LLM
**Status**: Integrated, live on production
**API key**: `VENICE_API_KEY` (set in VPS `.env`)
**Model**: `llama-3.3-70b`
**Usage**: Automatic fallback when NVIDIA times out or errors

**How it works**: If NVIDIA fails (timeout, error, rate limit), the
agent loop automatically switches to Venice. Same OpenAI-compatible
API, same tool-calling loop — no code changes needed.

---

### Postmark — Transactional Email
**Status**: Integrated, live on production
**Config**: `SMTP_HOST=smtp.postmarkapp.com`, `SMTP_PORT=587`,
`SMTP_USER`/`SMTP_PASS` = the Postmark server token, `SMTP_FROM` =
sending address (set in VPS `.env`)
**Usage**: `src/services/digest.py:send_email` — chase-sequence stage
emails (`src/jobs/run_chases.py`) and the weekly digest
(`src/jobs/send_digests.py`)

**What it does**: Plain SMTP (stdlib `smtplib`, no SDK dependency).
Chase emails set the **From display name to the user's Xero
organisation name** (not "Sikizana") and **Reply-To to the user's own
email** — a debtor must see who they owe and replies must reach the
user, not a third-party robot. Digests stay Sikizana-branded
("Siki at Sikizana"). Unconfigured (`SMTP_HOST` unset) → both jobs
log "not configured" and skip sending; nothing fails or half-sends.

**Why Postmark**: best-in-class deliverability reputation for
transactional mail (chase emails that land in spam defeat the whole
product), free tier covers current volume, simple DKIM/domain
verification. Sending domain (`persidian.com`) is DKIM + Return-Path
verified.

**Distribution footer**: a "Sent via Sikizana" line rides stages 1-2
(friendly/firm) only — never the final notice, recovery warning, or
Letter Before Action, where a marketing footer would undermine the
letter's legal seriousness.

---

## Evaluated But Not Integrated

### TinyFish — Web Agent Platform
**Status**: Evaluated, not integrated
**Docs**: https://docs.tinyfish.ai/

TinyFish offers four APIs:

| API | What it does | Overlaps with | Credits |
|-----|-------------|---------------|---------|
| Search | Web search, structured results | Exa | Free |
| Fetch | URL → clean content extraction | Firecrawl | Free |
| Agent | Natural-language goals → automate workflows on real sites | (none — novel) | Paid |
| Browser | Remote browser session (Playwright/CDP) | (none — novel) | Paid |

**Analysis**:

1. **Search and Fetch** — direct competitors to Exa and Firecrawl.
   Both are free (no credits), which is attractive. However, we already
   have Exa + Firecrawl working well with the gov.uk domain filter and
   `onlyMainContent` extraction. No strong reason to switch.

2. **Agent API** — the genuinely novel capability. Natural-language
   goals to automate multi-step workflows on real websites. Example:
   "Go to gov.uk, navigate to the Corporation Tax filing form, pre-fill
   these fields." This is NOT something Exa or Firecrawl can do.

   **Potential use cases for Sikizana**:
   - **HMRC filing navigation**: Agent navigates to the right gov.uk
     form, pre-fills fields from the user's Xero data, and presents it
     for review. Human-in-the-loop — the agent never submits.
   - **Xero reconciliation UI automation**: Agent navigates Xero's
     reconciliation interface, matches transactions, and presents the
     result for approval. Risky but high-value.
   - **Industry benchmarking**: Agent navigates to ONS or sector report
     sites, extracts structured data, and compares the user's margins
     against industry averages.

   **Risks**: Automating browser workflows on financial sites (Xero,
   HMRC) is risky. A misstep could post wrong data or file incorrect
   returns. Any integration would need strict human-in-the-loop
   safeguards — the agent navigates and pre-fills, the human reviews
   and submits.

   **Recommendation**: Park for post-hackathon. The Agent API is the
   most interesting TinyFish capability, but it needs careful design,
   error handling, and safety rails. Not a quick add.

3. **Browser API** — remote browser control via Playwright/CDP. Could
   be useful for taking screenshots of Xero dashboards or automating
   browser-based workflows. Lower priority than the Agent API, which
   handles browser automation at a higher level.

**Conclusion**: TinyFish's Search and Fetch overlap with our existing
Exa + Firecrawl stack. The Agent API is the interesting capability for
future workflow automation (HMRC filing, Xero reconciliation UI), but
it needs careful safety design. Documented as a roadmap item.

---

## Architecture: The Full Pipeline

```
User asks a question
  ↓
Bookkeeper Agent (NVIDIA NIM Llama 3.3 70B)
  ├── Calls Xero tools (find_discrepancies, get_invoices, etc.)
  ├── Persona handoff: detects Siki ↔ Zana switch, injects context
  ↓
WhileAgentWorks (parallel to agent execution)
  ├── Layer 1: Curated tips from edu-tips.ts (rotated by tool type)
  ├── Layer 2: Personalized insights from findings data
  └── Layer 3: /api/context/search
       ├── Exa instant search → finds top 3 gov.uk pages (~250ms)
       ├── Firecrawl scrape → clean markdown from #1 result (~2-5s)
       └── Backend extracts most relevant paragraph
  ↓
Agent response (plain English with findings + actions)
  ├── If journal PROPOSED: JournalEntryCard (Approve button → /api/xero/journal,
  │     the ONLY path that ever posts — the LLM has no posting tool)
  ├── If chasing email: NegotiationEmailCard (tactic + psychology + copy/mailto)
  ├── If aging/benchmark/scorecard/trend data: AnalysisCard (backend-built,
  │     never LLM-passthrough — see bookkeeper.py:_extract_analysis_data)
  └── ResponseSummary card (peak-end: issues found · money at stake · urgent count)
  ↓
Contextual Zana nudge (if overdue/tax/savings detected)
  ↓
Sign-in nudge (if anonymous, after first answer or at 3/5 queries)

Separately — the chase loop (not part of a single chat turn):
  ⚡ Auto-chase click → chase_store.create_sequence (resolves amount/contact/
  due-date from Xero server-side)
    ↓
  Daily cron (run_chases.py) OR Xero payment webhook (instant)
    ↓
  Re-check invoice against Xero → paid? → complete + record recovery
                                → unpaid? → send due stage via Postmark
                                            under the user's business name
    ↓
  Payment-moment celebration + recovered tally on next visit; digest leads
  with it + week-over-week delta
```

---

## Planned Integrations

### Email Automation — Shipped (via Postmark, not Make/Zapier)

**Status**: Done. Originally planned as a Make/Zapier integration
("user connects their Gmail/Outlook, Zapier triggers sending"); shipped
instead as first-party scheduled sending via Postmark (see above),
which needed zero per-user OAuth setup — the biggest risk flagged in
the original plan below.

The one-off path from the original plan is still there too: a chasing
email drafted by Zana (`draft_invoice_reminder`) is still shown as a
NegotiationEmailCard with copy-to-clipboard and mailto: — useful for a
single ad-hoc email outside a scheduled sequence.

The scheduled path (`src/services/chase_store.py`,
`src/jobs/run_chases.py`): the user clicks ⚡ Auto-chase once, approving
the whole 5-stage ladder; a daily cron sends the due stage, re-checking
payment status in Xero first, and settles instantly on a Xero payment
webhook too. No Gmail/Outlook connection required — sends go via
Postmark under the user's business name with Reply-To routed to them.

**Original plan, for reference** (superseded):
> User connects their Gmail/Outlook via Zapier or Make.com; Zana
> triggers a webhook to send directly. Trade-off flagged at the time:
> heavier user setup, most users won't do it before seeing value. This
> is exactly why the first-party Postmark path won — zero extra setup
> for the user, same "it actually sends" outcome.

**Possible future addition**: per-user Gmail/Outlook "send as" (OAuth)
so chase emails land in the user's own Sent folder — the gold-standard
sender-identity tier. Meaningful integration effort; not needed while
running one connected org.

---

### Cognee — Cross-Session Memory

**Status**: Evaluated, not yet integrated
**Docs**: https://docs.cognee.ai/

Cognee is a knowledge graph + vector store memory engine for AI
applications. It handles entity extraction, ontology building, and
semantic recall across sessions.

**Current memory approach**:
- SQLite `conversations` table: JSON message history per session+thread
- 20-message limit per thread (token-overflow guard)
- 30-day TTL
- Persona markers on each assistant message (for Siki ↔ Zana handoff)
- Sufficient for single-session context, not cross-session memory

**What cognee would add**:
- **User preferences**: "Rishi prefers firm tone, chases on Thursdays"
- **Past findings**: "Last week Siki found £340 in overdue invoices
  from Acme Corp — was it resolved?"
- **Action history**: "Zana drafted a chasing email on March 15 using
  calibrated question tactic — did it work?"
- **Negotiation outcomes**: Track which tactics work for which contacts
  over time, refine future email drafts

**Why not yet**:
- Cognee adds infrastructure: vector DB, graph DB, embedding pipeline
- The current problem (persona handoff) was solved without it
- Cross-session memory is a roadmap item, not a current blocker

**Recommendation**: Add cognee when we need cross-session personalization
(remembering user preferences, past findings, negotiation outcomes).
Not needed for the current single-session experience.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | Yes | Primary LLM (Llama 3.3 70B) |
| `NVIDIA_MODEL` | No | Defaults to `meta/llama-3.3-70b-instruct` |
| `NVIDIA_FALLBACK_MODEL` | No | Defaults to `meta/llama-3.1-70b-instruct` |
| `VENICE_API_KEY` | No | Fallback LLM (auto-switches if NVIDIA fails) |
| `VENICE_MODEL` | No | Defaults to `llama-3.3-70b` |
| `EXA_API_KEY` | No | Live HMRC guidance search + sector benchmarks (curated fallback without it) |
| `FIRECRAWL_API_KEY` | No | Deep page content extraction (Exa snippets without it) |
| `GEMINI_API_KEY` | No | Receipt photo vision matching |
| `XERO_CLIENT_ID` | Yes | Xero OAuth app credentials |
| `XERO_CLIENT_SECRET` | Yes | Xero OAuth app credentials |
| `XERO_WEBHOOK_KEY` | No | HMAC key for verifying Xero webhook signatures (instant chase settlement) |
| `TOKEN_ENCRYPTION_KEY` | Yes (prod) | Fernet key encrypting Xero tokens at rest |
| `CLI_SESSION_IDS` | No | Comma-separated allowlist for the Xero CLI fallback. Unset = disabled, every anonymous session gets demo data |
| `SMTP_HOST` / `PORT` / `USER` / `PASS` / `FROM` | No | Postmark (or any SMTP) — chase emails + weekly digest. Unset = both jobs log-and-skip safely |
| `BANK_RATE` | No | Bank of England base rate for statutory interest (defaults 5.25) — single source of truth in `src/services/rates.py` |
| `CORP_TAX_SMALL_RATE` / `MAIN_RATE` / `SMALL_LIMIT` / `MAIN_LIMIT` / `MARGINAL_RELIEF` | No | UK Corporation Tax bands, set by HMRC |
| `PAYMENT_DB_PATH` | No | SQLite path (defaults `data/sikizana.db`) |
| `ALLOWED_ORIGINS` | Prod | CORS allowlist — wildcard disables credentialed cookies |
| `COOKIE_SECURE` | Prod | Set `true` in production (HTTPS-only cookies) |

All keys are set in VPS `~/sikizana/.env` (not committed to the repo).
`docker-compose.vps.yml` passes them through to the container.

**Scheduled jobs** (cron, not env-gated but worth noting here since
they drive the email integrations above):
```
30 8 * * *  python -m src.jobs.run_chases     # daily, sends due chase stages
0  8 * * 1  python -m src.jobs.send_digests   # Monday, weekly digest
```
