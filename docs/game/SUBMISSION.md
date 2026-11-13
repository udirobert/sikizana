# Submission runbook — *The Late Market — a playable demo of an AP integrity engine*

> **The frame judges read first (use verbatim):** a ten-minute game, five chapters,
> two lawful markets, seventy tests, sixteen dollars. Its numbers are audited in
> public, and its ending hands you the real tool.
>
> Execution order, gates and what we collectively refused to build: `docs/game/LAUNCH_PLAN.md`.

Everything the agent built is in place; the human uploads it.
**Hard deadline: Zoud GameLab, Sun 15 Nov 2026, 23:59 AOE.**
Chroma Games is later (Jan 7) — do Zoud first, then make the itch page public for Chroma.

## What ships (verified 2026-11-13)

| Artifact | Path | Status |
|---|---|---|
| itch.zip | `game/dist/itch.zip` | 91 files · top-level `index.html` · relative paths · audio included · ~6.0 MB |
| Gameplay video | `game/game-video/lm_run.mp4` (local-only, gitignored — keep on disk for upload) | ~105 s (cap is 2:00) · narrated (trailer VO, workspace Siki voice, blind to the frame) · title → Day 1 place → Day 3 pair → Day 4 bill stress → Day 5 pair B → debrief → Ch2 Claims Desk (run 1 + run-2 opener) → Ch3 Mareline → Factor beat → Shark close · silent cut kept as `lm_run_silent.mp4` |
| Cover | `game/cover/cover_630x500.png` | 630×500 · Recraft V4.1 Vector base + composed title |
| Screenshots | `game/screenshots/v5/*.png` | 10 genuine gameplay frames (day 1 / day 2 defer / day 3 pair + chased / day 4 bill / day 5 pair B / debrief ×3 / Factor actor) |
| Concept doc | `docs/game/CONCEPT_DOC.pdf` | exactly Zoud's six sections, honest market section |
| Budget doc | `docs/game/BUDGET_DOC.pdf` | ≤ $26 total, milestone-aware, ElevenLabs Starter $6 |

All checks: `npm test` 59/59 · `tsc --noEmit` clean · `npm run build` clean ·
first minute is a scene, not a ledger (cold open verified in headless Chrome:
`#ch1` child order is till → day panel → ledger; restyled street) ·
Souq Mode shipped (AED + contractual, interest-free remedy + zakat; 70 tests) ·
line items sum to the lantern to the penny (unit-tested) · "worth today" falls
monotonically (unit-tested) · careless run empties the till on Day 4 in every
seed, not the £40 fee's knife edge (unit-tested) · day-3 pair chase lands
in-week on the till / day-5 pair B lands after the close, identical numbers
(unit-tested) · title-screen regression guard (`scripts/regcheck.mjs`).

## 1. itch.io page (~15 min)

1. **itch.io → Manage → Create new → HTML.** Title: *Siki & Zana: The Late Market*.
2. Upload `game/dist/itch.zip`. itch extracts; verify the test page plays (click **Start**).
3. **Page settings**
   - *Embed:* width **1280**, height **860**.
   - *Cover:* `game/cover/cover_630x500.png`.
   - *About:* paste-ready copy in `docs/game/ITCH_PAGE.md` + the screenshots (`game/screenshots/v5/`).
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
   - 2-minute gameplay video: `game/game-video/lm_run.mp4`.
   - Project budget: `docs/game/BUDGET_DOC.pdf`.
   - AI disclosure (judges-only): ElevenLabs (audio) + Recraft (cover art).
4. Submit with at least 12 h of buffer before AOE.

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
