/**
 * Chapter 2 — "The Offer" (GDD A3): anchoring + ultimatum fairness.
 *
 * Three negotiation runs on one £1,240 invoice, 60 days late. The counterparty
 * opens EVERY run (their number first); the anchor moves between runs —
 * £950 → £650 → £1,050 — while the collectable prospect never moves.
 * Attribution is clean: if the player's floor moves with the anchor, it moved
 * because the anchor moved.
 *
 * Structure per run (deterministic from seed):
 *   opening anchor offered → player sets a floor → up to 3 rounds of
 *   counterparty counters → accept the last number, or walk.
 * Every resolved run is one ch2_* ledger entry with the anchor framing
 * variable and the floor — the IrrationalityProfile's anchoring axis eats it.
 */
import { statutoryEntitlement } from "../engine/rates";
import type { LedgerEntry } from "../engine/ledger";
import { mulberry32, type Rng } from "../engine/rng";

export const CH2_INVOICE = 1240;
export const CH2_DAYS_LATE = 60;
export const CH2_RUN_COUNT = 3;
/** The claimant on this one (fictional composite; the ledger's card). */
export const CH2_CLIENT = "Meadowbank Mills";

/** The counterparty's opening anchors — the ONLY engineered variable. */
export const CH2_ANCHORS = [950, 650, 1050] as const;
/** Same invoice signalled a fresh 60-day age each run (fictional reset). */
export const RESET_COPY =
  "A new quarter, a fresh notice: the same invoice, rendered 60 days aged again. The facts have not changed since run one.";

export interface Ch2Prospect {
  principal: number;
  interest: number;
  compensation: number;
  /** principal + interest + compensation — the statutory ceiling today. */
  total: number;
}

/** The prospect — identical across all runs by construction. */
export function ch2Prospect(): Ch2Prospect {
  const e = statutoryEntitlement(CH2_INVOICE, CH2_DAYS_LATE);
  return { principal: CH2_INVOICE, interest: e.interest, compensation: e.compensation, total: CH2_INVOICE + e.total };
}

export interface Ch2Run {
  run: 0 | 1 | 2;
  anchor: number;
  floor: number | null;
  /** Counterparty offers after the opening anchor (counter history). */
  counters: number[];
  /** Accepted number, or null if the player walked. */
  settled: number | null;
  walked: boolean;
}

export interface Ch2State {
  run: 0 | 1 | 2;
  runs: [Ch2Run, Ch2Run, Ch2Run];
  done: boolean;
}

export type Ch2Phase = "floor" | "counter" | "resolved";

export function createCh2State(seed: number): { state: Ch2State; rng: Rng } {
  const rng = mulberry32(seed);
  const runs = [
    [0, 950] as const,
    [1, 650] as const,
    [2, 1050] as const,
  ].map(([run, anchor]) => ({ run, anchor, floor: null, counters: [], settled: null, walked: false })) as unknown as [Ch2Run, Ch2Run, Ch2Run];
  const state: Ch2State = { run: 0, runs, done: false };
  rng(); // consume one draw: the anchors are scripted, the stream stays aligned
  return { state, rng };
}

export function currentRun(state: Ch2State): Ch2Run {
  return state.runs[state.run]!;
}

/** The counterparty's deterministic counters. Returns null → final. */
export function counterpartyCounter(state: Ch2State, rng: Rng): number | null {
  const run = currentRun(state);
  const prospect = ch2Prospect();
  const ceiling = Math.round(prospect.total * 0.88); // they never meet the law
  const last = run.counters.length === 0 ? run.anchor : run.counters[run.counters.length - 1]!;
  if (run.counters.length >= 2) return null; // 3 rounds: anchor + 2 counters
  const step = 55 + Math.floor(rng() * 45); // £55–£99, seeded
  const next = Math.min(ceiling, last + step);
  if (next <= last) return null;
  run.counters.push(next);
  return next;
}

/** Player accepts the latest offered number (anchor if none countered yet). */
export function accept(state: Ch2State): void {
  const run = currentRun(state);
  const last = run.counters.length === 0 ? run.anchor : run.counters[run.counters.length - 1]!;
  run.settled = last;
  state.done = state.run === CH2_RUN_COUNT - 1;
  run.walked = false;
}

export function walk(state: Ch2State): void {
  const run = currentRun(state);
  run.walked = true;
  run.settled = null;
  state.done = state.run === CH2_RUN_COUNT - 1;
}

/** Record the run as a ledger entry (the debrief's anchoring fuel). */
export function ch2LedgerEntry(state: Ch2State, completed: Ch2Run): Omit<LedgerEntry, "id"> {
  void state;
  return {
    chapter: 2,
    day: 20 + (completed.run + 1) * 2, // chapter-relative day
    experimentId: `ch2_anchor_r${completed.run}`,
    prompt: `The Claims Desk opens at ${completed.anchor}. Your floor?`,
    optionsShown: [
      { id: "anchor", label: `Their opening: £${completed.anchor}`, framingVariable: `anchor_${completed.anchor}`, isDefault: true },
      { id: "floor", label: "Your minimum", framingVariable: "player_floor", isDefault: false },
    ],
    chosenOptionId: completed.walked ? "walk" : completed.settled === null ? "walk" : "accept",
    deferred: false,
    negotiationFloor: completed.floor ?? undefined,
    immediateConsequence: completed.walked
      ? "Walked. The invoice stays yours."
      : `Settled at £${completed.settled} against a prospect of £${ch2Prospect().total}.`,
    // No `npc`: settlement runs are NOT street offers — they are the
    // anchoring experiment itself. The Collector probes separately.
  };
}

/**
 * The Collector's probe (GDD A3): a debt-buy at commission. Recorded as a
 * proper NPC offer so the cost lands in the Cost-of-Not-Acting ledger if
 * accepted. The commission range is shown as indicative, fictional.
 */
export function collectorProbe(): { faceValue: number; buyPrice: number; commissionPct: number; copy: string } {
  const p = ch2Prospect();
  // indicative mid-band of the researched 5–15% recovery commission
  const commissionPct = 12;
  const buyPrice = Math.round(p.principal * (1 - commissionPct / 100));
  return {
    faceValue: p.principal,
    buyPrice,
    commissionPct,
    copy: `"£${buyPrice} today for your thirty-third customer who pays at day ninety. We take ${commissionPct}%. You keep the rest, and lose the relationship."`,
  };
}

export function collectorLedgerEntry(probe: ReturnType<typeof collectorProbe>, accepted: boolean): Omit<LedgerEntry, "id"> {
  return {
    chapter: 2,
    day: 27,
    experimentId: "ch2_collector_probe",
    prompt: "The Collector wants to buy the debt outright.",
    optionsShown: [
      { id: "sell", label: `Sell the debt — £${probe.buyPrice}`, framingVariable: "collector_buy", isDefault: false, cashNow: probe.buyPrice },
      { id: "keep", label: "Keep the debt", framingVariable: "collector_keep", isDefault: true },
    ],
    chosenOptionId: accepted ? "sell" : "keep",
    deferred: false,
    npc: accepted ? { npc: "The Collector", decision: "accept", feePaid: Math.round((probe.faceValue - probe.buyPrice) * 100) / 100 } : { npc: "The Collector", decision: "decline" },
    immediateConsequence: accepted
      ? `Sold. The Market pays ${probe.commissionPct}% — and takes the customer.`
      : "Kept. The street does not sleep; you will meet this offer again.",
  };
}

/**
 * Debrief counterfactual: "flip the anchor" — opening with the Act first.
 * Seeded small concessions still don't reach the prospect: the lesson is the
 * gap ACROSS runs in your floor, not the absolute flip number.
 */
export function flippedOutcome(seed: number): { offer: number } {
  const rng = mulberry32(seed);
  const p = ch2Prospect();
  // Opening with the law costs them their best face-saving move.
  const offer = Math.round(p.total * (0.93 + rng() * 0.04));
  return { offer };
}
