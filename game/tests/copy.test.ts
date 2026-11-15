import { describe, expect, it } from "vitest";
import { createCh1State, dayChoices, CH1_DAYS, BILL, ENGINEERED_PAIR } from "../src/chapters/ch1";

/* Vite's ?raw imports — the source of a module as a string (vitest supports
   them natively). Typed in tests/raw.d.ts: the project ships no vite/client
   types, and an inline declaration here would be a module augmentation. */
import ch1Src from "../src/chapters/ch1.ts?raw";
import ch1ScreenSrc from "../src/chapters/ch1screen.ts?raw";
import ch2ScreenSrc from "../src/chapters/ch2screen.ts?raw";
import ch3ScreenSrc from "../src/chapters/ch3screen.ts?raw";
import secondWeekSrc from "../src/chapters/secondWeek.ts?raw";
import weekGenSrc from "../src/engine/weekGen.ts?raw";

/**
 * The copy rule (WS-B1): an option may state its TERMS, never its OUTCOME.
 * A button that tells you what will happen if you pick it is a reading test,
 * not a decision — and it was the single biggest reason the game had no
 * tension. These phrases are banned everywhere in the chapter copy.
 */
const BANNED_OUTCOME_PHRASES = [
  "run into the red",
  "he will say no",
  "will never see it",
  "this week's till never sees it",
  "the street's money",
  "nothing lights for him",
  "clears at their number",
  "he's already gone",
];

/**
 * The pair arms must not say which arm pays — but the LEDGER and the DEBRIEF
 * may (they are the after-the-fact truth). So these are banned on the
 * runtime option text only, never in a whole-file scan.
 */
const BANNED_ON_THE_ARMS = ["inside the week", "after the close"];

const SOURCES: [string, string][] = [
  ["ch1.ts", ch1Src],
  ["ch1screen.ts", ch1ScreenSrc],
  ["ch2screen.ts", ch2ScreenSrc],
  ["ch3screen.ts", ch3ScreenSrc],
  ["secondWeek.ts", secondWeekSrc],
  ["weekGen.ts", weekGenSrc],
];

/** Strip comments so the scan reads the player's copy, not the design notes. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("choice copy never states the outcome (WS-B1)", () => {
  it("no chapter source carries a banned outcome phrase", () => {
    const offenders: string[] = [];
    for (const [file, text] of SOURCES) {
      const lower = codeOnly(text).toLowerCase();
      for (const phrase of BANNED_OUTCOME_PHRASES) {
        if (lower.includes(phrase)) offenders.push(`${file}: "${phrase}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the day's options carry no banned phrase at runtime", () => {
    const { state } = createCh1State(20261109);
    const offenders: string[] = [];
    for (let day = 1; day <= CH1_DAYS; day++) {
      for (const c of dayChoices(state, day)) {
        const blob = `${c.label} ${c.detail}`.toLowerCase();
        for (const phrase of [...BANNED_OUTCOME_PHRASES, ...BANNED_ON_THE_ARMS]) {
          if (blob.includes(phrase)) offenders.push(`day ${day}: "${phrase}"`);
        }
      }
      state.day = day + 1;
      state.lastPlayedDay = day;
    }
    expect(offenders).toEqual([]);
  });
});

describe("the engineered pair is symmetric (WS-B2)", () => {
  it("both arms offer identical wording — only the timing differs", () => {
    const { state } = createCh1State(20261109);
    const dayOne = dayChoices(state, 1).find((c) => c.kind === "chase")!;
    const dayOneDefer = dayChoices(state, 1).find((c) => c.kind === "defer")!;
    state.day = 3;
    state.invoices[0]!.chasedDay = 1; // the first invoice is settled
    state.invoices[0]!.paidDay = 2;
    const dayThree = dayChoices(state, 3).find((c) => c.kind === "chase")!;
    const dayThreeDefer = dayChoices(state, 3).find((c) => c.kind === "defer")!;
    expect(dayThree.detail).toBe(dayOne.detail);
    expect(dayThreeDefer.detail).toBe(dayOneDefer.detail);
    // ...and no arm may mention the week or the close.
    expect(dayThree.detail.toLowerCase()).not.toMatch(/week|close/);
    expect(dayOne.detail.toLowerCase()).not.toMatch(/week|close/);
  });

  it("the pair's two arms are the same face on both days", () => {
    const { state } = createCh1State(20261109);
    const chase = dayChoices(state, 1).find((c) => c.kind === "chase")!;
    expect(chase.label).toContain("2,400");
    expect(ENGINEERED_PAIR.first.invoice.principal).toBe(ENGINEERED_PAIR.second.invoice.principal);
    expect(BILL.amount).toBeGreaterThan(0);
  });
});
