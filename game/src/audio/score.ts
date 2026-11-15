/**
 * Reactive score — the beds answer the ledger (presentation only).
 *
 * A single tension value (0..1) follows the player's week: deferrals push
 * it up, collections let it back down. Tension does two things:
 *  1. procedural motifs on the sfx channel (felt punctuation, not melody —
 *     the baked music bed stays the only melodic voice);
 *  2. a slow swell on the music bed's gain (±15%, never a mute, never a
 *     jump — the bed breathes, it doesn't perform).
 *
 * No sim input, no ledger reads: call sites in main.ts report what just
 * happened on screen ("collect" / "defer" / "shark" / "sting").
 * Safe to call locked/muted — the bus no-ops and tension still tracks.
 */
import type { AudioBus, PlayHandle } from "./bus";

let tension = 0.35;
let music: PlayHandle | null = null;
let busRef: AudioBus | null = null;

export type ScoreEvent = "collect" | "defer" | "shark" | "sting";

/** The live music-bed handle, so tension can breathe its gain. */
export function scoreBed(bus: AudioBus, handle: PlayHandle | null): void {
  busRef = bus;
  music = handle;
  applySwell();
}

function applySwell(): void {
  // 0.85..1.15 around the bed's authored level — audible, never foreground.
  music?.setVolume(0.85 + tension * 0.3);
}

export function scoreEvent(kind: ScoreEvent): void {
  const bus = busRef;
  if (kind === "collect") {
    tension = Math.max(0.1, tension - 0.18);
    // Warm two-note resolve — the till's good day, major lift.
    bus?.tone(523.25, { dur: 0.22, type: "sine", gain: 0.09 });
    bus?.tone(784, { dur: 0.3, type: "sine", gain: 0.07, delay: 0.12 });
  } else if (kind === "defer") {
    tension = Math.min(1, tension + 0.15);
    // Low thud, sliding down — the street keeping the difference.
    bus?.tone(110, { dur: 0.4, type: "triangle", gain: 0.13, slideTo: 68 });
  } else if (kind === "shark") {
    tension = Math.min(1, tension + 0.22);
    // Deep slow pulse + its echo — the daily number, small on purpose.
    bus?.tone(65, { dur: 0.6, type: "triangle", gain: 0.11, slideTo: 50 });
    bus?.tone(65, { dur: 0.6, type: "triangle", gain: 0.07, slideTo: 50, delay: 0.35 });
  } else {
    // Chapter turn shimmer — the lantern pulse, not a consequence.
    tension = Math.min(1, tension + 0.06);
    bus?.tone(880, { dur: 0.5, type: "sine", gain: 0.05 });
    bus?.tone(1318.5, { dur: 0.6, type: "sine", gain: 0.035, delay: 0.18 });
  }
  applySwell();
}

/** For tests: the model without touching audio. */
export function scoreTension(): number {
  return tension;
}

export function resetScore(): void {
  tension = 0.35;
  music = null;
}
