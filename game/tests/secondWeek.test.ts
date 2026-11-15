import { describe, expect, it } from "vitest";
import { money } from "../src/engine/market";
import {
  WEEK2_BILL_LATE_FEE,
  WEEK2_BILL_MAX,
  WEEK2_BILL_MIN,
  WEEK2_DAYS,
  WEEK2_PRINCIPAL_MAX,
  WEEK2_PRINCIPAL_MIN,
  WEEK2_START_CASH_MAX,
  WEEK2_START_CASH_MIN,
  createWeek,
  dayChoices,
  resolveDay,
  verdictLine,
  weekSummary,
  type Week2State,
} from "../src/engine/weekGen";
import {
  CHASE_CLEAR_DAYS,
  DEFER_CLEAR_DAYS,
  netPosition,
  type DayChoice,
} from "../src/chapters/ch1";
import {
  BEST_KEY,
  loadBestRun,
  recordBestRun,
  type BestRun,
  type BestStore,
} from "../src/chapters/secondWeek";

/** A policy maps one day's offered choices to the choice id it takes. */
type Policy = (choices: DayChoice[], state: Week2State, day: number) => string;

/** Play a whole week under a policy; returns the finished state. */
function playWeek(seed: number, policy: Policy): Week2State {
  const { state } = createWeek(seed);
  for (let day = 1; day <= WEEK2_DAYS && !state.done; day++) {
    const choices = dayChoices(state, day);
    resolveDay(state, day, policy(choices, state, day));
  }
  return state;
}

/** Money that lands this morning (resolveDay collects before it spends). */
function arriving(state: Week2State, day: number): number {
  return state.invoices
    .filter((i) => i.paidDay === day)
    .reduce((s, i) => s + i.principal, 0);
}

/** Valid choice rule: only ever pay the bill when the morning can cover it. */
function billChoice(choices: DayChoice[], state: Week2State, day: number): string {
  const pay = choices.find((c) => c.kind === "pay_bill");
  if (pay && state.cash + arriving(state, day) >= state.bill.amount) return pay.id;
  const skip = choices.find((c) => c.kind === "skip_bill");
  return skip ? skip.id : choices.find((c) => c.kind === "fun")!.id;
}

/** Chase whenever an invoice is offered; bill paid only when coverable. */
const chaseFirst: Policy = (choices, state, day) => {
  if (choices.some((c) => c.kind === "pay_bill" || c.kind === "skip_bill")) {
    return billChoice(choices, state, day);
  }
  const chase = choices.find((c) => c.kind === "chase");
  if (chase) return chase.id;
  return choices.find((c) => c.kind === "fun")!.id;
};

/** Defer whenever an invoice is offered; bill paid only when coverable. */
const deferFirst: Policy = (choices, state, day) => {
  if (choices.some((c) => c.kind === "pay_bill" || c.kind === "skip_bill")) {
    return billChoice(choices, state, day);
  }
  const defer = choices.find((c) => c.kind === "defer");
  if (defer) return defer.id;
  return choices.find((c) => c.kind === "fun")!.id;
};

/** The pull of the easy work — every day is fun, so the bill is missed. */
const funFirst: Policy = (choices) => choices.find((c) => c.kind === "fun")!.id;

/** Always leave the bill explicitly; every other day is the easy work. */
const alwaysSkipFun: Policy = (choices) =>
  choices.find((c) => c.kind === "skip_bill")?.id ?? choices.find((c) => c.kind === "fun")!.id;

describe("second week generator", () => {
  it("same seed → identical week (replay determinism)", () => {
    expect(createWeek(42).state).toEqual(createWeek(42).state);
  });

  it("different seeds deal different weeks", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const { state } = createWeek(seed);
      seen.add(JSON.stringify([
        state.cash,
        state.invoices.map((i) => [i.client, i.principal, i.dueDay]),
        state.bill.client,
        state.bill.amount,
        state.bill.dueDay,
      ]));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it("deals a well-formed week: 5 days, bounds, rounding, spread, one bill", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = createWeek(seed);
      expect(state.day).toBe(1);
      expect(state.done).toBe(false);
      expect(state.streetTake).toBe(0);
      expect(state.lateFees).toBe(0);
      expect(state.cash).toBeGreaterThanOrEqual(WEEK2_START_CASH_MIN);
      expect(state.cash).toBeLessThanOrEqual(WEEK2_START_CASH_MAX);
      expect(state.cash % 50).toBe(0);
      expect(state.invoices.length).toBeGreaterThanOrEqual(3);
      expect(state.invoices.length).toBeLessThanOrEqual(5);
      expect(new Set(state.invoices.map((i) => i.client)).size).toBe(state.invoices.length);
      const overdue = state.invoices.filter((i) => i.dueDay <= 0);
      expect(overdue.length).toBeGreaterThanOrEqual(1);
      expect(overdue.length).toBeLessThanOrEqual(2);
      const inWeek = state.invoices.filter((i) => i.dueDay >= 1).map((i) => i.dueDay);
      expect(new Set(inWeek).size).toBe(inWeek.length); // spread — no pile-ups
      for (const inv of state.invoices) {
        expect(inv.principal % 50).toBe(0);
        expect(inv.principal).toBeGreaterThanOrEqual(WEEK2_PRINCIPAL_MIN);
        expect(inv.principal).toBeLessThanOrEqual(WEEK2_PRINCIPAL_MAX);
      }
      expect(state.bill.amount % 50).toBe(0);
      expect(state.bill.amount).toBeGreaterThanOrEqual(WEEK2_BILL_MIN);
      expect(state.bill.amount).toBeLessThanOrEqual(WEEK2_BILL_MAX);
      expect(state.bill.dueDay).toBeGreaterThanOrEqual(2);
      expect(state.bill.dueDay).toBeLessThanOrEqual(3);
      expect(state.bill.lateFee).toBe(WEEK2_BILL_LATE_FEE);
    }
  });

  it("day 1 always offers a chase — an invoice is already overdue", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = createWeek(seed);
      expect(dayChoices(state, 1).some((c) => c.kind === "chase")).toBe(true);
    }
  });

  it("every day offers exactly one fun task and unique choice ids", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createWeek(seed).state;
      for (let day = 1; day <= WEEK2_DAYS && !s.done; day++) {
        const cs = dayChoices(s, day);
        expect(cs.filter((c) => c.kind === "fun")).toHaveLength(1);
        expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
        if (day === s.bill.dueDay && s.bill.paidDay === null && s.bill.skippedDay === null) {
          expect(cs.some((c) => c.kind === "pay_bill")).toBe(true);
          expect(cs.some((c) => c.kind === "skip_bill")).toBe(true);
        }
        // Drain the day with the easy work so more days come into view.
        resolveDay(s, day, cs.find((c) => c.kind === "fun")!.id);
      }
    }
  });
});

describe("second week day engine (ch1 semantics)", () => {
  it("chase lands in 1 day — the money is in the till next morning", () => {
    const { state } = createWeek(1234);
    const chase = dayChoices(state, 1).find((c) => c.kind === "chase")!;
    const inv = state.invoices.find((i) => i.id === chase.invoiceId)!;
    resolveDay(state, 1, chase.id);
    expect(inv.chasedDay).toBe(1);
    expect(inv.paidDay).toBe(1 + CHASE_CLEAR_DAYS);
    const cashBefore = state.cash;
    resolveDay(state, 2, dayChoices(state, 2).find((c) => c.kind === "fun")!.id);
    expect(state.cash).toBeGreaterThanOrEqual(cashBefore + inv.principal);
  });

  it("a chased invoice is never re-offered", () => {
    const { state } = createWeek(77);
    const chase = dayChoices(state, 1).find((c) => c.kind === "chase")!;
    resolveDay(state, 1, chase.id);
    for (let d = 2; d <= WEEK2_DAYS; d++) {
      expect(dayChoices(state, d).some((c) => c.invoiceId === chase.invoiceId)).toBe(false);
    }
  });

  it("defer is a commitment: lands day + 10, never re-offered", () => {
    const { state } = createWeek(1234);
    const defer = dayChoices(state, 1).find((c) => c.kind === "defer")!;
    const inv = state.invoices.find((i) => i.id === defer.invoiceId)!;
    resolveDay(state, 1, defer.id);
    expect(inv.deferredDay).toBe(1);
    expect(inv.paidDay).toBe(1 + DEFER_CLEAR_DAYS);
    expect(inv.paidDay).toBeGreaterThan(WEEK2_DAYS);
    for (let d = 2; d <= WEEK2_DAYS; d++) {
      expect(dayChoices(state, d).some((c) => c.invoiceId === inv.id)).toBe(false);
    }
  });

  it("the fun task commits the day's offered invoice to the 10-day payoff", () => {
    const { state } = createWeek(99);
    const offered = dayChoices(state, 1).find((c) => c.kind === "chase")!.invoiceId!;
    resolveDay(state, 1, "fun-1");
    const inv = state.invoices.find((i) => i.id === offered)!;
    expect(inv.deferredDay).toBe(1);
    expect(inv.paidDay).toBe(1 + DEFER_CLEAR_DAYS);
  });

  it("same seed + same policy → identical run (resolveDay determinism)", () => {
    const a = playWeek(7, chaseFirst);
    const b = playWeek(7, chaseFirst);
    expect(a).toEqual(b);
    expect(a.cash).toBe(b.cash);
    expect(a.streetTake).toBe(b.streetTake);
    expect(a.lateFees).toBe(b.lateFees);
  });

  it("leaving the bill runs the till red and ends the week early", () => {
    // Forced-low cash: whatever the seed dealt, the bill outweighs the till.
    const { state } = createWeek(11);
    state.cash = 50;
    resolveDay(state, 1, "fun-1");
    const billDay = state.bill.dueDay;
    for (let d = 2; d < billDay; d++) resolveDay(state, d, `fun-${d}`);
    expect(state.done).toBe(false); // the position only empties via the bill
    resolveDay(state, billDay, `skip_bill-${billDay}`);
    expect(state.done).toBe(true);
    expect(state.endedEarly).toBe("till_empty");
    expect(state.lastPlayedDay).toBe(billDay);
    expect(netPosition(state)).toBeLessThan(0);
  });

  it("under an always-leave-it policy some weeks end early, and every early end is a red till", () => {
    let early = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = playWeek(seed, alwaysSkipFun);
      if (s.endedEarly === "till_empty") {
        early += 1;
        expect(s.done).toBe(true);
        expect(netPosition(s)).toBeLessThan(0);
      } else {
        expect(s.done).toBe(true);
        expect(s.lastPlayedDay).toBe(WEEK2_DAYS);
      }
    }
    expect(early).toBeGreaterThan(0);
  });

  it("seeded full weeks never produce NaN or negative cash from valid choices", () => {
    for (const policy of [chaseFirst, funFirst, deferFirst]) {
      for (let seed = 1; seed <= 50; seed++) {
        const s = playWeek(seed, policy);
        expect(s.done).toBe(true);
        expect(Number.isFinite(s.cash)).toBe(true);
        expect(s.cash).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(s.streetTake)).toBe(true);
        expect(s.streetTake).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(s.lateFees)).toBe(true);
        expect(s.lateFees).toBeGreaterThanOrEqual(0);
        for (const inv of s.invoices) {
          expect(Number.isFinite(inv.principal)).toBe(true);
          expect(inv.principal).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("second week read-back", () => {
  it("weekSummary prices the street as streetTake + lateFees", () => {
    const s = playWeek(9, chaseFirst);
    const sum = weekSummary(s);
    expect(sum.streetTook).toBe(s.streetTake + s.lateFees);
    expect(sum.streetTake).toBe(s.streetTake);
    expect(sum.lateFees).toBe(s.lateFees);
    expect(sum.kept).toBe(s.cash);
    expect(Number.isFinite(sum.lawfulPrice)).toBe(true);
    expect(sum.lawfulPrice).toBeGreaterThanOrEqual(0);
    expect(sum.verdict.length).toBeGreaterThan(0);
  });

  it("verdictLine names both prices and the clean week", () => {
    expect(verdictLine(0, 0)).toContain("nothing");
    expect(verdictLine(300, 100)).toContain(money(300));
    expect(verdictLine(300, 100)).toContain(money(100));
    expect(verdictLine(300, 100)).toContain("expensive part");
    expect(verdictLine(100, 300)).toContain("Two prices");
    expect(verdictLine(100, 300)).toContain(money(100));
    expect(verdictLine(120, 0)).toContain(money(120));
  });
});

describe("second week best-run persistence", () => {
  function memStore(initial: Record<string, string> = {}): BestStore & { dump(): Record<string, string> } {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => { map.set(k, v); },
      dump: () => Object.fromEntries(map),
    };
  }

  const run = (streetTook: number): BestRun => ({ streetTook, lawfulPrice: 40, kept: 500, at: `2026-11-15T00:00:${String(streetTook % 60).padStart(2, "0")}Z` });

  it("persists the first run under the documented v1 key", () => {
    expect(BEST_KEY).toBe("lm.secondweek.best.v1");
    const store = memStore();
    recordBestRun(run(300), store);
    expect(store.dump()[BEST_KEY]).toBeDefined();
    expect(loadBestRun(store)?.streetTook).toBe(300);
  });

  it("keeps the minimum streetTook across runs", () => {
    const store = memStore();
    recordBestRun(run(300), store);
    recordBestRun(run(250), store);
    expect(loadBestRun(store)?.streetTook).toBe(250);
    recordBestRun(run(400), store);
    const best = loadBestRun(store);
    expect(best?.streetTook).toBe(250);
    expect(best?.kept).toBe(run(250).kept);
    expect(best?.at).toBe(run(250).at); // a worse run never overwrites the record
  });

  it("survives corrupt or partial payloads", () => {
    expect(loadBestRun(memStore({ [BEST_KEY]: "{not json" }))).toBeNull();
    expect(loadBestRun(memStore({ [BEST_KEY]: JSON.stringify({ streetTook: "lots" }) }))).toBeNull();
    expect(loadBestRun(memStore({ [BEST_KEY]: JSON.stringify({ streetTook: 10 }) }))).toBeNull(); // missing fields
    expect(loadBestRun(memStore())).toBeNull(); // nothing stored yet
  });

  it("never throws when storage is broken", () => {
    const broken: BestStore = {
      getItem: () => { throw new Error("private mode"); },
      setItem: () => { throw new Error("quota exceeded"); },
    };
    expect(loadBestRun(broken)).toBeNull();
    const out = recordBestRun(run(120), broken);
    expect(out.streetTook).toBe(120); // the run comes back even unrecorded
  });
});
