/**
 * Chapter 1 — "The Cost of Tomorrow" (GDD A2): pure simulator.
 *
 * 20 trading days · invoices arrive every ~3 days (deterministic from seed).
 * The engineered pair (Day 4 in-today-frame, Day 12 both-payoffs-delayed)
 * shares an experimentId so the debrief can attribute timing framing honestly.
 * Every deferral accrues statutory interest/compensation-forgone silently,
 * surfaced only as the drifting lantern number. No DOM in this file.
 */
import { statutoryCompensation, statutoryEntitlement, statutoryInterest } from "../engine/rates";
import type { LedgerEntry } from "../engine/ledger";
import { mulberry32, type Rng } from "../engine/rng";

export const CH1_DAYS = 20;
export const CHASE_CLEAR_DAYS = 30; // chase now → cash lands in 30 days
export const DEFER_CLEAR_DAYS = 38.3; // defer → cash in 30 + 8.3 (GDD A2)

export type FunTask = "restock" | "reply_emails" | "customer_chat";

export interface Ch1Invoice {
  id: string;
  client: string;
  principal: number;
  /** Day the invoice first becomes chasable (already overdue on arrival). */
  dueDay: number;
  chasedDay: number | null;
  paidDay: number | null;
  deferrals: number;
}

export interface Ch1State {
  day: number;
  cash: number;
  invoices: Ch1Invoice[];
  /** Lantern number: cumulative statutory entitlement forgone this run. */
  forgoneInterest: number;
  forgoneCompensation: number;
  zanaArmed: boolean;
  done: boolean;
  /** Day the player first enlisted Zana, null if never. */
  zanaDay: number | null;
}

export interface DayChoice {
  id: string;
  label: string;
  detail: string;
  kind: "fun" | "chase" | "defer" | "arm_zana" | "rest";
  invoiceId?: string;
}

export interface DayEffect {
  day: number;
  cashDelta: number;
  lanternDelta: number;
  lines: string[];
}

/** The engineered pair — structurally identical, timing framing only. */
export interface EngineeredPair {
  experimentId: string;
  first: { day: 4; framingVariable: "timing_today_vs_later"; invoice: { id: string; client: string; principal: number } };
  second: { day: 12; framingVariable: "timing_delayed_both"; invoice: { id: string; client: string; principal: number } };
}

export const ENGINEERED_PAIR: EngineeredPair = {
  experimentId: "ch1_present_pair_a",
  first: { day: 4, framingVariable: "timing_today_vs_later", invoice: { id: "inv-a", client: "Harborne Print Works", principal: 2400 } },
  second: { day: 12, framingVariable: "timing_delayed_both", invoice: { id: "inv-b", client: "Harborne Print Works", principal: 2400 } },
};

const CLIENTS = [
  "Barrow & Sons",
  "Milk Street Caſe",
  "Quayline Foods",
  "Fenwick Lighting",
  "Salt & Twine",
  "Ropewalk Dry Goods",
] as const;

/** Invoice arrival days spread over the 20-day window (every ~3 days, rng-jittered). */
export function arrivalDays(rng: Rng): number[] {
  const days: number[] = [];
  for (let d = 2; d <= CH1_DAYS; d += 3) {
    const jitter = Math.floor(rng() * 3); // 0–2 day drift
    const day = Math.min(CH1_DAYS, d + jitter);
    if (!days.includes(day)) days.push(day);
  }
  return days;
}

export function createCh1State(seed: number): { state: Ch1State; rng: Rng } {
  const rng = mulberry32(seed);
  const state: Ch1State = {
    day: 1,
    cash: 1200,
    invoices: [],
    forgoneInterest: 0,
    forgoneCompensation: 0,
    zanaArmed: false,
    done: false,
    zanaDay: null,
  };
  // The engineered pair is FIXED, never jittered — the debrief's framing
  // attribution is only honest if Days 4 and 12 always offer the pair.
  const pairInvoices = [ENGINEERED_PAIR.first, ENGINEERED_PAIR.second].map((side) => ({
    id: side.invoice.id,
    client: side.invoice.client,
    principal: side.invoice.principal,
    dueDay: side.day,
    chasedDay: null,
    paidDay: null,
    deferrals: 0,
  }));
  state.invoices.push(...pairInvoices);
  for (const dueDay of arrivalDays(rng)) {
    rng(); // keep the consumed stream identical regardless of collisions
    if (dueDay === ENGINEERED_PAIR.first.day || dueDay === ENGINEERED_PAIR.second.day) continue; // pair day already placed
    const principal = 900 + Math.floor(rng() * 18) * 100; // £900–£2,600 in £100 steps
    const client = CLIENTS[state.invoices.length % CLIENTS.length]!;
    state.invoices.push({ id: `inv-${dueDay}`, client, principal, dueDay, chasedDay: null, paidDay: null, deferrals: 0 });
  }
  state.invoices.sort((x, y) => x.dueDay - y.dueDay);
  return { state, rng };
}

/** Statutory entitlement silently forgone by one invoice-day of lateness. */
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
 * Offer for one day. Zana armed ⇒ chase actions auto-chain: the chase is the
 * *default* (pre-selected) and deferral costs a visible, explicit note — the
 * commitment-device thesis rendered as UI default, not willpower.
 */
export function dayChoices(state: Ch1State, day: number): DayChoice[] {
  const chasable = state.invoices.filter((i) => i.paidDay === null && i.chasedDay === null && i.dueDay <= day);
  const pair = ENGINEERED_PAIR;
  const choices: DayChoice[] = [];

  // Fun-now task: a small immediate cash + the social pull of easy work.
  const fun: Record<FunTask, { label: string; detail: string }> = {
    restock: { label: "Restock the shelves", detail: "Satisfying, done by lunch. Later today it pays a little walk-in trade." },
    reply_emails: { label: "Reply to the morning emails", detail: "Warm, manageable, finished. Feels like a real day's work." },
    customer_chat: { label: "Catch up with the regulars", detail: "The kind of work nobody ever calls urgent — so it always gets done." },
  };
  const funKey = (["restock", "reply_emails", "customer_chat"] as FunTask[])[(day - 1) % 3]!;
  choices.push({ id: `fun-${day}`, label: fun[funKey].label, detail: fun[funKey].detail, kind: "fun" });

  if (chasable.length > 0) {
    // On engineered-pair days the pair invoice must be the offered choice —
    // otherwise an older back ticket could hijack the slot and muddy the
    // debrief's framing attribution (A1 discipline).
    const pairInv = chasable.find(
      (i) =>
        (day === pair.first.day && i.id === pair.first.invoice.id) ||
        (day === pair.second.day && i.id === pair.second.invoice.id),
    );
    const inv = (pairInv ?? chasable[0])!;
    const isEngineered = (day === pair.first.day || day === pair.second.day);
    const framing = isEngineered
      ? day === pair.first.day
        ? "Chase now — the money lands in 30 days." // today-cost framing
        : "Chase now — the money lands in 52 days." // both payoffs moved out
      : "Chase — the money lands in 30 days.";
    choices.push({ id: `chase-${inv.id}`, label: `Chase ${inv.client} — £${inv.principal}`, detail: framing, kind: "chase", invoiceId: inv.id });
    choices.push({
      id: `defer-${inv.id}`,
      label: "Leave it for tomorrow",
      detail: isEngineered && day === pair.second.day
        ? "Defer — the money lands in 60 days instead of 52."
        : "Defer — the money lands in 38 days instead of 30.",
      kind: "defer",
      invoiceId: inv.id,
    });
  }

  if (day >= 14 && !state.zanaArmed) {
    choices.push({
      id: `arm_zana-${day}`,
      label: "Enlist Zana — arm the chase ladder",
      detail: "Stage-1 reminders auto-chain from tomorrow. The boring task does itself.",
      kind: "arm_zana",
    });
  }
  return choices;
}

/**
 * Resolve one day. Returns effects +, for engineered-pair days, the ledger
 * entry to record (recorded by the screen driver into the DecisionLedger).
 */
export function resolveDay(
  state: Ch1State,
  day: number,
  choiceId: string,
): { effects: DayEffect; engineeredEntry?: Omit<LedgerEntry, "id"> } {
  const invoice = state.invoices.find((i) => choiceId.endsWith(i.id));
  const deferred = choiceId.startsWith("defer-");
  const deferredWithoutAction = state.invoices.some(
    (i) => i.paidDay === null && i.chasedDay === null && i.dueDay <= day,
  ) && !choiceId.startsWith("chase-") && !deferred;

  let cashDelta = 0;
  const lines: string[] = [];

  if (choiceId.startsWith("fun-")) {
    // Deterministic walk-in trade (seeded design: replay must be identical).
    cashDelta += 140 + ((day * 37) % 60); // £140–£199, small, now
    lines.push("The shelves are tidy. A regular buys thread and pleasantries.");
  } else if (choiceId.startsWith("chase-") && invoice) {
    invoice.chasedDay = day;
    invoice.paidDay = day + Math.round(CHASE_CLEAR_DAYS);
    lines.push(`Zana's first-stage reminder goes out. ${invoice.client} pays in 30 days.`);
  } else if (deferred && invoice) {
    invoice.deferrals += 1;
    lines.push("Tomorrow. Tomorrow is always tidy in your head.");
  } else if (choiceId.startsWith("arm_zana-")) {
    state.zanaArmed = true;
    state.zanaDay = day;
    lines.push("Zana takes the ladder. Stage-1 reminders chain automatically from tomorrow.");
  } else {
    lines.push("The day closes quietly.");
  }

  // Zana armed ⇒ auto-chain: any unchased, un-paid invoice chases tomorrow-1.
  if (state.zanaArmed && day >= (state.zanaDay ?? 0)) {
    for (const inv of state.invoices) {
      if (inv.paidDay === null && inv.chasedDay === null && inv.dueDay <= day + 1) {
        inv.chasedDay = day + 1;
        inv.paidDay = day + 1 + Math.round(CHASE_CLEAR_DAYS);
        lines.push(`[ladder] ${inv.client} chased automatically.`);
      }
    }
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

  const engineeredEntry = buildEngineeredEntry(day, choiceId, invoice, deferred || deferredWithoutAction);
  state.day = day + 1;
  state.cash += cashDelta;
  state.forgoneInterest += interestDelta;
  state.forgoneCompensation += compensationDelta;
  if (day >= CH1_DAYS) state.done = true;

  return {
    effects: { day, cashDelta, lanternDelta, lines },
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
  return {
    chapter: 1,
    day,
    experimentId: pair.experimentId,
    prompt: isA ? "Harborne is overdue. Chase today, or tomorrow?" : "Harborne again (new invoice). Chase today, or tomorrow?",
    optionsShown: [
      { id: "chase_now", label: "Chase now", framingVariable: isA ? "timing_today_vs_later" : "timing_delayed_both", isDefault: false },
      { id: "defer", label: "Defer", framingVariable: isA ? "timing_today_vs_later" : "timing_delayed_both", isDefault: false },
    ],
    chosenOptionId: chosen,
    deferred,
    immediateConsequence: deferred
      ? isA
        ? "Another day of accrual begins."
        : "Both ends just moved further out."
      : "Chase in motion; cash in 30 days.",
    deferredConsequence: deferred ? `Statutory entitlement accrues silently from day ${pair.first.day}.` : undefined,
  };
}

/**
 * The debrief's counterfactual: same seed, but the rule kept itself from the
 * start — every invoice chased the day it falls due. Pure — projects the
 * improvement against the player's actual run without re-simulating their
 * whole game. Unconditional: the rule does not depend on the player's choices.
 */
export function counterfactualForgone(seed: number): { interest: number; compensation: number } {
  const { state } = createCh1State(seed);
  let interest = 0;
  let compensation = 0;
  for (let day = 1; day <= CH1_DAYS; day++) {
    // Rule armed: chase every overdue invoice the day it falls due.
    for (const inv of state.invoices) {
      if (inv.paidDay === null && inv.chasedDay === null && inv.dueDay <= day) {
        inv.chasedDay = day;
        inv.paidDay = day + Math.round(CHASE_CLEAR_DAYS);
      }
    }
    for (const i of state.invoices) {
      if (i.chasedDay !== null || i.paidDay !== null) continue;
      if (day < i.dueDay) continue;
      const a = dailyAccrual(i, day);
      interest += a.interest;
      compensation += a.compensation;
    }
  }
  return { interest, compensation };
}
