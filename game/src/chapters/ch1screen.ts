/**
 * Chapter 1 screen driver — the stall (recovery plan §2.1).
 *
 * One persistent screen, never cleared between days: the till (live cash),
 * the ledger strip (one card per open invoice, ageing daily), the street
 * (owned by main.ts, above this screen), and the day panel (narration,
 * choices, then the day's log + "Next day"). The debrief reuses the same
 * place: street first, then the player's own line items, then the name,
 * then the tool — the loss lands before the lecture.
 *
 * Spoken lines go through deps.say() (audio is optional; text always).
 * Rule: the spoken line is short; the card carries the content — never
 * both saying the same thing (recovery plan §2.3).
 */
import { el, clear, choiceButton } from "../ui/dom";
import {
  CH1_DAYS,
  createCh1State,
  dayChoices,
  resolveDay,
  deferralLines,
  worthToday,
  worthAtFraction,
  daysOverdueOn,
  netPosition,
  type Ch1State,
  type Ch1Invoice,
  type DayEffect,
} from "./ch1";
import type { LedgerEntry } from "../engine/ledger";
import type { Speaker } from "../audio/voice";
import { phrased } from "../i18n";
import { money, isSouq } from "../engine/market";

/**
 * The prologue's frozen VO contract (TRACK_A_SPEC A1): these strings are the
 * manifest keys — display text and spoken text are the same constant, so a
 * baked take can never drift from what the player reads. Track B bakes them
 * verbatim; do not reword without re-baking.
 */
export const PROLOGUE_EXPERIMENT_ID = "prologue_shark_offer";
export const SHARK_PROLOGUE = {
  offer: "That old debt of yours — the one from before your week. I'll take it off your hands. 70% of face, settled off the books.",
  accept: "Pleasure doing business. The street thanks you — literally.",
  refuse: "Your loss. The street keeps its own books.",
  counter: "Eighty-five? Cute. Seventy, off the books, tonight — or nothing.",
} as const;

export interface Ch1Deps {
  root: HTMLElement;
  /** Persistent ledger — owned above (one spine across chapters). */
  record: (e: Omit<LedgerEntry, "id">) => void;
  /** All ch1 pair entries so far (for the debrief replay). */
  pairEntries: () => LedgerEntry[];
  /** Audio bus marker — muted-safe; lines render as text regardless. */
  say: (speaker: Speaker, text: string) => void;
  /** Persist run state (localStorage; cleared on demand — privacy rails). */
  save: (state: Ch1State) => void;
  /** Fired when the chapter closes (main.ts chains to Chapter 2). */
  onTool?: (tool: "reminder_rule") => void;
  /** Street-moving events that don't create ledger entries. `flair` is a
   *  cosmetic-only pulse — it must never feed street counters. */
  noteStreet: (ev: { deferral?: boolean; billSkipped?: boolean; collected?: number; lateFee?: number; streetTake?: number; flair?: boolean }) => void;
  /** True once the prologue offer has a ledger entry — a player who chose
   *  but closed before Day 1 must not be offered it twice. */
  prologueSettled?: () => boolean;
}

const gbp = (v: number) => money(v, 2);
const gbp0 = (v: number) => money(v, 0);

export function runChapter1(deps: Ch1Deps, seed: number, saved: Ch1State | null = null): void {
  const state = saved ?? createCh1State(seed).state;
  const root = deps.root;
  clear(root);

  const lantern = el("div", { class: "lm-lantern", "aria-live": "polite", text: "" });
  const till = el("div", { class: "lm-till", "aria-live": "polite" });
  const ledgerStrip = el("div", { class: "lm-ledger" });
  const dayPanel = el("div", { class: "lm-day" });
  root.append(lantern, till, ledgerStrip, dayPanel);

  // ── The live bleed: the market reprices an overdue invoice CONTINUOUSLY,
  //    so the cost is felt before the first click (first-minute tension).
  //    Display-only — it interpolates each overdue card's bid from today's
  //    value toward next-morning's over a short real-time window, at the TRUE
  //    rate (the day's shed spread across the day, never an invented faster
  //    number). The sim and the ledger still accrue on the integer
  //    `valueShedForDay`; the tick just shows the same arithmetic as it moves,
  //    and lands EXACTLY on the post-resolve value at the day's end. ────────
  const live = { raf: 0, startTs: 0, tickMs: 1600, bids: new Map<string, { el: HTMLElement; inv: Ch1Invoice; day: number }>() };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ── Till delight: count-up tween + lantern pulse (display-only; the sim
  //    accrues on integers, the chrome just arrives there gracefully). ──────
  let prevTill: { cash: number; net: number } | null = null;
  let lastLantern = 0;
  let tillToken = 0;
  // Reactive voices fire once per run — punctuation for firsts, not wallpaper.
  const reacted = { collect: false, defer: false, bill: false };
  function tweenMoney(elm: HTMLElement, from: number, to: number, token: number): void {
    if (reducedMotion || from === to) { elm.textContent = gbp(to); return; }
    const t0 = performance.now(), dur = 650;
    const frame = (t: number) => {
      if (token !== tillToken) return; // a newer render supersedes this tween
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      elm.textContent = gbp(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  /** Week progress dots — the week has a shape, not just a count. */
  function weekDots(day: number): HTMLElement {
    return el("span", {
      "aria-hidden": "true",
      class: "lm-dots",
      text: ` ${"●".repeat(day)}${"○".repeat(Math.max(0, CH1_DAYS - day))}`,
    });
  }

  /** Which invoices bleed on `day` under the current (pre-choice) state —
   *  the same predicate `resolveDay` uses for its accrual, so the tick never
   *  shows the street taking what the ledger doesn't record. */
  function bleeding(day: number, st: Ch1State): Ch1Invoice[] {
    return st.invoices.filter((inv) =>
      (inv.chasedDay === null || inv.chasedDay > day) &&
      (inv.paidDay === null || inv.paidDay > day) &&
      day > inv.dueDay);
  }

  function liveFrame(): void {
    const p = Math.min(1, (performance.now() - live.startTs) / live.tickMs);
    for (const { el: span, inv, day } of live.bids.values()) {
      const n = daysOverdueOn(inv, day);
      const when = p < 1 ? "today" : "now"; // settles at the day's-end value → "now"
      span.textContent = `${n} day${n === 1 ? "" : "s"} overdue · the market pays ${gbp0(worthAtFraction(inv, day, p))} ${when}`;
    }
    if (p < 1 && live.bids.size > 0) live.raf = requestAnimationFrame(liveFrame);
    else live.raf = 0;
  }
  function startTick(): void {
    cancelAnimationFrame(live.raf);
    live.bids.clear();
    if (reducedMotion || state.done) return; // no live bleed under reduced motion
    const day = state.day;
    for (const inv of bleeding(day, state)) {
      const span = ledgerStrip.querySelector<HTMLElement>(`.lm-inv-card[data-inv="${inv.id}"] .lm-inv-status`);
      if (span) live.bids.set(inv.id, { el: span, inv, day });
    }
    if (live.bids.size === 0) return;
    live.startTs = performance.now();
    live.raf = requestAnimationFrame(liveFrame);
  }
  function stopTick(): void {
    cancelAnimationFrame(live.raf);
    live.raf = 0;
  }

  /** Redraw till + ledger + lantern from state. The street is main's. */
  function renderChrome(pop = false): void {
    // The till is the stall's own books, in three lines a judge can't misread
    // as "cash in hand": the cash in the drawer, the supplier debt set aside
    // (face + the late charges grown onto it), and what is truly yours —
    // IN HAND (cash − unpaid bill). Skipping the bill drops the third line,
    // not a caption-sized late charge. (Accuracy band: the one number the
    // player stares at all week must be legible.)
    const billOwed = state.bill.skippedDay !== null && state.bill.paidDay === null;
    const owed = billOwed ? state.bill.amount + state.lateFees : 0;
    const net = netPosition(state);    const tillGrid = el("div", { class: "lm-till-rows" });
    const token = ++tillToken;
    const fromCash = prevTill?.cash ?? state.cash;
    const fromNet = prevTill?.net ?? net;
    const cashVal = document.createElement("span");
    cashVal.className = "lm-till-line-val";
    tillGrid.append(
      el("div", { class: "lm-till-row" },
        el("span", { class: "lm-till-line-label", text: "Cash" }),
        cashVal),
    );
    tweenMoney(cashVal, fromCash, state.cash, token);
    if (billOwed) {
      tillGrid.append(el("div", { class: "lm-till-row lm-till-row-debt" },
        el("span", { class: "lm-till-line-label", text: `Owed to ${state.bill.client}` }),
        el("span", { class: "lm-till-line-val", text: `− ${gbp(owed)}` })));
    }
    const netVal = document.createElement("span");
    netVal.className = "lm-till-num lm-till-line-val";
    if (pop) netVal.classList.add("lm-pop");
    tweenMoney(netVal, fromNet, net, token);
    prevTill = { cash: state.cash, net };
    tillGrid.append(el("div", { class: "lm-till-row lm-till-row-net" },
      el("span", { class: "lm-till-line-label", text: "In hand" }),
      netVal));
    till.replaceChildren(el("span", { class: "lm-till-cap", text: "The till" }), tillGrid);
    if (net < 0) {
      till.append(el("span", { class: "lm-till-warn", text: "▼ in hand runs red" }));
    }
    till.classList.toggle("lm-till-neg", net < 0);

    clear(ledgerStrip);
    ledgerStrip.append(el("h4", { class: "lm-ledger-cap", text: "The ledger" }));
    const day = state.day;
    for (const inv of state.invoices) {
      if (inv.paidDay !== null && inv.paidDay < day) continue; // collected — off the strip
      let status: string;
      if (inv.chasedDay !== null && inv.paidDay !== null) {
        const dd = inv.paidDay - day;
        status = dd === 0
          ? "pays today" // lands this morning, when the day resolves
          : inv.paidDay <= CH1_DAYS
            ? `pays in ${dd} day${dd === 1 ? "" : "s"}`
            : "pays after this week";
      } else if (inv.dueDay < day) {
        // The street's live bid FALLS as the invoice ages — what the Factor
        // would pay to buy it from you RIGHT NOW (GDD §2 discounting lesson
        // as one UI element). Framing it as a bid, not "worth", keeps it
        // honest against the chase button, which still offers the full face
        // value: the invoice is still £1,200; the street would only pay £1,176
        // to take it off your hands today. The count and the bid share one
        // formula (daysOverdueOn), so "N days overdue · the market pays £X"
        // is the same arithmetic the lantern's street take is built from.
        const n = daysOverdueOn(inv, day);
        status = `${n} day${n === 1 ? "" : "s"} overdue · the market pays ${gbp0(worthToday(inv, day))} today`;
      } else if (inv.dueDay === day) {
        status = "due today";
      } else {
        status = `due day ${inv.dueDay}`;
      }
      ledgerStrip.append(
        el("div", { class: `lm-inv-card${inv.chasedDay !== null ? " lm-inv-chased" : " lm-inv-overdue"}`, "data-inv": inv.id },
          el("span", { class: "lm-inv-client", text: inv.client }),
          el("span", { class: "lm-inv-amt", text: gbp0(inv.principal) }),
          el("span", { class: `lm-inv-status${inv.dueDay < day && inv.chasedDay === null ? " lm-inv-bleed" : ""}`, text: status }),
        ),
      );
    }
    // The supplier bill, while it is live.
    if (state.bill.paidDay === null && state.bill.skippedDay === null && day <= state.bill.dueDay) {
      ledgerStrip.append(
        el("div", { class: "lm-inv-card lm-inv-bill" },
          el("span", { class: "lm-inv-client", text: state.bill.client + " (your bill)" }),
          el("span", { class: "lm-inv-amt", text: gbp0(state.bill.amount) }),
          el("span", { class: "lm-inv-status", text: `pay day ${state.bill.dueDay}` }),
        ),
      );
    } else if (state.bill.skippedDay !== null && state.bill.paidDay === null) {
      // The debt GROWS — the late charge is added on, and the till position
      // carries it, so this number going up is the till number going down.
      const owed = state.bill.amount + state.lateFees;
      ledgerStrip.append(
        el("div", { class: "lm-inv-card lm-inv-bill lm-inv-dead" },
          el("span", { class: "lm-inv-client", text: state.bill.client + " (your bill)" }),
          el("span", { class: "lm-inv-amt", text: gbp0(owed) }),
          el("span", { class: "lm-inv-status", text: `unpaid — ${gbp0(state.bill.lateFee)}/day late charge · growing` }),
        ),
      );
    }

    ledgerStrip.append(
      el("details", { class: "lm-key" },
        el("summary", { text: "How to read the ledger" }),
        el("p", { class: "lm-hint", text: "Big number = face: what they owe you, and what a chase collects. \"Market pays\" = the street's fictional bid (indicative 2%/day, capped 30%) — the discount for selling the wait. The real legal price arrives in the debrief." }),
      ),
    );

    const lanternNow = state.streetTake;
    lantern.textContent = lanternNow > 0 ? `· ${gbp(lanternNow)} ·` : "";
    // The lantern flares once when the street takes more — the cost lands
    // with a felt pulse, not a silent number swap.
    if (lanternNow > lastLantern) {
      lantern.classList.remove("lm-lantern-pulse");
      void lantern.offsetWidth; // restart the animation
      lantern.classList.add("lm-lantern-pulse");
    }
    lastLantern = lanternNow;
  }

  intro();

  function intro(): void {
    const resuming = saved !== null && saved.day > 1;
    // The cold open: minute one is a scene, not a ledger. The Shark walks
    // past before the shutters open — every judge meets the street's teeth
    // first, the cards second. No decision, no numbers, ten seconds. The
    // chrome stays unrendered until the shutters open (resuming players,
    // who have seen it, go straight to the counter).
    if (!resuming) return coldOpen();
    deps.say("siki", `The shutters were left open. Day ${state.day} of ${CH1_DAYS} — the books remember where you stopped.`);
    clear(dayPanel);
    dayPanel.append(
      el("h3", { "aria-label": `Day ${state.day} of ${CH1_DAYS}` },
        `Day ${state.day} of ${CH1_DAYS}`, weekDots(state.day)),
      el("p", { class: "lm-hint", text: `Back at the counter. The books remember where you stopped.` }),
      choiceButton("Back to the counter", `Resume at Day ${state.day}`, () => showDay()),
    );
    renderChrome();
    persist();
  }

  function coldOpen(): void {
    deps.say("zana", "Heads up. Shark about — walk past him.");
    // The books don't exist yet dramatically — hide the empty chrome so the
    // first viewport is street, teeth, and the choice.
    lantern.hidden = true; till.hidden = true; ledgerStrip.hidden = true;
    clear(dayPanel);
    dayPanel.append(el("h3", { text: "Night. The Late Market." }));

    // The prologue offer is ONCE per run: a player who picked but closed
    // before Day 1 sees only the shutters, not a second ledger entry.
    if (deps.prologueSettled?.()) return shutters();

    dayPanel.append(
      el("p", { class: "lm-line shark", text: "Nice stall. Everybody pays the street eventually — cash now, or a little each day." }),
      el("p", { class: "lm-line zana", text: "That's the Shark. He prices patience by the day." }),
      el("div", { class: "lm-choices" },
        choiceButton("Take the 70%", "Old debt, settled off the books — this week's till never sees it", () => prologuePick("take")),
        choiceButton("Refuse", "Keep the debt. The street keeps its own books", () => prologuePick("refuse")),
        choiceButton("Counter — 85%", "He will say no. Watch.", () => prologuePick("counter")),
      ),
    );
    // The offer itself is the voiced beat — the bubble IS the presentation.
    deps.say("shark", SHARK_PROLOGUE.offer);
    persist();
  }

  /** The Shark's offer, recorded once. Off-book by design: the debt predates
   *  the week, so nothing touches state.cash, state.invoices, or
   *  dayChoices() — the paired-choice experiment and the 5-day balance are
   *  untouched. Ledger rules (TRACK_A_SPEC A1): chapter 1, day 0, an
   *  experimentId with NO ch1_/ch2_/ch3_ prefix (irrationalityProfile counts
   *  those), npc set but NEVER feePaid (costOfNotActing would inflate),
   *  deferred false. */
  function prologuePick(kind: "take" | "refuse" | "counter"): void {
    deps.record({
      chapter: 1,
      day: 0,
      experimentId: PROLOGUE_EXPERIMENT_ID,
      prompt: SHARK_PROLOGUE.offer,
      optionsShown: [
        { id: "take_70", label: "Take the 70%", framingVariable: "prologue_offer_70pct", isDefault: false },
        { id: "refuse", label: "Refuse — keep the debt", framingVariable: "prologue_refuse", isDefault: true },
        { id: "counter_85", label: "Counter — 85%", framingVariable: "prologue_counter_85", isDefault: false },
      ],
      chosenOptionId: kind === "take" ? "take_70" : kind === "counter" ? "counter_85" : "refuse",
      deferred: false,
      npc: {
        npc: "The Shark",
        decision: kind === "take" ? "accept" : kind === "counter" ? "counter" : "decline",
      },
      immediateConsequence:
        kind === "take"
          ? "Settled off the books — the old debt is gone; this week's till never saw it."
          : kind === "counter"
            ? "Countered at 85% — the Shark walked. The offer is gone."
            : "Refused. The debt stays yours; the street keeps its own books.",
    });
    if (kind === "take") deps.noteStreet({ flair: true }); // cosmetic pulse only
    deps.say("shark", SHARK_PROLOGUE[kind === "take" ? "accept" : kind === "counter" ? "counter" : "refuse"]);
    shutters();
  }

  function shutters(): void {
    clear(dayPanel);
    dayPanel.append(
      el("h3", { text: "Night. The Late Market." }),
      el("p", { class: "lm-line zana", text: "The street keeps its books whether you open or not. Open the shutters." }),
      el("div", { class: "lm-choices" },
        choiceButton("Open the shutters", `Day 1 of 5 · till ${money(1200)}`, () => showDay()),
      ),
    );
    persist();
  }

  function persist(): void {
    deps.save(state);
  }

  function dayHint(day: number): string {
    switch (day) {
      case 1: return `Till ${money(1200)}, and the ledger is already overdue. The easy work pays a little now; the chase pays the week.`;
      case 2: return "Another invoice is due, and the week keeps moving.";
      case 3: return `Harborne Print Works is on the desk — ${money(2400)}. The easy work is piling up too.`;
      case 4: return `A bill is due today — ${gbp0(state.bill.amount)}. The till is ${gbp(netPosition(state))}. Pay it or leave it.`;
      case 5: return `Last day. Another Harborne invoice — ${money(2400)}. The week closes after this.`;
      default: return "The week closes.";
    }
  }

  // The day's decision leads: the panel (scene + choice) renders ABOVE the
  // ledger strip, so the first viewport is till → decision → buttons, and
  // the five cards sit below as the books they are. The log beat keeps the
  // ledger-first order (finishDay re-appends it) — that beat IS a readout.
  const DAY_SCENE: Record<number, { speaker: "siki" | "zana"; line: string }> = {
    1: { speaker: "zana", line: "New week. The street is already working out what your patience is worth." },
    2: { speaker: "siki", line: "Day two. The week keeps moving whether you chase or not." },
    3: { speaker: "siki", line: `Harborne Print Works, ${money(2400)}, on the desk. Chase it today or let it age.` },
    4: { speaker: "zana", line: `Quayline's ${money(2000)}, due today. Pay it or leave it — the street charges for leaving.` },
    5: { speaker: "siki", line: `Last day. Another Harborne, same ${money(2400)}. The week closes after this.` },
  };

  function showDay(): void {
    if (state.done) return debrief();
    const day = state.day;
    lantern.hidden = false; till.hidden = false; ledgerStrip.hidden = false;
    renderChrome();
    root.append(lantern, till, dayPanel, ledgerStrip);
    startTick(); // the market reprices the bleeding invoices as the day opens
    const choices = dayChoices(state, day);
    const scene = DAY_SCENE[day];
    if (scene) deps.say(scene.speaker, scene.line);
    clear(dayPanel);
    dayPanel.append(
      el("h3", { "aria-label": `Day ${day} of ${CH1_DAYS}` },
        `Day ${day} of ${CH1_DAYS}`, weekDots(day)),
      el("p", { class: "lm-hint", text: dayHint(day) }),
      el("ul", { class: "lm-day-log" }),
      el("div", { class: "lm-choices" },
        ...choices.map((c) => choiceButton(c.label, c.detail, () => pick(c.id))),
      ),
    );
  }

  function pick(choiceId: string): void {
    if (state.done || state.day > CH1_DAYS) return;
    stopTick(); // the choice commits the day — the bleed settles on the ledger's value
    const { effects, engineeredEntry } = resolveDay(state, state.day, choiceId);
    if (engineeredEntry) deps.record(engineeredEntry);
    // The street's running tally (the strip's "£X so far"): the value the
    // invoices shed today + any late charge + the stall-change notes.
    deps.noteStreet({
      streetTake: effects.lanternDelta,
      lateFee: effects.lateFeeDelta,
      deferral: effects.streetNote === "deferral",
      billSkipped: effects.streetNote === "bill_skipped",
      collected: effects.collected,
    });
    // Firsts get a voice: Siki marks money landing, Zana marks the street
    // being fed and the bill being killed. Text-only when unbaked.
    if (effects.collected > 0 && !reacted.collect) {
      reacted.collect = true;
      deps.say("siki", "There it is — the full face, on your till, not the street's.");
    }
    if (effects.streetNote === "deferral" && !reacted.defer) {
      reacted.defer = true;
      deps.say("zana", "Noted. The street thanks you — literally.");
    }
    if (state.day === 4 && effects.streetNote !== "bill_skipped" && !reacted.bill) {
      reacted.bill = true;
      deps.say("zana", "Nobody owns a piece of your week now. Quayline is paid.");
    }
    finishDay(effects);
  }

  function finishDay(effects: DayEffect): void {
    clear(root); // re-render chrome with a pop on the till
    root.append(lantern, till, ledgerStrip, dayPanel);
    const day = effects.day;
    renderChrome(true);
    // Money actually landed in the till today (a chase cleared, or trade came
    // in): the till glows, not just the number.
    if (effects.cashDelta > 0) till.classList.add("lm-till-glow");

    clear(dayPanel);
    const log = el("ul", { class: "lm-day-log" });
    if (effects.cashDelta !== 0) {
      log.append(el("li", {
        class: effects.cashDelta > 0 ? "lm-money-in" : "lm-money-out",
        text: effects.cashDelta > 0
          ? `the till is up ${gbp(effects.cashDelta)}`
          : `the till is down ${gbp(-effects.cashDelta)}`,
      }));
    }
    for (const l of effects.lines) log.append(el("li", { text: l }));
    if (effects.lateFeeDelta > 0) {
      log.append(el("li", { class: "lm-latefee", text: `${gbp0(effects.lateFeeDelta)} to the street — late charge on the unpaid bill` }));
    }
    dayPanel.append(el("h3", { text: `Day ${day} closed` }), log);
    if (state.done) {
      dayPanel.append(
        el("div", { class: "lm-choices" },
          choiceButton("Close the books", state.endedEarly === "till_empty" ? "The till ran empty" : "The week is over", () => debrief()),
        ),
      );
    } else {
      dayPanel.append(el("div", { class: "lm-choices" }, choiceButton("Next day", "", () => showDay())));
    }
    persist();
  }

  // ── Debrief on the stall: street → replay → name → tool (plan §2.3). ──
  function debrief(): void {
    const entries = deps.pairEntries();
    const deferred = entries.filter((e) => e.deferred);
    const lines = deferralLines(state);
    // The street's total take this run: the market value the invoices shed
    // while they sat (the lantern) + the late charges on the unpaid bill.
    const streetTake = state.streetTake;
    const streetTotal = streetTake + state.lateFees;
    // The real legal floor over the same windows — the Act, for beat 3.
    const statutoryFloor = lines.reduce((t, l) => t + l.statutory, 0);

    // Beat 3's spoken line — exact match against the baked variants.
    const deferredDays = deferred.map((e) => `Day ${e.day}`).join(" and ");
    const spoken =
      deferred.length === 0
        ? "You chased both times. Good. But notice how the same choice felt different when both ends sat further out."
        : deferred.length === 1
          ? `1 of the two was deferred (${deferredDays}) — the frame, not the facts, did the work.`
          : `2 of the two was deferred (${deferredDays}) — the frame, not the facts, did the work.`;

    const frames: (() => void)[] = [
      // Beat 1 — the street as you built it. No names yet. The street's
      // earnings are the real number: the value your invoices shed while
      // they sat (what the stalls bought them for) plus the late charges.
      () => {
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "First — what your week paid for" }),
          el("p", {
            class: "lm-line siki",
            text: streetTotal > 0
              ? `The street took ${gbp(streetTotal)} this week.` +
                (streetTake > 0 ? ` ${gbp(streetTake)} of it is value your invoices lost while they sat unchased — that money walked off your own cards.` : "") +
                (state.lateFees > 0 ? ` ${gbp(state.lateFees)} is the late charge on the supplier's bill you left unpaid.` : "") +
                (streetTake > 0 ? " Your lateness is their trade." : "")
              : "You paid the street nothing this week. Nothing aged on your desk, and the supplier got paid. The market runs on someone's lateness — this week it wasn't yours.",
          }),
          el("p", {
            class: "lm-hint",
            text: "Watch the ledger: the market's bid on each invoice fell while the lantern grew — the street would pay less and less to take it off your hands. Same money, two screens. Every collection you made lit a stall off; every deferral lit one on.",
          }),
          choiceButton("Look at the books", "Your own pair, side by side", next),
        );
      },
      // Beat 2 — replay the player's own paired decisions + line items.
      () => {
        deps.say("siki", "Let's look at what you did with that pair. Not what a textbook would do. What you did.");
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "Your pair, side by side — two invoices, one offer" }),
          el("div", { class: "lm-surface" },
            ...entries.map((e, i) =>
              el("p", {
                class: "lm-rise",
                style: `animation-delay:${i * 180}ms`,
                text: `Day ${e.day}: ${e.prompt} → ${e.chosenOptionId === "fun_now" ? "the easy work" : e.chosenOptionId === "chase_now" ? "chased" : "deferred"}. ${e.immediateConsequence}`,
              }),
            ),
          ),
          el("div", { class: "lm-surface" },
            el("h4", { text: "Every invoice you let sit" }),
            ...lines.map((l, i) =>
              el("p", {
                class: "lm-rise",
                style: `animation-delay:${(entries.length + i) * 180}ms`,
                text: `${l.client} · ${gbp0(l.principal)} · sat ${l.daysLate} day${l.daysLate === 1 ? "" : "s"} unchased — the street kept ${gbp(l.streetTake)} of its value${l.stillOwed ? " (still owed — the number is still moving)" : ""}. The law would have accrued ${gbp0(l.statutory)} over those same days.`,
              }),
            ),
            el("p", { class: "lm-cash lm-money-out lm-rise", style: `animation-delay:${(entries.length + lines.length) * 180}ms`, text: `The street's take this run: ${gbp(streetTake)} — the bid on those invoices fell by exactly that much` }),
          ),
          choiceButton("Continue", "", next),
        );
      },
      // Beat 3 — name it, on their numbers. The statute arrives here.
      () => {
        deps.say("siki", spoken);
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "What the frame may have done" }),
          el("p", {
            class: "lm-line siki",
            text: phrased({
              normal: "One run, two decisions — that can't prove a bias. But both offers were the same choice: the only variable was WHEN the money lands. Costs near today feel huge; costs far away feel like rounding. If you leaned toward the near one, that tilt is called present bias. It is not a character flaw. It is arithmetic your gut does badly.",
              plain: "One run can't prove a bias. But both offers were the same choice, changed only in WHEN the money lands. Things close feel big; things far feel small. That tilt is called present bias.",
            }),
          }),
          el("p", {
            class: "lm-hint",
            text: phrased({
              normal: isSouq()
                ? `The street doesn't claim — it buys: ${gbp(streetTake)} of your invoices' value changed hands this week. Your own terms set a different price for the same delay: the contractual late fee you wrote into them (2% per thirty days, capped at 8%, plus a fixed administration charge — simplified) would have accrued ${gbp0(statutoryFloor)} in claims over those same days — recoverable only if you chase it. Two prices for one habit. You paid the street's.`
                : `The street doesn't claim — it buys: ${gbp(streetTake)} of your invoices' value changed hands this week. The law sets a different price for the same delay: the Late Payment of Commercial Debts (Interest) Act 1998 s.5A (UK, 8% over base + £40–£100 per invoice, simplified) would have accrued ${gbp0(statutoryFloor)} in claims over those same days — recoverable only if you chase it. Two prices for one habit. You paid the street's.`,
              plain: isSouq()
                ? `The street bought your delay for ${gbp(streetTake)}. Your own terms price that same delay at ${gbp0(statutoryFloor)} — but you only get it if you chase. You paid the street's price.`
                : `The street bought your delay for ${gbp(streetTake)}. The law prices that same delay at ${gbp0(statutoryFloor)} (UK Late Payment Act 1998, simplified) — but you only get it if you chase. You paid the street's price.`,
            }),
          }),
          choiceButton("Continue", "", next),
        );
      },
      // Beat 4 — the tool.
      () => {
        deps.say("zana", "Here's the rule. Say it until it's boring.");
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "The rule that closes the gap" }),
          el("p", { class: "lm-line zana", text: "“When an invoice falls due, it is chased the same day.”" }),
          el("p", {
            class: "lm-hint",
            text: phrased({
              normal: "The rule is a commitment device, not discipline: Zana's first-stage reminders chain automatically, so the boring task does itself. The rule keeps the gap — between what the street earned and what it would have — closed.",
              plain: "Zana's reminders do the chasing for you from then on — the boring task does itself. That rule keeps the gap closed.",
            }),
          }),
          choiceButton("Close the books", "Chapter 1 complete", () => closeBooks()),
        );
      },
      // Loss tail — only when the till ran empty.
      ...(state.endedEarly === "till_empty"
        ? [
            () => {
              clear(dayPanel);
              dayPanel.append(
                el("h3", { text: "The till ran empty" }),
                el("p", {
                  class: "lm-line siki",
                  text: phrased({
                    normal: "This is what it cost to skip the supplier — the till went red before the week closed, and the street noticed. Losing isn't moral failure. It's the price of the choice, made visible. The rule above is how a week like this stops being possible.",
                    plain: "Skipping the bill cost the till its cash. That's what the choice cost. The rule above is how a week like this stops happening.",
                  }),
                }),
                choiceButton("Close the books", "Chapter 1 complete", () => closeBooks()),
              );
            },
          ]
        : []),
    ];
    let i = 0;
    function next(): void {
      i += 1;
      frames[i]!();
    }
    frames[0]!();
  }

  function closeBooks(): void {
    // Chapter-cost summary for the finale's Cost-of-Not-Acting ledger.
    // experimentId deliberately does NOT start "ch1_" — it must not
    // dilute the deferral axis in irrationalityProfile.
    // The street's earnings this run (value the invoices shed + the late
    // charges) is the streetFee; the statutory floor is recorded as the
    // forgone entitlement (the legal price of the same delay, claimable only
    // by the player — the finale shows the two as separate figures).
    const runLines = deferralLines(state);
    const runStatutory = runLines.reduce((t, l) => t + l.statutory, 0);
    const runStreetTake = state.streetTake;
    const runStreetTotal = runStreetTake + state.lateFees;
    deps.record({
      chapter: 1,
      day: CH1_DAYS,
      experimentId: "cost_of_not_acting_ch1",
      prompt: "Chapter 1 — what the street earned",
      optionsShown: [{ id: "run_complete", label: "Run complete", framingVariable: "cost_ledger", isDefault: false }],
      chosenOptionId: "run_complete",
      deferred: false,
      forgoneEntitlement: { interest: runStatutory, compensation: 0, total: runStatutory },
      streetFee: runStreetTotal,
      immediateConsequence: `The street took ${gbp(runStreetTotal)} on your delay this run.`,
    });
    deps.onTool?.("reminder_rule");
  }
}
