# Supermemory Integration — Sikizana

## What we built

Sikizana is an AI credit controller and bookkeeper for Xero, powered by
Supermemory Local. The persistent memory layer is the infrastructure that makes
the agent useful session after session: it gives the agent five load-bearing
capabilities — cross-session memory, multi-region semantic tax RAG, proactive
memory alerts, user-action learning, and a transparency page for user control.

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
preferences. With Supermemory Local, the agent picks up where it left off —
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

### 5. User-action learning (memory that changes behaviour)
Memory stops being a feature and starts becoming infrastructure when it learns
from what the user does and feeds back into the agent's next action.

- **Approve a chase** (`POST /api/chase/start`) → writes a `chase_policy` signal
  for that customer. Future overdue invoices for that customer show a
  `Chase from memory` action in the findings panel.
- **Cancel a chase** (`POST /api/chase/cancel`) → writes a `chase_avoid` signal
  so the agent asks for explicit approval before chasing that customer again.
- **Reject a journal entry** (`JournalEntryCard` `Reject` button) → writes a
  `journal_rejection` signal. The agent is then told, in the system prompt, not
  to propose journal entries without explicit user approval.

These are structured Supermemory signals (`/api/memory/signal`), not just
conversation text. The agent recalls them via `get_preference_signals()` and
injects them as `USER PREFERENCE SIGNALS (learned from past actions)` in the
system prompt.

**Why this matters**: most memory systems are read-only. Sikizana writes
memory signals back from user actions, so the agent stops repeating the same
mistakes and stops asking for confirmation on things the user already
approved.

## Architecture

- **Supermemory Local** running on the same machine as the backend
- `SUPERMEMORY_URL` and `SUPERMEMORY_API_KEY` in `.env` (gitignored)
- `src/services/supermemory.py` — client wrapper with health-check caching
  (60s), graceful degradation on every call, session-scoped container tags
  for per-business isolation, and `get_preference_signals()` for behaviour
  rules learned from user actions
- `src/tools/rag_engine.py` — multi-region rules with ContextVar-based
  region routing, Supermemory semantic search with keyword fallback
- `src/agents/bookkeeper.py` — memory injection into system prompt,
  proactive alerts on overdue invoice detection, conversation ingest,
  `MEMORY POLICY DIRECTIVE` to apply stored rules, and `USER PREFERENCE SIGNALS`
  recall from user actions
- `src/api/main.py` — `POST /api/memory/signal` stores structured behaviour
  signals; `POST /api/chase/start` and `POST /api/chase/cancel` write signals
  from chase approvals/cancellations
- `web/app/memory/page.tsx` — transparency UI with list + delete
- `web/components/MemoryBadge.tsx` — ON/OFF status indicator
- `web/components/MemoryRecallTrace.tsx` — recall visualisation panel
- `web/components/FindingsPanel.tsx` — surfaces `Chase from memory` when a
  stored chase policy exists
- `web/components/JournalEntryCard.tsx` — writes a `journal_rejection` signal
  when the user rejects a proposed journal entry

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

159 tests pass, including 24 Supermemory-specific tests covering:
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
- Memory signal storage and retrieval (`chase_policy`, `chase_avoid`, `journal_rejection`)
- `FindingsPanel` memory-driven action enrichment
- `bookkeeper.py` memory policy directive injection

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
