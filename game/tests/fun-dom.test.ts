// @vitest-environment jsdom
/**
 * Fun-pass DOM tests — the machine reacts. Runs the real chapter screens in
 * jsdom with stubbed chrome (no voice, no ledger spine, reduced motion), and
 * drives them the way headless Chrome would: click buttons by their text.
 * Math.random is forced so fate is deterministic.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { runChapter3 } from "../src/chapters/ch3screen";
import { runChapter2 } from "../src/chapters/ch2screen";
import { runChapter1 } from "../src/chapters/ch1screen";
import type { LedgerEntry } from "../src/engine/ledger";

vi.stubGlobal("matchMedia", () => ({
  matches: true, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, dispatchEvent: () => false,
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clickByText(root: HTMLElement, needle: string): boolean {
  const b = Array.from(root.querySelectorAll("button"))
    .find((x) => x.textContent?.includes(needle));
  if (!b) return false;
  (b as HTMLButtonElement).click();
  return true;
}

async function clickWait(root: HTMLElement, needle: string, ms = 250): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (clickByText(root, needle)) { await sleep(ms); return; }
    await sleep(150);
  }
  const visible = Array.from(root.querySelectorAll("button")).map((b) => b.textContent?.trim().slice(0, 50));
  throw new Error(`button never appeared: "${needle}" (visible: ${JSON.stringify(visible)})`);
}

beforeEach(() => {
  document.body.innerHTML = "";
  try { localStorage.clear(); } catch { /* noop */ }
});

describe("Ch3 haggle + flip (all four branches)", () => {
  async function reachStreet(rng: number): Promise<{ root: HTMLElement; records: Omit<LedgerEntry, "id">[] }> {
    const root = document.createElement("div");
    document.body.append(root);
    const records: Omit<LedgerEntry, "id">[] = [];
    runChapter3({ root, record: (e) => records.push(e), say: () => {} });
    await clickWait(root, "Open the account");
    for (let i = 0; i < 3; i++) await clickWait(root, "Keep the line going");
    expect(root.textContent).toContain("Push him — one counter");
    vi.spyOn(Math, "random").mockReturnValue(rng);
    return { root, records };
  }

  it("walk + win: door shuts, blood noted, Shark pays double", async () => {
    const { root, records } = await reachStreet(0.0); // die "1" (walk), coin "Heads" (win)
    await clickWait(root, "Push him — one counter", 1800);
    expect(root.textContent).toContain("shuts his door");
    await clickWait(root, "Continue");
    expect(root.textContent).toContain("the Factor talked");
    await clickWait(root, "Counter — double or nothing", 2000);
    expect(root.textContent).toContain("pays double");
    expect(root.textContent).toContain("pride is also a tell");
    await clickWait(root, "Continue");
    expect(root.textContent).toContain("What you put in, and what is left");
    const shark = records.filter((e) => e.experimentId === "ch3_street_shark").pop()!;
    expect(shark.chosenOptionId).toBe("accept");
    expect(shark.optionsShown.some((o) => o.id === "counter_flip")).toBe(true);
    vi.restoreAllMocks();
  }, 30000);

  it("nod + lose: Factor pays up, Shark's daily stands", async () => {
    const { root, records } = await reachStreet(0.9999); // die "6" (nod), coin "Tails" (lose)
    await clickWait(root, "Push him — one counter", 1800);
    expect(root.textContent).toContain("Bold. Lucky. Paid");
    await clickWait(root, "Continue");
    expect(root.textContent).not.toContain("the Factor talked");
    await clickWait(root, "Counter — double or nothing", 2000);
    expect(root.textContent).toContain("daily still stands");
    await clickWait(root, "Continue");
    expect(root.textContent).toContain("What you put in, and what is left");
    const factor = records.filter((e) => e.experimentId === "ch3_street_factor").pop()!;
    expect(factor.chosenOptionId).toBe("accept");
    expect(factor.optionsShown.some((o) => o.id === "haggle")).toBe(true);
    vi.restoreAllMocks();
  }, 30000);
});

describe("Ch2 Collector decline taunt", () => {
  it("declining the probe earns the hat-tip before the debrief", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const records: Omit<LedgerEntry, "id">[] = [];
    runChapter2({
      root,
      record: (e) => { records.push(e); },
      pairEntries: () => records as LedgerEntry[],
      say: (_s, _t, done) => done?.(),
    }, 20261109);
    await clickWait(root, "Walk into the office");
    for (let r = 0; r < 3; r++) {
      await clickWait(root, "Set the floor");
      await clickWait(root, "Accept");
      // The Factor's teaser interrupts between the first sitting and the second.
      if (r === 0) { await clickWait(root, "Wave him off", 1100); }
    }
    for (let i = 0; i < 40; i++) {
      if (root.textContent?.includes("Sell the debt")) break;
      await sleep(150);
    }
    expect(clickByText(root, "Decline")).toBe(true);
    await sleep(300);
    expect(root.textContent).toContain("Debts outlive refusals");
    await clickWait(root, "Continue");
    expect(root.textContent).toContain("floor not set");
  }, 30000);
});

describe("Ch1 clean run + till death", () => {
  function ch1Deps(root: HTMLElement, records: Omit<LedgerEntry, "id">[]): Parameters<typeof runChapter1>[0] {
    return {
      root,
      record: (e) => { records.push(e); },
      // Production filters to the pair experiment (main.ts); the prologue
      // entry must not leak into the debrief's two-row read-back.
      pairEntries: () => records.filter((e) => e.chapter === 1 && e.experimentId === "ch1_present_pair_a") as LedgerEntry[],
      say: (_s, _t, done) => done?.(),
      save: () => {},
      noteStreet: () => {},
      whisper: () => {},
      streetFx: () => {},
      sceneDay: () => {},
    };
  }

  it("chasing everything lights the street gold and skips the question", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const records: Omit<LedgerEntry, "id">[] = [];
    runChapter1(ch1Deps(root, records), 20261109);
    await clickWait(root, "Refuse");
    await clickWait(root, "Open the shutters");
    // Day 1: chase the invoice.
    for (let i = 0; i < 20; i++) {
      if (clickByText(root, "Chase")) break;
      await sleep(200);
    }
    await clickWait(root, "Next day", 900);
    // Day 2: pay the bill.
    await clickWait(root, "Quayline", 900);
    await clickWait(root, "Next day", 900);
    // Day 3: chase again.
    for (let i = 0; i < 20; i++) {
      if (clickByText(root, "Chase")) break;
      await sleep(200);
    }
    await clickWait(root, "Close the books", 900);
    await clickWait(root, "The two prices");
    expect(root.textContent).toContain("The street hates that");
    expect(root.classList.contains("lm-clean-run")).toBe(true);
    expect(root.textContent).not.toContain("Same offer twice");
  }, 60000);

  it("leaving everything dims the street and holds the books shut a beat", async () => {
    // Motion on for this one: the held beat is the behaviour under test.
    vi.stubGlobal("matchMedia", () => ({
      matches: false, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }));
    const root = document.createElement("div");
    document.body.append(root);
    const records: Omit<LedgerEntry, "id">[] = [];
    runChapter1(ch1Deps(root, records), 20261109);
    await clickWait(root, "Refuse");
    await clickWait(root, "Open the shutters");
    await clickWait(root, "Leave it for tomorrow");
    await clickWait(root, "Next day", 900);
    await clickWait(root, "Leave the bill");
    await sleep(400);
    // The death lands: street dimmed, Close held back.
    expect(root.classList.contains("lm-week-dead")).toBe(true);
    expect(clickByText(root, "Close the books")).toBe(false);
    await clickWait(root, "Close the books", 900);
    // Frame 1 names the street's number; the triage line lands in frame 2.
    await clickWait(root, "The two prices");
    expect(root.textContent).toContain("The till ran empty");
    vi.stubGlobal("matchMedia", () => ({
      matches: true, addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }));
  }, 60000);
});
