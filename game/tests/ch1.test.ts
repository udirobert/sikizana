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

/** Bill day sees money that lands this morning. resolveDay collects it before it spends. */
function billKind(st: Ch1State, d: number, otherwise: string): string {
  if (d !== BILL.dueDay) return otherwise;
  const arriving = st.invoices.filter((i) => i.paidDay === d).reduce((s, i) => s + i.principal, 0);
  return st.cash + arriving >= BILL.amount ? "pay_bill" : "skip_bill";
}

function daysPhrase(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
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

  it("the pair is fixed across seeds", () => {
    const a = createCh1State(1).state;
    const b = createCh1State(999).state;
    expect(a.invoices).toHaveLength(2);
    expect(a.invoices.map((i) => [i.id, i.client, i.principal])).toEqual(
      b.invoices.map((i) => [i.id, i.client, i.principal]),
    );
  });

  it("roster: Harborne already late on day 1, the same face due on the last day, bill between them", () => {
    const { state } = createCh1State(20261109);
    expect(state.cash).toBe(START_CASH);
    expect(state.invoices[0]!.id).toBe("inv-a");
    expect(state.invoices[0]!.dueDay).toBe(0);
    expect(state.invoices[0]!.principal).toBe(2400);
    expect(state.invoices[1]!.id).toBe("inv-b");
    expect(state.invoices[1]!.dueDay).toBe(PAIR_B_DAY);
    expect(state.invoices[1]!.principal).toBe(state.invoices[0]!.principal);
    expect(state.bill.dueDay).toBe(BILL.dueDay);
    expect(state.bill.amount).toBe(BILL.amount);
  });
});

describe("ch1 day shape (3-day stall screen)", () => {
  it("day 1 offers the already-late Harborne invoice", () => {
    const { state } = createCh1State(20261109);
    const c = dayChoices(state, 1);
    expect(c.some((x) => x.kind === "chase" && x.invoiceId === "inv-a")).toBe(true);
    expect(c.some((x) => x.kind === "fun")).toBe(true);
  });

  it("day 2 offers the supplier bill: pay or skip", () => {
    const { state } = createCh1State(20261109);
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "fun")!.id);
    const c = dayChoices(state, BILL.dueDay);
    expect(c.find((x) => x.kind === "pay_bill")!.label).toContain(BILL.client);
    expect(c.find((x) => x.kind === "pay_bill")!.label).toContain(`£${BILL.amount.toLocaleString("en-GB")}`);
    expect(c.some((x) => x.kind === "skip_bill")).toBe(true);
    expect(c.some((x) => x.invoiceId === "inv-b")).toBe(false);
  });

  it("pair days offer the pair with identical day counts — only the frame differs", () => {
    const { state } = createCh1State(20261109);
    const aChase = dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "chase")!;
    expect(aChase.invoiceId).toBe("inv-a");
    expect(aChase.detail).toBe(`The full £2,400 lands in the till this week — in ${daysPhrase(PAIR_A_CHASE_CLEAR_DAYS)}.`);
    expect(dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "defer")!.detail).toBe(
      `Defer — the full £2,400 lands in ${PAIR_A_DEFER_CLEAR_DAYS} days instead.`,
    );
    expect(PAIR_A_DAY + PAIR_A_CHASE_CLEAR_DAYS).toBeLessThanOrEqual(CH1_DAYS);
    expect(PAIR_A_DAY + PAIR_A_DEFER_CLEAR_DAYS).toBeGreaterThan(CH1_DAYS);

    resolveDay(state, PAIR_A_DAY, aChase.id);
    resolveDay(state, BILL.dueDay, dayChoices(state, BILL.dueDay).find((x) => x.kind === "pay_bill")!.id);
    const bChase = dayChoices(state, PAIR_B_DAY).find((x) => x.kind === "chase")!;
    expect(bChase.invoiceId).toBe("inv-b");
    expect(bChase.detail).toBe(`The full £2,400 lands after the week closes — in ${daysPhrase(PAIR_B_CHASE_CLEAR_DAYS)}.`);
    expect(dayChoices(state, PAIR_B_DAY).find((x) => x.kind === "defer")!.detail).toBe(
      `Defer — the full £2,400 lands in ${PAIR_B_DEFER_CLEAR_DAYS} days instead.`,
    );
    expect(PAIR_A_CHASE_CLEAR_DAYS).toBe(PAIR_B_CHASE_CLEAR_DAYS);
    expect(PAIR_A_DEFER_CLEAR_DAYS).toBe(PAIR_B_DEFER_CLEAR_DAYS);
    expect(PAIR_B_DAY + PAIR_B_CHASE_CLEAR_DAYS).toBeGreaterThan(CH1_DAYS);
  });

  it("the deferral is the same slip in both arms (controlled experiment)", () => {
    expect(DEFER_EXTRA_DAYS).toBe(DEFER_CLEAR_DAYS - PAIR_A_CHASE_CLEAR_DAYS);
    expect(DEFER_EXTRA_DAYS).toBe(9);
    expect(DEFER_CLEAR_DAYS - PAIR_A_CHASE_CLEAR_DAYS).toBe(PAIR_B_DEFER_CLEAR_DAYS - PAIR_B_CHASE_CLEAR_DAYS);
  });

  it("a deferral commits: the deferred invoice is never re-offered with a shorter payoff", () => {
    const { state } = createCh1State(20261109);
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "fun")!.id);
    for (let d = 2; d <= CH1_DAYS; d++) {
      if (state.done) break;
      const c = dayChoices(state, d);
      expect(c.some((x) => x.invoiceId === "inv-a")).toBe(false);
      const fun = c.find((x) => x.kind === "fun")!;
      resolveDay(state, d, fun.id);
    }
  });

  it("yesterday's chase makes the bill button say the till can cover it", () => {
    const { state } = createCh1State(20261109);
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "chase")!.id);
    const pay = dayChoices(state, BILL.dueDay).find((x) => x.kind === "pay_bill")!;
    expect(pay.detail).toContain("stall stays open");
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
    const inv = state.invoices[0]!; // Harborne, already late
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
    const s = play(20261109, (_st, d) => (d === BILL.dueDay ? "skip_bill" : "fun"));
    expectLinesSumToLantern(s);
  });

  it("a chased invoice produces no line; a committed one is priced over the days it sat", () => {
    const chased = play(20261109, (st, d) => billKind(st, d, "chase"));
    expect(deferralLines(chased).find((l) => l.invoiceId === "inv-a")).toBeUndefined();
    const s = play(20261109, (_st, d) => (d === BILL.dueDay ? "skip_bill" : "fun"));
    const line = deferralLines(s).find((l) => l.invoiceId === "inv-a")!;
    expect(line.streetTake).toBeGreaterThan(0);
    expect(line.daysLate).toBeGreaterThan(0);
  });

  it("the statutory floor is reported per line and is a real Act figure", () => {
    const s = play(20261109, (_st, d) => (d === BILL.dueDay ? "skip_bill" : "fun"));
    const lines = deferralLines(s);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const l of lines) expect(l.statutory).toBeGreaterThan(0);
    // The legal floor exists even when the player deferred zero pair days.
    expect(lines.reduce((t, l) => t + l.statutory, 0)).toBeGreaterThan(0);
  });
});

describe("ch1 money lands inside the chapter", () => {
  it("chase on day 1 pays the next morning — in time for the bill", () => {
    const { state } = createCh1State(20261109);
    const principal = state.invoices[0]!.principal;
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "chase")!.id);
    const e2 = resolveDay(state, BILL.dueDay, dayChoices(state, BILL.dueDay).find((x) => x.kind === "pay_bill")!.id);
    expect(e2.effects.collected).toBe(1);
    expect(state.cash).toBe(START_CASH + principal - BILL.amount);
    expect(state.endedEarly).toBeNull();
  });

  it("the day-1 pair chase pays in the week; the day-3 pair chase pays after the close", () => {
    const { state } = createCh1State(20261109);
    resolveDay(state, PAIR_A_DAY, dayChoices(state, PAIR_A_DAY).find((x) => x.kind === "chase")!.id);
    expect(state.invoices[0]!.paidDay).toBe(PAIR_A_DAY + PAIR_A_CHASE_CLEAR_DAYS);
    expect(state.invoices[0]!.paidDay).toBeLessThanOrEqual(CH1_DAYS);
    resolveDay(state, BILL.dueDay, dayChoices(state, BILL.dueDay).find((x) => x.kind === "pay_bill")!.id);
    resolveDay(state, PAIR_B_DAY, dayChoices(state, PAIR_B_DAY).find((x) => x.kind === "chase")!.id);
    expect(state.invoices[1]!.paidDay).toBe(PAIR_B_DAY + PAIR_B_CHASE_CLEAR_DAYS);
    expect(state.invoices[1]!.paidDay).toBeGreaterThan(CH1_DAYS);
  });
});

describe("ch1 supplier bill — the day the till can empty", () => {
  it("paying the bill spends the morning's landing and stays open", () => {
    const { state } = createCh1State(20261109);
    const principal = state.invoices[0]!.principal;
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "chase")!.id);
    const before = state.cash;
    const e2 = resolveDay(state, BILL.dueDay, dayChoices(state, BILL.dueDay).find((x) => x.kind === "pay_bill")!.id);
    expect(e2.effects.cashDelta).toBe(principal - BILL.amount);
    expect(state.cash).toBe(before + principal - BILL.amount);
    expect(state.bill.paidDay).toBe(BILL.dueDay);
  });

  it("skipping the bill: the liability outruns the till — it empties on bill day", () => {
    const s = play(20261109, (_st, d) => (d === BILL.dueDay ? "skip_bill" : "fun"));
    expect(s.endedEarly).toBe("till_empty");
    expect(s.bill.skippedDay).toBe(BILL.dueDay);
    expect(netPosition(s)).toBeLessThan(0);
    expect(s.bill.amount + s.lateFees).toBeGreaterThan(s.cash);
  });

  it("choosing something else on bill day still marks the bill unpaid (auto-skip)", () => {
    const { state } = createCh1State(20261109);
    resolveDay(state, 1, dayChoices(state, 1).find((x) => x.kind === "fun")!.id);
    resolveDay(state, BILL.dueDay, dayChoices(state, BILL.dueDay).find((x) => x.kind === "fun")!.id);
    expect(state.bill.skippedDay).toBe(BILL.dueDay);
  });

  it("a rational run stays positive: chase everything, pay the bill", () => {
    const s = play(20261109, (st, d) => billKind(st, d, "chase"));
    expect(s.endedEarly).toBeNull();
    expect(netPosition(s)).toBeGreaterThan(START_CASH);
    expect(s.streetTake).toBe(0);
  });

  it("rational and careless runs end differently (the critic's core demand)", () => {
    const rational = play(20261109, (st, d) => billKind(st, d, "chase"));
    const careless = play(20261109, (_st, d) => (d === BILL.dueDay ? "skip_bill" : "fun"));
    expect(rational.endedEarly).toBeNull();
    expect(careless.endedEarly).toBe("till_empty");
    expect(netPosition(rational) - netPosition(careless)).toBeGreaterThan(500);
  });
});

describe("ch1 debrief fuel (street take, not the £0 counterfactual)", () => {
  it("a clean chase-everything run produces zero street take and zero line items", () => {
    const s = play(20261109, (st, d) => billKind(st, d, "chase"));
    expect(s.streetTake).toBe(0);
    expect(deferralLines(s)).toHaveLength(0);
  });

  it("a fully-deferred run has the largest street take — and it sums to the lines", () => {
    const deferAll = play(20261109, (_st, d) => (d === BILL.dueDay ? "skip_bill" : "fun"));
    const chaseSome = play(20261109, (st, d) => billKind(st, d, "chase"));
    expect(deferAll.streetTake).toBeGreaterThan(chaseSome.streetTake);
    expect(deferAll.streetTake).toBeGreaterThan(0);
    expectLinesSumToLantern(deferAll);
  });
});
