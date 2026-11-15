/**
 * Lip-sync integrity — the karaoke chain only works when three things agree:
 * lines.json (source of truth) → manifest.json (runtime lookup by exact
 * display text) → {lineId}.timing.json (char stream === display text).
 * Any drift (reworded copy, stale bake, missing take) fails here instead of
 * degrading silently in play.
 */
import { describe, expect, it } from "vitest";
import linesDoc from "../design/lines.json";
import manifestDoc from "../public/audio/manifest.json";

const norm = (s: string): string => s.trim().replace(/\s+/g, " ");

interface LineEntry {
  id: string;
  speaker: string;
  text: string;
  variants?: Record<string, (string | number)[]>;
}

function expand(line: LineEntry): { id: string; text: string }[] {
  const variants = line.variants;
  if (!variants) return [{ id: line.id, text: norm(line.text) }];
  const keys = Object.keys(variants);
  const out: { id: string; text: string }[] = [];
  const walk = (i: number, acc: Record<string, string | number>): void => {
    if (i === keys.length) {
      let text = line.text;
      for (const [k, v] of Object.entries(acc)) text = text.replaceAll(`{${k}}`, String(v));
      out.push({ id: `${line.id}_${Object.values(acc).join("_")}`, text: norm(text) });
      return;
    }
    const key = keys[i]!;
    for (const v of variants[key] ?? []) walk(i + 1, { ...acc, [key]: v });
  };
  walk(0, {});
  return out;
}

/** All baked timing files, keyed by lineId (the bake writes one per take). */
const timingModules = import.meta.glob<{ characters: string[]; text: string }>(
  "../public/audio/*.timing.json",
  { eager: true },
);

const expected = (linesDoc.lines as LineEntry[]).flatMap(expand);
const manifest = manifestDoc.lines as Record<string, { id: string; audio: string; timing: string }>;

describe("audio manifest", () => {
  it("covers every bakeable line exactly once", () => {
    const keys = new Set(Object.keys(manifest));
    for (const e of expected) expect(keys.has(e.text), e.id).toBe(true);
    expect(keys.size).toBe(expected.length);
  });
  it("every entry has its timing file baked", () => {
    for (const [text, m] of Object.entries(manifest)) {
      const mod = Object.entries(timingModules).find(([p]) => p.endsWith(`/${m.id}.timing.json`));
      expect(mod, text).toBeDefined();
    }
  });
  it("every timing char stream is the display text verbatim (karaoke aligns)", () => {
    for (const [text, m] of Object.entries(manifest)) {
      const mod = Object.entries(timingModules).find(([p]) => p.endsWith(`/${m.id}.timing.json`))?.[1];
      expect(mod, m.id).toBeDefined();
      expect(mod!.characters.join(""), m.id).toBe(text);
    }
  });
});
