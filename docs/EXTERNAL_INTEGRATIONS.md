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

**Cache**: 5-minute in-memory cache per query to avoid repeat calls.

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
  ├── Calls Xero tools (find_discrepancies, get_xero_invoices, etc.)
  ↓
While Siki Works (parallel to agent execution)
  ├── Layer 1: Curated tips from edu-tips.ts (rotated by tool type)
  ├── Layer 2: Personalized insights from findings data
  └── Layer 3: /api/context/search
       ├── Exa instant search → finds top 3 gov.uk pages (~250ms)
       ├── Firecrawl scrape → clean markdown from #1 result (~2-5s)
       └── Backend extracts most relevant paragraph
  ↓
Agent response (plain English with findings + actions)
  ↓
Contextual Zana nudge (if overdue/tax/savings detected)
  ↓
Sign-in nudge (if anonymous, after first answer or at 3/5 queries)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | Yes | Primary LLM (Llama 3.3 70B) |
| `NVIDIA_MODEL` | No | Defaults to `meta/llama-3.3-70b-instruct` |
| `NVIDIA_FALLBACK_MODEL` | No | Defaults to `meta/llama-3.1-70b-instruct` |
| `VENICE_API_KEY` | No | Fallback LLM (auto-switches if NVIDIA fails) |
| `VENICE_MODEL` | No | Defaults to `llama-3.3-70b` |
| `EXA_API_KEY` | No | Live HMRC guidance search (curated fallback without it) |
| `FIRECRAWL_API_KEY` | No | Deep page content extraction (Exa snippets without it) |
| `GEMINI_API_KEY` | No | Receipt photo vision matching |
| `XERO_CLIENT_ID` | Yes | Xero OAuth app credentials |
| `XERO_CLIENT_SECRET` | Yes | Xero OAuth app credentials |

All keys are set in VPS `~/sikizana/.env` (not committed to the repo).
`docker-compose.vps.yml` passes them through to the container.
