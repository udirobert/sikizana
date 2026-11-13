# Track A — Game-Code Spec (first minute, scenes, street, Souq picker)

> **Owner:** sole writer of `game/src/`. Tracks B (assets) and C (copy/docs)
> must not touch `game/src/chapters/`, `game/src/main.ts`, `game/src/ui/`,
> or `game/src/engine/` — they hand off assets, strings, and copy instead.
>
> **Why this exists:** external playtest feedback on the Nov 13 build:
> "the first minute is still the till, five invoice cards, the glossary under
> them, and two buttons"; "the Factor and the Shark are the only beats that
> look like a scene, and they are in Chapter 3"; "the street is a 58px strip
> you can click for one italic line"; "a judge who never touches the Souq
> radio plays the same week as before."
>
> Every item below answers one of those sentences. Nothing here changes the
> experiment design — the paired choices, ledger schema, debrief maths, and
> `streetState()` semantics are frozen. This is staging and onboarding work.

---

## A1. Interactive prologue — the Shark beat becomes a real first decision

**Problem:** `coldOpen()` in `game/src/chapters/ch1screen.ts` is a voiceover
plus one "Open the shutters" button. The scene resolves into the bookkeeping
form on the first interaction. The player has not *done* anything yet.

**Build:** replace the single shutter button with a two-beat prologue that
ends with a ledger entry.

1. **Beat 1 — the offer (new).** After Zana's "That's the Shark" line, the
   Shark makes a concrete offer on screen — on a debt **from before this
   week**, explicitly *not* on the week's books:
   *"That old debt of yours — the one from before your week. I'll take it
   off your hands. 70% of face, settled off the books."* Two or three
   choices, not one:
   - **Take the 70%** → ledger entry `prologue_shark_accept`; the debt is
     written off (flavour line: "settled — it never touched this week's
     till"). The street reacts **cosmetically only**: extend the
     `noteStreet` event with an optional `flair?: boolean` flag; when set,
     `main.ts` adds a transient pulse class to the street row (removed
     after ~1.5s or on next render). It must NOT feed `streetSession`
     counters or `streetState()` — no stall lights, no £ enters the
     tally, Ch.1–3 street semantics stay identical for accept/refuse.
     (Earlier draft suggested `streetTake`; rejected — it would inflate
     the "£X so far" tally and the funded-stall count with money no
     debrief line explains.)
   - **Refuse** → ledger entry `prologue_shark_refuse`; nothing changes
     mechanically, but the refusal is recorded (it feeds the Ch.3 "decide
     at zero" callback: *"you refused the Shark once. Remember that."*).
   - **Counter** (optional third option, if cheap): ask for 85% → Shark
     declines with a one-liner, same ledger shape as refuse.

   **Why off-book:** the offer must not touch `state.cash`, `state.invoices`,
   or `dayChoices()` — any real cash or invoice removal perturbs the 24 ch1
   balance tests and the paired-choice experiment. Framing the debt as
   pre-week also makes the fiction honest: "cash tonight" refers to a debt
   the week's till never carried, so no judge can ask "where is my money?"
   and get a bookkeeping non-answer. Do **not** show a cash figure entering
   the till — the resolution line is textual ("settled off the books").

2. **Beat 2 — the shutters.** Whichever choice, the existing
   "Open the shutters" button follows. The prologue choice is *framing*, not
   a resource decision — it must not alter Ch.1 balance or the paired-choice
   experiment. No mechanical effect beyond the ledger entry and one street
   counter tick.
3. **Resuming players** (`saved.day > 1`) skip the prologue entirely —
   current `resuming` branch already handles this; keep it.

**Ledger rules (frozen — read before writing any entry):**

- `chapter`: use `1` (the prologue lives inside the ch1 flow). `0` is
  reserved for finale/tutorial per the type comment.
- `experimentId`: **must not** start with `ch1_`, `ch2_`, `ch3_`, or
  `ch3_continuation`. `irrationalityProfile()` counts every `ch1_*` id in
  the deferral denominator — a `ch1_prologue` entry would silently dilute
  the deferral score and change debrief/finale numbers. Use e.g.
  `prologue_shark_offer`. Precedent: `cost_of_not_acting_ch1` in
  `ch1screen.ts` deliberately avoids the prefix for exactly this reason.
- `npc` field may be set (`{ npc: "The Shark", decision: "accept" |
  "decline" }`) so the debrief can cite it — but **never set `feePaid`**:
  `costOfNotActing().toStreet` sums `feePaid` on accepts, which would
  inflate the street tally and the finale's Cost-of-Not-Acting ledger.
- `deferred`: set `false` explicitly. With a non-`ch1_` experimentId it is
  inert, but explicit beats implicit.
- New `kind`/`experimentId` values must be checked against every
  `experimentId.startsWith` / `===` filter in `finale.ts` and
  `irrationalityProfile()` before merge.

**Files:** `game/src/chapters/ch1screen.ts` (`coldOpen`, `intro`) — no
`ledger.ts` change needed (the `npc` field and arbitrary `experimentId`
strings already exist); `game/src/ui/street.ts` untouched (presentation
only via `noteStreet`); tests in `game/tests/ch1*.test.ts` + a new
prologue test file.

**Acceptance:** a fresh player makes a *choice* before they ever see the
till; the choice is in the ledger; the debrief can reference it; the paired
Ch.1 experiment is untouched (all existing ch1 tests still pass unmodified
in meaning).

---

## A2. Chapter entrances become voiced scenes

**Problem:** `actCard()` in `game/src/main.ts` shows a 2-second text card
("Chapter 2 of 3 — The Offer") then vanishes. Chapter structure is announced,
not dramatized.

**Build:** replace `actCard` with a `chapterSting(n)` beat:

1. A full-width (or centred) card with the chapter number, title, and a
   one-line epigraph — stays up ~2.5s with a slow fade, **voiced** by Siki or
   Zana (one new line each for Ch.2 and Ch.3; Ch.1 gets none — the prologue
   is its entrance; finale gets "The week closes" sting, already half-built).
2. Audio assets come from Track B as `{lineId}.mp3` + timing JSON per
   `VOICE_PIPELINE.md` §4, resolved through the **existing voice manifest**
   (`public/audio/manifest.json`, keyed by exact normalized display
   text — the epigraph string in the manifest table below IS the manifest
   key; it must match byte-for-byte including punctuation). **Code must
   not block on audio**: the sting renders and fades on a timer
   regardless; voice plays if the asset exists, silently skips if not.
   Ship a `STING_LINES` manifest mapping chapter → lineId so Track B can
   bake against a fixed list.
   **Do NOT route the sting line through `say()`**: `say()` prepends into
   the last visible `section.lm-chapter`, and `runChapterN()` calls
   `clear(root)` at start — the bubble would be wiped the moment the
   chapter mounts. The sting is its own overlay (like `#lm-act` today,
   appended to `game`, not the section); pass the sting card's own text
   node as the `bubble` argument to `VoicePlayer.speak()` so karaoke
   highlighting lands inside the card.
3. `prefers-reduced-motion` currently makes `actCard` show **nothing**
   (early return). The sting changes this deliberately: under reduced
   motion show the static card (no fade, no auto-dismiss change beyond
   the existing ~2s timer). This is a behaviour change from "invisible"
   to "static card" — intended, but call it out in review so it isn't
   read as a regression. `regcheck.mjs` may need its expectations
   updated if it asserts the reduced-motion path.
4. Keep `setProgress()` dots — they're the map; don't remove them.

**Files:** `game/src/main.ts` (`actCard` → `chapterSting`), new
`game/src/audio/stings.ts` (asset resolution, mirrors `voice.ts` patterns),
`game/src/styles/` (sting card styles), `STING_LINES` manifest file.

**New VO lines needed from Track B (freeze the text now):**

| lineId | speaker | text |
|---|---|---|
| `sting_ch2` | siki | "Chapter Two. The Offer. Everyone names a price first — except you." |
| `sting_ch3` | zana | "Chapter Three. Good money after bad. The street remembers what you already spent." |
| `sting_finale` | siki | "The week closes. Let's see what your patience was worth." |

**Acceptance:** chapter transitions are audible + visual moments; missing
audio degrades silently; reduced-motion path unchanged in behaviour.

---

## A3. Scene treatment for existing Ch.2 beats (+ one Factor teaser)

**Problem:** full-screen character cards (`.lm-factor`, `.lm-shark` — big
number, centred surface) exist only in Ch.3. Ch.2's `collectorIntl()` beat
already has stall chrome + stage but renders as a plain card row, so it
reads as a form, not a scene.

**Important correction — do NOT add a second Collector beat.** Ch.2 already
contains the Collector probe (`collectorIntl()` → `collectorProbe()` /
`collectorLedgerEntry()`, experimentId `ch2_collector_probe`) at the end of
the anchor runs. An additional Collector beat at the Ch.1→Ch.2 boundary
would (a) require touching `main.ts`'s `lm:chapter-done` flow and (b) have
the same character make the same offer twice in adjacent minutes — a bug,
not a scene. The fix is staging, not new content.

**Build:**

1. **Scene-ify `collectorIntl()` (the main win).** Give the existing beat
   the Ch.3 treatment:
   - Wrap the offer in a `.lm-surface.lm-collector` card mirroring
     `.lm-factor`/`.lm-shark` (centred, one number dominant — his buy
     price in the ledger-green "money today" style, since buying your
     debt IS relief dressed as a trap, same as the Factor).
   - Render `stallFigure("collector")` above the card (import from
     `ui/street.ts` — it's already exported).
   - Keep `collectorLedgerEntry(probe, …)` and both choice buttons
     **byte-identical in behaviour** — same ledger entries, same
     `onTool` flow. This is presentation only.
   - New CSS in `tokens.css` beside `.lm-factor`/`.lm-shark` — clone the
     pattern, do not invent a second one.
2. **Factor teaser at Ch.2 mid-point (the only new beat).** After run 1's
   ledger entry is recorded, before run 2's `showRun()`: a short card —
   the Factor's figure + one line ("You look like someone who'd rather
   have it today") + two buttons: take a teaser offer (canonically
   declined — record `factor_teaser` with the **forbidden-prefix
   rules from A1**: no `ch1_`/`ch2_`/`ch3_` prefix at all, no `feePaid`)
   or wave him off.
   Pure flavour + ledger colour; must not affect run 2's anchor or floor.
   Insert inside `nextRun()`/`showRun()` transition in `ch2screen.ts` —
   no `main.ts` changes.

**Constraint:** reuse the existing stage/surface/figure components — no
new animation system, no inter-chapter plumbing in `main.ts`.

**Files:** `game/src/chapters/ch2screen.ts` (`collectorIntl`, `nextRun`/
`showRun` insert point), `game/src/styles/tokens.css` (`.lm-collector`,
teaser card), tests (`ch2.test.ts` untouched in meaning; DOM-structure
tests for the restyle if any exist).

**Acceptance:** the Collector probe looks like the Factor/Shark beats —
figure + dominant number + one decision; the Factor teaser exists but
cannot perturb the anchor experiment; all ch2 tests pass unmodified.

---

## A4. Street strip → visible place

**Problem:** the street is a thin strip; stalls light/shutter but there's
nothing to *look at* or interrogate. It's the game's central metaphor and
it's wallpaper.

**Build (in priority order — ship 4.1+4.2 minimum):**

1. **Stall hover/tap detail.** Each of the 5 stalls (`STREET_TOTAL`) gets a
   hover (desktop) / tap (mobile) popover showing: stall name, what it earns,
   and one flavour line. Reuse `stallNote()` in `game/src/ui/street.ts` —
   it already maps kind → note text; extend the data, don't replace the
   renderer. **On earnings:** `toStreet` is a single aggregate — there is
   no per-stall money data, and inventing precise splits would be fabricated
   precision under the game's own honesty rules. Either (a) keep the
   popover qualitative ("funded by your deferrals and skipped bills" — the
   existing `stallNote` text already does this), or (b) show one clearly-
   labelled indicative share ("roughly a fifth of the street's take")
   derived arithmetically, never a fake exact figure.
2. **Running tally becomes inspectable.** The "the stalls keep their books —
   £X so far" caption gets a click/tap target opening a small ledger popover:
   total + the qualitative breakdown (deferrals / skipped bill / NPC fees /
   street take — the components `streetCounters()` already computes),
   updating live. Same per-stall precision rule as 4.1: components yes,
   invented per-stall splits no. This is the "Cost of Not Acting" ledger's
   street-side mirror — same numbers, different view.
3. **Lighting animation.** When a stall lights or shutters, animate the
   transition (~400ms, lantern-glow fade). `renderStreet()` is the single
   renderer — add a CSS class transition on the stall SVG group, keyed off
   the `lit`/`shut` state `streetState()` already returns. Respect
   `prefers-reduced-motion` (instant swap).
4. **Stall figures at Ch.3 scale.** `stallFigure()` already exists — check
   whether Ch.3's NPC beats render larger portraits; if so, let the street
   strip crossfade to the large figure during those beats (the street
   "walks up" to you). Optional; only if time.

**Files:** `game/src/ui/street.ts`, `game/src/styles/` (street + popover
styles), `game/src/ui/dom.ts` (popover helper if none exists), tests for
`streetState()` unchanged (semantics frozen — this is presentation only).

**Acceptance:** a judge can point at the street and explain what each stall
did and earned without reading docs; state changes are visible motion, not
instant colour flips; reduced-motion respected.

---

## A5. Souq picker as a scene, not a settings radio

**Problem:** market selection is a title-screen radio defaulting to UK. A
judge who doesn't explore settings plays the UK week and never sees the +5.

**Build:** first-run market choice becomes a proper beat — but **only on
genuine first run**. Skip the beat when ANY of these hold:

- a market was already chosen (`loadStoredMarketMode()` returns a stored
  value — note it currently defaults to `"uk"` even when nothing is
  stored, so the "has the player chosen?" check needs a separate
  "explicitly chosen" flag in `lm.prefs.v1` or a new key, not just the
  mode value);
- `?market=` is in the URL (trailers and deep links resolve through
  `resolveMarketMode` before boot — the picker must not re-ask);
- a run is in progress or completed (`lm.ledger.v1` non-empty, or
  `lm.ch1.v1` save exists) — a returning player mid-week must not be
  yanked back to a market choice;
- `?ch=` deep-link/jump param is present (same reason).

Also note: `setMarketMode` on radio change already calls `purgeSave()` —
the picker beat must route through the same path (set mode → purge stale
progress) so a mid-picker switch can't leave a UK ledger under souq rules.

1. After the cinematic/title, before Ch.1: a two-card choice —
   **London** (pounds, the statutory remedy) / **The Souq** (dirhams, the
   contractual remedy). Each card: one line of flavour + the instrument in
   plain words ("interest set by law" vs "a fee you wrote into your own
   terms"). No stats dump — the debrief teaches.
2. Picking Souq shows one Arabic line before entering: market name in
   Arabic (السوق — "the souk") + the zakat term (زكاة) on the remedy card.
   Track C supplies the string table; code reads `market.ts` strings, not
   hardcoded Arabic in components.
3. A "switch market" option remains on the title screen for judges who want
   both — but the *first* exposure must be the choice beat.

**Files:** `game/src/main.ts` (boot sequence), new
`game/src/chapters/marketPick.ts` (or fold into title flow — decide by
existing structure), `game/src/engine/market.ts` (string getters for the
Arabic labels — Track C provides strings, Track A wires them),
`game/src/i18n.ts` (market-scoped Arabic table lives here or beside it).

**Acceptance:** every fresh player explicitly chooses a market before Day 1;
the Souq path surfaces Arabic script + interest-free framing in the first
two minutes; UK path is unchanged for returning players.

---

## Frozen — do not touch

- `dayChoices()`, `streetState()`, `deferralLines()`, all debrief maths,
  s.5A band boundaries, `product-vectors.json` fixture.
- The paired-choice experiment structure (Day 3/5 identical numbers).
- `ledger.ts` schema shape — no field changes; new entries use existing
  fields with the A1 naming rules.
- Telemetry events — prologue/beat entries must not add beacon fields
  (aggregate-only rule in `AUDIT.md` stands).

## Test & freeze protocol

1. `cd game && npm test -- --run` green after every commit; `npx tsc
   --noEmit` clean; `npm run build` clean.
2. New behaviour gets new tests; existing tests must pass **unmodified in
   meaning** (update only where a deliberate UX change requires it — e.g.
   cold-open DOM structure).
3. `node scripts/regcheck.mjs` (title-screen regression guard) must pass.
4. **Friday night hard stop on game code.** Saturday = playtest + fixes
   only. Sunday before noon AOE = freeze, rebuild `itch.zip`
   (`scripts/build-itch.mjs`), refresh screenshots if UI changed, submit.
5. If A1 slips: ship A2–A5 without it (fallback rung C). The prologue is the
   biggest single win but also the most invasive — it can be cut without
   breaking the rest.

## Handoff manifest for Tracks B & C

Track A freezes these contracts early so B and C can work in parallel:

- **STING_LINES** (A2): 3 lineIds + speaker + text — above. The `text`
  column is the exact manifest key; bake against it verbatim.
- **Prologue VO** (A1): freeze now — Shark offer line + two resolution
  lines. Proposed text (Track B may polish, but the baked string must
  equal the shipped display string exactly):
  | lineId | speaker | text |
  |---|---|---|
  | `prologue_shark_offer` | shark | "That old debt of yours — the one from before your week. I'll take it off your hands. 70% of face, settled off the books." |
  | `prologue_shark_accept` | shark | "Pleasure doing business. The street thanks you — literally." |
  | `prologue_shark_refuse` | shark | "Your loss. The street keeps its own books." |
  | `prologue_shark_counter` | shark | "Eighty-five? Cute. Seventy, off the books, tonight — or nothing." |
  If Track B rewrites any line, the display string in `coldOpen()` must be
  updated to match — manifest keys are exact-match.
- **Arabic string table** (A5 + Phase 3): Track C delivers `{key: arabic}`
  JSON; Track A wires it into `market.ts` getters. Keys needed: market
  name (السوق), zakat label (زكاة), remedy card title, picker card text,
  bilingual title card. **Arabic strings must be frozen byte-identical**
  between the bake script input and runtime — `bake-voices.mjs`
  normalizes whitespace only; watch Unicode normalization and diacritics.
  Bake the Arabic VO early and audition before the trailer depends on it.
- **Collector/Factor beat VO** (A3): the Collector probe is voiced via the
  existing `collector` speaker — the restyle adds no new lines unless the
  figure card gets an epigraph; Factor teaser needs 1 line (speaker
  `factor`), same pipeline.
- **Asset lead time (all of Track B):** anything with external generation
  latency — the intro cinematic (Kling/PixVerse) and Arabic VO — should be
  commissioned on day one, not sequenced after code. Generation queues and
  bad takes are the schedule risk nobody controls. Cinematic style note:
  the game's art is flat SVG line-art on `tokens.css` — constrain the
  cinematic to flat/vector treatment or it will read as a different game;
  a mismatched cinematic is worse than a code-built animated title.
- **For Track C:** `SUBMISSION.md` currently claims "59/59" and "70
  tests" — the suite is 83 and growing with A1–A5. Update counts during
  the Phase 1 reframe; keep the runbook's operational sections (private
  itch link, upload steps, verified-status table) accurate while only the
  framing changes.

---

## Review addendum (verified against code, Nov 13)

Everything in the A5 skip-list and the manifest additions above was checked
against `main.ts`, `market.ts`, and `voice.ts` and is accurate — including
the non-obvious one: `loadStoredMarketMode()` collapses every stored value
except `"souq"` to `"uk"`, so "has the player chosen?" cannot be derived
from the mode value. The separate chosen-flag is required, not optional.

Five gaps remain that neither the plan nor the spec above covers:

1. **RTL / bidi is unowned.** Arabic strings will render in the DOM, but
   mixed-direction lines (e.g. an Arabic title over an English body on the
   picker cards, or "زكاة · zakat" on the remedy card) reorder incorrectly
   without explicit `dir="rtl"` on Arabic-only nodes (or
   `dir="auto"`/`unicode-bidi` where strings mix). Assign this to A5:
   every element that can contain an Arabic string gets `dir="auto"`, and
   the picker/remedy cards get a layout check in both directions. Also
   verify the bundled font actually has Arabic glyphs — if not, add a
   fallback stack entry or the strings will tofu on the judge's machine.
2. **`i18n.ts` is not an i18n system — don't route Arabic through
   `phrased()`.** `phrased({normal, plain})` is an English-only
   simple-language toggle. The Arabic table needs a separate keyed lookup
   resolved by market mode (a `market-i18n.ts` beside `market.ts`, or
   getters on `market.ts` itself). A5's "lives here or beside it" should
   resolve to *beside it* — overloading `phrased()` couples two unrelated
   features and Track C's `{key: arabic}` JSON has no `plain` variant to
   fill.
3. **Arabic scope is still ambiguous.** The plan prose promised "~50-80
   strings" for the Souq experience; the manifest freezes ~5 keys. Pick
   one: key-moments-only (title card, picker, remedy card, zakat line —
   what the manifest lists) is the right call for the freeze; say so
   explicitly so Track C doesn't under- or over-deliver. Anything beyond
   the frozen keys is Phase-4 material, not this submission.
4. **A1's "street counters +1 lit stall" must stay presentation-only.**
   `streetState()` is frozen — the prologue's stall reaction cannot feed
   it or it will perturb Ch.1–3 street semantics and break the "no
   mechanical effect" rule the same bullet states. Implement it as a
   cosmetic overlay/counter tick that `renderStreet()` shows but
   `streetState()` never reads.
5. **Sharpen the Saturday playtest.** "Playtest + fixes" should name the
   target: an unfamiliar player runs prologue → picker → Ch.1 debut, and
   Ch.2 Collector probe. The regression suite verifies nothing broke; it
   cannot catch "the prologue works but still feels like a form with
   extra steps." That judgement needs a human who hasn't seen the build.
