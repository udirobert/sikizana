import { describe, expect, it } from "vitest";
import { DecisionLedger, irrationalityProfile } from "../src/engine/ledger";
import { mulberry32 } from "../src/engine/rng";

// The ledger is the pedagogy spine (GDD A1/A5/A6): profile + Cost of Not Acting
// must be pure functions over recorded decisions.
describe("decision ledger", () => {
  it("records monotonic ids and preserves prompt/options", () => {
    const led = new DecisionLedger();
    led.record({ chapter: 1, day: 4, experimentId: "ch1_present_pair_a", prompt: "Chase or defer?", optionsShown: [{ id: "defer", label: "Tomorrow", framingVariable: "timing_today_vs_later", isDefault: false }], chosenOptionId: "defer", deferred: true, immediateConsequence: "day passes" });
    led.record({ chapter: 1, day: 12, experimentId: "ch1_present_pair_b", prompt: "Chase or defer (delayed)?", optionsShown: [{ id: "defer", label: "Later", framingVariable: "timing_delayed", isDefault: false }], chosenOptionId: "chase", deferred: false, immediateConsequence: "chased" });
    expect(led.all().length).toBe(2);
    expect(led.all()[0]!.id).toBe("1-0001");
    expect(led.all()[1]!.id).toBe("1-0002");
    expect(led.byExperiment("ch1_present_pair_a")[0]!.prompt).toBe("Chase or defer?");
  });

  it("survives serialize/deserialize round-trip", () => {
    const led = new DecisionLedger();
    led.record({ chapter: 1, day: 1, experimentId: "ch1_x", prompt: "p", optionsShown: [], chosenOptionId: "o", deferred: false, immediateConsequence: "c" });
    const led2 = DecisionLedger.deserialize(led.serialize());
    expect(led2.all().length).toBe(1);
  });

  it("profile: deferral rate from pair entries; anchoring from floors; 100% deferral = max axis", () => {
    const led = new DecisionLedger();
    led.record({ chapter: 1, day: 4, experimentId: "ch1_present_pair_a", prompt: "p", optionsShown: [], chosenOptionId: "defer", deferred: true, immediateConsequence: "" });
    led.record({ chapter: 1, day: 5, experimentId: "ch1_present_pair_a", prompt: "p", optionsShown: [], chosenOptionId: "defer", deferred: true, immediateConsequence: "" });
    led.record({ chapter: 2, day: 30, experimentId: "ch2_anchor_high", prompt: "p", optionsShown: [{ id: "o", label: "ol", framingVariable: "anchor_650", isDefault: false }], chosenOptionId: "o", deferred: false, negotiationFloor: 520, immediateConsequence: "" });
    led.record({ chapter: 2, day: 31, experimentId: "ch2_anchor_low", prompt: "p", optionsShown: [{ id: "o", label: "ol", framingVariable: "anchor_350", isDefault: false }], chosenOptionId: "o", deferred: false, negotiationFloor: 280, immediateConsequence: "" });
    led.record({ chapter: 2, day: 32, experimentId: "ch2_anchor_mid", prompt: "p", optionsShown: [{ id: "o", label: "ol", framingVariable: "anchor_500", isDefault: false }], chosenOptionId: "o", deferred: false, negotiationFloor: 400, immediateConsequence: "" });

    const prof = irrationalityProfile(led);
    expect(prof.deferral).toBe(100);
    // Floor tracks anchors near 1:1 → high anchoring score.
    expect(prof.anchoring).toBeGreaterThan(70);
    expect(prof.totalDecisions).toBe(5);
  });

  it("cost of not acting sums NPC fees + forgone entitlement", () => {
    const led = new DecisionLedger();
    led.record({ chapter: 1, day: 6, experimentId: "ch1_x", prompt: "p", optionsShown: [], chosenOptionId: "accept", deferred: false, npc: { npc: "The Factor", decision: "accept", feePaid: 74 }, immediateConsequence: "" });
    led.record({ chapter: 1, day: 7, experimentId: "ch1_y", prompt: "p", optionsShown: [], chosenOptionId: "defer", deferred: true, forgoneEntitlement: { interest: 12.5, compensation: 0, total: 12.5 }, immediateConsequence: "" });
    const c = led.costOfNotActing();
    expect(c.toStreet).toBe(74);
    expect(c.forgoneStatutory).toBeCloseTo(12.5);
  });
});

describe("rng determinism", () => {
  it("same seed → same sequence (experiment replays must be identical)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 32; i++) expect(a()).toBe(b());
  });
});
