# Submission runbook — *The Late Market*

> **The frame judges read first (use verbatim):** a financial-literature game
> where the player's own decisions become the experiment — ten minutes, three
> chapters, two lawful markets, eighty-four tests, sixteen dollars. Its numbers
> are audited in public, and its ending hands you the real tool.
>
> Execution order, gates and what we collectively refused to build: `docs/game/LAUNCH_PLAN.md`.

Everything the agent built is in place; the human uploads it.
**Hard deadline: Zoud GameLab, Sun 15 Nov 2026, 23:59 AOE.**
Chroma Games is later (Jan 7) — do Zoud first, then make the itch page public for Chroma.

*The Late Market* is a narrative management game: you keep a small business
solvent through one week while the game runs behavioural experiments on you —
present bias in Ch.1, anchoring in Ch.2, sunk cost in Ch.3 — then reads your
decision ledger back and names what moved you. The week opens with the Shark's
off-book offer — a real first decision before the first invoice — and a
first-run pick between the two markets. The shadow market outside
(third-party buyers of your lateness) is the game's central metaphor: every
deferral you choose visibly feeds it.

It is also the playable demo of an AP-integrity engine: the same receivables
arithmetic the game teaches is pinned to the production product's values in
CI, and the finale hands the player a link into the live tool. That engine is
one closing paragraph of the pitch, not the pitch.

## What ships (verified 2026-11-13)

| Artifact | Path | Status |
|---|---|---|
| itch.zip | `game/dist/itch.zip` | 91 files · top-level `index.html` · relative paths · audio included · ~6.0 MB |
| Gameplay video | `game/game-video/lm_run.mp4` (local-only, gitignored — keep on disk for upload) | ~105 s (cap is 2:00) · narrated · v1 cut predates Souq Mode — **v2 re-record per `docs/game/TRAILER_SCRIPT.md` pending build freeze** |
| Cover | `game/cover/cover_630x500.png` | 630×500 · Recraft V4.1 Vector base + composed title |
| Screenshots | `game/screenshots/v5/*.png` | 10 genuine gameplay frames (day 1 / day 2 defer / day 3 pair + chased / day 4 bill / day 5 pair B / debrief ×3 / Factor actor) |
| Concept doc | `docs/game/CONCEPT_DOC.pdf` | exactly Zoud's six sections, honest market section |
| Judge's guide | `docs/game/JUDGE_GUIDE.pdf` | one-pager: what to look for (the three experiments) + how to play both markets |
| Budget doc | `docs/game/BUDGET_DOC.pdf` | ≤ $26 total, milestone-aware, ElevenLabs Starter $6 |

All checks: `npm test` 84/84 · `tsc --noEmit` clean · `npm run build` clean ·
regression guard (`scripts/regcheck.mjs`) · Souq Mode shipped (AED +
contractual, interest-free remedy + zakat) · line items sum to the lantern to
the penny · "worth today" falls monotonically · careless run empties the till
on Day 4 in every seed · day-3 pair chase lands in-week / day-5 pair B lands
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
   - 2-minute gameplay video: `game/game-video/lm_run.mp4` (v2 cut if re-recorded).
   - Project budget: `docs/game/BUDGET_DOC.pdf`.
   - AI disclosure (judges-only): ElevenLabs (audio) + Recraft (cover art).
4. Submit with at least 12 h of buffer before AOE.

### Zoud form fields (paste-ready)

- **One-line pitch:** A financial-literature game where the player's own
  decisions become the experiment — you run a small business through one week
  while the game runs behavioural experiments on you, then reads your decisions
  back as data.
- **What it is:** browser game, ~10–15 min, three chapters + finale, two lawful
  markets (UK statutory remedy / Gulf contractual remedy + zakat), persistent
  bookkeeping frame, full decision-ledger debrief. The ending links into the
  team's live receivables product.
- **What makes it different:** most FinLit games explain biases; this one runs
  you through them silently, then names them on your own numbers. Every figure
  is audited in public and the game's core arithmetic is pinned to production
  code in CI.
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
