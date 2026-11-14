import { describe, expect, it } from "vitest";
import {
  CH1_DAYS,
  BILL,
  START_CASH,
  PAIR_A_DAY,
  PAIR_B_DAY,
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

function billKind(st: Ch1State, d: number, otherwise: string): string {
  if (d !== BILL.dueDay) return otherwise;
  const arriving = st.invoices.filter((i) => i.paidDay === d).reduce((s, i) => s + i.principal, 0);
  return st.cash + arriving >= BILL.amount ? "pay_bill" : "skip_bill";
}

/** The line items must sum exactly to the lantern (street take) — the
 *  debrief's replay is priced from the same daily arithmetic. */
function expectLinesSumToLantern(state: Ch1State) {
  const sum = deferralLines(state).reduce((t, l) => t + l.streetTake, 0);
  expect(sum).toBeCloseTo(state.streetTake, 9);
}

describe("ch1 balance archetypes (seed 20261109)", () => {
  it("rational run (chase everything, pay the bill) ends healthy, with no street earnings", () => {
    const s = play(20261109, (st, d) => billKind(st, d, "chase"));
    expect(s.endedEarly).toBeNull();
    expect(netPosition(s)).toBeGreaterThan(START_CASH);
    expect(s.streetTake).toBe(0);
    expect(deferralLines(s)).toHaveLength(0);
    expectLinesSumToLantern(s);
  });

  it("present-bias run (chase the near payoff, defer the far one) — the frame, not the facts, did the work", () => {
    const s = play(20261109, (st, d) => (d === PAIR_B_DAY ? "defer" : billKind(st, d, "chase")));
    expect(s.endedEarly).toBeNull();
    expect(netPosition(s)).toBeGreaterThan(START_CASH);
    expect(s.invoices[0]!.chasedDay).toBe(PAIR_A_DAY);
    expect(s.invoices[1]!.deferredDay).toBe(PAIR_B_DAY);
    // The last-day deferral is due that morning, so it sheds nothing inside
    // the chapter. The till matches the rational run. The profile measures
    // the tilt from the ledger, not from cash.
    expect(s.streetTake).toBe(0);
    expectLinesSumToLantern(s);
  });

  it("careless run (fun, then skip the bill) empties the till on bill day", () => {
    const s = play(20261109, (_st, d) => (d === BILL.dueDay ? "skip_bill" : "fun"));
    expect(s.endedEarly).toBe("till_empty");
    expect(s.bill.skippedDay).toBe(BILL.dueDay);
    expect(netPosition(s)).toBeLessThan(0);
    expect(deferralLines(s).length).toBeGreaterThanOrEqual(1);
    expectLinesSumToLantern(s);
  });

  it("rational and careless runs end differently (the critic's core demand)", () => {
    const rational = play(20261109, (st, d) => billKind(st, d, "chase"));
    const careless = play(20261109, (_st, d) => (d === BILL.dueDay ? "skip_bill" : "fun"));
    expect(rational.endedEarly).toBeNull();
    expect(careless.endedEarly).toBe("till_empty");
    expect(netPosition(rational) - netPosition(careless)).toBeGreaterThan(500);
  });
});
