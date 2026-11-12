/**
 * Chapter 1 — "The Cost of Tomorrow" (GDD A2; recovery plan §2): pure simulator.
 *
 * 5 trading days (cut from 20 — jam build, docs/game/RECOVERY_PLAN.md):
 *   Day 1 — an invoice is ALREADY two days overdue: on screen from the first frame.
 *   Day 2 — ordinary; whatever is owed is still chasable.
 *   Day 3 — engineered pair A: chase vs defer, today-cost framing (2 vs 10 days).
 *   Day 4 — the ordinary day where the till can empty: the supplier's bill comes due.
 *   Day 5 — engineered pair B: both payoffs moved out (20 vs 28 — delayed comparison).
 *
 * The pair (Days 3 & 5) shares an experimentId so the debrief can attribute
 * timing framing honestly — structurally identical choices, one variable changed.
 * A chase pays in 2 days, so money LANDS inside the chapter (collected each
 * morning) when the player acts early. Every deferral accrues statutory
 * interest/compensation-forgone silently, surfaced only as the drifting lantern
 * number. No DOM in this file.
 *
 * Copy rule (recovery plan §4): choice buttons carry no statute, no annualised
 * rate, no "honest". The law appears in the debrief + assumptions sheet only.
 */
import { statutoryCompensation, statutoryEntitlement, statutoryInterest } from "../engine/rates";
import type { LedgerEntry } from "../engine/ledger";
import { mulberry32, type Rng } from "../engine/rng";

export const CH1_DAYS = 5;
export const PAIR_A_DAY = 3;
export const PAIR_B_DAY = 5;
/** Chase pays in 2 days — money lands inside the chapter. Real ~30-day waits
 *  live in the assumptions sheet, never on a button (recovery plan §2.2). */
export const CHASE_CLEAR_DAYS = 2;
/** Pair A defer arm: the same money arrives 8 days later than a chase (the
 *  classic +8.3-day slip, scaled to the 5-day chapter). */
export const DEFER_EXTRA_DAYS = 8;
/** Pair B moves BOTH payoffs out (delayed-comparison arm): 20 vs 28 days. */
export const PAIR_B_CHASE_CLEAR_DAYS = 20;
export const PAIR_B_DEFER_CLEAR_DAYS = 28;

/** The supplier bill — the day the till can actually empty (recovery plan §2.2). */
export const BILL = {
  client: "Quayline Foods",
  amount: 1800,
  dueDay: 4,
  /** Per-day late charge, tallied to the street (their money, not the till's). */
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

export interface Ch1State {
  day: number;
  cash: number;
  invoices: Ch1Invoice[];
  bill: Ch1Bill;
  /** Lantern number: cumulative statutory entitlement forgone this run. */
  forgoneInterest: number;
  forgoneCompensation: number;
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
    bill: { client: BILL.client, amount: BILL.amount, dueDay: BILL.dueDay, lateFee: BILL.lateFee, paidDay: null, skippedDay: null },
    forgoneInterest: 0,
    forgoneCompensation: 0,
    lateFees: 0,
    done: false,
    endedEarly: null,
    lastPlayedDay: 0,
  };
  return { state, rng };
}

/** Statutory entitlement already forgone by one invoice's lateness to `day`. */
export function invoiceAccrual(inv: Ch1Invoice, day: number): { interest: number; compensation: number } {
  if (inv.paidDay !== null || day < inv.dueDay) return { interest: 0, compensation: 0 };
  const daysLate = day - inv.dueDay + 1;
  const e = statutoryEntitlement(inv.principal, Math.max(1, daysLate));
  return { interest: e.interest, compensation: e.compensation };
}

/**
 * One invoice-day of forgone entitlement: a single day's simple interest,
 * plus the fixed compensation exactly once — on the first day the invoice
 * sits overdue and unchased. The lantern needs the daily delta, not the
 * cumulative `invoiceAccrual` (which would re-count every prior day and
 * stack the one-off compensation daily).
 */
export function dailyAccrual(inv: Ch1Invoice, day: number): { interest: number; compensation: number } {
  if (inv.principal <= 0) return { interest: 0, compensation: 0 };
  return {
    interest: statutoryInterest(inv.principal, 1),
    compensation: day === inv.dueDay ? statutoryCompensation(inv.principal) : 0,
  };
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
      detail: "A £40 late charge starts tomorrow — and the street notices.",
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
      // Pair A — today-cost framing: one end near, one end far.
      chaseDetail = `Chase now — the money lands in ${CHASE_CLEAR_DAYS} days.`;
      deferDetail = `Defer — the money lands in ${CHASE_CLEAR_DAYS + DEFER_EXTRA_DAYS} days instead.`;
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

/** The clear-days for a chase made on `day` (pair B is the moved-out arm). */
function chaseClearDays(day: number, inv: Ch1Invoice): number {
  const pair = ENGINEERED_PAIR;
  if (day === pair.first.day && inv.id === pair.first.invoice.id) return CHASE_CLEAR_DAYS;
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
    // But if the supplier's bill went unpaid yesterday, nobody delivered.
    const billDead = state.bill.skippedDay === day - 1 && state.bill.paidDay === null;
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

  // Silent cost engine: every invoice-day of lateness accrues a daily delta.
  let interestDelta = 0;
  let compensationDelta = 0;
  for (const inv of state.invoices) {
    if (inv.chasedDay !== null || inv.paidDay !== null) continue;
    if (day < inv.dueDay) continue;
    const a = dailyAccrual(inv, day);
    interestDelta += a.interest;
    compensationDelta += a.compensation;
  }
  const lanternDelta = interestDelta + compensationDelta;

  const engineeredEntry = buildEngineeredEntry(day, choiceId, invoice, deferred);
  state.day = day + 1;
  state.lastPlayedDay = day;
  state.cash += cashDelta;
  state.forgoneInterest += interestDelta;
  state.forgoneCompensation += compensationDelta;
  if (day >= CH1_DAYS) state.done = true;
  // A genuine loss state: the till runs empty. The chapter ends here.
  if (state.cash < 0 && !state.done) {
    state.done = true;
    state.endedEarly = "till_empty";
  }
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
 * invoice the player let sit, priced at its real days × daily accrual. On the
 * player's own data, never against a score the game invented.
 */
export interface DeferralLine {
  invoiceId: string;
  client: string;
  principal: number;
  /** A pair day the player actively deferred, if one. */
  deferredDay: number | null;
  /** Days the invoice sat unchased through the chapter (or until the chase). */
  daysLate: number;
  interest: number;
  compensation: number;
  total: number;
  /** Still accruing after the chapter closed — the number keeps growing. */
  stillOwed: boolean;
}

/**
 * Price an invoice's deferral exactly the way the lantern accrues it: the sum
 * of `dailyAccrual` over the window the invoice sat unchased. This is what
 * makes the debrief's line items add up to the lantern's final reading —
 * the street's real earnings, on the player's own data.
 */
function pricedDeferral(inv: Ch1Invoice, endDay: number): { interest: number; compensation: number; days: number } | null {
  // Window the invoice sat unchased: the chapter days it was overdue on.
  const startDay = Math.max(inv.dueDay, 1);
  const days = endDay - startDay + 1;
  if (days <= 0) return null;
  const interest = days * statutoryInterest(inv.principal, 1);
  // The one-time compensation accrues on the first overdue day — only if that
  // day falls inside the window (a pre-existing overdue invoice, dueDay 0,
  // already spent its compensation before the chapter opened).
  const compensation = inv.dueDay >= 1 && inv.dueDay <= endDay ? statutoryCompensation(inv.principal) : 0;
  return { interest, compensation, days };
}

export function deferralLines(state: Ch1State): DeferralLine[] {
  const out: DeferralLine[] = [];
  // The lantern accrues through the last day actually played — loss runs stop
  // early, so the line items must too (they are the street's earnings, nothing
  // more and nothing less).
  const horizon = state.lastPlayedDay > 0 ? state.lastPlayedDay : CH1_DAYS;
  for (const inv of state.invoices) {
    // Chased the moment it was possible (or earlier) → never the player's deferral.
    if (inv.chasedDay !== null && inv.chasedDay <= Math.max(1, inv.dueDay)) continue;
    const endDay = inv.chasedDay !== null ? inv.chasedDay - 1 : horizon;
    const p = pricedDeferral(inv, endDay);
    if (!p) continue;
    const pairDay = inv.deferrals > 0 && (inv.dueDay === PAIR_A_DAY || inv.dueDay === PAIR_B_DAY) ? inv.dueDay : null;
    out.push({
      invoiceId: inv.id,
      client: inv.client,
      principal: inv.principal,
      deferredDay: pairDay,
      daysLate: p.days,
      interest: p.interest,
      compensation: p.compensation,
      total: p.interest + p.compensation,
      stillOwed: inv.chasedDay === null,
    });
  }
  return out.sort((x, y) => x.daysLate - y.daysLate);
}
