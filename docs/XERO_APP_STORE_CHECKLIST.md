# Xero App Store Submission Checklist

Track for getting Sikizana listed on the Xero App Store, enabling
distribution to 4.4M Xero subscribers.

## Status: Not Started

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
      long-lived sessions (currently implemented, needs production test)
- [ ] **Disconnect flow** — user can revoke access cleanly
      (need to add `/api/xero/disconnect` endpoint)

## 2. Security Audit

Xero requires evidence of security best practices.

### Requirements
- [ ] **HTTPS only** — already enforced via Traefik (Let's Encrypt)
- [ ] **Secure cookies** — HttpOnly, Secure, SameSite=Lax
      (verify in production)
- [ ] **CSRF protection** — state parameter in OAuth flow (implemented)
- [ ] **No secrets in client code** — all API keys server-side only
- [ ] **Rate limiting** — protect against API abuse
      (currently relies on Xero's own rate limits; add app-level)
- [ ] **Input validation** — all user inputs validated server-side
- [ ] **SQL injection protection** — using parameterized queries (verify all paths)
- [ ] **XSS protection** — React escapes by default, verify no dangerouslySetInnerHTML
- [ ] **Data retention policy** — document how long user data is stored
      (currently 30-day TTL on conversations)
- [ ] **Data deletion on disconnect** — when user revokes OAuth, delete their data
      (need to implement)

## 3. Privacy & Compliance

### Requirements
- [ ] **Privacy policy** — already at `/privacy`, review for App Store compliance
- [ ] **Terms of service** — already at `/terms`, review for App Store compliance
- [ ] **Data processing agreement** — may be required for App Store
- [ ] **GDPR compliance** — right to access, right to erasure
      (need to add data export + deletion endpoints)
- [ ] **Cookie policy** — document what cookies are set and why

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
- [ ] **Rate limit handling** — 429 backoff with Retry-After header
      (implemented in xero_api.py)
- [ ] **Idempotency** — journal entries use Idempotency-Key
      (implemented in xero_api.py)

## 6. Pre-Submission Testing

### Requirements
- [ ] **Test with real Xero org** — full end-to-end flow with live data
- [ ] **Test OAuth disconnect/reconnect** — ensure clean state management
- [ ] **Test with empty org** — new Xero org with no data (edge case)
- [ ] **Test with large org** — org with 1000+ invoices
- [ ] **Test all 19 tools** — each tool works with live Xero data
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
   Mitigation: add health monitoring + auto-restart, or move to
   multi-AZ deployment before submission.

2. **Data deletion on disconnect** — Xero requires clean data
   deletion when users revoke access. Not yet implemented.
   Priority: high.

3. **No rate limiting at app level** — we rely on Xero's rate limits.
   Xero may want to see app-level protection. Quick fix: add a
   simple per-session rate limiter.

4. **Demo mode honesty** — when Xero API is unavailable, we fall back
   to demo data and report it honestly in the UI. This is a feature,
   not a bug, but Xero reviewers may initially flag it. Document
   clearly in the submission.
