#!/usr/bin/env node
// One-off: bake the gameplay-video narration with Siki's production voice.
// Same request shape as bake-voices.mjs (eleven_v4 + pinned dictionary).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error("ELEVENLABS_API_KEY not set"); process.exit(1); }
console.log("key sha:", createHash("sha256").update(API_KEY).digest("hex").slice(0, 12));

const text = readFileSync("game-video/narration_script.txt", "utf8").trim().replace(/\s+/g, " ");
// NOTE: the pinned in-game Siki (Mwika, Yru1…) 404s on this workspace key as of
// 2026-11-13 (listed in /v1/voices but not TTS-resolvable). Narration uses the
// workspace's own "Siki — The Late Market" voice instead — trailer VO, not canon.
const res = await fetch("https://api.elevenlabs.io/v1/text-to-speech/IN2V4qht1zMBoNajEhTY/with-timestamps", {
  method: "POST",
  headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    text,
    model_id: "eleven_v4",
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    seed: 987654321,
    pronunciation_dictionary_locators: [{
      pronunciation_dictionary_id: "86eNgWAzawEGpCoGq7tt",
      version_id: "R2bc87hZLkji9FMPpzWh",
    }],
  }),
});
if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
const data = await res.json();
writeFileSync("game-video/narration.mp3", Buffer.from(data.audio_base64, "base64"));
console.log("narration OK, chars:", text.length);
