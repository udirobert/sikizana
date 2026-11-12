#!/usr/bin/env node
/**
 * The Late Market — recording driver (zero dependencies; Node built-ins only).
 *
 * Serves dist/ over localhost, drives headless Chrome over CDP, and either:
 *   --mode video   plays a scripted 5-day run, captures at 10fps, ffmpeg → mp4
 *   --mode shots   plays to named scenes, saves one screenshot per scene
 *   --mode finale  plays a FULL run (ch1→ch2→ch3→finale), saves finale shots
 *
 * Usage:
 *   node scripts/record-run.mjs --mode video --out game/video/lm_run.mp4
 *   node scripts/record-run.mjs --mode shots --out game/screenshots
 *   node scripts/record-run.mjs --mode finale --out game/screenshots
 *
 * Requires: dist/ built (npm run build), a Chrome/Chromium app, ffmpeg.
 */
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) { console.error("dist/ not built — run `npm run build` first"); process.exit(1); }

const PORT = 8791;
const PAGE_URL = `http://127.0.0.1:${PORT}/`;

const flagVal = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const mode = flagVal("--mode") === "video" ? "video" : flagVal("--mode") === "finale" ? "finale" : "shots";
const OUT = flagVal("--out") ?? join(ROOT, "screenshots");

// ── Serve dist/ ────────────────────────────────────────────────────────────
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, PAGE_URL).pathname);
  if (p === "/") p = "/index.html";
  const file = join(DIST, p);
  if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// ── Launch headless Chrome ─────────────────────────────────────────────────
const PROFILE = `/tmp/lm-chrome-${process.pid}`;
rmSync(PROFILE, { recursive: true, force: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT + 2}`,
  "--disable-gpu", `--user-data-dir=${PROFILE}`, "about:blank",
], { stdio: ["ignore", "pipe", "inherit"] });

let ws = null;
const deadline = Date.now() + 30000;
let lastErr = "";
while (!ws && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 300));
  try {
    const res = await fetch(`http://127.0.0.1:${PORT + 2}/json/list`);
    const targets = await res.json();
    const page = targets.find((t) => t.type === "page");
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch (e) { lastErr = e.message; }
}
if (!ws) {
  console.error("Chrome did not open a debug port.", lastErr);
  try { chrome.kill("SIGKILL"); } catch {}
  process.exit(1);
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let seq = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
});
const send = (method, params = {}) => new Promise((res, rej) => { ws.send(JSON.stringify({ id: ++seq, method, params })); pending.set(seq, { res, rej }); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable");
await send("Runtime.enable");
// 1280×860 viewport via CDP (avoids the --window-size flag that crashed headless).
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280, height: 860, deviceScaleFactor: 1, mobile: false,
});
await send("Page.navigate", { url: PAGE_URL });
await sleep(1200);
await evalJs("localStorage.clear()");
await send("Page.reload");
await sleep(1200);

// ── Click helpers ──────────────────────────────────────────────────────────
const clickByText = async (needle) => {
  const ok = await evalJs(`(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes(${JSON.stringify(needle)}));
    if (!b) return false; b.click(); return true;
  })()`);
  if (!ok) throw new Error(`button not found: "${needle}"`);
};

// ── Scenario: the 5-day run (video + shots both start here) ────────────────
const s = (label) => sleep(label); // dwell

/**
 * Plays Day 1 → "Day 5 closed" (the close-books day button is ON SCREEN,
 * unclicked). Caller decides: shots() clicks it to enter the debrief.
 */
async function playToDay5Closed() {
  await clickByText("Begin — sound on"); await s(2600);
  await clickByText("Open the shutters"); await s(3800);
  await clickByText("Chase"); await s(2800); // Day 1: chase the already-overdue invoice
  await clickByText("Next day"); await s(3400);
  await clickByText("Reply to the morning emails"); await s(2400);
  await clickByText("Next day"); await s(4600);
  await clickByText("Leave it for tomorrow"); await s(2800); // Day 3: defer pair A
  await clickByText("Next day"); await s(4800);
  await clickByText("Leave the bill"); await s(2800); // Day 4: skip the supplier bill
  await clickByText("Next day"); await s(4600);
  await clickByText("Chase"); await s(2800); // Day 5: chase pair B
  await s(600); // "Day 5 closed" on screen
}

// ── Video mode: 10fps capture for the full run ─────────────────────────────
async function recordVideo() {
  mkdirSync(OUT, { recursive: true });
  const framesDir = "/tmp/lm-frames";
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  for (const f of readdirSync(framesDir)) rmSync(join(framesDir, f));
  let n = 0;
  const t0 = Date.now();
  const DUR_MS = 96000; // hard cap; ffmpeg -t will trim
  let cap = true;
  const shot = async () => {
    if (!cap) return;
    const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
    writeFileSync(join(framesDir, `${String(n++).padStart(4, "0")}.jpg`), Buffer.from(r.data, "base64"));
  };
  const loop = setInterval(() => void shot(), 100);
  try {
    await s(2600); // title card
    await playToDay5Closed();
    await clickByText("Close the books");
    await s(6800); // debrief beat 1 — the street's earnings
    await clickByText("Look at the books");
    await s(7200); // beat 2 — line items on the player's data
    await clickByText("Continue");
    await s(6800); // beat 3 — the bias named, on their numbers
    await clickByText("Continue");
    await s(5600); // beat 4 — the rule
    await clickByText("Close the books");
    await s(1400);
  } finally {
    cap = false;
    clearInterval(loop);
    await shot();
  }
  const dur = (Date.now() - t0) / 1000;
  const video = join(OUT, "lm_run.mp4");
  execFileSync("ffmpeg", [
    "-y", "-framerate", "10", "-i", join(framesDir, "%04d.jpg"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-movflags", "+faststart",
    video,
  ], { stdio: "inherit" });
  rmSync(framesDir);
  console.log(`video → ${video} (${dur.toFixed(1)}s, ${n} frames)`);
}

// ── Shots mode: named screenshots at key scenes ────────────────────────────
async function shots() {
  mkdirSync(OUT, { recursive: true });
  const shot = (name) => send("Page.captureScreenshot", { format: "png" }).then((r) => {
    const p = join(OUT, name);
    writeFileSync(p, Buffer.from(r.data, "base64"));
    console.log(`screenshot → ${p}`);
  });
  await s(2600);
  await clickByText("Begin — sound on"); await s(2600);
  await clickByText("Open the shutters"); await s(4200);
  await shot("v2_day1_stall.png"); // the place: till + ledger + street + choice
  await clickByText("Chase"); await s(2600);
  await clickByText("Next day"); await s(3200);
  await clickByText("Reply to the morning emails"); await s(2200);
  await clickByText("Next day"); await s(4400);
  await shot("v2_day3_pair.png"); // the engineered choice, framed
  await clickByText("Leave it for tomorrow"); await s(2600);
  await shot("v2_day3_deferred.png"); // street lit on the deferral
  await clickByText("Next day"); await s(4600);
  await shot("v2_day4_bill.png"); // the till stress: £1,800 due
  await clickByText("Leave the bill"); await s(2600);
  await clickByText("Next day"); await s(4400);
  await shot("v2_day5_pair_b.png"); // both payoffs moved out
  await clickByText("Chase"); await s(2600);
  await clickByText("Close the books"); // debrief: street first
  await s(4200);
  await shot("v2_debrief_street.png");
  await clickByText("Look at the books"); await s(4200);
  await shot("v2_debrief_replay.png"); // line items on own data
  await clickByText("Continue"); await s(4200);
  await shot("v2_debrief_named.png"); // the bias named
}

// ── Finale mode: full run ch1→ch2→ch3→finale, screenshots at the payoff ────
async function finale() {
  mkdirSync(OUT, { recursive: true });
  const shot = (name) => send("Page.captureScreenshot", { format: "png" }).then((r) => {
    const p = join(OUT, name);
    writeFileSync(p, Buffer.from(r.data, "base64"));
    console.log(`screenshot → ${p}`);
  });
  await s(2200);
  await clickByText("Begin — sound on"); await s(2200);
  await clickByText("Open the shutters"); await s(3000);
  // ch1 — rational-ish: chase early, defer pair A (line item), pay bill, chase B
  await clickByText("Chase"); await s(2200);
  await clickByText("Next day"); await s(2600);
  await clickByText("Reply to the morning emails"); await s(2000);
  await clickByText("Next day"); await s(3200);
  await clickByText("Leave it for tomorrow"); await s(2200);
  await clickByText("Next day"); await s(3200);
  await clickByText("Pay"); await s(2200); // pay the bill (affordable after chase)
  await clickByText("Next day"); await s(3200);
  await clickByText("Chase"); await s(2200);
  await clickByText("Close the books"); await s(3200); // debrief: street first
  await clickByText("Look at the books"); await s(2600);
  await clickByText("Continue"); await s(2600);
  await clickByText("Continue"); await s(2600);
  await clickByText("Close the books"); await s(3000); // ch2 intro
  await clickByText("Walk into the office"); await s(2600);
  for (let run = 0; run < 3; run++) {
    await evalJs("(() => { const i = document.querySelector('input[type=number]'); if (i) { i.value = '900'; i.dispatchEvent(new Event('input')); } return true; })()");
    await clickByText("Set the floor"); await s(2200);
    await clickByText("Accept"); await s(2200);
    if (run < 2) await clickByText("Walk into the office").catch(() => {});
  }
  // Collector probe — take the Factor's money in ch3 later; here: decline
  await clickByText("Decline"); await s(2600);
  await clickByText("Continue"); await s(2600);
  await clickByText("Continue"); await s(2600);
  await clickByText("Next chapter"); await s(2600); // ch3 intro
  await clickByText("Open the account"); await s(2600);
  await clickByText("Keep the line going"); await s(2200);
  await clickByText("Stop work on this account"); await s(2200); // walk → street offers
  await clickByText("Take the Factor's money"); await s(2200); // street fee → stall
  await clickByText("Continue"); await s(2600);
  await clickByText("Continue"); await s(2600); // reveal beat
  await clickByText("To the finale prep"); await s(3000);
  // FINALE
  await shot("v2_finale_close.png"); // "You Were the Experiment" + street
  await clickByText("Let the market close"); await s(4000);
  await shot("v2_finale_market_closed.png");
  await clickByText("Read your ledger"); await s(2600);
  await clickByText("Continue"); await s(3200);
  await shot("v2_finale_profile.png"); // the Irrationality Profile
  await clickByText("Continue"); await s(2600);
  await shot("v2_finale_cost.png"); // Cost of Not Acting + Rationality Delta
}

try {
  if (mode === "video") await recordVideo();
  else if (mode === "shots") await shots();
  else await finale();
} catch (e) {
  console.error("scenario failed:", e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill("SIGKILL");
  server.close();
  rmSync(PROFILE, { recursive: true, force: true });
}
