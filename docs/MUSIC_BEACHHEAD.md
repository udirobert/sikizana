# Music Sector Beachhead

## Status

Exploratory. This is a distribution and proof decision, not a product fork.
Nothing in this document is a committed roadmap change; it records the case
for testing music as Sikizana's first sector beachhead and what the first
discovery conversations must resolve before we build anything sector-specific.

## The decision

Amazon did not pick books because it loved books; it picked the beachhead
where its specific advantages were most visible and customers were cheap to
reach, then built generic infrastructure underneath. Sikizana's wedge today is
already narrow: "SMBs on Xero with enough payable volume that duplicate bills
and supplier anomalies actually hurt." A sector focus should sharpen messaging,
concentrate proof, and pick one community to live in, not add features.

Music is being tested as that beachhead because of unfair access: the founder
has contacts in the music industry and can reach design partners faster than
for any other vertical. The beachhead is the highest-pain sector we can
actually reach; a mediocre sector we can reach beats a perfect one we cannot.

## The case, fact-checked

Two industry contacts surfaced the leads below. They are stronger together
than either is alone, but they are evidence of a beachhead, not proof of
product-market fit.

### Making Tax Digital (verified)

What is real is the UK's **Making Tax Digital (MTD)** programme, not a mandate
to use Xero specifically. From April 2026, self-employed people and landlords
with income over £50,000 must keep digital records and submit quarterly Income
Tax updates through MTD-compatible software, replacing the annual Self
Assessment return. Xero is on HMRC's list of compatible software, which is why
people in the community casually describe it as "you have to use Xero." The
ISM (Incorporated Society of Musicians) already publishes MTD guidance for
musicians, so this is a live, confusing moment for exactly our audience.

This is a compliance-driven acquisition wave. We do not have to convince
musicians they need digital books; the government has done that. MTD also maps
onto our existing tax-region routing (HMRC for GB).

### PPS and the "third entity" model (verified as an existing service)

PPS is a UK specialist payroll and accounts service for the entertainment
industry (session musicians, actors, performers). Its documented capabilities
include billing clients and third parties on behalf of clients, reviewing
revenue, commission and expenditure, and split-billing between a client and a
third party. A contact described this as "nominating a third entity that keeps
an eye on finances and receivables and notifies you."

That is not speculation about demand; it is an operating model that already
exists as a high-touch, commission-charging service. The market has validated
that music professionals will pay someone to watch their finances, bill on
their behalf, and report back.

### The synthesis

MTD gets musicians onto Xero; once they are there they need help managing it.
AP Integrity, Siki, and Zana are that help. The gap between a forced
digitization event and a proven willingness to pay for a watcher is our
product.

### Honest tension

PPS proves demand for a **service**, not for **software**. The central open
question, and the thing the first conversations must resolve, is whether
musicians and their accountants want an automated assistant, or whether they
would rather keep paying a human. Enter these meetings expecting to hear the
answer, not to pitch around it.

## Why this is cheap to test

No new product is required to run the experiment. The architecture is already
sector-agnostic:

- AP rules never import `XeroService` directly and connectors stay
  platform-neutral, so music is just another Xero population flowing through
  the same `build_findings()` workflow (see `docs/AP_INTEGRITY_PLAN.md`).
- The user profile `industry` field, sector benchmarks, persona copy, and
  `/books?flow=check` landing paths already support a music-flavored
  onboarding (see `AGENTS.md`, Personalization).
- MTD aligns with the existing tax-region routing.

The experiment is therefore: a music-flavored landing variant, music-specific
persona copy (for example Zana chasing a promoter who owes a session fee), and
the same findings engine underneath. The risk is conversion, not engineering.

## Discovery plan

Lead with discovery, not the deck. The first conversations validate three
things: whether contacts actually feel MTD pain, who currently watches their
finances and at what cost, and whether they would trust an automated assistant
to flag duplicates and late invoices.

Working questions:

- Walk me through how you get paid for a gig, from booking to money in the
  bank. (Watch for fragmented contractor pain: session fees, royalties, merch,
  PR, each from a different payer.)
- What is the worst bookkeeping moment you have had in the last year?
- If an assistant could tell you "you are owed £X from [promoter] and it is
  three weeks late," would you pay for that?
- Do you use PPS or an accountant, and what do they do for you that software
  cannot?

Priority asks, in order of value:

1. Introductions to three to five design partners (musicians, managers, or
   small labels) willing to connect sandbox Xero data and judge whether
   findings are useful. This applies the construction-pilot playbook
   (`docs/AP_INTEGRITY_DESIGN_PARTNERS.md`) to music.
2. A music accountant or manager in the room. The specialist music-accountant
   channel is our distribution; one accountant with twenty clients is worth
   more than twenty cold musicians.
3. Permission to reference a known name once something works, because trust
   transfers through known names in a tight-knit community.

## Guardrails

- Treat music as a marketing beachhead, not a product fork. Keep AP rules and
  connectors sector-agnostic as `docs/AP_INTEGRITY_PLAN.md` already requires.
- Do not build sector-specific pipelines. The things we will not build for
  music, written down now: royalties, splits, and rights metadata. If the
  wedge quietly starts becoming a different company, stop.
- Run it like the construction pilot: a time-boxed design-partner experiment
  with an explicit kill criterion. If music design partners do not convert or
  the volumes are not there, we lose a quarter of messaging, not a product.
- We already have one vertical pilot in flight (construction bill review).
  Music testing is only cheap while it needs zero new features. If music
  partners start asking for music-specific pipelines, choose between verticals
  rather than accumulating both.
