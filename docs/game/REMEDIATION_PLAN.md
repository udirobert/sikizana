# The Late Market — Remediation Plan (UI/UX · product · game design)

**Written:** 2026-11-15 · **Scope:** the jam build (Ch.1–3 + finale + second week)
**Evidence base:** a full playthrough of the current source build in Chrome at the itch
embed viewport (1280×860), plus a source read of `game/src/**`.

> **Status of this document.** It was a plan; as of 2026-11-15 it is a completed
> report. Every workstream shipped: WS-A (hidden fix, ledger cost, rate card),
> WS-B (terms-vs-outcomes copy, identical pair arms, uncertain ch3 prospect),
> WS-C (timeout never picks / never writes ledger, clock default OFF,
> visibility pause), WS-D (rate card with kind labels, finale two-row split
> reconciled to the strip, live strip headline), WS-E (causal per-NPC street,
> finale keeps the market standing), WS-F (F1/F2 fixed; F3–F7 hierarchy pass),
> WS-G (market pick after story, per-chapter profile cards), WS-H
> (`choice_made` / `books_opened` / `profile_card_seen` telemetry). Proven by
> `npx tsc --noEmit` clean + 130 vitest tests green + `npm run build` green.
> Original plan text below, kept for the record — workstreams ordered by
> *cost of being wrong*, not by how fun they are.

---

## 0. The diagnosis this plan answers

The build is a well-art-directed ten-minute worksheet that **explains its own answers**,
and whose headline number **omits the thing the whole game is about**.

Three root causes, in order of severity:

1. **Every option states its own outcome** → no dread, no discovery, no experiment.
2. **The cost numbers don't cohere and the finale's total is wrong** → the thesis number
   contradicts the strip above it on the same screen.
3. **A 10-second timer plays the game for careful players, then blames them for it** →
   the most likely source of weak playtest feedback.

Everything below is a consequence of those three.

---

## 1. Sequencing

The Zoud deadline is **2026-11-15 23:59 AOE** and the itch page must stay **private**
until the Zoud submission (prior-release rule, `RESEARCH_VALIDATION.md` §2). So:

| When | Scope | Gate |
|---|---|---|
| **Tonight (T0)** | WS-A correctness (3 items) + WS-F layout collisions (2 items) | `npm test` green, `npm run build` green, one clean playthrough at 1280×860, itch zip rebuilt + re-uploaded **private** |
| **This week (T1)** | WS-B copy, WS-C clock, WS-D numbers | Full playthrough, no spoilers, two totals agree, no clock auto-pick |
| **Next week (T2)** | WS-E street model, WS-F hierarchy, WS-G product flow | Chapter debriefs carry a profile card; the first minute is one scene |
| **Before Chroma (T3)** | WS-H instrumentation, WS-I docs/compliance, screenshot re-shoot | Concept doc + budget doc updated; itch page copy matches the build |

T0 is **deliberately small and boring**: the P0 items are cheap, provable, and each one
currently makes the game look broken or dishonest to a judge. Do not start the art or
flow work before T0 is green.

**Definition of "the game now works" (T1 gate):**
- No choice button states the outcome of choosing it.
- The finale's headline equals the street strip's realised take plus a labelled legal
  figure — and the two totals on screen reconcile to the penny.
- A timeout never selects an option and never writes a ledger entry.
- Ch.1's board is not on screen during Ch.2/3, the finale, or the second week.
- Two independent playthroughs (one deferring, one chasing) both produce a debrief whose
  numbers match the ledger.

---

## 2. Principles (bind every workstream)

These are the rules the copy and layout work must obey. They exist because the current
build broke them.

1. **Terms vs outcomes.** It is legitimate to state the *terms* of an option
   ("£950, settled today", "£60 and a phone call"). It is never legitimate to state the
   *outcome* of choosing it ("the till can't cover it — you'd run into the red", "He will
   say no"). If a sentence lets the player skip the beat, cut it.
2. **The player may do the arithmetic; the game may not do it for them.** Facts, balances,
   and amounts stay. Consequences land after the click, in the world.
3. **One number, one meaning.** Every figure on screen has exactly one label and one
   source of truth. No number may appear in two places with different values.
4. **The instrument must measure the construct.** A timer measures reaction time; a
   timeout must never be recorded as a behavioural choice.
5. **Nothing decorative may imply a fact the engine doesn't have** (existing rail in
   `V5_DIRECTION.md` — extend it to numbers, not just art).

---

## 3. Workstreams

### WS-A — Correctness (T0 · ~1.5 h)

#### A1. Chapter 1's board never leaves the screen — **one-line fix, ship-blocking**

**Cause:** `#ch1 { display: flex }` (`src/styles/tokens.css:1311`) overrides the UA sheet's
`[hidden] { display: none }`. `beginChapter()` hides chapters with the `hidden` property
(`src/main.ts:570`), so `#ch1` stays `display:flex` and remains on screen for Ch.2, Ch.3,
the finale and the second week. Verified live:
`[{"id":"ch1","hidden":true,"display":"flex"}]`.

**Fix** (`src/styles/tokens.css`, after line 1311):

```css
/* The hidden attribute must win: #ch1's display:flex overrides the UA sheet. */
section.lm-chapter[hidden] { display: none !important; }
```

**Acceptance:** during Ch.2, Ch.3, the finale and the second week, the Ch.1 till,
"Two prices, one wait", its ledger and its choice button are absent; the accessibility
tree contains only the active chapter's controls.

**Also fixes:** stale buttons lingering in the a11y tree across chapters (same root cause).

#### A2. The finale's "Cost of Not Acting" omits the street's money — **T0/T1**

**Cause:** `DecisionLedger.costOfNotActing()` (`src/engine/ledger.ts:79-89`) sums only
`npc.feePaid` and `forgoneEntitlement`. Ch.1 records the street's earnings in
`streetFee` (`src/chapters/ch1screen.ts:947`), which nothing reads. Verified live: the
strip read "realised take £96" while the finale read
`£71.55 — To the street (NPC fees): £0.00 · forgone statutory entitlement: £71.55`.

**Fix:** have the ledger return the components, not a pre-summed pair, so the screen can
present them honestly:

```ts
// engine/ledger.ts
export interface CostOfNotActing {
  /** Market value the street captured (fictional haircut) — ch1 streetFee + ch2/3 npc fees. */
  streetTake: number;
  /** Statutory interest + s.5A compensation the player never claimed. */
  forgoneStatutory: number;
  /** NPC fees actually paid (Factor/Collector/Shark). */
  npcFees: number;
  /** Face value still uncollected at the close. */
  stillOwed: number;
}
```

Keep `costOfNotActing()` returning the same field names as today *plus* the new ones so
`tests/finale.test.ts` doesn't break, and update that test deliberately.

**Acceptance:** on a run with one deferral, the finale shows the street's realised take
and the forgone statutory figure as **two separate prices** (see WS-D2), and they
reconcile with the street strip's "the books" breakdown to the penny.

#### A3. Three different "costs of lateness" and two different roundings of the same figure

**Facts on the ground today:**

| Figure | Where | Value |
|---|---|---|
| Street shed value | `ch1.ts:136` `WORTH_HAIRCUT_PER_DAY = 0.02` | 2%/day = **730%/yr** |
| Factor's implied discount | `rates.ts:72` `FACTOR_DISCOUNT_PCT_PER_MONTH = 0.6` | **7.2%/yr** (and on a 60-day-old £890 invoice he pays £879 — a 1.2% haircut) |
| Statutory | `rates.ts:10-11` | 11.75%/yr + s.5A fixed compensation |
| Same figure, two roundings | Ch.1 debrief `£72` vs finale `£71.55` | mismatch |

A judge who checks arithmetic will find the fictional street charging ~100× the legal
rate and ~60× the game's own Factor quote, with no explanation — while the screen
asserts *"arithmetic audited in public"*.

**Fix:** create one rate card and label every figure by kind.

**T0 (cheap, ship-safe):** fix the rounding mismatch — the Ch.1 debrief must show
`£71.55`, not `£72`, or the finale must round the same way. One helper,
`money()` already exists in `engine/market.ts`; use it in both places.

**T1 (the substantive fix):** see WS-D.

---

### WS-B — Copy: stop the options from answering themselves (T1 · ~4 h)

This is the highest-leverage change in the plan and it is **free of audio cost**: the
voice manifest (`design/lines.json`) contains only spoken `deps.say()` lines. Button
labels and details are display-only, so rewriting them requires **no re-bake**.

#### B1. The rule

Every option line is classified **terms** (keep) or **outcome** (cut). Suggested copy:

| Current (live) | Class | Proposed |
|---|---|---|
| `Pay Quayline Foods — £2,000` / *"Due today. The till can't cover it — you'd run into the red."* | outcome | *"Due today. £2,000 out of the drawer."* |
| `Leave the bill` / *"£2,000 stays owed, and £40 a day comes out of the till tomorrow — the street's money."* | outcome | *"£2,000 stays owed."* |
| `Take the 70%` / *"Old debt, settled off the books — this week's till never sees it"* | outcome | *"70% of face, in cash tonight."* |
| `Refuse` / *"Keep the debt. The street keeps its own books"* | outcome | *"Keep the whole debt."* |
| `Counter — 85%` / *"He will say no. Watch."* | outcome | *"85% of face."* |
| `Take the seventy` / *"The debt is gone — £720 stays on the street"* | outcome | *"Seventy percent, in cash tonight."* |
| `Walk away` / *"The debt stays yours — nothing lights for him"* | outcome | *"Keep the whole debt."* |
| `Accept £950` / *"The invoice clears at their number"* | outcome | *"£950, settled today."* |
| `Say it isn't enough` / *"Their opening was £950"* | terms ✔ | keep |
| `Take the Factor's money — £879` / *"Cleared today"* | terms ✔ | keep |
| `Take it — £496` / *"Cash today; he's already gone"* | outcome (tail) | *"£496 in cash today."* |
| `Sell the debt — £1,091` / *"Instant cash, relationship gone"* | terms ✔ | keep ("relationship gone" is what you give up for the money — that is a term) |
| `Keep the line going` / *"Quiet cost this round: £25 of your time"* | terms ✔ | keep |
| `Escalate — discount + call` / *"£60 and a phone call you don't want to make"* | terms ✔ | keep |
| `Stop work on this account` / *"Close the account; keep the door open"* | terms ✔ | keep |

**Where the cut outcomes go:** the world's own channels, not the button —
the day hint line (`ch1screen.ts` `dayHint()`), the street whisper feed
(`DAY_WISPERS`), the NPC's spoken line (already frozen and good), and the post-click
beat. Example: the £40/day late charge belongs in the day hint ("The street charges
£40 a day on an unpaid bill") and in the ledger card, not on the button.

**Acceptance:** a player who reads only the option text can list what each option
*costs* but not what each option *causes*.

#### B2. The pair days leak which arm is better — the experiment is void

**Live:** Day 1 chase detail is *"…here tomorrow morning — **inside the week**"*; Day 3 is
*"…**after the close**."* (`ch1.ts:390-394`). The GDD (A2) requires textually identical
arms. As written, Day 1 is trivially "chase" and only Day 3 carries information; and the
debrief punishes literacy (chase both → *"You chased both"* (no lesson); defer both → the
bias is named).

**Fix (recommended):**
1. Both arms get the identical detail: *"Zana goes today. The full £2,400 is here
   tomorrow morning."*
2. The difference is carried by the **scene**, not the button: Day 3's whisper says the
   week closes tonight; the ledger card for INV-238 says "due today"; the street is
   visibly closing.
3. Day 3's chase pays **after the close** (unchanged) — but the second week now opens
   with that money landing, so chasing on Day 3 is *not* a dud. This makes the two arms
   comparable ("money in this week's till" vs "money at the top of next week") instead
   of "obvious win" vs "obvious loss".
4. The debrief names the tilt **only if the two arms differed in what the player did**,
   and when both arms were the same it does not moralise. (The current `bothChased`
   branch already does this — keep it, and keep the honest "One run suggests; it
   doesn't prove." line in `finale.ts:146`.)

**Acceptance:** no copy on either arm mentions the week, the close, or "in 10 days".
`tests/ch1.test.ts` gains a case asserting the two arms' detail strings are equal.

#### B3. The Ch.3 rational option is obvious, so the sunk-cost axis is never exercised

**Live:** `Stop work on this account / Close the account; keep the door open` is
strictly better than `Escalate — discount + call / £60 and a phone call you don't want
to make`. Every player picks the third option; the sunk-cost axis scores 0 and the
chapter teaches nothing.

**Fix:** make the *prospect* uncertain rather than the cost larger (costs are already
stated). Give Mareline a probability-weighted prospect — e.g. "three years, sixty days
late, four times a year; **best case** the account pays next quarter, **worst case** it
never does" — so "keep the line going" becomes defensible and the decision is genuinely
uncertain. Then "decide at zero" has something to weigh against.

**Acceptance:** a first-time playtester can state *why* they might keep going, without
being told the option is wrong.

---

### WS-C — Zana's clock: stop punishing careful players (T1 · ~2 h)

**What happens today (verified):** the Day-1 clock fires after 10 s of decision time and
calls `pick(deferId)` (`ch1screen.ts:633-640`), which writes a `deferred: true` ledger
entry. In my run this auto-deferred a £2,400 invoice → the £2,000 bill could not be paid
→ *"The till ran empty"* → the run ended in ~4 minutes with a loss state. The debrief
then reports *"Zana's clock called it once — the money you didn't get to is on that list."*
The Ch.2 floor beat (12 s) auto-commits `null` for the same reason.

**Two separate problems:**
- *Behavioural*: a timeout selects a **losing** option and can end the run.
- *Methodological*: timeout ≠ present bias. The ledger records it as a deferral, so the
  debrief attributes reading speed to psychology. The code comments even acknowledge the
  risk ("harvest first-click noise") and then ship it anyway.

**Fix:**
1. **A timeout must never select an option and never write a ledger entry.** Change
   `BeatClockOpts.onTimeout` from "resolve the beat as if the player stood still" to
   "stop the clock and leave the beat open". In `ui/beatClock.ts`:

   ```ts
   onTimeout: () => {
     handle = null;
     recordGutCall(opts.experimentId, "time_called", opts.seconds); // observation only
     opts.onTimeout(); // must NOT call pick()
   };
   ```
   and in the chapters, the timeout handler now only stops the timer and shows a line
   ("Zana's patience runs out. The choice stays yours."). The beat remains clickable.
2. **Default the clock OFF** (`ui/gutTimer.ts:72` `gutClockEnabled()` → default `"0"`,
   i.e. opt-in). The Options toggle already exists and is correctly labelled; it should
   be a curiosity, not the default. Persist the choice (it already persists).
3. **Pause on background tab.** `mountGutTimer` uses a wall-clock deadline, so a player
   who alt-tabs for 30 s returns to an expired clock. Add a `visibilitychange` handler
   that shifts the deadline by the elapsed hidden time.
4. **Never arm a clock on a beat whose timeout would be a run-ending loss** — after fix 1
   this is automatic, but assert it in code review.
5. **Exclude timeouts from the axes.** `recordGutCall(..., "time_called")` rows are
   already stored separately in `lm.gut.v1` and are not part of `irrationalityProfile` —
   keep it that way and make sure no timeout path writes a ledger entry.

**Acceptance:** leave the game idle on Day 1 for 60 s → the clock expires, the options
stay live, no ledger entry is created, and choosing afterwards produces a debrief with
no "the clock called it" line.

---

### WS-D — Numbers: make the thesis number true (T1 · ~5 h)

#### D1. One rate card

Create `src/engine/rates.ts` → `RATE_CARD` (single source, used by the engine, the
debriefs and the finale):

```ts
export interface RateCardEntry {
  id: "statute" | "factor" | "collector" | "street";
  label: string;         // "the law", "the factoring market", "the street"
  kind: "law" | "indicative" | "fictional";
  annualPct: number;
  note: string;          // shown wherever the number is shown
}
```

Rules:
- Every rate card entry is shown with its `kind` label ("the law · real figure" /
  "indicative UK range" / "fictional — the game's street").
- The street's haircut keeps its drama but is explicitly marked **fictional**, and the
  game's own Factor quote is reconciled with it: either the street's haircut is *the
  Factor's haircut compounded* (i.e. the street is where the Factor's money goes), or
  the street's number is relabelled from "interest" to "value lost" so it is never
  comparable to a rate. **Recommendation:** relabel and reconcile — the street's number
  is the *value your invoice loses*, not an interest rate, and the Ch.3 reveal ("the
  Factor's quote") shows the same invoice priced by the legitimate market. The drama
  then comes from the comparison, not from an implausible rate.
- The Ch.1 street value (2%/day) and the Ch.3 Factor quote (0.6%/month) must not be
  presented as the same quantity in different chapters.

#### D2. The finale: two totals, not two components

Today the finale prints one number (`toStreet + forgoneStatutory`) under the heading
"Cost of Not Acting", which mixes two different quantities and omits the street's take.

**The correct framing** (this is the GDD's "two prices for one habit", made true):

> If you chase and enforce: you receive **face + statutory entitlement**.
> If you let the street have it: you receive **face − street haircut**.
> The difference is what the habit cost you — and it splits between the street and the
> clock.

For the £2,400 invoice above: chase = **£2,471.55**; street = **£2,304**; difference =
**£167.55**, of which £96 went to the street and £71.55 to the law's clock.

**Screen spec (finale, "The Cost of Not Acting"):**

```
The Cost of Not Acting

  If you chased and enforced     £2,471.55
  If the street kept it          £2,304.00
  ─────────────────────────────────────────
  What the habit cost you          £167.55
    to the street                     £96.00
    to the clock (law, unclaimed)    £71.55

  The country-wide numbers below are real: 44% · ~£11bn
```

Rules:
- The "to the street" line **must equal the strip's realised take** (the same source:
  `streetCounters()`), to the penny.
- The headline must be the **difference**, never a sum of incomparable quantities.
- The stat cards stay, but the copy must say the aggregate is *not* the player's share:
  *"The country's late-payment bill. Yours this week was £167.55."* — never a bare
  juxtaposition of £167 and £11bn.
- Label every line's kind: street = fictional haircut, law = real statutory figure.

#### D3. The live number belongs in the strip headline

The number that *changes* is currently hidden inside the collapsed "the books" toggle,
while the strip headline shows a static face amount ("£2,400 still on the street").

**Fix (`src/ui/street.ts` `renderStreet`):** headline becomes the realised take with its
rate — e.g. *"£96 so far · £48/day"* — and the face amount moves to the breakdown line.
Keep the toggle for the itemised breakdown, and rename it to predict its contents:
**"the books" → "show the £96"**.

#### D4. Copy honesty

Update `docs/game/GDD.md` §3/A2/A6 and Appendix D to the new model; update
`docs/game/AUDIT.md`; and update the fiction mark if needed. Keep the rail: no output may
recommend a financing product — the Factor/Collector/Shark remain fictional composites
and the *law* is described, not sold.

---

### WS-E — The street must be a model, not a decoration (T2 · ~6 h)

**Today** (`src/ui/street.ts:73-80`):

```ts
const funded = c.deferrals + c.billSkipped + (c.toStreet > 0 ? 1 : 0) + (c.prologueLit ? 1 : 0);
```

The `(c.toStreet > 0 ? 1 : 0)` term lights an extra stall for *any* money moving. In my
run a **single deferral lit 3 of 5 stalls**, including one whose cause was "a penny
moved". The Factor's stall never lit from Factor money; the Collector's never from
selling a debt. The mechanism that embodies the game's thesis doesn't map to behaviour.

**Fix:**
1. Extend `StreetCounters` with per-NPC takes:
   `npcTake: { factor: number; collector: number; shark: number }`.
2. Each NPC stall lights **only** from that NPC's money:
   - Factor lit when the Factor paid you (his fee recorded).
   - Collector lit when you sold a debt to him (his commission recorded).
   - Shark lit when you took his offer (the discount he kept recorded).
   - The awning lit from the market's own shed value (Ch.1 deferrals).
   - The cart remains the always-lit base (the market predates you).
3. The stall's hover/focus line shows **the amount that stall took from you**, not a
   generic note: *"the Factor's stall — lit. He has £29 of your invoice."* The existing
   `showStallNote()` (`street.ts:226`) and the DOM hit-area aria-labels
   (`street.ts:353-361`) both need the amount.
4. **The finale must not blank the strip.** Today every stall is set to `.shut`
   (`finaleScreen.ts:116`), which renders an empty wooden band — the emotional climax
   is a rectangle. Instead: keep the market standing, shutter the *stalls the player
   closed*, and let the lit ones go dark one by one **with their figures still readable
   in the dark** (the cast remain; the lights go out). Add a "closed" treatment that
   keeps the silhouette and the amount visible for the last beat.

**Acceptance:** in a run where the player takes the Factor's money and nothing else, the
Factor's stall is the only stall that lights, and its note names the amount.

---

### WS-F — Layout and polish (T0 for the collisions, T2 for hierarchy)

| ID | Defect | Fix |
|---|---|---|
| F1 | **Choice title collides with the kind tag.** `.lm-choice[data-key]::after` (keycap, `position:absolute; top-right`) and `.lm-choice[class*="lm-kind-"]::after` (kind tag, `tokens.css:1255`) target the **same pseudo-element**; the kind rule never resets `position`, so the tag renders absolutely at top-right, on top of the title. Visible on "Pay Quayline Foods — £2,000" / "BILL DUE TODAY" and "Chase Harborne Print Works · INV-231" / "MONEY COMES HOME". | Move the kind tag to `::before` (the button's `::before` is unused) and keep the keycap on `::after`. Reset `padding-right` on non-`data-key` buttons. **T0.** |
| F2 | **The honesty mark overlaps content.** `.lm-fiction-mark` is `position:fixed; left:12px; bottom:10px` (`tokens.css:851`) and lands on top of the ledger card in Ch.1/Ch.3. | Move it onto the counter rail (it is a label about the numbers, which live on the rail) — conceptually right and it stops colliding. Keep a fixed fallback only if the rail is absent. **T0.** |
| F3 | **The council inverts the hierarchy.** `.lm-council` is `1fr / 1.9fr / 1fr` (`tokens.css:1362`): the choices get 53% of the row, but two advisor cards flank them, so the *advice* is two visually heavier blocks either side of the decision, and both wrap to 3-4 lines. | At ≤1100px (and always in the embed): `grid-template-areas: "siki zana" "choices choices"`, choices full width. Shorten the council copy to ≤2 lines each. The advisor cards become small notes under a rule, not columns. **T2.** |
| F4 | **The Pixi street is vertically squashed in compact mode.** The scene renders at `SCENE_H = 208` (`scene/streetScene.ts:36`) but compact CSS sets the host to 132px (`tokens.css:1487-1488`); `app.canvas.style.height = "100%"` scales the 208px bitmap to 132px, compressing the cast ~37%. | Resize the renderer to the host height instead of scaling the canvas (`app.renderer.resize(w, host.clientHeight)` and lay out from that height), or drop to `SCENE_H = 132` and re-tune `STALL_H`. **T2.** |
| F5 | **The ledger falls below the fold at 860px.** The street strip (sticky, ~190px) + till + decision + council + clock pushes the ledger's third card off-screen. | Compact mode: reduce the scene height (F4) and the council height (F3); make the ledger strip collapsible **and** persist the state; show a 1-line "2 invoices · 1 overdue" summary in the till row when the ledger is scrolled out. **T2.** |
| F6 | **Dead "▼ Details" in the cold open.** The austerity beat hides the ledger chrome but a disclosure control is still rendered. | Hide the ledger's summary toggle while `lm-street-pre` is set. **T2.** |
| F7 | **The till's semantics wobble.** Ch.1 "Cash £1,200.00 / In hand £1,200.00" (two identical numbers); Ch.2's till is captioned "On the table £950" (an offer amount in a cash widget); Ch.3 shows "£890 − £890 still owed" styled like money you have. | Ch.1: drop "Cash" when it equals "In hand" (one number, "In hand", with the breakdown on hover). Ch.2/Ch.3: relabel the widget to the quantity ("their offer", "her account") and mark owed amounts as owed, not cash. **T2.** |

**F1 and F2 are T0** — both are visible in any screenshot a judge sees.

---

### WS-G — Product flow (T2 · ~5 h)

#### G1. The first minute is four context switches

Begin → market pick → 8 s film → story card → Shark offer. The cold open is the best
writing in the build; it should be first, uninterrupted.

**Fix (`src/main.ts` `begin()`):** move the market pick to **after** the story card, or
better — default UK and offer the Souq as a line inside the story card
("Also available: the Souq, in dirhams"). **Decision needed (see §5).**

#### G2. The debrief is a lecture; the mirror is buried

The best copy in the build is the axis evidence line
(`finale.ts:146`: *"two invoices, the same offer twice, only the timing moved. One run
suggests; it doesn't prove."*). It appears once, at the very end, inside a three-axis
report, in a run most players will not finish.

**Fix:** render a compact profile card at the end of **each** chapter's debrief (reuse
`axisEvidence()`), showing the one axis that chapter exercised, with the player's own
data. The finale keeps the full three-axis report as the shareable artefact.

#### G3. The finale is too long and the market close is a blank band

Merge "Your week in one line" and "The Cost of Not Acting" into a single screen
(the verdict line + the two totals). Keep the market-close theatre but shorten it
("Skip the lights going out" already exists — make it the default timing).

#### G4. The second week is a better game than the first

The second week (5 days, fresh invoices, scored) is the strongest replay hook in the
build and it is buried behind a button on the finale's last screen. Consider offering it
as the primary "Run it back" action, and make the first week teach it.

---

### WS-H — Instrumentation and playtest protocol (T3 · ~4 h)

Weak feedback is usually a question-quality problem plus a missing-instrument problem.

**Telemetry** (`src/engine/telemetry.ts`): add events for
`choice_made` (chapter, choice id, seconds since the beat armed, whether it was a
timeout), `books_opened` (the strip toggle), `ledger_scrolled`, `profile_card_seen`,
`finale_reached`. Never send the ledger contents (the privacy rail in `AGENTS.md` /
`RECOVERY_PLAN.md` holds — free-text decisions stay in the browser).

**Playtest protocol** (5 fresh players, screen-recorded, no coaching):
1. Ask **before** they play: "what do you think this game will measure?"
2. Let them play to the end without hints.
3. Ask **after**: (a) "What did you expect to happen when you clicked that?" (b) "What
   did you think the number £48 meant?" (c) "What do you think this game measured?"
4. Record: where they scrolled, whether they opened "the books", how long they sat on
   each decision, and whether they ever noticed the clock.
5. Success criterion for the copy work: **≥4 of 5 answer (c) with one of the three
   intended biases**, and **≥4 of 5 can explain what the street took**.

**Guard the probe:** the code already supports `?ch=` deep links and a seeded run
(`SEED = 20261109`); keep a deterministic seed for A/B comparisons of copy variants.

---

### WS-I — Docs, compliance, packaging (T3 · ~3 h)

- `docs/game/GDD.md` §3/A2/A5/A6 + Appendix D: new numbers model, two totals, the new
  copy rules, the council hierarchy.
- `docs/game/AUDIT.md`: re-audit after WS-D (this is the "arithmetic audited in public"
  claim — it has to be true).
- `docs/game/ITCH_PAGE.md` + the itch page copy: re-shoot **12 screenshots** after the
  fixes (the current set shows the pre-fix state, including the kind-tag collision and
  the empty finale band).
- Keep the AI disclosure accurate (unchanged — no new generated assets).
- Regulatory re-check (§7 of `docs/REGULATORY_PERIMETER.md`): the new finale framing
  compares three prices (law, factoring market, fictional street). It must **describe**
  them and never recommend one. Keep Siki's "the law, in writing, dated, no promise" as
  the only actionable line.
- Rebuild the itch zip (`scripts/build-itch.mjs`) and **keep the page private until the
  Zoud submission** (prior-release rule).

---

## 4. Test plan (vitest, `game/tests/`)

| New test | File | Asserts |
|---|---|---|
| Chapters don't stack | new `layout.test.ts` (jsdom) | a hidden `#ch1` is not rendered; `beginChapter(2)` leaves no ch1 controls in the a11y-visible tree |
| Finale total reconciles | `finale.test.ts` | `chase total − street total === streetTake + forgoneStatutory`; the street line equals the strip's realised take |
| Rate card consistency | `rates.test.ts` | every rate card entry has a `kind` label; the street figure is never presented as a rate |
| Pair arms are identical | `ch1.test.ts` | Day 1 and Day 3 chase details are equal strings |
| No outcome copy on buttons | new `copy.test.ts` | a banned-phrase list (`"run into the red"`, `"he will say no"`, `"will never see it"`, …) does not appear in any `DayChoice.detail` or button detail |
| Timeout doesn't commit | `gutTimer.test.ts` | `onTimeout` does not call the beat's `pick()`; no ledger entry is written; the beat's options remain |
| Roundings agree | `ch1.test.ts` / `finale.test.ts` | the Ch.1 debrief figure and the finale figure are the same number, same formatting |
| Street is causally faithful | new `street.test.ts` | taking the Factor's money lights only the Factor's stall; no stall lights from a non-zero total alone |

`npm run typecheck` and `npm test` must pass before every T-gate. `npm run build` must
produce a zip that passes the itch constraints (top-level `index.html`, relative paths,
no externals, ≤ 500MB / 1,000 files / 240-char paths).

---

## 5. Decisions I need from you (blocking items)

1. **The street's number: drama or truth?**
   - (A) Keep a large fictional haircut (2%/day), label it *fictional* everywhere, and
     reconcile it against the game's own Factor quote so the three rates never look like
     the same kind of thing.
   - (B) Make the street's take the *honest* market discount (small), and let the drama
     come from the comparison (face + entitlement vs face − discount).
   - **My recommendation: (A) with explicit labelling and a side-by-side table at the
     finale** — the drama is the product; the honesty comes from labelling and from the
     law's number sitting next to it. But (B) is defensible if the Chroma accuracy band
     is weighted heavily.
2. **Which market ships in the jam build?** UK-only (recommended: halves the QA surface
   and the first-minute complexity) or keep the picker and defer the market pick until
   after the story card?
3. **Is Zana's clock a feature we still want?** If yes: opt-in, never auto-selects, never
   on a run-ending beat. If no: delete it and its telemetry, and keep "time taken" as a
   quiet observation in the debrief.
4. **Does the Souq path get Arabic VO before Chroma, or does the Souq ship with text
   only?** (This changes the bake budget, not the plan.)

---

## 6. Explicitly out of scope (do not let this plan grow)

- A fourth chapter, a second biome, a new market mechanic.
- Re-drawing the art. The painted world is working; the problems are information and
  arithmetic, not craft.
- Adding a real-time or systemic simulation. The "three days, one street" scope is fine.
- The client's own Sikizana product integration beyond the existing footer link.
- Any new financing mechanic or product recommendation (regulatory rail).

---

## 7. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Copy rewrite desyncs the voice manifest | Low | Only `choiceButton()` text changes; the manifest holds spoken lines only. `tests/audio-manifest.test.ts` guards it. |
| Rate rebalancing breaks existing arithmetic tests | Medium | Add the rate card first, keep the old constants as aliases, run `npm test` after each step (T1 gate = all green). |
| The two totals read as "more numbers" and dilute the climax | Medium | One screen, two totals, one difference, one split. Prototype the layout as text first (10 minutes) and only then build it. |
| The clock removal loses the "instrument" the GDD is proud of | Medium | Keep the *observation* (time taken) in the debrief; keep the timer as an opt-in curiosity. The instrument's value was the data, not the pressure. |
| Scope slips past the jam | High | The T0/T1 gate is independent of art and copy approval. Ship T0 tonight; everything else is post-jam. |
