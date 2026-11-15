/**
 * Beat clock — Zana's clock mounted on a decision beat.
 *
 * Wraps ui/gutTimer for the choice screens: mounts the countdown, records
 * the gut call (option + seconds taken, or "time_called"), and resolves the
 * beat as if the player stood still on expiry.
 *
 * The clock is ARMED, not started: the caller mounts it while the beat's
 * spoken line plays, then calls arm() from the line's onDone callback
 * (voice.speak fires it whether or not a take plays). The countdown only
 * runs while the player can actually read the options — the timer never
 * races the voice.
 *
 * The instrument is an observation, never a gate: onTimeout defaults to the
 * quiet option (defer / no floor / the Shark walking on), which is also the
 * fiction-true outcome of not acting. When the pref is off the clock stays
 * invisible but the call is still logged — the debrief can still tell
 * deliberation from instinct.
 */
import { mountGutTimer, gutClockEnabled, recordGutCall, type GutTimerHandle } from "./gutTimer";

export interface BeatClockOpts {
  experimentId: string;
  /** Whole seconds before Zana calls time — of pure decision time. */
  seconds: number;
  /** Reduced-motion rendering (static text, no bar). */
  calm: boolean;
  /** What happens when the player stands still — fiction-true default. */
  onTimeout: () => void;
}

export interface BeatClock {
  /** Start the countdown — call once the beat's line has landed. */
  arm: () => void;
  /** The player chose: log the gut call, stop the clock. */
  picked: (chosenOptionId: string) => void;
  /** The beat passed without a decision: stop the clock, log nothing. */
  cancel: () => void;
}

export function beatClock(host: HTMLElement, opts: BeatClockOpts): BeatClock {
  const t0 = Date.now();
  let armedAt = t0;
  const secondsTaken = (): number => {
    // From arm(): pure decision time. Pre-arm (silent-mist callers) falls
    // back to the beat's own clock, which is still a fair reading.
    return Math.max(0, (Date.now() - armedAt) / 1000);
  };
  const mountedAt = (): GutTimerHandle =>
    mountGutTimer(host, {
      seconds: opts.seconds,
      label: "Zana's clock",
      calm: opts.calm,
      onTimeout: () => {
        handle = null;
        recordGutCall(opts.experimentId, "time_called", opts.seconds);
        opts.onTimeout();
      },
    });
  let handle: GutTimerHandle | null = null;
  if (!gutClockEnabled()) {
    return {
      arm: () => { /* invisible instrument; still armed for the record */ },
      picked: (id) => recordGutCall(opts.experimentId, id, secondsTaken()),
      cancel: () => { /* nothing mounted */ },
    };
  }
  return {
    arm: () => {
      if (handle) return;
      armedAt = Date.now();
      handle = mountedAt();
    },
    picked: (id) => {
      recordGutCall(opts.experimentId, id, secondsTaken());
      handle?.stop();
      handle = null;
    },
    cancel: () => {
      handle?.stop();
      handle = null;
    },
  };
}
