# Portal API — contract for the erp.ai client portal

Read-only API surface for the ProtoRun client portal. The erp.ai backend
calls these endpoints **server-side** (from a workflow/action), with the
portal token stored in erp.ai — never in build.host website code, where
anyone could read it.

Base URL (production): `https://sikizana.persidian.com`

## Auth

```
Authorization: Bearer skz_pt_<token>
```

- Mint via `POST /api/portal/tokens` while signed in (see "Token lifecycle").
- A token resolves to exactly **one session's books** — the session whose
  platform connection was active when it was minted.
- Rate limit: ~30 reads/minute per token → `429` when exceeded.
- Errors: `401` missing/invalid/revoked token. Token revocation is instant.
- Deleting the session's data (disconnect or full erasure) deletes its
  tokens — a credential can never outlive the books.

## Endpoints

All `GET`, all read-only. Every handler reuses the canonical services, so
the portal sees the same numbers as the books page.

### `GET /api/portal/org`

Organisation identity + data provenance for the portal header.

```json
{
  "organisation": { "name": "...", "countryCode": "GB", "...": "..." },
  "provenance": "live | sandbox | sample",
  "mode": "live-oauth | demo | seapoint-sandbox | ...",
  "tenant_name": "Acme Ltd" | null,
  "platform_display_name": "Xero"
}
```

Branch UI copy on `provenance`, not `mode` (sample data → say so honestly).

### `GET /api/portal/receivables`

Aged receivables — the dashboard's core view.

```json
{
  "total_outstanding": 12345.67,
  "total_overdue": 6789.00,
  "buckets": [
    { "key": "current",   "label": "Not yet due", "amount": 0, "count": 0 },
    { "key": "b_1_30",    "label": "1-30 days",   "amount": 0, "count": 0 },
    { "key": "b_31_60",   "label": "31-60 days",  "amount": 0, "count": 0 },
    { "key": "b_61_90",   "label": "61-90 days",  "amount": 0, "count": 0 },
    { "key": "b_90_plus", "label": "90+ days",    "amount": 0, "count": 0 }
  ],
  "debtors": [
    { "name": "Customer Co", "total": 1250.0, "oldest_days": 42,
      "buckets": { "b_31_60": 1250.0 } }
  ],
  "dso": { "days": 34.5 | null, "sample": 17 },
  "invoice_count": 9
}
```

`dso.days` is average days-to-pay over paid invoices (null when no history).

### `GET /api/portal/findings`

The canonical findings stream — same cards as the books page. Each finding
has `id`, `kind`, `severity` (high|medium|low), `title`, `amount`, `detail`,
and an `action` with a ready-made prompt. Wrapper fields:

```json
{
  "mode": "demo",
  "money_found": 1250.0,
  "counts": { "overdue": 1, "unreconciled": 4, "tax_flags": 0,
              "ap_risks": 1, "cafe": 0, "receivables": 0 },
  "clean": false,
  "findings": [ { "id": "inv-...", "kind": "overdue_invoice",
                  "severity": "high", "title": "INV-0001 — Customer Co",
                  "amount": 1250.0, "detail": "42 days late · ...",
                  "action": { "type": "chase", "label": "Chase now",
                              "prompt": "Draft a payment reminder ..." } } ],
  "aging": { "buckets": [...], "total_outstanding": 0, "dso_days": null },
  "recovered": { "total": 0, "count": 0 },
  "ap_reviewed": { ... } | null,
  "cafe_reviewed": { ... } | null
}
```

`kind` vocabulary: `web/lib/finding-kinds.ts` (`FINDING_KIND_META`) is the
exhaustive list — overdue_invoice, overdue_bill, unreconciled, tax_flag,
ap_* (AP Integrity), cafe_*, and receivables-route kinds.

### `GET /api/portal/chase-queue`

Armed chase sequences — the approval/status view.

```json
{
  "sequences": [
    { "id": 3, "invoice_number": "INV-0001", "contact_name": "Customer Co",
      "contact_email": "...", "amount": 1250.0, "due_date": "2026-10-01",
      "status": "active | completed | exhausted | cancelled",
      "simulated": 0, "next_stage": 2, "next_send_at": "2026-11-14",
      "created_at": "...", "updated_at": "...",
      "events": [ { "stage": 1, "outcome": "sent", "subject": "...",
                    "to_email": "...", "created_at": "..." } ] }
  ]
}
```

### `GET /api/portal/recoveries`

Recovery tracking — the win tally plus recent recovery events.

```json
{
  "recovered": { "total": 2340.5, "count": 3 },
  "events": [
    { "action": "chase_recovered", "description": "...",
      "amount": 1250.0, "created_at": "..." }
  ]
}
```

## Token lifecycle (signed-in session, cookie auth — not Bearer)

| Route | Purpose |
|---|---|
| `POST /api/portal/tokens` `{ "label": "erp.ai" }` | Mint a token; plaintext returned **once** as `{ "id", "token" }` |
| `GET /api/portal/tokens` | List own tokens (id, label, created_at, last_used_at, revoked_at) |
| `DELETE /api/portal/tokens/{id}` | Revoke (owner only) → `404` if unknown/already revoked |

Requires a signed-in Sikizana session (`401` for anonymous). Intended UX:
a "Connect portal" control on the account page mints a token the user
pastes into erp.ai.

## Notes for the Proto/erp.ai build

- Call from an erp.ai **workflow/action**, not from the page — the token
  must stay out of anything a browser can read.
- Poll cadence: a dashboard needs at most one fetch per endpoint per view;
  findings/receivables recompute per call (no cache) so don't loop.
- `chase_recovered` events come from the audit trail — `description` is
  human-readable, `amount` the recovered sum.
- All amounts are minor-unit-free floats in the org's currency (GBP for
  the demo/pilot orgs).
