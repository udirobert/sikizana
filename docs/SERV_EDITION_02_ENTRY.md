# SERV Edition 02 (OpenServ) — Sikizana as the pay/hold/block agent

**Event:** SERV Hackathon Edition 02 (OpenServ) · Nov 2–15, 2026 · $5,000 pool
**Deadline:** **Nov 15, 2026 23:59 UTC** — repo + demo + X post + form
(@openservai tag mandatory in the X post; form:
https://openserv.typeform.com/submissions02)
**Judged on:** creativity · user-readiness · **revenue potential**
**Mandatory:** SERV Reasoning (openserv.ai) must power part of the build. API
key from https://console.openserv.ai/ ($5 starter credit on signup). Also
enable data collection at console.openserv.ai/settings/organization —
eligibility requirement from Edition 01.

**Priority status: this is the primary entry for Sikizana going forward.**
Landing page, pricing, security/impact pages, and Xero flow are already live
(https://sikizana.persidian.com) — this event's work is one focused feature,
not a rebuild.

## Why Sikizana fits the winner shape (evidence-based)

Edition 01 judges (creativity/user-readiness/revenue potential) crowned:

- **Payrun** (AgentKit track): payroll agent that checks contractor invoices
  against policy before deciding **pay / hold / block**
- Pattern across all five winners: products that **act with real money under
  explicit human constraints**, with "model proposes, code decides" discipline
  and receipts on every decision

Sikizana has an existing, almost literal match — **AP Integrity**:
evidence-backed duplicate-bill / payment / payable-risk review, plus
approval-gated bookkeeping fixes. Paired with the aged-receivables view and
payment-reliability scoring, the product already has the parts Payrun won with.

## The wedge feature (the new thing we build for this window)

**Siki/Zana approve Xero bills end-to-end: SERV Reasoning proposes, the rule
engine decides, the human (or Kite Passport) gates the payment.**

1. **Bill intake from Xero** → the bill (supplier, amount, account, due date,
   attachments) becomes the checkable claim
2. **SERV Reasoning pass** (new): bounded second opinion on pay/hold/block
   with an explanation field — *explanatory commentary only*. The rule engine
   (existing duplicate/risk/policy checks) retains veto power and makes the
   call — mirrors the Edition-01 "model proposes, code decides" grammar
3. **Verdict record**: rule fields and SERV explanation stored separately on
   purpose (the Edition-01 winning ledger pattern: "the rule is the fact that
   decided it; the explanation is commentary")
4. **Payment gate** (Kite track fit): agent identity + spending limits —
   per-bill cap, supplier cap, daily cap, approval threshold above which it
   waits for the human. `app/lib/kite-settlement.ts` conventions prove the
   AA-wallet path is configured (see spinchain docs) — reapply
5. **Receipts**: every decision lands in `/activity` with audit trail; chase
   emails and recoveries stay as they are

## Track choice

**Kite** — "verifiable identity and spending limits you control, so agents
can pay on your behalf, safely" — matches an approval-gated AP clerk
precisely. Reppo (real-time feedback → measurable improvement) is the
fallback framing via payment-reliability scoring; decide at kickoff when the
partner challenge details land.

## Demo plan (the X post is the first review surface)

1. Real Xero demo org: a duplicate bill arrives → Siki explains, Zana blocks
2. A valid-but-large bill → SERV explains, rule engine holds at cap, human
3. An over-limit risk bill → hard block, receipts shown
4. Close on `/impact` + `/pricing` (freemium already live = revenue potential
   axis) + link to repo

## Build plan (Nov 6–14)

- [ ] SERV API key + toggle design (mirror `SERV_ENABLED`/`SERV_API_KEY` and
      rule-floor veto — same pattern as elcaro's `core/serv_reasoner.py`:
      SERV may refine, never decide)
- [ ] SERV pass on bill checks (new module; explanation field + cost estimate)
- [ ] Ledger split (rule fields vs explanation) in the AP check record
- [ ] Kite passport/limits wiring for the payment gate (or Xero approval
      gate if Kite SDK friction is high — partner rules checked at kickoff)
- [ ] Demo org seeding + screenshots; X post draft (BRAND.md rules apply to
      any copy: Siki explains, Zana enforces)
- [ ] Form + submission by Nov 15 23:59 UTC

## Risks (honest)

- Legal: Xero write-actions on a demo org only; nothing on customer data
- Kite AA-wallet reuse from spinchain assumes Base/EVM rails are acceptable
  to the judges' story — if the Kite track instead wants the Kite AI chain
  specifically, keep the demo on Xero approval gates and mention capacity
- SERV latency on borderline bills only (not every bill) — demo the fast
  path first
