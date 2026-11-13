import { describe, expect, it } from "vitest";
import {
  CH1_DAYS,
  BILL,
  createCh1State,
  dayChoices,
  resolveDay,
  deferralLines,
  netPosition,
  type Ch1State,
} from "../src/chapters/ch1";

/** Play an archetype: pick the choice whose kind the policy asks for,
 *  falling back to the fun task. Returns the finished state. */
function play(seed: number, want: (state: Ch1State, day: number) => string): Ch1State {
  const { state } = createCh1State(seed);
  for (let d = 1; d <= CH1_DAYS; d++) {
    if (state.done) break;
    const choices = dayChoices(state, d);
    const c = choices.find((x) => x.kind === want(state, d)) ?? choices.find((x) => x.kind === "fun")!;
    resolveDay(state, d, c.id);
  }
  return state;
}

/** The line items must sum exactly to the lantern (street take) — the
 *  debrief's replay is priced from the same daily arithmetic. */
function expectLinesSumToLantern(state: Ch1State) {
  const sum = deferralLines(state).reduce((t, l) => t + l.streetTake, 0);
  expect(sum).toBeCloseTo(state.streetTake, 9);
}

describe("ch1 balance archetypes (seed 20261109)", () => {
  it("rational run (chase everything, pay the bill) ends healthy, with no street earnings", () => {
    const s = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : "chase"));
    expect(s.endedEarly).toBeNull();
    expect(netPosition(s)).toBeGreaterThan(3000); // ends well above the start
    expect(s.streetTake).toBe(0); // nothing was ever left to age
    expect(deferralLines(s)).toHaveLength(0);
    expectLinesSumToLantern(s);
  });

  it("present-bias run (chase the near day-3 payoff, defer the far day-5 one) — the frame, not the facts, did the work", () => {
    // The tilt the experiment measures: the identical "in 2" feels near on Day 3
    // (it lands in the week, on the till) and far on Day 5 (it lands after the
    // close). The player chases the near one and defers the far one.
    const s = play(20261109, (st, d) => {
      if (d === 5) return "defer";
      if (d === 4) return st.cash >= BILL.amount ? "pay_bill" : "skip_bill";
      return "chase";
    });
    expect(s.endedEarly).toBeNull();
    expect(netPosition(s)).toBeGreaterThan(2500);
    // The near payoff was chased (lands day 5, in the week); the far one was
    // committed to deferral (pays day 15, after the close).
    expect(s.invoices[2]!.chasedDay).toBe(3);
    expect(s.invoices[3]!.deferredDay).toBe(5);
    // The day-5 deferral sheds nothing inside the chapter (the invoice only
    // goes past-due on day 6): the till is IDENTICAL to the rational run. The
    // cost of the tilt is the frame, not cash — the profile measures it from
    // the ledger's `deferred` flag, not the street take.
    expect(s.streetTake).toBe(0);
    expectLinesSumToLantern(s);
  });

  it("careless run (fun all week, skip the bill) empties the till on day 4 — the bill face does it", () => {
    const s = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    expect(s.endedEarly).toBe("till_empty");
    // The loss lands on the day of the skip: the unpaid face (£2,000) is simply
    // more than the till holds — not a one-seed knife edge on the £40 fee.
    expect(s.bill.skippedDay).toBe(4);
    expect(netPosition(s)).toBeLessThan(0);
    expect(deferralLines(s).length).toBeGreaterThanOrEqual(1);
    expectLinesSumToLantern(s);
  });

  it("rational and careless runs end differently (the critic's core demand)", () => {
    const rational = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : "chase"));
    const careless = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    expect(rational.endedEarly).toBeNull();
    expect(careless.endedEarly).toBe("till_empty");
    expect(netPosition(rational) - netPosition(careless)).toBeGreaterThan(500);
  });
});
