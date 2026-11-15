/**
 * Zana's clock — the optional decision countdown.
 *
 * A compact "how long did your gut take" bar that can sit above any choice
 * set. It is an observation instrument, never a gate: onTimeout is a hook
 * for the caller (usually "resolve the beat as if the player stood still"),
 * and the whole thing is opt-out via localStorage for players who find
 * countdowns stressful.
 *
 * A11y contract: aria-live="polite" announces only at 3-2-1 and at expiry
 * (never per-second chatter), the visible digits are aria-hidden, and the
 * timer never takes focus. Reduced motion (`calm` or the media query) gets
 * a static text countdown with no bar animation.
 */
import "../styles/gut-timer.css";
import { el } from "./dom";

export interface GutTimerOpts {
  /** Countdown length in whole seconds. */
  seconds: number;
  /** Visible caption, e.g. "Zana's clock". */
  label: string;
  /** Force the reduced-motion rendering (static text, no bar). */
  calm: boolean;
  /** Fired exactly once when the clock runs out; never after stop(). */
  onTimeout: () => void;
}

export interface GutTimerHandle {
  /** Cancel the clock. Idempotent; no timeout leaks through afterwards. */
  stop(): void;
  /** True once the clock has expired and onTimeout has fired. */
  timedOut(): boolean;
}

/** One gut-call telemetry row (player decided before the clock ran out). */
export interface GutCall {
  experimentId: string;
  chosenOptionId: string;
  secondsTaken: number;
  at: string;
}

const CLOCK_KEY = "lm.gutclock.v1";
const CALLS_KEY = "lm.gut.v1";
const MAX_GUT_CALLS = 20;
const TICK_MS = 200;
const ANNOUNCE_FROM = 3;

/** localStorage can throw (private mode) or be absent — never crash the game for a nice-to-have. */
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** Gut clock is opt-in: default OFF, "1" turns it on. Timeouts never commit a choice. */
export function gutClockEnabled(): boolean {
  try {
    const s = storage();
    return !!s && s.getItem(CLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setGutClockEnabled(on: boolean): void {
  try {
    storage()?.setItem(CLOCK_KEY, on ? "1" : "0");
  } catch {
    /* private mode — the clock stays off without storage to remember opt-in */
  }
}

function readCalls(s: Storage | null): GutCall[] {
  if (!s) return [];
  try {
    const raw = s.getItem(CALLS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GutCall[]) : [];
  } catch {
    return [];
  }
}

export function gutCalls(): GutCall[] {
  return readCalls(storage());
}

export function recordGutCall(experimentId: string, chosenOptionId: string, secondsTaken: number): void {
  try {
    const s = storage();
    if (!s) return;
    const calls = readCalls(s);
    calls.push({ experimentId, chosenOptionId, secondsTaken, at: new Date().toISOString() });
    s.setItem(CALLS_KEY, JSON.stringify(calls.slice(-MAX_GUT_CALLS)));
  } catch {
    /* telemetry is never worth a crash */
  }
}

export function mountGutTimer(host: HTMLElement, opts: GutTimerOpts): GutTimerHandle {
  const calm = opts.calm || prefersReducedMotion();
  const root = el("div", { class: calm ? "lm-gut lm-gut--calm" : "lm-gut", role: "timer" });
  const label = el("span", { class: "lm-gut-label", text: opts.label });
  const secs = el("span", { class: "lm-gut-secs", "aria-hidden": "true" });
  const live = el("span", { class: "lm-gut-live", "aria-live": "polite" });

  let fill: HTMLElement | null = null;
  if (!calm) {
    const bar = el("div", { class: "lm-gut-bar" });
    fill = el("div", { class: "lm-gut-bar-fill" });
    bar.append(fill);
    root.append(bar);
  }
  root.append(el("span", { class: "lm-gut-meta" }, label, secs), live);
  host.append(root);

  const totalMs = Math.max(0, opts.seconds * 1000);
  let deadline = Date.now() + totalMs;
  // Pause on background tab: wall-clock deadline shifts by hidden time so
  // alt-tab / slow machines never burn decision time.
  const onVis = (): void => {
    if (document.hidden) { (onVis as { _h?: number })._h = Date.now(); return; }
    const h = (onVis as { _h?: number })._h;
    if (h) { deadline += Date.now() - h; (onVis as { _h?: number })._h = undefined; }
  };
  try { document.addEventListener("visibilitychange", onVis); } catch { /* non-DOM test */ }
  const cleanupVis = (): void => { try { document.removeEventListener("visibilitychange", onVis); } catch { /* noop */ } };
  let fired = false;
  let stopped = false;
  let announced = Number.POSITIVE_INFINITY;
  let interval: ReturnType<typeof setInterval> | null = null;

  const render = (): void => {
    const remaining = deadline - Date.now();
    const s = Math.max(0, Math.ceil(remaining / 1000));
    if (secs.textContent !== String(s)) secs.textContent = String(s);
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (remaining / totalMs) * 100))}%`;
    if (remaining > 0 && s <= ANNOUNCE_FROM && s < announced) {
      announced = s;
      live.textContent = String(s);
    }
    if (remaining <= 0 && !fired) {
      fired = true;
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
      live.textContent = "time called";
      label.textContent = `${opts.label} — time called`;
      root.className = `${root.className} lm-gut--called`;
      if (fill) fill.style.width = "0%";
      secs.textContent = "0";
      opts.onTimeout();
      cleanupVis();
    }
  };

  const stopTicking = (): void => {
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
    stopped = true;
    cleanupVis();
  };

  render();
  if (!fired && !stopped) interval = setInterval(render, TICK_MS);

  return {
    stop: stopTicking,
    timedOut: () => fired,
  };
}
