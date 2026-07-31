# Music Landing-Page Copy

Drop-in copy for a music-flavored landing variant. It reuses the existing
landing structure (hero, Siki/Zana persona cards, CTAs into
`/books?flow=check`) and the persona paths in `web/lib/persona-theme.ts` —
this is a content layer, not a new surface. Follows `docs/BRAND.md`: read-only
promises stay literal, AP exceptions are "things to review" never fraud, and
every claim is traceable to something real.

Suggested URL: `/music` (or a `?sector=music` variant of `/`), with CTAs
carrying `persona=siki|zana` into `/books?flow=check`. Keep demo vs. live
labelling intact.

---

## Hero

**Eyebrow badge:** `Read-only Xero checks · built for music`

**H1:**
> MTD is coming. Your books still aren't watched.

**Subhead:**
> From April 2026, self-employed musicians earning over £50k have to keep
> digital records and file quarterly through software like Xero. Getting onto
> Xero is the easy part. The hard part is what happens next: who notices the
> bill you paid twice, the supplier whose bank details just changed, or the
> promoter who's gone quiet on a £4,000 invoice? Sikizana does.

**Primary CTA:** `Try sample books` → `/books?flow=check&sector=music`
**Secondary CTA:** `Connect Xero` → `/books?flow=check&sector=music&connect=1`

**Trust chips (three):**
- No signup for demo
- No changes without approval
- No data sold or shared

---

## Persona cards

### Siki — "Watch my money"

**Description:**
> She reads your Xero for the quiet leaks that only surface at tax time: a
> session fee paid twice, a supplier's bank details suddenly different, a
> first payment to somewhere new. She shows you the evidence and the amount at
> risk, in plain English — and flags it as something to check, never as fraud.

**Bullets:**
- Duplicate bills and payments, with the source records
- Supplier bank-detail changes against a verified baseline
- Plain-English P&L and tax estimates for the self-employed
- Remembers your payers and patterns across sessions

**Quote:**
> "That studio fee got paid twice — £680, a day apart. Here are both records.
> Want me to flag it for a refund?"

**CTA:** `Start with Siki` → `/books?flow=check&persona=siki`

### Zana — "Chase what's owed"

**Description:**
> When a promoter, label, or venue is late, she works your aged receivables
> and drafts the reminder — negotiation-tactic emails up to the formal Letter
> Before Action, with statutory interest built in. In your business's name, and
> only when you approve.

**Bullets:**
- Aged receivables — which promoter to chase first
- Draft emails with negotiation psychology
- One-click escalation ladder, up to the Letter Before Action
- Recalls which chases have worked before

**Quote:**
> "That festival owes you £3,200, 45 days late. Here's the email. You're also
> owed £60 in compensation — I added it."

**CTA:** `Start with Zana` → `/books?flow=check&persona=zana`

---

## The duo promise (reused verbatim)

> Siki can't change anything, Zana can't chase anyone — without you.

---

## A short "why music" section (optional, below the fold)

**Heading:** Your money comes from everywhere. We watch all of it.

**Body:**
> Session fees, royalties, merch, PR, door splits — your income arrives from a
> dozen different payers, on different schedules, into one set of books. That's
> exactly where money goes missing: a double payment here, a late invoice
> there, a supplier detail change you never saw. Sikizana runs on the same
> Xero data your accountant uses, and keeps watching between tax returns.

---

## Internal notes (do not publish)

- `sector=music` on the CTA hrefs is illustrative; confirm the landing route
  and query-param handling before wiring this into `web/app/page.tsx` or a
  dedicated `/music` page. The persona paths in `persona-theme.ts` already
  carry `persona=` — reuse them rather than forking.
- Keep the AP Integrity language rules from BRAND.md: "exception to review,"
  evidence and amount before action, human check via an independently known
  contact, never an accusation, never a claim that Sikizana verified a
  supplier.
- The MTD framing must stay honest: it is a mandate to use MTD-compatible
  software for qualifying incomes, not a mandate to use Xero specifically.
  See `docs/MUSIC_BEACHHEAD.md`.
- Do not invent response-time, certification, or domain claims. Contact is
  hello@persidian.com.
