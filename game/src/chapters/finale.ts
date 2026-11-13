/**
 * Finale — "You Were the Experiment / Market Close" (GDD A5).
 * Pure view-model: everything the finale screen shows is derived from the
 * DecisionLedger — never separate state. No DOM in this file.
 */
import { irrationalityProfile, type DecisionLedger, type IrrationalityProfile, type LedgerEntry } from "../engine/ledger";
import { isSouq } from "../engine/market";

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

export const SOUQ_STAT_CARDS: StatCard[] = [
  {
    value: "58%",
    label: "of the value of UAE B2B invoices is overdue",
    source: "Atradius Payment Practices Barometer — United Arab Emirates, 2025",
  },
  {
    value: "8%",
    label: "of that invoice value is written off as bad debt",
    source: "Atradius Payment Practices Barometer — United Arab Emirates, 2025",
  },
];

/** The stat cards follow the market being played — a Gulf run does not end
 *  on British invoice statistics. */
export function statCards(): StatCard[] {
  return isSouq() ? SOUQ_STAT_CARDS : UK_STAT_CARDS;
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

/** Your week in one line — the quotable verdict. Siki names the lean from
 *  the player's own dominant axis; Zana gives the one-line counter-move.
 *  Observation, never pathology: the profile beat's one-run hedge stands. */
export interface Verdict {
  siki: string;
  zana: string;
}

export function verdictLine(profile: IrrationalityProfile): Verdict {
  const axes = [
    { key: "deferral", value: profile.deferral },
    { key: "anchoring", value: profile.anchoring },
    { key: "sunkCost", value: profile.sunkCost },
  ] as const;
  const top = axes.reduce((a, b) => (b.value > a.value ? b : a));
  if (top.value <= 0) {
    return {
      siki: "Your week in one line: a clean ledger — nothing leaned on you this week.",
      zana: "Run it back and see if it holds.",
    };
  }
  switch (top.key) {
    case "anchoring":
      return {
        siki: isSouq()
          ? "Your week in one line: their opening number moved your bottom line more than your own terms did."
          : "Your week in one line: their opening number moved your bottom line more than the law did.",
        zana: isSouq()
          ? "Open with your number, and the fee you wrote into the terms."
          : "Quote the Act first. Open with your number, not theirs.",
      };
    case "sunkCost":
      return {
        siki: "Your week in one line: the history kept charging you after the prospect stopped paying.",
        zana: "Decide at zero. Judge the old account like a fresh one.",
      };
    default:
      return {
        siki: "Your week in one line: the near cost always shouted loudest, and the far one barely whispered.",
        zana: "Chase Tuesday's money on Tuesday.",
      };
  }
}

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
  // The pair is ONE controlled trial run twice — when both days are on record,
  // show them side by side so the two Harborne cards read as the two arms of
  // one experiment ("the same offer, only the timing moved"), not a duplicate.
  const deferralLine = ch1.length >= 2
    ? `Day ${ch1[0]!.day} (INV-231): you ${describeCh1(ch1[0]!)} · Day ${ch1[ch1.length - 1]!.day} (INV-238): you ${describeCh1(ch1[ch1.length - 1]!)} — two invoices, the same offer twice, only the timing moved. One run suggests; it doesn't prove.`
    : ch1.length === 1
      ? `Day ${ch1[0]!.day}: "${ch1[0]!.prompt}" → you ${describeCh1(ch1[0]!)}.`
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
    stats: statCards(),
    partial: !(hasCh1 && hasCh2 && hasCh3),
  };
}
