// Drives the real app and records the human-decides → logged beat.
// Pass 1 warms the Next routes (dev-mode compile) so pass 2 has no spinner.
import { chromium } from "/Users/udingethe/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
import fs from "node:fs";

const EXE = "/Users/udingethe/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/" +
  "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BOOKS = "http://localhost:3000/books?flow=check";
const OUT = "/tmp/rec";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });

const cardOf = (p) => p.locator("aside li", { hasText: "Bean There" }).first();

// ---- pass 1: warm every route we will visit --------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BOOKS, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  console.log("probe card:", await cardOf(page).count());
  await page.goto("http://localhost:3000/activity", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await ctx.close();
}

// ---- pass 2: record ---------------------------------------------------------
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
await page.goto(BOOKS, { waitUntil: "domcontentloaded" });

const card = cardOf(page);
await card.waitFor({ state: "visible", timeout: 45000 });
await page.waitForTimeout(1500);
await card.scrollIntoViewIfNeeded();
await page.waitForTimeout(1000);

const btn = card.locator("button", { hasText: /^Investigate$/ });
const box = await btn.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
await page.waitForTimeout(700);
await btn.click();

const pill = page.locator("a:visible", { hasText: "Logged to audit trail" }).first();
await pill.waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(1700);
const pbox = await pill.boundingBox();
await page.mouse.move(pbox.x + pbox.width / 2, pbox.y + pbox.height / 2, { steps: 20 });
await page.waitForTimeout(700);
await pill.click();

await page.waitForSelector("text=Activity", { timeout: 25000 });
await page.waitForTimeout(2800);
const row = page.locator("text=/investigating/i").first();
if (await row.count()) await row.scrollIntoViewIfNeeded();
await page.waitForTimeout(3000);

const path = await page.video().path();
await ctx.close();
await browser.close();
fs.renameSync(path, `${OUT}/confirm.webm`);
console.log("→", `${OUT}/confirm.webm`);
