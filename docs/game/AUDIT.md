# Audit this game's arithmetic

*The Late Market* asks you to distrust a number that sounds authoritative. It would be
strange to then ask you to take its own numbers on trust. So every figure is listed
below with the real-world thing it stands in for, the source, and the test that fails if
someone changes it by accident.

Three categories, and the distinction is the point:

- **Anchor** — a real figure or formula, quoted at a labelled indicative value.
- **Fictional** — invented for play (a stall's takings, the street's fees). Never
  presented as a market rate.
- **Derived** — computed from the above by a rule the game states in the copy.

Run the suite yourself: `cd game && npm test -- --run` (75 tests, 9 files).

## The two remedies

The game ships two lawful markets because the instrument, not the currency, is what
changes behaviour at the desk.

| | United Kingdom | Gulf (Souq) |
|---|---|---|
| Interest | 8% per annum **over** Bank of England base, simple, 365-day year | **None.** Interest is not part of the remedy. |
| Base rate used | 3.75% (BoE base since 18 Dec 2025) → 11.75% APR | n/a |
| Lateness charge | the statutory interest above | **2% of the invoice per commenced 30 days, capped at 8%** |
| Fixed charge | £40 / £70 / £100 by debt size (s.5A) | AED 250 administration |
| Statutory basis | Late Payment of Commercial Debts (Interest) Act 1998, s.5A (as amended 2002) | a contractual term the supplier wrote into their own agreement |
| Extra cost of deferral | — | **zakat on uncollected receivables: 2.5%** |

Sources: legislation.gov.uk (LPCD Act 1998 c.20, s.5A); Bank of England base rate as at
18 Dec 2025; Atradius *Payment Practices Barometer*, UAE 2025 (58% of B2B invoice value
overdue, 8% written off as bad debt) for the two Souq stat cards.

**Why the Souq remedy is not interest by another name:** a fixed contractual fee capped
at 8% is a pre-agreed charge for breach, not compensation for the use of money over
time, and it is the instrument a supplier actually has in a market where interest on a
trade debt is not available. The game says so in the terms card rather than converting
pounds to dirhams over an interest calculation.

**Zakat is hedged once and only once** — "commonly due on receivables you expect to
collect" — because schools differ on slow and doubtful debts. The game states a widely
followed practice, not a ruling, and charges it only on receivables still outstanding
(`cost.forgoneStatutory`), never on fees already paid to the street: that money is gone,
not owed to you.

## Compensation bands — the boundary the game had to get right

Section 5A: £40 where the debt **does not exceed** £1,000; £70 where it exceeds £1,000
but does not exceed £10,000; £100 above £10,000. The boundary belongs to the lower band.
A £1,000 invoice is a £40 invoice.

This is pinned in both codebases. Sikizana's `src/services/rates.py` read the boundary as
strict `<`, which charged £70 on a £1,000 debt and £100 on a £10,000 one — invisible in
play, wrong on a letter to a debtor. The cross-check below found it, and it is fixed.

## Figure by figure

| Where it appears | In game | Category | Real anchor | Guarded by |
|---|---|---|---|---|
| Claims Desk quote, UK | £1,240 + 60 days → 11.75% APR | Derived | LPCD Act s.5A + BoE base | `tests/vectors.test.ts` |
| Claims Desk quote, Souq | AED 5,952 at the desk; 2×2% + AED 250 | Derived | supplier's own contract terms | `tests/market.test.ts` |
| Fixed compensation | £70 on £1,240 | Anchor | s.5A bands | `tests/vectors.test.ts` (boundaries incl. £1,000 / £10,000) |
| Statutory entitlement, Ch.3 | £890 at 60 days | Derived | s.5A | `tests/ch1.test.ts`, vectors |
| Zakat line | 2.5% of AED 5,952 ≈ AED 149 | Anchor + derived | 2.5% on zakatable receivables, after the nisab threshold | `tests/market.test.ts` |
| AED display | FX 4.8, labelled indicative | Anchor (display only) | indicative retail rate; all arithmetic stays in base units | `tests/market.test.ts` (whole-dirham landing) |
| Ch.1 invoices | 2 × £2,400 | Fictional | typical small-business invoice, labelled fictional | `tests/ch1.test.ts` |
| Supplier bill | £2,000 on day 4, £40/day late charge | Fictional | a real bill's late fee is usually a percentage; this one is a flat daily charge for legibility | `tests/ch1.test.ts` (careless run empties the till in every seed) |
| "Worth today" haircut | 2% of face per day past due, capped at 30% | **Fictional** | *not* a market rate — it sits inside the stated factoring/collection ranges only as an illustration | `tests/ch1.test.ts` (monotonic fall) |
| Street counters | 5 stalls, 1 lit before you act | Fictional | metaphor, not a financial quantity | `tests/ch1.test.ts` |

The last two rows matter as much as the first five: a game that labels only its *wrong*
numbers is not being honest, it is being careful about which claims it makes.

## What the game will not show you

The fiction is bounded by the same rules as the product (`docs/REGULATORY_PERIMETER.md`):

- No named lender, factor, or collection agency. The Factor, the Collector and the Shark
  are behaviour, not brands.
- Nothing is a payment promise, a guarantee, or a creditworthiness signal. A customer is
  described by what they did in your books.
- No netting across parties and no instruction to move money. The desk buys a receivable;
  the player never executes a payment.
- The ending links to a **read-only** product surface that moves nothing without the user.

## Regenerating the shared vectors

`game/tests/fixtures/product-vectors.json` is generated from Sikizana's own rate module,
not from the game, so "checked against the product" is a test rather than a claim:

```bash
python3 game/scripts/vectors_from_product.py   # 96 vectors → game/tests/fixtures/
cd game && npm test -- --run
```

The fixture covers both base rates in play (the game's 3.75% and the product's 5.25% env
default) and every band boundary, so a divergence in either direction fails the suite.
