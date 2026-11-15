/**
 * Tween-chain shim — Godot's create_tween() semantics over WAAPI:
 * `sequence()` plays steps one after another (each step may return an
 * Animation to await), `parallel()` fires them together. This is the
 * composition layer the camera/fx/actor systems hang off — replaces
 * ad-hoc setTimeout ordering, which already bit us once (homeReact).
 */

export async function sequence(steps: Array<() => Animation | null | void>): Promise<void> {
  for (const step of steps) {
    const a = step();
    if (a) await a.finished.catch(() => {});
  }
}

export function parallel(steps: Array<() => Animation | null | void>): void {
  for (const step of steps) step();
}
