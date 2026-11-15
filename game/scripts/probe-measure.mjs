#!/usr/bin/env node
// One-off measure: section heights on day 1, ledger open vs collapsed.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const PORT = 8798;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp3": "audio/mpeg", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}/`).pathname);
  if (p === "/") p = "/index.html";
  const file = join(DIST, p);
  if (!file.startsWith(DIST) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const PROFILE = `/tmp/lm-measure-${process.pid}`;
rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT + 2}`,
  `--user-data-dir=${PROFILE}`, "about:blank",
], { stdio: ["ignore", "pipe", "inherit"] });
let ws = null;
const deadline = Date.now() + 30000;
while (!ws && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 300));
  try {
    const res = await fetch(`http://127.0.0.1:${PORT + 2}/json/list`);
    const page = (await res.json()).find((t) => t.type === "page");
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
});
const send = (method, params = {}) => new Promise((res, rej) => { ws.send(JSON.stringify({ id: ++seq, method, params })); pending.set(seq, { res, rej }); });
const evalJs = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
await sleep(1500);
await evalJs("localStorage.clear()");
await send("Page.reload");
await sleep(1500);
const click = async (n) => evalJs(`(() => { const bs = Array.from(document.querySelectorAll("button")).filter((x) => x.textContent.includes(${JSON.stringify(n)})); const b = bs.find((x) => x.offsetParent !== null) ?? bs[0]; if (!b) return "MISSING"; b.click(); return "ok"; })()`);
const poll = async (n) => { for (let i = 0; i < 160; i++) { const up = await evalJs(`!!Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes(${JSON.stringify(n)}))`); if (up) return; await sleep(250); } throw new Error("poll " + n); };
const measure = (label) => evalJs(`JSON.stringify((() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return Math.round(b.height); };
  return { label: ${JSON.stringify(label)},
    scrollH: document.documentElement.scrollHeight,
    streetSlot: r("#street-slot"), till: r("#ch1 .lm-till"), day: r("#ch1 .lm-day"),
    dayKids: Array.from(document.querySelectorAll("#ch1 .lm-day > *")).map((e) => e.className + ":" + Math.round(e.getBoundingClientRect().height)).join(" "),
    popH: r("#ch1 .lm-ledger-pop") ?? 0,
    ledger: 0, ledgerOpen: !!document.querySelector(".lm-ledger-pop:not([hidden])"), ledgerPop: r("body > .lm-ledger-pop") };
})())`);
await click("Begin — sound on");
await click("Skip");
await poll("London");
await click("London");
await poll("Step into the street");
await click("Step into the street");
await poll("Take the 70%");
await click("Refuse");
await poll("Open the shutters");
await click("Open the shutters");
await sleep(2500);
console.log(await measure("day1-open"));
await evalJs(`document.querySelector("#ch1 .lm-till-books")?.click()`);
await sleep(400);
console.log(await measure("day1-collapsed"));
try { ws.close(); } catch {}
chrome.kill("SIGKILL");
server.close();
await new Promise((r) => setTimeout(r, 400));
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
