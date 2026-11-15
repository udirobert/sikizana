# Debrief-flip scope — ask first, name second (post-jam, do NOT build before submission)

**Status:** BUILT 2026-11-15 ~19:55 UTC (user overrode the park: "do everything,
deadline be damned"). Verified: `tsc` clean, 130 vitest green, headless-Chrome
split-run end-to-end (day1 chase → day2 pay → day3 defer → question → wrong
answer grades + mirror reveals, /tmp/split_*.png). Production screenshot
covers the straight path (v3_debrief_named.png, no-split run). Originally
parked because:
it touches three debriefs, adds ~15 strings, and needs a full playthrough of
both markets. Nothing below changes the ledger schema, the axes, or any
voiced line.

## The change in one paragraph

Each chapter debrief currently *names* the bias, then shows the evidence.
Flip it: show the evidence (already on screen), ask one graded question, then
name the bias — confirming a right answer, correcting a wrong one against the
player's own numbers. Deduction replaces exposition; net text goes down
because the question replaces the lecture paragraph. Ch2 already asks its
question ("Did your minimum move with their opening?") — it only needs the
answer buttons and the grading.

## What stays voiced (do not touch)

Every existing `deps.say()` string in the three debriefs keeps its exact text
— the baked takes survive untouched:

- Ch1 (`ch1screen.ts`, `debrief()` → `beatPrices()`): frame-1
  `"That money is still on the street."` / takenLine, and the `name` const
  (3 variants, "…That tilt is present bias."). Only repositioned, never reworded.
- Ch2 (`ch2screen.ts`, `debrief()` frames[0]/frames[1]): the question line and
  `"Your floor moved. The invoice never did. That is anchoring."` / anchorLine.
- Ch3 (`ch3screen.ts`, `debrief()` frames[0]/frames[1]): both Siki lines.

`VoicePlayer.speak()` (`src/audio/voice.ts:120-128`) looks lines up by exact
text and exits silently with the bubble already in the DOM when no take
exists — so all new strings ship as silent text bubbles (portrait +
nameplate intact, `onDone` still fires). Graceful by construction; no clock
beats arm from debrief paths, so nothing hangs.

## Per-chapter spec

### Ch1 — `beatPrices()` (`ch1screen.ts:843-975`)

Gate the question on `differed` (exactly one of the pair deferred — the split
is the experiment). `bothChased` / `bothLeft` / single-arm keep today's named
line unchanged: with no contrast there is nothing to deduce.

- Insert after the two-rows hint (`lm-debrief-chips` / "Your two rows" hint),
  before `profileCard`: h3 "Same offer twice" + question
  `"Same offer twice. You chased one and left the other — what moved you?"`,
  three `choiceButton`s: `"The numbers were different"` /
  `"The wording around them"` / `"When the money landed"`.
- Grading (no ledger write — display branch only, see §Ledger):
  - wording OR timing → confirm, then the existing voiced `name` line plays
    (`deps.say("siki", name)` as today) + profileCard as today.
  - numbers → correct against the pair record: `"The numbers were identical —
    £2,400 both days. It was the wording, and when the money landed. That tilt
    is present bias."` (display-only `speakerPara`, silent until baked), then
    the voiced `name` line + profileCard as today.
- Suggested follow-up (optional, same build): record the answer as an
  observation row, see §Ledger.

### Ch2 — `frames[0]` (`ch2screen.ts:393-417`)

- The voiced question stays. Add two `choiceButton`s under the chart:
  `"It moved with their opening"` / `"It held steady"`.
- Grade against the already-computed `namedFloors && move > 0`:
  - right → `"You called it. Your floor moved £X; the invoice never did."`
    (X = `money(Math.round(move))`, display-only), then `next()` to frame 1
    (voiced naming, unchanged).
  - wrong → play their own rows back:
    `"Your own rows say otherwise: Run 1: their £A → your floor £F · ….
    The anchor moved you."`, then `next()` to frame 1.
- `!namedFloors` (fewer than two floors set): no question — keep today's
  anchorLine path verbatim (nothing to deduce from).

### Ch3 — `frames[1]` (`ch3screen.ts:269-286`)

- Frame 0 (invested total) stays as the evidence. In frame 1, before the
  profileCard, ask: `"She never answered. What were you paying for?"`,
  two `choiceButton`s: `"A live customer"` / `"The money already in"`.
- Grading against the already-computed `invested` / `p.total`:
  - "money already in" → confirm: `"That's the one. £X in, account worth £Y
    judged fresh — history, not prospect."` then profileCard as today.
  - "live customer" → correct: `"Four rounds, no answer — the rounds are the
    data. £X in while nobody answered; the account is £Y judged at zero."`
    then profileCard as today.
- `invested === 0` (never paid): no question — keep today's frame verbatim.

## Copy constraints (the tests enforce these)

- `tests/copy.test.ts` scans whole chapter files for 8 banned outcome
  phrases — the proposed strings above avoid all of them; any rewording must
  re-check (run `npx vitest run tests/copy.test.ts`).
- Debrief/ledger may state after-the-fact truth (the arms rule is runtime
  only), but keep new strings to terms + the player's own numbers anyway.
- Souq mode: questions ship in English like the rest of the debrief copy
  (`arabic-strings.json` covers remedy/zakat strings only — no new keys needed).

## Ledger

**v1: do not record the answers.** The verdict already lives in the
profileCard + axes; a display-only branch adds zero ledger surface, zero
`experimentId` discipline risk (`ch1_*` prefix rule, `TRACK_A_SPEC.md:96-104`),
zero finale impact. Noted follow-up: record as observation rows
(`experimentId: "debrief_read_ch1"` etc. — must NOT start with `ch1_`/`ch2_`/
`ch3_`), so a future finale line can say "you called it framing" — needs an
`irrationalityProfile()` filter audit first.

## Voice cost

- Ship silent: £0, zero pipeline work, bubbles render with portrait + text.
- Bake later with the Chroma batch (`docs/game/VOICE_PIPELINE.md`): ~13 new
  Siki lines (Ch1 6, Ch2 4, Ch3 5 incl. options? — options are buttons, only
  verdicts + questions need takes: Ch1 3, Ch2 3, Ch3 3 = 9 takes). No manifest
  code changes; `audio-manifest` test unaffected (it checks asset integrity,
  not text coverage).

## Verification

1. `npx tsc --noEmit` clean; `npx vitest run` green (copy test auto-covers).
2. Playthrough both markets: split-run Ch1 (question appears, both gradings),
   clean-run Ch1 (no question, old line verbatim), Ch2 with/without floors,
   Ch3 with/without payment. Confirm silent bubbles show portrait + text and
   the voiced naming still plays after each grading.
3. Re-shoot affected itch frames (debriefs read differently).

## Build order & effort

Ch2 first (smallest — question exists, 4 strings), then Ch1 (6 strings, one
gate), then Ch3 (5 strings). ~3–4 h including both-market playthrough. Merge
only when the tree is otherwise quiet — all three files are high-traffic.
