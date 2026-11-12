/**
 * Chapter 2 screen driver — anchoring runs + the Collector probe + debrief.
 * Pure sim lives in ch2.ts; this file only marshals DOM + ledger.
 */
import { el, clear, choiceButton } from "../ui/dom";
import {
  RESET_COPY,
  createCh2State,
  currentRun,
  counterpartyCounter,
  accept,
  walk,
  ch2LedgerEntry,
  collectorProbe,
  collectorLedgerEntry,
  ch2Prospect,
  flippedOutcome,
} from "./ch2";
import type { LedgerEntry } from "../engine/ledger";
import { phrased } from "../i18n";

export interface Ch2Deps {
  root: HTMLElement;
  record: (e: Omit<LedgerEntry, "id">) => void;
  pairEntries: () => LedgerEntry[]; // ch2_anchor_r* entries
  say: (speaker: "siki" | "zana", text: string) => void;
  onTool?: (tool: "flip_the_anchor") => void;
}

const gbp = (v: number) => `£${Math.round(v)}`;

export function runChapter2(deps: Ch2Deps, seed: number): void {
  const { state, rng } = createCh2State(seed);
  const { root } = deps;
  clear(root);
  const stage = el("div", { class: "lm-stage" });
  root.append(stage);

  intro();

  function intro(): void {
    deps.say("siki", "The Claims Desk in the market buys settling. They open every negotiation with their number. Notice whose number is already on the table.");
    stage.append(
      el("h3", { text: "Chapter 2 · The Offer" }),
      el("p", { class: "lm-line siki", text: "One invoice. £1,240. Sixty days aged. Three runs at the same desk." }),
      el("p", { class: "lm-hint", text: RESET_COPY }),
      choiceButton("Walk into the office", "Run 1 of 3", () => showRun()),
    );
  }

  function showRun(): void {
    const run = currentRun(state);
    clear(stage);
    // No statute on the negotiation screen (recovery plan §4): the anchor is
    // the only number the desk puts on the table. The prospect reveals in the
    // debrief — that is what makes "the facts never moved" land.
    stage.append(
      el("h3", { text: `Run ${run.run + 1} of 3` }),
      el("div", { class: "lm-surface" },
        el("h4", { text: "Their opening — first, as always" }),
        el("p", { class: "lm-cash", text: gbp(run.anchor) }),
        el("p", {
          class: "lm-hint",
          text: phrased({
            normal: "Sixty days of your own money on that invoice. What is it actually worth to you today?",
            plain: "This money is yours — it is sixty days late. How much is it really worth to you?",
          }),
        }),
      ),
    );
    // Blank by default — a pre-filled floor would be anchor-derived and would
    // manufacture the very correlation the debrief measures. No floor set is
    // recorded as null and excluded from the anchoring axis.
    const floor = el("input", { type: "number", min: "0", step: "10", placeholder: "e.g. 900", "aria-label": "Your minimum acceptable settlement (£)" });
    if (run.floor !== null) floor.value = String(run.floor);
    stage.append(
      el("label", { class: "lm-hint", text: "Your minimum before you say yes (optional — decide it before their number moves you):" }, floor),
      choiceButton("Set the floor", "", () => {
        const v = floor.value.trim();
        const n = Number(v);
        run.floor = v !== "" && Number.isFinite(n) && n >= 0 ? n : null;
        roundsLoop();
      }),
    );
  }

  function roundsLoop(): void {
    const run = currentRun(state);
    clear(stage);
    const latest = run.counters.length === 0 ? run.anchor : run.counters[run.counters.length - 1]!;
    const canCounter = run.counters.length < 2; // anchor + up to 2 counters
    stage.append(
      el("h3", { text: `Run ${run.run + 1}: on the table` }),
      el("p", { class: "lm-cash", text: gbp(latest) }),
      el("p", { class: "lm-hint", text: `Your floor: ${run.floor === null ? "not set" : gbp(run.floor)}` }),
    );
    if (!canCounter) stage.append(el("p", { class: "lm-hint", text: "The desk spreads its hands. It will not move further." }));
    stage.append(
      el("div", { class: "lm-choices" },
        choiceButton("Accept " + gbp(latest), "The invoice clears at their number", () => {
          accept(state);
          deps.record(ch2LedgerEntry(state, snapshot(run)));
          nextRun();
        }),
        ...(canCounter
          ? [choiceButton("Say it isn't enough", `Their ${run.counters.length === 0 ? "opening" : "last"} was ${gbp(latest)}`, () => {
              // One explicit, visible counter move per click.
              const moved = counterpartyCounter(state, rng);
              if (moved !== null) roundsLoop();
              else roundsLoop(); // their hands are up; re-render shows the note
            })]
          : []),
        choiceButton("Stop work on it", "Walk away from the desk with the invoice", () => {
          walk(state);
          deps.record(ch2LedgerEntry(state, snapshot(run)));
          nextRun();
        }),
      ),
    );
  }

  function snapshot(r: ReturnType<typeof currentRun>) {
    return { run: r.run as 0 | 1 | 2, anchor: r.anchor, floor: r.floor, counters: [...r.counters], settled: r.settled, walked: r.walked };
  }

  function nextRun(): void {
    if (state.run === 2) return collectorIntl();
    state.run = (state.run + 1) as 1 | 2;
    showRun();
  }

  function collectorIntl(): void {
    const probe = collectorProbe();
    clear(stage);
    deps.say("zana", "Collector at the end of the row. Careful — he buys the customer with the debt.");
    stage.append(
      el("h3", { text: "A probe from the end of the row" }),
      el("p", { class: "lm-line zana", text: probe.copy }),
      el("p", { class: "lm-hint", text: "Fictional · typical UK recovery commission range shown elsewhere as 5–15% · indicative" }),
      el("div", { class: "lm-choices" },
        choiceButton(`Sell the debt — ${gbp(probe.buyPrice)}`, "Instant cash, relationship gone", () => {
          deps.record(collectorLedgerEntry(probe, true));
          debrief();
        }),
        choiceButton("Decline", "Keep the debt and the customer", () => {
          deps.record(collectorLedgerEntry(probe, false));
          debrief();
        }),
      ),
    );
  }

  function debrief(): void {
    const runs = deps.pairEntries();
    // Pair anchor+floor per ledger entry — never parallel arrays (a skipped
    // floor would silently shift every later row).
    const rows = runs.map((r) => ({
      anchor: Number(r.optionsShown.find((o) => o.framingVariable.startsWith("anchor_"))?.framingVariable.split("_")[1] ?? 0),
      floor: r.negotiationFloor ?? null,
    }));
    const floorsSet = rows.map((r) => r.floor).filter((f): f is number => f !== null);
    const move = floorsSet.length >= 2 ? Math.max(...floorsSet) - Math.min(...floorsSet) : 0;
    const namedFloors = floorsSet.length >= 2;
    const flip = flippedOutcome(seed + 1);
    let beat = 0;
    const frames: (() => void)[] = [
      () => {
        deps.say("siki", "Three runs. One invoice. Did your minimum move with their opening?");
        stage.append(
          el("h3", { text: "Your floors against their anchors" }),
          el("div", { class: "lm-chart" }, ...rows.map((r, i) =>
            el("div", { class: "lm-chart-row" },
              el("span", { text: `Run ${i + 1} · anchor ${gbp(r.anchor)} → floor ${r.floor === null ? "not set" : gbp(r.floor)}` }),
              el("div", { class: "lm-bar", style: `width:${r.floor === null ? 0 : Math.min(100, (r.floor / ch2Prospect().total) * 100)}%` }),
            ),
          )),
          choiceButton("Continue", "", next),
        );
      },
      () => {
        deps.say("siki", namedFloors
          ? "The facts never moved. The opening number did."
          : "You never named a floor. The anchor had nothing to push against — which is its own answer: decide the number before their number arrives.");
        stage.append(
          el("h3", { text: "The anchor did the work" }),
          el("p", { class: "lm-line siki", text: namedFloors
            ? `The prospect sat still at ${gbp(ch2Prospect().total)} — every run, same law, same invoice, same 60 days. Your floor moved £${Math.round(move)} across runs. When a number moves your bottom line without touching the facts, that number is not information. It is machinery — anchoring, and its fair face, the ultimatum game.`
            : `The prospect sat still at ${gbp(ch2Prospect().total)} — every run, same law, same invoice, same 60 days. A floor you never set cannot be moved by an anchor. Set yours before the desk sets the frame.` }),
          el("p", { class: "lm-hint", text: "Their £1,050 opening is not generous. It is an order of battle." }),
          choiceButton("Continue", "", next),
        );
      },
      () => {
        deps.say("zana", "Flip it. Open with the law, not with their number.");
        stage.append(
          el("h3", { text: "The flip: quote the Act first" }),
          el("div", { class: "lm-surface" },
            el("h4", { text: "In writing · dated · no payment promise" }),
            el("p", { class: "lm-line zana", text: `"Invoice £1,240, 60 days late. Statutory interest 8% over the Bank of England base plus £70 fixed compensation is accruing under the Late Payment of Commercial Debts (Interest) Act 1998. Settle the account total of ${gbp(ch2Prospect().total)}."` }),
            el("p", { class: "lm-hint", text: `Seeded flip run — their best face-saving offer comes to ~${gbp(flip.offer)}. Still short of the Act. Still better than their opening.` }),
          ),
          el("p", { class: "lm-hint", text: "Tool unlocked: FLIP THE ANCHOR — negotiations can now open with your own lawful number." }),
          choiceButton("Next chapter", "The street waits", () => deps.onTool?.("flip_the_anchor")),
        );
      },
    ];
    function next(): void { beat += 1; clear(stage); frames[Math.min(beat, frames.length - 1)]?.(); }
    clear(stage);
    frames[0]!();
  }
}
