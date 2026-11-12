/**
 * Chapter 1 — "The Cost of Tomorrow" (GDD A2; recovery plan §2): pure simulator.
 *
 * 5 trading days (cut from 20 — jam build, docs/game/RECOVERY_PLAN.md):
 *   Day 1 — an invoice is ALREADY two days overdue: on screen from the first frame.
 *   Day 2 — ordinary; whatever is owed is still chasable.
 *   Day 3 — engineered pair A: chase vs defer, today-cost framing (3 vs 11 days).
 *   Day 4 — the ordinary day where the till can empty: the supplier's bill comes due.
 *   Day 5 — engineered pair B: both payoffs moved out (11 vs 19 — delayed comparison).
 *
 * The pair (Days 3 & 5) is a controlled experiment: BOTH payoffs of BOTH arms
 * land AFTER the week closes (day 6/14 and day 16/24). The deferral always
 * costs the same 8-day slip; the only variable is how far the payoffs sit
 * relative to today. Nothing in-week is printed on the buttons, so the
 * debrief's framing attribution is honest.
 *
 * The in-week money comes from the ordinary invoice (dueDay 0): chase it on
 * Day 1 and £1,300-class money lands Day 3 — the day before the bill. That
 * chase is what makes the bill payable; a player who doesn't chase early
 * cannot cover the bill without running the till red.
 *
 * The bill is a LIABILITY, not a cash outflow that's done with it: skipping
 * it starts a £40/day late charge that grows the amount owed. The till
 * position (cash minus unpaid bill liability) is what can empty — by paying
 * short OR by letting the liability outrun the walk-in trade.
 *
 * Every deferral accrues statutory interest/compensation-forgone silently,
 * surfaced only as the drifting lantern number (the street's take). The
 * ledger's "worth today" is a DIFFERENT quantity: the invoice's market value,
 * which FALLS as it ages (GDD §2 discounting lesson) — your money worth less
 * while the street's books grow. No DOM in this file.
 *
 * Copy rule (recovery plan §4): choice buttons carry no statute, no annualised
 * rate, no "honest". The law appears in the debrief + assumptions sheet only.
 */
import { statutoryCompensation, statutoryInterest } from "../engine/rates";
import type { LedgerEntry } from "../engine/ledger";
import { mulberry32, type Rng } from "../engine/rng";

export const CH1_DAYS = 5;
export const PAIR_A_DAY = 3;
export const PAIR_B_DAY = 5;
/** Ordinary-invoice chase clears in 2 days, so a Day-1 chase LANDS in-week
 *  (day 3, before the bill). Real ~30-day waits live in the assumptions
 *  sheet, never on a button. */
export const CHASE_CLEAR_DAYS = 2;
/**
 * The controlled pair — BOTH arms pay AFTER the week, in BOTH days:
 *   Day 3: chase → day 6 (in 3) · defer → day 14 (in 11)
 *   Day 5: chase → day 16 (in 11) · defer → day 24 (in 19)
 * The deferral is always the same 8-day slip; only the distance to BOTH
 * payoffs changes (near vs far). A "pays before Friday" vs "pays after this
 * week" asymmetry would leak the answer through the button, so neither arm
 * of either day lands inside the chapter.
 */
export const PAIR_A_CHASE_CLEAR_DAYS = 3;
export const PAIR_A_DEFER_CLEAR_DAYS = 11;
export const PAIR_B_CHASE_CLEAR_DAYS = 11;
export const PAIR_B_DEFER_CLEAR_DAYS = 19;
/** The deferral's cost, in days — identical in both arms. */
export const DEFER_EXTRA_DAYS = PAIR_A_DEFER_CLEAR_DAYS - PAIR_A_CHASE_CLEAR_DAYS;

/**
 * The supplier bill — the day the till can actually empty (recovery plan
 * §2.2). £2,400 against a £1,100 start: the only way to pay it cleanly is
 * the money a Day-1 chase brings in on Day 3. Skip it and the liability
 * grows £40/day; the till POSITION (cash minus liability) is what empties.
 */
export const BILL = {
  client: "Quayline Foods",
  amount: 1600,
  dueDay: 4,
  /** Per-day late charge that grows the unpaid liability — and leaves the
   *  till (the net position it erodes is what the player watches die). */
  lateFee: 40,
} as const;

export const START_CASH = 1100;

export type FunTask = "restock" | "reply_emails" | "customer_chat";

export interface Ch1Invoice {
  id: string;
  client: string;
  principal: number;
  /** Day the invoice first becomes chasable. 0 = overdue before the chapter. */
  dueDay: number;
  chasedDay: number | null;
  paidDay: number | null;
  deferrals: number;
}

export interface Ch1Bill {
  client: string;
  amount: number;
  dueDay: number;
  lateFee: number;
  paidDay: number | null;
  /** Day it went unpaid (explicit skip, or missed by any other choice). */
  skippedDay: number | null;
}

/**
 * The "worth today" of an invoice: what the street would pay for it RIGHT
 * NOW. It FALLS as the invoice ages (GDD §2: the discounting/NPV lesson as
 * one UI element) — a fresh invoice trades at face, an old one for less.
 * Indicative haircut (fictional · based on typical UK ranges): 1% of face
 * per day past due, capped at 25%. This is deliberately NOT the statutory
 * entitlement (a larger, real legal floor, named in the debrief); the card
 * and the street's books move in opposite directions on the same screen —
 * your money worth less while the street's take grows by the same £.
 *
 * Pure curve — no paid/chased clamping — because `valueShedToday` diffs it
 * between two days and the clamps would corrupt the deltas.
 */
export const WORTH_HAIRCUT_PER_DAY = 0.01;
export const WORTH_HAIRCUT_CAP = 0.25;

/**
 * Days an invoice has been past due on `day` — the one number the card, the
 * "worth today" haircut, and the shed curve all share, so the card's
 * "N days overdue · worth today £X" and the street's take are the same
 * arithmetic. A due-day-0 invoice is 2 days overdue on Day 1; a due-day-3
 * invoice is 0 on Day 3 (due today) and 1 on Day 4.
 */
export function daysOverdueOn(inv: Ch1Invoice, day: number): number {
  return day > inv.dueDay ? day - inv.dueDay : 0;
}

/**
 * The "worth today" of an invoice: what the street would pay for it RIGHT
 * NOW. It FALLS as the invoice ages (GDD §2: the discounting/NPV lesson as
 * one UI element) — a fresh invoice trades at face, an old one for less.
 * Indicative haircut (fictional · based on typical UK ranges): 2% of face
 * per day past due, capped at 30%. This is deliberately NOT the statutory
 * entitlement (a larger, real legal floor, named in the debrief); the card
 * and the street's books move in opposite directions on the same screen —
 * your money worth less while the street's take grows by the same £.
 */
export function worthToday(inv: Ch1Invoice, day: number): number {
  const haircut = Math.min(WORTH_HAIRCUT_CAP, daysOverdueOn(inv, day) * WORTH_HAIRCUT_PER_DAY);
  return Math.round(inv.principal * (1 - haircut));
}

export interface Ch1State {
  day: number;
  cash: number;
  invoices: Ch1Invoice[];
  bill: Ch1Bill;
  /**
   * The street's take this run: the market value the invoices shed while they
   * sat unchased (the exact mirror of the card's falling "worth today").
   * Accumulated day-by-day with `valueShedForDay`, so the debrief's line
   * items — which sum the same daily function — match it to the penny.
   */
  streetTake: number;
  /** Late charges tallied to the street for the unpaid supplier bill. */
  lateFees: number;
  done: boolean;
  /** Set when the till ran empty — a genuine loss state, not a moral one. */
  endedEarly: "till_empty" | null;
  /** Last day the chapter actually played (loss runs stop before CH1_DAYS). */
  lastPlayedDay: number;
}

export interface DayChoice {
  id: string;
  label: string;
  detail: string;
  kind: "fun" | "chase" | "defer" | "pay_bill" | "skip_bill";
  invoiceId?: string;
}

export interface DayEffect {
  day: number;
  cashDelta: number;
  lanternDelta: number;
  /** Late charges that reached the street's tally today. */
  lateFeeDelta: number;
  /** Invoices whose payment landed in the till this morning. */
  collected: number;
  lines: string[];
  /** Stall changed state today (drives the street's specific-stall animation). */
  streetNote?: "deferral" | "bill_skipped";
}

/** The engineered pair — structurally identical, timing framing only. */
export interface EngineeredPair {
  experimentId: string;
  first: { day: 3; framingVariable: "timing_today_vs_later"; invoice: { id: string; client: string; principal: number } };
  second: { day: 5; framingVariable: "timing_delayed_both"; invoice: { id: string; client: string; principal: number } };
}

export const ENGINEERED_PAIR: EngineeredPair = {
  experimentId: "ch1_present_pair_a",
  first: { day: 3, framingVariable: "timing_today_vs_later", invoice: { id: "inv-a", client: "Harborne Print Works", principal: 2400 } },
  second: { day: 5, framingVariable: "timing_delayed_both", invoice: { id: "inv-b", client: "Harborne Print Works", principal: 2400 } },
};

const CLIENTS = [
  "Barrow & Sons",
  "Milk Street Caſe",
  "Fenwick Lighting",
  "Salt & Twine",
  "Ropewalk Dry Goods",
] as const;

function makeBill(): Ch1Bill {
  return {
    client: BILL.client,
    amount: BILL.amount,
    dueDay: BILL.dueDay,
    lateFee: BILL.lateFee,
    paidDay: null,
    skippedDay: null,
  };
}

/**
 * The till POSITION, not just the cash: money in the till minus the unpaid
 * supplier bill liability (face + the late charges that have grown onto it).
 * This is what can actually empty — a player runs red by paying the bill
 * short, OR by skipping it and letting the liability sit there (the till
 * shows what is truly yours once that debt is set aside). The street's late
 * charges are already in `state.lateFees`, so the liability is face + fees.
 */
export function netPosition(state: Ch1State): number {
  const billOwed = state.bill.skippedDay !== null && state.bill.paidDay === null;
  return state.cash - (billOwed ? state.bill.amount + state.lateFees : 0);
}

/**
 * Roster (deterministic from seed):
 *  - inv-early: seeded client/principal, dueDay 0 — two days overdue from frame one.
 *  - inv-a / inv-b: the engineered pair, FIXED, never jittered — the debrief's
 *    framing attribution is only honest if Days 3 and 5 always offer the pair.
 */
export function createCh1State(seed: number): { state: Ch1State; rng: Rng } {
  const rng = mulberry32(seed);
  const earlyClient = CLIENTS[Math.floor(rng() * CLIENTS.length)]!;
  const earlyPrincipal = 900 + Math.floor(rng() * 18) * 100; // £900–£2,600 in £100 steps
  const state: Ch1State = {
    day: 1,
    cash: START_CASH,
    invoices: [
      { id: "inv-early", client: earlyClient, principal: earlyPrincipal, dueDay: 0, chasedDay: null, paidDay: null, deferrals: 0 },
      { id: "inv-a", client: "Harborne Print Works", principal: 2400, dueDay: PAIR_A_DAY, chasedDay: null, paidDay: null, deferrals: 0 },
      { id: "inv-b", client: "Harborne Print Works", principal: 2400, dueDay: PAIR_B_DAY, chasedDay: null, paidDay: null, deferrals: 0 },
    ],
    bill: makeBill(),
    streetTake: 0,
    lateFees: 0,
    done: false,
    endedEarly: null,
    lastPlayedDay: 0,
  };
  return { state, rng };
}

/**
 * The value an invoice sheds DURING `day` (start-of-day → next morning).
 * This is the "your lateness is someone else's business model" number made
 * literal: the street buys aged invoices at a discount, and that discount IS
 * its revenue. It is the exact mirror of the card's falling "worth today" —
 * at the start of day D the lantern reads face − worth(D), the same £ the
 * card just showed your invoice losing. (The statutory entitlement is a
 * larger, real legal floor — it is priced separately for the debrief and
 * never shown on the card.)
 *
 * Pure (no chased/paid clamps): the accrual loop and `pricedDeferral` both
 * supply the window, so the line items sum to the lantern by construction.
 */
export function valueShedForDay(inv: Ch1Invoice, day: number): number {
  // The drop visible between the morning of `day` and the morning of the next
  // day: the card's "worth today" at `day` vs at `day+1` — exactly the £ the
  // player will watch it lose. Uses the same `daysOverdueOn` count as the card.
  const at = (d: number): number =>
    Math.round(inv.principal * (1 - Math.min(WORTH_HAIRCUT_CAP, daysOverdueOn(inv, d) * WORTH_HAIRCUT_PER_DAY)));
  return at(day) - at(day + 1);
}

/**
 * Offer for one day — one action. The day's shape:
 *   1: fun | chase/defer (inv-early, already overdue)
 *   2: fun | chase/defer (whatever is chasable)
 *   3: fun | PAIR A chase/defer
 *   4: pay/skip bill | fun | chase/defer (if anything is still chasable)
 *   5: fun | PAIR B chase/defer
 */
export function dayChoices(state: Ch1State, day: number): DayChoice[] {
  const pair = ENGINEERED_PAIR;
  const isPairDay = day === pair.first.day || day === pair.second.day;
  const choices: DayChoice[] = [];

  // Fun-now task: a small immediate cash + the social pull of easy work.
  const fun: Record<FunTask, { label: string; detail: string }> = {
    restock: { label: "Restock the shelves", detail: "Satisfying, done by lunch. Later today it pays a little walk-in trade." },
    reply_emails: { label: "Reply to the morning emails", detail: "Warm, manageable, finished. Feels like a real day's work." },
    customer_chat: { label: "Catch up with the regulars", detail: "The kind of work nobody ever calls urgent — so it always gets done." },
  };
  const funKey = (["restock", "reply_emails", "customer_chat"] as FunTask[])[(day - 1) % 3]!;
  choices.push({ id: `fun-${day}`, label: fun[funKey].label, detail: fun[funKey].detail, kind: "fun" });

  if (state.bill.dueDay === day && state.bill.paidDay === null && state.bill.skippedDay === null) {
    // The ordinary day where the till can empty. No dressed-up numbers — just
    // the bill, what it costs, and what skipping costs.
    const canCover = state.cash >= state.bill.amount;
    choices.push({
      id: `pay_bill-${day}`,
      label: `Pay ${state.bill.client} — £${state.bill.amount}`,
      detail: canCover
        ? "Due today. Paid, the stall stays open."
        : "Due today. The till can't cover it — you'd run into the red.",
      kind: "pay_bill",
    });
    choices.push({
      id: `skip_bill-${day}`,
      label: "Leave the bill",
      detail: `£${state.bill.amount} stays owed, and £${state.bill.lateFee} a day comes out of the till tomorrow — the street's money.`,
      kind: "skip_bill",
    });
  }

  const chasable = state.invoices.filter((i) => i.paidDay === null && i.chasedDay === null && i.dueDay <= day);
  if (chasable.length > 0) {
    // On engineered-pair days the pair invoice must be the offered choice —
    // otherwise an older ticket could hijack the slot and muddy the
    // debrief's framing attribution (A1 discipline).
    const pairInv = chasable.find(
      (i) =>
        (day === pair.first.day && i.id === pair.first.invoice.id) ||
        (day === pair.second.day && i.id === pair.second.invoice.id),
    );
    const inv = (pairInv ?? chasable[0])!;
    const isEngineered = isPairDay && pairInv === inv;
    let chaseDetail: string;
    let deferDetail: string;
    if (isEngineered && day === pair.first.day) {
      // Pair A — today-cost framing: both payoffs after the week, near/far.
      chaseDetail = `Chase now — the money lands in ${PAIR_A_CHASE_CLEAR_DAYS} days.`;
      deferDetail = `Defer — the money lands in ${PAIR_A_DEFER_CLEAR_DAYS} days instead.`;
    } else if (isEngineered && day === pair.second.day) {
      // Pair B — both payoffs moved out (delayed comparison).
      chaseDetail = `Chase now — the money lands in ${PAIR_B_CHASE_CLEAR_DAYS} days.`;
      deferDetail = `Defer — the money lands in ${PAIR_B_DEFER_CLEAR_DAYS} days instead.`;
    } else {
      chaseDetail = `Chase — the money lands in ${CHASE_CLEAR_DAYS} days.`;
      deferDetail = "Defer — the money lands later than that.";
    }
    choices.push({ id: `chase-${inv.id}`, label: `Chase ${inv.client} — £${inv.principal}`, detail: chaseDetail, kind: "chase", invoiceId: inv.id });
    choices.push({ id: `defer-${inv.id}`, label: "Leave it for tomorrow", detail: deferDetail, kind: "defer", invoiceId: inv.id });
  }
  return choices;
}

/** The clear-days for a chase made on `day` — controlled pair, both arms out. */
function chaseClearDays(day: number, inv: Ch1Invoice): number {
  const pair = ENGINEERED_PAIR;
  if (day === pair.first.day && inv.id === pair.first.invoice.id) return PAIR_A_CHASE_CLEAR_DAYS;
  if (day === pair.second.day && inv.id === pair.second.invoice.id) return PAIR_B_CHASE_CLEAR_DAYS;
  return CHASE_CLEAR_DAYS;
}

/**
 * Resolve one day. Morning: collect payments that land today. Then the player's
 * one action. Then the street's charges and the silent cost engine accrue.
 */
export function resolveDay(
  state: Ch1State,
  day: number,
  choiceId: string,
): { effects: DayEffect; engineeredEntry?: Omit<LedgerEntry, "id"> } {
  const invoice = state.invoices.find((i) => choiceId.endsWith(i.id));
  const deferred = choiceId.startsWith("defer-");

  let cashDelta = 0;
  const lines: string[] = [];
  let streetNote: DayEffect["streetNote"];
  let collected = 0;

  // Morning — money that was promised lands in the till today.
  for (const inv of state.invoices) {
    if (inv.paidDay === day) {
      cashDelta += inv.principal;
      collected += 1;
      lines.push(`£${inv.principal} from ${inv.client} lands in the till.`);
    }
  }

  if (choiceId.startsWith("fun-")) {
    // Deterministic walk-in trade (seeded design: replay must be identical).
    // While the supplier's bill sits unpaid, nobody delivers — the stall
    // trades quiet for the rest of the week.
    const billDead = state.bill.skippedDay !== null && state.bill.paidDay === null;
    const trade = billDead ? 0 : 140 + ((day * 37) % 60); // £140–£199, small, now
    cashDelta += trade;
    lines.push(billDead
      ? "The shelves are quiet — nobody's delivered since the bill went unpaid."
      : "The shelves are tidy. A regular buys thread and pleasantries.");
  } else if (choiceId.startsWith("chase-") && invoice) {
    invoice.chasedDay = day;
    invoice.paidDay = day + chaseClearDays(day, invoice);
    lines.push(
      invoice.paidDay <= CH1_DAYS
        ? `Zana's first-stage reminder goes out. ${invoice.client} pays in ${chaseClearDays(day, invoice)} days.`
        : `Zana's first-stage reminder goes out. ${invoice.client} will pay after this week closes.`,
    );
  } else if (deferred && invoice) {
    invoice.deferrals += 1;
    streetNote = "deferral";
    lines.push("Tomorrow. Tomorrow is always tidy in your head.");
  } else if (choiceId.startsWith("pay_bill-")) {
    state.bill.paidDay = day;
    cashDelta -= state.bill.amount;
    lines.push(`${state.bill.client}'s bill is paid. The till takes the hit — now.`);
  } else if (choiceId.startsWith("skip_bill-")) {
    state.bill.skippedDay = day;
    streetNote = "bill_skipped";
    lines.push("Left. The street takes a £40 late charge tomorrow.");
  } else {
    lines.push("The day closes quietly.");
  }

  // The bill's due day passed without payment — it goes unpaid, whether the
  // player skipped it on purpose or simply chose something else.
  if (state.bill.dueDay === day && state.bill.paidDay === null && state.bill.skippedDay === null) {
    state.bill.skippedDay = day;
    streetNote = streetNote ?? "bill_skipped";
    lines.push("The supplier's bill goes unpaid — the street takes the late charge.");
  }

  // Late charge accrues from the day after the bill went unpaid — the street's
  // own money. Tallied, not deducted from the till.
  let lateFeeDelta = 0;
  if (state.bill.skippedDay !== null && day > state.bill.skippedDay && state.bill.paidDay === null) {
    lateFeeDelta = state.bill.lateFee;
    state.lateFees += lateFeeDelta;
  }

  // The street's engine: every day an invoice sits unchased and overdue sheds
  // market value that the street keeps — the exact mirror of the card's
  // falling "worth today" (your money worth less, the street's books up by
  // the same £). A chase on `day` stops that invoice from shedding on `day`.
  // (The statutory entitlement is a larger, real legal floor — tallied
  // separately for the debrief, never shown on the card.)
  let valueShedDelta = 0;
  for (const inv of state.invoices) {
    if (inv.chasedDay !== null && inv.chasedDay <= day) continue; // chase stops the shedding, from the chase day
    if (inv.paidDay !== null && inv.paidDay <= day) continue; // already collected
    if (day <= inv.dueDay) continue; // not yet past due
    valueShedDelta += valueShedForDay(inv, day);
  }
  const lanternDelta = valueShedDelta;

  const engineeredEntry = buildEngineeredEntry(day, choiceId, invoice, deferred);
  state.day = day + 1;
  state.lastPlayedDay = day;
  state.cash += cashDelta;
  state.streetTake += valueShedDelta;
  // A genuine loss state: the till position runs empty — cash short of the
  // unpaid bill liability, or cash itself negative. Checked BEFORE the
  // week-end flag, so a till that empties on the last day still ends the
  // chapter as a loss, not a quiet close.
  if (netPosition(state) < 0) {
    state.done = true;
    state.endedEarly = "till_empty";
  }
  if (day >= CH1_DAYS) state.done = true;
  return {
    effects: { day, cashDelta, lanternDelta, lateFeeDelta, collected, lines, streetNote },
    engineeredEntry,
  };
}

/** Only pair days emit ledger entries; others are informational. */
function buildEngineeredEntry(
  day: number,
  choiceId: string,
  _invoice: Ch1Invoice | undefined,
  deferred: boolean,
): Omit<LedgerEntry, "id"> | undefined {
  const pair = ENGINEERED_PAIR;
  const isA = day === pair.first.day;
  const isB = day === pair.second.day;
  if (!isA && !isB) return undefined;
  const chosen = deferred ? "defer" : choiceId.startsWith("chase-") ? "chase_now" : "fun_now";
  // Deferred = the player did not chase on the pair day — an explicit "defer"
  // OR the easy work done instead. Both are the deferral the debrief replays.
  return {
    chapter: 1,
    day,
    experimentId: pair.experimentId,
    prompt: isA
      ? "Harborne is overdue. Chase today, or tomorrow?"
      : "Harborne again (new invoice). Chase today, or tomorrow?",
    optionsShown: [
      { id: "chase_now", label: "Chase now", framingVariable: isA ? "timing_today_vs_later" : "timing_delayed_both", isDefault: false },
      { id: "defer", label: "Defer", framingVariable: isA ? "timing_today_vs_later" : "timing_delayed_both", isDefault: false },
    ],
    chosenOptionId: chosen,
    deferred: chosen !== "chase_now",
    immediateConsequence: deferred
      ? isA
        ? "Another day of accrual begins — the money now lands 8 days later."
        : "Both ends just moved further out."
      : "Chase in motion.",
    deferredConsequence: deferred ? `Statutory entitlement accrues silently from day ${pair.first.day}.` : undefined,
  };
}

/**
 * The debrief's line-item replay (replaces the old "rule armed from the start"
 * counterfactual, which was £0 by construction — recovery plan §2.3): each
 * invoice the player let sit, priced exactly the way the lantern accrues it —
 * the sum of `valueShedForDay` over the days it sat past-due and unchased.
 * On the player's own data: the street's real earnings, nothing invented.
 */
export interface DeferralLine {
  invoiceId: string;
  client: string;
  principal: number;
  /** A pair day the player actively deferred, if one. */
  deferredDay: number | null;
  /** Chapter days the invoice sat past-due and unchased. */
  daysLate: number;
  /** The street's take from this invoice (the value it shed while it sat). */
  streetTake: number;
  /** The statutory entitlement over the same window — the real legal floor. */
  statutory: number;
  /** Still accruing after the chapter closed — the number keeps growing. */
  stillOwed: boolean;
}

/**
 * Price an invoice's deferral over [startDay, endDay] — the exact window the
 * lantern accrued it over (past due, not yet chased):
 *   streetTake = Σ valueShedForDay  (the mirror of the card's falling worth)
 *   statutory  = interest × days + the one-time compensation if the window
 *                includes the first overdue day (the real Act figure).
 */
function pricedDeferral(inv: Ch1Invoice, startDay: number, endDay: number): { take: number; statutory: number; days: number } | null {
  const days = endDay - startDay + 1;
  if (days <= 0) return null;
  let take = 0;
  for (let d = startDay; d <= endDay; d++) take += valueShedForDay(inv, d);
  const interest = days * statutoryInterest(inv.principal, 1);
  const compensation = inv.dueDay >= startDay && inv.dueDay <= endDay ? statutoryCompensation(inv.principal) : 0;
  return { take, statutory: interest + compensation, days };
}

export function deferralLines(state: Ch1State): DeferralLine[] {
  const out: DeferralLine[] = [];
  // The lantern accrues through the last day actually played — loss runs stop
  // early, so the line items must too (they are the street's earnings, nothing
  // more and nothing less).
  const horizon = state.lastPlayedDay > 0 ? state.lastPlayedDay : CH1_DAYS;
  for (const inv of state.invoices) {
    // The exact window the accrual used: first day past due, to the day
    // before the chase (or the horizon). Chased on the first day past due →
    // no window, never the player's deferral.
    const startDay = Math.max(inv.dueDay + 1, 1);
    const endDay = inv.chasedDay !== null ? inv.chasedDay - 1 : horizon;
    const p = pricedDeferral(inv, startDay, endDay);
    if (!p) continue;
    const pairDay = inv.deferrals > 0 && (inv.dueDay === PAIR_A_DAY || inv.dueDay === PAIR_B_DAY) ? inv.dueDay : null;
    out.push({
      invoiceId: inv.id,
      client: inv.client,
      principal: inv.principal,
      deferredDay: pairDay,
      daysLate: p.days,
      streetTake: p.take,
      statutory: p.statutory,
      stillOwed: inv.chasedDay === null,
    });
  }
  return out.sort((x, y) => x.daysLate - y.daysLate);
}
