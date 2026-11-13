/**
 * Chapter 1 — "The Cost of Tomorrow" (GDD A2; recovery plan §2): pure simulator.
 *
 * 5 trading days (cut from 20 — jam build, docs/game/RECOVERY_PLAN.md):
 *   Day 1 — the first ordinary invoice is due (chase in 2 / defer in 10).
 *   Day 2 — a second ordinary invoice comes due (same 2-vs-10 offer).
 *   Day 3 — engineered PAIR A (Harborne, £2,400): chase (in 2) or defer (in
 *           10). The 2-day payoff LANDS on Day 5 — IN the week, on the till.
 *           This is the choice that moves the till the player is watching.
 *   Day 4 — the supplier's bill comes due (£2,000): pay it or leave it.
 *   Day 5 — engineered PAIR B (Harborne, £2,400): the SAME 2-vs-10 offer, but
 *           the 2-day payoff lands Day 7 — just AFTER the close, off screen.
 *
 * The pair (Days 3 & 5) is the controlled experiment (A1): BOTH days offer the
 * SAME numbers — "in 2 days" vs "in 10 days", the same 8-day slip. The only
 * variable is HOW NEAR the near payoff sits: Day 3's lands IN the week (visible
 * on the till the player is watching); Day 5's lands AFTER the close (abstract,
 * off screen). No between-days NUMBERS asymmetry, so nothing on a button leaks
 * the answer — the debrief's framing attribution stays honest. The tilt the
 * player feels is the present-bias one: the identical "in 2" feels near on Day
 * 3 (you can see it land) and far on Day 5 (it lands after the week).
 *
 * A deferral is a COMMITMENT, not a postponement: once the player defers an
 * invoice, it locks to the 10-day payoff and is NEVER re-offered — so a
 * deferred pair invoice cannot be re-presented with a shorter "in 2" payoff on
 * a later day. The controlled comparison therefore lasts the whole week, not
 * one morning (the round-2 leak, fixed).
 *
 * The till: the chase/defer choice on Day 3 moves it directly — chase and
 * £2,400 lands on Day 5; defer and that money leaves the week. The ordinary
 * invoices (Days 1 & 2) are what make the Day-4 bill payable: chase both early
 * and the bill is covered; do the easy work instead and skipping the bill
 * empties the till. The bill is a LIABILITY — skipping it starts a £40/day
 * late charge that grows the amount owed, and the till POSITION (cash minus
 * unpaid bill) is what empties.
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
/**
 * EVERY chase clears in 2 days, EVERY deferral in 10 — the same 2-vs-10 offer
 * on all four invoice days, so no button on any day leaks which is "better."
 * Real ~30-day waits live in the assumptions sheet, never on a button.
 */
export const CHASE_CLEAR_DAYS = 2;
export const DEFER_CLEAR_DAYS = 10;
/**
 * The controlled PAIR (Days 3 & 5) is the present-bias experiment (A1). Both
 * days offer the SAME numbers — "in 2 days" (chase) vs "in 10 days" (defer) —
 * the only variable is how NEAR the near payoff sits:
 *   Day 3: chase → day 5 (in 2, IN the week, on the till you're watching)
 *   Day 5: chase → day 7 (in 2, after the close, off screen)
 * So Day 3's chase visibly moves the till (£2,400 lands Day 5), while Day 5 is
 * the same arithmetic one day past the close. The numbers are identical — no
 * button leaks the answer — so the debrief's framing attribution is honest.
 * The tilt the player feels is the present-bias one: the identical "in 2"
 * feels near on Day 3 (you watch it land) and far on Day 5 (it lands after).
 */
export const PAIR_A_CHASE_CLEAR_DAYS = CHASE_CLEAR_DAYS;
export const PAIR_A_DEFER_CLEAR_DAYS = DEFER_CLEAR_DAYS;
export const PAIR_B_CHASE_CLEAR_DAYS = CHASE_CLEAR_DAYS;
export const PAIR_B_DEFER_CLEAR_DAYS = DEFER_CLEAR_DAYS;
/** The deferral's cost, in days — identical in both arms. */
export const DEFER_EXTRA_DAYS = DEFER_CLEAR_DAYS - CHASE_CLEAR_DAYS;

/**
 * The supplier bill — the day the till can actually empty (recovery plan
 * §2.2). £2,000 against a £1,200 start: the only way to pay it cleanly is the
 * money the Day-1/Day-2 chases bring in by Day 4. Skip it and the liability
 * grows £40/day; the till POSITION (cash minus liability) is what empties —
 * and it does so robustly (not a one-seed knife edge).
 */
export const BILL = {
  client: "Quayline Foods",
  amount: 2000,
  dueDay: 4,
  /** Per-day late charge that grows the unpaid liability — and leaves the
   *  till (the net position it erodes is what the player watches die). */
  lateFee: 40,
} as const;

export const START_CASH = 1200;

export type FunTask = "restock" | "reply_emails" | "customer_chat";

export interface Ch1Invoice {
  id: string;
  client: string;
  principal: number;
  /** Day the invoice first becomes chasable. 0 = overdue before the chapter. */
  dueDay: number;
  /** Day the player chased it (pays in 2 days). Null = not chased. */
  chasedDay: number | null;
  /**
   * Day the player DEFERRED it (pays in 10 days — a commitment, not a
   * postponement). Once set, the invoice is never re-offered with a shorter
   * payoff, so the controlled 2-vs-10 comparison is locked in at the choice
   * and lasts the whole week (the round-2 leak, fixed).
   */
  deferredDay: number | null;
  paidDay: number | null;
  /** Count of explicit deferrals (0 or 1 now — one decision per invoice). */
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
 * The "worth today" haircut: 2% of face per day past due, capped at 30%.
 * Large enough that a deferral's cost is FELT on the till, not a footnote,
 * and visible on the card's falling "worth today". Indicative/fictional
 * (disclosed in the assumptions sheet), and deliberately distinct from the
 * statutory entitlement (a larger, real legal floor, named in the debrief
 * only).
 *
 * Pure curve — no paid/chased clamping — because `valueShedForDay` diffs it
 * between two days and the clamps would corrupt the deltas.
 */
export const WORTH_HAIRCUT_PER_DAY = 0.02;
export const WORTH_HAIRCUT_CAP = 0.3;

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

/**
 * Display-only continuous version of `worthToday`: the market's bid at a
 * FRACTION `f` (0..1) of day `day` elapsed. At f=0 it is today's bid; at
 * f=1 it is next morning's (`worthToday(day+1)`), so it never leaves the
 * real arithmetic — it just represents the market repricing *continuously*
 * (as a live factoring bid would) rather than in one daily step. The screen
 * uses it so the bleed on an overdue card is felt before the first click, at
 * the true rate (the full day's shed spread across the day), not an
 * invented faster number. Not used by the sim or the ledger — those still
 * accrue on the integer `valueShedForDay`, so nothing the player sees here
 * is separate from what the debrief prices.
 */
export function worthAtFraction(inv: Ch1Invoice, day: number, f: number): number {
  const frac = Math.max(0, Math.min(1, f));
  // Only overdue invoices bleed; a due-today or future one holds at face.
  if (day <= inv.dueDay) return inv.principal;
  return Math.round(worthToday(inv, day) - frac * valueShedForDay(inv, day));
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
  experimentId: "ch1_present_pair_a",    first: { day: 3, framingVariable: "timing_today_vs_later", invoice: { id: "inv-a", client: "Harborne Print Works · INV-231", principal: 2400 } },
    second: { day: 5, framingVariable: "timing_delayed_both", invoice: { id: "inv-b", client: "Harborne Print Works · INV-238", principal: 2400 } },
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
 *  - inv-early: ordinary, ALREADY overdue before the chapter (dueDay 0) — the
 *               ledger shows a falling "worth today" from frame one.
 *  - inv-2nd:   ordinary, due Day 2 — the second real choice day, so Day 2 is
 *               never a single button.
 *  - inv-a / inv-b: the engineered PAIR (Harborne, £2,400), FIXED, never
 *               jittered — the debrief's framing attribution is only honest
 *               if Days 3 and 5 always offer the pair.
 */
export function createCh1State(seed: number): { state: Ch1State; rng: Rng } {
  const rng = mulberry32(seed);
  const earlyClient = CLIENTS[Math.floor(rng() * CLIENTS.length)]!;
  const earlyPrincipal = 1000 + Math.floor(rng() * 10) * 100; // £1,000–£1,900
  // A DIFFERENT client for Day 2 (same pool, redrawn) — two live invoices,
  // never the same face twice on the ledger.
  let secondClient = earlyClient;
  while (secondClient === earlyClient) secondClient = CLIENTS[Math.floor(rng() * CLIENTS.length)]!;
  const secondPrincipal = 900 + Math.floor(rng() * 10) * 100; // £900–£1,800
  const state: Ch1State = {
    day: 1,
    cash: START_CASH,
    invoices: [
      { id: "inv-early", client: earlyClient, principal: earlyPrincipal, dueDay: 0, chasedDay: null, deferredDay: null, paidDay: null, deferrals: 0 },
      { id: "inv-2nd", client: secondClient, principal: secondPrincipal, dueDay: 2, chasedDay: null, deferredDay: null, paidDay: null, deferrals: 0 },
      { id: "inv-a", client: "Harborne Print Works · INV-231", principal: 2400, dueDay: PAIR_A_DAY, chasedDay: null, deferredDay: null, paidDay: null, deferrals: 0 },
      { id: "inv-b", client: "Harborne Print Works · INV-238", principal: 2400, dueDay: PAIR_B_DAY, chasedDay: null, deferredDay: null, paidDay: null, deferrals: 0 },
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
 *   1: fun | chase/defer (the already-overdue ordinary invoice)
 *   2: fun | chase/defer (the second ordinary invoice, due today)
 *   3: fun | PAIR A chase/defer (Harborne — in 2 vs in 10)
 *   4: pay/skip bill | fun (the bill day — the till can empty)
 *   5: fun | PAIR B chase/defer (Harborne — same in 2 vs in 10)
 *
 * The day's invoice offer is the OLDEST still-undecided live invoice
 * (dueDay ≤ today, not chased, not deferred, not paid) — one decision per
 * invoice, with the SAME 2-vs-10 offer every time (chase → in 2, defer → in 10).
 * The decision is a COMMITMENT: at the end of an invoice's due day, if the
 * player hasn't chased or explicitly deferred it, it commits to the 10-day
 * payoff (doing the easy work or the bill counts as deferring). A committed
 * invoice is never re-offered with a shorter payoff on a later day, so the
 * controlled 2-vs-10 comparison is locked at the choice and lasts the whole
 * week, not one morning (the round-2 leak, fixed). On a pair day the pair
 * invoice is the only live undecided one, so it is the offered choice by
 * construction — no older ticket can hijack the slot (A1 discipline).
 */
export function dayChoices(state: Ch1State, day: number): DayChoice[] {
  const pair = ENGINEERED_PAIR;
  const isPairDay = day === pair.first.day || day === pair.second.day;
  // The day's DECISION leads; the easy work trails. The first button the eye
  // lands on is the thing that can move the till — chase the bleeding
  // invoice, or the bill — not "Restock the shelves". (First-minute tension:
  // the tension must be the decision, not "which card to click.")
  const decisionChoices: DayChoice[] = [];

  if (state.bill.dueDay === day && state.bill.paidDay === null && state.bill.skippedDay === null) {
    // The ordinary day where the till can empty. No dressed-up numbers — just
    // the bill, what it costs, and what skipping costs.
    const canCover = state.cash >= state.bill.amount;
    decisionChoices.push({
      id: `pay_bill-${day}`,
      label: `Pay ${state.bill.client} — £${state.bill.amount}`,
      detail: canCover
        ? "Due today. Paid, the stall stays open."
        : "Due today. The till can't cover it — you'd run into the red.",
      kind: "pay_bill",
    });
    decisionChoices.push({
      id: `skip_bill-${day}`,
      label: "Leave the bill",
      detail: `£${state.bill.amount} stays owed, and £${state.bill.lateFee} a day comes out of the till tomorrow — the street's money.`,
      kind: "skip_bill",
    });
  }

  // The day's invoice offer: the OLDEST still-undecided live invoice
  // (dueDay ≤ today, not chased, not deferred, not paid). One decision per
  // invoice, same 2-vs-10 offer every time; if the player doesn't chase or
  // defer it, it commits to the 10-day payoff at the day's end and is never
  // re-offered with a shorter payoff (the round-2 leak, fixed). On a pair day
  // the pair invoice is the only undecided one, so it is the offer by
  // construction — no older ticket can hijack the slot (A1 discipline).
  const due = state.invoices
    .filter((i) => i.dueDay <= day && i.paidDay === null && i.chasedDay === null && i.deferredDay === null)
    .sort((a, b) => a.dueDay - b.dueDay)[0];
  if (due) {
    const isEngineered = isPairDay && (due.id === pair.first.invoice.id || due.id === pair.second.invoice.id);
    const chaseDetail = isEngineered
      ? day === pair.first.day
        ? `Chase — the full £${due.principal} lands in ${PAIR_A_CHASE_CLEAR_DAYS} days.`
        : `Chase — the full £${due.principal} lands in ${PAIR_B_CHASE_CLEAR_DAYS} days.`
      : `Chase — the full £${due.principal} lands in ${CHASE_CLEAR_DAYS} days.`;
    const deferDetail = isEngineered
      ? day === pair.first.day
        ? `Defer — the full £${due.principal} lands in ${PAIR_A_DEFER_CLEAR_DAYS} days instead.`
        : `Defer — the full £${due.principal} lands in ${PAIR_B_DEFER_CLEAR_DAYS} days instead.`
      : `Defer — the full £${due.principal} lands in ${DEFER_CLEAR_DAYS} days instead.`;
    decisionChoices.push({ id: `chase-${due.id}`, label: `Chase ${due.client} — £${due.principal}`, detail: chaseDetail, kind: "chase", invoiceId: due.id });
    decisionChoices.push({ id: `defer-${due.id}`, label: "Leave it for tomorrow", detail: deferDetail, kind: "defer", invoiceId: due.id });
  }

  // The easy work — the social pull of a normal day. It trails the decision,
  // so it reads as the default you reach for when you don't want to think,
  // not the first thing on the screen. (Doing it commits the day's invoice
  // to deferral — the pull is real, it just arrives after the choice.)
  const fun: Record<FunTask, { label: string; detail: string }> = {
    restock: { label: "Restock the shelves", detail: "Satisfying, done by lunch. Later today it pays a little walk-in trade." },
    reply_emails: { label: "Reply to the morning emails", detail: "Warm, manageable, finished. Feels like a real day's work." },
    customer_chat: { label: "Catch up with the regulars", detail: "The kind of work nobody ever calls urgent — so it always gets done." },
  };
  const funKey = (["restock", "reply_emails", "customer_chat"] as FunTask[])[(day - 1) % 3]!;
  return [...decisionChoices, { id: `fun-${day}`, label: fun[funKey].label, detail: fun[funKey].detail, kind: "fun" }];
}

/**
 * Lock an invoice into the deferral arm: the 10-day payoff. A deferral is a
 * COMMITMENT — once set, the invoice never re-enters the offer (dayChoices
 * skips it), so it can't be re-presented on a later day with a shorter "in 2"
 * payoff. `deferredDay` is the day the player let it go; the money lands
 * `DEFER_CLEAR_DAYS` after that.
 */
function commitDeferral(invoice: Ch1Invoice, day: number, lines: string[]): void {
  invoice.deferredDay = day;
  invoice.deferrals += 1;
  invoice.paidDay = day + DEFER_CLEAR_DAYS;
  lines.push("Tomorrow. Tomorrow is always tidy in your head.");
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
    invoice.paidDay = day + CHASE_CLEAR_DAYS;
    lines.push(
      invoice.paidDay <= CH1_DAYS
        ? `Zana's first-stage reminder goes out. ${invoice.client} pays in ${CHASE_CLEAR_DAYS} days.`
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

  // The day's offered invoice (the oldest still-undecided live one) was not
  // chased or explicitly deferred — it commits to the 10-day payoff, whether
  // the player said so or simply did the easy work. This is what makes the
  // controlled 2-vs-10 comparison last the whole week: the invoice is never
  // re-offered with a shorter payoff on a later day. (Only the offered invoice
  // commits here — an older ticket already decided, and the pair waits for its
  // own day.)
  const offered = state.invoices
    .filter((i) => i.dueDay <= day && i.paidDay === null && i.chasedDay === null && i.deferredDay === null)
    .sort((a, b) => a.dueDay - b.dueDay)[0];
  if (offered && !(choiceId.startsWith("chase-") || choiceId.startsWith("defer-"))) {
    commitDeferral(offered, day, lines);
    // A silent deferral is still a deferral — the street funds a stall for it
    // (reported through the same streetNote the explicit defer sets).
    streetNote = streetNote ?? "deferral";
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
  // OR the easy work done instead (both commit the invoice to the 10-day
  // payoff). The debrief replays these two pair decisions side by side.
  return {
    chapter: 1,
    day,
    experimentId: pair.experimentId,
    // Both days are the SAME "chase in 2 vs defer in 10" — the only engineered
    // variable is how NEAR the near payoff sits (in the week vs after the close).
    prompt: isA
      ? "Harborne's invoice is due today. Chase in 2 days, or defer to 10?"
      : "Harborne again (new invoice), due today. Chase in 2 days, or defer to 10?",
    optionsShown: [
      { id: "chase_now", label: `Chase — in ${PAIR_A_CHASE_CLEAR_DAYS} days`, framingVariable: isA ? "near_payoff_in_week" : "near_payoff_after_close", isDefault: false },
      { id: "defer", label: `Defer — in ${PAIR_A_DEFER_CLEAR_DAYS} days`, framingVariable: isA ? "near_payoff_in_week" : "near_payoff_after_close", isDefault: false },
    ],
    chosenOptionId: chosen,
    deferred: chosen !== "chase_now",
    immediateConsequence: deferred
      ? isA
        ? "Committed — the money now lands 8 days later, off the till."
        : "Committed — the money now lands 8 days later, further past the close."
      : isA
        ? "Chased — the money lands in 2 days, in the week."
        : "Chased — the money lands in 2 days, just after the close.",
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
  // The one-time compensation (s.5A: £40/£70/£100 by debt size) accrues the
  // moment the debt first goes overdue — day dueDay+1. The sit window always
  // STARTS at that day (startDay = dueDay+1), so every priced window includes
  // the first overdue day: the one-time figure applies to every deferral.
  // (Without this the "legal floor" was daily-interest-only — pennies — and
  // "two prices for one habit" compared £44 against £1.)
  const compensation = statutoryCompensation(inv.principal);
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
