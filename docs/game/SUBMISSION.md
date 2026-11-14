# Submission runbook — *The Late Market*

> **The frame judges read first (use verbatim):** a financial-literacy game.
> You keep a stall open for one week, and a night market buys every invoice
> you leave. Ten minutes, three chapters, two lawful markets. Defer once and
> a stall lights. The ending is what the street took.
>
> Execution order, gates and what we collectively refused to build: `docs/game/LAUNCH_PLAN.md`.

Everything the agent built is in place; the human uploads it.
**Hard deadline: Zoud GameLab, Sun 15 Nov 2026, 23:59 AOE.**
Chroma Games is later (Jan 7) — do Zoud first, then make the itch page public for Chroma.

*The Late Market* is a narrative management game: you keep a stall open for
one week. Leave an invoice and a stall on the street lights; chase it and a
stall shutters. The week opens with the Shark's off-book offer — a real first
decision before the first invoice — and a first-run pick between two lawful
markets. The ending is one number, what the street took, and one line about
the week.

It is also the playable demo of an AP-integrity engine: the same receivables
arithmetic the game teaches is pinned to the production product's values in
CI, and the finale hands the player a link into the live tool. That engine is
one closing paragraph of the pitch, not the pitch.

## What ships (verified 2026-11-14)

| Artifact | Path | Status |
|---|---|---|
| itch.zip | `game/dist/itch.zip` | 133 files · top-level `index.html` · relative paths · audio + cinematic included · ~18.8 MB (rebuilt 2026-11-14 01:36, post-Track A) |
| Gameplay video | record per `docs/game/TRAILER_SCRIPT.md` (v3) | **NOT YET RECORDED.** Stale mp4s deleted 2026-11-14. `narration_v2.mp3` is baked; `record-run.mjs --mode video --seg a|b` captures the new flow (prologue → picker → three-day week → Souq frame → close). ~90 s cap is 2:00. |
| Cover | `game/cover/cover_630x500.png` | 630×500 · Recraft V4.1 Vector base + composed title |
| Screenshots | `game/screenshots/v6/*.png` | 15 genuine frames re-shot 2026-11-14 against the Track A build: title, market pick (both lawful markets), cinematic, Shark prologue, shutters, day 1 stall/defer, day 2 bill, debrief ×2, finale ×4. Supersedes `v5/` (pre-Track A, five-day structure — deleted). |
| Concept doc | `docs/game/CONCEPT_DOC.pdf` | exactly Zoud's six sections, honest market section |
| Judge's guide | `docs/game/JUDGE_GUIDE.pdf` | one-pager: what to look for (the three experiments) + how to play both markets |
| Budget doc | `docs/game/BUDGET_DOC.pdf` | ≤ $26 total, milestone-aware, ElevenLabs Starter $6 |

All checks: `npm test` 84/84 · `tsc --noEmit` clean · `npm run build` clean ·
regression guard (`scripts/regcheck.mjs`) · Souq Mode shipped (AED +
contractual, interest-free remedy + zakat) · line items sum to the lantern to
the penny · "worth today" falls monotonically · careless run empties the till
on Day 2 in every seed · day-1 pair chase lands in-week / day-3 pair B lands
after the close, identical numbers · the game's four shared quantities are
pinned against exported product values (`tests/vectors.test.ts`).

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
   - Judge's guide: `docs/game/JUDGE_GUIDE.pdf` — what to look for, one page.
   - 2-minute gameplay video: record per `docs/game/TRAILER_SCRIPT.md` (v3, ~90 s) — `record-run.mjs --mode video --seg a` and `--seg b`, concat, mux `game/game-video/narration_v2.mp3`. No finished cut exists yet; do not upload anything older.
   - Project budget: `docs/game/BUDGET_DOC.pdf`.
   - AI disclosure (judges-only): ElevenLabs (audio) + Recraft (cover art).
4. Submit with at least 12 h of buffer before AOE.

### Zoud form fields (paste-ready)

- **One-line pitch:** A financial-literacy game. You keep a small stall open
  for one week, and a night market buys every invoice you leave sitting.
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
