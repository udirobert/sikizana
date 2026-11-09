/**
 * The Late Market — entry point.
 * Boot order: title flow → Web Audio unlock gesture → chapters 1→2→3.
 * All persistence is localStorage-only (privacy rails, docs/game/GDD.md):
 * the decision ledger + street counters live in the browser, clearable from
 * the title screen, never transmitted anywhere.
 */
import "./styles/tokens.css";
import { AudioBus } from "./audio/bus";
import { DecisionLedger } from "./engine/ledger";
import { runChapter1 } from "./chapters/ch1screen";
import type { Ch1State } from "./chapters/ch1";
import { runChapter2 } from "./chapters/ch2screen";
import { runChapter3 } from "./chapters/ch3screen";
import { renderStreet as renderStreetRow, type StreetCounters } from "./ui/street";
import type { LedgerEntry } from "./engine/ledger";

const start = document.getElementById("start") as HTMLElement;
const game = document.getElementById("game") as HTMLElement;

const LEDGER_KEY = "lm.ledger.v1";
const CH1_SAVE_KEY = "lm.ch1.v1";

function loadLedger(): DecisionLedger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? DecisionLedger.deserialize(raw) : new DecisionLedger();
  } catch {
    return new DecisionLedger();
  }
}

function loadCh1Save(): Ch1State | null {
  try {
    const raw = localStorage.getItem(CH1_SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Ch1State;
    return s && typeof s.day === "number" && Array.isArray(s.invoices) ? s : null;
  } catch {
    return null;
  }
}

const bus = new AudioBus();
const ledger = loadLedger();

/** One spoken line at a time — the speech grows, Bookkeeper-style. */
function say(speaker: "siki" | "zana", text: string): void {
  for (const old of Array.from(game.querySelectorAll(":scope > p.lm-line"))) old.remove();
  const bubble = document.createElement("p");
  bubble.className = `lm-line ${speaker}`;
  bubble.textContent = text;
  bubble.setAttribute("role", "note");
  game.prepend(bubble);
}

function saveLedger(): void {
  try { localStorage.setItem(LEDGER_KEY, ledger.serialize()) } catch { /* private-mode: in-memory only */ }
}

/** Title-screen purge (privacy rail: players scrub before sharing). */
function purgeSave(): void {
  localStorage.removeItem(LEDGER_KEY);
  localStorage.removeItem(CH1_SAVE_KEY);
}

const SEED = 20261109; // jam build: one canonical run for judging

/** ── The street — defer/pay/fees drive the stalls (GDD §2 step 2). ── */
function streetCounters(): StreetCounters {
  const all = ledger.all();
  let toStreet = 0;
  for (const e of all) if (e.npc?.feePaid) toStreet += e.npc.feePaid;
  const deferrals =
    all.filter((e) => e.chapter === 1 && e.deferred).length +
    all.filter((e) => e.chapter === 3 && e.deferred).length;
  const collected =
    all.filter((e) => e.chapter === 1 && e.chosenOptionId === "chase_now").length +
    all.filter((e) => e.chapter === 2 && e.experimentId.startsWith("ch2_anchor") && e.chosenOptionId === "accept").length;
  return { toStreet, deferrals, collected };
}

function renderStreet(): void {
  const slot = document.getElementById("street-slot");
  if (slot) slot.replaceChildren(renderStreetRow(streetCounters()));
}

/** Chapter sequence — one shared frame, nothing resets between chapters. */
function beginChapter(n: 1 | 2 | 3): void {
  const root = document.querySelector<HTMLElement>(`#ch${n}`) ?? (() => {
    const r = document.createElement("section");
    r.className = "lm-chapter";
    r.id = `ch${n}`;
    game.append(r);
    return r;
  })();
  for (const s of game.querySelectorAll("section.lm-chapter")) (s as HTMLElement).hidden = s.id !== `ch${n}`;

  if (n === 1) {
    runChapter1(
      {
        root,
        record: (e: Omit<LedgerEntry, "id">) => { ledger.record(e); saveLedger(); renderStreet(); },
        pairEntries: () => ledger.all().filter((e) => e.chapter === 1 && e.experimentId === "ch1_present_pair_a"),
        say,
        save: (s: Ch1State) => { try { localStorage.setItem(CH1_SAVE_KEY, JSON.stringify(s)); } catch { /* private-mode */ } },
        onTool: () => {
          localStorage.removeItem(CH1_SAVE_KEY); // chapter closed — the run is done
          document.dispatchEvent(new CustomEvent("lm:chapter-done", { detail: 1 }));
        },
      },
      SEED,
      loadCh1Save(),
    );
  }
  if (n === 2) {
    runChapter2(
      {
        root,
        record: (e: Omit<LedgerEntry, "id">) => { ledger.record(e); saveLedger(); renderStreet(); },
        pairEntries: () => ledger.all().filter((e) => e.chapter === 2 && e.experimentId.startsWith("ch2_anchor")),
        say,
        onTool: () => document.dispatchEvent(new CustomEvent("lm:chapter-done", { detail: 2 })),
      },
      SEED + 1,
    );
  }
  if (n === 3) {
    runChapter3({
      root,
      record: (e: Omit<LedgerEntry, "id">) => { ledger.record(e); saveLedger(); renderStreet(); },
      say,
      onTool: () => document.dispatchEvent(new CustomEvent("lm:chapter-done", { detail: 3 })),
    });
  }
}

function begin(withSound: boolean): void {
  if (withSound) bus.unlock();
  start.hidden = true;
  game.hidden = false;

  // Persistent street strip sits above whatever chapter is running.
  const streetSlot = document.createElement("div");
  streetSlot.id = "street-slot";
  game.append(streetSlot);
  renderStreet();

  document.addEventListener("lm:chapter-done", (ev) => {
    const n = (ev as CustomEvent<number>).detail as 1 | 2 | 3;
    if (n === 3) return finale();
    beginChapter((n + 1) as 2 | 3);
  });

  // Dev/trailer jump: ?ch=2 starts mid-board without the 20-day replay.
  const jump = Number(new URLSearchParams(location.search).get("ch") ?? 1);
  beginChapter((([1, 2, 3].includes(jump) ? jump : 1) || 1) as 1 | 2 | 3);
}

/** Finale placeholder (Thu's milestone): honest quiet card, no fake maths. */
function finale(): void {
  say("siki", "Market close comes with the next build. The ledger you wrote is safe — and so is the street's arithmetic. Review it while you wait.");
  const review = document.createElement("section");
  review.id = "finale";
  review.append(
    Object.assign(document.createElement("div"), { className: "lm-surface", textContent: `${ledger.all().length} recorded decisions · to the street: £${[0, ...ledger.all().map((e) => e.npc?.feePaid ?? 0)].reduce((a, b) => a + b).toFixed(0)}` }),
  );
  game.append(review);
  for (const s of game.querySelectorAll("section.lm-chapter")) (s as HTMLElement).hidden = true;
}

document.getElementById("start-btn")?.addEventListener("click", () => begin(true));
document.getElementById("start-muted")?.addEventListener("click", () => begin(false));
document.getElementById("purge-save")?.addEventListener("click", purgeSave);

export {};
