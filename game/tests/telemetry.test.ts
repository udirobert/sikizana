/**
 * Telemetry contract: the payload is anonymous and small, and every off-switch
 * actually turns it off. These are the only things standing between "we count
 * runs" and "we collect people", so they are pinned.
 */
import { describe, expect, it, vi } from "vitest";
import { chapterReached, runFinished, sendTelemetry, telemetryEnabled, TELEMETRY_ENDPOINT } from "../src/engine/telemetry";

describe("payload shape", () => {
  it("records a stage and a market, nothing else", () => {
    expect(chapterReached("ch2", "souq")).toEqual({ event: "chapter_reached", stage: "ch2", market: "souq" });
  });

  it("rounds the delta to one decimal — a raw score series is a fingerprint", () => {
    expect(runFinished(12.34567, false, true, "uk").delta).toBe(12.3);
  });

  it("keeps a first run's delta null rather than inventing a zero", () => {
    expect(runFinished(null, false, false, "souq")).toMatchObject({ delta: null, replay: false });
  });

  it("carries no identifiers of any kind", () => {
    const payload = JSON.stringify(runFinished(3.2, false, true, "uk"));
    for (const forbidden of ["id", "cookie", "session", "ip", "user", "email", "agent"]) {
      expect(payload.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("off switches", () => {
  it("sends nothing when the build has no endpoint", () => {
    expect(telemetryEnabled("/?x=1", undefined, "")).toBe(false);
  });

  it("honours Do Not Track", () => {
    expect(telemetryEnabled("/", "1", "https://example.test/t")).toBe(false);
    expect(telemetryEnabled("/", "0", "https://example.test/t")).toBe(true);
  });

  it("honours ?notelemetry=1 so our own probes cannot inflate the count", () => {
    expect(telemetryEnabled("/?notelemetry=1", undefined, "https://example.test/t")).toBe(false);
  });

  it("defaults to off in this test build, and a send is a silent no-op", () => {
    expect(TELEMETRY_ENDPOINT).toBe("");
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockResolvedValue(undefined as never);
    expect(() => sendTelemetry(chapterReached("ch1", "uk"))).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
