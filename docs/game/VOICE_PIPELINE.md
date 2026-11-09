# The Late Market — Voice Pipeline (ElevenLabs)

**Researched:** 2026-11-09 via Parallel deep-research (run `trun_3fbfb0976af54811bc7adef6b310e0c1`) against current docs.
**Account:** Pro · ~426K chars banked this cycle · commercial licence included.
**Architecture ruling:** all audio **pre-baked**; the client plays assets + timing JSON; no API key ships to the browser.

---

## 1. Model choices (pin them — the API default is *not* v4)

| Role | Model | Why |
|---|---|---|
| **All authored dialogue masters** | `eleven_v4` ($0.08/1k chars) | Richest performance; latency is irrelevant for pre-baked lines; supports bracketed acting tags + native pronunciation workflow |
| Warm long narration fallback (bake tests only) | `eleven_multilingual_v2` | Stable classic; different control surface — do NOT carry v4 tags into it |
| (Not used) Real-time variants | `eleven_v4_turbo`, `v3_conversational` |turbo at $0.04/1k; latency wins don't help static assets |
| **Music** | `music_v2_5` ($0.15/min) | Prompt-led + composition plans; loops still need manual seam engineering |
| **SFX one-shots** | `eleven_text_to_sound_v3` via `POST /v1/sound-generation` (0.1–30s) | Expressive foley; select explicitly (schema defaults to v2!) |
| **SFX ambient loops** | v2 `loop: true` — the ONLY model with native looping | ⚠️ v2 deprecated **March 1, 2027** → sample/retain approved loop assets immediately; never design around it long-term |

## 2. Character identities — design once, freeze, never redesign

Workflow: `POST /v1/text-to-voice/design` → previews with `generated_voice_id` + base64 MP3 → approve → `POST /v1/text-to-voice` (name + description + preview id) → freezes a `voice_id`.
Key correction from research: the design endpoint supports **`eleven_ttv_v3`** (default `eleven_multilingual_ttv_v2`); audition text must be **100–1,000 chars**; previews return a list (don't hardcode three).

**Siki — voice description:**
> An adult owl storyteller. Warm, precise, quietly curious. Rounded resonance, clear consonants, restrained theatricality, measured pacing. A distinctive speaking voice — not a hoot, not a celebrity imitation.

**Zana — voice description:**
> An adult dog enforcer. Compact, mid-to-low register. Direct consonants, short dry phrases, streetwise, controlled impatience with occasional unguarded warmth. Assertive, never cartoonish, clearly contrasted with a warm narrator.

**Audition protocol:** same 6-line set for both — acknowledgment / explanation / name-heavy / number-heavy / urgent warning / quiet confidential. Approve only if the contrast *survives* neutral delivery and emotional shifts (research criterion). Pronunciation of "Siki" and "Zana" goes in a **pronunciation dictionary (version pinned)** the moment we have both IDs.

## 3. Performance direction — the v4 tag system

Square-bracket **audio tags** are the direction language (v4/v3); **SSML `<break>` is not supported in v4**:

```text
[whispering] The market wakes when the lanterns do...
[laughing] Coordinate? On a receipt?
[shouting] The stall just changed its price again!
```

- Pauses: punctuation first; **exact silence is added in the editor**, sample-accurate (break tags: up to 3s, classic models only, artifacts if overused).
- SFX-sounding tags (`[coin jingle]`) are unreliable per voice → always put physical effects on the separate SFX layer.
- Per-line recipe (documented generic fields): `stability` 0.5 (baseline; lower = more emotional range), `similarity_boost` 0.75 (never vary while testing tags), `style`/`speed` **unset for v4** (not v4 controls), `seed` saved with the take (best-effort determinism; the approved waveform is the artifact), `previous_text`/`next_text` = true neighbouring lines for continuity in connected scenes, `pronunciation_dictionary_locators` with explicit `version_id`.
- **Take rule from research:** a line whose identity changes when a tag is added is a failed take, regardless of how good the acting sounds.

## 4. Subtitle mode — the "most current modality" tick

`POST /v1/text-to-speech/{voice_id}/with-timestamps` returns character-level `alignment` + `normalized_alignment` (parallel arrays of chars + start/end seconds, nullable). Word spans = group non-space characters; first-char start → last-char end.

- Generate timings **during authoring**, but re-run `POST /v1/forced-alignment` (multipart; character + **word** timing) against the **final edited asset** — any trim/silence insertion invalidates offsets.
- Runtime highlighting reads the *audio playback clock*, recomputes on pause/seek/replay. Captions render as plain text only. Line files ship as `{audio, timing.json}` pairs in the manifest — this is our signature accessibility feature and the Chroma "current primitives" claim.
- Batch dialogue: `POST /v1/text-to-dialogue/with-timestamps` supports up to 10 voices per ≤2,000-char inputs — use for auditioning exchanges only, ship separate line files (replay/localize/replace individual lines).

## 5. Line manifest (the versioned performance bible)

One JSON per line: `lineId · speaker · displayText · spokenText · performanceCue · sceneContext · modelId · voiceId · voiceSettings · seed · dictionaryVersion · takeId · requestIds (up to 3 neighbours) · approved:boolean · wordSpans`. Approved waveforms + masters kept lossless locally; browser export separate.

**Budget arithmetic:** ~500 lines × ~100 chars ≈ 50k chars/pass ≈ **$4 at v4 rates** — a full re-pass rounds to nothing against the 426K banked balance. Real risk is identity inconsistency across takes, not cost.

## 6. Scene-layer prompts (first passes, from the report's patterns)

- **Market music**: instrumental underscore, felted plucks + warm drone + airy texture, sparse, steady pulse, "leave room for a warm narrator and a dry low-mid character voice", no cadence/fade, same texture at start and end for loop editing. Approve only under real dialogue; engineer the seam (interior region, consistent musical boundary, crossfade, headphone + speaker check).
- **Siki stinger**: "One soft feather ruffle + tiny wooden chime, intimate, dry, isolated, no speech/music."
- **Zana stinger**: "One short collar-jingle + dry paw scuff on wood, close, understated, no barking."
- **UI confirm**: "single small wooden click then warm glass ping, clean transient, short tail."
- **Ambience**: "Quiet night market, distant crockery and cloth movement, no intelligible foreground speech, steady texture" (+ v2 `loop:true` render reserved).

## 7. Also worth one email

ElevenLabs runs a **gaming grant: 33M characters + 12 months, free**, higher concurrency — separate application from our Pro account, acceptance-gated. A jam-grade pitch for The Late Market could land it for the Chroma build. Non-blocking; not in the budget.

## 8. Acceptance gates before baking = auditions for S/Z, then the full-batch render.

- Per-batch: review in scene context (meaning → identity → emotion → pronunciation → pacing → artifacts → clean tails).
- Browser pass: interruption, rapid skip, replay, pause/seek re-highlighting, music ducking under dialogue, memory/decode, itch-iframe audio unlock, API-key absence.
- Continuous: identity drift check against the two frozen voice IDs after every model/config change.

---
**Next executable step:** run the two Voice Design auditions (2 slots, <1k chars each, preview cost only) → pick from previews → save production IDs → pin the glossary. The Siki/Zana descriptions and audition text are ready in §2.
