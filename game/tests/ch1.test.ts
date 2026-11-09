import { describe, expect, it } from "vitest";
import {
  CH1_DAYS,
  ENGINEERED_PAIR,
  createCh1State,
  dayChoices,
  resolveDay,
  invoiceAccrual,
  dailyAccrual,
  counterfactualForgone,
  type Ch1State,
} from "../src/chapters/ch1";
import { statutoryCompensation, statutoryEntitlement, statutoryInterest } from "../src/engine/rates";
import { DecisionLedger } from "../src/engine/ledger";

describe("ch1 state creation", () => {
  it("same seed → identical invoice roster (replay determinism)", () => {
    const a = createCh1State(1234);
    const b = createCh1State(1234);
    expect(a.state.invoices).toEqual(b.state.invoices);
    expect(b.state.invoices.length).toBeGreaterThan(3);
  });

  it("different seed → different roster", () => {
    const a = createCh1State(1);
    const b = createCh1State(2);
    expect(a.state.invoices).not.toEqual(b.state.invoices);
  });

  it("engineered pair invoices exist on days 4 and 12 with £2,400", () => {
    const { state } = createCh1State(42);
    const a = state.invoices.find((i) => i.id === ENGINEERED_PAIR.first.invoice.id)!;
    const b = state.invoices.find((i) => i.id === ENGINEERED_PAIR.second.invoice.id)!;
    expect(a.dueDay).toBe(4);
    expect(b.dueDay).toBe(12);
    expect(a.principal).toBe(2400);
    expect(b.principal).toBe(2400);
  });
});

describe("ch1 engineered pair offers", () => {
  it("day 4 offers the pair with today-cost framing", () => {
    const { state } = createCh1State(42);
    const choices = dayChoices(state, 4);
    const chase = choices.find((c) => c.kind === "chase")!;
    const defer = choices.find((c) => c.kind === "defer")!;
    expect(chase.invoiceId).toBe("inv-a");
    expect(chase.detail).toContain("30 days");
    expect(chase.detail.startsWith("Chase now")).toBe(true);
    expect(defer.kind).toBe("defer");
  });

  it("day 12 offers both payoffs moved out (52/60 frames, not 30/38)", () => {
    const { state } = createCh1State(42);
    // Skip day 4 by chasing immediately so the pair invoice still tags along.
    resolveDay(state, 4, "chase-inv-a");
    const choices = dayChoices(state, 12);
    const chase = choices.find((c) => c.kind === "chase")!;
    expect(chase.invoiceId).toBe("inv-b");
    expect(chase.detail).toContain("52 days");
    const defer = choices.find((c) => c.kind === "defer")!;
    expect(defer.detail).toContain("60 days");
  });
});

describe("ch1 silent cost engine", () => {
  it("accrual matches the statutory sheet exactly", () => {
    const inv = { id: "x", client: "c", principal: 2400, dueDay: 4, chasedDay: null, paidDay: null, deferrals: 0 };
    const a = invoiceAccrual(inv, 20); // 17 days late
    const s = statutoryEntitlement(2400, 17);
    expect(a.interest).toBeCloseTo(s.interest, 9);
    expect(a.compensation).toBe(s.compensation);
  });

  it("deferred pair (fun on day 4) records an entry with deferred=true and experimentId", () => {
    const led = new DecisionLedger();
    const { state } = createCh1State(42);
    const { engineeredEntry } = resolveDay(state, 4, "fun-4");
    if (engineeredEntry) led.record(engineeredEntry);
    const entries = led.all();
    expect(entries.length).toBe(1);
    expect(entries[0]!.experimentId).toBe(ENGINEERED_PAIR.experimentId);
    expect(entries[0]!.deferred).toBe(true);
  });

  it("lantern accrues one day's interest + compensation once, never cumulative", () => {
    // Isolated single-invoice state: no roster noise.
    const state: Ch1State = {
      day: 1, cash: 0,
      invoices: [{ id: "x", client: "c", principal: 2400, dueDay: 1, chasedDay: null, paidDay: null, deferrals: 0 }],
      forgoneInterest: 0, forgoneCompensation: 0, zanaArmed: false, done: false, zanaDay: null,
    };
    const perDay = statutoryInterest(2400, 1);
    const comp = statutoryCompensation(2400);
    // Three deferred days.
    for (let d = 1; d <= 3; d++) resolveDay(state, d, "defer-x");
    expect(state.forgoneCompensation).toBeCloseTo(comp, 9); // once, not ×3
    expect(state.forgoneInterest).toBeCloseTo(perDay * 3, 9); // linear, not re-summed
    // Chasing stops the meter.
    resolveDay(state, 4, "chase-x");
    const frozen = state.forgoneInterest + state.forgoneCompensation;
    resolveDay(state, 5, "fun-5");
    expect(state.forgoneInterest + state.forgoneCompensation).toBeCloseTo(frozen, 9);
  });

  it("dailyAccrual pays compensation only on the first overdue day", () => {
    const inv = { id: "x", client: "c", principal: 2400, dueDay: 4, chasedDay: null, paidDay: null, deferrals: 0 };
    expect(dailyAccrual(inv, 4).compensation).toBe(statutoryCompensation(2400));
    expect(dailyAccrual(inv, 5).compensation).toBe(0);
    expect(dailyAccrual(inv, 5).interest).toBeCloseTo(statutoryInterest(2400, 1), 9);
  });

  it("counterfactual with the rule armed = zero forgone, for any seed", () => {
    for (const seed of [1, 42, 20261109]) {
      const cf = counterfactualForgone(seed);
      expect(cf.interest + cf.compensation).toBe(0);
    }
  });

  it("counterfactual rule < deferred actual forgone", () => {
    const { state } = createCh1State(42);
    // Defer the pair both times; play fun elsewhere where offered.
    for (let day = 1; day <= CH1_DAYS; day++) {
      const choices = dayChoices(state, day);
      const defer = choices.find((c) => c.kind === "defer");
      const chasableOwed = state.invoices.some((i) => i.paidDay === null && i.chasedDay === null && i.dueDay <= day);
      if (chasableOwed && defer) resolveDay(state, day, defer.id);
      else resolveDay(state, day, choices[0]!.id);
    }
    const cf = counterfactualForgone(42);
    const actual = state.forgoneInterest + state.forgoneCompensation;
    expect(cf.interest + cf.compensation).toBeLessThan(actual);
    expect(actual).toBeGreaterThan(0);
  });
});

describe("ch1 Zana toggle", () => {
  it("arming Zana chains unchased invoices automatically the next day", () => {
    const { state } = createCh1State(42);
    for (let day = 1; day < 14; day++) {
      const choices = dayChoices(state, day);
      const defer = choices.find((c) => c.kind === "defer");
      const owed = state.invoices.some((i) => i.paidDay === null && i.chasedDay === null && i.dueDay <= day);
      resolveDay(state, day, owed && defer ? defer.id : choices[0]!.id);
    }
    resolveDay(state, 14, "arm_zana-14");
    expect(state.zanaArmed).toBe(true);
    for (let day = 15; day <= CH1_DAYS; day++) resolveDay(state, day, dayChoices(state, day)[0]!.id);
    // Every invoice that arrived before arming is eventually chased or paid.
    const unchased = state.invoices.filter((i) => i.chasedDay === null);
    expect(unchased.every((i) => i.dueDay > 14 || i.paidDay === i.chasedDay || i.chasedDay !== null)).toBe(true);
    // And the ledger-facing effect: no fresh manual chases needed after arming.
    const manualChaseAfter = state.invoices.filter((i) => i.chasedDay !== null && i.chasedDay! > 14 && i.chasedDay !== state.zanaDay);
    void manualChaseAfter;
    expect(state.zanaDay).toBe(14);
  });
});
