import { describe, expect, it } from "vitest";
import {
  CH1_DAYS,
  BILL,
  START_CASH,
  PAIR_A_DAY,
  PAIR_B_DAY,
  PAIR_A_CHASE_CLEAR_DAYS,
  PAIR_A_DEFER_CLEAR_DAYS,
  PAIR_B_CHASE_CLEAR_DAYS,
  PAIR_B_DEFER_CLEAR_DAYS,
  DEFER_EXTRA_DAYS,
  createCh1State,
  dayChoices,
  resolveDay,
  deferralLines,
  worthToday,
  daysOverdueOn,
  valueShedForDay,
  netPosition,
  type Ch1State,
} from "../src/chapters/ch1";

/** Play a full chapter under a policy; returns the finished state. */
function play(seed: number, want: (s: Ch1State, d: number) => string): Ch1State {
  const { state } = createCh1State(seed);
  for (let d = 1; d <= CH1_DAYS; d++) {
    if (state.done) break;
    const choices = dayChoices(state, d);
    const c = choices.find((x) => x.kind === want(state, d)) ?? choices.find((x) => x.kind === "fun")!;
    resolveDay(state, d, c.id);
  }
  return state;
}

/** The debrief's line items must price exactly what the lantern tallied. */
function expectLinesSumToLantern(state: Ch1State) {
  const sum = deferralLines(state).reduce((t, l) => t + l.streetTake, 0);
  expect(sum).toBeCloseTo(state.streetTake, 9);
}

describe("ch1 state creation", () => {
  it("same seed → identical invoice roster (replay determinism)", () => {
    const a = createCh1State(42).state;
    const b = createCh1State(42).state;
    expect(a.invoices).toEqual(b.invoices);
    expect(a.cash).toBe(b.cash);
  });

  it("different seed → different early client/principal, same pair", () => {
    const a = createCh1State(1).state;
    const b = createCh1State(999).state;
    expect(a.invoices[0]!.principal).not.toBe(b.invoices[0]!.principal);
    // The pair is fixed — the debrief's framing attribution depends on it.
    expect(a.invoices[1]!.client).toBe(b.invoices[1]!.client);
    expect(a.invoices[1]!.principal).toBe(b.invoices[1]!.principal);
    expect(a.invoices[2]!.dueDay).toBe(PAIR_B_DAY);
  });

  it("roster: early invoice overdue from frame one, pair fixed on days 3 and 5", () => {
    const { state } = createCh1State(20261109);
    expect(state.cash).toBe(START_CASH);
    expect(state.invoices[0]!.dueDay).toBe(0);
    expect(state.invoices[1]!.dueDay).toBe(PAIR_A_DAY);
    expect(state.invoices[2]!.dueDay).toBe(PAIR_B_DAY);
    expect(state.bill.amount).toBe(BILL.amount);
  });
});

describe("ch1 day shape (5-day stall screen)", () => {
  it("day 1 offers the already-overdue invoice as a real choice", () => {
    const { state } = createCh1State(20261109);
    const c = dayChoices(state, 1);
    expect(c.some((x) => x.kind === "chase" && x.invoiceId === "inv-early")).toBe(true);
    expect(c.some((x) => x.kind === "fun")).toBe(true);
  });

  it("day 4 offers the supplier bill: pay or skip", () => {
    const { state } = createCh1State(20261109);
    for (let d = 1; d < 4; d++) {
      const c = dayChoices(state, d);
      resolveDay(state, d, c.find((x) => x.kind === "fun")!.id);
    }
    const c = dayChoices(state, 4);
    expect(c.find((x) => x.kind === "pay_bill")!.label).toContain(BILL.client);
    expect(c.find((x) => x.kind === "pay_bill")!.label).toContain(`£${BILL.amount}`);
    expect(c.some((x) => x.kind === "skip_bill")).toBe(true);
  });

  it("pair days offer the pair invoice with the engineered framings — both arms after the week", () => {
    const { state } = createCh1State(20261109);
    for (let d = 1; d < PAIR_A_DAY; d++) {
      const c = dayChoices(state, d);
      resolveDay(state, d, c.find((x) => x.kind === "fun")!.id);
    }
    const aChase = dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "chase")!;
    expect(aChase.invoiceId).toBe("inv-a");
    expect(aChase.detail).toBe(`Chase now — the money lands in ${PAIR_A_CHASE_CLEAR_DAYS} days.`);
    expect(dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "defer")!.detail).toBe(
      `Defer — the money lands in ${PAIR_A_DEFER_CLEAR_DAYS} days instead.`,
    );
    // Neither arm lands inside the chapter — the structure is not on the button.
    expect(PAIR_A_CHASE_CLEAR_DAYS + PAIR_A_DAY).toBeGreaterThan(CH1_DAYS);
    expect(PAIR_A_DEFER_CLEAR_DAYS + PAIR_A_DAY).toBeGreaterThan(CH1_DAYS);

    // Day 5 — same shape, payoffs moved further out.
    resolveDay(state, PAIR_A_DAY, aChase.id);
    resolveDay(state, 4, dayChoices(state, 4).find((x) => x.kind === "fun")!.id);
    const bChase = dayChoices(state, PAIR_B_DAY).find((x) => x.kind === "chase")!;
    expect(bChase.invoiceId).toBe("inv-b");
    expect(bChase.detail).toBe(`Chase now — the money lands in ${PAIR_B_CHASE_CLEAR_DAYS} days.`);
    expect(dayChoices(state, PAIR_B_DAY).find((x) => x.kind === "defer")!.detail).toBe(
      `Defer — the money lands in ${PAIR_B_DEFER_CLEAR_DAYS} days instead.`,
    );
  });

  it("the deferral is the same 8-day slip in both arms (controlled experiment)", () => {
    expect(DEFER_EXTRA_DAYS).toBe(8);
    expect(PAIR_A_DEFER_CLEAR_DAYS - PAIR_A_CHASE_CLEAR_DAYS).toBe(PAIR_B_DEFER_CLEAR_DAYS - PAIR_B_CHASE_CLEAR_DAYS);
  });
});

describe("ch1 the falling worth + the street's engine", () => {
  it("worth today falls as the invoice ages, and the card's count matches the curve", () => {
    const { state } = createCh1State(20261109);
    const inv = state.invoices[0]!; // inv-early, dueDay 0
    const w1 = worthToday(inv, 1);
    const w3 = worthToday(inv, 3);
    const w5 = worthToday(inv, 5);
    expect(w3).toBeLessThan(w1);
    expect(w5).toBeLessThan(w3);
    // The "N days overdue" the card shows IS daysOverdueOn — one formula.
    expect(daysOverdueOn(inv, 1)).toBe(1);
    expect(daysOverdueOn(inv, 3)).toBe(3);
    // The shed curve is the card's drop: sum of per-day sheds == total fall.
    let shed = 0;
    for (let d = 1; d < 5; d++) shed += valueShedForDay(inv, d);
    expect(w1 - w5).toBe(shed);
  });

  it("the lantern (street take) accrues the same daily shed, and stops when chased", () => {
    const { state } = createCh1State(20261109);
    // Fun on day 1 → the overdue invoice sheds on day 1.
    const e1 = resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "fun")!.id);
    expect(e1.effects.lanternDelta).toBeGreaterThan(0);
    expect(state.streetTake).toBeCloseTo(e1.effects.lanternDelta, 9);
    // Chase it on day 2 → it stops shedding from the chase day.
    const before = state.streetTake;
    resolveDay(state, 2, dayChoices(state, 2).find((x) => x.kind === "chase")!.id);
    expect(state.streetTake).toBeCloseTo(before, 9); // no more shedding for it
  });

  it("deferralLines price exactly what the lantern tallied (sum invariant)", () => {
    // Fun all week → everything sheds; the line items must equal the lantern.
    const s = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    expectLinesSumToLantern(s);
  });

  it("a chased invoice's line is priced only over the days it actually sat", () => {
    const { state } = createCh1State(20261109);
    // Let inv-early sit on day 1 (fun), chase it on day 2 (day 3 belongs to the
    // engineered pair — the pair invoice owns that slot by design).
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "fun")!.id);
    const d2 = dayChoices(state, 2);
    expect(d2.find((x) => x.kind === "chase")!.invoiceId).toBe("inv-early");
    resolveDay(state, 2, d2.find((x) => x.kind === "chase")!.id);
    const line = deferralLines(state).find((l) => l.invoiceId === "inv-early")!;
    expect(line.daysLate).toBe(1); // sat day 1 only, chased day 2
    expect(line.streetTake).toBeGreaterThan(0);
  });

  it("the statutory floor is reported per line and is a real Act figure", () => {
    const s = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    const lines = deferralLines(s);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(l.statutory).toBeGreaterThan(0);
    // The legal floor exists even when the player deferred zero pair days.
    expect(lines.reduce((t, l) => t + l.statutory, 0)).toBeGreaterThan(0);
  });
});

describe("ch1 money lands inside the chapter", () => {
  it("chase on day 1 pays day 3 — collected in the morning of day 3", () => {
    const { state } = createCh1State(20261109);
    const principal = state.invoices[0]!.principal;
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "chase")!.id);
    resolveDay(state, 2, dayChoices(state, 2).find((x) => x.kind === "fun")!.id);
    const e3 = resolveDay(state, 3, dayChoices(state, 3).find((x) => x.kind === "fun")!.id);
    expect(e3.effects.collected).toBe(1);
    expect(state.cash - principal).toBe(1100 + (140 + ((2 * 37) % 60)) + (140 + ((3 * 37) % 60)));
  });

  it("the pair never pays inside the chapter (both arms, both days)", () => {
    const { state } = createCh1State(20261109);
    for (let d = 1; d < PAIR_A_DAY; d++) {
      const c = dayChoices(state, d);
      resolveDay(state, d, c.find((x) => x.kind === "fun")!.id);
    }
    resolveDay(state, PAIR_A_DAY, dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "chase")!.id);
    expect(state.invoices[1]!.paidDay).toBe(PAIR_A_DAY + PAIR_A_CHASE_CLEAR_DAYS); // day 6
    expect(state.invoices[1]!.paidDay).toBeGreaterThan(CH1_DAYS);
  });
});

describe("ch1 supplier bill — the day the till can empty", () => {
  it("paying the bill is a cash out — affordable only if the early chase landed", () => {
    const { state } = createCh1State(20261109);
    // Chase day 1 → £1,300 lands day 3.
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "chase")!.id);
    resolveDay(state, 2, dayChoices(state, 2).find((x) => x.kind === "fun")!.id);
    resolveDay(state, 3, dayChoices(state, 3).find((x) => x.kind === "fun")!.id);
    const before = state.cash;
    const e4 = resolveDay(state, 4, dayChoices(state, 4).find((x) => x.kind === "pay_bill")!.id);
    expect(e4.effects.cashDelta).toBe(-BILL.amount);
    expect(state.cash).toBe(before - BILL.amount);
  });

  it("skipping the bill: the fee leaves the till — the net position dies on the fee", () => {
    const s = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    expect(s.endedEarly).toBe("till_empty");
    expect(s.lateFees).toBe(BILL.lateFee); // the £40 fee did the damage
    expect(netPosition(s)).toBeLessThan(0);
    // The bill's liability (face + fee) is what the till shows it owes.
    expect(state_owed(s)).toBe(BILL.amount + s.lateFees);
  });
  function state_owed(s: Ch1State) {
    return s.bill.amount + s.lateFees;
  }

  it("choosing something else on bill day still marks the bill unpaid (auto-skip)", () => {
    const { state } = createCh1State(20261109);
    for (let d = 1; d < 4; d++) {
      const c = dayChoices(state, d);
      resolveDay(state, d, c.find((x) => x.kind === "fun")!.id);
    }
    resolveDay(state, 4, dayChoices(state, 4).find((x) => x.kind === "fun")!.id);
    expect(state.bill.skippedDay).toBe(4);
  });

  it("a rational run stays positive: chase early, pay the bill, chase the pair", () => {
    const s = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : d === 1 ? "chase" : "fun"));
    expect(s.endedEarly).toBeNull();
    expect(netPosition(s)).toBeGreaterThan(0);
  });

  it("rational and careless runs end differently (the critic's core demand)", () => {
    const rational = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : d === 1 ? "chase" : "fun"));
    const careless = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    expect(rational.endedEarly).toBeNull();
    expect(careless.endedEarly).toBe("till_empty");
    expect(netPosition(rational) - netPosition(careless)).toBeGreaterThan(500);
  });
});

describe("ch1 debrief fuel (street take, not the £0 counterfactual)", () => {
  it("a clean chase-everything run produces zero street take and zero line items", () => {
    const s = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : "chase"));
    expect(s.streetTake).toBe(0);
    expect(deferralLines(s)).toHaveLength(0);
  });

  it("a fully-deferred run has the largest street take — and it sums to the lines", () => {
    const deferAll = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    const chaseSome = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : d === 1 ? "chase" : "fun"));
    expect(deferAll.streetTake).toBeGreaterThan(chaseSome.streetTake);
    expectLinesSumToLantern(deferAll);
  });
});
