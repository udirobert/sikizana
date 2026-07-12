# Sikizana — AI Finance Assistant

## What this is

Sikizana is an AI finance assistant that connects to accounting platforms
(Xero today, QuickBooks/Sage tomorrow) with persistent memory via Supermemory
Local. The agent (Siki) reads invoices, finds discrepancies, estimates tax
savings, and chases overdue payments — all read-only by design,
human-in-the-loop by default.

## Architecture

### Auth model (two-layer)

```
Visitor (anonymous session, HttpOnly cookie)
  ↓ try the demo, chat with Siki (demo data)
  ↓
  ├─→ "Sign in with Xero" (one click)
  │     → Xero OAuth + PKCE → id_token email → auto-create Sikizana account
  │     → Xero tokens linked to user account
  │     → Anonymous memories migrated to user container
  │
  └─→ "Create account" (email/password)
        → Sikizana account created
        → Can connect Xero later
        → Memories migrated on login
```

- **Sikizana account** is the identity anchor. Email/password, session cookies,
  plan, billing. Created via registration form or auto-created from Xero OAuth.
- **Xero** is a data connector, not the identity provider. Connecting Xero gives
  data access, not identity. The user's identity is always their Sikizana account.
- **Anonymous sessions** can try the demo (chat, browse data) but cannot post
  journals, start chases, or view memories. `require_authenticated_user`
  dependency guards write endpoints.
- **Memories are user-scoped**: `user:{user_id}` when authenticated,
  `session:{session_id}` when anonymous. Migration happens on login/register.

### Connector abstraction layer

`src/services/connectors/` — protocol + registry for multi-platform support.

- `base.py` — `AccountingConnector` ABC defining the contract (get_organisation,
  list_invoices, create_journal, disconnect, etc.)
- `xero.py` — `XeroConnector` wraps existing `XeroService` to implement the protocol
- `registry.py` — `get_connector(session_id)` dispatches to the right connector
  based on the session's active platform connection

Today only Xero is registered. Adding QuickBooks/Sage means:
1. Create `quickbooks.py` implementing `AccountingConnector`
2. Add one entry to `_REGISTRY` in `registry.py`
3. Nothing else changes

**Note:** The agent tools (`accounting_tools.py`), findings, receivables, chase
jobs, and all API endpoints call through `get_connector(session_id)` instead of
instantiating `XeroService` directly. The only file that imports `XeroService`
is `src/services/connectors/xero.py` (the adapter itself). Adding a second
connector requires no changes to the agent, tools, findings, or API layer.

### Two-tier data deletion

- `POST /api/data/disconnect` — Disconnects the accounting platform but KEEPS
  memories, conversations, and account data. User can reconnect later and Siki
  still remembers their business.
- `POST /api/data/delete` — Full erasure (nuclear). Disconnects platform AND
  deletes everything including memories. GDPR right-to-erasure.

`delete_session_data(keep_memories=True)` controls what gets deleted.

### Supermemory (memory layer)

`src/services/supermemory.py` — client for Supermemory Local.

- **User memories**: scoped by `memory_container_tag(session_id, user_id)` →
  `user:{id}` or `session:{id}`
- **Tax RAG corpus**: shared `tax-rules` container, not user-scoped
- **Migration**: `migrate_session_memories()` re-tags anonymous memories to
  the user container on login/register
- **Graceful degradation**: every call no-ops if Supermemory is unavailable

### Database

SQLite (`data/sikizana.db`) with migration system in `payment_store.py`.
Current schema version: 11 (see `MIGRATIONS` list).

Key tables:
- `users`, `auth_sessions` — accounts and session→user links
  - User profile columns (migration 11): `name`, `business_name`, `timezone`,
    `language`, `industry` — user-scoped, persists across sessions
  - `email_verified` (migration 10) — tracks email verification status
- `xero_tokens`, `oauth_states` — Xero OAuth (encrypted at rest)
- `platform_connections` — multi-connector connection tracking (migration 9)
- `password_reset_tokens` — token-based password reset, 1h expiry (migration 10)
- `email_verification_tokens` — token-based email verification, 24h expiry (migration 10)
- `login_attempts` — brute-force protection tracking (migration 10)
- `conversations` — chat history, keyed `{session_id}:{thread_id}`
- `audit_history` — journal posts, discrepancy fixes
- `chase_sequences`, `chase_events` — invoice chasing automation
- `metric_snapshots` — periodic financial metrics
- `session_prefs` — legacy session-scoped preferences (sector); user profile
  is now the primary source, session_prefs is a fallback

## Commands

```bash
# Backend
python -m uvicorn src.api.main:app --reload --port 8080

# Frontend
cd web && npm run dev

# Tests
python -m pytest tests/ -v

# Frontend typecheck
cd web && npx tsc --noEmit
```

## Key files

| File | Purpose |
|------|---------|
| `src/api/main.py` | FastAPI backend — all endpoints |
| `src/agents/bookkeeper.py` | AI agent with tool calling |
| `src/tools/accounting_tools.py` | Agent tool functions (platform-agnostic) |
| `src/services/connectors/` | Multi-platform abstraction layer |
| `src/services/supermemory.py` | Supermemory client + memory migration |
| `src/services/accounts.py` | Auth, registration, profile, "Sign in with Xero" |
| `src/services/xero_oauth.py` | Xero OAuth 2.0 + PKCE |
| `src/services/xero_service.py` | Xero data service (OAuth → CLI → demo) |
| `src/services/payment_store.py` | SQLite schema, migrations, all DB ops |
| `web/components/RequireAuth.tsx` | Client-side route guard |
| `web/hooks/useMe.ts` | Session/auth state hook |
| `web/lib/api.ts` | Typed API client + endpoint definitions |

### Personalization

Three layers are injected into the agent system prompt before every response:

1. **User profile** (user-scoped, persists across sessions): name, business
   name, industry, timezone, language. The agent addresses the user by name,
   references their business, and adapts language to their industry.
2. **Supermemory** (user-scoped when authenticated): customer payment
   patterns, chasing outcomes, prior findings, business context learned
   from conversations.
3. **Tax region** (detected from accounting platform org country): routes
   tax queries to HMRC (GB), ATO (AU), or IRS (US).

Profile is managed via `GET/PUT /api/profile` and shown on the account page.
Sector benchmarks check the user profile's `industry` field first, then
fall back to `session_prefs` (legacy), then org-name guess.

## Security notes

- Passwords hashed with scrypt (stdlib, no dependencies)
- Xero tokens encrypted at rest with Fernet
- Session cookies: HttpOnly, SameSite=lax, 30-day sliding expiry
- CSRF protection on OAuth callback via state parameter
- Session fixation protection: query param session IDs never written to cookie
- Rate limiting: per-IP token bucket on chat endpoints
- Memory ownership verified before deletion
- Brute-force protection: account locked after 5 failed logins in 15 minutes
- Password reset: token-based, 1-hour expiry, single-use, email sent via SMTP
- Email verification: token-based, 24-hour expiry, sent on registration
- Password reset doesn't leak whether an email exists (always returns success)

### Known gaps (pre-production)

- Email verification is optional (users can use the app without verifying)
