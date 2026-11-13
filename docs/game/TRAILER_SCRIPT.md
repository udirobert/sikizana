# The Late Market — trailer script v2 (cold-open cut, ~105 s)

> **Why v2:** the v1 cut ( `game/game-video/narration_script.txt` ) plays the week
> chronologically — Day 1 → Day 5 → Ch.2 → Ch.3 — which shows a bookkeeping game.
> Judges watch ~2 minutes; the first 10 seconds decide whether they keep watching.
> v2 opens on the *thesis* (the Shark's offer is a decision you make), then spends
> the middle proving the instrument, and ends on the door to the real product.
>
> **Format:** 1280×860 (matches itch embed), HUD visible, captions burned in
> (narration is voiced; captions carry the numbers). Record with
> `game/scripts/record-run.mjs` segments + `--seg` joins; the Souq picker beat
> needs a `?market=`-free fresh profile so the picker scene (A5) actually shows —
> if A5 slips, cut to the title-screen radio flick instead (still shows AED).

## Structure

| # | Time | Beat | What the judge sees |
|---|------|------|---------------------|
| 1 | 0:00–0:06 | **Cold open — title + hook** | Title card over the night street, single VO line. No UI yet. |
| 2 | 0:06–0:22 | **The Shark's offer (prologue, A1)** | Shark step-up beat: "70% of face, settled off the books." Player picks take/refuse/counter — the first real decision, in-fiction. |
| 3 | 0:22–0:38 | **First ledger entries** | Till + street react to the choice; the ledger card writes the prologue entry. "You just made your first financial decision. It is already in the books." |
| 4 | 0:38–0:52 | **Ch.1 debrief sting** | Day 3/5 identical-numbers pair → debrief names present bias on the player's own figures. |
| 5 | 0:52–1:08 | **Ch.2 anchor** | Claims Desk run 1: anchor on screen, floor named, run 2 opens with a different number. "The facts never moved. The opening number did." |
| 6 | 1:08–1:24 | **Ch.3 sunk cost + the street** | Mareline silence → Factor cash-today beat → Shark daily drip → street stalls lit. |
| 7 | 1:24–1:38 | **The Souq (+5 made visible)** | Title-screen market flick → Souq run: AED figures, zakat line, bilingual card, one Arabic VO line. |
| 8 | 1:38–1:50 | **The door** | Verdict/debrief → finale CTA link card (the real product). "The ending hands you the tool." |
| 9 | 1:50–1:58 | **End card** | Title + "free in your browser" + AI-disclosure line. Hard cap is 2:00 — if the cut runs long, trim beat 3, not the door |

## Narration (VO) — record against these lines

All lines pre-baked in-game where they exist; the trailer narration is a separate
read (workspace Siki voice per v1 convention — blind to the frame, per the
"narrated by an outside voice" disclosure).

```text
[0:00]  (cold, over title card)
        A night market opens where your uncollected invoices sleep.

[0:06]  (Shark beat — lower, unhurried)
        A debt collector offers you seventy percent of face value — cash tonight,
        off the books. You can take it, refuse it, or name your own number.
        Whatever you do, the street remembers.

[0:22]  (brisk, over ledger + street)
        That was your first financial decision — and it is already written in
        the ledger. This game keeps score of every choice you put off.

[0:38]  (debrief sting — quiet)
        Day three and day five ask the same question with the same numbers.
        Only the frame moved. Your answer moved with it. That is the experiment.

[0:52]  (Claims Desk)
        Now the desk names a price first — and your minimum moves to meet it.
        Three sittings. The facts never changed. Watch your floor.

[1:08]  (Mareline → street)
        Three years a customer goes silent. The Factor offers cash today; the
        Shark offers a little every day. Every stall on this street exists
        because someone chose later.

[1:24]  (Souq — brighter, quicker)
        Same week, different law. In the Souq, lateness is priced by a fee you
        wrote into your own terms — and zakat waits on what you never collect.
        [ARABIC LINE — vo.souq_intro or vo.souq_zakat, see arabic-strings.json]

[1:38]  (door — warm, direct)
        The game reads your decisions back and names what moved you. Then it
        hands you the real tool. Ten minutes. Free in your browser.

[1:50]  (end card, soft)
        The Late Market. Siki & Zana.
```

## Shot list (what to capture per beat)

- **Cold open:** `market-bg.png` or cover art, slow push-in (ffmpeg zoompan or
  CSS if captured live); title fades in. No HUD.
- **Shark beat:** `?ch=` won't reach the prologue — record the prologue live
  from a fresh profile (clear `localStorage` first). Capture the Shark step-up
  card + the three choice buttons + the street counter tick after the pick.
- **Ledger:** the till row + the prologue ledger entry writing itself; then a
  fast cut of a deferral lighting a stall (`react_defer_first` Zana bark).
- **Ch.1 debrief:** the day-3/day-5 pair cards side by side, then the debrief
  panel naming present bias — hold on the player's own numbers.
- **Ch.2:** Claims Desk run 1 anchor number on screen → floor input → run 2
  opening with a different anchor. The "facts never moved" line lands here.
- **Ch.3:** Mareline card → Factor beat (cash today) → Shark beat (daily drip)
  → pull back to the full street strip with stalls lit.
- **Souq:** title screen → click the Souq radio/ picker card → AED figures on
  the till → the zakat hint line → bilingual card (السوق). **Must show one
  Arabic script element on screen** — the picker card or the zakat label.
- **Door:** verdict screen → the finale CTA card (product link). Do NOT show
  the URL resolving — the link opening the real product is a post-jam beat;
  for the trailer, hold on the card.
- **End card:** cover + title + disclosure line ("Voices: ElevenLabs ·
  illustration: Recraft · made for Zoud GameLab").

## Rules

- ≤ 1:58 total runtime (2:00 cap; leave encode slack). If the cut runs long,
  trim beat 3 (ledger reactions) — never the door or the Souq beat.
- The Arabic line is mandatory — the +5 is judged on the instrument *and* the
  surface. If Arabic VO isn't baked in time, burn the Arabic **text** as a
  caption over the Souq beat and note it in the submission.
- No claims the game doesn't keep: "free in your browser" ✓, "your decisions
  become the experiment" ✓, never "learn finance" or "win money".
- Keep `lm_run_silent.mp4`-style alternate? Optional — narrated is the spec.
