#!/usr/bin/env node
/**
 * ElevenLabs Flows (Image & Video) client — Track B asset pipeline.
 * Async submit-and-poll; no webhook needed for batch asset work.
 *
 * Usage:
 *   node scripts/elevenflows.mjs image --model gemini-3-pro-image \
 *     --prompt "..." --ratio 16:9 --res 2K --out public/cinematic/key1.png
 *   node scripts/elevenflows.mjs video --model veo-3.1-fast-generate-001 \
 *     --prompt "..." --secs 8 --ratio 16:9 --res 1080p [--audio] \
 *     [--negative "..."] [--no-enhance] \
 *     [--start-frame path.png] [--end-frame path.png] \
 *     [--style-ref path.png] [--subject-ref path.png] --out shot1.mp4
 *   node scripts/elevenflows.mjs status --id <generation_id> [--kind video]
 *
 * Requires ELEVENLABS_API_KEY (Pro tier or above for Flows).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const API = "https://api.elevenlabs.io";
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("ELEVENLABS_API_KEY not set"); process.exit(1); }

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const has = (name) => args.includes(`--${name}`);

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "xi-api-key": KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

const MIME_EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "video/mp4": ".mp4" };
const MIME_BY_EXT = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function inlineImage(path) {
  const mime = MIME_BY_EXT[extname(path).toLowerCase()] ?? "image/png";
  return { type: "inline_base64", content_base64: readFileSync(path).toString("base64"), mime_type: mime };
}

async function collect(kind, id, out) {
  // Poll: images ≥2s, video ≥10s between requests (per docs).
  const interval = kind === "image" ? 2000 : 10000;
  for (;;) {
    const g = await api(`/v1/flows/${kind}/${id}`);
    if (g.status === "completed") {
      const buf = Buffer.from(await (await fetch(g.content_url)).arrayBuffer());
      const file = out ?? join("out", `gen-${id}${MIME_EXT[g.content_mime_type] ?? ".bin"}`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
      console.log(`✓ ${id} → ${file} (${buf.length} bytes, ${g.content_mime_type})`);
      return g;
    }
    if (g.status === "failed") throw new Error(`${id} failed: ${g.failure_reason ?? ""} ${g.error_message ?? ""}`);
    process.stdout.write(`  ${g.status}…\r`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

if (cmd === "status") {
  const id = opt("id");
  const kind = opt("kind", "image");
  console.log(JSON.stringify(await api(`/v1/flows/${kind}/${id}`), null, 1));
} else if (cmd === "image") {
  const body = {
    model_id: opt("model", "gemini-3-pro-image"),
    prompt: opt("prompt"),
    aspect_ratio: opt("ratio", "16:9"),
    resolution: opt("res", "2K"),
  };
  if (has("seed")) body.seed = Number(opt("seed"));
  const refs = opt("refs"); // comma-separated local image paths
  if (refs) body.images = refs.split(",").map(inlineImage);
  const g = await api("/v1/flows/image", { method: "POST", body: JSON.stringify(body) });
  console.log(`submitted ${g.id}`);
  await collect("image", g.id, opt("out"));
} else if (cmd === "video") {
  const body = {
    model_id: opt("model", "veo-3.1-fast-generate-001"),
    prompt: opt("prompt"),
    duration_secs: Number(opt("secs", 8)),
    aspect_ratio: opt("ratio", "16:9"),
    resolution: opt("res", "1080p"),
    generate_audio: !has("no-audio"),
  };
  if (has("negative")) body.negative_prompt = opt("negative");
  if (has("no-enhance")) body.enhance_prompt = false;
  for (const [flag, field] of [["start-frame", "start_frame"], ["end-frame", "end_frame"]]) {
    const p = opt(flag);
    if (p) body[field] = inlineImage(p);
  }
  // Veo style/subject refs (8s duration required when used).
  const veoImages = [];
  const style = opt("style-ref");
  if (style) veoImages.push({ image: inlineImage(style), role: "style" });
  const subject = opt("subject-ref");
  if (subject) veoImages.push({ image: inlineImage(subject), role: "subject" });
  if (veoImages.length) body.images = veoImages;
  const g = await api("/v1/flows/video", { method: "POST", body: JSON.stringify(body) });
  console.log(`submitted ${g.id}`);
  await collect("video", g.id, opt("out"));
} else {
  console.error("usage: elevenflows.mjs image|video|status …");
  process.exit(1);
}
