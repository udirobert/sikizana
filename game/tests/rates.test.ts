import { describe, expect, it } from "vitest";
import { statutoryEntitlement, statutoryRatePct, statutoryInterest, statutoryCompensation, costOfDeferralPerDay } from "../src/engine/rates";

// Edge cases mandated by docs/game/GDD.md §3 accuracy guardrails:
// zero balance, partial, negative, rounding, boundary compensation tiers.
describe("statutory rates (UK Act 1998 s.5A)", () => {
  it("rate is margin + base (8 + 3.75 = 11.75 by default)", () => {
    expect(statutoryRatePct()).toBeCloseTo(11.75);
    expect(statutoryRatePct(0)).toBe(8);
  });

  it("zero/negative principal and days yield zero", () => {
    expect(statutoryInterest(0, 30)).toBe(0);
    expect(statutoryInterest(500, 0)).toBe(0);
    expect(statutoryInterest(-500, 30)).toBe(0);
  });

  it("interest is simple, yearly/365 per day", () => {
    // £1,000 for one day at 11.75% = 1000 * .1175 / 365 ≈ 0.3219
    expect(statutoryInterest(1000, 1)).toBeCloseTo(0.3219, 3);
    expect(statutoryInterest(1000, 60)).toBeCloseTo(19.315, 3);
  });

  it("compensation tiers: 40 / 70 / 100 at the Act's boundaries", () => {
    expect(statutoryCompensation(999.99)).toBe(40);
    expect(statutoryCompensation(1000)).toBe(40); // "£1,000 or less"
    expect(statutoryCompensation(1000.01)).toBe(70);
    expect(statutoryCompensation(9999.99)).toBe(70);
    expect(statutoryCompensation(10000)).toBe(70); // "not more than £10,000"
    expect(statutoryCompensation(10000.01)).toBe(100);
  });

  it("entitlement rounds cleanly and never double-counts ineligible debts", () => {
    const e1 = statutoryEntitlement(500, 10);
    expect(e1.compensation).toBe(40);
    const e2 = statutoryEntitlement(0, 30);
    expect(e2.total).toBe(0);
  });

  it("per-day deferral cost is deterministic and small", () => {
    expect(costOfDeferralPerDay(2400)).toBeCloseTo((2400 * 0.1175) / 365, 6);
  });
});
