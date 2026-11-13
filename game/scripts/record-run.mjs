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
const MODE_ARG = flagVal("--mode");
const mode = MODE_ARG === "video" ? "video" : MODE_ARG === "finale" ? "finale" : MODE_ARG === "ui" ? "ui" : "shots";
const OUT = flagVal("--out") ?? join(ROOT, "screenshots");
// Trailer segments (concat with ffmpeg): --seg a starts at the title and
// plays ch1→ch2-run-2; --seg b starts fresh at ?ch=3 and plays Mareline→Shark.
// Mid-session Page.navigate hangs the CDP session, so segments run as
// separate processes. Default (no --seg) is the legacy single run.
const SEG = flagVal("--seg") ?? "ab";
const OUTFILE = flagVal("--file") ?? "lm_run.mp4";

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
await send("Page.navigate", { url: SEG === "b" ? `${PAGE_URL}?ch=3` : PAGE_URL });
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
  await clickByText("Reply to the morning emails"); await s(2400); // Day 2: easy work (the 2nd invoice ages → street)
  await clickByText("Next day"); await s(4600);
  await clickByText("Chase"); await s(2800); // Day 3: chase PAIR A — the £2,400 lands Day 5, in the week
  await clickByText("Next day"); await s(4800);
  await clickByText("Leave the bill"); await s(2800); // Day 4: skip the supplier bill (the liability note)
  await clickByText("Next day"); await s(4600);
  await clickByText("Leave it for tomorrow"); await s(2800); // Day 5: defer pair B — the present-bias tilt
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
    if (SEG === "b") {
      await s(2600); // ch3 title card
      await clickByText("Begin — sound on"); await s(2200);
      await clickByText("Open the account"); await s(2800); // Mareline's history
      await clickByText("Keep the line going"); await s(2200); // round 2 — silence
      await clickByText("Keep the line going"); await s(2200); // round 3 — silence
      await clickByText("Stop work on this account"); await s(2800); // → the Factor steps up
      await s(2400); // his offer on the table
      await clickByText("Turn him down"); await s(3000); // → the Shark smiles
      await s(5000); // hold on the daily number — the tape's closing frame
      // (falls through to the shared 10fps encode below)
    } else {
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
    await clickByText("Close the books"); // → chapter 2 intro: the Claims Desk
    await s(3200);
    await clickByText("Walk into the office"); await s(3200); // desk opener, run 1
    await evalJs("(() => { const i = document.querySelector('input[type=number]'); if (i) { i.value = '900'; i.dispatchEvent(new Event('input')); } return true; })()");
    await clickByText("Set the floor"); await s(2200);
    await clickByText("Accept"); await s(3000); // run 1 clears → run 2 opener
    await s(2400); // hold on the second sitting — segment A out
    } // end else (segment A)
  } finally {
    cap = false;
    clearInterval(loop);
    await shot();
  }
  const dur = (Date.now() - t0) / 1000;
  const video = join(OUT, OUTFILE);
  execFileSync("ffmpeg", [
    "-y", "-framerate", "10", "-i", join(framesDir, "%04d.jpg"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-movflags", "+faststart",
    video,
  ], { stdio: "inherit" });
  rmSync(framesDir, { recursive: true, force: true });
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
  const cap = async (label) => { const t = await evalJs(`[...document.querySelectorAll("#street-slot .lm-stall")].map(s=>s.dataset.kind+"="+s.className.replace("lm-stall ","")).join(" ")`); console.log(`[stalls ${label}] ${t}`); };
  await clickByText("Chase"); await s(2600); // Day 1: chase the already-overdue invoice
  await cap("d1");
  await clickByText("Next day"); await s(3200);
  await clickByText("Reply to the morning emails"); await s(1400); // Day 2: easy work (auto-defers the 2nd invoice)
  await cap("d2");
  await shot("v2_day2_defer.png");
  await clickByText("Next day"); await s(4400);
  await shot("v2_day3_pair.png"); // PAIR A: the choice that moves the till (chase → lands day 5)
  await clickByText("Chase"); await s(1100);
  await cap("d3");
  await shot("v2_day3_chased.png"); // pair A committed — AND the Factor steps up (his stall just lit)
  await shot("v2_actor_factor.png"); // the Factor, clearly: the street's idea as a character
  await clickByText("Next day"); await s(4600);
  await shot("v2_day4_bill.png"); // the till stress: £2,000 due, the till can't cover it
  await clickByText("Leave the bill"); await s(2600);
  await clickByText("Next day"); await s(4400);
  await shot("v2_day5_pair_b.png"); // PAIR B: the same choice, the payoff just past the close
  await clickByText("Leave it for tomorrow"); await s(2600); // Day 5: defer pair B — the present-bias tilt
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

// ── UI mode: keyboard + chapter-2 trail, asserted headlessly (npm run build) ─
async function uiProbe() {
  const fails = [];
  const check = (ok, label, extra = "") => {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : ` — ${extra}`}`);
    if (!ok) fails.push(label);
  };
  const press = async (key, code, vk) => {
    const common = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await send("Input.dispatchKeyEvent", { type: "keyDown", ...common, ...(key.length === 1 ? { text: key, unmodifiedText: key } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
    await sleep(420);
  };
  const dayHeading = () => evalJs(`(document.querySelector("#ch1 .lm-day h3")||{}).textContent||""`);

  await sleep(2200);
  await clickByText("Begin — sound on"); await sleep(2400);
  await clickByText("Open the shutters"); await sleep(1400);

  const caps = await evalJs(`[...document.querySelectorAll("#ch1 .lm-choice")].map((b) => (b.dataset.key || "-") + ":" + (b.querySelector(".lm-choice-label") || {}).textContent)`);
  check(Array.isArray(caps) && caps.length >= 2 && caps.every((c) => /^[1-9]:/.test(c)), "visible choices carry 1..n keycaps", JSON.stringify(caps));
  const prog = await evalJs(`(document.querySelector(".lm-progress") || {}).textContent || ""`);
  check(/Chapter 1 of 3/.test(prog) && /The Stall/.test(prog), "the run's shape is on screen", prog);

  await press("1", "Digit1", 49);
  check(/Day 1 closed/.test(await dayHeading()), "key 1 resolves the day");
  await press("Enter", "Enter", 13);
  check(/Day 2 of 5/.test(await dayHeading()), "Enter takes a lone choice");

  // The finale's outbound door is an <a class="lm-choice">: it must never take a
  // key, or a stray press would navigate someone off the ending.
  await evalJs(`(() => { const a = document.createElement("a"); a.className = "lm-choice"; a.href = "#nope"; a.textContent = "door"; a.id = "lm-door-probe"; document.querySelector("#ch1").append(a); return true; })()`);
  await sleep(150);
  const doorKey = await evalJs(`(document.getElementById("lm-door-probe") || {}).dataset?.key || "none"`);
  check(doorKey === "none", "the outbound door never takes a key", doorKey);
  await evalJs(`document.getElementById("lm-door-probe")?.remove()`);

  const count = await evalJs(`document.querySelectorAll("#ch1 .lm-choice[data-key]").length`);
  check(count >= 2, "renumbering survives the re-render", String(count));

  // Past the keyboard: play out the week and reach chapter 2's counter, where
  // the desk's numbers are supposed to stack into a visible trail.
  const pick = async (needle, dwell = 1600) => { await clickByText(needle); await sleep(dwell); };
  await pick("Reply to the morning emails");
  await pick("Next day");
  await pick("Leave it for tomorrow", 1200);
  await pick("Next day");
  await pick("Leave the bill", 1200);
  await pick("Next day");
  await pick("Chase", 1200);
  await pick("Close the books");
  await pick("Look at the books");
  await pick("Continue");
  await pick("Continue");
  await pick("Close the books", 2200);
  await pick("Walk into the office");
  await evalJs(`(() => { const i = document.querySelector("input[type=number]"); if (i) { i.value = "1100"; i.dispatchEvent(new Event("input")); } return true; })()`);
  await pick("Set the floor", 1200);
  const before = await evalJs(`document.querySelectorAll(".lm-trail").length`);
  check(before === 0, "no trail before the desk moves", String(before));
  await pick("Say it isn't enough", 1200);
  const trail = await evalJs(`[...document.querySelectorAll(".lm-trail .lm-trail-num")].map((n) => n.textContent)`);
  check(Array.isArray(trail) && trail.length === 2, "the desk's numbers stack into a trail", JSON.stringify(trail));
  const prog2 = await evalJs(`(document.querySelector(".lm-progress") || {}).textContent || ""`);
  check(/Chapter 2 of 3/.test(prog2), "progress follows the chapter", prog2);

  if (fails.length) {
    console.error(`\n${fails.length} probe(s) failed: ${fails.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nui probe: all checks passed");
  }
}

try {
  if (mode === "video") await recordVideo();
  else if (mode === "ui") await uiProbe();
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
