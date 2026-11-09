/**
 * Finale — "You Were the Experiment / Market Close" (GDD A5).
 * Pure view-model: everything the finale screen shows is derived from the
 * DecisionLedger — never separate state. No DOM in this file.
 */
import { irrationalityProfile, type DecisionLedger, type IrrationalityProfile, type LedgerEntry } from "../engine/ledger";

export type AxisKey = "deferral" | "anchoring" | "sunkCost";

export interface AxisEvidence {
  key: AxisKey;
  /** The profile's 0–100 value for this axis. */
  value: number;
  /** One line quoted from the player's own recorded choices. */
  line: string;
  /** What the behaviour is called — observation, never pathology. */
  nameThat: string;
}

/** Real UK figures, labelled with source + year (GDD §3 footnote). */
export interface StatCard {
  value: string;
  label: string;
  source: string;
}

export const UK_STAT_CARDS: StatCard[] = [
  {
    value: "44%",
    label: "of SME invoices are paid late",
    source: "Commons Library briefing — Commercial Payments Bill [HL] 2026–27",
  },
  {
    value: "~£11bn",
    label: "cost to the UK economy every year",
    source: "DBT / Small Business Commissioner (London Economics research), July 2025",
  },
];

export interface FinaleView {
  profile: IrrationalityProfile;
  axes: AxisEvidence[];
  cost: { toStreet: number; forgoneStatutory: number };
  stats: StatCard[];
  /** True when the run skipped chapters (e.g. ?ch= jump) — axes are partial. */
  partial: boolean;
}

const AXIS_NAMES: Record<AxisKey, string> = {
  deferral: "present bias — costs near today feel huge, costs far away feel like rounding",
  anchoring: "anchoring — the first number on the table moves your bottom line",
  sunkCost: "sunk cost — history priced as if it were prospect",
};

function describeCh1(e: LedgerEntry): string {
  if (e.chosenOptionId === "chase_now") return "chased";
  if (e.chosenOptionId === "defer") return "deferred";
  return "did the easy work instead";
}

function describeCh3(e: LedgerEntry): string {
  if (e.chosenOptionId === "walk") return "stopped work on the account";
  if (e.chosenOptionId === "escalate") return "escalated — paid more to chase silence";
  return "kept the line going";
}

function anchorOf(e: LedgerEntry): number | null {
  const opt = e.optionsShown.find((o) => o.framingVariable.startsWith("anchor_"));
  const n = Number(opt?.framingVariable.split("_")[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The evidence line for each axis — the player's own data, quoted. */
export function axisEvidence(ledger: DecisionLedger, profile: IrrationalityProfile): AxisEvidence[] {
  const all = ledger.all();

  const ch1 = all.filter((e) => e.experimentId === "ch1_present_pair_a");
  const lastCh1 = ch1[ch1.length - 1];
  const deferralLine = lastCh1
    ? `Day ${lastCh1.day}: "${lastCh1.prompt}" → you ${describeCh1(lastCh1)}.`
    : "No paired decisions recorded — this axis went unmeasured.";

  const ch2 = all.filter(
    (e) => e.experimentId.startsWith("ch2_anchor") && e.negotiationFloor !== undefined,
  );
  const lastCh2 = ch2[ch2.length - 1];
  const anchor = lastCh2 ? anchorOf(lastCh2) : null;
  const anchoringLine = lastCh2 && anchor !== null
    ? `Their opening was £${anchor}; you named a floor of £${Math.round(lastCh2.negotiationFloor!)}.`
    : "No floor was ever named — the anchor had nothing to push against.";

  const ch3 = all.filter((e) => e.experimentId.startsWith("ch3_continuation"));
  const lastCh3 = ch3[ch3.length - 1];
  const sunkLine = lastCh3
    ? `Round ${lastCh3.day}: "${lastCh3.prompt}" → you ${describeCh3(lastCh3)}.`
    : "No continuation rounds recorded — this axis went unmeasured.";

  return [
    { key: "deferral", value: profile.deferral, line: deferralLine, nameThat: AXIS_NAMES.deferral },
    { key: "anchoring", value: profile.anchoring, line: anchoringLine, nameThat: AXIS_NAMES.anchoring },
    { key: "sunkCost", value: profile.sunkCost, line: sunkLine, nameThat: AXIS_NAMES.sunkCost },
  ];
}

export function buildFinaleView(ledger: DecisionLedger): FinaleView {
  const profile = irrationalityProfile(ledger);
  const all = ledger.all();
  const hasCh1 = all.some((e) => e.experimentId === "ch1_present_pair_a");
  const hasCh2 = all.some((e) => e.experimentId.startsWith("ch2_anchor"));
  const hasCh3 = all.some((e) => e.experimentId.startsWith("ch3_continuation"));
  return {
    profile,
    axes: axisEvidence(ledger, profile),
    cost: ledger.costOfNotActing(),
    stats: UK_STAT_CARDS,
    partial: !(hasCh1 && hasCh2 && hasCh3),
  };
}
