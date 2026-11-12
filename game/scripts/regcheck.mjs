// One-shot regression check: title screen shows the cover, and "Begin" fully
// hides it (the #start[hidden] regression). Zero deps; Node built-ins only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const PORT = 8799;
const DEBUG = PORT + 2;

const server = http.createServer((req, res) => {
  const file = path.normalize(path.join(DIST, req.url === "/" ? "index.html" : req.url.split("?")[0]));
  if (!file.startsWith(DIST) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const PROFILE = `/tmp/lm-regcheck-${process.pid}`;
fs.rmSync(PROFILE, { recursive: true, force: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG}`, "--disable-gpu", `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });

let ws = null;
const deadline = Date.now() + 30000;
while (!ws && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 300));
  try {
    const targets = await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json();
    const page = targets.find((t) => t.type === "page");
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
}
if (!ws) { console.error("no debug port"); chrome.kill(); server.close(); process.exit(1); }
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
});
const send = (method, params = {}) => new Promise((res, rej) => { ws.send(JSON.stringify({ id: ++seq, method, params })); pending.set(seq, { res, rej }); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.value;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
await new Promise((r) => setTimeout(r, 1500));

const before = await evalJs(`JSON.stringify({ art: !!document.querySelector(".lm-title-art"), panel: !!document.querySelector(".lm-title-panel"), startHidden: document.getElementById("start").hidden })`);
console.log("title state:", before);

await evalJs(`document.getElementById("start-btn").click()`);
await new Promise((r) => setTimeout(r, 600));
// The art is hidden via display:none on #start (it is not removed from the
// DOM), so assert layout-visibility: zero box, not DOM absence.
const after = await evalJs(`JSON.stringify({ startHidden: document.getElementById("start").hidden, artBox: (() => { const a = document.querySelector(".lm-title-art"); return a ? a.getBoundingClientRect() : null; })(), gameVisible: !document.getElementById("game").hidden, dayHeading: document.querySelector("#ch1 h3")?.textContent })`);
console.log("after begin:", after);
const a = JSON.parse(after);
const artHidden = a.artBox === null || (a.artBox.width === 0 && a.artBox.height === 0);
const ok = JSON.parse(before).art && a.startHidden && artHidden && a.gameVisible;
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync("/tmp/regcheck_after.png", Buffer.from(shot.data, "base64"));

console.log(ok ? "REGCHECK PASS" : "REGCHECK FAIL");
chrome.kill();
server.close();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} // Chrome may hold files briefly
process.exit(ok ? 0 : 1);
