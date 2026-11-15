/**
 * Second Week screen driver — procedural scored replay.
 *
 * Mirrors ch1screen's render grammar (till / day panel / choices / street
 * beats / debrief) but keeps its own local state: NO DecisionLedger writes —
 * the mode is a replay, not an experiment, so nothing here feeds the debrief
 * attribution. The contract is intentionally small:
 *
 *   runSecondWeek(deps, seed, saved?)
 *
 *   · deps.root   — the screen root; this run clears and owns it
 *   · deps.say    — audio bus marker (muted-safe; text always)
 *   · deps.noteStreet — street-moving events, SAME shape as Ch1Deps.noteStreet
 *     so main.ts's existing handler works as-is
 *   · deps.save   — persist run state after every resolved day; the caller
 *     owns the storage key and should treat a `done` state as finished
 *     (pass null next time to deal a fresh week)
 *   · deps.onDone — fired when the player closes the read-back
 *
 * Best run persists to localStorage "lm.secondweek.best.v1" (min streetTook),
 * try/catch-wrapped with an in-memory fallback — a private-mode browser never
 * crashes, it just forgets the best between visits.
 */
import "./second-week.css";
import { el, clear, choiceButton } from "../ui/dom";
import { dayTiles } from "../ui/dayTiles";
import { money, isSouq } from "../engine/market";
import type { Speaker } from "../audio/voice";
import { netPosition, type DayEffect } from "./ch1";
import {
  WEEK2_DAYS,
  createWeek,
  dayChoices,
  resolveDay,
  weekSummary,
  type Week2State,
} from "../engine/weekGen";

/** Best-run persistence key — v1, stable across releases of the mode. */
export const BEST_KEY = "lm.secondweek.best.v1";

/** One scored run, as persisted. `streetTook` is the score — lower is better. */
export interface BestRun {
  streetTook: number;
  lawfulPrice: number;
  kept: number;
  /** ISO timestamp of the run that set the best. */
  at: string;
}

/** Minimal storage surface — DOM Storage satisfies it structurally, so tests
 *  can pass a plain mock without jsdom. */
export interface BestStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SecondWeekDeps {
  root: HTMLElement;
  /** Audio bus marker — muted-safe; lines render as text regardless. */
  say: (speaker: Speaker, text: string) => void;
  /** Street-moving events — same shape as Ch1Deps.noteStreet (no ledger here). */
  noteStreet: (ev: { deferral?: boolean; billSkipped?: boolean; collected?: number; lateFee?: number; streetTake?: number; flair?: boolean; held?: number }) => void;
  /** Persist run state after every resolved day (caller owns the key). */
  save: (state: Week2State) => void;
  /** Fired when the player closes the read-back. */
  onDone: () => void;
}

// ── Best-run persistence (localStorage, never fatal) ─────────────────────

const memStore = new Map<string, string>();
let probed = false;
let lsOk = false;

/** Probe once; a browser in private mode falls back to memory for the session. */
function localStorageWorks(): boolean {
  if (probed) return lsOk;
  probed = true;
  try {
    const probeKey = "__lm_secondweek_probe__";
    localStorage.setItem(probeKey, "1");
    localStorage.removeItem(probeKey);
    lsOk = true;
  } catch {
    lsOk = false;
  }
  return lsOk;
}

/** A storage that never throws: localStorage when it works, memory otherwise. */
export function safeStore(): BestStore {
  if (localStorageWorks()) {
    return {
      getItem: (k) => {
        try { return localStorage.getItem(k); } catch { return memStore.get(k) ?? null; }
      },
      setItem: (k, v) => {
        try { localStorage.setItem(k, v); } catch { memStore.set(k, v); }
      },
    };
  }
  return {
    getItem: (k) => memStore.get(k) ?? null,
    setItem: (k, v) => { memStore.set(k, v); },
  };
}

/** Parse the persisted best; any storage failure or corrupt payload → null. */
export function loadBestRun(store: BestStore): BestRun | null {
  let raw: string | null;
  try {
    raw = store.getItem(BEST_KEY);
  } catch {
    return null;
  }
  if (raw === null || raw === "") return null;
  try {
    const v = JSON.parse(raw) as Partial<BestRun>;
    if (typeof v.streetTook !== "number" || !Number.isFinite(v.streetTook)) return null;
    if (typeof v.lawfulPrice !== "number" || !Number.isFinite(v.lawfulPrice)) return null;
    if (typeof v.kept !== "number" || !Number.isFinite(v.kept)) return null;
    return { streetTook: v.streetTook, lawfulPrice: v.lawfulPrice, kept: v.kept, at: typeof v.at === "string" ? v.at : "" };
  } catch {
    return null;
  }
}

/** Record a run, keeping the MINIMUM streetTook. Never throws. */
export function recordBestRun(run: BestRun, store: BestStore): BestRun {
  const prev = loadBestRun(store);
  // Ties keep the earlier best (its `at` is the run that first set it).
  const best = prev !== null && prev.streetTook <= run.streetTook ? prev : run;
  try {
    store.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // Storage is broken — the caller still gets its best back.
  }
  return best;
}

// ── Screen driver ─────────────────────────────────────────────────────────

/**
 * Run the Second Week. `seed` deals the week and is used only when no
 * resumable `saved` state is supplied (a saved run carries its whole week in
 * state — invoices, bill, tallies — so resuming needs nothing else).
 */
export function runSecondWeek(deps: SecondWeekDeps, seed: number, saved: Week2State | null = null): void {
  const root = deps.root;
  clear(root);
  const resume = saved !== null && !saved.done && saved.day > 1 && saved.day <= WEEK2_DAYS ? saved : null;
  const state: Week2State = resume ?? createWeek(seed).state;

  // The ledger is OPEN by default and lives in a drawer beside the decision,
  // never a row in the page: the till's books line is the toggle (mirrors
  // ch1 — same arithmetic, read at a glance), so opening the books moves no
  // layout and adds no scroll.
  const till = el("div", { class: "lm-till lm-till-top", "aria-live": "polite" });
  const dayPanel = el("div", { class: "lm-day" });
  const lantern = el("div", { class: "lm-lantern", "aria-live": "polite", text: "" });
  till.hidden = true;
  lantern.hidden = true;
  // Till first: the money is the first viewport, choices second.
  root.append(till, dayPanel, lantern);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastLantern = 0;

  function persist(): void {
    deps.save(state);
  }

  /** The ledger's cards live in a floating panel, not in the page: opening
   *  the books moves no layout and adds no scrollable overflow. The pop is
   *  a sibling of the camera rig — a transformed ancestor would contain a
   *  fixed panel and defeat it (the fiction-mark precedent). One pop per
   *  chapter; a fresh render hides the other chapters' strays, and the
   *  panel follows its summary on open, close, resize, and chapter switch. */
  let ledgerOpen = true; // the books start open beside the first decision
  const ledgerPop = el("div", { class: "lm-ledger-pop", id: "lm-ledger-pop-week2", role: "region", "aria-label": "The ledger", hidden: true });
  let ledgerPopWired = false;
  /** Show or hide the ledger drawer: a fixed panel beside the decision, so
   *  the books never move layout or add scroll. A fresh render hides the
   *  other chapters' strays; hiding the chapter hides its drawer. */
  function syncLedgerPop(): void {
    document.querySelectorAll(".lm-ledger-pop").forEach((p) => {
      if (p !== ledgerPop) (p as HTMLElement).hidden = true;
    });
    ledgerPop.hidden = !ledgerOpen || root.hidden;
    if (!ledgerPop.hidden && !ledgerPop.isConnected) document.body.append(ledgerPop);
  }
  function wireLedgerPop(): void {
    if (ledgerPopWired) return;
    ledgerPopWired = true;
    new MutationObserver(syncLedgerPop).observe(root, { attributes: true, attributeFilter: ["hidden"] });
  }

  /** Week progress tiles — five days have a shape, not just a count. */
  function weekDots(day: number): HTMLElement {
    return dayTiles(day, WEEK2_DAYS);
  }

  /** Face that is due and still unchased — what the street is holding. */
  function heldFace(): number {
    return state.invoices
      .filter((inv) => inv.paidDay === null && inv.chasedDay === null && inv.dueDay <= state.day)
      .reduce((sum, inv) => sum + inv.principal, 0);
  }

  /** Redraw till + ledger + lantern from state. The street is main's. */
  function renderChrome(pop = false): void {
    const day = state.day;
    const billOwed = state.bill.skippedDay !== null && state.bill.paidDay === null;
    const owed = billOwed ? state.bill.amount + state.lateFees : 0;
    const net = netPosition(state);
    const rows = el("div", { class: "lm-till-rows" });
    // One number when nothing is owed (F7 cohesion with Ch.1): Cash == In hand.
    if (billOwed) {
      rows.append(el("div", { class: "lm-till-row" },
        el("span", { class: "lm-till-line-label", text: "Cash" }),
        el("span", { class: "lm-till-line-val", text: money(state.cash, 0) })));
      rows.append(el("div", { class: "lm-till-row lm-till-row-debt" },
        el("span", { class: "lm-till-line-label", text: `Owed to ${state.bill.client}` }),
        el("span", { class: "lm-till-line-val", text: `− ${money(owed, 0)}` })));
    }
    rows.append(el("div", { class: "lm-till-row lm-till-row-net" },
      el("span", { class: "lm-till-line-label", text: "In hand" }),
      el("span", { class: `lm-till-num lm-till-line-val${pop ? " lm-pop" : ""}`, text: money(net, 0) })));
    till.replaceChildren(el("span", { class: "lm-till-cap", text: "The till" }), rows);
    if (net < 0) till.append(el("span", { class: "lm-till-warn", text: "▼ in hand runs red" }));
    till.classList.toggle("lm-till-neg", net < 0);
    // The books line IS the ledger toggle: one row carries the state and
    // opens the detail, so no expandable row ever extends the page.
    {
      const live = state.invoices.filter((i) => i.paidDay === null || i.paidDay > state.day);
      const face = live.reduce((s, i) => s + i.principal, 0);
      const late = live
        .filter((i) => i.dueDay < state.day && i.chasedDay === null)
        .reduce((s, i) => s + i.principal, 0);
      const billLive = state.bill.paidDay === null && !(state.bill.skippedDay !== null && state.bill.paidDay !== null);
      const bits: string[] = [];
      if (face > 0) bits.push(`owed to you ${money(face)}`);
      if (late > 0) bits.push(`${money(late)} late`);
      if (billLive) bits.push(`you owe ${state.bill.client} ${money(state.bill.amount)}`);
      if (bits.length) {
        const ledgerToggle = el("button", {
          class: "lm-till-books", type: "button",
          "aria-expanded": String(ledgerOpen), "aria-controls": "lm-ledger-pop-week2",
        },
          el("span", { text: bits.join(" · ") }),
          el("span", { class: "lm-till-books-mark", "aria-hidden": "true", text: ledgerOpen ? "▴" : "▾" }),
        );
        const syncToggle = (): void => {
          ledgerToggle.setAttribute("aria-expanded", String(ledgerOpen));
          const mark = ledgerToggle.querySelector(".lm-till-books-mark");
          if (mark) mark.textContent = ledgerOpen ? "▴" : "▾";
        };
        ledgerToggle.addEventListener("click", () => {
          ledgerOpen = !ledgerOpen;
          syncToggle();
          syncLedgerPop();
        });
        ledgerToggle.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && ledgerOpen) {
            ledgerOpen = false;
            syncToggle();
            syncLedgerPop();
          }
        });
        till.append(ledgerToggle);
      } else {
        // Nothing live: no toggle, and a stray open state dies here.
        ledgerOpen = false;
      }
    }

    clear(ledgerPop);
    for (const inv of state.invoices) {
      if (inv.paidDay !== null && inv.paidDay < day) continue; // collected — off the strip
      let status: string;
      if (inv.chasedDay !== null && inv.paidDay !== null) {
        const dd = inv.paidDay - day;
        status = dd === 0
          ? "pays today"
          : inv.paidDay <= WEEK2_DAYS
            ? `pays in ${dd} day${dd === 1 ? "" : "s"}`
            : "pays after this week";
      } else if (inv.dueDay < day) {
        const n = day - inv.dueDay;
        status = `${n} day${n === 1 ? "" : "s"} late · ${money(inv.principal)} still not in the till`;
      } else if (inv.dueDay === day) {
        status = "due today";
      } else {
        status = `due day ${inv.dueDay}`;
      }
      ledgerPop.append(
        el("div", { class: `lm-inv-card${inv.chasedDay !== null ? " lm-inv-chased" : " lm-inv-overdue"}`, "data-inv": inv.id },
          el("span", { class: "lm-inv-client", text: inv.client }),
          el("span", { class: "lm-inv-amt", text: money(inv.principal) }),
          el("span", { class: `lm-inv-status${inv.dueDay < day && inv.chasedDay === null ? " lm-inv-bleed" : ""}`, text: status }),
        ),
      );
    }
    if (state.bill.paidDay === null && state.bill.skippedDay === null && day <= state.bill.dueDay) {
      ledgerPop.append(
        el("div", { class: "lm-inv-card lm-inv-bill" },
          el("span", { class: "lm-inv-client", text: `${state.bill.client} (your bill)` }),
          el("span", { class: "lm-inv-amt", text: money(state.bill.amount) }),
          el("span", { class: "lm-inv-status", text: `pay day ${state.bill.dueDay}` }),
        ),
      );
    } else if (state.bill.skippedDay !== null && state.bill.paidDay === null) {
      const owedNow = state.bill.amount + state.lateFees;
      ledgerPop.append(
        el("div", { class: "lm-inv-card lm-inv-bill lm-inv-dead" },
          el("span", { class: "lm-inv-client", text: `${state.bill.client} (your bill)` }),
          el("span", { class: "lm-inv-amt", text: money(owedNow) }),
          el("span", { class: "lm-inv-status", text: `unpaid — ${money(state.bill.lateFee)}/day late charge · growing` }),
        ),
      );
    }

    wireLedgerPop();
    syncLedgerPop();

    lantern.hidden = true;
    const lanternNow = state.streetTake;
    lantern.textContent = lanternNow > 0 ? `· ${money(lanternNow, 0)} ·` : "";
    if (lanternNow > lastLantern) {
      lantern.classList.remove("lm-lantern-pulse");
      void lantern.offsetWidth; // restart the animation
      lantern.classList.add("lm-lantern-pulse");
    }
    lastLantern = lanternNow;
    deps.noteStreet({ held: heldFace() });
  }

  /** Dusk→dawn veil between days — reduced motion skips it (ch1's rule). */
  function dayBreak(next: () => void): void {
    if (reducedMotion) { next(); return; }
    const veil = el("div", { class: "lm-daybreak", "aria-hidden": "true" });
    document.body.append(veil);
    window.setTimeout(() => { veil.remove(); next(); }, 640);
  }

  function dayHint(day: number): string {
    const parts: string[] = [];
    const landing = state.invoices
      .filter((i) => i.paidDay === day)
      .reduce((sum, i) => sum + i.principal, 0);
    if (landing > 0) parts.push(`${money(landing)} landed this morning.`);
    if (state.bill.dueDay === day && state.bill.paidDay === null && state.bill.skippedDay === null) {
      parts.push(`${state.bill.client} ${money(state.bill.amount)} due today.`);
    }
    const due = state.invoices
      .filter((i) => i.dueDay <= day && i.paidDay === null && i.chasedDay === null && i.deferredDay === null)
      .sort((a, b) => a.dueDay - b.dueDay)[0];
    if (due) {
      parts.push(due.dueDay < day
        ? `${due.client} is ${day - due.dueDay} day${day - due.dueDay === 1 ? "" : "s"} late.`
        : `${due.client} falls due today.`);
    }
    if (!parts.length) parts.push(day === WEEK2_DAYS ? "Last day. Whatever still waits goes to the street." : "A quieter day — the books can wait, or they can't.");
    return parts.join(" ");
  }

  function showDay(): void {
    if (state.done) return summary();
    const day = state.day;
    dayPanel.classList.remove("lm-street-beat", "lm-debrief");
    renderChrome();
    till.hidden = false;
    lantern.hidden = false;
    root.append(till, dayPanel, lantern);
    const choices = dayChoices(state, day);
    clear(dayPanel);
    dayPanel.append(
      el("h3", { "aria-label": `Day ${day} of ${WEEK2_DAYS}` },
        `Day ${day} of ${WEEK2_DAYS}`, weekDots(day)),
      el("p", { class: "lm-hint", text: dayHint(day) }),
      el("div", { class: "lm-choices" },
        ...choices.map((c) => {
          const b = choiceButton(c.label, c.detail, () => pick(c.id));
          b.classList.add(`lm-kind-${c.kind}`);
          if (c.kind === "chase" || c.kind === "pay_bill") b.classList.add("lm-choice-primary");
          else if (c.kind === "defer" || c.kind === "skip_bill") b.classList.add("lm-choice-trap");
          else b.classList.add("lm-choice-quiet");
          return b;
        }),
      ),
    );
  }

  function pick(choiceId: string): void {
    if (state.done || state.day > WEEK2_DAYS) return;
    const { effects } = resolveDay(state, state.day, choiceId);
    deps.noteStreet({
      streetTake: effects.lanternDelta,
      lateFee: effects.lateFeeDelta,
      deferral: effects.streetNote === "deferral",
      billSkipped: effects.streetNote === "bill_skipped",
      collected: effects.collected,
    });
    finishDay(effects);
  }

  function finishDay(effects: DayEffect): void {
    clear(root);
    root.append(till, dayPanel, lantern);
    renderChrome(true);
    if (effects.cashDelta > 0) till.classList.add("lm-till-glow");

    clear(dayPanel);
    const streetBeat = effects.streetNote === "deferral" || effects.streetNote === "bill_skipped";
    const streetFigure = (effects.lanternDelta > 0 ? effects.lanternDelta : 0) + (effects.lateFeeDelta > 0 ? effects.lateFeeDelta : 0);
    const figure = effects.cashDelta !== 0
      ? (effects.cashDelta > 0 ? `+${money(effects.cashDelta, 0)}` : `−${money(-effects.cashDelta, 0)}`)
      : null;
    if (streetBeat) {
      const beatArt = effects.streetNote === "bill_skipped" ? "assets/sprites/parchment.png" : "assets/sprites/factor.png";
      dayPanel.classList.add("lm-street-beat");
      dayPanel.append(
        el("div", { class: "lm-beat-head" },
          el("img", { class: "lm-beat-art", src: beatArt, alt: "", "aria-hidden": "true" }),
          el("div", { class: "lm-beat-titles" },
            el("h3", { text: effects.streetNote === "bill_skipped" ? "The bill stays." : "You left it." }),
            ...(streetFigure > 0 ? [el("p", { class: "lm-take", text: money(streetFigure, 0) })] : []),
          ),
        ),
      );
    } else {
      const log = el("ul", { class: "lm-day-log" });
      for (const l of effects.lines) log.append(el("li", { text: l }));
      if (effects.lateFeeDelta > 0) {
        log.append(el("li", { class: "lm-latefee", text: `${money(effects.lateFeeDelta)} to the street — late charge on the unpaid bill` }));
      }
      dayPanel.append(
        el("h3", { text: `Day ${effects.day} closed` }),
        ...(figure ? [el("p", { class: "lm-take", text: figure })] : []),
        ...(log.childElementCount ? [log] : []),
      );
    }
    if (state.done) {
      // The death lands here too: the street dims behind the read-back.
      if (state.endedEarly === "till_empty") {
        root.classList.add("lm-week-dead");
        deps.say("zana", "The till ran empty. That is the price of leaving the bill.");
      }
      dayPanel.append(
        el("div", { class: "lm-choices" },
          choiceButton("Read the week back", state.endedEarly === "till_empty" ? "The till ran empty" : "The week is over", () => summary()),
        ),
      );
    } else {
      dayPanel.append(el("div", { class: "lm-choices" }, choiceButton("Next day", "", () => dayBreak(showDay))));
    }
    persist();
  }

  function row(label: string, value: string, cls: string): HTMLElement {
    return el("div", { class: `lm-till-row${cls ? ` ${cls}` : ""}` },
      el("span", { class: "lm-till-line-label", text: label }),
      el("span", { class: "lm-till-line-val", text: value }));
  }

  /** "The second week, read back" — the scored summary + best-run persist. */
  function summary(): void {
    const s = weekSummary(state);
    const best = recordBestRun(
      { streetTook: s.streetTook, lawfulPrice: s.lawfulPrice, kept: s.kept, at: new Date().toISOString() },
      safeStore(),
    );
    deps.say("siki", s.verdict);
    dayPanel.classList.remove("lm-street-beat");
    dayPanel.classList.add("lm-debrief");
    renderChrome();
    clear(root);
    root.append(till, dayPanel);
    clear(dayPanel);
    const rows = el("div", { class: "lm-till-rows lm-sw-readback" });
    rows.append(
      row("To the street", `− ${money(s.streetTook)}`, "lm-till-row-debt"),
      row(isSouq() ? "The terms' price of the same wait" : "The lawful price of the same wait", `− ${money(s.lawfulPrice)}`, "lm-till-row-debt"),
      row("Cash kept", money(s.kept), "lm-till-row-net"),
    );
    dayPanel.append(
      el("h3", { text: "The second week, read back" }),
      el("p", {
        class: "lm-hint",
        text: s.endedEarly
          ? `The till ran empty on day ${s.lastPlayedDay}. That is the price of leaving the bill.`
          : `Five days, ${state.invoices.length} invoices, one supplier. ${s.leftOwing > 0 ? `${money(s.leftOwing)} is still sitting out.` : "Everything you were owed came in."}`,
      }),
      rows,
      el("p", { class: "lm-sw-verdict", text: s.verdict }),
      el("p", { class: "lm-sw-best", text: `Best week so far: the street took ${money(best.streetTook)}.` }),
      el("div", { class: "lm-choices" },
        choiceButton("Run another week", "A new week is dealt — new invoices, same street", () => runSecondWeek(deps, Date.now() % 0x7fffffff, null)),
        choiceButton("Close the books", "Back to the market", () => deps.onDone()),
      ),
    );
    persist();
  }

  if (resume) {
    deps.say("siki", `The books remember where you stopped. Day ${resume.day} of ${WEEK2_DAYS}.`);
    renderChrome();
    till.hidden = false;
    clear(dayPanel);
    dayPanel.append(
      el("h3", { "aria-label": `Day ${resume.day} of ${WEEK2_DAYS}` },
        `Day ${resume.day} of ${WEEK2_DAYS}`, weekDots(resume.day)),
      el("p", { class: "lm-hint", text: "Back at the counter. The second week remembers where you stopped." }),
      el("div", { class: "lm-choices" },
        choiceButton("Back to the counter", `Resume at Day ${resume.day}`, () => showDay()),
      ),
    );
    persist();
  } else {
    deps.say("zana", `Second week. New books, same street. ${WEEK2_DAYS} days.`);
    clear(dayPanel);
    dayPanel.append(
      el("h3", { text: "The shutters, again" }),
      el("p", { class: "lm-hint", text: "A different week, dealt by the same street: new invoices, the same supplier, five days." }),
      el("div", { class: "lm-choices" },
        choiceButton("Open the shutters", `Day 1 of ${WEEK2_DAYS} · till ${money(state.cash)}`, () => showDay()),
      ),
    );
    persist();
  }
}
