/**
 * Late Market — UK rates (indicative, labelled fictional in-game).
 * Sources: Late Payment of Commercial Debts (Interest) Act 1998 (c. 20),
 * as amended 2002, s. 5A — statutory interest at 8% above Bank of England
 * base rate, plus fixed compensation by debt size.
 * Base rate per DBT/OSBC research era, Nov 2026: 3.75% (BoE base since 18 Dec 2025).
 * The game discloses this sheet ("assumptions") and labels meters fictional.
 */

export const STATUTORY_MARGIN = 8; // percentage points above base
export const DEFAULT_BASE_RATE_PCT = 3.75;

/** Statutory interest rate per annum, simple (as the Act defines). */
export function statutoryRatePct(basePct: number = DEFAULT_BASE_RATE_PCT): number {
  return STATUTORY_MARGIN + basePct;
}

/** Daily accrual on `principal` after `daysLate`, simple interest (365-day year). */
export function statutoryInterest(principal: number, daysLate: number, basePct: number = DEFAULT_BASE_RATE_PCT): number {
  if (principal <= 0 || daysLate <= 0) return 0;
  const annual = principal * (statutoryRatePct(basePct) / 100);
  return (annual / 365) * daysLate;
}

/**
 * Fixed compensation by debt size (Act s.5A as amended 2002):
 * ≤ £1,000 → £40 · > £1,000 and ≤ £10,000 → £70 · > £10,000 → £100.
 */
export function statutoryCompensation(debtValue: number): number {
  // s.5A: £1,000 or less → £40 · over £1,000 up to £10,000 → £70 · over £10,000 → £100.
  if (debtValue <= 1000) return 40;
  if (debtValue <= 10000) return 70;
  return 100;
}

export interface StatutoryResultLike {
  interest: number;
  compensation: number;
  total: number;
}

export function statutoryEntitlement(principal: number, daysLate: number, basePct = DEFAULT_BASE_RATE_PCT): StatutoryResultLike {
  const interest = statutoryInterest(principal, daysLate, basePct);
  const compensation = debtIsLateEligible(principal) ? statutoryCompensation(principal) : 0;
  return { interest, compensation, total: interest + compensation };
}

/** Rough per-day cost-of-deferral for the silent lantern counter. */
export function costOfDeferralPerDay(principal: number, basePct = DEFAULT_BASE_RATE_PCT): number {
  return statutoryInterest(principal, 1, basePct);
}

/* ── The rate card (WS-D1) ───────────────────────────────────────────
 * One source for every "cost of lateness" the game shows. Each entry says
 * what kind of number it is, because the three kinds must never be read as
 * the same quantity:
 *   law        — a real figure (the 1998 Act).
 *   indicative — a public UK range, labelled as indicative.
 *   fictional  — the game's own street. Deliberately the worst market you
 *                can hit; it is not a rate and must never be shown as one.
 */
export type RateKind = "law" | "indicative" | "fictional";

export interface RateCardEntry {
  id: "statute" | "factor" | "collector" | "street";
  label: string;
  kind: RateKind;
  /** Annualised percentage where the figure IS a rate; null for the street. */
  annualPct: number | null;
  /** Per-day percentage of face, where that is how the figure is priced. */
  perDayPct: number | null;
  note: string;
}

/**
 * The factoring market's price for an aged claim (the game's mid-point) and
 * the law's price for the same claim. Both are real quantities: the first is
 * what an invoice buyer would pay today, the second is what the claim is
 * worth if you chase and enforce it.
 */
export function factorQuote(face: number, daysLate: number): { price: number; fee: number } {
  const q = quoteFor("The Factor", face, daysLate);
  return { price: q.marketBuyPrice, fee: face - q.marketBuyPrice };
}

/** The law's price for an aged claim: face plus interest and compensation. */
export function enforcedPrice(face: number, daysLate: number): { price: number; entitlement: number } {
  const e = statutoryEntitlement(face, daysLate);
  return { price: face + e.total, entitlement: e.total };
}

function debtIsLateEligible(value: number): boolean {
  return value > 0;
}

/**
 * "Worth today" strip — indicative invoice-finance haircuts.
 * Fictional-rounds of UK indicative ranges (see docs/game/RESEARCH_VALIDATION.md §6):
 * factoring discount ~6.75–9.75%/yr + service fee 0.5–2.5% of turnover;
 * debt-buy / collection commission ~5–15%.
 * In-game copy must say "fictional · based on typical UK ranges · indicative".
 */
export interface LateMarketQuote {
  /** Sale price today for an aged invoice, from its face value. */
  marketBuyPrice: number;
  /** Buyer's implied annualised take haircut (bps of face, rough). */
  impliedAnnualDiscountPct: number;
  counterpartyLabel: "The Factor" | "The Collector" | "The Shark";
}

const FACTOR_DISCOUNT_PCT_PER_MONTH = 0.6; // ~7.2%/yr recurring, rounded
const COLLECTOR_COMMISSION_PCT = 12; // mid of 5–15 band

export function quoteFor(label: LateMarketQuote["counterpartyLabel"], faceValue: number, daysPastDue: number): LateMarketQuote {
  const months = Math.max(0, Math.ceil(daysPastDue / 30));
  switch (label) {
    case "The Factor": {
      const haircut = faceValue * Math.min(0.25, (FACTOR_DISCOUNT_PCT_PER_MONTH / 100) * months);
      return { marketBuyPrice: Math.max(0, faceValue - haircut), impliedAnnualDiscountPct: FACTOR_DISCOUNT_PCT_PER_MONTH * 12, counterpartyLabel: label };
    }
    case "The Collector": {
      const commission = faceValue * (COLLECTOR_COMMISSION_PCT / 100);
      return { marketBuyPrice: Math.max(0, faceValue - commission), impliedAnnualDiscountPct: COLLECTOR_COMMISSION_PCT, counterpartyLabel: label };
    }
    case "The Shark": {
      // "Fixed daily payment" shark: what you "keep" is exorbitant next-day only.
      return { marketBuyPrice: Math.max(0, faceValue - faceValue * 0.1), impliedAnnualDiscountPct: 120, counterpartyLabel: label };
    }
  }
}

/* The card itself lives at the bottom of the file: it reads the discount
 * constants above, so it must be built after they exist. */
export const RATE_CARD: RateCardEntry[] = [
  {
    id: "statute",
    label: "The law — Late Payment of Commercial Debts (Interest) Act 1998",
    kind: "law",
    annualPct: statutoryRatePct(),
    perDayPct: null,
    note: "8% over the Bank of England base rate, plus fixed compensation (£40 / £70 / £100). A real figure.",
  },
  {
    id: "factor",
    label: "The factoring market — indicative UK range",
    kind: "indicative",
    annualPct: FACTOR_DISCOUNT_PCT_PER_MONTH * 12,
    perDayPct: null,
    note: "Roughly 6.75–9.75% a year plus a service fee. Indicative — the game prices it at one point in that range.",
  },
  {
    id: "collector",
    label: "Debt-buy commission — indicative UK range",
    kind: "indicative",
    annualPct: COLLECTOR_COMMISSION_PCT,
    perDayPct: null,
    note: "5–15% of the amount recovered. Indicative.",
  },
  {
    id: "street",
    label: "The street's market — fictional",
    kind: "fictional",
    annualPct: null,
    perDayPct: null,
    note: "The game's own street: the worst market you can hit, priced per day while the invoice sits. Fictional, and labelled as such everywhere it appears.",
  },
];
