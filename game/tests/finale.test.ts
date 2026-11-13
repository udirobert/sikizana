import { describe, expect, it } from "vitest";
import { DecisionLedger } from "../src/engine/ledger";
import { axisEvidence, buildFinaleView, UK_STAT_CARDS, verdictLine } from "../src/chapters/finale";
import { ch2LedgerEntry, createCh2State, accept } from "../src/chapters/ch2";
import { ch3LedgerEntry, createCh3State, act } from "../src/chapters/ch3";
import { ENGINEERED_PAIR } from "../src/chapters/ch1";

function seededLedger(): DecisionLedger {
  const led = new DecisionLedger();
  // Ch.1 pair entries — one deferred, one chased (5-day chapter: days 3 & 5).
  led.record({
    chapter: 1, day: 3, experimentId: ENGINEERED_PAIR.experimentId,
    prompt: "Harborne is overdue. Chase today, or tomorrow?",
    optionsShown: [
      { id: "chase_now", label: "Chase now", framingVariable: "timing_today_vs_later", isDefault: false },
      { id: "defer", label: "Defer", framingVariable: "timing_today_vs_later", isDefault: false },
    ],
    chosenOptionId: "defer", deferred: true,
    immediateConsequence: "Another day of accrual begins — the money now lands 8 days later.",
  });
  led.record({
    chapter: 1, day: 5, experimentId: ENGINEERED_PAIR.experimentId,
    prompt: "Harborne again (new invoice). Chase today, or tomorrow?",
    optionsShown: [
      { id: "chase_now", label: "Chase now", framingVariable: "timing_delayed_both", isDefault: false },
      { id: "defer", label: "Defer", framingVariable: "timing_delayed_both", isDefault: false },
    ],
    chosenOptionId: "chase_now", deferred: false,
    immediateConsequence: "Chase in motion.",
  });
  // Ch.1 cost summary — must NOT dilute the deferral axis.
  led.record({
    chapter: 1, day: 5, experimentId: "cost_of_not_acting_ch1",
    prompt: "Chapter 1 — the lantern's final reading",
    optionsShown: [{ id: "run_complete", label: "Run complete", framingVariable: "cost_ledger", isDefault: false }],
    chosenOptionId: "run_complete", deferred: false,
    forgoneEntitlement: { interest: 12.5, compensation: 140, total: 152.5 },
    immediateConsequence: "Forgone statutory entitlement this run: £152.50.",
  });
  // Ch.2 run with a floor + a street fee.
  const s2 = createCh2State(7);
  const r2 = s2.state.runs[0]!;
  r2.floor = 800;
  accept(s2.state);
  led.record(ch2LedgerEntry(s2.state, { ...r2, counters: [...r2.counters] }));
  led.record({
    chapter: 2, day: 27, experimentId: "ch2_collector_probe",
    prompt: "The Collector wants to buy the debt outright.",
    optionsShown: [
      { id: "sell", label: "Sell", framingVariable: "collector_buy", isDefault: false, cashNow: 1091 },
      { id: "keep", label: "Keep", framingVariable: "collector_keep", isDefault: true },
    ],
    chosenOptionId: "sell", deferred: false,
    npc: { npc: "The Collector", decision: "accept", feePaid: 149 },
    immediateConsequence: "Sold.",
  });
  // Ch.3 two continuation rounds.
  const s3 = createCh3State();
  act(s3, "continue");
  led.record(ch3LedgerEntry(s3, s3.rounds[0]!));
  act(s3, "walk");
  led.record(ch3LedgerEntry(s3, s3.rounds[1]!));
  return led;
}

describe("finale view-model", () => {
  it("aggregates profile, evidence, cost, and stats from the ledger only", () => {
    const view = buildFinaleView(seededLedger());
    expect(view.profile.totalDecisions).toBe(7);
    expect(view.axes).toHaveLength(3);
    expect(view.cost.toStreet).toBe(149);
    expect(view.cost.forgoneStatutory).toBeCloseTo(152.5, 9);
    expect(view.stats).toEqual(UK_STAT_CARDS);
    expect(view.partial).toBe(false);
  });

  it("cost summary entry does not dilute the deferral axis", () => {
    const led = seededLedger();
    const p = led.all();
    // deferral axis = deferred / ch1_ experiment entries only → 1 of 2 = 50
    const view = buildFinaleView(led);
    expect(view.profile.deferral).toBe(50);
    void p;
  });

  it("evidence lines quote the player's own choices", () => {
    const led = seededLedger();
    const view = buildFinaleView(led);
    const def = view.axes.find((a) => a.key === "deferral")!;
    expect(def.line).toContain("Day 5");
    expect(def.line).toContain("chased");
    const anch = view.axes.find((a) => a.key === "anchoring")!;
    expect(anch.line).toContain("£800");
    const sunk = view.axes.find((a) => a.key === "sunkCost")!;
    expect(sunk.line).toContain("stopped work");
  });

  it("the pair's deferral line reads as one controlled trial run twice, not a duplicate", () => {
    const view = buildFinaleView(seededLedger()); // day 3 deferred, day 5 chased
    const def = view.axes.find((a) => a.key === "deferral")!;
    // Both arms on one line, with the visible repetition made explicit.
    expect(def.line).toContain("Day 3");
    expect(def.line).toContain("Day 5");
    expect(def.line).toContain("you deferred");
    expect(def.line).toContain("you chased");
    expect(def.line).toContain("the same offer twice");
  });

  it("verdict names the dominant axis in one quotable line", () => {
    const view = buildFinaleView(seededLedger());
    const v = verdictLine(view.profile);
    expect(v.siki).toContain("Your week in one line:");
    expect(v.zana.length).toBeGreaterThan(5);
  });

  it("verdict on an empty ledger reads clean, never clinical", () => {
    const view = buildFinaleView(new DecisionLedger());
    const v = verdictLine(view.profile);
    expect(v.siki).toContain("clean ledger");
    expect(v.siki).not.toMatch(/bias|disorder|diagnos/i);
  });

  it("empty ledger → zeroed profile, honest 'unmeasured' lines, partial=true", () => {
    const view = buildFinaleView(new DecisionLedger());
    expect(view.profile.totalDecisions).toBe(0);
    expect(view.partial).toBe(true);
    // Every axis must say something honest about missing data.
    for (const a of view.axes) expect(a.line.length).toBeGreaterThan(10);
    expect(axisEvidence(new DecisionLedger(), view.profile)).toHaveLength(3);
  });
});
