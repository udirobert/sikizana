# The Late Market — Jam Recovery Plan (Nov 12 → Nov 15)

**Status:** build work **complete as of Nov 12, second pass** (sections 1–4
implemented and verified: 53 tests green, line items sum to the lantern to
the penny, rational +£1,099 ≠ careless `till_empty`). The first pass
shipped the stall screen but a sharper playthrough review caught four real
flaws, all fixed in the second pass:
1. **The card taught the wrong direction** — it showed a rising statutory
   entitlement ("owed £2,473, still growing") while the debrief called it
   "money you'll never get back." Now the card shows a **falling** market
   value (2%/day off face, capped 25%) and the lantern is the street's take
   — the exact value shed (mirrors the card); the Act is a larger legal
   floor, named in the debrief only.
2. **The pair leaked the answer** — the day-3 chase paid in-week while
   day-5 said "after this week." Now both arms of both days pay after the
   week (3/11 and 11/19 days); in-week money comes only from the ordinary
   invoice (chase day 1 → lands day 3).
3. **The bill never left the till** — skipping was a caption. Now the till
   displays net position (cash − unpaid bill), the fee leaves the till
   daily, trade stops, and a never-chased run dies on the £40 fee, day 5.
4. **The market was a header** — the cover painting is now a persistent
   dimmed backdrop behind every chapter; the street base dropped 3 → 2
   pre-lit stalls so "it lit up" is only true when something lit.
Final numbers diverged from the plan: the supplier bill is **£1,600** (not
£900) and start cash **£1,100**; the video is ~70 s, not 120. The cover used
Recraft (not the `cover.html` fallback), and the §6 still-image fallback
shipped as the in-game title screen AND the persistent backdrop.
Definition-of-done items 1–2 (the itch page and the Zoud submission) are
human actions, now captured in `SUBMISSION.md`. GDD Appendices B/C/D are
updated to match what shipped; from here this plan is the historical record.

**Deadline:** Sun 15 Nov, 23:59 AOE (Zoud GameLab).

## 0. Diagnosis (what the build actually is)

A judge's first minute, verified against the code and screenshots:

1. Title card → Day 1 → **one button** ("Restock the shelves") and the line
   "What does today get?" No cash, no invoice, no stall, no way to fail.
   `state.cash` (starts £1,200) is incremented in `ch1.ts` and **never
   rendered**; only deltas ("+ £140 in walk-in trade") appear.
2. 20 days of one-button days; first real choice Day 4; chases clear in
   `CHASE_CLEAR_DAYS = 30` so **no money ever lands inside the chapter**.
3. Traps are labelled as traps: the Shark's button reads "…9.1× per year,
   honest"; Ch.2 prints the statutory prospect on the negotiation screen
   while measuring anchoring.
4. The Ch.1 counterfactual ("rule armed from the start") is **£0.00 by
   construction** (every invoice chased on due day ⇒ nothing ever accrues;
   `tests/ch1.test.ts` asserts this) — a comparison against a score the game
   invented.
5. The debrief is a slide deck, and `say()` bubbles stack Siki's lines on
   top of the same words already in the debrief cards (doubled lecture).
6. The street is seven `⌂` glyphs + "3 lit · 3 shuttered". The Factor, the
   Collector, and the Shark are headings. Emoji stand in for Siki/Zana.
7. The one memorable idea — *your lateness is someone else's business model,
   and the game has been running an experiment on you* — is absent from every
   in-game screen until the finale card.
8. Appendix C is unchecked: no itch page, no 630×500 cover, no 2-minute
   gameplay video, no concept-doc PDF, no budget doc. Missing package =
   zero before the rubric starts.

**Rubric reality:** Prototype & Gameplay (25) is scored from minute one;
Financial Literacy (25) rewards learning that emerges in play without
explicit instruction and penalises "potentially misleading implications";
the current build fails both bands and half the others.

## 1. The governing decision

The critic's prescription, adopted in full:

> Cut Chapter 1 to the two engineered days plus one ordinary day where the
> till can actually empty, put the ledger and the street on that screen, and
> take the statute citation off the choice button. Ship that as the
> two-minute video. The rest of the debrief can wait until after someone has
> already felt the loss.

Consequences, decided here (no open options remain):

- **Chapter 1 becomes 5 days**, not 20. One shared screen carries the
  *whole place* at all times: the street, the till, the ledger, the choices.
- **Money lands inside the chapter**: chase → paid in 2 days (a label on the
  assumptions sheet says real customers average ~30 days; the button says
  nothing about statute).
- **The till can empty**: two supplier bills land mid-chapter; skipping them
  darkens a street stall and accrues a late charge; negative till ends the
  chapter early (a genuine loss state with its own debrief tail).
- **The "rule armed from the start" counterfactual is deleted**, replaced by
  a per-deferral line-item replay (each of the player's own deferrals priced
  at its actual days × daily accrual — honest, on the player's data, and the
  number that lit the street).
- **No trap is labelled in play.** All "honest maths" numbers move to the
  debrief / the street's own ledger in the finale.
- **The experiment is seeded from Day 1**: the street strip carries a running
  "the stalls keep their books" tally; the finale's "You Were the
  Experiment" becomes a payoff of something the player has felt, not a first
  mention.
- **Ch.2 and Ch.3 are label-removal passes only** (mechanics untouched).
  Ch.3's sunk frame, the Collector probe, and the finale stay as built.
- **No new chapters, no new biases, no cinematic.** The intro falls back to
  a still image = the new cover art.

## 2. Chapter 1 rebuild — the stall screen

### 2.1 The one screen (replaces `showDay()` + `finishDay()` in `ch1screen.ts`)

Single persistent layout, nothing clears between days except the log:

```
┌──────────────────────────────────────────────────┐
│ STREET  [stall][stall][stall][stall][stall]      │  lit / dim / shut,
│          the stalls keep their books · £X so far │  animated on change
├──────────────────────────────────────────────────┤
│ TILL   £1,200.00   (big, tabular, ▲/▼ on change) │
├──────────────────────────────────────────────────┤
│ LEDGER (one card per open invoice)               │
│  Harborne Print Works · £2,400 · 2 days overdue  │
│  worth today: £2,400 + £40 + £18.76 accruing     │  ← ages every day
│  [chase — pays in 2 days] [leave it]             │
├──────────────────────────────────────────────────┤
│ DAY 3 — the day's choices (fun tasks etc.)       │
└──────────────────────────────────────────────────┘
```

- The **till** is `state.cash`, always visible, animated on change; red
  (with ▼ and a shape, not colour-only) below £0.
- The **ledger strip** renders every open invoice: client, principal,
  days-overdue counter, and the "worth today" line (principal + compensation
  + accrued statutory interest to date, from the existing
  `invoiceAccrual()` — the GDD §2 NPV lesson, finally on screen). It ages
  every day even when unchased.
- The **street** is rebuilt (see §3) and sits on the same screen, sticky.
- Choice buttons carry **no statute, no annualised rate, no "honest"**.
  Chase button: `Chase Harborne — £2,400` / detail: `They pay when they
  pay — two days after you ask.` Defer: `Leave it for tomorrow`.
- The silent lantern **stays** (drifting number, never instructed to
  watch) — it is the one correct piece of the current design.

### 2.2 The 5-day structure (replaces `CH1_DAYS = 20`)

| Day | What happens |
|---|---|
| 1 | Ordinary. Harborne's £2,400 invoice is **already 2 days overdue** — on screen from the first frame. Real choice day 1: restock (feels good, +~£150 walk-in) vs chase (pays day 3). Supplier notice: £900 due Day 4. |
| 2 | Ordinary. Second invoice arrives (seeded, £900–£2,600, due today). Ledger now shows two cards. |
| 3 | **Engineered pair A** — chase-now vs defer, today-cost framing (the existing pair structure, days 4→3). |
| 4 | **The ordinary day where the till can empty** — the supplier's £900 is due. Pay it (cash out) or skip it (a street stall darkens, £40 late charge accrues, and tomorrow you can't restock — no walk-in revenue). Either way a rational and a careless run now diverge. |
| 5 | **Engineered pair B** — second Harborne invoice, both payoffs moved out (the classic delayed comparison). Chapter closes; the ledger shows what landed (chased) and what is still owed (deferred). |

- `CHASE_CLEAR_DAYS`: 30 → **2** (so day-3 chases pay day 5, on screen).
- Deferrals clear outside the chapter (day 13/15+) — the ledger says
  "still owed after close". That asymmetry *is* the lesson.
- Zana enlistment (old Day 14 toggle) is **cut from play**; the reminder
  rule unlocks in the debrief as the chapter's tool (the commitment-device
  thesis is intact, one less click).
- **Loss state**: till < £0 at day's end → "The till runs dry" → chapter
  ends early, street keeps everything it was paid, debrief tail adds one
  beat: "this is what it cost to skip the supplier — and the street noticed."
  (No shame framing per BRAND.md.)
- `tests/ch1.test.ts` updated: pair days 3/5, new framing copy,
  `CH1_DAYS = 5`, new per-deferral counterfactual (§4), loss-state test.

### 2.3 Debrief rework (`ch1screen.ts` `debrief()`)

Order changes so the street teaches before words do:

1. **The street as you built it** — the stalls, each with what it earned
   from this run. No naming. Just: "This is what your choices paid for."
2. **Line-item replay** — each deferral the player actually made, priced:
   "Day 3: Harborne deferred · £X. Day 5: … · £Y. Total: £Z." (Replaces the
   £0.00 counterfactual. The "rule" tool card stays as the takeaway.)
3. **Name it** — present bias / hyperbolic discounting, only now, on their
   numbers. The statute citation arrives *here*, with the assumptions
   sheet, not on a button.
4. **The tool** — the reminder rule + Zana, as before.

Fix the doubled lecture: `say()` bubbles currently stack above the debrief
cards that already say the same thing. Rule: **spoken line ≠ card text.**
Spoken line is short ("Let's look at what the street saw."); the card
carries the content. The chapter screens own their own line slot; `say()`
no longer prepends a duplicate.

## 3. The street gets a body (`src/ui/street.ts`, `tokens.css`)

- Replace the seven `⌂` spans with **SVG stall silhouettes** — five
  distinct shapes (awning, lantern post, market cart, curtained shop,
  fish-monger's board), colourblind-safe by shape.
- States: **lit** (amber glow + the NPC's small shape at the counter),
  **dim**, **shut** (line through, greyed). A change on a day animates the
  specific stall that changed — "the street changes when you leave it".
- The three NPCs (Factor = polished otter, Collector = vulture, Shark =
  smiling fish) are **simple SVG silhouettes** at their stalls — not
  headings, not emoji. Siki/Zana on screen use ported pixel-SVG versions of
  `web/components/SikiMascot.tsx` / `ZanaMascot.tsx` (the repo already has
  the geometry; port as static SVG into the game, no React).
- Running tally: `the stalls keep their books · £X` (NPC fees actually paid
  this session — honest; deferrals are shown as *lit* stalls, not as the
  tally's money). This is the seed that makes the finale's reveal land.

## 4. De-labelling the traps (specific removals)

| Where | Now | Becomes |
|---|---|---|
| Ch.3 Shark button (`ch3screen.ts`) | "Today yes, then 9.1× per year, honest" | "Today yes, then £14 a day" — annualised figure appears in the Ch.3 debrief + the street's ledger in the finale |
| Ch.3 Shark card hint | "…so is the annualised one: 9.1× per year" | "The daily number is small. That's the pitch." |
| Ch.3 Factor card hint | "≈7.2%/yr cost-of-impatience" | "The rest is theirs." — cost revealed in debrief |
| Ch.2 negotiation screen | statutory prospect + citation on screen during play | removed; "the facts never moved" is now a *reveal* in debrief beat 2 (the floor-vs-anchor measurement needs the player's number, not the law's) |
| Ch.1 chase button | "Chase now — the money lands in 30 days" (statute-adjacent framing) | "They pay when they pay — two days after you ask" |
| Ch.1 debrief beat 3 | statute citation mid-card | citation moves to beat 3's assumptions footnote, presented *after* the numbers the player just read |

GDD Appendix D is updated to record these as deliberate deltas (the
"transparency is the brand" note for Ch.2 is explicitly overruled by the
rubric's "learning emerges without explicit instruction").

## 5. Day plan (72 hours)

**Thu 12 (today) — make it a place.**
- Stall screen: till, ledger strip, street slot on one persistent layout
  (§2.1). Ledger strip + till from existing `invoiceAccrual()` / state.
- 5-day structure (§2.2): pair days 3/5, bills, `CHASE_CLEAR_DAYS = 2`,
  loss state, Zana toggle out of play.
- Ch.1 de-labelling + `say()` duplication fix.
- Gate: open the build; minute one shows cash, an overdue invoice, and a
  street; Day 4 can empty the till.

**Fri 13 — make the street visible; fix the math.**
- SVG stalls + NPC silhouettes + lit/dim/shut animation (§3).
- Delete the £0.00 counterfactual → per-deferral line-item cost (§4);
  debrief re-ordered (street → replay → name → tool) (§2.3).
- Ch.2 + Ch.3 de-labelling (§4).
- Simple-language mode: Options gets the toggle the GDD already claims;
  minimal implementation — a string dictionary swapping the ~10 longest
  debrief/hint lines for simpler phrasing (keeps the +5 accessibility
  bonus honest; if it slips, *remove the claim from the GDD* — never ship
  an over-claim).
- Gate: full loop title → Ch.3 → finale with no trap labelled in play.

**Sat 14 — balance, record, screenshot.**
- Balance pass: till start, bill sizes, walk-in range, late charge — tune
  until a rational run ends ~£2,500–£3,500 and a careless run goes dry.
- Edge cases per GDD §3 guardrails: negative till, zero balance, partial
  payment, rounding, repeated deferral of the same invoice.
- Tests updated + green; typecheck; fresh-eyes playtest (can a new player
  state the trade-off in one sentence?).
- Lock lines → **re-bake changed voice lines** (ElevenLabs Starter, ~10–15
  lines, trivially cheap at Starter pricing) → `bake-voices.mjs`.
- **Record the 2-minute video** of the actual cut Chapter 1 run (start →
  pair A → till stress → pair B → street close). Trim to 120s, no
  narration, let the screen speak.
- 3–5 fresh gameplay screenshots from the rebuilt screens.

**Sun 15 — the package (deadline 23:59 AOE; aim done by 18:00 for buffer).**
- itch.io HTML5 page, **private**: zip with top-level `index.html`, embed
  sized, fullscreen button, viewport meta, Mobile Friendly only if true,
  AI disclosure (ElevenLabs voices/SFX; cover generator named).
- **Cover 630×500**: one real illustration (night-market street, lantern
  amber on indigo, Siki + Zana at a stall, title in heavy display type —
  must read at thumbnail). Generated this week; not serif text on indigo.
- **Concept doc PDF**: GDD trimmed to Zoud's six sections, one honest
  "market" section (post-jam Sikizana funnel + shareable Irrationality
  Profile card — the game does not contain the funnel, so it is not
  claimed as in-game distribution).
- **Budget doc** (separate): ElevenLabs Starter receipts, voice re-bake
  cost, cover generation, illustration time; total within the £15–500 band.
- AI-tool disclosure (judges only): voices, cover, any generated art.
- Submit via itch flow; individual registration verified.
- After submission: update GDD Appendix B/C + record deltas in Appendix D.

## 6. Explicit cuts (do NOT do by Nov 15)

- Intro cinematic (Kling/PixVerse) → still-image fallback = the cover.
- Lore panels ("ledgers since Ur"), medics' correspondents — post-jam.
- Any Ch.2/Ch.3 mechanic changes beyond de-labelling.
- 4th bias / 4th biome / Souq Mode — Chroma (Jan 7) at the earliest.
- Mobile Friendly claim (unless actually verified on a phone Sat/Sun).
- Voice re-bake beyond the changed lines; no new takes for unchanged lines.

## 7. Risks & fallbacks

| Risk | Fallback |
|---|---|
| Stall screen slips past Thu | Ship the ledger strip + till even with the ⌂ street; do SVG stalls first on Fri (they are the "place" more than anything else). |
| 5-day balance can't produce a real loss state in a careless run | Raise the Day-4 bill to £1,100 and cut restock income to £120; the loss state is worth more than the tuned numbers. |
| Voice re-bake slips | Ship text-first (voice is never required to proceed); note on itch page that audio is pre-baked and updating. |
| Video feels slow | Cut to the three moments the critic names: Day 1 place, Day 4 till stress, Day 5 street change. 90s is acceptable; 2:00 is the cap. |
| Simple-language mode slips | Remove the claim from GDD §4 + the bonus checklist. An honest +0 beats a false +5. |

## 8. Definition of done (Sun 15, 23:59 AOE)

1. Itch page (private) live with build, cover, screenshots, AI disclosure.
2. Zoud submission complete: concept-doc PDF, budget doc, 2-min gameplay
   video, AI disclosure.
3. Minute one of the build shows: cash, an overdue invoice, a street that
   changes when you leave it, and a choice that can hurt.
4. No in-game screen labels a trap; every statutory number appears in a
   debrief or assumptions sheet with source + year.
5. A rational run and a careless run end differently.
6. GDD Appendix B/C/D updated to match what shipped.
