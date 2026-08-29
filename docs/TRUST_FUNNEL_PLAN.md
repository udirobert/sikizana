# Trust Funnel Plan — from stranger to connected

> **Status**: Phase 0 + Phase 1 implemented (migration 16, `funnel_events`,
> `/api/metrics/event`, `src/services/export_scan/`, `POST /api/check/scan-upload`,
> `ExportScan.tsx`, handoff wiring, templates, funnel events at OAuth start/
> complete). Phase 2 implemented (two-tier scopes `_XERO_SCOPES_BASE` /
> `_XERO_SCOPES_ACTIONS`, scope stored on `xero_tokens.scope`, 428 escalation
> on journal post/reverse + JournalEntryCard escalation panel with
> `return_to`, consent-modal permission preview, `/security` two-tier copy,
> handoff impact strip). Phases 3–4 pending.
>
> Phase 2 implementation notes (deviations from the letter of the plan):
> - Escalation uses **428 Precondition Required** (detail
>   `write_scope_required`) instead of 403, so it never collides with the
>   Pro-plan 403 semantics.
> - The consent preview lives in the **existing** `/books` consent modal
>   (every connect CTA already flows through it) as an always-accurate text
>   list of the requested permissions, rather than a screenshot in a new
>   popover component; `web/public/trust/xero-consent.png` remains an
>   optional future asset.
> - Scope strings verified against public usage: `accounting.transactions.write`
>   and `accounting.settings.taxrates` have zero public attestation; write
>   uses the classic `accounting.transactions` scope. Re-verify in the Xero
>   console during marketplace certification.
> - Pre-existing bug fixed en route: the journal routes passed
>   `idempotency_key=` to the connector protocol (which takes `reference=`),
>   so every live Approve would have 502'd.
> - Legacy connections (empty stored scope) are treated as holding the old
>   broad grant rather than being forced through a surprise re-consent.
> - `xero_tokens.scope` / `oauth_states.return_to` are added by PRAGMA-checked
>   ALTER in `xero_oauth.py` (that module owns those tables lazily), not by a
>   payment_store migration.

> Problem: prospects can't see how Sikizana applies to *their* business, and
> the trust ask at "Connect Xero" is too big a first step. This plan inserts a
> middle rung (real findings on real data, no OAuth) and makes every connect
> surface honest, previewed, and minimal.
>
> Cross-references: [AP_INTEGRITY_PLAN.md](AP_INTEGRITY_PLAN.md) (findings
> workflow source of truth), [XERO_APP_STORE_CHECKLIST.md](XERO_APP_STORE_CHECKLIST.md)
> (institutional trust), `web/DESIGN.md` (honesty + delight guardrails).

## The trust ladder (design principle)

Every step must earn the next. Today the ladder has a missing middle rung:

```
1. Typicals (/check/{slug})          — no data given        ✓ exists
2. Sample books (/books?flow=check)  — no data given        ✓ exists
3. EXPORT-UPLOAD SCAN                — real data, no OAuth  ✗ MISSING (Phase 1)
4. Connect Xero (READ-ONLY at first) — live, read-only      ⚠ exists but asks
                                                            for write scope (Phase 2)
5. Approve a fix / start a chase     — write, per-action    ⚠ scope granted at
                                                            connect instead of at
                                                            moment of value (Phase 2)
```

Honesty rules from `docs/BRAND.md` apply throughout: uploaded-export findings
are real findings but must be labelled "from your export, as of {file date} —
not live"; sample books stay labelled sample.

## Phase 0 — Funnel instrumentation (½ day, do first)

We can't weight trust fixes vs applicability fixes without knowing where
people drop. Reuse the impact-metrics plumbing; keep it anonymous.

- **Backend**: `funnel_events` table (migration 16) —
  `(id, session_id, event TEXT, meta TEXT, created_at)` +
  `POST /api/metrics/event` (no auth, rate-limited, body: `{event, meta?}`).
  No PII; `meta` is a small JSON blob (e.g. `{"sector": "plumbing"}`).
- **Events**: `check_start`, `check_complete`, `scan_upload`,
  `scan_upload_complete`, `connect_click` (with `surface` in meta),
  `oauth_start`, `oauth_complete`, `first_finding_viewed`,
  `write_scope_escalated` (Phase 2).
- **Read side**: extend the existing impact-metrics endpoint with a
  `funnel` block (counts per event, last 30 days) for our own review.
- **Frontend**: fire events from `QuickCheck.tsx`, `MarketingCtas.tsx`,
  `/books` connect card, and the OAuth callback route (server-side for
  `oauth_complete`).

**Acceptance**: we can answer "of 100 `/check/{slug}` landers, how many
finished, how many clicked connect, how many completed OAuth" per week.

## Phase 1 — Export-upload scan: "Check my actual books, no login" (3–4 days)

The core fix for both problems. Xero users can export their data in a couple
of clicks with zero integration; we run the **same** AP rules on it. Real
supplier names, real duplicates, real overdue — before any trust is asked.

Reuses `build_ap_findings_stateless(invoices, contacts, payments)`
(`src/services/ap_integrity/service.py`) — the MCP surface already proves the
scan runs with no session, no DB, no connector. `check.py:_compute_facts`
shows the calling pattern. **Do not write a parallel detection path.**

### Backend

New package `src/services/export_scan/`:

- `csv_parse.py` — tolerant parser following the `cafe_brief/pos_ingest.py`
  precedent (header-synonym sets, UK/US date formats, currency symbols,
  "real exports vary by region/account"). Three accepted inputs, all optional
  except bills:
  - **Bills (ACCPAY)** — Xero bills-list export, Payable Invoice Detail
    report export, or our template. Enables: duplicate bills, payment-gap
    anomalies, supplier spend concentration.
  - **Invoices owed (ACCREC)** — enables: overdue receivables, Zana's
    "who owes you" list. (If absent, skip receivables with a coverage note.)
  - **Payments / contacts** — optional upgrades: duplicate payments,
    supplier-detail signals. (If absent, coverage note says what connecting
    Xero would add.)
  - Exact Xero export column names to be verified against a live org during
    build (Xero revises these); the synonym-table design absorbs variance.
    Ship a downloadable template CSV as the always-works fallback.
- `service.py` — `scan_exports(bills, invoices_owed, payments, contacts) ->
  {findings, coverage, stats}`. Maps parsed rows into the normalized raw
  dict shapes a connector returns, calls `build_ap_findings_stateless`,
  and returns canonical findings plus a `coverage` list
  (`["duplicate_bills", "overdue_receivables"]`) and `stats`
  (rows parsed, date range, currency) for honest labelling.

New route in a new `src/api/routes/export_scan.py`:

- `POST /api/check/scan-upload` — multipart, **no auth required** (it must
  work for anonymous prospects), `_check_rate_limit`, 5 MB cap, row cap
  (~5k rows/file), parse in a thread, **process in memory only — never
  persist file contents**. Response: `{findings, coverage, stats}`. This
  keeps our privacy claim literal: "your file is read once, in memory, and
  discarded."
- Register router in `src/api/main.py`; add typed client fn in `web/lib/api.ts`
  (FormData pattern already exists for receipt upload).

### Frontend

- New component `web/components/ExportScan.tsx` — dropzone (drag CSV or
  browse), a 3-step "How to export from Xero" mini-guide (Business → Bills
  to pay → Export; verify current Xero UI at build time; add a 30-sec Loom
  when recorded), honest label on results ("From your export dated {x}"),
  and coverage notes ("Add your contacts export to check supplier bank
  details — or connect Xero and Siki watches this continuously").
- Render results through the **existing** QuickCheck findings card styles —
  no new result surface.
- Entry points (all fire `scan_upload` funnel events):
  1. QuickCheck handoff card becomes a two-option choice: primary
     "Upload a Xero export — no login needed", secondary "Connect Xero".
  2. Landing `JobStrip` gains "Upload an export" as a fourth job.
  3. Direct URL `/check/{slug}?mode=upload` for concierge outreach (Phase 4).

### Tests

- `tests/test_export_scan.py` — parser fixtures (each accepted format + a
  mangled-header variant), row/size caps, no-DB-writes assertion, findings
  match the same fixtures through `build_ap_findings_stateless`.
- Fixture CSVs committed under `tests/fixtures/export_scan/`.

**Acceptance**: a prospect goes from landing to *their own* duplicate-bill
findings in under 2 minutes without creating an account, and the handoff
to "connect for continuous monitoring" is one click.

## Phase 2 — Trust at the connect moment (2 days)

### 2a. Read-only at connect; write scope escalates at the moment of value

Today `xero_oauth.py:_XERO_SCOPES` requests `accounting.transactions.write`
at connect while the UI says "Read-only" — a savvy prospect (or their
accountant) sees the contradiction on Xero's consent screen and bounces.

- Split scopes in `src/services/xero_oauth.py`:
  - `_XERO_SCOPES_BASE`: `openid profile email offline_access
    accounting.transactions.read accounting.reports.read
    accounting.contacts.read accounting.settings.read` (audit each against
    Xero's granular-scope list; drop `accounting.settings.taxrates` if it
    isn't a read-only granular scope).
  - `_XERO_SCOPES_ACTIONS`: base + `accounting.transactions.write`.
- `get_authorization_url(session_id, tier="base")`; connect flow uses base.
- Store granted scopes: migration 16 adds `xero_tokens.scope TEXT`; save
  `tokens["scope"]` from the token response in `exchange_code` (and on
  refresh).
- Escalation at the journal-approve endpoint (`POST /api/xero/journal/post`):
  if the stored scope lacks `accounting.transactions.write`, return
  `403 {"error": "write_scope_required"}` — the frontend shows a focused
  modal ("To post this correction, Xero asks for one more permission —
  still nothing posts without your Approve click") and re-runs OAuth with
  `tier="actions"`, carrying a `return_to` so the user lands back on the
  same finding card. Fire `write_scope_escalated`.
- Update copy: "Read-only" claims are now literally true at connect.
  `/security` "What can Sikizana change?" answer updated to describe the
  two-tier permission.

### 2b. Consent preview on every connect CTA

- New shared `web/components/ConnectXeroButton.tsx` (replaces the ad-hoc
  connect links in `MarketingCtas.tsx`, QuickCheck handoff, `/books`
  connect card, pricing): button + "What happens when you connect" popover
  with the real Xero consent-screen screenshot (`web/public/trust/xero-consent.png`,
  captured from the live OAuth flow once 2a ships), three one-line promises
  (read-only · nothing posts without Approve · disconnect in one click),
  and a `/security` link. Fires `connect_click` with `surface` meta.
- `/security` is already written for exactly this moment — this phase is
  about making it one tap from every ask.

### 2c. Live proof on the handoff card

- QuickCheck handoff card (`QuickCheck.tsx`) gains the impact strip:
  reuse `useImpactMetrics`; when live numbers exist show "£X found ·
  Y issues caught so far", otherwise keep the honest typicals. Same
  component as the landing strip, compact variant.

**Acceptance**: connecting requests read-only scopes; the consent screen the
user sees matches the previewed screenshot; posting a journal without the
write scope triggers the escalation modal and completes end-to-end.



## Phase 3 — Sector-skinned demo data (1–2 days)

Applicability fix for visitors who never upload anything: the sample books
should look like *their* books. The routing already exists
(`sector-catalogue.json:demoScenario` → `demo_scenarios.py`); only café and
music profiles exist today.

- Refactor `src/services/demo_scenarios.py`: extract a parameterized
  `make_scenario(profile)` where a profile defines supplier names, customer
  names, line-item descriptions, bill-size ranges, and the seeded
  duplicate/overdue patterns. Café and music become two profiles; existing
  tests must pass unchanged (café stays the default).
- Add profiles for the highest-traffic outreach sectors first:
  construction/trades ("Travis Perkins", subcontractor CIS bills, van fuel),
  professional services/agency (contractor day-rates, SaaS subscriptions),
  retail/ecommerce (wholesale stock, payment-processor payouts).
  Hospitality stays café. Update `demoScenario` values in
  `web/lib/sector-catalogue.json`.
- Honesty guardrail: the skin changes names and magnitudes, never the
  "sample books" labelling. `demo_meta()` copy gains the sector label.

**Acceptance**: `/check/plumbing` → sample books show trade suppliers;
`/check/agency` → contractor bills. `pytest tests/test_demo_scenarios.py`
green with café default intact.

## Phase 4 — Proof & process (founder time, runs in parallel)

No code (except one tiny thing). This is where trust actually gets earned
in the next 30 days.

- **Concierge checks** (`docs/CONCIERGE_CHECK.md` to write): 15-minute call
  script — prospect brings their Xero export (uses the Phase 1 tool live on
  the call, or emails it beforehand), we walk findings together, ask
  permission to quote. Target: 10 calls → 3 named, quotable wins.
- **Shaped outreach**: never link the naked homepage. Every prospect gets
  `https://sikizana.persidian.com/check/{their-exact-trade}` plus one
  sentence about *their* business. Sector resolution already never 404s.
- **Founder video**: 60-second Loom on the QuickCheck handoff card —
  face, name, "here's exactly what happens to your data; disconnect is one
  click." One `<video>` embed in `ExportScan.tsx`/handoff.
- **Xero App Marketplace**: work the unchecked items in
  `XERO_APP_STORE_CHECKLIST.md` (OAuth app verification, listing copy,
  screenshots). Phase 2a helps certification (minimal scopes at connect).
  This is the slow-burn institutional trust lever and the accountant
  channel — start the submission clock early.
- **Accountant channel**: after 3 concierge wins, approach 2–3 bookkeepers
  with "check your clients' books" — the export-upload scan works for them
  *today* without any client OAuth.

## Sequencing

| Order | Work | Effort | Fixes |
|-------|------|--------|-------|
| 1 | Phase 0 instrumentation | ½ day | tells us where the drop is |
| 2 | Phase 1 export-upload scan | 3–4 days | applicability + trust (core) |
| 3 | Phase 2 connect-moment trust | 2 days | trust |
| 4 | Phase 3 sector skins | 1–2 days | applicability |
| ∥ | Phase 4 proof & process | ongoing | both; feeds copy back into 1–3 |
| ∥ | Marketplace submission | background | institutional trust |

Rationale: Phase 1 is the missing ladder rung and reuses proven code; Phase
2 removes the active contradiction at the connect moment; Phase 3 deepens
the top of funnel once the middle exists. Phase 4 starts now because its
outputs (quotes, language, the consent screenshot, the Loom) are inputs to
the code phases.

## Risks & open questions

- **Xero export formats drift** — mitigated by synonym-table parsing + our
  own template fallback; verify against a live org and each design partner's
  real export before launch.
- **Bills-only coverage** — without payments/contacts exports we can't run
  duplicate-payment or supplier-change rules; the coverage note must be
  honest and frame connect-Xero as "Siki checks the rest, continuously".
- **Anonymous upload abuse** — rate limit, size/row caps, in-memory only,
  no LLM call in this path (rules only) so cost per request is ~zero.
- **Scope escalation friction** — some users will approve a journal, hit the
  modal, and drop. Acceptable: better a moment of friction at value than a
  lie (perceived or real) at connect. Measure with `write_scope_escalated`
  and the journal-post success rate after escalation.
- **Demo skins uncanny valley** — keep names plausible but clearly fictional;
  never imply we know the visitor's actual suppliers.

## What we are deliberately NOT doing

- No mailbox/bank-feed OAuth to shortcut the export step — that's a bigger
  trust ask than Xero, not a smaller one.
- No second dashboard or results surface for uploads — findings render
  through the canonical cards (AP Integrity plan rule).
- No sector-specific AP rules — skins are presentation; rules stay
  sector-agnostic (music beachhead rule).
