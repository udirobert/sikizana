#!/usr/bin/env node
/**
 * Trailer narration — NOT game VO. These lines live only in out/trailer-vo/
 * and the trailer mix; they never enter design/lines.json or the runtime
 * manifest (the trailer is marketing, not the experiment).
 *
 * Timings fit the 61s cinematic cut: title 0–4, UK 4–28, bridge 28–31,
 * souq 31–55, end 55–61. Siki reads at ~850 chars/min; each take's offset
 * leaves its tail inside its section.
 *
 * Usage: ELEVENLABS_API_KEY=... node scripts/bake-trailer-vo.mjs
 * Idempotent: skips takes whose .mp3 already exists.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out", "trailer-vo");

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error("ELEVENLABS_API_KEY not set"); process.exit(1); }

const voicesDoc = JSON.parse(readFileSync(join(ROOT, "design", "voices.json"), "utf8"));
const linesDoc = JSON.parse(readFileSync(join(ROOT, "design", "lines.json"), "utf8"));

const TAKES = [
  { id: "tr_open", at: 0.5, text: "A night market opens where your uncollected invoices sleep." },
  { id: "tr_uk", at: 5.5, text: "Twenty-four hundred pounds, already on the street. Leave it, and that wait becomes someone else's business." },
  { id: "tr_souq", at: 29.0, text: "Same week, different law. In the Souq, lateness costs what your own terms say." },
  { id: "tr_close", at: 52.0, text: "The Late Market. Ten minutes. Free in your browser." },
];

mkdirSync(OUT, { recursive: true });

for (const t of TAKES) {
  const mp3 = join(OUT, `${t.id}.mp3`);
  if (existsSync(mp3)) { console.log(`✓ ${t.id} (cached)`); continue; }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voicesDoc.characters.siki.production_voice_id}`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: t.text,
      model_id: linesDoc.model_id,
      voice_settings: linesDoc.voice_settings,
    }),
  });
  if (!res.ok) throw new Error(`${t.id}: HTTP ${res.status} ${await res.text()}`);
  writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${t.id}`);
}

console.log(JSON.stringify(TAKES.map(({ id, at }) => ({ id, at }))));
