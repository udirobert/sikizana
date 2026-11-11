# ProtoRun launch runbook

Execution order for the erp.ai portal + build.host site, against the
Nov 20 EOD PST deadline. Rules ground truth: `docs/PROTORUN.md`.
API contract: `docs/PORTAL_API.md`.

Target topology — the erp.ai API key and the portal token never reach
browser code:

```
build.host site (public, ads land here)
   └─ signup form → erp.ai record (what ProtoRun counts as a customer)
erp.ai portal app (server-side workflows, stores skz_pt_ token)
   └─ Bearer https://sikizana.persidian.com/api/portal/*  (read-only)
Sikizana API ── Xero
```

## 1. Deploy backend (day 1)

`./deploy.sh` pulls `main` on the VPS and rebuilds — migration 17 runs
automatically at startup. Then set in the VPS `.env`:

| Var | Production value | Why |
|-----|------------------|-----|
| `ALLOWED_ORIGINS` | `https://sikizana.persidian.com,https://<subdomain>` | `*` breaks credentialed cookies; the portal site needs explicit origin only if it calls the API from the browser — server-side erp.ai calls don't need CORS at all |
| `COOKIE_SECURE` | `true` | HTTPS |
| `APP_BASE_URL` | `https://sikizana.persidian.com` | Stripe redirect base |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_*_PRICE_ID` | live keys | real checkout; start Stripe verification day 1, it can take a day |

**Billing status (2026-11-11):** TEST-mode values are wired and verified
end-to-end on prod — products Pro £29/mo (`price_1UajoWCfulKWL5tKpoZN2g18`)
+ Business £79/mo (`price_1UajoYCfulKWL5tKis0aqgKF`), webhook endpoint
`we_1UajodCfulKWL5tK3HgrQ84z` on the "weft sandbox" test account; a
`checkout.session.completed` trigger was delivered + processed (200).
Go-live = swap the four vars for `sk_live_`/live IDs + `BILLING_ENFORCED=true`
and recreate the api container. Test payments do not count for ProtoRun.
| `BILLING_ENFORCED` | `true` when checkout goes live | quotas actually gate |

Verify: `curl https://sikizana.persidian.com/api/portal/org` → `401`
(no token). Mint a real token on `/account` → "Connect portal" →
`curl -H "Authorization: Bearer skz_pt_…" …/api/portal/org` → `200`.

## 2. erp.ai build (days 2–4) — Proto prompts

### Portal app — data model

Mirror, don't duplicate — records refresh from the API:

- `OrgSnapshot` — org name, currency, provenance, `synced_at`
- `ReceivablesSnapshot` — bucket totals, debtor rows (JSON), `synced_at`
- `Finding` — finding id, kind, title, detail, amount, evidence (JSON),
  review state, `synced_at`
- `ChaseItem` — invoice number, sequence status, next step, `synced_at`
- `Recovery` — amount, invoice, recovered_at
- `Customer` — the signup record (name, email, business, plan, source)
  — **this is what ProtoRun counts as a customer**

### Portal app — workflows (all server-side, token in erp.ai secret store)

1. `sync_org` — GET `/api/portal/org` → upsert OrgSnapshot
2. `sync_receivables` — GET `/api/portal/receivables` → upsert snapshot
3. `sync_findings` — GET `/api/portal/findings` → upsert Finding rows
   keyed by finding id (idempotent — re-runs update, never duplicate)
4. `sync_chase_queue` — GET `/api/portal/chase-queue` → upsert ChaseItem
5. `sync_recoveries` — GET `/api/portal/recoveries` → upsert Recovery
6. Schedule the five syncs (hourly is plenty; findings are daily-fresh)
7. `on_signup` — when a Customer record is created, provision Sikizana:
   `POST /api/auth/register {email, password}` with a generated password,
   then email the customer a password-reset link so they set their own.
   Fallback if erp.ai outbound calls are limited: form posts to Sikizana
   register directly (CORS origin added) *and* to an erp.ai form — two
   writes, one click.
8. `on_plan_change` — optional: mark Customer paid when checkout
   completes (Stripe is the payment truth; erp.ai mirrors status)

### Ops app (the "we run our own business on erp.ai" story)

- `Subscription` records — plan, status, MRR — fed by signup/checkout
- `SupportTicket` — intake form on the portal site → triage queue
- `ChurnSignal` — customers with no session/finding activity (manual v1)

## 3. build.host site (days 4–5)

- Landing: what the portal is, live dashboard link, signup form
- Portal dashboard views over the synced records (aged receivables,
  findings, chase queue, recoveries) — provenance labels everywhere
- Pricing → real Stripe checkout (link into `/account?intent=pro` or a
  dedicated checkout path)
- Footer: privacy, terms, contact email **on this site** (Meta checks
  the ad destination)
- Signup form → erp.ai Customer record (workflow `on_signup` bridges
  to Sikizana account)

## 4. Compliance assembly (days 5–6)

- [ ] Cloudflare DNS: `<subdomain>` → build.host target
- [ ] GA tag + GSC verify + sitemap on the build.host site
- [ ] Meta Pixel on the site (before ads)
- [ ] Stripe live keys → test a real £1 checkout end-to-end
- [ ] E2E: portal signup → erp.ai Customer record → Sikizana account
      provisioned → checkout works

## 5. Submit early (~Nov 17–18)

Unlimited resubmission — submit the skeleton, keep improving, resubmit.
Assets: erp.ai app link, build.host URL, screenshots folder link, owner
name/contact + quote (judges may call), 2–3 min Loom showing
business → portal → live Xero data → signup, both consent boxes.

## 6. Ads (post-submission only)

- business.facebook.com ad account; add partner `1476827121261452`
  (view-only)
- Campaigns point only at the build.host site; Pixel tracks signup
- $10 increments, post each in the team Discord channel — spend is only
  reimbursed if visible in the ad account

## Stretch: real customers

3–5 genuine signups beat any polish — invite design partners from
`docs/AP_INTEGRITY_DESIGN_PARTNERS.md` and friends' businesses through
the live portal.
