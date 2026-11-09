/**
 * Seeded PRNG — experiments must be deterministic.
 * A player's replay of a chapter must re-encounter identical offered
 * choices, or debrief comparisons ("your floor moved with the anchor")
 * become unfair. mulberry32 is tiny, fast, and stable across sessions.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: integer in [lo, hi] inclusive. */
export function rngInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Pick one element, deterministically. */
export function pick<T>(rng: Rng, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length)] as T;
}
