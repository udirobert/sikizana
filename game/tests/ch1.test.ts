import { describe, expect, it } from "vitest";
import {
  CH1_DAYS,
  CHASE_CLEAR_DAYS,
  BILL,
  START_CASH,
  PAIR_A_DAY,
  PAIR_B_DAY,
  ENGINEERED_PAIR,
  createCh1State,
  dayChoices,
  resolveDay,
  invoiceAccrual,
  dailyAccrual,
  deferralLines,
  type Ch1State,
} from "../src/chapters/ch1";
import { statutoryCompensation, statutoryEntitlement, statutoryInterest } from "../src/engine/rates";
import { DecisionLedger } from "../src/engine/ledger";

describe("ch1 state creation", () => {
  it("same seed → identical invoice roster (replay determinism)", () => {
    const a = createCh1State(1234);
    const b = createCh1State(1234);
    expect(a.state.invoices).toEqual(b.state.invoices);
    expect(a.state.invoices.length).toBe(3);
  });

  it("different seed → different early client/principal, same pair", () => {
    const a = createCh1State(1);
    const b = createCh1State(2);
    expect(a.state.invoices[0]!.principal).not.toBe(b.state.invoices[0]!.principal);
    // The engineered pair is FIXED — the debrief's framing attribution depends on it.
    expect(a.state.invoices[1]).toEqual(b.state.invoices[1]);
    expect(a.state.invoices[2]).toEqual(b.state.invoices[2]);
  });

  it("roster: early invoice overdue from frame one, pair fixed on days 3 and 5", () => {
    const { state } = createCh1State(42);
    const early = state.invoices.find((i) => i.id === "inv-early")!;
    const a = state.invoices.find((i) => i.id === ENGINEERED_PAIR.first.invoice.id)!;
    const b = state.invoices.find((i) => i.id === ENGINEERED_PAIR.second.invoice.id)!;
    expect(early.dueDay).toBe(0); // two days overdue on Day 1
    expect(a.dueDay).toBe(PAIR_A_DAY);
    expect(b.dueDay).toBe(PAIR_B_DAY);
    expect(a.principal).toBe(2400);
    expect(b.principal).toBe(2400);
    expect(state.cash).toBe(START_CASH);
  });
});

describe("ch1 day shape (recovery plan §2.2)", () => {
  it("day 1 offers the already-overdue invoice as a real choice", () => {
    const { state } = createCh1State(42);
    const choices = dayChoices(state, 1);
    const chase = choices.find((c) => c.kind === "chase")!;
    const defer = choices.find((c) => c.kind === "defer")!;
    expect(chase.invoiceId).toBe("inv-early");
    expect(defer.kind).toBe("defer");
  });

  it("day 4 offers the supplier bill: pay or skip", () => {
    const { state } = createCh1State(42);
    const choices = dayChoices(state, 4);
    const pay = choices.find((c) => c.kind === "pay_bill")!;
    const skip = choices.find((c) => c.kind === "skip_bill")!;
    expect(pay.label).toContain(BILL.client);
    expect(pay.label).toContain(`£${BILL.amount}`);
    expect(skip.detail).toContain("£40");
  });

  it("pair days offer the pair invoice with the engineered framings", () => {
    const { state } = createCh1State(42);
    const aChoices = dayChoices(state, PAIR_A_DAY);
    const aChase = aChoices.find((c) => c.kind === "chase")!;
    expect(aChase.invoiceId).toBe("inv-a");
    expect(aChase.detail).toContain(`lands in ${CHASE_CLEAR_DAYS} days`);
    expect(aChoices.find((c) => c.kind === "defer")!.detail).toContain("10 days");

    resolveDay(state, 1, dayChoices(state, 1).find((c) => c.kind === "chase")!.id);
    resolveDay(state, 2, dayChoices(state, 2).find((c) => c.kind === "fun")!.id);
    resolveDay(state, PAIR_A_DAY, dayChoices(state, PAIR_A_DAY).find((c) => c.kind === "chase")!.id);
    resolveDay(state, 4, dayChoices(state, 4).find((c) => c.kind === "pay_bill")!.id);
    const bChoices = dayChoices(state, PAIR_B_DAY);
    const bChase = bChoices.find((c) => c.kind === "chase")!;
    expect(bChase.invoiceId).toBe("inv-b");
    expect(bChase.detail).toContain("20 days");
    expect(bChoices.find((c) => c.kind === "defer")!.detail).toContain("28 days");
  });
});

describe("ch1 silent cost engine", () => {
  it("accrual matches the statutory sheet exactly", () => {
    const inv = { id: "x", client: "c", principal: 2400, dueDay: 0, chasedDay: null, paidDay: null, deferrals: 0 };
    const a = invoiceAccrual(inv, 5); // 6 days late
    const s = statutoryEntitlement(2400, 6);
    expect(a.interest).toBeCloseTo(s.interest, 9);
    expect(a.compensation).toBe(s.compensation);
  });

  it("deferred pair records an entry with deferred=true and the pair experimentId", () => {
    const led = new DecisionLedger();
    const { state } = createCh1State(42);
    resolveDay(state, 1, dayChoices(state, 1).find((c) => c.kind === "fun")!.id);
    resolveDay(state, 2, dayChoices(state, 2).find((c) => c.kind === "fun")!.id);
    const { engineeredEntry } = resolveDay(state, PAIR_A_DAY, dayChoices(state, PAIR_A_DAY).find((c) => c.kind === "fun")!.id);
    if (engineeredEntry) led.record(engineeredEntry);
    const e = led.all()[0]!;
    expect(e.experimentId).toBe(ENGINEERED_PAIR.experimentId);
    expect(e.deferred).toBe(true);
    expect(e.chosenOptionId).toBe("fun_now");
  });

  it("lantern accrues one day's interest + compensation once, never cumulative", () => {
    const state: Ch1State = {
      day: 1, cash: 0,
      invoices: [{ id: "x", client: "c", principal: 2400, dueDay: 1, chasedDay: null, paidDay: null, deferrals: 0 }],
      bill: { client: "b", amount: 0, dueDay: 99, lateFee: 0, paidDay: null, skippedDay: null },
      forgoneInterest: 0, forgoneCompensation: 0, lateFees: 0, done: false, endedEarly: null, lastPlayedDay: 0,
    };
    const perDay = statutoryInterest(2400, 1);
    const comp = statutoryCompensation(2400);
    for (let d = 1; d <= 3; d++) resolveDay(state, d, "fun-" + d);
    expect(state.forgoneCompensation).toBeCloseTo(comp, 9); // once, not ×3
    expect(state.forgoneInterest).toBeCloseTo(perDay * 3, 9); // linear, not re-summed
    // Chasing stops the meter.
    resolveDay(state, 4, "chase-x");
    const frozen = state.forgoneInterest + state.forgoneCompensation;
    resolveDay(state, 5, "fun-5");
    expect(state.forgoneInterest + state.forgoneCompensation).toBeCloseTo(frozen, 9);
  });

  it("dailyAccrual pays compensation only on the first overdue day", () => {
    const inv = { id: "x", client: "c", principal: 2400, dueDay: 3, chasedDay: null, paidDay: null, deferrals: 0 };
    expect(dailyAccrual(inv, 3).compensation).toBe(statutoryCompensation(2400));
    expect(dailyAccrual(inv, 4).compensation).toBe(0);
    expect(dailyAccrual(inv, 4).interest).toBeCloseTo(statutoryInterest(2400, 1), 9);
  });
});

describe("ch1 chase pays inside the chapter (money lands)", () => {
  it("chase on day 1 pays day 3 — collected in the morning of day 3", () => {
    const { state } = createCh1State(42);
    const before = state.cash;
    resolveDay(state, 1, "chase-inv-early");
    expect(state.cash).toBe(before); // no cash yet — promised
    const inv = state.invoices[0]!;
    expect(inv.chasedDay).toBe(1);
    expect(inv.paidDay).toBe(1 + CHASE_CLEAR_DAYS);
    resolveDay(state, 2, "fun-2");
    expect(state.cash).toBe(before + (140 + ((2 * 37) % 60))); // walk-in only
    const eff = resolveDay(state, 3, "fun-3").effects;
    expect(eff.collected).toBe(1);
    expect(state.cash).toBe(before + inv.principal + (140 + ((2 * 37) % 60)) + (140 + ((3 * 37) % 60)));
  });

  it("pair A chase on day 3 pays day 5 (the last day) — in chapter", () => {
    const { state } = createCh1State(42);
    for (let d = 1; d < PAIR_A_DAY; d++) resolveDay(state, d, dayChoices(state, d).find((c) => c.kind === "fun")!.id);
    resolveDay(state, PAIR_A_DAY, "chase-inv-a");
    const inv = state.invoices.find((i) => i.id === "inv-a")!;
    expect(inv.paidDay).toBe(5);
    resolveDay(state, 4, "skip_bill-4");
    const eff = resolveDay(state, 5, "fun-5").effects;
    expect(eff.collected).toBe(1);
  });
});

describe("ch1 supplier bill — the day the till can empty", () => {
  it("paying the bill on day 4 is a cash out — and only affordable if you chased early", () => {
    const { state } = createCh1State(42);
    resolveDay(state, 1, "chase-inv-early"); // the money that makes the bill payable
    resolveDay(state, 2, dayChoices(state, 2).find((c) => c.kind === "fun")!.id);
    const before = state.cash; // £1,100 + walk-ins + £(early principal) on day 3
    const eff = resolveDay(state, 3, dayChoices(state, 3).find((c) => c.kind === "fun")!.id).effects;
    // day 3: the early invoice (chased day 1) lands in the till.
    expect(state.invoices[0]!.paidDay).toBe(3);
    const eff4 = resolveDay(state, 4, "pay_bill-4").effects;
    expect(state.bill.paidDay).toBe(4);
    expect(eff4.cashDelta).toBe(-BILL.amount);
    expect(state.cash).toBe(before + eff.cashDelta - BILL.amount);
    expect(state.cash).toBeGreaterThan(0); // chasing early made it coverable
    expect(state.endedEarly).toBeNull();
  });

  it("skipping the bill lights the street's charge: £40/day from day 5, tallied to lateFees", () => {
    const { state } = createCh1State(42);
    for (let d = 1; d < 4; d++) resolveDay(state, d, dayChoices(state, d).find((c) => c.kind === "fun")!.id);
    const eff4 = resolveDay(state, 4, "skip_bill-4").effects;
    expect(state.bill.skippedDay).toBe(4);
    expect(eff4.lateFeeDelta).toBe(0); // charge starts the day AFTER
    expect(eff4.streetNote).toBe("bill_skipped");
    const eff5 = resolveDay(state, 5, "fun-5").effects;
    expect(eff5.lateFeeDelta).toBe(BILL.lateFee);
    expect(state.lateFees).toBe(BILL.lateFee);
    expect(eff5.cashDelta).toBe(0); // day 5 restock: nobody delivered
    expect(state.lateFees).not.toBe(state.cash); // street money ≠ till money
  });

  it("choosing something else on bill day still marks the bill unpaid (auto-skip)", () => {
    const { state } = createCh1State(42);
    for (let d = 1; d < 4; d++) resolveDay(state, d, dayChoices(state, d).find((c) => c.kind === "fun")!.id);
    resolveDay(state, 4, "fun-4");
    expect(state.bill.skippedDay).toBe(4);
  });

  it("a careless run can empty the till: chase nothing, then pay a bill it cannot cover", () => {
    // Walk-in trade alone never covers £1,800 — only a chase does. Paying the
    // bill without the cash is how the till goes negative.
    const { state } = createCh1State(42);
    for (let d = 1; d < 4; d++) resolveDay(state, d, dayChoices(state, d).find((c) => c.kind === "fun")!.id);
    expect(state.cash).toBeLessThan(BILL.amount); // the till can't cover it
    resolveDay(state, 4, "pay_bill-4");
    expect(state.cash).toBeLessThan(0);
    expect(state.endedEarly).toBe("till_empty");
    expect(state.done).toBe(true);
  });

  it("a rational run stays positive: chase the early invoice, pay the bill, chase the pair", () => {
    const { state } = createCh1State(42);
    resolveDay(state, 1, "chase-inv-early");
    resolveDay(state, 2, dayChoices(state, 2).find((c) => c.kind === "fun")!.id);
    resolveDay(state, 3, "chase-inv-a");
    resolveDay(state, 4, "pay_bill-4");
    resolveDay(state, 5, "chase-inv-b");
    expect(state.cash).toBeGreaterThan(0);
    expect(state.endedEarly).toBeNull();
    // Money landed: the early invoice + pair A paid inside the chapter.
    expect(state.invoices.filter((i) => i.paidDay !== null && i.paidDay <= CH1_DAYS).length).toBe(2);
  });
});

describe("ch1 debrief fuel (replaces the £0-by-construction counterfactual)", () => {
  it("deferralLines prices each invoice the player let sit, on real days × daily accrual", () => {
    const { state } = createCh1State(42);
    // Chase the early invoice on day 1 (so it lands, not accrues); defer pair
    // A on day 3; chase inv-early's successor on day 4; let pair B sit to close.
    resolveDay(state, 1, "chase-inv-early");
    resolveDay(state, 2, dayChoices(state, 2).find((c) => c.kind === "fun")!.id);
    resolveDay(state, PAIR_A_DAY, dayChoices(state, PAIR_A_DAY).find((c) => c.kind === "defer")!.id);
    // Day 4: pay the bill (nothing chased) — both pair invoices sit to close.
    resolveDay(state, 4, dayChoices(state, 4).find((c) => c.kind === "pay_bill")!.id);
    resolveDay(state, 5, dayChoices(state, 5).find((c) => c.kind === "defer")!.id);
    const lines = deferralLines(state);
    expect(lines.length).toBe(2); // both pair invoices sat; the early one was chased
    for (const l of lines) {
      // Priced exactly the way the lantern accrues: days × daily interest,
      // plus the one-time compensation only for a fresh (in-chapter) due day.
      expect(l.interest).toBeCloseTo(l.daysLate * statutoryInterest(l.principal, 1), 9);
      expect(l.total).toBeCloseTo(l.interest + l.compensation, 9);
    }
    // The actively-deferred pair invoices are named with their pair days.
    const lineA = lines.find((l) => l.invoiceId === "inv-a")!;
    expect(lineA.deferredDay).toBe(PAIR_A_DAY);
    expect(lineA.daysLate).toBe(3); // overdue days 3, 4, 5 — never chased
    const lineB = lines.find((l) => l.invoiceId === "inv-b")!;
    expect(lineB.deferredDay).toBe(PAIR_B_DAY);
    expect(lineB.daysLate).toBe(1); // due day 5, chapter closes day 5
    // Line items sum to the lantern's final reading — the street's earnings.
    const sum = lines.reduce((t, l) => t + l.total, 0);
    expect(sum).toBeCloseTo(state.forgoneInterest + state.forgoneCompensation, 9);
  });

  it("a clean chase-everything run produces zero line items — nothing to replay", () => {
    const { state } = createCh1State(42);
    resolveDay(state, 1, "chase-inv-early");
    resolveDay(state, 2, dayChoices(state, 2).find((c) => c.kind === "fun")!.id);
    resolveDay(state, 3, "chase-inv-a");
    resolveDay(state, 4, "pay_bill-4");
    resolveDay(state, 5, "chase-inv-b");
    expect(deferralLines(state).length).toBe(0);
  });

  it("a fully-deferred run has the largest line-item total — the street's real earnings", () => {
    const mk = (want: (d: number) => string) => {
      const { state } = createCh1State(42);
      for (let d = 1; d <= CH1_DAYS; d++) {
        const choices = dayChoices(state, d);
        const c = choices.find((x) => x.kind === want(d)) ?? choices.find((x) => x.kind === "fun")!;
        resolveDay(state, d, c.id);
      }
      return state;
    };
    const rational = mk((d) => (d === 4 ? "pay_bill" : "chase"));
    const careless = mk((d) => (d === 4 ? "skip_bill" : "fun"));
    const rTotal = deferralLines(rational).reduce((t, l) => t + l.total, 0);
    const cTotal = deferralLines(careless).reduce((t, l) => t + l.total, 0);
    expect(rTotal).toBe(0);
    expect(cTotal).toBeGreaterThan(rTotal);
    expect(careless.lateFees).toBeGreaterThan(0);
    // The runs end DIFFERENTLY — a rational run and a careless run no longer
    // finish the chapter identically (recovery plan §2.2).
    expect(careless.lateFees).not.toBe(rational.lateFees);
    expect(careless.forgoneInterest + careless.forgoneCompensation).toBeGreaterThan(
      rational.forgoneInterest + rational.forgoneCompensation,
    );
  });
});
