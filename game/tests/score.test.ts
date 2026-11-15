/**
 * Reactive score model — tension follows the week without touching audio.
 * Presentation only: collects release, deferrals/shark tighten, everything
 * clamps to [0.1, 1] so the bed can never mute or clip.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resetScore, scoreEvent, scoreTension } from "../src/audio/score";

beforeEach(() => resetScore());

describe("score tension", () => {
  it("starts at rest", () => {
    expect(scoreTension()).toBeCloseTo(0.35);
  });
  it("collect releases, defer tightens", () => {
    scoreEvent("collect");
    expect(scoreTension()).toBeCloseTo(0.17);
    scoreEvent("defer");
    expect(scoreTension()).toBeCloseTo(0.32);
  });
  it("shark tightens hardest", () => {
    scoreEvent("shark");
    expect(scoreTension()).toBeCloseTo(0.57);
  });
  it("clamps at both ends", () => {
    for (let i = 0; i < 10; i++) scoreEvent("collect");
    expect(scoreTension()).toBeGreaterThanOrEqual(0.1);
    for (let i = 0; i < 10; i++) scoreEvent("shark");
    expect(scoreTension()).toBeLessThanOrEqual(1);
  });
});
