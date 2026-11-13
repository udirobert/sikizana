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
  DEFER_CLEAR_DAYS,
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

  it("different seed → different ordinary invoices, same fixed pair", () => {
    const a = createCh1State(1).state;
    const b = createCh1State(999).state;
    // The ordinary invoices are seeded (the ordinary days vary by run).
    expect(a.invoices[0]!.principal).not.toBe(b.invoices[0]!.principal);
    // The pair is FIXED — the debrief's framing attribution depends on it.
    expect(a.invoices[2]!.client).toBe(b.invoices[2]!.client);
    expect(a.invoices[2]!.principal).toBe(b.invoices[2]!.principal);
    expect(a.invoices[3]!.client).toBe(b.invoices[3]!.client);
    expect(a.invoices[3]!.principal).toBe(b.invoices[3]!.principal);
  });

  it("roster: early invoice overdue from frame one, second on day 2, pair on days 3 and 5", () => {
    const { state } = createCh1State(20261109);
    expect(state.cash).toBe(START_CASH);
    expect(state.invoices[0]!.dueDay).toBe(0); // already overdue
    expect(state.invoices[1]!.dueDay).toBe(2); // the second real choice day
    expect(state.invoices[2]!.dueDay).toBe(PAIR_A_DAY);
    expect(state.invoices[3]!.dueDay).toBe(PAIR_B_DAY);
    // Day 2 must always be a real choice — its own invoice is due that day.
    expect(state.invoices[0]!.client).not.toBe(state.invoices[1]!.client);
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

  it("day 2 offers its own invoice — never a single button", () => {
    const { state } = createCh1State(20261109);
    // Whatever day 1 did, day 2 offers inv-2nd (the second ordinary invoice).
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "fun")!.id);
    const c = dayChoices(state, 2);
    expect(c.some((x) => x.kind === "chase" && x.invoiceId === "inv-2nd")).toBe(true);
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
    // Display goes through the market formatter, so thousands are grouped.
    expect(c.find((x) => x.kind === "pay_bill")!.label).toContain(`£${BILL.amount.toLocaleString("en-GB")}`);
    expect(c.some((x) => x.kind === "skip_bill")).toBe(true);
  });

  it("pair days offer the pair with the identical 2-vs-10 framing — only the near payoff's distance differs", () => {
    const { state } = createCh1State(20261109);
    for (let d = 1; d < PAIR_A_DAY; d++) {
      const c = dayChoices(state, d);
      resolveDay(state, d, c.find((x) => x.kind === "fun")!.id);
    }
    const aChase = dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "chase")!;
    expect(aChase.invoiceId).toBe("inv-a");
    expect(aChase.detail).toBe(`Chase — the full £2,400 lands in ${PAIR_A_CHASE_CLEAR_DAYS} days.`);
    expect(dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "defer")!.detail).toBe(
      `Defer — the full £2,400 lands in ${PAIR_A_DEFER_CLEAR_DAYS} days instead.`,
    );
    // Day 3's NEAR payoff lands IN the week (on the till); its defer lands after.
    expect(PAIR_A_DAY + PAIR_A_CHASE_CLEAR_DAYS).toBeLessThanOrEqual(CH1_DAYS);
    expect(PAIR_A_DAY + PAIR_A_DEFER_CLEAR_DAYS).toBeGreaterThan(CH1_DAYS);

    // Day 5 — the SAME numbers (2 vs 10), the near payoff just past the close.
    resolveDay(state, PAIR_A_DAY, aChase.id);
    resolveDay(state, 4, dayChoices(state, 4).find((x) => x.kind === "fun")!.id);
    const bChase = dayChoices(state, PAIR_B_DAY).find((x) => x.kind === "chase")!;
    expect(bChase.invoiceId).toBe("inv-b");
    expect(bChase.detail).toBe(`Chase — the full £2,400 lands in ${PAIR_B_CHASE_CLEAR_DAYS} days.`);
    expect(dayChoices(state, PAIR_B_DAY).find((x) => x.kind === "defer")!.detail).toBe(
      `Defer — the full £2,400 lands in ${PAIR_B_DEFER_CLEAR_DAYS} days instead.`,
    );
    // The days are numerically identical — no button leaks which is "better."
    expect(PAIR_A_CHASE_CLEAR_DAYS).toBe(PAIR_B_CHASE_CLEAR_DAYS);
    expect(PAIR_A_DEFER_CLEAR_DAYS).toBe(PAIR_B_DEFER_CLEAR_DAYS);
    expect(PAIR_B_DAY + PAIR_B_CHASE_CLEAR_DAYS).toBeGreaterThan(CH1_DAYS);
  });

  it("the deferral is the same 8-day slip in both arms (controlled experiment)", () => {
    expect(DEFER_EXTRA_DAYS).toBe(8);
    expect(DEFER_CLEAR_DAYS - PAIR_A_CHASE_CLEAR_DAYS).toBe(PAIR_B_DEFER_CLEAR_DAYS - PAIR_B_CHASE_CLEAR_DAYS);
  });

  it("a deferral commits: the deferred invoice is never re-offered with a shorter payoff", () => {
    const { state } = createCh1State(20261109);
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "fun")!.id); // inv-early commits
    // inv-early must not reappear in any later day's offer (the round-2 leak).
    for (let d = 2; d <= CH1_DAYS; d++) {
      const c = dayChoices(state, d);
      expect(c.some((x) => x.invoiceId === "inv-early")).toBe(false);
      const fun = c.find((x) => x.kind === "fun")!;
      if (state.done) break;
      resolveDay(state, d, fun.id);
    }
  });
});

describe("ch1 the falling worth + the street's engine", () => {
  it("the market's bid is honest: never above face, and below face once overdue", () => {
    const { state } = createCh1State(20261109);
    for (const inv of state.invoices) {
      // At/after its due day the bid is face (nothing has aged yet).
      expect(worthToday(inv, inv.dueDay)).toBe(inv.principal);
      // One day past due it is strictly below face — the street buys a
      // discount, it never pays MORE than face (no misleading "worth").
      expect(worthToday(inv, inv.dueDay + 1)).toBeLessThan(inv.principal);
      expect(worthToday(inv, inv.dueDay + 1)).toBeGreaterThan(0);
      // The bid never exceeds face at any age (the 30% cap keeps it bounded).
      expect(worthToday(inv, inv.dueDay + 40)).toBeLessThanOrEqual(inv.principal);
    }
  });

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

  it("the lantern (street take) accrues the same daily shed, and a chase stops it", () => {
    const { state } = createCh1State(20261109);
    // Fun on day 1 → the overdue invoice is committed and sheds from day 1.
    const e1 = resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "fun")!.id);
    expect(e1.effects.lanternDelta).toBeGreaterThan(0);
    expect(state.streetTake).toBeCloseTo(e1.effects.lanternDelta, 9);
    // A fresh run: chase the overdue invoice on day 1 → it never sheds.
    const s2 = createCh1State(20261109).state;
    const e1c = resolveDay(s2, 1, dayChoices(s2, 1).find((x) => x.kind === "chase")!.id);
    expect(e1c.effects.lanternDelta).toBe(0); // chase stops the shedding on day 1
  });

  it("deferralLines price exactly what the lantern tallied (sum invariant)", () => {
    // Fun all week → everything commits and sheds; the line items must match.
    const s = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    expectLinesSumToLantern(s);
  });

  it("a chased invoice produces no line; a committed one is priced over the days it sat", () => {
    // Chase everything (incl. day 1) → inv-early landed day 3, never sat → no line.
    const chased = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : "chase"));
    expect(deferralLines(chased).find((l) => l.invoiceId === "inv-early")).toBeUndefined();
    // Fun all week → every invoice commits and sits; inv-2nd has a priced line.
    const s = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    const line = deferralLines(s).find((l) => l.invoiceId === "inv-2nd")!;
    expect(line.streetTake).toBeGreaterThan(0);
    expect(line.daysLate).toBeGreaterThan(0);
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
    // cash minus the collected principal = start + day-2 + day-3 walk-in trade.
    const trade = (d: number) => 140 + ((d * 37) % 60);
    expect(state.cash - principal).toBe(START_CASH + trade(2) + trade(3));
  });

  it("the day-3 pair chase pays IN the week (day 5); the day-5 pair chase pays after (day 7)", () => {
    const { state } = createCh1State(20261109);
    for (let d = 1; d < PAIR_A_DAY; d++) {
      const c = dayChoices(state, d);
      resolveDay(state, d, c.find((x) => x.kind === "fun")!.id);
    }
    resolveDay(state, PAIR_A_DAY, dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "chase")!.id);
    // The choice that moves the till: £2,400 lands day 5, on screen.
    expect(state.invoices[2]!.paidDay).toBe(PAIR_A_DAY + PAIR_A_CHASE_CLEAR_DAYS); // day 5
    expect(state.invoices[2]!.paidDay).toBeLessThanOrEqual(CH1_DAYS);
    // Day 5: the identical choice, the payoff just past the close.
    resolveDay(state, 4, dayChoices(state, 4).find((x) => x.kind === "fun")!.id);
    resolveDay(state, PAIR_B_DAY, dayChoices(state, PAIR_B_DAY).find((x) => x.kind === "chase")!.id);
    expect(state.invoices[3]!.paidDay).toBe(PAIR_B_DAY + PAIR_B_CHASE_CLEAR_DAYS); // day 7
    expect(state.invoices[3]!.paidDay).toBeGreaterThan(CH1_DAYS);
  });
});

describe("ch1 supplier bill — the day the till can empty", () => {
  it("paying the bill is a cash out — affordable only if the early chases landed", () => {
    const { state } = createCh1State(20261109);
    // Chase day 1 → £1,200 lands day 3. (Day 4: nothing else lands.)
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "chase")!.id);
    resolveDay(state, 2, dayChoices(state, 2).find((x) => x.kind === "fun")!.id);
    resolveDay(state, 3, dayChoices(state, 3).find((x) => x.kind === "fun")!.id);
    const before = state.cash;
    const e4 = resolveDay(state, 4, dayChoices(state, 4).find((x) => x.kind === "pay_bill")!.id);
    expect(e4.effects.cashDelta).toBe(-BILL.amount);
    expect(state.cash).toBe(before - BILL.amount);
  });

  it("skipping the bill: the liability outruns the till — it empties on day 4", () => {
    const s = play(20261109, (_st, d) => (d === 4 ? "skip_bill" : "fun"));
    expect(s.endedEarly).toBe("till_empty");
    // The loss lands on the day of the skip, before any late fee accrues: the
    // unpaid face (£2,000) is simply more than the till holds (£1,722).
    expect(s.bill.skippedDay).toBe(4);
    expect(netPosition(s)).toBeLessThan(0);
    // The bill's liability (face + any accrued fee) is what the till shows owed.
    expect(s.bill.amount + s.lateFees).toBeGreaterThan(s.cash);
  });

  it("choosing something else on bill day still marks the bill unpaid (auto-skip)", () => {
    const { state } = createCh1State(20261109);
    for (let d = 1; d < 4; d++) {
      const c = dayChoices(state, d);
      resolveDay(state, d, c.find((x) => x.kind === "fun")!.id);
    }
    resolveDay(state, 4, dayChoices(state, 4).find((x) => x.kind === "fun")!.id);
    expect(state.bill.skippedDay).toBe(4);
  });

  it("a rational run stays positive: chase everything, pay the bill", () => {
    const s = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : "chase"));
    expect(s.endedEarly).toBeNull();
    expect(netPosition(s)).toBeGreaterThan(START_CASH);
    expect(s.streetTake).toBe(0); // nothing was ever left to age
  });

  it("rational and careless runs end differently (the critic's core demand)", () => {
    const rational = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : "chase"));
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
    const chaseSome = play(20261109, (st, d) => (d === 4 ? (st.cash >= BILL.amount ? "pay_bill" : "skip_bill") : "chase"));
    expect(deferAll.streetTake).toBeGreaterThan(chaseSome.streetTake);
    expect(deferAll.streetTake).toBeGreaterThan(0);
    expectLinesSumToLantern(deferAll);
  });
});
