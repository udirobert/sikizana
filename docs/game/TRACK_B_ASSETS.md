# Track B — Asset Production Pack

> **Owner:** assets/production. Delivers files + manifests; never edits
> `game/src/`. Contracts it must honour are in `TRACK_A_SPEC.md` (frozen
> strings, `STING_LINES`, picker keys). Everything below is ready to
> execute the moment credentials land.

## 1. Voice-over bakes (ElevenLabs)

### Status: lines staged, bake blocked on `ELEVENLABS_API_KEY`

`design/lines.json` now carries 8 new entries (45 total, was 37):

| lineId | speaker | notes |
|---|---|---|
| `sting_ch2` / `sting_ch3` / `sting_finale` | siki / zana / siki | texts frozen in spec — display string must equal spoken string |
| `prologue_shark_offer` / `_accept` / `_refuse` / `_counter` | shark | `tts_voice` IN2V4qht1zMBoNajEhTY @ 0.78 — same doubling as `ch3_shark_beat` |
| `factor_teaser` | factor | **PROPOSED text — Track A must ship it verbatim or we re-bake** |

Bake command (idempotent — skips the 40 existing takes unless `--force`):

```bash
cd game && ELEVENLABS_API_KEY=… node scripts/bake-voices.mjs
```

### Pre-flight check required on first run

`bake-narration.mjs` carries a warning dated **today**: the pinned in-game
Siki voice (`Yru1AaCztNSYkMNCbM1k`) 404'd on the workspace key, and
narration fell back to `IN2V4qht1zMBoNajEhTY` ("Siki — The Late Market").
The 40-line bake reportedly succeeded on eleven_v4 today, so this may be
key-specific or transient — **the first bake run is the test**. If siki/zana
lines 404:

- fallback A: re-point `production_voice_id` for siki to
  `IN2V4qht1zMBoNajEhTY` (proven to resolve on this workspace) — but that
  changes Siki's voice for the whole game; only with user sign-off.
- fallback B: user supplies the key that owns the Mwika voice.

### Arabic VO (~10–12 lines, Phase 3)

**Decision needed before bake: which voice speaks Arabic.** Options:

- **Native-Arabic voice** (recommended for the picker/zakat stings): search
  the ElevenLabs voice library for an Arabic voice once the key lands,
  audition 2–3, freeze one. `speaker` stays `siki`/`zana` (manifest
  requires it) while `tts_voice` carries the Arabic voice — narrator
  identity preserved in text, native delivery in audio.
- **Same voices** (Yru1/sy9S): eleven_v4 is multilingual; accent will show.
  Cheaper, zero new decisions, but a judge hearing "native" Arabic will
  notice.

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

## 2. Intro cinematic (10–20s, title → Ch.1 bridge)

GDD spec: moonrise over the night market street, 2–4 shots, poster + skip,
`prefers-reduced-motion` → still poster. Track A owns the player/wiring;
Track B delivers `cinematic.mp4` (or per-shot clips) + `cinematic-poster.jpg`.

**Style constraint (non-negotiable):** the game's art is flat SVG line-art
on `tokens.css` — deep indigo sky, lantern amber, ledger green. A
painterly/photoreal clip reads as a different game. Prompt every shot as
**flat vector illustration, limited palette, no text, no people close-up**.

Shot list (generate 2–4, edit to ≤20s):

1. **Moonrise wide** — indigo sky, low moon, market rooftops as flat
   silhouettes, first lanterns igniting amber along the street. Slow push
   in. ~6s.
2. **Street level** — stalls as flat shapes, warm pools of lantern light,
   gentle haze; one lantern flickers. ~5s.
3. **Ledger detail** — close on a paper ledger/receipt glowing ledger-green
   amid the amber street; a hand-written number settles. ~4s.
4. **Pull back / title space** — street shrinks to a strip, negative space
   centre-frame for the title lockup (Track A overlays the logo). ~4s.

Negative prompt for all: text, watermark, photorealism, 3D render,
characters' faces, camera shake, rapid cuts.

**Fallback if generation disappoints:** code-built animated title —
parallax `market-bg.png` + lantern flicker + slow zoom, all CSS/JS, on-brand
by construction. Decide after first takes, not before.

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

1. **`ELEVENLABS_API_KEY`** — run `bake-voices.mjs` (8 new lines now;
   ~12 more when Arabic strings freeze). ~3k chars ≈ <$0.50.
2. **Video-gen access** — pick one:
   - your **Kling** account (credits per GDD) — I write final prompts,
     you run them in the UI or give me an API key;
   - your **PixVerse** account — same;
   - or tell me to use a paid API I can reach (kite-discovery catalog has
     video-gen merchants — I'd request a spending session).
3. **Arabic voice decision** (§1) — native library voice vs. narrator
   voices; I'll audition once the key lands either way.
4. **Track C's frozen Arabic strings** before the Arabic bake — until
   then those lines stay proposals.

## 6. Delivery checklist

- [ ] `bake-voices.mjs` green → `public/audio/{sting,prologue,factor_teaser}*.mp3` + manifest entries
- [ ] Arabic voice audition → frozen id recorded in `voices.json`
- [ ] `cinematic.mp4` + poster → `game/public/` (Track A wires player)
- [ ] Trailer recorded both markets → `lm_run.mp4` + silent cut + narration
- [ ] Screenshots refresh if UI changed (Track A signals when)
