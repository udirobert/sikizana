/**
 * Second Week — procedural scored replay generator (pure simulator, no DOM).
 *
 * A five-day week dealt by seed: 3–5 invoices from a fixed client pool, one
 * supplier bill, one easy task per day. The engine REUSES chapter 1's audited
 * arithmetic everywhere it exists — the game's pitch is "arithmetic audited
 * in public", so nothing here forks it:
 *   · chase clears in CHASE_CLEAR_DAYS (1), deferral in DEFER_CLEAR_DAYS (10)
 *     — imported from ch1.ts, never redefined here.
 *   · the street's take is ch1's valueShedForDay curve (the 2%/day,
 *     30%-cap "worth today" haircut), accrued day by day.
 *   · the till POSITION and the early "till empty" end are ch1's netPosition.
 *   · the lawful price in the read-back is ch1's deferralLines (statutory
 *     interest + s.5A compensation over the exact window the street tally
 *     accrued) — imported and re-called, never reimplemented.
 *
 * What is NEW here is only the DEAL (seeded roster, seeded bill, 5-day
 * horizon) and one documented refinement: the invoice that commits to the
 * 10-day payoff when the player does something else is the one OFFERED that
 * morning (captured before the choice applies). ch1's fixed roster only ever
 * had one live invoice per day; a procedural week can hold a backlog, and
 * chasing the oldest must not silently commit the next one too. One decision
 * per invoice per day — the same commitment rule as ch1.
 */
import { money } from "./market";
import { mulberry32, rngInt, pick, type Rng } from "./rng";
import {
  CHASE_CLEAR_DAYS,
  DEFER_CLEAR_DAYS,
  deferralLines,
  netPosition,
  valueShedForDay,
  type Ch1Bill,
  type Ch1Invoice,
  type Ch1State,
  type DayChoice,
  type DayEffect,
} from "../chapters/ch1";

export const WEEK2_DAYS = 5;
/** Start cash, dealt in £50 steps inside [900, 1400]. */
export const WEEK2_START_CASH_MIN = 900;
export const WEEK2_START_CASH_MAX = 1400;
/** Invoice principals, dealt in £50 steps inside [500, 4200]. */
export const WEEK2_PRINCIPAL_MIN = 500;
export const WEEK2_PRINCIPAL_MAX = 4200;
/** The one supplier bill, dealt in £50 steps inside [1400, 2400]. */
export const WEEK2_BILL_MIN = 1400;
export const WEEK2_BILL_MAX = 2400;
/** Per-day late charge on the unpaid bill — the same £40 as ch1's bill. */
export const WEEK2_BILL_LATE_FEE = 40;

/**
 * The whole week runs on ch1's state shape, so every ch1 helper
 * (netPosition, worthToday, daysOverdueOn, deferralLines) keeps working on
 * it unchanged. No forked fields, no shadow arithmetic.
 */
export type Week2State = Ch1State;

/** The easy work — the ch1 fun-task spirit, one per day, five of them. */
export type Week2FunTask = "restock" | "reply_emails" | "customer_chat" | "window_display" | "count_stock";

const FUN_ORDER: readonly Week2FunTask[] = ["restock", "reply_emails", "customer_chat", "window_display", "count_stock"];

const FUN_TASKS: Record<Week2FunTask, { label: string; detail: string }> = {
  restock: { label: "Restock the shelves", detail: "Satisfying, done by lunch. Later today it pays a little walk-in trade." },
  reply_emails: { label: "Reply to the morning emails", detail: "Warm, manageable, finished. Feels like a real day's work." },
  customer_chat: { label: "Catch up with the regulars", detail: "The kind of work nobody ever calls urgent — so it always gets done." },
  window_display: { label: "Rearrange the window display", detail: "An hour of paint crates and price cards. The stall looks busier than the books." },
  count_stock: { label: "Count the stockroom", detail: "Quiet, methodical, nobody waiting. The easiest good day there is." },
};

/** The day's easy task — fixed schedule, same every replay of the shape. */
export function funTaskForDay(day: number): Week2FunTask {
  return FUN_ORDER[(day - 1) % FUN_ORDER.length]!;
}

/** Plausible small-trade clients — fixed pool, sampled without replacement. */
const CLIENT_POOL = [
  "Hadley & Frost",
  "Bluewick Café",
  "Osterley Joinery",
  "Marlow Sign Co.",
  "Vesper Linens",
  "Kiln & Quill Press",
  "Tanners Row Bakehouse",
  "Grove Street Printers",
  "Calloway Freight",
  "Ferrier & Sage",
] as const;

/** Suppliers for the week's one bill. */
const SUPPLIER_POOL = [
  "Harbourgate Produce",
  "Millbrook Wholesale",
  "Stonefield Supplies",
  "Caster & Grain",
] as const;

/** Seeded Fisher–Yates — replay must re-encounter the identical week. */
function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/** "1 day" / "10 days" — the chase is next morning, so singular is common. */
function dayWord(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/**
 * Deal the week. Deterministic per seed:
 *   · cash: £900–£1,400 in £50 steps
 *   · 3–5 invoices: fixed-pool clients, £500–£4,200 principals in £50 steps,
 *     1–2 already overdue when the shutters open, the rest on distinct days
 *     spread across the week (at most one comes due per day, so the offer
 *     slot is never starved)
 *   · exactly one supplier bill: £1,400–£2,400 in £50 steps, due day 2 or 3,
 *     £40/day late charge
 */
export function createWeek(seed: number): { state: Week2State; rng: Rng } {
  const rng = mulberry32(seed);
  const cash = 50 * rngInt(rng, WEEK2_START_CASH_MIN / 50, WEEK2_START_CASH_MAX / 50);
  const count = rngInt(rng, 3, 5);
  const overdueCount = rngInt(rng, 1, Math.min(2, count - 1));
  // Distinct in-week due days, shuffled — the spread across the week.
  const inWeek = shuffled(rng, [1, 2, 3, 4, 5]).slice(0, count - overdueCount);
  const dueDays = shuffled(rng, [...Array.from({ length: overdueCount }, () => 0), ...inWeek]);
  const clients = shuffled(rng, CLIENT_POOL).slice(0, count);
  const invBase = rngInt(rng, 300, 800);
  const invoices: Ch1Invoice[] = clients.map((client, i) => ({
    id: `w2-inv-${i}`,
    client: `${client} · INV-${invBase + i}`,
    principal: 50 * rngInt(rng, WEEK2_PRINCIPAL_MIN / 50, WEEK2_PRINCIPAL_MAX / 50),
    dueDay: dueDays[i] ?? 0,
    chasedDay: null,
    deferredDay: null,
    paidDay: null,
    deferrals: 0,
  }));
  // Display order = due order (the offer logic sorts anyway; the strip reads nicer).
  invoices.sort((a, b) => a.dueDay - b.dueDay);
  const bill: Ch1Bill = {
    client: pick(rng, SUPPLIER_POOL),
    amount: 50 * rngInt(rng, WEEK2_BILL_MIN / 50, WEEK2_BILL_MAX / 50),
    dueDay: rngInt(rng, 2, 3),
    lateFee: WEEK2_BILL_LATE_FEE,
    paidDay: null,
    skippedDay: null,
  };
  const state: Week2State = {
    day: 1,
    cash,
    invoices,
    bill,
    streetTake: 0,
    lateFees: 0,
    done: false,
    endedEarly: null,
    lastPlayedDay: 0,
  };
  return { state, rng };
}

/**
 * The oldest still-undecided live invoice (dueDay ≤ today, not chased, not
 * deferred, not paid) — ch1's offer rule verbatim.
 */
function oldestDue(state: Week2State, day: number): Ch1Invoice | undefined {
  return state.invoices
    .filter((i) => i.dueDay <= day && i.paidDay === null && i.chasedDay === null && i.deferredDay === null)
    .sort((a, b) => a.dueDay - b.dueDay)[0];
}

/**
 * One day's offer — same shape and order as ch1: the decision first (the
 * bill, then the day's invoice), the easy work trailing. Same 1-vs-10 offer
 * on every invoice, ch1's copy rules (no statute, no rate on a button).
 */
export function dayChoices(state: Week2State, day: number): DayChoice[] {
  const out: DayChoice[] = [];
  if (state.bill.dueDay === day && state.bill.paidDay === null && state.bill.skippedDay === null) {
    // Money promised for this morning is already in the till when the bill
    // is paid — resolveDay collects before it spends.
    out.push({
      id: `pay_bill-${day}`,
      label: `Pay ${state.bill.client} — ${money(state.bill.amount)}`,
      detail: "Due today. Paid out of the drawer.",
      kind: "pay_bill",
    });
    out.push({
      id: `skip_bill-${day}`,
      label: "Leave the bill",
      detail: `${money(state.bill.amount)} stays owed.`,
      kind: "skip_bill",
    });
  }
  const due = oldestDue(state, day);
  if (due) {
    out.push({
      id: `chase-${due.id}`,
      label: `Chase ${due.client} — ${money(due.principal)}`,
      detail: `Chase — the full ${money(due.principal)} lands in ${dayWord(CHASE_CLEAR_DAYS)}.`,
      kind: "chase",
      invoiceId: due.id,
    });
    out.push({
      id: `defer-${due.id}`,
      label: "Leave it for tomorrow",
      detail: `Defer — the full ${money(due.principal)} lands in ${dayWord(DEFER_CLEAR_DAYS)} instead.`,
      kind: "defer",
      invoiceId: due.id,
    });
  }
  const fun = FUN_TASKS[funTaskForDay(day)];
  out.push({ id: `fun-${day}`, label: fun.label, detail: fun.detail, kind: "fun" });
  return out;
}

/**
 * Lock an invoice into the deferral arm — ch1's commitment rule: once set,
 * the invoice never re-enters the offer; the money lands DEFER_CLEAR_DAYS
 * after the day it was left.
 */
function commitDeferral(invoice: Ch1Invoice, day: number, lines: string[]): void {
  invoice.deferredDay = day;
  invoice.deferrals += 1;
  invoice.paidDay = day + DEFER_CLEAR_DAYS;
  lines.push("Tomorrow. Tomorrow is always tidy in your head.");
}

/**
 * Resolve one day, mirroring ch1's resolveDay semantics: morning collections,
 * one action, the missed-bill rule, the silent deferral commitment, the late
 * charge, the street's shed tally, then the netPosition end check BEFORE the
 * week-end flag (a till that empties on day 5 still ends as a loss).
 *
 * The one refinement over ch1 (documented in the module header): the invoice
 * that silently commits is the one offered that morning, captured before the
 * choice applies.
 */
export function resolveDay(state: Week2State, day: number, choiceId: string): { effects: DayEffect } {
  const invoice = state.invoices.find((i) => choiceId.endsWith(i.id));
  const deferred = choiceId.startsWith("defer-");
  const offeredAtOpen = oldestDue(state, day);

  let cashDelta = 0;
  const lines: string[] = [];
  let streetNote: DayEffect["streetNote"];
  let collected = 0;

  // Morning — money that was promised lands in the till today.
  for (const inv of state.invoices) {
    if (inv.paidDay === day) {
      cashDelta += inv.principal;
      collected += 1;
      lines.push(`${money(inv.principal)} from ${inv.client} lands in the till.`);
    }
  }

  if (choiceId.startsWith("fun-")) {
    // Deterministic walk-in trade (replay identical — the same formula ch1
    // uses). While the supplier's bill sits unpaid, nobody delivers.
    const billDead = state.bill.skippedDay !== null && state.bill.paidDay === null;
    const trade = billDead ? 0 : 140 + ((day * 37) % 60);
    cashDelta += trade;
    lines.push(billDead
      ? "The shelves are quiet — nobody's delivered since the bill went unpaid."
      : "The shelves are tidy. A regular buys thread and pleasantries.");
  } else if (choiceId.startsWith("chase-") && invoice) {
    invoice.chasedDay = day;
    invoice.paidDay = day + CHASE_CLEAR_DAYS;
    lines.push(
      invoice.paidDay <= WEEK2_DAYS
        ? `Zana's first-stage reminder goes out. ${invoice.client} pays in ${dayWord(CHASE_CLEAR_DAYS)}.`
        : `Zana's first-stage reminder goes out. ${invoice.client} will pay after this week closes.`,
    );
  } else if (deferred && invoice) {
    commitDeferral(invoice, day, lines);
    streetNote = "deferral";
  } else if (choiceId.startsWith("pay_bill-")) {
    state.bill.paidDay = day;
    cashDelta -= state.bill.amount;
    lines.push(`${state.bill.client}'s bill is paid. The till takes the hit — now.`);
  } else if (choiceId.startsWith("skip_bill-")) {
    state.bill.skippedDay = day;
    streetNote = "bill_skipped";
    lines.push(`Left. The street takes a ${money(state.bill.lateFee)} late charge tomorrow.`);
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

  // The day's offered invoice was not chased or explicitly deferred — it
  // commits to the 10-day payoff, whether the player said so or simply did
  // the easy work (ch1's rule; see the module header for the capture note).
  if (offeredAtOpen && !(choiceId.startsWith("chase-") || choiceId.startsWith("defer-"))) {
    commitDeferral(offeredAtOpen, day, lines);
    streetNote = streetNote ?? "deferral";
  }

  // Late charge accrues from the day after the bill went unpaid — the
  // street's own money, tallied, not deducted from the till.
  let lateFeeDelta = 0;
  if (state.bill.skippedDay !== null && day > state.bill.skippedDay && state.bill.paidDay === null) {
    lateFeeDelta = state.bill.lateFee;
    state.lateFees += lateFeeDelta;
  }

  // The street's engine — ch1's exact shed loop: every day an invoice sits
  // unchased and overdue sheds market value the street keeps; a chase on
  // `day` stops the shedding from the chase day.
  let shed = 0;
  for (const inv of state.invoices) {
    if (inv.chasedDay !== null && inv.chasedDay <= day) continue;
    if (inv.paidDay !== null && inv.paidDay <= day) continue;
    if (day <= inv.dueDay) continue;
    shed += valueShedForDay(inv, day);
  }

  state.day = day + 1;
  state.lastPlayedDay = day;
  state.cash += cashDelta;
  state.streetTake += shed;
  // A genuine loss state: the till POSITION runs empty — checked before the
  // week-end flag, so a till that empties on the last day ends as a loss.
  if (netPosition(state) < 0) {
    state.done = true;
    state.endedEarly = "till_empty";
  }
  if (day >= WEEK2_DAYS) state.done = true;
  return { effects: { day, cashDelta, lanternDelta: shed, lateFeeDelta, collected, lines, streetNote } };
}

/** The read-back's scored view of a finished (or stopped) week. */
export interface Week2Summary {
  /** The score, lower is better: value shed by ageing invoices + late fees. */
  streetTook: number;
  /** The shed component of the score. */
  streetTake: number;
  /** The late-fee component of the score. */
  lateFees: number;
  /** Forgone statutory on left-owing invoices — ch1's deferralLines math. */
  lawfulPrice: number;
  /** Face value still sitting out (informational). */
  leftOwing: number;
  /** Final cash in the drawer. */
  kept: number;
  endedEarly: boolean;
  lastPlayedDay: number;
  /** One-line verdict — see verdictLine. */
  verdict: string;
}

/**
 * The scored read-back. The lawful price is ch1's own pricing (deferralLines:
 * statutory interest over the exact window the street tally accrued, plus the
 * one-time s.5A compensation), restricted to invoices still left owing. Call
 * on a played state — deferralLines clips windows at lastPlayedDay.
 */
export function weekSummary(state: Week2State): Week2Summary {
  const owedLines = deferralLines(state).filter((l) => l.stillOwed);
  const lawfulPrice = owedLines.reduce((t, l) => t + l.statutory, 0);
  const leftOwing = owedLines.reduce((t, l) => t + l.principal, 0);
  const streetTook = state.streetTake + state.lateFees;
  return {
    streetTook,
    streetTake: state.streetTake,
    lateFees: state.lateFees,
    lawfulPrice,
    leftOwing,
    kept: state.cash,
    endedEarly: state.endedEarly === "till_empty",
    lastPlayedDay: state.lastPlayedDay,
    verdict: verdictLine(streetTook, lawfulPrice),
  };
}

/**
 * One-line verdict — a simple heuristic on the two prices: what the street
 * took versus what the law prices the same wait at. All figures via money(),
 * so UK shows £ and the souq shows AED.
 */
export function verdictLine(streetTook: number, lawfulPrice: number): string {
  if (streetTook <= 0) {
    return "The street took nothing this week. Nothing waited — that is the cheapest week there is.";
  }
  const street = money(streetTook);
  if (lawfulPrice <= 0) {
    return `The street took ${street} in late charges and shed value. No invoice was left owing, so the law prices none of it.`;
  }
  const lawful = money(lawfulPrice);
  if (streetTook >= lawfulPrice) {
    return `The street took ${street} — more than the ${lawful} the law prices the same wait at. The wait itself was the expensive part.`;
  }
  return `The street took ${street}, and the law prices the same wait at ${lawful}. Two prices for one habit — both were yours to keep.`;
}
