/**
 * Chapter 3 — "Good Money After Bad" (GDD A4): sunk cost.
 *
 * A 3-year client — always 60 days late, now gone silent. Every UI element
 * first shows what you already put in (the sunk frame); the prospective view
 * ("decide at zero") is unlocked by the debrief. The Factor and The Shark
 * compete in the street while this decision runs, with honest annualised
 * maths from the shared rates sheet.
 *
 * Ledger semantics note: for ch3 entries `deferred=true` means the player
 * WALKED (stopped investing) — the profile's sunk-cost axis measures the
 * rate of continuation.
 */
import { quoteFor, statutoryEntitlement, DEFAULT_BASE_RATE_PCT } from "../engine/rates";
import type { LedgerEntry } from "../engine/ledger";

export const CH3_CLIENT = "Mareline Charters";
export const CH3_INVOICE = 890;
export const CH3_DAYS_LATE = 60;
export const CH3_YEARS = 3;

/** The sunk frame the UI leads with (fictional composite; verified sums). */
export const SUNK_RECORD = {
  yearsClient: CH3_YEARS,
  extensions: 14,
  goodwillDiscounts: 180,
  chasesSent: 9,
  relationshipOrderBook: 1200, // plausible new work per year, hopeful
} as const;

export type Ch3Action = "continue" | "escalate" | "walk";

export interface Ch3Round {
  round: 0 | 1 | 2;
  action: Ch3Action | null;
  /** Ongoing quiet cost of a "keep going" choice (£25) / escalate (£60). */
  costPaid: number;
}

export interface Ch3State {
  rounds: [Ch3Round, Ch3Round, Ch3Round];
  cursor: 0 | 1 | 2 | 3; // 3 = resolved
  npcOfferTaken: { npc: "The Factor" | "The Shark"; feePaid: number } | null;
  done: boolean;
}

/** The prospect — the ONLY number the "decide at zero" panel leads with. */
export function ch3Prospect(): { principal: number; entitlement: number; total: number; perRoundCost: number } {
  const e = statutoryEntitlement(CH3_INVOICE, CH3_DAYS_LATE);
  return {
    principal: CH3_INVOICE,
    entitlement: Math.round(e.total * 100) / 100,
    total: Math.round((CH3_INVOICE + e.total) * 100) / 100,
    perRoundCost: 25,
  };
}

export function createCh3State(): Ch3State {
  return {
    rounds: [0, 1, 2].map((r) => ({ round: r as 0 | 1 | 2, action: null, costPaid: 0 })) as [Ch3Round, Ch3Round, Ch3Round],
    cursor: 0,
    npcOfferTaken: null,
    done: false,
  };
}

/**
 * Resolve one round. Walking ends the chapter immediately (cursor → 3) and
 * the relationship order-book note stays honest: walking ≠ reputation loss.
 */
export function act(state: Ch3State, action: Ch3Action): void {
  if (state.done || state.cursor > 2) return;
  const idx = state.cursor as 0 | 1 | 2;
  const round = state.rounds[idx]!;
  round.action = action;
  round.costPaid = action === "continue" ? 25 : action === "escalate" ? 60 : 0;
  if (action === "walk") {
    state.cursor = 3;
    state.done = true;
    return;
  }
  state.cursor = (state.cursor + 1) as 1 | 2 | 3;
  if (state.cursor === 3) state.done = true;
}

/** Ledger entry per round; `deferred` is repurposed as "walked" (see header). */
export function ch3LedgerEntry(state: Ch3State, round: Ch3Round): Omit<LedgerEntry, "id"> {
  const walked = round.action === "walk";
  return {
    chapter: 3,
    day: 40 + round.round * 3,
    experimentId: `ch3_continuation_r${round.round}`,
    prompt: `${CH3_CLIENT}: silent, 60 days late (again). Push, escalate, or stop?`,
    optionsShown: [
      { id: "continue", label: "Keep the line going", framingVariable: "sunk_relationship", isDefault: true },
      { id: "escalate", label: "Escalate — discount + call", framingVariable: "sunk_relationship_escalate", isDefault: false },
      { id: "walk", label: "Stop work on this account", framingVariable: "prospective_only", isDefault: false },
    ],
    chosenOptionId: round.action ?? "continue",
    deferred: walked,
    npc: undefined,
    immediateConsequence: walked
      ? `The account closes. The £${ch3Prospect().total.toFixed(0)} prospect needs no apology to survive.`
      : `Put in £${round.costPaid} this round. Nobody said "stop", so the round ends open.`,
    deferredConsequence: walked ? undefined : "The quiet cost repeats while silence continues.",
  };
}

/**
 * NPC offers v1 — honest maths from the shared rates sheet.
 * The Factor: instant cash at ~10% off (rates.quoteFor maths).
 * The Shark: money now against a fixed DAILY repayment — the annualised
 * number is shown truthfully (the daily-quote illusion, rendered honest).
 */
export function streetOffers(): {
  factor: { buyPrice: number; annualDiscountPct: number };
  shark: { cashNow: number; daily: number; annualisedPct: number; termDays: number };
} {
  const factor = quoteFor("The Factor", CH3_INVOICE, CH3_DAYS_LATE);
  const shark = quoteFor("The Shark", CH3_INVOICE, CH3_DAYS_LATE);
  // Shark: cash now minus their 10% take, repaid at a fixed daily clip.
  const cashNow = Math.round(shark.marketBuyPrice * 0.7); // they advance less
  const daily = 14; // the "tiny daily number" they quote
  const termDays = Math.ceil((cashNow * 1.10) / daily); // until their 10% + principal back
  const annualisedPct = Math.round(((daily / cashNow) * 365) * 100);
  return {
    factor: { buyPrice: Math.round(factor.marketBuyPrice), annualDiscountPct: factor.impliedAnnualDiscountPct },
    shark: { cashNow, daily, annualisedPct, termDays },
  };
}

export function streetLedgerEntry(
  npc: "The Factor" | "The Shark",
  feePaid: number,
  accepted: boolean,
): Omit<LedgerEntry, "id"> {
  return {
    chapter: 3,
    day: 48,
    experimentId: npc === "The Factor" ? "ch3_street_factor" : "ch3_street_shark",
    prompt: npc === "The Factor" ? `${npc} offers instant cash at a £${feePaid} shave.` : `${npc} advances cash against a fixed daily repayment.`,
    optionsShown: [
      { id: "accept", label: "Take the street's money", framingVariable: `street_${npc.toLowerCase().replace("the ", "")}`, isDefault: false, cashNow: npc === "The Shark" ? streetOffers().shark.cashNow : streetOffers().factor.buyPrice },
      { id: "decline", label: "Keep the debt", framingVariable: "street_decline", isDefault: true },
    ],
    chosenOptionId: accepted ? "accept" : "decline",
    deferred: false,
    npc: accepted ? { npc, decision: "accept", feePaid } : { npc, decision: "decline" },
    immediateConsequence: accepted
      ? npc === "The Shark"
        ? `The daily number stays small. The year does not: ${(streetOffers().shark.annualisedPct / 100).toFixed(1)}× per year, once annualised.`
        : `Cleared today. Paid for it: £${feePaid} (≈${streetOffers().factor.annualDiscountPct}%/yr cost of impatience).`
      : "Declined. The street's stalls stay lit either way.",
  };
}

/** Used in the assumptions sheet + tests: the Act's maths at the base rate. */
export function assumptionsLine(): string {
  const p = ch3Prospect();
  return `Statutory entitlement at 8% over base (${DEFAULT_BASE_RATE_PCT}% BoE): £${p.entitlement} on a £${p.principal} debt at ${CH3_DAYS_LATE} days (simplified; Late Payment Act 1998 s.5A).`;
}
