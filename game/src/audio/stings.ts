/**
 * Chapter-entrance stings — the frozen VO contract for Track B.
 *
 * Each sting is one card at a chapter boundary: eyebrow + title + epigraph,
 * voiced when a baked take exists (manifest key = `text`, byte-for-byte),
 * silent otherwise. Chapter 1 has no sting — the prologue is its entrance.
 *
 * Track B: bake these `text` strings verbatim against the speakers below
 * (scripts/bake-voices.mjs normalizes whitespace only). If any line is
 * rewritten, the display string in main.ts must change to match — the
 * manifest lookup is exact-match on normalized text.
 */
import type { Speaker } from "./voice";

export interface StingSpec {
  speaker: Speaker;
  /** Display text AND manifest key — they must stay identical. */
  text: string;
}

export const STING_LINES = {
  ch2: {
    speaker: "siki",
    text: "Chapter Two. The Offer. Everyone names a price first — except you.",
  },
  ch3: {
    speaker: "zana",
    text: "Chapter Three. Good money after bad. The street remembers what you already spent.",
  },
  finale: {
    speaker: "siki",
    text: "The week closes. Let's see what your patience was worth.",
  },
} as const satisfies Record<string, StingSpec>;

export type StingChapter = keyof typeof STING_LINES;

export function stingFor(n: 2 | 3 | "finale"): StingSpec {
  return n === "finale" ? STING_LINES.finale : STING_LINES[n === 2 ? "ch2" : "ch3"];
}
