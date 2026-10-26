# UK Counsel Briefing — Sikizana cash routes (v1)

**Prepared for:** external UK counsel (financial services / commercial)
**Subject:** review of the regulatory perimeter around a new set of read-only
bookkeeping features ("cash routes")
**Status:** pre-launch review. Nothing described here is live in production
beyond the sample-books demo; no customer data is involved.
**Date:** draft for review

---

## 1. What we are (and are not)

Sikizana is a bookkeeping assistant for small UK businesses. It connects to
their accounting platform (Xero today), reads their books, and reports
deterministic observations with one-click actions. It is read-only by
default; the user approves every consequential step.

**What the new feature does (v1, shipped to the demo):**

1. Detects counterparties that appear on **both sides** of the same
   business's books — the business owes them money *and* they owe the
   business money — and reports that the smaller leg can be **proposed** for
   set-off.
2. For each overdue receivable, ranks the **routes the business can execute
   alone**: net it against what it owes that counterparty, chase it, or
   agree a written payment plan.
3. Reports receivables that are not clean invoices: part-paid, overpaid, or
   written off.

**What it explicitly does not do:**

- It does not move, hold, or instruct the movement of money.
- It does not net, assign, novate, or settle anything. The user makes the
  proposal; the user executes it.
- It does not extend credit, assess creditworthiness, or score anyone.
- It does not name, rank, or introduce any lender or credit provider, and it
  takes no fee that depends on a financing outcome.
- It does not use one customer's data for another customer's benefit. Every
  observation is computed from that customer's own books alone.
- It does not use "credit", "loan", "lender", "factoring", "guarantee" or
  similar language in any user-facing output — this is enforced by an
  automated test (`tests/test_cash_routes.py`).

**Direction we have deliberately ruled out** (and would come back to you
before building): any marketplace that matches receivables between
unrelated businesses, any settlement or netting engine, any non-cash
(credit/barter) settlement, any assignment of receivables, and any
lender-facing confirmation product. Our working assumption is that those
*are* regulated activities and out of scope; question 9 asks you to confirm
or correct that assumption.

---

## 2. The product copy under review

These are the actual strings the product emits (from
`src/services/cash_routes.py`). Please review the wording, not just the
architecture.

**Net-offset card (title / detail):**

> Camden Rehearsal Studios: £600 can be settled without cash
>
> You owe Camden Rehearsal Studios £950.00 and Camden Rehearsal Studios owes
> you £600.00. £600.00 of the two balances can cancel out instead of being
> paid in cash — about £0.22 a day of interest stops running on that part.

**Action prompt (goes to the AI agent, which explains and drafts):**

> I owe Camden Rehearsal Studios £950.00 and Camden Rehearsal Studios owes me
> £600.00. Explain how a set-off works between these two balances, including
> the VAT and contract-terms points and whether we would need Camden
> Rehearsal Studios's agreement. Then draft a short note to Camden
> Rehearsal Studios proposing that we settle £600.00 of the two balances
> against each other. Flag anything that needs my accountant to confirm, and
> do not commit us to anything beyond the balances in the books.

**Route comparison on an overdue invoice:**

> Invoice INV-0005 for £600.00 from Camden Rehearsal Studios is 12 days late.
> We also owe Camden Rehearsal Studios £950.00, so about £600.00 of it could
> be settled against that balance instead of chasing cash. Compare the routes
> for getting this money: (a) net it against what we owe them, (b) chase for
> the full amount, (c) agree a written payment plan. Tell me which costs the
> least, what I need to check with my accountant before doing it, and draft
> the message — but do not commit us to anything beyond the balances in the
> books.

**Agent tool summary (structured, machine-read by the AI agent):**

> NET-OFFSET OPPORTUNITIES (same counterparty on both sides):
>   Camden Rehearsal Studios: you owe £950.00, they owe you £600.00 →
>   £600.00 can cancel out instead of cash
>   Set-off normally needs the other party's agreement — treat this as a
>   proposal to make, not a right to exercise.

**Existing (pre-feature) copy that interacts with the new feature:**

> Draft a payment reminder email for invoice INV-0004 to Field Day Festival
> for £2,400.00, which is 30 days overdue. I'm losing £0.87/day in statutory
> interest.

---

## 3. Questions

### A. Set-off (the core mechanic)

1. **Is a set-off of two cross-contractual balances between two solvent
   UK trading businesses effective at law without the counterparty's
   agreement, or does it require a contractual set-off clause / the
   counterparty's consent?** We understand the general position is that
   there is no general right of set-off for solvent debtors, save for
   insolvency (Insolvency Act 1986 s233) and equitable set-off in
   proceedings. Please confirm and correct.
2. **If the counterparty does not agree**, what is the correct and safe
   characterisation of the product's output? Our draft copy says "can
   cancel out" and "proposing that we settle" — is "can" too strong, and
   should the copy read "could be proposed" or similar?
3. **What should the set-off note contain** to be effective (amounts,
   invoices, allocation between the two balances, timing) and what should it
   avoid saying so that it is not read as an assertion of a right, a
   threat, or a legal claim?
4. **Is it safe for us to state a figure ("£600 can be settled")** derived
   from the user's own books, where the counterparty has not agreed, or does
   that risk being a misstatement? If so, how should we qualify it?
5. **Do the two balances need to be between the same legal entity?** If a
   user's group structure means the receivable sits in one company and the
   payable in another, is the analysis invalid (and should the product
   detect and flag that)?

### B. VAT and tax mechanics (we inform, we do not advise)

6. **Does a set-off change the VAT treatment?** Our understanding is that
   VAT falls due on the supply at the time of supply regardless of when it
   is paid, so a set-off does not defer the VAT on the invoice being settled
   — and any difference in amounts would need a credit note (with its own
   credit-note VAT consequences). Please confirm, and confirm that it is
   appropriate for our product to *flag* the VAT point for the user's
   accountant rather than explain it.
7. **Anything else in the product copy that risks being construed as tax or
   accounting advice** (as opposed to information)? Our current posture is
   that we explain and flag, and always route the decision to the user's
   accountant — is that sufficient, and is there wording we should avoid?

### C. Late payment, interest, and the 1998 Act

8. **The Late Payment of Commercial Debts (Interest) Act 1998** — our
   existing product states statutory interest at 8% + Bank Rate per annum
   and per-invoice fixed-sum compensation (£40/£70/£100). Please confirm:
   (a) that quoting this is accurate for the "qualifying debt" cases we
   cover, and (b) what the position is where a debt is partly settled by
   set-off — does the right to interest and compensation survive on the
   balance, and does the fixed-sum compensation become claimable on the
   part settled?
9. **Is our interest figure ever capable of being wrong in the copy?** We
   compute daily interest from the invoice amount; we do not model
   contractual terms, judgment debts, or the date of the supply.

### D. Financial promotion and the AI agent (our biggest worry)

10. **Does anything in the product constitute a financial promotion under
    FSMA 2000 s21?** In particular: (a) our agent is an LLM that answers
    free-form questions about the user's books — we have banned it from
    naming lenders and from recommending credit, but it may still volunteer
    "your bank may offer early-payment discounts" or "you could invoice
    finance this"; (b) is a general, non-provider-specific reference to
    business credit facilities a financial promotion in the business-to-
    business context, and (c) does the availability of an exemption for
    communications to business recipients cover us?
11. **If a user's accountant asks Siki about financing**, what should the
    agent do? Our current answer is "I don't cover financing, but here's
    what your books say" — is that the right boundary, and is there a
    better formulation?
12. **Does describing a counterparty's behaviour in the user's books** (late,
    part-paid, disputed) amount to a "personal recommendation" or an
    investment/credit opinion in the hands of an AI agent? We are careful
    never to describe a counterparty's *creditworthiness*, only their
    *payment behaviour* — please confirm the distinction holds.

### E. Data protection (if we ever go further)

13. Our v1 uses only the user's own books, so no cross-customer data
    processing. **If** we later considered a cross-customer feature, what
    lawful basis, transparency, and data-minimisation constraints would
    apply under UK GDPR — and is there a "credit information" perimeter
    (or industry code) that would bite before the data-protection one?

### F. Confirming the ruled-out directions

14. **Please confirm or correct** that each of the following is a regulated
    activity requiring permission in the UK, and therefore out of scope for
    us: (a) operating a marketplace matching buyers and sellers of business
    receivables, where no money passes through us and we take a percentage
    fee; (b) taking an assignment of, or a security interest in, receivables;
    (c) clearing or netting obligations between our users; (d) settling in
    non-cash instruments (e.g. "AI credits"); (e) issuing any payment
    promise or guarantee to a customer.
15. **Is there a licensing or registration route** we should know about for
    a *future* direction we might explore, so that we can plan rather than
    discover? (We would rather not build something and then find out.)

### G. Market context we should design for

16. Are there **pending or announced changes to the UK late-payment regime**
    (statutory late-payment reform, SBEE reporting extensions) that we
    should design the product around rather than against? We would like to
    tell small businesses what large buyers are required to do, if that is
    publicly known and safe for us to state.

---

## 4. What we need back

- A short written opinion on questions 1–5 (set-off) and 10–12
  (financial promotion and agent behaviour) — these gate the launch of v1.
- A view on 6–7 (VAT framing) so we can finalise the copy.
- Confirmation on 14–15 so we can stop revisiting the ruled-out directions.
- Anything we have got wrong in the product copy above. We would rather fix
  the wording than defend it.

**Contact:** founder, Sikizana (sikizana.app). We can share the relevant
code (`src/services/cash_routes.py`, `src/services/findings.py`,
`src/tools/accounting_tools.py`) and a live demo of the sample books.
