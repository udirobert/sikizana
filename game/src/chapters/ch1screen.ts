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
import { streetFocus } from "../ui/street";
import { speakerPara } from "../ui/characters";
import { councilGrid } from "../ui/council";
import { dayTiles } from "../ui/dayTiles";
import {
  BILL,
  CH1_DAYS,
  createCh1State,
  dayChoices,
  resolveDay,
  deferralLines,
  netPosition,
  PAIR_A_DAY,
  PAIR_B_DAY,
  type Ch1State,
  type DayEffect,
} from "./ch1";
import { beatClock, type BeatClock } from "../ui/beatClock";
import { gutCalls } from "../ui/gutTimer";
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

/**
 * The council (Siki left, Zana right) — the product's dual persona made
 * playable. Canon: web/DESIGN.md ("Siki = explain; Zana = chase/enforce,
 * direct tone") and web/components/ZanaMascot.tsx ("the bad cop to Siki's
 * good cop"). These strings are MANIFEST KEYS for the baked takes
 * (council_day{1,2,3}_{siki,zana}) — display text == spoken text; do not
 * reword without re-baking. UK path only: the souq runs its own lawful-fee
 * fiction and its own Arabic takes.
 */
const COUNCIL: Record<number, { siki: string; zana: string }> = {
  1: {
    siki: "Chasing isn't rude — the law agrees. A late commercial invoice earns statutory interest from day one: base rate plus eight.",
    zana: "Harborne has the money. It chose not to hand it over. Go and get it.",
  },
  2: {
    siki: "Parliament priced lateness in 1998: forty pounds fixed, plus interest at base plus eight. The street charges more, and calls it a favour.",
    zana: "Pay the bill. Or tomorrow I read you the late fee — louder.",
  },
  3: {
    siki: "Identical numbers. One difference: when the money lands. Watch what your gut does with later.",
    zana: "Same invoice as day one. What you do today says who you are — not the weather.",
  },
};

/** Prologue council — TEXT ONLY (the Shark owns the beat's voice; the duo
 *  mutters beside the choice, it doesn't compete with the offer). */
const PROLOGUE_COUNCIL = {
  offer: {
    siki: "Selling what you're owed at a discount has a name: factoring. London has done it for centuries.",
    zana: "Thirty per cent of £2,400 is his profit on your patience. Count it before you sign.",
  },
  counter: {
    siki: "His first number was the anchor. Your eighty-five didn't move it — watch what the same seventy feels like now.",
    zana: "He laughed. It's his number or the whole debt — know which one you're taking.",
  },
} as const;

/**
 * Unique moments — one-shot lines fired by specific choices, so the same
 * week is never quite the same twice. All are manifest keys (byte-for-byte
 * with design/lines.json). UK fiction (the 1998 Act / Quayline line stays
 * off the souq path, where the fee is contractual, not statutory).
 */
const MOMENT_DEFER_FIRST = "That's the first stall you lit. £2,400 sleeps out there tonight — it doesn't come home by itself.";
const MOMENT_BILL_CAMEO = "I heard the street charging you. When you'd rather sell the account than keep the chase — I'm at the end of the row.";
const MOMENT_SHADOW = "That shadow crossing the stalls — him. He prices patience, and he hasn't forgotten you kept yours.";
/** The good-run reward: the Shark's revised number. He prices distress —
 *  clean books are the worst news he's had all week. */
const MOMENT_COUNTER_78 = "He came back with a new number — seventy-eight, up from seventy. Clean books cost him profit. That's your discipline, priced by the street.";
const MOMENT_TRIAGE = "Breathe. Still saveable, in order: what's owed to you, then what you owe. The street only wins the days you give it.";

export interface Ch1Deps {
  root: HTMLElement;
  /** Persistent ledger — owned above (one spine across chapters). */
  record: (e: Omit<LedgerEntry, "id">) => void;
  /** All ch1 pair entries so far (for the debrief replay). */
  pairEntries: () => LedgerEntry[];
  /** Audio bus marker — muted-safe; lines render as text regardless.
   * onDone fires when the line lands (spoken take ended, or silent text —
   * callers arm the decision clock there so the timer never races the VO).
   * `host`: speak from a seat instead of a bubble — the karaoke highlight
   * lands inside that element (a counsel card's text) and no separate
   * stacked box is created. */
  say: (speaker: Speaker, text: string, onDone?: () => void, host?: HTMLElement) => void;
  /** Persist run state (localStorage; cleared on demand — privacy rails). */
  save: (state: Ch1State) => void;
  /** Fired when the chapter closes (main.ts chains to Chapter 2). */
  onTool?: (tool: "reminder_rule") => void;
  /** Street-moving events that don't create ledger entries. `flair` is a
   *  cosmetic-only pulse — it must never feed street counters. `prologueLit`
   *  lights the Shark-funded stall (session flag, not a counter). */
  noteStreet: (ev: { deferral?: boolean; billSkipped?: boolean; collected?: number; lateFee?: number; streetTake?: number; flair?: boolean; held?: number; prologueLit?: boolean }) => void;
  /** One line of street world-texture per day (flavour only — no mechanics). */
  whisper?: (text: string) => void;
  /** One-shot street effects (main.ts owns the strip): "shark-shadow" sweeps
   *  the Shark's shadow across the stalls (refused prologue — the street is
   *  watching what you didn't sell); "shutter-blink" pulses the strip as a
   *  stall shutters on landing money. */
  streetFx?: (fx: "shark-shadow" | "shutter-blink") => void;
  /** Day counter → the street scene's dusk→dawn grade (presentation only). */
  sceneDay?: (day: number) => void;
  /** Erase this run and begin again from the cold open (the resume
   *  screen's "Start the week over" — a first-class redo, not a hunt
   *  through the title's privacy scrub). */
  onRestart?: () => void;
}

const gbp = (v: number) => money(v, 2);
const gbp0 = (v: number) => money(v, 0);

export function runChapter1(deps: Ch1Deps, seed: number, saved: Ch1State | null = null): void {
  streetFocus("full"); // the stall chapter keeps the street in focus
  const state = saved ?? createCh1State(seed).state;
  const root = deps.root;
  clear(root);

  const lantern = el("div", { class: "lm-lantern", "aria-live": "polite", text: "" });
  const till = el("div", { class: "lm-till lm-till-top", "aria-live": "polite" });
  // The ledger is OPEN by default (NN/g accordions research: hidden content
  // behind an ambiguous label is content most players never meet — and the
  // invoice cards ARE the game's core state, the books the player is
  // learning to read). It sits BELOW the decision elements, so on day
  // beats it costs the one-viewport design nothing; a player can still
  // collapse it, and their choice sticks for the run.
  const ledgerStrip = el("details", { class: "lm-ledger", open: true });
  const dayPanel = el("div", { class: "lm-day" });
  // Till first: the money is the first viewport, choices second, ledger last.
  root.append(till, dayPanel, ledgerStrip, lantern);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ── Till delight: count-up tween + lantern pulse (display-only; the sim
  //    accrues on integers, the chrome just arrives there gracefully). ──────
  let prevTill: { cash: number; net: number } | null = null;
  let lastLantern = 0;
  let tillToken = 0;
  // Reactive voices fire once per run — punctuation for firsts, not wallpaper.
  const reacted = { collect: false, defer: false, bill: false, skipped: false, shadow: false, triage: false };
  // Zana's clock on the timed beats: the prologue offer and the two pair days.
  let clock: BeatClock | null = null;
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
  /** Week progress tiles — the week has a shape, not just a count. */
  function weekDots(day: number): HTMLElement {
    return dayTiles(day, CH1_DAYS);
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
    // The week's most-watched number reports its own movement.
    const netDelta = net - fromNet;
    if (netDelta !== 0 && !reducedMotion) {
      const chip = el("span", {
        class: `lm-till-delta ${netDelta > 0 ? "up" : "down"}`,
        text: `${netDelta > 0 ? "+" : "−"}${gbp(Math.abs(netDelta))}`,
      });
      chip.addEventListener("animationend", () => chip.remove());
      till.append(chip);
    }
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

  /** Austerity cold open: before Day 1 the street is a place, not an
   *  instrument — the Pixi scene still renders, but the ledger chrome
   *  (tally, Details, inspect, stall captions) stays hidden until money
   *  can actually move. Progressive disclosure: nothing on screen that
   *  can't act yet. */
  function streetAusterity(pre: boolean): void {
    document.getElementById("street-slot")?.classList.toggle("lm-street-pre", pre);
  }

  /** One-viewport beats: slim the street strip while a decision is live
   *  (the finale releases it — the payoff wants the full market). */
  function streetCompact(on: boolean): void {
    document.getElementById("street-slot")?.classList.toggle("lm-street-compact", on);
  }

  function intro(): void {
    const resuming = saved !== null && saved.day > 1;
    // The cold open: minute one is a scene, not a ledger. The Shark walks
    // past before the shutters open — every judge meets the street's teeth
    // first, the cards second. No decision, no numbers, ten seconds. The
    // chrome stays unrendered until the shutters open (resuming players,
    // who have seen it, go straight to the counter).
    if (!resuming) return coldOpen();
    streetAusterity(false); // a returning run is already inside the ledger era
    deps.say("siki", `The shutters were left open. Day ${state.day} of ${CH1_DAYS} — the books remember where you stopped.`);
    clear(dayPanel);
    // The way back in is a choice, not a corridor: resume, or start the
    // week over (a player who abandoned mid-run gets a first-class redo,
    // not a hunt through the title's scrub button).
    dayPanel.append(
      el("h3", { "aria-label": `Day ${state.day} of ${CH1_DAYS}` },
        `Day ${state.day} of ${CH1_DAYS}`, weekDots(state.day)),
      el("p", { class: "lm-hint", text: `Back at the counter. The books remember where you stopped.` }),
      choiceButton("Back to the counter", `Resume at Day ${state.day}`, () => showDay()),
      ...deps.onRestart
        ? [(() => {
            const b = choiceButton("Start the week over", `Erase this week's progress — the Shark gets another pass`, () => deps.onRestart?.());
            b.classList.add("lm-choice-quiet");
            return b;
          })()]
        : [],
    );
    renderChrome();
    persist();
  }

  function coldOpen(): void {
    streetAusterity(true);
    streetCompact(true);
    root.classList.add("lm-beat-compact");
    // The books don't exist yet dramatically — hide the empty chrome so the
    // first viewport is street, teeth, and the choice.
    lantern.hidden = true; till.hidden = true; ledgerStrip.hidden = true;
    clear(dayPanel);
    dayPanel.append(el("h3", { text: "Night. The Late Market." }));

    // The prologue offer is once per RUN (state, not ledger): a replay from
    // the title meets the Shark again; a player who picked but closed before
    // Day 1 sees only the shutters, not a second offer.
    if (state.prologueDone) return shutters();

    // The story card (main.ts) set the scene before this beat; here the
    // Shark takes the stage. His offer renders hero-size at the top of the
    // section while he speaks, the choices sit dimmed below — and when the
    // line LANDS, the stage yields (smooth CSS shrink) and the veil lifts.
    //
    // No clock here — deliberately. The gut clock exists on the pair days,
    // where gut-vs-deliberation IS the measured instrument; arming it on the
    // very first beat of the game would only harvest first-click noise and
    // quietly bias every recording after it (anchoring by pressure). The
    // opening offer deserves deliberation; the pair days deserve instinct.
    const choices = el("div", { class: "lm-choices lm-await" },
      ...(() => {
        const take = choiceButton("Take the 70%", "Old debt, settled off the books — this week's till never sees it", () => prologuePick("take"));
        take.classList.add("lm-choice-trap");
        const refuse = choiceButton("Refuse", "Keep the debt. The street keeps its own books", () => prologuePick("refuse"));
        refuse.classList.add("lm-choice-primary");
        const counter = choiceButton("Counter — 85%", "He will say no. Watch.", () => prologuePick("counter"));
        counter.classList.add("lm-choice-quiet");
        return [take, refuse, counter];
      })(),
    );
    dayPanel.append(
      speakerPara("zana", "That's the Shark. He prices patience by the day."),
      councilGrid(PROLOGUE_COUNCIL.offer, choices),
    );
    root.classList.add("lm-shark-stage");
    deps.say("shark", SHARK_PROLOGUE.offer, () => {
      root.classList.remove("lm-shark-stage");
      choices.classList.remove("lm-await");
    });
    persist();
  }

  /** What the shutters beat whispers about the offer — set by the outcome
   *  path, null when we arrive without playing the prologue this run. */
  let prologueHint: string | null = null;

  /** The Shark's offer, recorded once. Off-book by design: the debt predates
   *  the week, so nothing touches state.cash, state.invoices, or
   *  dayChoices() — the paired-choice experiment and the 5-day balance are
   *  untouched. Ledger rules (TRACK_A_SPEC A1): chapter 1, day 0, an
   *  experimentId with NO ch1_/ch2_/ch3_ prefix (irrationalityProfile counts
   *  those), npc set but NEVER feePaid (costOfNotActing would inflate),
   *  deferred false. */
  function prologueRecord(chosen: string, decision: "accept" | "decline", consequence: string): void {
    state.prologueChoice = chosen; // drives the mid-week shadow beat if the debt was kept
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
      chosenOptionId: chosen,
      deferred: false,
      npc: { npc: "The Shark", decision },
      immediateConsequence: consequence,
    });
  }

  function prologuePick(kind: "take" | "refuse" | "counter"): void {
    state.prologueDone = true; // per-run: resume skips the re-offer
    if (kind === "counter") return counterOffer(); // move 2: his final terms
    const took = kind === "take";
    prologueRecord(
      took ? "take_70" : "refuse",
      took ? "accept" : "decline",
      took
        ? "Settled off the books — the old debt is gone; this week's till never saw it."
        : "Refused. The debt stays yours; the street keeps its own books.",
    );
    // The take has a real, visible consequence: the discount the Shark keeps
    // (£720 of £2,400) funds a market stall — the street grows on everyone's
    // lateness, his profit on yours included. Refusing lights nothing.
    deps.noteStreet({ flair: true, prologueLit: took });
    prologueHint = took
      ? `The old debt is gone — settled at seventy. ${money(Math.round(2400 * 0.3), 0)} of it stayed on the street, and one more stall is lit because of it.`
      : "The whole debt is still yours — nothing lit for him tonight.";
    deps.say("shark", SHARK_PROLOGUE[took ? "accept" : "refuse"]);
    shutters();
  }

  /** Move 2 — the counter bounced. His first offer was the anchor; your
   *  eighty-five bought a laugh and a final "seventy or nothing". Same terms
   *  as before, but now as an ultimatum: take it, or walk with the whole
   *  debt. Both are real outcomes — recorded, and differently visible on
   *  the street. */
  function counterOffer(): void {
    clear(dayPanel);
    dayPanel.append(
      el("h3", { text: "Night. The Late Market." }),
      el("p", { class: "lm-hint", text: "He didn't move. Seventy, tonight — or nothing." }),
      councilGrid(PROLOGUE_COUNCIL.counter, el("div", { class: "lm-choices lm-await" },
        ...(() => {
          const take = choiceButton("Take the seventy", `The debt is gone — ${money(Math.round(2400 * 0.3), 0)} stays on the street`, () => {
            prologueRecord("counter_then_take_70", "accept",
              "Countered at 85 — he came back at seventy, tonight or nothing. You took it. The old debt is gone; the discount lit a stall.");
            deps.noteStreet({ flair: true, prologueLit: true });
            prologueHint = `You tried for eighty-five and got his number back. The debt is gone — ${money(Math.round(2400 * 0.3), 0)} stayed on the street, and one more stall is lit because of it.`;
            deps.say("shark", SHARK_PROLOGUE.accept);
            shutters();
          });
          take.classList.add("lm-choice-trap");
          const walk = choiceButton("Walk away", "The debt stays yours — nothing lights for him", () => {
            prologueRecord("counter_then_refuse", "decline",
              "Countered at 85 — he came back at seventy, tonight or nothing. You walked. The debt stays yours; nothing lit for him.");
            prologueHint = "You tried for eighty-five, then walked. The whole debt is still yours — nothing lit for him tonight.";
            deps.say("shark", SHARK_PROLOGUE.refuse);
            shutters();
          });
          walk.classList.add("lm-choice-primary");
          return [take, walk];
        })(),
      )),
    );
    root.classList.add("lm-shark-stage");
    deps.say("shark", SHARK_PROLOGUE.counter, () => {
      root.classList.remove("lm-shark-stage");
      dayPanel.querySelector(".lm-choices")?.classList.remove("lm-await");
    });
    persist();
  }

  function shutters(): void {
    streetAusterity(true); // still pre-ledger: the offer is a scene, not a book
    clear(dayPanel);
    dayPanel.append(
      el("h3", { text: "Night. The Late Market." }),
      ...(prologueHint ? [el("p", { class: "lm-hint", text: prologueHint })] : []),
      // Recast (Nov 15): the usher line was Zana's — but she is the enforcer,
      // not a concierge (canon: web/DESIGN.md "Zana = chase/enforce"). The
      // guide/teacher voice is Siki's, so she opens the shutters beat.
      speakerPara("siki", "The street keeps its books whether you open or not. Yours begin the moment you open the shutters."),
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
      case 1: return `Harborne ${money(2400)} — chase: here tomorrow.`;
      case 2: return landing > 0
        ? `${money(landing)} landed. Quayline ${money(2000)} due today.`
        : `Quayline ${money(2000)} due today. In hand: ${gbp(netPosition(state))}.`;
      case 3: return `Last: Harborne ${money(2400)} again — lands after close.`;
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

  /** Dusk→dawn veil between days (~640ms). Reduced motion skips it — the
   *  day still turns, just without the animation. */
  function dayBreak(next: () => void): void {
    if (reducedMotion) { next(); return; }
    const veil = el("div", { class: "lm-daybreak", "aria-hidden": "true" });
    document.body.append(veil);
    window.setTimeout(() => { veil.remove(); next(); }, 640);
  }

  /** The night deepens across the week — the backdrop tint shifts a step
   *  per day so the close feels earned, not just labelled. */
  const DAY_TINTS = ["#141428", "#171230", "#1b0e2c"] as const;
  /** One whisper per day: the street keeps living while you decide. */
  const DAY_WHISPERS = [
    "The Factor was seen at the north gate, counting other people's days.",
    "Someone's awning is still warm. Nobody knows whose.",
    "The Collector counts money that isn't his. He sleeps fine.",
  ] as const;

  function showDay(): void {
    if (state.done) return debrief();
    streetAusterity(false); // Day 1: the ledger chrome arrives with the money
    streetCompact(true);
    root.classList.add("lm-beat-compact");
    const day = state.day;
    document.documentElement.style.setProperty("--lm-bg-deep", DAY_TINTS[day - 1] ?? DAY_TINTS[0]);
    // One whisper per day: the street keeps living while you decide. A clean
    // run gets its own dread on the last morning — the hungry street knows
    // whose fault the quiet is. (The trap paths already carry the drama;
    // the good run must not also be the blank one.)
    if (day === 3 && !reacted.defer && !reacted.skipped) {
      deps.whisper?.("Three days, and nothing of yours has fed the street. It's watching you for it.");
    } else {
      deps.whisper?.(DAY_WHISPERS[(day - 1) % DAY_WHISPERS.length]!);
    }
    deps.sceneDay?.(day);
    lantern.hidden = false; till.hidden = false; ledgerStrip.hidden = false;
    renderChrome();
    root.append(till, dayPanel, ledgerStrip, lantern);
    const choices = dayChoices(state, day);
    const scene = DAY_SCENE[day];
    clear(dayPanel);
    const choicesEl = el("div", { class: "lm-choices" },
      ...choices.map((c) => {
        const b = choiceButton(c.label, c.detail, () => pick(c.id));
        // The engine's own kind rides the card — hover reveals what kind
        // of move this is (real data, not invented framing).
        b.classList.add(`lm-kind-${c.kind}`);
        // Visual weight: primary moves the till, traps feed the street,
        // easy work is deliberately quiet.
        if (c.kind === "chase" || c.kind === "pay_bill") b.classList.add("lm-choice-primary");
        else if (c.kind === "defer" || c.kind === "skip_bill") b.classList.add("lm-choice-trap");
        else b.classList.add("lm-choice-quiet");
        return b;
      }),
    );
    dayPanel.append(
      el("h3", { "aria-label": `Day ${day} of ${CH1_DAYS}` },
        `Day ${day} of ${CH1_DAYS}`, weekDots(day)),
      el("p", { class: "lm-hint", text: dayHint(day) }),
      // The council: Siki and Zana flank the options on the UK path (the
      // souq keeps its own Arabic flow — see COUNCIL's canon note).
      !isSouq() && COUNCIL[day]
        ? councilGrid(COUNCIL[day]!, choicesEl)
        : choicesEl,
    );
    // Zana's clock on the pair days: ten seconds, then the invoice sits —
    // not chasing IS deferring, so standing still is the trap option. The
    // bill day stays untimed on purpose (resource clarity beats pressure).
    // Armed only once the day's council has landed, so the timer never
    // races the voice.
    if (day === PAIR_A_DAY || day === PAIR_B_DAY) {
      const deferId = choices.find((c) => c.kind === "defer")?.id;
      const c = beatClock(dayPanel, {
        experimentId: day === PAIR_A_DAY ? "ch1_present_pair_a" : "ch1_present_pair_b",
        seconds: 10,
        calm: reducedMotion,
        onTimeout: () => { if (deferId) pick(deferId); },
      });
      clock = c;
      const arm = () => c.arm();
      if (isSouq() && day === 1) deps.say("siki", SOUQ_VO.ch1Intro, arm);
      else if (!isSouq()) speakCouncil(day, arm);
      else if (scene) deps.say(scene.speaker, scene.line, arm);
    } else {
      clock?.cancel();
      clock = null;
      // Souq day 1 gets its own cold-open line (the baked AR take carries
      // the AED figures); the EN day scenes stay canonical on the UK path.
      if (isSouq() && day === 1) deps.say("siki", SOUQ_VO.ch1Intro);
      else if (!isSouq()) speakCouncil(day);
      else if (scene) deps.say(scene.speaker, scene.line);
    }
  }

  /** The council speaks — Zana's read first (she's the situation), Siki's
   *  answer second (she's the lesson). One voice at a time, chained through
   *  onDone; the pair-day clock (if any) arms only after both land. The
   *  one-shot moments take over a slot rather than adding a third line —
   *  the surprise is the line, not an extra one.
   *
   *  CRAFT: the cards speak from their own seats — the karaoke highlight
   *  runs inside the counsel card and the card glows while its take plays.
   *  No duplicate bubble is stacked above the panel (the card already
   *  carries the text — a bubble would show the same sentence twice). The
   *  Shark-shadow visitation is the exception: it's a moment, not a
   *  counsel, so it keeps its bubble over the shadow sweep. */
  function speakCouncil(day: number, arm?: () => void): void {
    const c = COUNCIL[day];
    if (!c) return;
    let zana = c.zana;
    let visitation = false;
    // The Shark's shadow: once, mid-week, only if the old debt was kept.
    // The shadow's MESSAGE depends on how you've played: trap runs get the
    // menace; disciplined runs get his revised number — clean books are the
    // worst news he's had all week, and they cost him. The good path gets
    // its own drama, not the quiet version of the trap path's.
    if (day >= 2 && !reacted.shadow && state.prologueChoice && !state.prologueChoice.endsWith("take_70")) {
      reacted.shadow = true;
      zana = !reacted.defer && !reacted.skipped ? MOMENT_COUNTER_78 : MOMENT_SHADOW;
      visitation = true;
      deps.streetFx?.("shark-shadow");
    }
    const speakInSeat = (speaker: "siki" | "zana", text: string, done: (() => void) | undefined): void => {
      const card = dayPanel.querySelector<HTMLElement>(`.lm-counsel.${speaker}`);
      const seat = dayPanel.querySelector<HTMLElement>(`.lm-counsel.${speaker} .lm-counsel-text`);
      if (!card || !seat) { deps.say(speaker, text, done); return; }
      card.classList.add("lm-counsel-speaking");
      deps.say(speaker, text, () => {
        card.classList.remove("lm-counsel-speaking");
        done?.();
      }, seat);
    };
    const sikiRead = () => speakInSeat("siki", c.siki, arm);
    if (visitation) deps.say("zana", zana, sikiRead);
    else speakInSeat("zana", zana, sikiRead);
  }

  function pick(choiceId: string): void {
    if (state.done || state.day > CH1_DAYS) return;
    clock?.picked(choiceId);
    clock = null;
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
    // being fed and the bill being killed, the Collector marks the account
    // he'd rather buy than let you chase. Collected and fired AFTER
    // finishDay — its clear(root) would eat the bubbles, and an unbaked
    // line's bubble IS its text. One voice at a time; if two fire, the
    // later (the consequential one) is the line that lands.
    const afterBeat: Array<[Speaker, string]> = [];
    if (effects.collected > 0 && !reacted.collect) {
      reacted.collect = true;
      afterBeat.push(["siki", "There it is — the full face, on your till, not the street's."]);
    }
    if (effects.streetNote === "deferral" && !reacted.defer) {
      reacted.defer = true;
      // UK fiction only: the bark names the £2,400 (the souq's figures are
      // dirhams and its own lawful-fee story).
      if (!isSouq()) afterBeat.push(["zana", MOMENT_DEFER_FIRST]);
    }
    if (effects.day === BILL.dueDay && state.bill.paidDay !== null && !reacted.bill) {
      reacted.bill = true;
      afterBeat.push(["zana", "Nobody owns a piece of your week now. Quayline is paid."]);
    }
    if (effects.streetNote === "bill_skipped" && !reacted.skipped) {
      reacted.skipped = true;
      afterBeat.push(["collector", MOMENT_BILL_CAMEO]);
    }
    // The till-empty ending is the angel's one dramatic moment: Siki's
    // triage goes LAST (after Zana's kill-mark, if any) so it's the line
    // still on screen when the books close. (Unreachable from showDay:
    // going red ends the week at the day close, never a morning.)
    if (state.done && state.endedEarly === "till_empty" && !reacted.triage) {
      reacted.triage = true;
      afterBeat.push(["siki", MOMENT_TRIAGE]);
    }
    finishDay(effects);
    // Voice the beats in order, chained through onDone so each is heard
    // before the next (with one beat this is the single say it always was).
    let bi = 0;
    const speakBeat = (): void => {
      if (bi >= afterBeat.length) return;
      const [speaker, line] = afterBeat[bi++]!;
      deps.say(speaker, line, speakBeat);
    };
    speakBeat();
  }

  function finishDay(effects: DayEffect): void {
    clear(root); // re-render chrome with a pop on the till
    root.append(till, dayPanel, ledgerStrip, lantern);
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
    // Consequence-feel: the books themselves react. The ledger strip
    // shudders as value sheds; the street blinks when one of its stalls
    // shutters on landing money. The arithmetic IS the animation — no
    // minigame invented, the numbers just refuse to sit still.
    if (streetFigure > 0) {
      ledgerStrip.classList.add("lm-ledger-shed");
      window.setTimeout(() => ledgerStrip.classList.remove("lm-ledger-shed"), 900);
    }
    if (effects.collected > 0) deps.streetFx?.("shutter-blink");
    const figure = effects.cashDelta !== 0
      ? (effects.cashDelta > 0 ? `+${gbp(effects.cashDelta)}` : `−${gbp(-effects.cashDelta)}`)
      : null;
    if (streetBeat) {
      // Compact street beat: the art carries the beat (painterly standard,
      // same left-object grammar as the market pick), the figure sits
      // beside the title — not stacked above it — so the beat fits one
      // viewport with the till on screen.
      const beatArt = effects.streetNote === "bill_skipped" ? "assets/sprites/parchment.png" : "assets/sprites/factor.png";
      dayPanel.classList.add("lm-street-beat");
      const head = el("div", { class: "lm-beat-head" },
        el("img", { class: "lm-beat-art", src: beatArt, alt: "", "aria-hidden": "true" }),
        el("div", { class: "lm-beat-titles" },
          el("h3", { text: effects.streetNote === "bill_skipped" ? "The bill stays." : "You left it." }),
          ...(streetFigure > 0 ? [el("p", { class: "lm-take", text: gbp(streetFigure) })] : []),
        ),
      );
      dayPanel.append(head);
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
      // The week turns over with a breath of dawn, not a cut — the place
      // keeps moving while the player decides again.
      dayPanel.append(el("div", { class: "lm-choices" }, choiceButton("Next day", "", () => dayBreak(showDay))));
    }
    persist();
  }

  // Two beats: the street's number, then the two prices. The bias is named
  // only when the two Harborne choices differed.
  function debrief(): void {
    const entries = deps.pairEntries();
    const deferred = entries.filter((e) => e.deferred);
    const lines = deferralLines(state);
    // What never landed by the close — priced or not. A day-3 deferral
    // starts its wait after the close, so it has no priced line item, but
    // the debrief must still count it "on the street" or it contradicts
    // the ledger strip sitting right below it.
    const horizon = state.lastPlayedDay > 0 ? state.lastPlayedDay : CH1_DAYS;
    const pricedIds = new Set(lines.map((l) => l.invoiceId));
    const unpricedOwed = state.invoices
      .filter((i) => !pricedIds.has(i.id))
      .filter((i) => i.chasedDay === null && (i.paidDay === null || i.paidDay > horizon) && (i.deferredDay !== null || i.dueDay <= horizon))
      .reduce((t, i) => t + i.principal, 0);
    const stillOut = lines.filter((l) => l.stillOwed).reduce((t, l) => t + l.principal, 0) + unpricedOwed;
    const statutoryFloor = lines.reduce((t, l) => t + l.statutory, 0);
    const differed = entries.length >= 2 && deferred.length === 1;
    const bothChased = entries.length >= 2 && deferred.length === 0;
    const bothLeft = entries.length >= 2 && deferred.length >= 2;

    function beatPrices(): void {
      clear(dayPanel);
      const price = statutoryFloor === 0 && stillOut > 0
        ? `${gbp0(stillOut)} did not come in. Its wait starts after the close — this week priced none of it.`
        : isSouq()
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
      dayPanel.classList.add("lm-debrief");
      dayPanel.append(
        el("div", { class: "lm-beat-head" },
          el("img", { class: "lm-beat-art", src: "assets/sprites/siki.png", alt: "", "aria-hidden": "true" }),
          el("div", { class: "lm-beat-titles" },
            el("h3", { text: "Two prices, one wait" }),
            el("p", { class: "lm-take", text: gbp0(statutoryFloor) }),
          ),
        ),
        speakerPara("siki", price),
        // The deduction quotes the player's own sequence — path-aware, not
        // a generic bias card. The bias naming lands after the evidence.
        ...(entries.length >= 2 ? [el("p", {
          class: "lm-hint",
          text: `Your two rows, side by side: ${entries.slice().sort((a, b) => a.day - b.day).map((e) => `Day ${e.day} — ${e.deferred ? "left it" : "chased"}`).join(" · ")}.`,
        })] : []),
        ...(state.endedEarly === "till_empty"
          ? [el("p", { class: "lm-hint", text: "The till ran empty. That is the price of leaving the bill." })]
          : []),
        ...(() => {
          // Zana's clock read-back: the timed beats you didn't get to are
          // the same money the debrief is pricing. Observation, not judgement.
          const called = gutCalls()
            .filter((c) => c.experimentId.startsWith("ch1_present_pair") && c.chosenOptionId === "time_called")
            .length;
          return called > 0
            ? [el("p", { class: "lm-hint", text: `Zana's clock called it ${called === 1 ? "once" : `${called} times`} — the money you didn't get to is on that list.` })]
            : [];
        })(),
        el("div", { class: "lm-choices" },
          choiceButton("When an invoice falls due, chase it the same day", "Chapter 1 complete", () => closeBooks()),
        ),
      );
    }

    clear(dayPanel);
    dayPanel.classList.add("lm-debrief");
    const takenLine = stillOut > 0
      ? `${gbp0(stillOut)} is still on the street.`
      : "Nothing you were owed is still sitting out.";
    deps.say("siki", stillOut > 0 ? "That money is still on the street." : takenLine);
    const rows = entries.map((e) => {
      const verb = e.chosenOptionId === "chase_now" ? "chased" : "left it";
      return el("li", { class: `lm-debrief-chip${verb === "chased" ? " is-home" : ""}`, text: `Day ${e.day} · ${verb}` });
    });
    dayPanel.append(
      el("div", { class: "lm-beat-head" },
        el("img", { class: "lm-beat-art", src: "assets/sprites/awning.png", alt: "", "aria-hidden": "true" }),
        el("div", { class: "lm-beat-titles" },
          el("h3", { text: "Still on the street" }),
          el("p", { class: "lm-take", text: gbp0(stillOut) }),
        ),
      ),
      ...(rows.length ? [el("ul", { class: "lm-debrief-chips" }, ...rows)] : []),
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
