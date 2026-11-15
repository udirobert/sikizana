import { describe, expect, it } from "vitest";
import {
  CH3_INVOICE,
  createCh3State,
  act,
  ch3LedgerEntry,
  ch3Prospect,
  streetOffers,
  streetLedgerEntry,
  sharkFlipTerms,
  haggleOutcome,
  haggledBuyPrice,
  sharkBloodPrice,
  assumptionsLine,
} from "../src/chapters/ch3";

describe("ch3 sunk-cost rig", () => {
  it("prospect is principal + statutory entitlement (honest, law-backed)", () => {
    const p = ch3Prospect();
    expect(p.principal).toBe(CH3_INVOICE);
    expect(p.total).toBeCloseTo(CH3_INVOICE + p.entitlement, 2);
    expect(p.entitlement).toBeGreaterThan(0);
  });

  it("continuing twice then walking: costs accrue by round, walk closes the account", () => {
    const s = createCh3State();
    act(s, "continue"); // £25
    expect(s.rounds[0]!.costPaid).toBe(25);
    act(s, "escalate"); // £60
    expect(s.rounds[1]!.costPaid).toBe(60);
    act(s, "walk");
    expect(s.done).toBe(true);
    const invested = s.rounds.reduce((t, r) => t + r.costPaid, 0);
    expect(invested).toBe(85);
  });

  it("ledger entries use ch3 ids and mark walk as deferred (profile semantics)", () => {
    const s = createCh3State();
    act(s, "continue");
    const cont = ch3LedgerEntry(s, s.rounds[0]!);
    expect(cont.experimentId.startsWith("ch3_")).toBe(true);
    expect(cont.deferred).toBe(false); // continued
    const s2 = createCh3State();
    act(s2, "walk");
    const walked = ch3LedgerEntry(s2, s2.rounds[0]!);
    expect(walked.deferred).toBe(true); // walked — sunk axis treats as stop
    expect(walked.immediateConsequence).toMatch(/£9\d\d/); // ≈ invoice + entitlement
  });

  it("street offers: factor shave is honest; shark annualises truthfully", () => {
    const o = streetOffers();
    expect(o.factor.buyPrice).toBeLessThan(CH3_INVOICE);
    expect(o.factor.annualDiscountPct).toBeGreaterThan(0);
    // The daily-quote illusion, rendered honest: annualised must be huge.
    expect(o.shark.annualisedPct).toBeGreaterThan(200);
    expect(o.shark.termDays).toBeGreaterThan(0);
    const fee = Math.round(o.shark.termDays * o.shark.daily - o.shark.cashNow);
    expect(fee).toBeGreaterThan(0); // their take is real money
  });

  it("street ledger records the fee paid to the street (Cost of Not Acting fuel)", () => {
    const o = streetOffers();
    const fee = Math.round(o.factor.buyPrice * 0.10);
    const e = streetLedgerEntry("The Factor", fee, true);
    expect(e.npc?.feePaid).toBe(fee);
    expect(e.experimentId).toBe("ch3_street_factor");
    expect(streetLedgerEntry("The Shark", 0, false).npc?.feePaid ?? 0).toBe(0);
  });

  it("double-or-nothing prices both landings: heads doubles, tails zeroes, daily stands", () => {
    const o = streetOffers();
    const t = sharkFlipTerms(o.shark.cashNow, o.shark.daily, o.shark.termDays);
    expect(t.winCashNow).toBe(o.shark.cashNow * 2);
    expect(t.loseCashNow).toBe(0);
    expect(t.winFee).toBe(Math.max(0, Math.round(o.shark.termDays * o.shark.daily - o.shark.cashNow * 2)));
    expect(t.loseFee).toBe(Math.round(o.shark.termDays * o.shark.daily));
    expect(t.loseFee).toBeGreaterThanOrEqual(t.winFee);
  });

  it("haggle: 4+ nods at +8%, 3 or less walks and bloods the Shark's advance", () => {
    expect(haggleOutcome(3)).toBe("walk");
    expect(haggleOutcome(4)).toBe("nod");
    expect(haggleOutcome(6)).toBe("nod");
    expect(haggledBuyPrice(1000)).toBe(1080);
    const o = streetOffers();
    expect(sharkBloodPrice(o.shark.cashNow)).toBeLessThan(o.shark.cashNow);
  });

  it("assumptions line cites the Act and round numbers", () => {
    expect(assumptionsLine()).toContain("1998");
    expect(assumptionsLine()).toContain("8% over base");
  });
});
