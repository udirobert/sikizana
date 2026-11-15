# The Narrated Intro & Skip Etiquette

**Status:** shipped 2026-11-15 (post-critique pass). Owner file for the
opening flow and the skip policy. Supersedes the 45s storyboard in
`COLD_OPEN_V2.md` — the shipped intro is the 8s cut + Siki's line.

## The flow as shipped

```
Title (Begin — sound on / silent first)
  └─ first browser only: market pick (two painted doorways)
  └─ EVERY fresh run: narrated film (~11s: 8s cut, last frame holds
     while the take lands) — Siki's baked line as a karaoke subtitle
  └─ story card ("One stall. Three days." — the relatable stakes in
     text; Zana introduces HERSELF in her own voice, her baked take
     playing over the player's reading time — zero wall-clock cost)
  └─ cold open: the Shark front and centre, UNTIMED — see "Why the
     prologue has no clock" below
```

- Intro plays when `chapter === 1 && no ch1 save && ledger empty` — i.e.
  on every **fresh run**, not once per browser. The Souq replay gets its own
  cut (`cinematic-souq.mp4`) and its own take (`welcome_siki_souq.mp3`,
  AED figures) — replaying the other market is novelty, not repetition.
- The film's last frame holds until the voice line ends: the take (~11s)
  outruns the cut (8s), and the karaoke is still moving during the hold.
- Reduced-motion players get the poster + "Begin ›" and the story card
  carries the intro in text (subtitles-equivalent, not a silent wall).

## What the research says (reviewed 2026-11-15)

The consensus across design forums and post-mortems is unusually stable:

1. **Force at most once.** Watching an intro once is fair; after that there
   is "no excuse" to prevent skipping ("skipping it on a secondary
   playthrough is a must" — ResetEra; "I am fine being forced to see
   cutscenes once. After that there is NO excuse" — r/truegaming).
   Unskippable intros are near-universally condemned (r/gamedesign).
2. **Never silently auto-skip.** Players must see the intro exists and
   consciously choose to skip — otherwise they wonder what they missed.
3. **Guard against accidental skips, not against skipping.** Hold-to-skip
   solves *accidental activation* on long cutscenes (Game Design Reviews;
   adopted by Skullgirls 2012, Helldivers); the opposite sin is Hollow
   Knight's "any button skips" complaints. For an 11s beat, one quiet
   button is the right weight — hold-to-skip would be ceremony.
4. **Keep the affordance subtle but discoverable.** Loud permanent
   "PRESS X TO SKIP" prompts are a known annoyance (ResetEra).

## The policy we adopted

- **Show, never force, never silently skip.** The intro replays on every
  fresh run and always plays in full if untouched.
- **Skippable in one deliberate action:** the button, or Esc. Esc is not a
  gameplay key (ours are 1–3 and Enter) and can't be pressed accidentally
  in normal play.
- **The skip is never auto-focused on the film path.** The player just
  pressed Enter on "Begin" — a repeat Enter must not kill the film before
  it starts. (Reduced-motion path keeps focus: there the button *is* the
  action.) This closes our own accidental-skip footgun.
- **Returning players get a labelled exit:** the button reads
  "Skip intro ›" from the second offering onward; first-timers see
  "Skip ›". The intro never reads as a wall to someone who knows it.
- **Skipping is total:** the voice stops with the film (no orphan audio
  over the cold open).
- **"Erase my saved progress" is a full scrub:** it clears the seen
  counter too, so the next Begin is a true first impression (covers judges
  on a shared machine, and anyone who wants the full experience back).
  Revised 2026-11-15 (post-playtest): the purge is total — storage, the
  in-memory ledger, street session counters, and the best-run line — and
  it confirms in place ("The books are blank…"). Previously it only
  cleared localStorage, so Erase + Begin silently continued the old run
  and the button looked dead.

## Why the prologue has no clock

The gut clock (Zana's countdown, opt-out in Options) survives on the
pair days and the ch2 floor — there it is an **instrument**: the whole
point of the pair-day beat is that instinct and deliberation price the
same numbers differently, and a timed choice is what makes the later
debrief ("the clock called that one") meaningful. Standing still is the
fiction-true default; the clock is opt-in for players who want the test.

The prologue is the wrong place for the same clock, for three reasons:

1. **It measures nothing.** There is no paired instrument behind the
   prologue — no debrief line contrasts a timed vs untimed read of the
   same numbers. A countdown that no downstream analysis consumes is
   pure theatre, and theatre with teeth (a forced refuse at 0) is worse.
2. **It biases the record it sits on top of.** Time pressure is itself a
   System-1 elicitor: the first decision of the game would be harvested
   under mild stress, and — worse — the pressure effect would spill into
   every later recording via mood and anchoring. The pair days
   deliberately come AFTER the player has settled in.
3. **The fiction doesn't ask for it.** The Shark is a patient predator
   ("he prices patience by the day") — the one character whose scene
   argues AGAINST a rush. The pair days' rush is diegetic (the market is
   closing); the prologue's night has all the time in the world, and the
   choice is the first thing the player reads carefully.

So the prologue is untimed, permanently. The behavioural lesson moved
into the choice graph itself: the counter is a real second move, his
first offer is the anchor, and every outcome is visible and recorded.

## Casting canon (audited 2026-11-15)

The web product defines the duo (`web/DESIGN.md`: Siki = explain, plain
English, never accusatory; Zana = chase/enforce, direct tone, "the bad cop
to Siki's good cop" per `web/components/ZanaMascot.tsx`). The game now
follows it:

- **Siki owns the guide/teaching register** — the shutters beat
  (recast from Zana, new bake), the resume line, the debrief lessons, the
  red-till triage.
- **Zana owns chase pressure and cost reads** — sizing the Shark ("He
  prices patience by the day" — a rival predator, correctly cast), the
  Mareline briefing, the first-deferral bark, the bill-paid kill-mark, the
  shadow warning, "tomorrow I read you the late fee — louder."
- **The council** (`ui/council.ts`) renders both lenses beside every major
  decision — Siki left, Zana right. On ch1 day beats the pair also SPEAKS,
  Zana first then Siki, chained through `onDone` (the pair-day clock arms
  only after both land). Prologue, ch2 floor and ch3 street-offer councils
  are text-only: the NPC or scene owns that beat's one voice.

## Implementation contract

| Piece | Where | Rule |
|---|---|---|
| `INTRO_SEEN_KEY` = `lm.intro.seen.v1` | `main.ts` | Counted **at mount**, not completion — skipping at 1s still counts as having met the beat. |
| Label | `playCinematic()` | `replay = introSeenCount() > 0` → "Skip intro ›" else "Skip ›" (reduced-motion: "Begin ›", focused). |
| Focus | `playCinematic()` | Film path focuses nothing; reduced-motion focuses the button. |
| Esc hatch | `playCinematic()` | `keydown` listener on `document`, removed with the overlay. |
| Intro gating | `begin()` | `chapter === 1 && loadCh1Save() === null && ledger.all().length === 0`; market-pick path chains film → card → ch1. |
| Purge | `purgeSave()` | Removes `INTRO_SEEN_KEY` with ledger/saves/profile/best-run **and** resets the in-memory ledger + street session counters, then confirms in place. (Also the scrub used when switching markets — numbers from the other remedy never carry.) |
| Manifest keys | `INTRO_LINE`, `INTRO_ZANA` (main.ts) | Byte-for-byte with `audio/manifest.json` display text — **never reword without re-baking** both markets. `INTRO_ZANA` is one take for both markets (Harborne is the client either way). |

## Deliberately not built

- **Hold-to-skip** — 11 seconds does not justify a progress ring; it would
  be the "permanent loud prompt" anti-pattern in miniature.
- **Auto-skip for returners** — silently removing content disappoints
  harder than showing it; the labelled button gives returners a 1-click
  path without taking the choice away.
- **Click-anywhere-to-skip** — the accidental-activation pattern; clicks
  during a film are not consent.
- **A "don't show again" checkbox** — the story card already IS the
  one-click gate; a second preference on the title would be settings
  noise for a beat this short.

## Verification (2026-11-15)

Driven in-browser headless: first watch shows "Skip ›" unfocused and counts
seen at mount; Esc jumps to the story card with the film and voice stopped;
a second offering shows "Skip intro ›" with film + karaoke subtitle playing
in full when not skipped; degraded paths (autoplay blocked, manifest miss,
silent-first) all land the text and never hang the flow.
