# AP Integrity Implementation Plan

## Decision and product boundary

Sikizana helps small businesses **find, protect, and recover their money**.
AP Integrity is the protection pillar: evidence-backed detection of duplicate
bills and payments, supplier-detail changes, and other accounts-payable
exceptions. It extends the existing Xero findings workflow; it is not a new
product or a payment platform.

Construction `Project Bill Review` is a design-partner vertical built on the
same evidence and review primitives. It must remain isolated from the core
roadmap until it proves that document-led review produces enough confirmed
value to justify its additional ingestion and support surface.

### In scope for core

- Exact and near-duplicate purchase bills and payments.
- Supplier bank-detail changes relative to a retained, user-verified baseline.
- First-time or anomalous AP payments, unusual amount/timing, and missing
  credit candidates.
- Evidence-rich review cards in the existing findings panel, digest, and chat.
- Human dispositions: `safe`, `investigating`, `confirmed`, and `dismissed`.

### Explicitly out of scope for core

- Changing a supplier, bill, payment, or bank account.
- Initiating, blocking, or approving a payment run.
- Calling an exception fraud. Sikizana reports a risk requiring review.
- SaaS licence utilisation, contract negotiation, virtual cards, and general
  procurement workflows.
- Construction OCR, email ingestion, and project-document workflows.

## Core principles applied

| Principle | Implementation decision |
| --- | --- |
| Enhancement first | `build_findings()` remains the composition point. AP Integrity contributes standard findings; it does not create a second dashboard, chat, digest, or alert system. |
| Consolidation | Replace the current broad "risk of duplicate payment" unreconciled-transaction copy with specific, evidence-backed AP findings once the rules ship. Do not leave two overlapping detectors. |
| Prevent bloat | Start with four deterministic checks. Require confirmed design-partner value and an acceptable false-positive rate before adding models, email ingestion, or a construction vertical. |
| DRY | One canonical `Finding` shape, severity policy, money formatter, evidence model, and disposition vocabulary. API, UI, digest, and chat consume the same payload. |
| Clean | Accounting connectors fetch normalized facts. AP Integrity evaluates them. Findings composes outputs. API routes only authorize, validate, and serialize. |
| Modular | Rules are independent pure functions with fixture-based tests. Storage, normalization, evaluation, and presentation are separate modules. |
| Performant | Fetch each data set once per scan, use connector caches, evaluate incrementally where possible, persist compact fact snapshots, and never re-OCR or re-query historical data without a source change. |
| Organized | Use a domain directory for AP logic rather than growing `findings.py`, `payment_store.py`, or `main.py` into mixed-responsibility modules. |

## Target architecture

```text
AccountingConnector
  -> normalized invoices, payments, bank transactions, contacts
  -> ap_integrity/facts.py: builds stable supplier and payable facts
  -> ap_integrity/rules/*.py: pure exception detectors
  -> ap_integrity/service.py: evaluates rules and assembles evidence
  -> findings.py: composes AP findings with receivables and tax findings
  -> API / digest / chat / FindingsPanel: one finding payload
```

### Planned backend layout

```text
src/services/ap_integrity/
  __init__.py             # narrow public service interface
  models.py               # typed facts, evidence, dispositions
  facts.py                # connector data -> normalized AP facts
  service.py              # orchestration and rule registry
  rules/
    duplicate_bills.py
    duplicate_payments.py
    supplier_detail_changes.py
    payment_anomalies.py
  store.py                # AP-specific persistence; no direct SQLite elsewhere
```

`src/services/findings.py` remains a small orchestrator. It must call the AP
service, map its output to the canonical finding contract, and own ordering
across domains. It must not embed matching algorithms or SQL.

`src/services/payment_store.py` remains the migration runner and shared
connection helper. AP-specific queries live in `ap_integrity/store.py`; no
unrelated feature-specific SQL should accumulate in the shared store.

### Required connector enhancement

Extend `AccountingConnector` once with normalized `list_payments()` and ensure
the normalized invoice/contact shapes include stable IDs, references, and the
fields needed by every AP rule. Implement it in `XeroConnector` and the Xero
API adapter, then use that contract everywhere. No AP code may import
`XeroService` directly.

## Canonical facts and evidence

The rules operate only on normalized, typed facts:

- `PayableBill`: supplier ID, bill ID/number, reference, dates, currency,
  total, amount paid/due, status, and source update timestamp.
- `Payment`: payment ID, supplier ID, bill ID, bank account ID, date, amount,
  reference, and source update timestamp.
- `SupplierProfile`: supplier ID, display name, current bank-details fingerprint,
  first/last seen dates, and user-verified fingerprint where one exists.
- `Evidence`: source kind, stable source ID, field, expected/observed value,
  and an explanation safe to display to the user.

Hashes, not raw supplier bank details, are retained for comparison. Existing
source data remains authoritative; snapshots make a later change detectable.

### Finding contract

Every AP exception maps to the existing finding shape plus a single optional
`evidence` list and `review` state. No domain creates a second card schema.

```json
{
  "id": "ap-duplicate-bill:<stable-key>",
  "kind": "ap_duplicate_bill",
  "severity": "high",
  "amount": 1250.0,
  "title": "Possible duplicate bill: Acme Supplies",
  "detail": "Two authorised bills share invoice number, supplier, and amount.",
  "evidence": [],
  "review": {"state": "open"},
  "action": {"type": "review", "label": "Review evidence", "prompt": "..."}
}
```

## Delivery sequence

### Phase 0: evidence and rule calibration

**Goal:** prove a focused detector set on real historical data before exposing
it to customers.

1. Recruit 3–5 authenticated Xero design partners with permission to review
   historical bills and payments.
2. Build a redacted fixture corpus and a review worksheet containing source
   links, outcomes, and recoverable value.
3. Implement exact duplicate-bill and duplicate-payment rules first.
4. Record each candidate as confirmed, benign duplicate, data-quality issue,
   or unknown. Do not tune against unlabelled data.

**Exit gate:** every surfaced candidate is explainable from source facts; the
team has measured precision and confirmed-value data rather than anecdotes.

**Current status:** the deterministic demo now contains a labelled,
evidence-backed duplicate-payment scenario and the chat audit reports the same
canonical AP findings as the findings panel. The design-partner operating loop
is documented in [AP Integrity Design-Partner Runbook](AP_INTEGRITY_DESIGN_PARTNERS.md).
The remaining work is cohort recruitment and weekly outcome review, not a new
AP surface.

### Phase 1: horizontal AP Integrity MVP — shipped

**Goal:** let any connected Xero customer review the highest-confidence AP
exceptions in their existing workflow.

1. Add normalized payments and stable contact IDs to the connector contract.
2. Add AP fact snapshots, exception review state, and supplier-bank
   fingerprints through forward-only SQLite migrations.
3. Add the four rule modules and a single AP evaluation service.
4. Integrate AP results into `build_findings()`, existing digest generation,
   the agent context, and `FindingsPanel`; do not create a separate page.
5. Add review/disposition endpoints guarded by `require_authenticated_user`.
6. Add audit-history events for every disposition, never an automated change
   to Xero or supplier data.

**Implemented:** normalized payment access, deterministic duplicate bill and
payment checks, supplier-detail fingerprint changes, conservative first-payment
checks, evidence-bearing findings, authenticated review dispositions, confirmed
value and dismissal-reason capture, digest integration, audit events, session
deletion coverage, release controls, and regression tests across the AP domain
and Xero normalization layer. Keep thresholds conservative while Phase 0
calibration continues.

**Exit gate:** a customer can identify the source records, make a disposition,
and see the same state in chat, findings, and the digest.

### Phase 2: supplier change and anomaly controls

**Goal:** identify high-impact risks that require a verified human check.

1. Establish a supplier-detail baseline from the first trusted sync or an
   explicit user verification.
2. Alert only on an actual fingerprint transition, with prior/current dates
   but without displaying raw bank details unnecessarily.
3. Add explainable amount, cadence, and first-payment anomalies only where
   the supplier has enough history for a meaningful baseline.
4. Add a user-facing verification checklist that directs them to an existing,
   independently obtained supplier contact channel.

**Exit gate:** alerts are review prompts, not fraud allegations; false-positive
and dismissal reasons continue to calibrate thresholds.

### Phase 3: construction design-partner pilot

**Goal:** validate document-led project bill review without contaminating core
AP architecture.

1. Create an opt-in `project_review` domain with encrypted document storage,
   source/page provenance, and project-scoped authorization.
2. Begin with upload or a dedicated forwarding address. Do not request broad
   mailbox OAuth in the first pilot.
3. Extract billing schedules, prior/current/cumulative totals, retainage, and
   change-order references. Deterministic reconciliation rules lead; an LLM
   assists OCR recovery, retrieval, and report wording.
4. Return only owner-addressed, page-cited reports. Never send to contractors
   or modify payment data.

**Exit gate:** confirmed exceptions and review time saved justify the added
document lifecycle, OCR cost, and vertical support burden.

## Data lifecycle and security

- Core AP scans use only read-only accounting data and preserve the existing
  disconnect/delete semantics.
- Raw documents are not Supermemory memories. Store them encrypted, scoped to
  a user/project, with explicit retention and deletion records.
- Mail intake, if introduced, uses the narrowest scope: a designated label or
  folder, read-only access, and no send permission.
- Reports may be sent only to a verified, account-owned address. Enforce this
  in server-side authorization and the mail adapter, not in prompts.
- Supplier detail changes must be represented as a risk and verified by a
  known contact path; source material may itself be compromised.

## Performance and operations

- Reuse the connector's session-scoped cache and obtain invoices, payments,
  contacts, and bank transactions at most once per scan.
- Keep rule functions pure and linear or indexed by stable supplier/invoice
  keys. Avoid pairwise comparisons across the entire history without an
  indexed candidate key.
- Persist only compact normalized facts and evidence references. Re-evaluate
  an entity when the related source record changes, not on every page load.
- Run broad historical backfills asynchronously with per-session locking,
  retry limits, telemetry, and user-visible status.
- Track scan duration, source fetch count, candidates by rule, review outcome,
  confirmed value, and dismissal reason. These are product-quality metrics,
  not vanity metrics.

## Testing and release gates

- Unit-test each rule with positive, negative, near-match, currency, partial
  payment, and idempotency fixtures.
- Contract-test every connector's normalized payment and supplier-ID shape.
- Integration-test one AP scan across connector -> facts -> rules -> findings
  -> API disposition -> digest payload.
- Add migration, authorization, data deletion, and raw-bank-detail redaction
  tests before a live rollout.
- Before broad rollout, configure `AP_INTEGRITY_USER_IDS` for design partners
  and keep `AP_INTEGRITY_DISABLED` available as the global kill switch. Both
  controls disable evaluation while preserving reviewed records.

## Documentation ownership

- This file is the implementation and scope source of truth for AP Integrity.
- `AGENTS.md` carries the architectural boundary and contribution rules.
- `README.md` carries the product promise and the customer-visible capability.
- `docs/BRAND.md` governs honest AP-risk language and Siki/Zana ownership.
- `docs/EXTERNAL_INTEGRATIONS.md` records the future mail/document integration
  boundary and its security constraints.

Update these documents in the same change as any material scope or safety
decision. Delete superseded plans rather than leaving competing roadmaps.
