#!/usr/bin/env node
/**
 * Bake The Late Market's spoken lines (docs/game/VOICE_PIPELINE.md §5).
 * Reads design/lines.json + design/voices.json, renders each line on
 * eleven_v4 with the pinned pronunciation dictionary, and writes:
 *   public/audio/{lineId}.mp3          — the approved-take candidate
 *   public/audio/{lineId}.timing.json  — char-level alignment for captions
 *   public/audio/manifest.json         — runtime lookup by display text
 *
 * Usage: ELEVENLABS_API_KEY=... node scripts/bake-voices.mjs [--force]
 * Idempotent: skips lines whose .mp3 already exists unless --force.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "audio");
const FORCE = process.argv.includes("--force");
const CONCURRENCY = 4;

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error("ELEVENLABS_API_KEY not set"); process.exit(1); }

const linesDoc = JSON.parse(readFileSync(join(ROOT, "design", "lines.json"), "utf8"));
const voicesDoc = JSON.parse(readFileSync(join(ROOT, "design", "voices.json"), "utf8"));
const dict = voicesDoc.pronunciation_dictionary;
if (!dict?.version_id) { console.error("voices.json missing pronunciation_dictionary.version_id"); process.exit(1); }

const VOICE = {
  siki: voicesDoc.characters.siki.production_voice_id,
  zana: voicesDoc.characters.zana.production_voice_id,
};
for (const [k, v] of Object.entries(VOICE)) if (!v) { console.error(`no production_voice_id for ${k}`); process.exit(1); }

const norm = (s) => s.trim().replace(/\s+/g, " ");

/** Stable per-line seed so re-bakes are deterministic-ish (TTS takes still vary). */
function lineSeed(id) {
  let h = 2166136261;
  for (const c of id) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Expand {placeholder} variants into concrete lines. */
function expand(line) {
  if (!line.variants) return [{ ...line, text: norm(line.text) }];
  const keys = Object.keys(line.variants);
  const out = [];
  const walk = (i, acc) => {
    if (i === keys.length) {
      let text = line.text;
      for (const [k, v] of Object.entries(acc)) text = text.replaceAll(`{${k}}`, String(v));
      out.push({ ...line, id: `${line.id}_${Object.values(acc).join("_")}`, text: norm(text) });
      return;
    }
    for (const v of line.variants[keys[i]]) walk(i + 1, { ...acc, [keys[i]]: v });
  };
  walk(0, {});
  return out;
}

const jobs = linesDoc.lines.flatMap(expand);
mkdirSync(OUT, { recursive: true });
console.log(`${jobs.length} lines to bake (${linesDoc.lines.length} entries, model ${linesDoc.model_id})`);

async function bake(line) {
  const mp3 = join(OUT, `${line.id}.mp3`);
  const timing = join(OUT, `${line.id}.timing.json`);
  if (!FORCE && existsSync(mp3) && existsSync(timing)) return { id: line.id, skipped: true };
  // NPC stallholders double a narrator's base voice at a shifted character
  // rate (`tts_voice` + `rate` on the line); Siki/Zana bake on their own.
  const voiceId = line.tts_voice ?? VOICE[line.speaker];
  if (!voiceId) throw new Error(`${line.id}: no voice for speaker ${line.speaker}`);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: line.text,
      model_id: linesDoc.model_id,
      voice_settings: linesDoc.voice_settings,
      seed: lineSeed(line.id),
      pronunciation_dictionary_locators: [{
        pronunciation_dictionary_id: dict.id,
        version_id: dict.version_id,
      }],
    }),
  });
  if (!res.ok) throw new Error(`${line.id}: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  writeFileSync(mp3, Buffer.from(data.audio_base64, "base64"));
  const a = data.alignment ?? {};
  writeFileSync(timing, JSON.stringify({
    lineId: line.id,
    speaker: line.speaker,
    text: line.text,
    characters: a.characters ?? [],
    start_times_seconds: a.start_times_seconds ?? [],
    end_times_seconds: a.end_times_seconds ?? [],
  }));
  return { id: line.id, chars: line.text.length };
}

const results = [];
const queue = [...jobs];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const line = queue.shift();
    try {
      results.push(await bake(line));
      console.log(`✓ ${line.id}`);
    } catch (e) {
      console.error(`✗ ${line.id}: ${e.message}`);
      results.push({ id: line.id, error: String(e.message ?? e) });
    }
  }
}));

// Runtime manifest — keyed by normalized display text.
const manifest = {
  generated_at: new Date().toISOString(),
  model_id: linesDoc.model_id,
  dictionary_version: dict.version_id,
  voices: VOICE,
  lines: {},
};
for (const line of jobs) {
  const timingPath = `${line.id}.timing.json`;
  if (!existsSync(join(OUT, timingPath))) continue; // failed bakes stay text-only
  manifest.lines[norm(line.text)] = {
    id: line.id,
    speaker: line.speaker,
    audio: `audio/${line.id}.mp3`,
    timing: `audio/${line.id}.timing.json`,
    ...(line.rate && line.rate !== 1 ? { rate: line.rate } : {}),
  };
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));

const failed = results.filter((r) => r.error);
console.log(`\nDone: ${results.length - failed.length}/${results.length} baked, ${failed.length} failed, manifest → public/audio/manifest.json`);
if (failed.length) process.exitCode = 1;
