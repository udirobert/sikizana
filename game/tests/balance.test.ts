import { describe, expect, it } from "vitest";
import {
  CH1_DAYS,
  createCh1State,
  dayChoices,
  resolveDay,
  deferralLines,
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

/** The line items must sum exactly to the lantern (forgone interest +
 *  compensation) — the debrief's replay is priced from the same arithmetic
 *  as the accrual, never a separate number. */
function expectLinesSumToLantern(state: Ch1State) {
  const lantern = state.forgoneInterest + state.forgoneCompensation;
  const sum = deferralLines(state).reduce((t, l) => t + l.total, 0);
  expect(sum).toBeCloseTo(lantern, 9);
}

describe("ch1 balance archetypes (seed 20261109)", () => {
  it("rational run (chase early, pay the bill) ends healthy, with no street earnings", () => {
    const s = play(20261109, (_st, d) => (d === 4 ? "pay_bill" : "chase"));
    expect(s.endedEarly).toBeNull();
    expect(s.cash).toBeGreaterThan(3000); // ends well above the start
    expect(deferralLines(s)).toHaveLength(0); // nothing sat
    expectLinesSumToLantern(s);
  });

  it("mixed run (defer the pair, chase later, pay the bill) ends healthy and priced", () => {
    const s = play(20261109, (st, d) => {
      if (d === 4) return st.cash >= 1800 ? "pay_bill" : "skip_bill";
      if (d === 1 || d === 3) return "fun"; // let both pair days sit
      return "chase";
    });
    expect(s.endedEarly).toBeNull();
    expect(s.cash).toBeGreaterThan(2000);
    expect(deferralLines(s).length).toBeGreaterThanOrEqual(2);
    expectLinesSumToLantern(s);
  });

  it("careless run (fun all week, pay an unaffordable bill) empties the till and ends early", () => {
    const s = play(20261109, (_st, d) => (d === 4 ? "pay_bill" : "fun"));
    expect(s.endedEarly).toBe("till_empty");
    expect(s.cash).toBeLessThan(0);
    expect(deferralLines(s).length).toBeGreaterThanOrEqual(2);
    expectLinesSumToLantern(s);
  });

  it("rational and careless runs end differently (the critic's core demand)", () => {
    const rational = play(20261109, (_st, d) => (d === 4 ? "pay_bill" : "chase"));
    const careless = play(20261109, (_st, d) => (d === 4 ? "pay_bill" : "fun"));
    expect(rational.endedEarly).not.toEqual(careless.endedEarly);
    expect(rational.cash - careless.cash).toBeGreaterThan(3000);
  });
});
