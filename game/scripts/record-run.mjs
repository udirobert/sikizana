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
const mode = MODE_ARG === "video" ? "video" : MODE_ARG === "finale" ? "finale" : MODE_ARG === "ui" ? "ui" : MODE_ARG === "souqshots" ? "souqshots" : "shots";
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
// --gpu keeps WebGL alive (SwiftShader) so the Pixi street scene renders
// in captures; default stays --disable-gpu for the fast DOM probe path.
const GPU = process.argv.includes("--gpu");
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT + 2}`,
  ...(GPU ? [] : ["--disable-gpu"]), `--user-data-dir=${PROFILE}`, "about:blank",
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
// Shots/finale capture with Zana's clock OFF (the game's own opt-out):
// headless audio is blocked, so the council lines land instantly and the
// 10-second gut clock starts the moment Day 1 opens — a single PNG capture
// (5–8 s with WebGL) can eat the whole window and auto-close the day under
// the script's click. The video mode keeps the clock: its clicks land fast.
if (mode === "shots" || mode === "finale" || mode === "souqshots") {
  await evalJs('localStorage.setItem("lm.gutclock.v1","0")');
}
await send("Page.reload");
await sleep(1200);

// ── Click helpers ──────────────────────────────────────────────────────────
const clickByText = async (needle) => {
  // Visible-first: souq mode keeps a hidden twin of the shutters gate
  // earlier in the DOM — clicking it is a silent no-op. Prefer the button
  // the player would see; fall back to any match for hidden-but-live UI.
  const ok = await evalJs(`(() => {
    const bs = Array.from(document.querySelectorAll("button")).filter((x) => x.textContent.includes(${JSON.stringify(needle)}));
    const b = bs.find((x) => x.offsetParent !== null) ?? bs[0];
    if (!b) return false; b.click(); return true;
  })()`);
  if (!ok) throw new Error(`button not found: "${needle}"`);
};
const clickIf = async (needle) => evalJs(`(() => {
  const bs = Array.from(document.querySelectorAll("button")).filter((x) => x.textContent.includes(${JSON.stringify(needle)}));
  const b = bs.find((x) => x.offsetParent !== null) ?? bs[0];
  if (!b) return false; b.click(); return true;
})()`);
/** Title → market pick → cinematic → story card → Shark offer → shutters → stall. */
async function reachTheStall() {
  await clickByText("Begin — sound on");
  await sleep(700);
  if (await clickIf("London")) await sleep(400);
  await clickIf("Skip");
  await sleep(300);
  // The story card's gate (was "Open the shutters" on the old welcome beat —
  // the consequence pass gave the intro this card and moved the shutters
  // button to the post-refuse gate).
  await clickByText("Step into the street");
  await sleep(300);
  for (let i = 0; i < 160; i++) {
    const up = await evalJs(`!!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Take the 70%"))`);
    if (up) break;
    await sleep(250);
  }
  await clickByText("Refuse");
  await sleep(300);
  await clickByText("Open the shutters"); // shutters gate → Day 1
}

// ── Scenario: the 5-day run (video + shots both start here) ────────────────
const s = (label) => sleep(label); // dwell

/**
 * The 90-second path: defer Harborne on day 1, leave the bill on day 2.
 * The week ends there. "Close the books" is on screen, unclicked.
 */
async function playToDay5Closed() {
  await reachTheStall(); await s(800);
  await clickByText("Leave it for tomorrow"); await s(2800); // Day 1: defer the £2,400 already on the street
  await clickByText("Next day"); await s(3400);
  await clickByText("Leave the bill"); await s(2800); // Day 2: the till answers the same day
  await s(600);
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
    if (SEG === "v3") {
      // Trailer script v3 (docs/game/TRAILER_SCRIPT.md): prologue → day-1
      // defer → day-2 bill → [souq frame inserted in post] → debrief → title.
      // The mark() log gives the mux pass the exact souq-insert timestamp.
      const mark = (name) => console.log(`[v3 t=${((Date.now() - t0) / 1000).toFixed(1)}s] ${name}`);
      const pollFor = async (needle) => {
        for (let i = 0; i < 160; i++) {
          const up = await evalJs(`!!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes(${JSON.stringify(needle)}))`);
          if (up) return;
          await s(250);
        }
        throw new Error(`poll timeout: "${needle}"`);
      };
      await s(4000); // title card
      await clickByText("Begin — sound on"); await s(1500);
      await clickByText("London"); await s(1200);
      await clickIf("Skip"); await s(900);
      await clickByText("Step into the street"); await s(1800);
      await pollFor("Take the 70%");
      await s(6000); // hold on the Shark's three buttons
      mark("offer");
      await clickByText("Refuse"); await s(2200);
      await clickByText("Open the shutters"); // shutters gate
      await pollFor("Leave it for tomorrow");
      await s(4500); // Day 1 — the street reads £2,400
      await clickByText("Leave it for tomorrow");
      await s(5000); // Zana's bark, a stall lights
      await clickByText("Next day");
      await pollFor("Leave the bill");
      await s(7000); // Day 2 — the bill is due
      await clickByText("Leave the bill");
      await s(4500); // the till answers the same morning
      mark("souq-insert-point");
      await clickByText("Close the books");
      await s(9000); // debrief — the street's number
      await clickByText("The two prices"); await s(6000);
    } else if (SEG === "s") {
      // One Souq frame, per the v3 script: "Do not play the week again."
      // Empirical order: pick السوق → the bilingual title card (remedy AND
      // the zakat label, in Arabic, with AED figures) → the narrated
      // cinematic → the story card → Day 1 in dirhams.
      const pollFor = async (needle) => {
        for (let i = 0; i < 160; i++) {
          const up = await evalJs(`!!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes(${JSON.stringify(needle)}))`);
          if (up) return;
          await s(250);
        }
        throw new Error(`poll timeout: "${needle}"`);
      };
      await s(2500); // title card
      await clickByText("Begin — sound on"); await s(1500);
      await clickByText("السوق"); await s(1500);
      await pollFor("Open the shutters"); // the souq title card: remedy + zakat
      await s(3000); // hold the bilingual card
      console.log("[souq card]", await evalJs("JSON.stringify(Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Open the shutters')).map(b => ({ vis: b.offsetParent !== null, dis: b.disabled, cls: b.className })))"));
      await clickByText("Open the shutters"); await s(1500);
      await clickIf("Skip"); // the narrated cinematic
      // Post-cinematic: headless souq lands on Day 1 directly; a story
      // card (when the runtime shows one) is clicked through either way.
      for (let i = 0; i < 160; i++) {
        const st = await evalJs(`(() => {
          const bs = Array.from(document.querySelectorAll("button"));
          const step = bs.find((b) => b.textContent.includes("Step into the street"));
          if (step) { step.click(); return "step"; }
          const defer = bs.find((b) => b.textContent.includes("Leave it for tomorrow"));
          if (defer) return "day1";
          return "";
        })()`);
        if (st === "day1") break;
        await s(250);
      }
      await s(5000); // Day 1 in the souq — AED, Arabic VO text
    } else if (SEG === "b") {
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
    await s(6800); // debrief — the street's number
    await clickByText("The two prices");
    await s(5600); // the two prices, bias named only if the pair split
    await clickByText("When an invoice falls due"); // → chapter 2
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
  const shot = (name) => send("Page.captureScreenshot", { format: "png" }).then(async (r) => {
    const p = join(OUT, name);
    writeFileSync(p, Buffer.from(r.data, "base64"));
    const label = await evalJs(`JSON.stringify({ h: (document.querySelector("h3")||{}).textContent||"", cine: !!document.querySelector(".lm-cine"), pick: !!document.querySelector("#market-pick") })`);
    console.log(`screenshot → ${p}  ${label}`);
  });
  await s(2600);
  await shot("v3_title.png");
  await clickByText("Begin — sound on"); await s(900);
  await shot("v3_market_pick.png"); // both lawful markets on the table
  await clickIf("London"); await s(600);
  await shot("v3_after_begin.png"); // cinematic bridge
  await clickIf("Skip"); await s(1200);
  await shot("v3_cold_open.png"); // the story card — Siki's stakes, Zana's intro
  await clickByText("Step into the street"); await s(1200); // story card → the Shark takes the stage
  await shot("v3_welcome_done.png");
  // The Shark's offer lands after several voiced beats — poll for it.
  for (let i = 0; i < 160; i++) {
    const up = await evalJs(`!!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Take the 70%"))`);
    if (up) break;
    await s(250);
  }
  await shot("v3_shark_offer.png"); // the prologue decision, before the answer
  await clickByText("Refuse"); await s(1200);
  await shot("v3_shark_refused.png");
  await clickByText("Open the shutters"); await s(1500); // ch1's own gate before Day 1
  await shot("v3_day1_stall.png"); // £2,400 still on the street, Harborne already late
  // Day-1 choices land after the cold-open beats — poll for the defer button.
  for (let i = 0; i < 160; i++) {
    const up = await evalJs(`!!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Leave it for tomorrow"))`);
    if (up) break;
    await s(250);
  }
  const cap = async (label) => { const t = await evalJs(`[...document.querySelectorAll("#street-slot .lm-stall")].map(s=>s.dataset.kind+"="+s.className.replace("lm-stall ","")).join(" ")`); console.log(`[stalls ${label}] ${t}`); };
  await clickByText("Leave it for tomorrow"); await s(2600);
  await cap("d1");
  await shot("v3_day1_defer.png");
  await clickByText("Next day"); await s(3200);
  await shot("v3_day2_bill.png");
  await clickByText("Leave the bill"); await s(2600);
  await cap("d2");
  await clickByText("Close the books");
  await s(4200);
  await shot("v3_debrief_street.png");
  await clickByText("The two prices"); await s(4200);
  await shot("v3_debrief_named.png"); // the two prices, bias named if the pair split
}

// ── Souq shots: the trailer's "one frame" of the other lawful market ──────
// The v3 trailer beat 4 says "one frame: dirhams, and the zakat line" —
// these stills become a ~14 s zoompan segment in the mux pass. Kept as a
// shots-style run (no 10 fps loop): the continuous-capture load is what
// makes headless flake on the souq path (compositor/network crashes).
async function souqShots() {
  mkdirSync(OUT, { recursive: true });
  const shot = (name) => send("Page.captureScreenshot", { format: "png" }).then((r) => {
    const p = join(OUT, name);
    writeFileSync(p, Buffer.from(r.data, "base64"));
    console.log(`screenshot → ${p}`);
  });
  const pollFor = async (needle) => {
    for (let i = 0; i < 160; i++) {
      const up = await evalJs(`!!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes(${JSON.stringify(needle)}))`);
      if (up) return;
      await s(250);
    }
    throw new Error(`poll timeout: "${needle}"`);
  };
  await s(2500);
  await clickByText("Begin — sound on"); await s(1500);
  await clickByText("السوق"); await s(1500);
  await pollFor("Open the shutters"); // gate 1: the market-pick detail card
  await s(3000); // let the Arabic VO take land as text
  await shot("v3_souq_card.png");
  // The souq path stacks gates: the pick's detail card → the narrated
  // cinematic → the bilingual title card (its own "Open the shutters") →
  // the story card → Day 1. Click whichever gate is up until the day
  // screen appears — each card is a one-click advance.
  for (let i = 0; i < 200; i++) {
    const st = await evalJs(`(() => {
      const bs = Array.from(document.querySelectorAll("button"));
      const defer = bs.find((b) => b.textContent.includes("Leave it for tomorrow"));
      if (defer) return "day1";
      const skip = bs.find((b) => b.textContent.includes("Skip"));
      const step = bs.find((b) => b.textContent.includes("Step into the street"));
      if (step) { step.click(); return "step"; }
      if (skip) { skip.click(); return "skip"; }
      const shut = bs.find((b) => b.textContent.includes("Open the shutters"));
      if (shut) { shut.click(); return "shut"; }
      return "";
    })()`);
    if (st === "day1") break;
    await s(700);
  }
  await s(3000); // Day 1 in the souq — AED figures, Arabic VO text
  await shot("v3_souq_day1.png");
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
  await reachTheStall(); await s(800);
  // ch1 — chase day 1 so the bill is payable, pay it, defer the last Harborne
  await clickByText("Chase"); await s(2200);
  await clickByText("Next day"); await s(2600);
  await clickByText("Pay"); await s(2200);
  await clickByText("Next day"); await s(2600);
  await clickByText("Leave it for tomorrow"); await s(2200);
  await clickByText("Close the books"); await s(3200);
  await clickByText("The two prices"); await s(2600);
  await clickByText("When an invoice falls due"); await s(3000); // ch2 intro
  await clickByText("Walk into the office"); await s(2600);
  // run 1 → Factor teaser → run 2 → run 3 (auto-advance) → Collector probe
  await evalJs("(() => { const i = document.querySelector('input[type=number]'); if (i) { i.value = '900'; i.dispatchEvent(new Event('input')); } return true; })()");
  await clickByText("Set the floor"); await s(2200);
  await clickByText("Accept"); await s(2200);
  await clickByText("Wave him off"); await s(2600); // Factor teaser → run 2
  await evalJs("(() => { const i = document.querySelector('input[type=number]'); if (i) { i.value = '900'; i.dispatchEvent(new Event('input')); } return true; })()");
  await clickByText("Set the floor"); await s(2200);
  await clickByText("Accept"); await s(2200); // run 2 clears → run 3 opens
  await evalJs("(() => { const i = document.querySelector('input[type=number]'); if (i) { i.value = '900'; i.dispatchEvent(new Event('input')); } return true; })()");
  await clickByText("Set the floor"); await s(2200);
  await clickByText("Accept"); await s(2200); // run 3 clears → the Collector
  // Collector probe — take the Factor's money in ch3 later; here: decline
  await clickByText("Decline"); await s(2600);
  await clickByText("Continue"); await s(2600);
  await clickByText("Next chapter"); await s(2600); // ch3 intro
  await clickByText("Open the account"); await s(2600);
  await clickByText("Keep the line going"); await s(2200);
  await clickByText("Stop work on this account"); await s(2200); // walk → street offers
  await clickByText("Take the Factor's money"); await s(2200); // → the Shark smiles
  await clickByText("Decline"); await s(2600); // Shark → debrief beat 1
  await clickByText("Continue"); await s(2600); // → the sunk-cost beat
  await clickByText("To the finale"); await s(3000);
  // FINALE
  await shot("v3_finale_close.png"); // "You Were the Experiment" + street
  await clickByText("Let the market close"); await s(4000);
  await shot("v3_finale_market_closed.png");
  await clickByText("Your week in one line"); await s(2600);
  await shot("v3_finale_profile.png"); // the week in one line
  await clickByText("See the cost"); await s(2600);
  await shot("v3_finale_cost.png"); // Cost of Not Acting
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
    // >640ms: the daybreak veil delays the next day by design.
    await sleep(950);
  };
  const dayHeading = () => evalJs(`(document.querySelector("#ch1 .lm-day h3")||{}).textContent||""`);

  await sleep(2200);
  await reachTheStall(); await sleep(600);
  const fit = await evalJs(`(() => {
    const c = document.querySelector("#ch1 .lm-choices");
    const stalls = document.querySelector(".lm-street-stalls");
    const tally = document.querySelector(".lm-street-tally");
    const cr = c ? c.getBoundingClientRect() : { bottom: 9999 };
    const sr = stalls ? stalls.getBoundingClientRect() : { height: 0 };
    return {
      choiceBottom: Math.round(cr.bottom),
      stallH: Math.round(sr.height),
      tally: (tally && tally.textContent) || "",
      lecture: document.body.innerText.includes("can't prove"),
    };
  })()`);
  check(fit && fit.choiceBottom <= 860, "day-1 choices sit inside 860px", JSON.stringify(fit));
  check(fit && fit.stallH >= 100, "stalls read as a street", JSON.stringify(fit));
  check(fit && /still on the street|to the street/.test(fit.tally) && !fit.tally.includes("so far"), "street money is one line", fit && fit.tally);
  check(fit && /2,400/.test(fit.tally), "day 1 opens on Harborne's £2,400", fit && fit.tally);
  check(fit && fit.lecture === false, "the confession line is gone");

  const caps = await evalJs(`[...document.querySelectorAll("#ch1 .lm-choice")].map((b) => (b.dataset.key || "-") + ":" + (b.querySelector(".lm-choice-label") || {}).textContent)`);
  check(Array.isArray(caps) && caps.length >= 2 && caps.every((c) => /^[1-9]:/.test(c)), "visible choices carry 1..n keycaps", JSON.stringify(caps));
  const prog = await evalJs(`(document.querySelector(".lm-progress") || {}).textContent || ""`);
  check(/Chapter 1 of 3/.test(prog) && /The Stall/.test(prog), "the run's shape is on screen", prog);

  await press("1", "Digit1", 49);
  check(/Day 1 closed/.test(await dayHeading()), "key 1 resolves the day");
  await press("Enter", "Enter", 13);
  check(/Day 2 of 3/.test(await dayHeading()), "Enter takes a lone choice");

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
  await pick("Pay");
  await pick("Next day");
  await pick("Leave it for tomorrow", 1200);
  await pick("Close the books");
  await pick("The two prices");
  await pick("When an invoice falls due", 2200);
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
  else if (mode === "souqshots") await souqShots();
  else await finale();
} catch (e) {
  console.error("scenario failed:", e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill("SIGKILL");
  server.close();
  // Chrome releases the profile a moment after SIGKILL. A leftover temp dir
  // is not a failed run.
  await new Promise((r) => setTimeout(r, 400));
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* profile still held */ }
}
