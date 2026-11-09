import { describe, expect, it } from "vitest";
import {
  CH2_ANCHORS,
  createCh2State,
  currentRun,
  counterpartyCounter,
  accept,
  walk,
  ch2LedgerEntry,
  ch2Prospect,
  collectorProbe,
  collectorLedgerEntry,
  flippedOutcome,
} from "../src/chapters/ch2";

describe("ch2 anchoring rig", () => {
  it("prospect is identical across everything (structural identity)", () => {
    const p1 = ch2Prospect();
    const p2 = ch2Prospect();
    expect(p1).toEqual(p2);
    expect(p1.total).toBeGreaterThan(p1.principal); // law is real: interest + comp
  });

  it("anchors move while prospect never does", () => {
    expect(new Set(CH2_ANCHORS.map(String)).size).toBe(3);
  });

  it("floors are recorded with anchor framing variables in ledger entries", () => {
    const { state, rng } = createCh2State(77);
    counterpartyCounter(state, rng); // the desk moves
    const run = currentRun(state);
    run.floor = 880;
    accept(state);
    const e = ch2LedgerEntry(state, run);
    expect(e.experimentId.startsWith("ch2_")).toBe(true);
    expect(e.negotiationFloor).toBe(880);
    expect(e.optionsShown.some((o) => o.framingVariable === `anchor_${run.anchor}`)).toBe(true);
  });

  it("counterparty counters are deterministic per seed and bounded below the prospect", () => {
    const mk = (seed: number) => {
      const { state, rng } = createCh2State(seed);
      const a = counterpartyCounter(state, rng);
      const b = counterpartyCounter(state, rng);
      const c = counterpartyCounter(state, rng);
      return { a, b, c };
    };
    const x = mk(123);
    const y = mk(123);
    expect(x).toEqual(y);
    const prospect = ch2Prospect().total;
    for (const v of [x.a, x.b] as (number | null)[]) {
      if (typeof v === "number") expect(v).toBeLessThan(prospect); // the desk never meets the law
    }
    expect(x.c).toBeNull(); // 3 rounds max: anchor + 2
  });

  it("flip counterfactual lands between the best anchor and the prospect", () => {
    const f = flippedOutcome(909);
    const p = ch2Prospect();
    expect(f.offer).toBeGreaterThan(CH2_ANCHORS[1]!); // beats the worst opening
    expect(f.offer).toBeLessThan(p.total); // still shy of the full statutory sum
  });
});

describe("ch2 collector probe", () => {
  it("buy price reflects the commission band and the fee is recorded honestly", () => {
    const probe = collectorProbe();
    expect(probe.buyPrice).toBeLessThan(probe.faceValue);
    const e = collectorLedgerEntry(probe, true);
    expect(e.npc?.npc).toBe("The Collector");
    expect(e.npc?.feePaid).toBeCloseTo(probe.faceValue - probe.buyPrice, 0);
    const declined = collectorLedgerEntry(probe, false);
    expect(declined.npc?.feePaid ?? 0).toBe(0);
  });

  it("walk records ledger without a settlement", () => {
    const { state, rng } = createCh2State(5);
    counterpartyCounter(state, rng);
    const run = currentRun(state);
    run.floor = 400;
    walk(state);
    const e = ch2LedgerEntry(state, run);
    expect(e.chosenOptionId).toBe("walk");
  });
});
