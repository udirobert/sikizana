# Xero App Store Submission Checklist

Track for getting Sikizana listed on the Xero App Store, enabling
distribution to 4.4M Xero subscribers.

## Status: In Progress — most security/privacy blockers cleared 2026-07-06

The two biggest risks flagged below (data deletion, rate limiting) are
now done. Remaining work is mostly App Store listing assets and
pre-submission testing, not core product gaps.

---

## 1. OAuth App Review

Xero requires apps to pass a security review before listing on the
App Store. Our OAuth flow is already built (`src/services/xero_oauth.py`)
using PKCE and SQLite state store.

### Requirements
- [ ] **OAuth app verified** — submit app for Xero review at
      https://developer.xero.com/myapps
- [ ] **Scopes justified** — we currently request:
  - `accounting.transactions` (read invoices, bank transactions)
  - `accounting.reports.read` (P&L, balance sheet)
  - `accounting.journals` (write journal entries)
  - `accounting.settings` (chart of accounts, organisation)
  - `accounting.contacts` (customer/supplier list)
  - Each scope must be justified in the submission
- [ ] **Redirect URI registered** — `https://sikizana.persidian.com/api/xero/callback`
      must be registered in the Xero app config
- [ ] **Token refresh tested** — ensure refresh token flow works for
      long-lived sessions (implemented, needs production soak test)
- [x] **Disconnect flow** — `POST /api/xero/disconnect` revokes tokens;
      `POST /api/data/delete` goes further (revoke + erase all stored
      session data) and is exposed as "Delete my data" on the Account page

## 2. Security Audit

Xero requires evidence of security best practices.

### Requirements
- [x] **HTTPS only** — enforced via Traefik (Let's Encrypt) + HSTS headers,
      port 18081 bound to 127.0.0.1 so it's unreachable except through Traefik
- [x] **Secure cookies** — HttpOnly, Secure (prod), SameSite=Lax; verified live
- [x] **CSRF / session-fixation protection** — OAuth state parameter (implemented),
      PLUS: `?session=` query param is never written into the cookie (was a
      fixation risk — fixed 2026-07-06), and the OAuth callback verifies the
      completing browser holds the session that initiated the flow
- [x] **No secrets in client code** — all API keys server-side only
- [x] **Rate limiting** — per-IP limiter (`src/services/rate_limit.py`) on
      chat and journal-write endpoints
- [ ] **Input validation** — all user inputs validated server-side
      (Pydantic models on most endpoints; audit remaining raw params)
- [ ] **SQL injection protection** — using parameterized queries (verify all paths)
- [ ] **XSS protection** — React escapes by default, verify no dangerouslySetInnerHTML
- [x] **Data retention policy** — documented on `/privacy` and `/security`
      (session-scoped storage; conversations capped at 20 messages/thread)
- [x] **Data deletion on disconnect** — `POST /api/data/delete` revokes
      Xero + erases conversations, audit trail, chase sequences, snapshots,
      and session prefs; available to anonymous sessions too

## 3. Privacy & Compliance

### Requirements
- [x] **Privacy policy** — `/privacy`, names every processor (NVIDIA/Venice,
      Gemini, Postmark, Stripe, Exa/Firecrawl) and what each receives —
      review for final App Store wording
- [ ] **Terms of service** — already at `/terms`, review for App Store compliance
- [ ] **Data processing agreement** — may be required for App Store
- [x] **GDPR compliance (erasure)** — `POST /api/data/delete` implemented
      and exposed in the UI. Right to ACCESS (data export) still open.
- [ ] **Cookie policy** — document what cookies are set and why
      (currently just the one session cookie, documented informally on `/privacy`)

## 4. App Store Listing

### Requirements
- [ ] **App name** — "Sikizana" (verify not taken)
- [ ] **App description** — short (160 chars) and long (1000 chars)
- [ ] **App icon** — 256x256px, Siki the Owl mascot
- [ ] **Screenshots** — at least 3 screenshots of the app in action
- [ ] **Demo video** — 60-90s walkthrough (we have pitch footage)
- [ ] **Pricing info** — freemium model (free audit, paid auto-fix)
- [ ] **Support contact** — email or contact form
- [ ] **Documentation link** — link to README or help docs
- [ ] **Category** — "Accounting" or "Bookkeeping"
- [ ] **Integration type** — "Public" (available to all Xero users)

## 5. Technical Requirements

### Requirements
- [ ] **Webhook reliability** — Xero sends webhooks for events;
      our endpoint must respond within 10s with 200 status
      (implemented, needs load testing)
- [ ] **Uptime SLA** — Xero expects 99.5%+ uptime
      (current: single VPS, no redundancy — consider multi-region)
- [ ] **Error handling** — graceful degradation when Xero API is down
      (implemented: falls back to demo mode with honest UI reporting)
- [ ] **Pagination** — handle large orgs with 1000+ invoices
      (implemented in xero_api.py via _get_paged)
- [x] **Rate limit handling** — 429 backoff with Retry-After header
      (implemented in xero_api.py)
- [x] **Idempotency** — journal entries use a client-supplied
      Idempotency-Key (covers user-level retries/double-clicks, not
      just the internal retry loop — fixed 2026-07-06)

## 6. Pre-Submission Testing

### Requirements
- [ ] **Test with real Xero org** — full end-to-end flow with live data
- [ ] **Test OAuth disconnect/reconnect** — ensure clean state management
- [ ] **Test with empty org** — new Xero org with no data (edge case)
- [ ] **Test with large org** — org with 1000+ invoices
- [ ] **Test all agent tools** (19, incl. aged receivables, chasing, benchmarks) — each works with live Xero data
- [ ] **Test journal write-back** — create + post a real journal entry
- [ ] **Test receipt matching** — upload a real receipt photo
- [ ] **Cross-browser test** — Chrome, Safari, Firefox, Edge
- [ ] **Mobile responsive** — verify on phone-sized screens

## 7. Post-Submission

### Requirements
- [ ] **Xero review process** — typically 2-4 weeks
- [ ] **Address feedback** — Xero may request changes
- [ ] **App Store listing live** — once approved
- [ ] **Monitor usage** — track installs, usage, errors
- [ ] **User feedback loop** — collect and act on user feedback

---

## Estimated Timeline

| Phase | Duration | Blocking? |
|-------|----------|-----------|
| Security audit + fixes | 1-2 days | No |
| Privacy compliance + data deletion | 1 day | No |
| App Store listing assets | 1 day | No |
| Technical hardening (rate limiting, uptime) | 2-3 days | No |
| Pre-submission testing | 1 day | No |
| Xero review | 2-4 weeks | Yes (waiting on Xero) |

**Total active work: ~1 week. Total elapsed: ~5 weeks.**

## Key Risks

1. **Single VPS, no redundancy** — Xero may flag uptime concerns.
   Mitigation: add health monitoring + auto-restart (a free
   healthchecks.io ping on the cron jobs would also catch a silently
   dead chase runner — currently nothing alerts if it stops firing),
   or move to multi-AZ deployment before submission. **Still open.**

2. ~~**Data deletion on disconnect**~~ — **Done 2026-07-06.**
   `POST /api/data/delete` revokes Xero access and erases all stored
   session data; surfaced as "Delete my data" on the Account page.

3. ~~**No rate limiting at app level**~~ — **Done.** Per-IP limiter on
   chat and write endpoints (`src/services/rate_limit.py`).

4. **Demo mode honesty** — when Xero API is unavailable, we fall back
   to demo data and report it honestly in the UI. This is a feature,
   not a bug, but Xero reviewers may initially flag it. Document
   clearly in the submission. **Still open** (documentation task).

5. **New since this doc was written** — the CLI-org fallback (used for
   the operator's demo data) is now allowlisted via `CLI_SESSION_IDS`
   and disabled by default; worth calling out proactively in the
   submission as a security control, not just documenting if asked.
