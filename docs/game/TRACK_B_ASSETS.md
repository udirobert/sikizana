# Track B — Asset Production Pack

> **Owner:** assets/production. Delivers files + manifests; never edits
> `game/src/`. Contracts it must honour are in `TRACK_A_SPEC.md` (frozen
> strings, `STING_LINES`, picker keys). Everything below is ready to
> execute the moment credentials land.

## 1. Voice-over bakes (ElevenLabs) — ✅ 8/8 lines baked 2026-11-13

`design/lines.json` carries 8 new entries (45 total): all baked via
`bake-voices.mjs` — **48/48 takes, 0 failures** on the workspace key. The
pinned Siki voice resolved fine; the 404 warning in `bake-narration.mjs`
did not reproduce. Manifest regenerated with all new keys.

| lineId | speaker | notes |
|---|---|---|
| `sting_ch2` / `sting_ch3` / `sting_finale` | siki / zana / siki | texts frozen in spec — display string must equal spoken string |
| `prologue_shark_offer` / `_accept` / `_refuse` / `_counter` | shark | `tts_voice` IN2V4qht1zMBoNajEhTY @ 0.78 — same doubling as `ch3_shark_beat` |
| `factor_teaser` | factor | **PROPOSED text — Track A must ship it verbatim or we re-bake** |

### Arabic VO — auditions baked, awaiting voice pick + frozen strings

Shared-library voices work **directly** in `/v1/text-to-speech/{id}` — no
workspace add needed. Three Gulf candidates auditioned on the line
«سوق واحد، أسبوع واحد، قانون مختلف.» («one market, one week, different
law»), files in `game/design/auditions/`:

| file | voice_id | profile |
|---|---|---|
| `arabic_yousuf.mp3` | `WcswLmU3iGeMrhxfWXKN` | Yousuf — Cinematic **Emirati** Narrator, gulf male. Best Siki-equivalent register. |
| `arabic_maryam.mp3` | `3AH0h1SXwwhE8vUUWuQW` | Maryam — Kuwaiti soft storytelling, khaleeji female. Best Zana-equivalent warmth. |
| `arabic_lama.mp3` | `ulJ49j1YlxrYnPoj5o12` | Lama — soft emotional gulf female, alt for Zana. |

**Voice pick: defaulted 2026-11-13** — user doesn't read Arabic, deferred
to recommendation: **Siki→Yousuf** (`WcswLmU3iGeMrhxfWXKN`, Emirati
narrator), **Zana→Maryam** (`3AH0h1SXwwhE8vUUWuQW`, Kuwaiti storyteller;
Lama `ulJ49j1YlxrYnPoj5o12` as alternate). Auditions copied to
`~/Downloads/arabic_{yousuf,maryam,lama}.mp3` — reversible any time before
the Arabic bake. `speaker` stays `siki`/`zana`; `tts_voice` carries the
Arabic voice id.

Proposed line set (texts pending Track C freeze — do NOT bake until the
Arabic string table lands; display text must match byte-for-byte):

| lineId | speaker | purpose |
|---|---|---|
| `souq_intro` | siki | market picker confirmation / Souq chapter opening |
| `souq_sting` | zana | optional Souq-specific chapter sting |
| `souq_zakat_reveal` | zana | the zakat line moment in debrief |
| `souq_remedy_terms` | siki | "the terms you signed" beat |
| `souq_debrief_close` | siki | market-close variant for Souq runs |

RTL note for whoever wires playback: `dir="auto"` on any node that can
hold Arabic (see spec addendum §1).

## 2. Intro cinematic (10–20s) — ✅ DELIVERED 2026-11-13

ElevenLabs' Image & Video API (Flows) covered the whole thing on the same
key — no Kling/PixVerse needed. Workspace is **Pro tier**; ByteDance models
are disabled by default so everything ran on `gemini-3-pro-image` (keyframes)
+ `veo-3.1-fast-generate-001` (animation).

Pipeline that worked (repeatable via `scripts/elevenflows.mjs`):

1. **Keyframes first** — 4 flat-vector stills at 2K, strict palette prompt
   (deep indigo / lantern amber / ledger green, "flat vector illustration,
   no text, no photorealism"). Sources in `game/cinematic-src/` (gitignored).
2. **Animate with `start_frame`** — each keyframe → 8s (or 6s) Veo clip at
   1080p, `--no-audio`, negative prompt against photorealism/style drift.
   Style held because the first frame IS the style.
3. **Assemble** — ffmpeg trim/fade/concat → `public/cinematic/cinematic.mp4`
   (**17.96s**, 1080p h264, ~10MB) + `cinematic-poster.jpg` (from the
   title-space keyframe).

Shots: moonrise push-in (6s) → street-level lantern drift (7s) → ledger
close-up push (5s). All raw clips + keyframes kept in `cinematic-src/` for
re-rolls; only the composed mp4 + poster ship in `public/` (both
gitignored per the regenerable-binary convention — prompts + script are
the source of truth).

**Track A wiring contract:** `<video>` or canvas player, autoplay muted
on title→Ch.1 transition, **skip button always visible**, poster shows
under `prefers-reduced-motion` (and as the video preload), video element
gets `playsinline`. Audio: none baked in — the existing market beds cover
it; do not add a second music layer.

Re-roll notes: keyframes live in `game/cinematic-src/`; re-run
`elevenflows.mjs video --start-frame <key>.png` per shot. Negative prompt
used on all shots: "photorealism, 3d render, text, watermark, people
close-up, camera shake, fast motion, style change". If a re-roll is ever
needed, prefer new seeds over re-rolling the whole set — shots cut cleanly
at the fades.

## 3. Trailer (re-record, ~105s cap 2:00)

Existing pipeline: `scripts/record-run.mjs` (`--seg a/b`, headless Chrome +
ffmpeg) + `game-video/narration.mp3` via `bake-narration.mjs`. Re-record
after Track A lands and `npm run build` is green.

New shot list (cold-open-first structure from the plan):

1. Title → **cinematic sting** (first 3s — the new asset earns its place)
2. Cold open: Shark beat + **prologue choice on screen** (the "first
   minute" fix, shown not told)
3. First real decision: Day 1–3 pair, live bleed visible
4. Debrief sting: "the frame, not the facts"
5. Ch.2 anchor run + **Collector probe scene** (restyled)
6. Ch.3: Factor → Shark close (the scenes judges already praised)
7. **Market picker flash**: Souq card, AED figures, zakat line, one Arabic
   VO line (Phase 3 non-negotiable)
8. Finale: irrationality profile + "the street your decisions built"

Narration script: Track C owns final copy; Track B drafts to picture
first, hands script for approval before bake. Silent cut always kept
(`lm_run_silent.mp4` convention).

## 4. SFX / music

Nothing new required — stingers, ambience, music bed, UI blip all exist
(`design/sfx.json`, generated 2026-11-10). Optional only: a 1–2s cinematic
whoosh/music-hit for the title→Ch.1 transition; generate via
`POST /v1/sound-generation` if the key lands and it earns its place.

## 5. What I need from you

1. ~~`ELEVENLABS_API_KEY`~~ — ✅ used; 48/48 lines baked, cinematic generated.
2. ~~Video-gen access~~ — ✅ resolved: ElevenLabs Flows on the same key
   (Pro tier). No Kling/PixVerse needed.
3. ~~Arabic voice pick by ear~~ — defaulted (user delegated): **Siki→Yousuf
   `WcswLmU3iGeMrhxfWXKN`, Zana→Maryam `3AH0h1SXwwhE8vUUWuQW`**, Lama alternate.
   Auditions copied to `~/Downloads/arabic_{yousuf,maryam,lama}.mp3`.
4. ~~Track C's frozen Arabic strings~~ — ✅ `docs/game/arabic-strings.json`
   (13 ui keys + 10 vo lines). **Arabic VO baked 2026-11-13: 58/58, 0 failed**
   — `souq_*` entries in `lines.json` (speaker siki/zana + `tts_voice`
   override). Note: generated ids doubled as `souq_souq_*` (cosmetic only;
   manifest keys on text, not id).
5. **Track A lands** → I re-record the trailer (both markets + Arabic beat).
   ✅ Trailer narration v2 baked ahead: `game/game-video/narration_v2.mp3`
   (79.2s, Siki workspace voice per v1 convention) from Track C's
   TRAILER_SCRIPT.md. The Arabic line is a separate splice — use
   `souq_souq_intro.mp3` over the Souq beat.

## 6. Delivery checklist

- [x] `bake-voices.mjs` green → sting/prologue/factor_teaser mp3s + manifest entries (48/48)
- [x] Arabic VO baked against frozen `arabic-strings.json` → 10 `souq_*` lines (58/58 total)
- [x] `cinematic.mp4` (17.96s) + `cinematic-poster.jpg` → `game/public/cinematic/`
- [x] Trailer narration v2 → `game/game-video/narration_v2.mp3` + `narration_v2.txt`
- [ ] Trailer recorded both markets → `lm_run.mp4` + silent cut (blocked on Track A build + cinematic wiring)
- [ ] Screenshots refresh if UI changed (Track A signals when)

## 7. Gaps found in Track A review — RESOLVED 2026-11-13

Both gaps were wired directly (Track B owned the fix):

- **Cinematic wired** — `playCinematic()` in `main.ts` runs on every fresh
  market pick (picker `enter()` → muted inline `<video>` + always-visible
  Skip › → `beginChapter`). `prefers-reduced-motion` gets the poster + a
  Begin › button; video `error`/`play()` rejection falls through to
  `onDone` so a missing asset can't block the game. Styles: `.lm-cine*`
  in `tokens.css`. Verified: `tsc` clean, 84/84 tests, `dist/cinematic/`
  ships both files.
- **Arabic VO call sites wired** — `SOUQ_VO` const added to `market.ts`
  (generated byte-identical from `lines.json`/`arabic-strings.json`).
  All 10 `vo.*` lines now have `say()` call sites, placed so each is the
  last `say()` before a wait — `speak()` interrupts, so long AR lines
  got their own beats:
  - `picker` → souqBeat (picker card)
  - `intro` → new `souqTitleCard()` beat between cinematic and Ch.1
  - `ch1Intro` → Ch.1 Day-1 scene on souq (replaces EN day scene)
  - `zakat` → new conditional debrief frame in Ch.2 (souq + walked)
  - `ch1DebriefRule`, `ch2Intro`, `ch2DebriefFlip`, `ch3Intro` →
    souq-swapped say() texts at existing call sites
  - `debriefZakat` → new pre-beat in finale `marketClose()` on souq
  - `finaleClose` → souq-swapped close line
  - Karaoke caveat resolved: every say() passes the AR string itself, so
    display text == manifest key == spoken text.
