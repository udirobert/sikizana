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
  BILL,
  CH1_DAYS,
  createCh1State,
  dayChoices,
  resolveDay,
  deferralLines,
  netPosition,
  type Ch1State,
  type DayEffect,
} from "./ch1";
import type { LedgerEntry } from "../engine/ledger";
import type { Speaker } from "../audio/voice";
import { money, isSouq, SOUQ_VO } from "../engine/market";

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
  noteStreet: (ev: { deferral?: boolean; billSkipped?: boolean; collected?: number; lateFee?: number; streetTake?: number; flair?: boolean; held?: number }) => void;
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
  const ledgerStrip = el("details", { class: "lm-ledger" });
  const dayPanel = el("div", { class: "lm-day" });
  root.append(dayPanel, till, ledgerStrip, lantern);

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

  /** Face that is due and still unchased — what the street is holding. */
  function heldFace(): number {
    return state.invoices
      .filter((inv) => inv.paidDay === null && inv.chasedDay === null && inv.dueDay <= state.day)
      .reduce((sum, inv) => sum + inv.principal, 0);
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
    ledgerStrip.append(el("summary", { text: "The ledger" }));
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
        const n = day - inv.dueDay;
        status = `${n} day${n === 1 ? "" : "s"} late · ${gbp0(inv.principal)} still not in the till`;
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

    // The street tally above the choices is the number. A second lantern
    // figure on the same screen splits the eye.
    lantern.hidden = true;
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
    deps.noteStreet({ held: heldFace() });
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
        choiceButton("Open the shutters", `Day 1 of ${CH1_DAYS} · till ${money(1200)}`, () => showDay()),
      ),
    );
    persist();
  }

  function persist(): void {
    deps.save(state);
  }

  function dayHint(day: number): string {
    const landing = state.invoices
      .filter((i) => i.paidDay === day)
      .reduce((sum, i) => sum + i.principal, 0);
    switch (day) {
      case 1: return `Harborne, ${money(2400)}, already late. Chase it and the money is here tomorrow.`;
      case 2: return landing > 0
        ? `Harborne's ${money(landing)} lands this morning. Quayline's bill is due.`
        : `Quayline's bill is due. In hand: ${gbp(netPosition(state))}.`;
      case 3: return `Last day. Harborne again — ${money(2400)}. This one lands after the week closes.`;
      default: return "The week closes.";
    }
  }

  // The day's decision leads: the panel (scene + choice) renders ABOVE the
  // ledger strip, so the first viewport is till → decision → buttons, and
  // the five cards sit below as the books they are. The log beat keeps the
  // ledger-first order (finishDay re-appends it) — that beat IS a readout.
  const DAY_SCENE: Record<number, { speaker: "siki" | "zana"; line: string }> = {
    1: { speaker: "zana", line: "Harborne is already late. Chase it, or leave it for the street." },
    2: { speaker: "zana", line: "Quayline's bill is due today. Pay it, or the street starts charging." },
    3: { speaker: "siki", line: "Harborne again. Same amount. This one lands after the week closes." },
  };

  function showDay(): void {
    if (state.done) return debrief();
    const day = state.day;
    lantern.hidden = false; till.hidden = false; ledgerStrip.hidden = false;
    renderChrome();
    root.append(dayPanel, till, ledgerStrip, lantern);
    const choices = dayChoices(state, day);
    const scene = DAY_SCENE[day];
    // Souq day 1 gets its own cold-open line (the baked AR take carries
    // the AED figures); the EN day scenes stay canonical on the UK path.
    if (isSouq() && day === 1) deps.say("siki", SOUQ_VO.ch1Intro);
    else if (scene) deps.say(scene.speaker, scene.line);
    clear(dayPanel);
    dayPanel.append(
      el("h3", { "aria-label": `Day ${day} of ${CH1_DAYS}` },
        `Day ${day} of ${CH1_DAYS}`, weekDots(day)),
      el("p", { class: "lm-hint", text: dayHint(day) }),
      el("div", { class: "lm-choices" },
        ...choices.map((c) => choiceButton(c.label, c.detail, () => pick(c.id))),
      ),
    );
  }

  function pick(choiceId: string): void {
    if (state.done || state.day > CH1_DAYS) return;
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
      // The stallholder who just lit speaks. A second narrator here
      // turns the beat back into a lecture.
    }
    if (effects.day === BILL.dueDay && state.bill.paidDay !== null && !reacted.bill) {
      reacted.bill = true;
      deps.say("zana", "Nobody owns a piece of your week now. Quayline is paid.");
    }
    finishDay(effects);
  }

  function finishDay(effects: DayEffect): void {
    clear(root); // re-render chrome with a pop on the till
    root.append(dayPanel, till, ledgerStrip, lantern);
    const day = effects.day;
    renderChrome(true);
    // Money actually landed in the till today (a chase cleared, or trade came
    // in): the till glows, not just the number.
    if (effects.cashDelta > 0) till.classList.add("lm-till-glow");

    clear(dayPanel);
    const streetBeat = effects.streetNote === "deferral" || effects.streetNote === "bill_skipped";
    // On a street beat the figure is what the street just took. Walk-in
    // trade can land in the same breath, and showing that gain under
    // "You left it" teaches the wrong lesson.
    const streetFigure = (effects.lanternDelta > 0 ? effects.lanternDelta : 0) + (effects.lateFeeDelta > 0 ? effects.lateFeeDelta : 0);
    const figure = effects.cashDelta !== 0
      ? (effects.cashDelta > 0 ? `+${gbp(effects.cashDelta)}` : `−${gbp(-effects.cashDelta)}`)
      : null;
    if (streetBeat) {
      dayPanel.append(
        el("h3", { text: effects.streetNote === "bill_skipped" ? "The bill stays." : "You left it." }),
        ...(streetFigure > 0 ? [el("p", { class: "lm-take", text: gbp(streetFigure) })] : []),
      );
    } else {
      const log = el("ul", { class: "lm-day-log" });
      for (const l of effects.lines) log.append(el("li", { text: l }));
      if (effects.lateFeeDelta > 0) {
        log.append(el("li", { class: "lm-latefee", text: `${gbp0(effects.lateFeeDelta)} to the street — late charge on the unpaid bill` }));
      }
      dayPanel.append(
        el("h3", { text: `Day ${day} closed` }),
        ...(figure ? [el("p", { class: "lm-take", text: figure })] : []),
        ...(log.childElementCount ? [log] : []),
      );
    }
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

  // Two beats: the street's number, then the two prices. The bias is named
  // only when the two Harborne choices differed.
  function debrief(): void {
    const entries = deps.pairEntries();
    const deferred = entries.filter((e) => e.deferred);
    const lines = deferralLines(state);
    const stillOut = lines.filter((l) => l.stillOwed).reduce((t, l) => t + l.principal, 0);
    const statutoryFloor = lines.reduce((t, l) => t + l.statutory, 0);
    const differed = entries.length >= 2 && deferred.length === 1;
    const bothChased = entries.length >= 2 && deferred.length === 0;
    const bothLeft = entries.length >= 2 && deferred.length >= 2;

    function beatPrices(): void {
      clear(dayPanel);
      const price = isSouq()
        ? `${gbp0(stillOut)} did not come in. Your own terms price that wait at ${gbp0(statutoryFloor)}.`
        : `${gbp0(stillOut)} did not come in. The law prices that wait at ${gbp0(statutoryFloor)}.`;
      const name = differed
        ? "You deferred one and chased the other. The offers matched. Only when the money landed changed. That tilt is present bias."
        : bothChased
          ? "You chased both. The near one and the far one were the same offer."
          : bothLeft
            ? "You left both. The near one and the far one were the same offer. That tilt is present bias."
            : "";
      if (name) deps.say("siki", name);
      dayPanel.append(
        el("h3", { text: "Two prices for one wait" }),
        el("p", { class: "lm-line siki", text: price }),
        ...(state.endedEarly === "till_empty"
          ? [el("p", { class: "lm-hint", text: "The till ran empty. That is the price of leaving the bill." })]
          : []),
        el("div", { class: "lm-choices" },
          choiceButton("When an invoice falls due, chase it the same day", "Chapter 1 complete", () => closeBooks()),
        ),
      );
    }

    clear(dayPanel);
    const takenLine = stillOut > 0
      ? `${gbp0(stillOut)} is still on the street.`
      : "Nothing you were owed is still sitting out.";
    deps.say("siki", stillOut > 0 ? "That money is still on the street." : takenLine);
    const rows = entries.map((e) => {
      const verb = e.chosenOptionId === "chase_now" ? "chased" : "left it";
      return el("p", { text: `Day ${e.day}: ${verb}` });
    });
    dayPanel.append(
      el("h3", { text: "Still on the street" }),
      el("p", { class: "lm-take", text: gbp0(stillOut) }),
      ...(rows.length ? [el("div", { class: "lm-surface" }, ...rows)] : []),
      el("div", { class: "lm-choices" },
        choiceButton("The two prices", "", beatPrices),
      ),
    );
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
