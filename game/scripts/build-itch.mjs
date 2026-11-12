#!/usr/bin/env node
/**
 * The Late Market — itch.io HTML5 package (GDD Appendix C).
 *
 *   1. npm run build            (tsc + vite, base: './' → relative paths)
 *   2. stage dist/* → dist/itch/  with index.html at the zip TOP level
 *   3. zip -r -X dist/itch.zip dist/itch/*
 *
 * itch.io HTML5 requirements honoured:
 *   - zip with top-level index.html
 *   - relative, case-sensitive paths (vite base './')
 *   - no external URLs (all audio pre-baked, no API keys in the client)
 *   - own Start/Enable-Sound button unlocks AudioContext inside the click
 *
 * Usage: node scripts/build-itch.mjs [--out dist/itch.zip]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const outIdx = process.argv.indexOf("--out");
const out = outIdx >= 0 ? process.argv[outIdx + 1] : join(ROOT, "dist", "itch.zip");
// Safety: the output must be a .zip inside the project — never a binary or
// a path outside dist/ (an earlier default bug clobbered the node binary).
const resolved = out.startsWith("/") ? out : join(process.cwd(), out);
if (!resolved.endsWith(".zip") || !resolved.startsWith(join(ROOT, "dist"))) {
  console.error("FAIL: refusing to write zip outside dist/ — got", resolved);
  process.exit(1);
}

process.chdir(ROOT);
console.log("▶ build");
execFileSync("npm", ["run", "build"], { stdio: "inherit" });

// Stage in /tmp (never inside dist/ — cpSync would recurse into the target).
const stage = "/tmp/lm-itch-stage";
rmSync(stage, { recursive: true, force: true });
cpSync(join(ROOT, "dist"), stage, { recursive: true });

// Verify the itch invariants before zipping.
const indexHtml = join(stage, "index.html");
if (!existsSync(indexHtml)) { console.error("FAIL: no top-level index.html in stage"); process.exit(1); }
const html = (await import("node:fs")).readFileSync(indexHtml, "utf8");
if (html.includes('src="/assets/') || html.includes('href="/assets/')) {
  console.error("FAIL: absolute /assets/ paths found — set base:'./' in vite.config");
  process.exit(1);
}
// Count files + check path length (< 240 chars).
let files = 0;
const walk = (d) => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) walk(p);
    else { files += 1; const rel = p.slice(stage.length + 1); if (rel.length > 235) { console.error("FAIL: path too long:", rel); process.exit(1); } }
  }
};
walk(stage);

console.log("▶ zip", out);
rmSync(out, { force: true });
execFileSync("zip", ["-r", "-X", "-q", out, "."], { cwd: stage, stdio: "inherit" });
rmSync(stage, { recursive: true, force: true });
console.log(`done: ${out} (${files} files, top-level index.html, relative paths)`);
