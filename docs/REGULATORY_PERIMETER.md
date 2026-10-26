# Regulatory Perimeter

## Status

Exploratory design constraint. Not legal advice, not a roadmap commitment.
This document exists to bound a *possible* direction (receivables discovery /
settlement) before any of it is built, so that the default answer to "is this
allowed?" is "no" and the burden of proof is on adding a new activity.

The rule this document encodes:

> **Design to the strictest plausible perimeter (UK ∪ AU ∪ US), then relax
> only where written counsel says so.**

**Primary market: UK** (confirmed). The UK column is the one we are
building against; the AU and US columns stay in the matrix as design stress
tests, so a future market change does not reopen settled code. The UK
questions we are asking counsel are written up in
[`docs/UK_COUNSEL_BRIEFING.md`](UK_COUNSEL_BRIEFING.md).

If Sikizana's first market is one country, the other two columns still act as
a design stress test. The rails below are chosen so that the product is
unambiguously outside the perimeter in all three.

## 1. Activities we refuse (perimeter — never build)

Each of these is a licensed or regulated activity in at least one plausible
market. Sikizana does not do them, does not facilitate them, and does not
take a fee that depends on them.

| # | Refused activity | Why it is regulated |
|---|------------------|-------------------|
| P1 | Holding, custody of, or transmitting customer money | Payment institution / money transmission licensing; safeguarding, AML, KYC, sanctions |
| P2 | Extending credit, underwriting, or deciding credit worthiness | Credit provider licensing; AFSL (AU), state lending licences (US), consumer credit regimes |
| P3 | Arranging credit, brokering credit, or "introducing" a funder to a customer | Credit broking / arrangement activity; in practice the most common accidental trigger (see §6) |
| P4 | Taking an assignment of, or a security interest in, receivables | Secured-transaction / secured-lending regimes; perfection, priority, and often licensing |
| P5 | Being a party to a payment promise, guarantee, or surety | "Issue of a financial guarantee" is itself a regulated activity in some markets; also rep risk |
| P6 | Operating a registry of other businesses' debts or credit standing | Credit information / credit reporting regimes; plus data protection (§6) |
| P7 | Netting, clearing, or settling obligations on our users' behalf | Clearing/settlement and payments regulation; AML and safeguarding |
| P8 | Valuing, issuing, or intermediating non-cash instruments (credits, barter) | If credits become a unit of account with a value and are cleared, this is a payment/clearing arrangement or e-money |
| P9 | Advising on credit, financial products, or investments | Licensed financial advice; financial-promotion rules (see §6) |

**Consequence:** the "marketplace" and the "AI credits" versions of the
receivables idea are both *inside* the perimeter as described. They are not
"hard to license" — they are the licensed parts. We are not pursuing them.

## 2. What is inside the perimeter (safe zone)

Sikizana may, with no licence, no custody, and no contingency:

- **Read the user's own books** through the connector abstraction and analyse
  them (this is the whole product today).
- **Compute deterministic observations about those books** — ageing, offsets
  between what the user owes and what is owed to them, dispute and duplicate
  signals, the cheapest route to cash the user can execute alone.
- **Present risk as risk** ("this invoice is at risk because this customer's
  own payments are late") — an opinion about the user's own data, not a
  statement about a third party's creditworthiness.
- **Draft and send the user's own collection communications** (Zana) on the
  user's instruction.
- **Run a stateless, read-only scan for an authorised external caller** (the
  existing `MCP_API_KEY` surface) — the caller owns all review state.
- **Act as a vendor to a lender that comes to us**, delivering a factual
  attestation about an invoice that both counterparties' books corroborate
  (see §5 for the exact boundaries of that product).

## 3. Hard rails (product rules, enforced in review)

These are written so they can be checked against a diff.

- **R1 — No money.** Sikizana never receives, holds, moves, or instructs the
  movement of customer funds. No payment links, no "pay Xero for me", no
  escrow, no settlement account.
- **R2 — No credit.** Sikizana never extends credit, lends, underwrites,
  scores, or states that a business is creditworthy. The words "credit
  score", "creditworthy", "lender-approved", "pre-approved" never appear in
  product copy.
- **R3 — No arrangement.** Sikizana never introduces a credit provider to a
  customer, never ranks credit providers for a customer, never accepts a
  referral fee, and never names a specific credit provider in product copy or
  chat output.
- **R4 — No contingency.** Sikizana's revenue is never a function of whether
  the user chases, settles, factors, or borrows. Subscription and per-unit
  vendor fees only. (This is also a product feature: *Siki never earns more by
  telling you to borrow*.)
- **R5 — No third-party debt registry.** Sikizana does not maintain a
  searchable store of who owes whom, and never surfaces one business's
  receivable to another business without that business's explicit, informed,
  revocable consent for that specific disclosure.
- **R6 — No netting or settlement by us.** Sikizana does not net, offset,
  assign, novate, or clear obligations between its users, and does not
  instruct a payment to a party other than the user's own counterparty.
  *Offsets detected inside a single user's books are observations, not
  executions* — the user decides and does it themselves.
- **R7 — No guarantee language.** Nothing Sikizana emits may read as a promise
  to pay, a guarantee, a surety, or credit assurance. Attestations are
  scoped to "the books as recorded, as at date X, no dispute recorded".
- **R8 — No third-party credit standing.** Product copy describes a
  counterparty's *behaviour in the user's books* (late, short-paid,
  disputed), never their *creditworthiness*. No "risk score of a supplier".
- **R9 — No cross-user data use without consent.** Any use of one user's
  books to benefit another user requires prior, specific, revocable consent
  and is covered by the privacy notice. Default is no cross-user use.
- **R10 — No instrument handling.** Sikizana does not issue, price, hold,
  broker, or accept non-cash instruments (credits, barter, tokens) as
  consideration. It may *describe* a non-cash settlement the two parties
  arrange themselves, as information, without pricing, verifying, or
  facilitating the instrument.
- **R11 — Vendor-initiated only.** Any external commercial surface (a lender
  asking Sikizana to confirm an invoice) must be initiated by the external
  party. Sikizana never solicits a business to be "confirmed" for a funder.
- **R12 — Factual, dated, scoped, revocable.** Every third-party-facing
  assertion is: factual, tied to a date, scoped to a named invoice, and
  revocable by the user. No forward-looking statements, no opinions about a
  third party's future, no projections of a counterparty's ability to pay.

## 4. Jurisdiction matrix (what triggers what)

Conservative, category-level, and **not** a substitute for counsel. The
practical instruction: if a feature would only be safe in one column, it is
out of scope until counsel signs off in writing.

| Activity | UK | AU | US | Sikizana |
|---|---|---|---|---|
| Holding/transmitting money | Payment institution / e-money (FCA) | AFSL + payments licensing (AFSL for payments) | State money transmitter; MSB | **Never** (R1) || Business lending / factoring | Generally unregulated for B2B factoring; consumer credit rules bite sole traders | Credit provider licence under National Credit Code (s160) where credit is provided; AFSL for credit broking | State commercial lending/consumer lending licences; often factoring carved out but brokering varies | **Never** (R2) |
| Broking / arranging credit | Credit broking; financial-promotion rules (FSMA s21) if a regulated activity is promoted | Credit broking is a credit activity (AFSL) | Loan brokering licences (varies by state) | **Never** (R3) |
| Referral fee for credit | Risk: being treated as broking/promotion | High risk: AFSL expected | Risk: broker licensing | **Never** (R3, R4) |
| Assignment / security over receivables | Security interests; factoring generally out of scope of consumer regime | Secured transactions; licensing if taking a security interest for payment | UCC Art. 9; many states licence secured lending | **Never** (P4) |
| Own-name financial guarantee | Financial guarantee = regulated activity | Issuing an own-name guarantee is a credit activity requiring AFSL | State lending + UCC suretyship | **Never** (R7) |
| Credit information business | Credit reference agency regime (limited) | Credit reporting / CR code | FCRA (US) and state regimes | **Never** (P6) |
| Clearing / netting of obligations | Payments/clearing perimeter | AFSL | Payment/clearing state regimes | **Never** (P7) |
| Non-cash instrument (credits/barter) | If it becomes a unit of account with clearing → e-money/payments | AFSL if a payment system | Money transmission / state law | **Never** (P8) |
| Advice on credit/investments | FSMA financial promotion | AFSL + FSG advice | Investment adviser / commercial lending | **Never** (P9) |

**Note on sole traders.** A "small business" in our user base may be a sole
trader or partnership, which consumer-credit regimes often treat as
*consumers*. That widens the perimeter materially. Until counsel advises
otherwise, treat consumer-credit capture as in scope and design so that we
are outside it.

**UK-specific notes (to be confirmed by counsel — see the briefing):**

- Business-to-business credit is, in general, outside the consumer-credit
  regime, but the *agent's* behaviour is the live risk, not the product's:
  an LLM that volunteers "your bank may offer early-payment discounting" may
  be making a financial promotion even though the product never names a
  provider. This is why R3 bans naming providers and why the perimeter test
  in `tests/test_cash_routes.py` greps the emitted copy for credit-promotion
  vocabulary.
- Set-off between two cross-contractual balances of solvent debtors
  generally needs the other party's agreement; insolvency set-off is
  automatic (Insolvency Act 1986 s233). Our copy therefore proposes rather
  than asserts, and routes the decision to the user's accountant.
- A set-off does not defer VAT: the tax point is the supply, not the
  payment. We flag that for the accountant; we do not advise on it.

## 5. The one commercial surface that is inside the perimeter

A lender or a factoring desk currently cannot verify a receivable cheaply:
they see one side of the transaction and must trust the borrower's own
books. Sikizana can, in principle, produce a *factual attestation* that an
invoice is recorded on both counterparties' books, is undisputed on both
sides, and has not been duplicated or voided.

Bounds that keep it outside the perimeter:

- **Vendor-initiated.** The lender (or their system) asks. Sikizana never
  pitches the user as a financeable prospect. (R11)
- **Per-unit or subscription fee.** Never a percentage of any advance,
  never a fee contingent on funding. (R4)
- **Factual only.** "Both books record invoice INV-104 dated 3 Mar, £4,200
  due 17 Apr, no dispute recorded on either side as at today." No
  creditworthiness opinion, no score, no probability of payment, no
  recommendation to lend. (R8, R12)
- **No forward-looking data.** No cash-flow forecasts, no "can repay", no
  aggregation of the user's other obligations unless the user consents to a
  specific, scoped disclosure.
- **User-visible and revocable.** The user can see the attestation, who
  received it, and withdraw it. (R12)
- **No promise.** It is not a guarantee, a surety, or a payment promise from
  Sikizana. (R7)

This is a **data and workflow product**. It creates no licence obligation in
the matrix above, because Sikizana holds no money, extends no credit,
arranges nothing, and guarantees nothing.

## 6. Traps that are not obvious

These are the ways the perimeter gets breached by accident, usually through
copy or through a well-meaning feature.

1. **The word "lender" in the chat.** "You could ask your bank about early
   payment" is a promotion of credit. Naming a provider is worse. Rule R3
   bans naming providers; general information is permitted but must not be
   actionable marketing for a credit product. *Safer default: Siki ranks only
   the routes the user can execute themselves (chase, net, payment plan) and
   mentions third-party finance only as a category, without a name, without a
   referral, and without a fee.*
2. **"Payment promise" phrasing.** A user-visible object that reads as a
   commitment ("C has promised to pay A on the 14th") is a guarantee-shaped
   artefact. Use "recorded and unchallenged on both sides", never "promised".
3. **Sole traders get consumer treatment.** See §4. Design for the strictest
   case.
4. **Free advice is still promotion.** "Free" does not change whether a
   financial promotion occurred.
5. **Attestation drift.** An attestation that starts as facts ("both books
   record it") can drift into assessment ("the debt is sound") the moment a
   scoring model is attached. Any ML on top of an attestation must be
   re-reviewed against the perimeter; the default is no model.
6. **Cross-user data by aggregation.** "How many of your invoices are also
   held by another Sikizana business" is cross-user use and, if it becomes
   queryable, a registry. R9/R5.
7. **The trust-dilution trap.** The moment a user's books inform another
   user's financial outcome, "Siki protects your money" stops being
   unqualified. Keep the influence one-directional (Siki tells the user about
   the user's own data) until counsel and design-partners both say otherwise.
8. **Review/approval of counterparties.** Any "verified business" badge on
   one business as seen by another is a credit-information act. Forbidden.
9. **Insurance is not a licence.** PI insurance does not make a regulated
   activity permissible; it only covers losses. Never treat "we're insured"
   as a reason to enter the perimeter.

## 7. Compliance gate for any new feature

No PR may add a money-, credit-, or counterparty-facing behaviour without
passing this checklist, recorded in the PR description. This mirrors the
repo's existing architectural rules (e.g. "AP rules must not import
`XeroService`").

- [ ] Does any user money move, or could Sikizana be construed as moving it?
- [ ] Does Sikizana state or imply an opinion about a third party's
      creditworthiness?
- [ ] Does any output name, rank, or recommend a credit provider?
- [ ] Is any fee contingent on a financing, settlement, or collection outcome?
- [ ] Is any third-party-facing statement factual, dated, scoped, and
      revocable — and free of promise/guarantee wording?
- [ ] Does the feature use one user's books to benefit another user? If yes,
      is there specific, informed, revocable consent and a privacy-notice
      basis?
- [ ] Does Sikizana net, assign, clear, or instruct payment between users?
- [ ] Does the feature handle a non-cash instrument, price it, or verify it?
- [ ] Does it create or expose a registry of who owes whom?
- [ ] Which column(s) of §4 does this touch, and has counsel confirmed in
      writing for the target market?

If any answer is "yes", the feature is out of scope until the perimeter
document is amended with a written legal basis.

## 8. v1: what we can ship inside the perimeter today

Only the user's own books, deterministic rules, canonical findings stream, no
new surfaces. Nothing here needs counsel beyond a sanity check on consumer
credit capture.

1. **Net-offset observation** — the user owes B £5,000 and B owes the user
   £4,200; the net is £800 and the relationship can be settled without cash.
   Detected from the user's own books alone, so no consent and no
   cross-user data. An *observation*: the user decides and executes. (R6)
2. **Cheapest executable route to cash** — for each overdue invoice, rank the
   routes the user can execute alone: chase (Zana, existing), net against
   what is owed to them, or a written payment plan. Third-party finance is
   not ranked (see trap §6.1). (R2, R3, R4)
3. **Double-relationship risk** — the same counterparty is both a customer
   and a supplier, and one leg is late: the risk to the user's cash, framed
   from the user's own books. (R8)
4. **Dispute/dilution watchlist on the credit side** — a creditor-side
   mirror of AP Integrity: invoices that are overdue, short-paid, disputed,
   or credited back, with the counterparty's payment behaviour as recorded in
   the user's books. This is the "credit-side" half of the pillar and needs
   no new data source. (R8)

All four land in `build_findings()` as new kinds in a `RECEIVABLES_KINDS`
domain set, with entries in `src/services/finding_kinds.py` and
`web/lib/finding-kinds.ts` (the frontend record is exhaustive, so tsc fails
without one). They are reachable through the existing books/findings surface
and the `/books?flow=check` handoff — no second dashboard.

**Status: shipped (demo + live books).** Implementation:

- `src/services/cash_routes.py` — the analysis and the findings builder.
  `build_cash_routes(svc)` returns positions, offsets, per-invoice routes
  and credit-side exceptions; `build_cash_route_findings(svc, data=None)`
  turns them into canonical findings.
- `src/services/finding_kinds.py` — `NET_OFFSET`,
  `CREDIT_SIDE_EXCEPTION`, and the `RECEIVABLES_KINDS` domain set.
- `src/services/findings.py` — composes the new findings into the canonical
  stream, and replaces the plain "chase the full amount" prompt with a route
  comparison when the same counterparty appears on both legs of the books.
- `src/tools/accounting_tools.py` + `src/agents/tool_registry.py` — the
  `get_cash_routes` agent tool, so Siki can answer "how do I get paid
  faster?" and "can I offset what I owe them?" in chat.
- `tests/test_cash_routes.py` — the rules **and** the perimeter guard: the
  test fails if any user-facing string contains credit-promotion, guarantee
  or creditworthiness language.
- `tests/test_demo_scenarios.py` — the music sample books carry a two-sided
  relationship (Camden Rehearsal Studios) so the feature is visible in the
  demo without touching the café scenario's existing expectations.

What is deliberately **not** in v1: anything involving another user's books
(chain-level visibility, cross-creditor matching, marketplace discovery).
That requires the consent model in R9 and the attestation product in §5, and
it is where counsel needs to be involved.

## 9. Open questions for counsel (target market first)

1. In our first market, does operating the v1 features above (read-only
   analysis of the user's own books, net-offset observation, route ranking)
   touch any licensing, credit-promotion, or consumer-credit regime?
2. Does an attestation that a lender *requests* (vendor-initiated, per-unit
   fee, factual only) constitute arranging/brokering credit in our market?
3. Does consumer-credit capture (sole traders as consumers) change any
   answer, and what would we have to do to stay outside it?
4. If a user asks Siki "can I offset what I owe them against what they owe
   me", what are the enforceability and tax/VAT considerations we should
   flag (informing, not advising)?
5. What wording, disclaimers, and consent records are required for an
   attestation to be usable by a third party in our market?

## 10. What this document rules out

Explicitly, for the record: Sikizana will not build a receivables
marketplace, a settlement or netting engine, a credit marketplace, a
guarantee or payment-promise product, a debt registry, or an AI-credits
clearing network. If a future direction requires any of those, it requires a
licence and a different company, and it is out of scope for this product.

## 11. Related documents

- [`docs/UK_COUNSEL_BRIEFING.md`](UK_COUNSEL_BRIEFING.md) — the questions
  we are asking UK counsel, with the real product copy for review.
- [`docs/AP_INTEGRITY_PLAN.md`](AP_INTEGRITY_PLAN.md) — the pillar this
  work extends (credit side is the mirror of the payable side).
- [`docs/MUSIC_BEACHHEAD.md`](MUSIC_BEACHHEAD.md) — the beachhead whose
  sample books now carry the two-sided relationship.
