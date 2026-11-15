/**
 * Camera rig — the viewport as a character. Grammar borrowed from
 * Phaser's camera examples (pan/zoomTo/shake/flash/fade + deadzone
 * follow) and Godot's create_tween() chain semantics: every method
 * returns the Animation it started so callers can compose them as
 * parallel/sequential tweeners via ui/tween.ts.
 *
 * Scope discipline (FEEL_MATRIX): shake is RESERVED for the three
 * biggest beats; punch fires on ordinary ledger consequences; idle
 * drift is ambient and the first thing to cut if it ever nauseates.
 * Everything is transform/opacity and every method early-returns
 * under prefers-reduced-motion.
 */

const reduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function cam(): HTMLElement | null {
  return document.getElementById("game-cam");
}

function play(el: HTMLElement | null, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation | null {
  if (!el || reduced()) return null;
  return el.animate(frames, opts);
}

let wantIdle = false;

export const camera = {
  /** Ambient breathing — CSS class on the rig. Safe to call before the
   *  rig exists: the request is sticky and applied on first pan/attach. */
  idle(on = true): void {
    wantIdle = on;
    const c = cam();
    if (c) c.classList.toggle("lm-cam-idle", on && !reduced());
  },

  /** Called by the rig host once #game-cam mounts — applies pending state. */
  attach(el: HTMLElement): void {
    el.classList.toggle("lm-cam-idle", wantIdle && !reduced());
  },

  /** Every ledger consequence: a 300ms lift-and-settle. */
  punch(): Animation | null {
    return play(cam(), [
      { transform: "translateY(0px) scale(1)", offset: 0 },
      { transform: "translateY(-3px) scale(1.018)", offset: 0.35 },
      { transform: "translateY(0px) scale(1)", offset: 1 },
    ], { duration: 300, easing: "cubic-bezier(.3,1.25,.5,1)" });
  },

  /** Chapter turns / heavy beats: a weight settle. */
  settle(): Animation | null {
    return play(cam(), [
      { transform: "translateY(0px) scale(1)", offset: 0 },
      { transform: "translateY(6px) scale(0.985)", offset: 0.45 },
      { transform: "translateY(0px) scale(1)", offset: 1 },
    ], { duration: 260, easing: "cubic-bezier(.4,0,.3,1)" });
  },

  /** RESERVED — Shark drip, Collector shutter, finale total only. */
  shake(px = 3): Animation | null {
    return play(cam(), [
      { transform: "translate(0px,0px)", offset: 0 },
      { transform: `translate(${px}px,${(-px * 0.4).toFixed(1)}px)`, offset: 0.16 },
      { transform: `translate(${(-px * 0.75).toFixed(1)}px,${(px * 0.3).toFixed(1)}px)`, offset: 0.32 },
      { transform: `translate(${(px * 0.5).toFixed(1)}px,${(-px * 0.2).toFixed(1)}px)`, offset: 0.5 },
      { transform: `translate(${(-px * 0.25).toFixed(1)}px,0px)`, offset: 0.68 },
      { transform: `translate(${(px * 0.12).toFixed(1)}px,0px)`, offset: 0.84 },
      { transform: "translate(0px,0px)", offset: 1 },
    ], { duration: 170, easing: "linear" });
  },

  /** Warm lantern flash — chapter turns and the cinematic reveal. */
  flash(): Animation | null {
    if (reduced()) return null;
    let f = document.getElementById("cam-flash");
    if (!f) {
      f = document.createElement("div");
      f.id = "cam-flash";
      f.setAttribute("aria-hidden", "true");
      document.body.append(f);
    }
    return f.animate([
      { opacity: 0 },
      { opacity: 0.85, offset: 0.25 },
      { opacity: 0 },
    ], { duration: 380, easing: "ease-out" });
  },

  /** Chapter open: content drifts up into place — pan, not cut (Phaser pan). */
  panIn(): Animation | null {
    return play(cam(), [
      { transform: "translateY(12px) scale(0.995)", opacity: 0.4, offset: 0 },
      { transform: "translateY(0px) scale(1)", opacity: 1, offset: 1 },
    ], { duration: 600, easing: "cubic-bezier(.25,.8,.3,1)" });
  },
};
