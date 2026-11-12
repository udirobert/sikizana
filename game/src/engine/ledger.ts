/**
 * Late Market — decision ledger.
 *
 * The decision ledger is the spine of the game's pedagogy (docs/game/GDD.md §3 + A1):
 * every engineered choice records options shown, the exploited framing variable,
 * the pick, and both immediate + deferred consequences. Chapter debriefs, the
 * Cost-of-Not-Acting ledger, and the Irrationality Profile are all pure functions
 * over this log — never separate state.
 *
 * Privacy: the ledger lives in the browser (localStorage, clearable). No network.
 */
import type { StatutoryResultLike } from "./rates";

export type NpcName = "The Factor" | "The Collector" | "The Shark";

export interface LedgerOptionShown {
  id: string;
  label: string;
  /** The engineered variable, machine-readable (e.g. "timing_today_vs_later", "anchor_650") */
  framingVariable: string;
  /** Whether this option was preselected (default-bias instrumentation) */
  isDefault: boolean;
  /** Immediate cash effect on accept, if any */
  cashNow?: number;
}

export interface LedgerEntry {
  /** Monotonic display id */
  id: string;
  /** 0 = finale/tutorial */
  chapter: 0 | 1 | 2 | 3;
  /** In-game day */
  day: number;
  /** Stable id shared across replayed pairs, e.g. "ch1_present_pair_a" */
  experimentId: string;
  /** Exactly as shown (for replay screens) */
  prompt: string;
  optionsShown: LedgerOptionShown[];
  chosenOptionId: string;
  /** True when the pick defers action this round (feeds the deferral axis) */
  deferred: boolean;
  /** NPC market offer taken this round, if any */
  npc?: { npc: NpcName; decision: "accept" | "decline" | "counter"; feePaid?: number };
  /** Statutory entitlement forgone by this round's deferral */
  forgoneEntitlement?: StatutoryResultLike;
  /** Player-set negotiation floor (anchoring axis) */
  negotiationFloor?: number;
  /** Money tallied to the street this round (late charges, not NPC fees). */
  streetFee?: number;
  immediateConsequence: string;
  deferredConsequence?: string;
}

/** Log wrapper — deterministic, zero deps, JSON-serializable. */
export class DecisionLedger {
  private entries: LedgerEntry[] = [];
  private seq = 0;

  record(e: Omit<LedgerEntry, "id">): LedgerEntry {
    this.seq += 1;
    const entry: LedgerEntry = { ...e, id: `${e.chapter}-${String(this.seq).padStart(4, "0")}` };
    this.entries.push(entry);
    return entry;
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  byChapter(chapter: number): LedgerEntry[] {
    return this.entries.filter((e) => e.chapter === chapter);
  }

  byExperiment(experimentId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.experimentId === experimentId);
  }

  /** Cost of Not Acting: fees paid to the street + forgone statutory entitlement. */
  costOfNotActing(): { toStreet: number; forgoneStatutory: number } {
    let toStreet = 0;
    let forgoneStatutory = 0;
    for (const e of this.entries) {
      if (e.npc?.decision === "accept") toStreet += e.npc.feePaid ?? 0;
      if (e.forgoneEntitlement) {
        forgoneStatutory += (e.forgoneEntitlement.interest ?? 0) + (e.forgoneEntitlement.compensation ?? 0);
      }
    }
    return { toStreet, forgoneStatutory };
  }

  serialize(): string {
    return JSON.stringify({ seq: this.seq, entries: this.entries });
  }

  static deserialize(raw: string): DecisionLedger {
    const d = JSON.parse(raw) as { seq: number; entries: LedgerEntry[] };
    const ledger = new DecisionLedger();
    ledger.seq = d.seq;
    ledger.entries = d.entries;
    return ledger;
  }
}

/**
 * Three axes (GDD A5). Aggregate over the player's own recorded decisions.
 * Copy in the debrief must read as observation of behaviour, never pathology —
 * "This option was preselected, and you kept it", not "You have bias X"
 * (research guardrail + docs/BRAND.md honesty rules).
 */
export interface IrrationalityProfile {
  /** Rate of deferred action among deferrable Ch.1 rounds, 0–100 */
  deferral: number;
  /** How strongly the negotiation floor tracked offered anchors, 0–100 */
  anchoring: number;
  /** Rate of continuation despite negative prospect in Ch.3, 0–100 */
  sunkCost: number;
  totalDecisions: number;
}

export function irrationalityProfile(ledger: DecisionLedger): IrrationalityProfile {
  const entries = ledger.all();

  const deferrable = entries.filter((e) => e.experimentId.startsWith("ch1_"));
  const deferredCount = deferrable.filter((e) => e.deferred).length;
  const deferral = deferrable.length
    ? Math.round((deferredCount / deferrable.length) * 100)
    : 0;

  // Anchoring: normalised slope of the player's floor vs the anchor offered.
  const anchored = entries.filter(
    (e) => e.negotiationFloor !== undefined && e.experimentId.startsWith("ch2_"),
  );
  let anchoring = 0;
  if (anchored.length >= 2) {
    const anchors: number[] = [];
    const floors: number[] = [];
    for (const e of anchored) {
      const anchorOption = e.optionsShown.find((o) => o.framingVariable.startsWith("anchor_"));
      if (anchorOption && e.negotiationFloor !== undefined) {
        anchors.push(Number(anchorOption.framingVariable.split("_")[1] ?? 0));
        floors.push(e.negotiationFloor);
      }
    }
    const slope = linearRegressionSlope(anchors, floors);
    // 1.0 = floor moves one-for-one with the anchor (max exploitation); 0 = inert.
    anchoring = Math.round(Math.min(100, Math.max(0, slope * 100)));
  }

  // Continuation rounds only — street offers (ch3_street_*) are a different
  // decision and must not inflate the sunk-cost axis.
  const ch3 = entries.filter((e) => e.experimentId.startsWith("ch3_continuation"));
  const continued = ch3.filter((e) => !e.deferred).length;
  const sunkCost = ch3.length ? Math.round((continued / ch3.length) * 100) : 0;

  return { deferral, anchoring, sunkCost, totalDecisions: entries.length };
}

function linearRegressionSlope(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i]! - my), 0);
  const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}
