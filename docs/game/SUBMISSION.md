# Submission runbook — *The Late Market*

> **The frame judges read first (use verbatim):** a financial-literacy game.
> You keep a stall open for three days, and a night market buys every invoice
> you leave. Ten minutes, three chapters, two lawful markets. Defer once and
> a stall lights. The ending is what the street took.
>
> Execution order, gates and what we collectively refused to build: `docs/game/LAUNCH_PLAN.md`.

Everything the agent built is in place; the human uploads it.
**Hard deadline: Zoud GameLab, Sun 15 Nov 2026, 23:59 AOE.**
Chroma Games is later (Jan 7) — do Zoud first, then make the itch page public for Chroma.

*The Late Market* is a narrative management game: you keep a stall open for
three days. Leave an invoice and a stall on the street lights; chase it and a
stall shutters. The week opens with the Shark's off-book offer — a real first
decision before the first invoice — and a first-run pick between two lawful
markets. The ending is one number, what the street took, and one line about
the week.

It is also the playable demo of an AP-integrity engine: the same receivables
arithmetic the game teaches is pinned to the production product's values in
CI, and the finale hands the player a link into the live tool. That engine is
one closing paragraph of the pitch, not the pitch.

## What ships (verified 2026-11-15)

| Artifact | Path | Status |
|---|---|---|
| itch.zip | `game/dist/itch.zip` | 202 files · top-level `index.html` · relative paths · audio + cinematic included · 45 MB (rebuilt 2026-11-15 ~21:15 UTC via `build-itch.mjs`, incl. consequence pass, owl Zana, council-speaks-from-seat, day tiles, the souq prologue-council dirham fix, the debrief-flip deduction questions, and the fun pass: clean-run gold, till-death beat, NPC taunts, Shark double-or-nothing, Factor haggle, ambient drift) |
| Gameplay video | `game/out/trailer-final.mp4` | **FINAL — ready for upload.** 86 s narrated cut per `TRAILER_SCRIPT.md` v3 (`record-run.mjs --seg v3` + souq still beat + painted end card): prologue offer → day-1 defer → day-2 bill → the Souq frame (dirhams + zakat) → debrief → owl end card with the AI-disclosure credit line. Six baked Siki narration takes (`out/trailer-vo/tr3_*.mp3`, re-mixed at scene-mapped offsets) over the game's own market-music bed. Supersedes `gameplay-cut.mp4` (silent draft) and `trailer.mp4` (61 s, dog-era). |
| Cover | `game/cover/cover_630x500.png` | 630×500 · Recraft V4.1 Vector base + composed title |
| Trailer end card | `game/out/trailer-painted-end-owl.png` | Painted end card re-generated with the owl Zana (the old card still showed the dog); discloses "Voices: ElevenLabs eleven-v4. Made for Zoud GameLab." |
| Screenshots | `game/screenshots/v3_*.png` | 12 genuine frames re-shot 2026-11-15 PM against the FINAL build (owl Zana, council speaking from its seat, day tiles). Lead order: market_pick → shark_offer → day1_stall, then day1_defer, day2_bill, debrief ×2. GIFs `game/out/gif-zana.gif` + `gif-souq.gif` for the body — **gif-zana predates the owl; do not use it** (re-shoot if the body needs motion). Page theme + lead order in `docs/game/ITCH_PAGE.md`; rationale in `docs/game/ITCH_BEST_PRACTICES.md`. |
| Concept doc | `docs/game/CONCEPT_DOC.pdf` | exactly Zoud's six sections, honest market section |
| Judge's guide | `docs/game/JUDGE_GUIDE.pdf` | one-pager: what to look for (the three experiments) + how to play both markets |
| Budget doc | `docs/game/BUDGET_DOC.pdf` | ≤ $26 total, milestone-aware, ElevenLabs Starter $6 |

All checks: `npm test` 126/126 · `tsc --noEmit` clean · `npm run build` clean ·
regression guard (`scripts/regcheck.mjs`) PASS · Souq Mode shipped (AED +
contractual, interest-free remedy + zakat) · line items sum to the lantern to
the penny · "worth today" falls monotonically · careless run empties the till
on Day 2 in every seed · day-1 pair chase lands in-week / day-3 pair B lands
after the close, identical numbers · the game's four shared quantities are
pinned against exported product values (`tests/vectors.test.ts`).

### Post-critique pass (2026-11-15, pre-playtest)

- **Narrated intro (verbal + visual):** Siki's baked line now plays over the
  moonrise cinematic as a karaoke subtitle; the film holds its last frame
  until the line lands (~11s), then ends in the Siki story card — where
  Zana introduces herself in her own voice (baked take, plays over the
  player's reading time, no wall-clock cost). The card copy leans into the
  jam's brief (everyday money decisions): work done, invoice sent, money
  still waiting. Shark offer ~40 s in, Day 1 by ~60 s.
  Skip etiquette follows the consensus (force at most once, never again,
  never silently): the intro replays on every fresh run but is skippable
  in one action (button or Esc), the button reads "Skip intro ›" for
  returning players, it is never auto-focused (a stray Enter can't kill
  the film), and "Erase my saved progress" restores the full first
  impression. The Souq replay gets its own cut and its own VO figures.
  Design record + research citations: `docs/game/INTRO_AND_SKIP_POLICY.md`.
- **The Shark is once per RUN, not once per browser:** the prologue check
  moved from the persistent ledger into the run's save — a replay from the
  title meets him again; a resume mid-prologue does not.
- **One-viewport beats:** decision screens fit the first viewport. The
  street strip slims during beats (painted scene 208→132px, counter rail to
  one row, open books overlay instead of growing the strip), the till reads
  in one line, choice tags tighten. Day 1 with Zana's clock measures ~733px
  of stack (fits the 860 itch embed with room); the finale releases the
  compaction so the street reads at full size.
- **The Shark's stage:** while he speaks, his offer renders hero-size at the
  top of the section with the choices dimmed below; when the line lands, the
  stage yields smoothly (CSS transition) and the veil lifts.
- **Zana's clock never races the voice:** every timed beat now ARMS from the
  spoken line's `onDone` (baked take ended, or silent text / autoplay-blocked
  → immediate). Pair days 10 s, ch2 floor 12 s — all measured from when the
  player can actually read the options. The prologue clock was REMOVED
  (see the next bullet): it measured nothing there and anchored every
  recording after it.
- **The prologue is a real negotiation now, not a multiple-choice test:**
  take, refuse, or counter — and the counter is a genuine second move: the
  Shark laughs off eighty-five, gives final terms ("Seventy, tonight — or
  nothing"), and the player takes it or walks, each outcome recorded
  distinctly (`take_70`, `refuse`, `counter_then_take_70`,
  `counter_then_refuse`). Every path has a visible, different consequence:
  taking lights a stall and books a tally line ("The old debt, sold to the
  Shark at 70: £720 stayed on the street"), refusing lights nothing — and
  Chapter 3 remembers which you did, including "you tried his patience
  twice." The £720 never touches the till or the finale's
  Cost-of-Not-Acting arithmetic (session flag, never `feePaid`). The
  behavioural content is structural: his first offer was the anchor; your
  counter bought his number back.
- **"Erase my saved progress" actually erases:** the button now resets the
  in-memory ledger and street counters too (it previously only cleared
  localStorage, so Erase + Begin silently continued the old run), scrubs
  the best-run line from storage, and confirms in place ("The books are
  blank — your next Begin starts a fresh market."). Verified: after Erase,
  Begin re-runs the intro and the Shark re-offers.
- **The council — Siki and Zana flank every major decision:** the product's
  dual persona made playable (canon: `web/DESIGN.md` — Siki = explain, plain
  English; Zana = chase/enforce, direct tone). On wide viewports the two
  advisors literally stand either side of the options — the choice sits
  between the angel and the dark one; on narrow viewports the pair stacks
  above, side by side. Siki's lens is the literacy itself, at full density:
  the Late Payment Act 1998 (base + 8, £40 fixed), factoring as the
  centuries-old name for selling receivables at a discount, anchoring named
  before the debrief. Zana's lens is the cost read, bluntly. On Chapter 1's
  day beats the council SPEAKS — Zana's read, then Siki's answer, chained
  through onDone so the pair-day clock still arms on pure decision time —
  and the cards speak from their own seats: the karaoke word-highlight
  runs inside the counsel card while a speaking glow lifts it, so the
  voice comes from the portrait and the same sentence is never stacked
  twice on one screen (one less box; ~110px of viewport won back on the
  day screens). Eleven takes baked for this cast (eleven_v4, same
  dictionary); the prologue, ch2 floor and ch3 street-offer councils are
  text-only by design — the NPC or the scene owns that beat's one voice.
- **Craft pass on the week's shape:** the progress marks are drawn day
  tiles now, not font-dependent text dots — spent days dim amber, today
  full amber with a lantern breath, days to come hollow — the same craft
  object in the day header and the street rail's chapter chip.
- **Zana recast to canon:** the enforcer was playing concierge in the
  prologue. "Open the shutters" is now Siki's line (new bake: "…Yours begin
  the moment you open the shutters."), and every remaining Zana line is
  chase/cost canon — sizing the Shark, the Mareline briefing, the till-red
  verdict. The casting audit is recorded in `INTRO_AND_SKIP_POLICY.md`.
- **Unique moments — one-shot beats fired by specific choices, so no two
  weeks read the same:** the first deferral gets Zana's bark naming your own
  figure ("That's the first stall you lit…"); skipping the bill summons the
  Collector himself to your counter; the till-empty ending gets Siki's
  emergency triage ("Breathe. Still saveable, in order…") chained after Zana's
  kill-mark so both are heard. All one-per-run, all choice-triggered, all
  UK-fiction (the souq keeps its own lawful-fee story).
- **The good run is NOT the quiet run:** the Shark prices distress, so clean
  books are the worst news he gets all week — keep the debt AND play
  disciplined and his shadow crosses the stalls carrying his REVISED number:
  "Seventy-eight, up from seventy. Clean books cost him profit. That's your
  discipline, priced by the street." (The anchor moved because YOUR facts
  moved — the Chapter-2 lesson arriving as a reward.) A clean final morning
  gets the hungry-street whisper instead of the static flavour text, and
  trap runs keep the menace line. Both branches verified in-browser.
- **Consequence-feel without invented minigames — the arithmetic IS the
  animation:** the ledger strip shudders as value sheds, the street strip
  blinks when a stall shutters on landing money, the till's money-landing
  glow scatters coin sparkles. All stateless one-shots, all honouring
  prefers-reduced-motion. The stake (£2,400) rides the title tagline and the
  market doorways carry their remedy figures — the first click already meets
  arithmetic, not two cinematic gates of it.
- **The deduction quotes your run:** the Ch.1 debrief now shows your two
  rows side by side ("Day 1 — chased · Day 3 — left it") before the bias is
  named — the evidence lands before the lecture, on your own numbers.
- **Framing surgery:** the pair-day defer button no longer pre-computes
  "10 days instead" — near choice vivid, far cost abstract; the debrief
  prices it (the ledger record keeps the exact day counts).
- **Zana's clock (opt-in, Options, default OFF):** timed pair days and the ch2
  floor only — the gut clock measures something there (instinct vs the
  debrief's deliberation). A timeout never picks, never writes a ledger
  entry: it stops and leaves the beat open. Gut calls are logged and the
  debrief names the ones the clock called. The prologue is deliberately
  untimed: the game's first decision deserves deliberation, and a countdown
  on the first beat would only harvest noise and pressure-bias every
  recording after it.
- **Second Week (scored replay):** "Deal a second week" from the finale —
  five dealt days, fresh invoices, one score (what the street took vs the
  lawful price), best-run kept, re-deal built in. No ledger writes.
- **Debrief honesty fix:** a day-3 deferral now counts "still on the
  street" instead of printing "£0 did not come in" against a full ledger.
- **Resume = a choice, not a corridor:** returning to a saved run offers
  "Back to the counter" AND "Start the week over" (full run reset — ledger,
  save, street counters — the Shark gets another pass).
- **Street render race fixed:** a mid-run reload no longer paints an empty
  street (a double-render at boot stole the Pixi host into a discarded
  row — the placeholder swap is now guarded).
- **The books are open by default:** the ledger strip shows its invoice
  cards without a click (NN/g accordions research: hidden core state is
  state most players never meet); the street's tally drawer keeps its
  "the books" trigger (renamed from "Details").
- **Line-placement fix:** say-bubbles now land inside the visible chapter
  section (they had been prepending to `#game` while chapters live under
  `#game-cam`) — keyboard focus scope and line cleanup now match what's on
  screen.
- **Judge guide:** play path rewritten — the recommended tour (chase D1,
  pay D2, decide D3) reaches the present-bias reveal; the defer-both path
  is named as the failure state it is.

## 1. itch.io page (~15 min)

1. **itch.io → Manage → Create new → HTML.** Title: *Siki & Zana: The Late Market*.
2. Upload `game/dist/itch.zip`. itch extracts; verify the test page plays (click **Start**).
3. **Page settings**
   - *Embed:* width **1280**, height **860**.
   - *Cover:* `game/cover/cover_630x500.png`.
   - *About:* paste-ready copy in `docs/game/ITCH_PAGE.md` + the screenshots (`game/screenshots/v3_*.png`).
   - *AI disclosure* (required):
     - Voice, music, SFX — **ElevenLabs** (Starter, eleven_v4)
     - Cover illustration — **Recraft V4.1 Vector**
     - No generative code claims.
   - *Mobile Friendly:* **do not tick** (desktop-first; only tick after a phone playtest).
   - *Price:* free. *Embeddable:* on.
4. **Visibility: PRIVATE** (Zoud judges get a private link; make public for Chroma in Dec).
5. Copy the embed code + direct game URL.

## 2. Zoud GameLab (~20 min, before Sun 15 Nov 23:59 AOE)

1. Individual registration for every team member (Udi Robert) — team mode disqualifies.
2. Submit via the itch flow: paste the itch URL (private page is fine).
3. Uploads:
   - Concept doc PDF: `docs/game/CONCEPT_DOC.pdf` (or a public no-login link).
   - Judge's guide: `docs/game/JUDGE_GUIDE.pdf` — what to look for, one page.
   - 2-minute gameplay video: **upload `game/out/trailer-final.mp4`** (86 s, narrated, per the v3 trailer script; ends on the owl end card carrying the AI-disclosure line).
   - Project budget: `docs/game/BUDGET_DOC.pdf`.
   - AI disclosure (judges-only): ElevenLabs (audio) + Recraft (cover art).
4. Submit with at least 12 h of buffer before AOE.

### Zoud form fields (paste-ready)

- **One-line pitch:** A financial-literacy game. You keep a small stall open
  for three days, and a night market buys every invoice you leave sitting.
- **What it is:** browser game, ~10–15 min, three chapters and a market close,
  two lawful markets (UK statutory remedy / Gulf contractual remedy + zakat).
  Defer once and a stall lights. The ending is one number — what the street
  took — and one line about your week.
- **What makes it different:** the lesson is a place. Leaving an invoice
  funds a stall you can see; chasing shutters it. The bias is named only
  after that picture, on your own choices. Every figure is audited in public.
- **Tools used:** hand-built HTML5/TypeScript, ElevenLabs (pre-baked voice,
  music, SFX), Recraft (cover art). No generative code.

## 3. Chroma Games (later — Jan 7, 11:45 PM PT; verify category in Dec)

- Make the itch page **public**.
- Separate download link + thumbnail (the 630×500 cover works).
- "Tools Used:" listing + ElevenLabs tool-tag; keep the tool-usage screenshot for proof.
- Confirm eligibility (no prior Chroma/Project Odyssey; created after Feb 1 2025).
- < 30 min single-player browser game — this is 10–15 min. ✓

## If the zip ever needs rebuilding

```bash
cd game && node scripts/build-itch.mjs   # build + stage + zip, refuses non-dist output
```

Never run `npm run build` alone before packaging — it wipes `dist/` (and the zip in it).
