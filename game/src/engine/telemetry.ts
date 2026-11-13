/**
 * Anonymous run telemetry — four events per run, no identifiers.
 *
 * Why it exists: the submission argues the game is a funnel into the product,
 * and a funnel with no counter is a wish. What we learn is only *how far a run
 * got* and *what it scored*, so the claim can be stated as a number.
 *
 * What it never collects: no cookies, no localStorage id, no session id, no
 * user agent string, no IP (the collector rate-limits by IP and stores none),
 * no free text, no device fingerprint. Events carry a stage, a market, and a
 * delta — that is the whole payload.
 *
 * Three ways it stays off, all honoured here rather than in a policy:
 *   - no endpoint configured at build time (`VITE_TELEMETRY_ENDPOINT`),
 *   - the visitor sends Do Not Track,
 *   - the URL carries `?notelemetry=1` (used by our own probes so a headless
 *     verification run cannot pollute the counts it is checking).
 *
 * Disclosed on the store page and in `docs/game/AUDIT.md`.
 */

import { getMarketMode, type MarketMode } from "./market";

/** Where a run got to. The finale is the last stage, not a fourth chapter. */
export type TelemetryStage = "ch1" | "ch2" | "ch3" | "finale";

export interface ChapterReached {
  event: "chapter_reached";
  stage: TelemetryStage;
  market: MarketMode;
}

export interface RunFinished {
  event: "run_finished";
  stage: "finale";
  market: MarketMode;
  /** Rationality Delta vs this device's best run, in points; null on a first run. */
  delta: number | null;
  /** True when the ledger was incomplete (a jumped or partial run). */
  partial: boolean;
  /** True when this device had already banked a best run. */
  replay: boolean;
}

export type TelemetryEvent = ChapterReached | RunFinished;

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

/** Build-time sink. Empty means the build is telemetry-free and stays silent. */
export const TELEMETRY_ENDPOINT = (env.VITE_TELEMETRY_ENDPOINT ?? "").trim();

function optedOut(search: string, dnt: string | undefined): boolean {
  if (dnt === "1" || dnt?.toLowerCase() === "yes") return true;
  try {
    // `window.location.search` arrives with its leading "?", which
    // URLSearchParams would fold into the first key. Accept a bare query, a
    // "?…" search, or a full path for callers that have not split it.
    const query = search.includes("?") ? search.slice(search.indexOf("?") + 1) : search;
    return new URLSearchParams(query).get("notelemetry") === "1";
  } catch {
    return false;
  }
}

/** Whether this build and this visitor allow a send at all. */
export function telemetryEnabled(
  search: string = window.location.search,
  dnt: string | undefined = navigator.doNotTrack ?? undefined,
  endpoint: string = TELEMETRY_ENDPOINT,
): boolean {
  return endpoint !== "" && !optedOut(search, dnt);
}

/**
 * Build a run-finished event. Kept pure and exported so the shape of the
 * payload is testable without a network or a DOM.
 */
export function runFinished(delta: number | null, partial: boolean, replay: boolean, market: MarketMode = getMarketMode()): RunFinished {
  return {
    event: "run_finished",
    stage: "finale",
    market,
    // One decimal is plenty to count improved/worsened runs; the raw float is
    // a near-fingerprint of a score sequence and buys us nothing.
    delta: delta === null ? null : Math.round(delta * 10) / 10,
    partial,
    replay,
  };
}

export function chapterReached(stage: TelemetryStage, market: MarketMode = getMarketMode()): ChapterReached {
  return { event: "chapter_reached", stage, market };
}

/** Fire-and-forget. Never throws, never blocks the frame the player is on. */
export function sendTelemetry(payload: TelemetryEvent): void {
  if (TELEMETRY_ENDPOINT === "" || !telemetryEnabled()) return;
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon(TELEMETRY_ENDPOINT, blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch(TELEMETRY_ENDPOINT, {
      method: "POST",
      body,
      headers: { "content-type": "text/plain;charset=UTF-8" },
      keepalive: true,
      mode: "cors",
      credentials: "omit",
    }).catch(() => undefined);
  } catch {
    /* telemetry must never break a run */
  }
}
