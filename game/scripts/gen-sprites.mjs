#!/usr/bin/env node
/**
 * Painted sprite generation — latest models (verified 2026-11-14).
 * Preferred: fal `openai/gpt-image-2.5-sunburst` (quality) or
 * `google/nano-banana-2.1` (fast/cheap, 4K, 14 refs) — both hold
 * character consistency far better than Recraft V3 did. Recraft V4.1
 * remains the vector/cover path. Legacy below kept for reference:
 *
 *   RECRAFT_API_KEY=... node scripts/gen-sprites.mjs
 *
 * Generates the 7 street sprites on a solid flat magenta background
 * (keyable against the indigo/amber subject palette), then
 * scripts/chroma-key.py keys the background to alpha so they drop into
 * the Pixi scene as textures (scene/streetScene.ts → public/assets/
 * sprites/). States (dim/lit/shut) are Pixi tints — one image per
 * character, not per state.
 *
 * The v5 set was actually produced by driving the user's logged-in
 * Recraft web UI (ego-browser) — each prompt yields 2 variants; the
 * "Export as → PNG" flow lands in ~/Downloads. This script remains for
 * regenerating via API key if you prefer.
 *
 * Output: art-src/<kind>-raw.png (flattened) → chroma-key.py →
 * public/assets/sprites/<kind>.png (alpha).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "art-src");
const API = "https://external.api.recraft.ai/v1/images/generations";

const STYLE =
  "children's picture-book illustration, hand-painted gouache texture, " +
  "warm lantern-lit night market mood, deep indigo and amber palette, " +
  "soft rim lighting, storybook creature with an expressive face, " +
  "full body visible, isolated single subject, centered, " +
  "solid flat magenta background, uniform untextured backdrop, " +
  "no scenery, no gradient, no text, no border, no watermark";

const SPRITES = [
  ["cart", "a small wooden market push-cart piled with fruit and cloth, two wheels and a long handle"],
  ["awning", "a cozy market stall with a striped fabric awning and a wooden counter of goods"],
  ["factor", "a polished otter in a waistcoat and pocket watch chain, smug clever creditor, holding a ledger"],
  ["collector", "a stern vulture in pinstripe suit, cold calculating debt collector, holding an invoice"],
  ["shark", "a grinning cartoon shark in a sharp suit, fast-talking loan shark, holding a contract"],
  ["siki", "a small round owl bookkeeper wearing round spectacles, wise and gentle, holding a ledger book"],
  ["zana", "a scruffy dog with floppy ears and a wagging tail, loyal and energetic, the chaser"],
];

const key = process.env.RECRAFT_API_KEY;
if (!key) { console.error("set RECRAFT_API_KEY"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

for (const [kind, subject] of SPRITES) {
  const prompt = `${subject}, ${STYLE}`;
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      prompt,
      model: "recraftv3",
      style: "digital_illustration",
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  });
  if (!res.ok) { console.error(`${kind}: HTTP ${res.status} ${await res.text()}`); continue; }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) { console.error(`${kind}: no image in response`, JSON.stringify(data).slice(0, 200)); continue; }
  const raw = join(OUT, `${kind}-raw.png`);
  writeFileSync(raw, Buffer.from(b64, "base64"));
  console.log(`${kind}: saved ${raw}`);
}

// Chroma-key magenta → alpha via the repo's PIL/numpy pass.
execFileSync("python3", [join(ROOT, "scripts", "chroma-key.py")], { stdio: "inherit" });
console.log("done — keyed sprites in public/assets/sprites");
