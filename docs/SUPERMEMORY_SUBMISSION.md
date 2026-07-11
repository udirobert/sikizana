# Supermemory Integration — Sikizana

## What we built

Sikizana is an AI credit controller and bookkeeper for Xero. We integrated
Supermemory Local as an **optional enhancement layer** that gives the agent
four capabilities it didn't have before — memory, multi-region semantic tax
RAG, proactive alerts, and a transparency page for user control.

## How Supermemory is used

### 1. Cross-session memory
The agent remembers past conversations, customer payment patterns, chasing
outcomes, and user preferences across sessions. At the start of each turn,
Supermemory's profile API (static + dynamic facts) is injected into the
system prompt, and hybrid search recalls relevant context. After each
response, the conversation is ingested fire-and-forget — never blocking the
user.

**Why this matters**: without memory, every session starts from zero. The
user has to re-explain their business, their customers, and their
preferences. With Supermemory, the agent picks up where it left off —
"Acme was late last time too, and a final notice got them to pay in 5 days."

### 2. Multi-region semantic tax RAG
We replaced a keyword-based tax rule lookup with Supermemory semantic search
over a corpus of 62 documents spanning three jurisdictions:
- UK HMRC (11 embedded rules + 12 gov.uk pages)
- AU ATO (11 embedded rules + 9 ato.gov.au pages)
- US IRS (11 embedded rules + 8 irs.gov pages)

The region is auto-detected from the Xero organisation's country code and
set via a ContextVar. The search query is prepended with the region name
("UK HMRC mileage allowance") to bias semantic search toward the correct
jurisdiction, with client-side metadata filtering as a second layer.

**Why this matters**: "can I deduct lunch with a client" doesn't contain
the word "entertainment" — keyword matching fails, semantic search
succeeds. And the right answer depends on the country: 45p/mile in the UK,
88c/km in Australia, 67c/mile in the US. No other Xero app does
multi-jurisdiction semantic tax lookup.

### 3. Proactive memory alerts
When the agent detects overdue invoices in tool results, it automatically
searches Supermemory for past context about those customers. If memories
are found (score > 0.5), a `PROACTIVE MEMORY ALERT` system message is
injected into the conversation, and a `memory_recall` streaming event is
sent to the frontend so the UI shows the alert in real time.

**Why this matters**: most memory systems are passive — they recall when
asked. Supermemory lets us be proactive: the agent surfaces past context
automatically when it's relevant to the current situation. The memory
layer drives value, not just recall.

### 4. Memory transparency page
A dedicated `/memory` page lists everything Supermemory has stored for the
session, with individual memory deletion (GDPR-aligned right-to-erasure).
A "Memory: ON/OFF" badge in the chat header makes the Supermemory state
visible at a glance. A "What Siki remembered" panel appears above each
response when memory was recalled.

**Why this matters**: AI memory is a black box in most products. We make
it visible, inspectable, and controllable. Users can see exactly what the
agent remembers and delete anything they don't want it to remember.

## Architecture

- **Supermemory Local** running on the same machine as the backend
- `SUPERMEMORY_URL` and `SUPERMEMORY_API_KEY` in `.env` (gitignored)
- `src/services/supermemory.py` — client wrapper with health-check caching
  (60s), graceful degradation on every call, and session-scoped container
  tags for per-business isolation
- `src/tools/rag_engine.py` — multi-region rules with ContextVar-based
  region routing, Supermemory semantic search with keyword fallback
- `src/agents/bookkeeper.py` — memory injection into system prompt,
  proactive alerts on overdue invoice detection, conversation ingest
- `web/app/memory/page.tsx` — transparency UI with list + delete
- `web/components/MemoryBadge.tsx` — ON/OFF status indicator
- `web/components/MemoryRecallTrace.tsx` — recall visualisation panel

## Graceful degradation

When Supermemory is unset or unreachable, every call degrades gracefully:
- `is_available()` health-checks with a 60s cache
- `search()` returns `[]`
- `get_profile()` returns `None`
- `lookup_tax_rule` falls back to the region-specific keyword system
- Conversation ingestion is silently skipped
- The badge flips to "Memory: OFF"

The app works identically without Supermemory — just without memory. This
is both good architecture (no single point of failure) and a demo moment:
kill Supermemory mid-conversation and Siki keeps working.

## Testing

101 tests pass, including 24 Supermemory-specific tests covering:
- Health check caching and availability detection
- Search with results and empty results
- Profile retrieval
- Conversation ingest with tool-message stripping
- Tax rule lookup with Supermemory (semantic) and without (keyword fallback)
- Multi-region RAG: UK mileage (45p/mile), AU mileage (88c/km), US mileage
  (67c/mile), UK entertainment, AU GST, US sales tax
- ContextVar region routing
- Corpus seeding (62 documents, idempotent customIds)
- Region info metadata

## Tech stack

- Backend: Python, FastAPI, httpx
- Frontend: Next.js 16, React 19, Tailwind 4
- LLM: NVIDIA NIM (Llama 3.3 70B) with Venice AI fallback
- Memory + RAG: Supermemory Local
- Accounting: Xero OAuth 2.0
- Database: SQLite (WAL mode)

## Links

- GitHub: https://github.com/udirobert/sikizana
- Live: https://sikizana.persidian.com
