/**
 * Chapter 2 screen driver — anchoring runs + the Collector probe + debrief.
 * Pure sim lives in ch2.ts; this file only marshals DOM + ledger.
 */
import { el, clear, choiceButton } from "../ui/dom";
import {
  CH2_CLIENT,
  CH2_INVOICE,
  CH2_DAYS_LATE,
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
import { renderTill, renderLedger, makeStallChrome } from "../ui/stall";
import { stallFigure } from "../ui/street";
import type { LedgerEntry } from "../engine/ledger";
import { phrased } from "../i18n";
import { money, remedy, isSouq, zakatNote } from "../engine/market";
import type { Speaker } from "../audio/voice";

export interface Ch2Deps {
  root: HTMLElement;
  record: (e: Omit<LedgerEntry, "id">) => void;
  pairEntries: () => LedgerEntry[]; // ch2_anchor_r* entries
  say: (speaker: Speaker, text: string) => void;
  onTool?: (tool: "flip_the_anchor") => void;
}

/** The desk speaks (Collector's voice): one static opener per sitting — the
 *  numbers differ per run, the silence doesn't. Baked; text always lands. */
const DESK_OPENERS = [
  "First sitting. The desk slides a number across — no greeting. Numbers first.",
  "Second sitting. A different number. Same desk, same silence.",
  "Last sitting. The desk slides its final number across.",
];

const gbp = (v: number) => money(v, 0);

export function runChapter2(deps: Ch2Deps, seed: number): void {
  const { state, rng } = createCh2State(seed);
  const { root } = deps;
  clear(root);
  // The stall chrome PERSISTS through every beat (the place doesn't clear to
  // a bare form — recovery plan §2.1, third-pass charge): the till shows the
  // money on the table, the ledger shows the claim. Only the stage below
  // changes between beats.
  const chrome = makeStallChrome();
  const stage = el("div", { class: "lm-stage" });
  root.append(chrome.till, chrome.ledger, stage);

  /** The stall chrome for this chapter: till = the number on the table;
   *  ledger = the claim card. `onTable` is the live number the desk shows. */
  function renderChrome(onTable: number): void {
    renderTill(chrome.till, { value: onTable, caption: "On the table", decimals: 0 });
    renderLedger(chrome.ledger, [
      {
        client: CH2_CLIENT,
        amount: CH2_INVOICE,
        status: `${CH2_DAYS_LATE} days late · your claim`,
        tone: "overdue",
      },
    ]);
  }

  intro();

  function intro(): void {
    deps.say("siki", "The Claims Desk in the market buys settling. They open every negotiation with their number. Notice whose number is already on the table.");
    renderChrome(CH2_INVOICE);
    stage.append(
      el("h3", { text: "Chapter 2 · The Offer" }),
      el("p", { class: "lm-line siki", text: `One invoice. ${gbp(CH2_INVOICE)}. Sixty days aged. Three runs at the same desk.` }),
      el("p", { class: "lm-hint", text: RESET_COPY }),
      // The souq market's whole lesson is stated here, before the first
      // sitting: the ceiling was fixed in your own terms on day one. A judge
      // who reads only this screen still meets the instrument.
      ...(isSouq() ? [el("p", { class: "lm-hint", text: remedy().terms })] : []),
      choiceButton("Walk into the office", "Run 1 of 3", () => showRun()),
    );
  }

  function showRun(): void {
    const run = currentRun(state);
    clear(stage);
    renderChrome(run.anchor);
    deps.say("collector", DESK_OPENERS[run.run] ?? DESK_OPENERS[0]!);
    // The desk remembers: if you named a floor last sitting, it names it
    // back at you — your number, before their number arrives. Copy only;
    // the sim never sees this line.
    // No statute on the negotiation screen (recovery plan §4): the anchor is
    // the only number the desk puts on the table. The prospect reveals in the
    // debrief — that is what makes "the facts never moved" land.
    const prevFloor = run.run > 0 ? state.runs[(run.run - 1) as 0 | 1]?.floor ?? null : null;
    stage.append(
      el("h3", { text: `Run ${run.run + 1} of 3` }),
      ...(prevFloor !== null ? [el("p", {
        class: "lm-line desk",
        text: `Back. Last time your floor was ${gbp(prevFloor)} — set before their number arrived. Set it again: yours, not theirs.`,
      })] : []),
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
    // The till IS the number on the table — the player's floor is set against
    // it, so its movement is the anchor doing its work, made visible.
    renderChrome(latest);
    stage.append(
      el("h3", { text: `Run ${run.run + 1}: on the table` }),
      el("p", { class: "lm-cash", text: gbp(latest) }),
      ...(run.counters.length > 0 ? [el("p", { class: "lm-line desk", text: "The desk slides a new number across. No comment." })] : []),
      // The trail: every number the desk has put down this sitting, in order.
      // Only THEIR numbers — the prospect stays hidden until the debrief — so
      // the player can watch the anchor climb while playing, instead of only
      // meeting it as a chart afterwards. The floor is a decision aid, not a
      // rule: accepting under it is allowed, and said out loud.
      ...(run.counters.length > 0 ? [trailRow(run.anchor, run.counters)] : []),
      el("p", { class: "lm-hint", text: `Your floor: ${run.floor === null ? "not set" : gbp(run.floor)}` }),
    );
    if (!canCounter) stage.append(el("p", { class: "lm-hint", text: "The desk spreads its hands. It will not move further." }));
    const underFloor = run.floor !== null && latest < run.floor;
    stage.append(
      el("div", { class: "lm-choices" },
        choiceButton("Accept " + gbp(latest), underFloor
          ? `Under your floor of ${gbp(run.floor!)} — clears at their number anyway`
          : "The invoice clears at their number", () => {
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

  /** The desk's numbers this sitting, as a trail (their opening first). */
  function trailRow(anchor: number, counters: number[]): HTMLElement {
    const row = el("div", { class: "lm-trail", "aria-label": "The desk's numbers this sitting" });
    const all = [anchor, ...counters];
    all.forEach((n, i) => {
      if (i > 0) row.append(el("span", { class: "lm-trail-sep", "aria-hidden": "true", text: "→" }));
      row.append(el("span", {
        class: `lm-trail-num${i === all.length - 1 ? " lm-trail-now" : ""}`,
        text: gbp(n),
      }));
    });
    return row;
  }

  function snapshot(r: ReturnType<typeof currentRun>) {
    return { run: r.run as 0 | 1 | 2, anchor: r.anchor, floor: r.floor, counters: [...r.counters], settled: r.settled, walked: r.walked };
  }

  function nextRun(): void {
    if (state.run === 2) return collectorIntl();
    // The Factor passes mid-week — one figure, one line, one decision.
    // Pure flavour + ledger colour: it must not touch run 2's anchor or floor.
    if (state.run === 0) return factorTeaser();
    state.run = (state.run + 1) as 1 | 2;
    showRun();
  }

  /** The Factor's teaser — he comes back properly at the market close (Ch.3).
   *  Ledger rules (TRACK_A_SPEC A1/A3): experimentId carries NO chapter
   *  prefix (every axis filter keys on ch1_/ch2_/ch3_), npc set but NEVER
   *  feePaid — a flavour offer must not enter the Cost-of-Not-Acting tally. */
  function factorTeaser(): void {
    clear(stage);
    renderChrome(CH2_INVOICE);
    const teaser = Math.round(CH2_INVOICE * 0.4); // fictional taste of his real offer
    const figWrap = el("div", { class: "lm-beat-fig", "aria-hidden": "true" }, stallFigure("factor"));
    deps.say("factor", "You look like someone who'd rather have it today.");
    stage.append(
      el("h3", { text: "The Factor — polished otter" }),
      figWrap,
      el("div", { class: "lm-surface lm-factor" },
        el("p", { class: "lm-factor-today", text: `${gbp(teaser)} today` }),
        el("p", { class: "lm-hint", text: "a taste of his real offer — fictional · indicative" }),
      ),
      el("div", { class: "lm-choices" },
        choiceButton(`Take it — ${gbp(teaser)}`, "Cash today; he's already gone", () => {
          deps.record({
            chapter: 2,
            day: 23,
            experimentId: "factor_teaser",
            prompt: "The Factor stops by mid-week with a teaser offer.",
            optionsShown: [
              { id: "take", label: `Take it — ${money(teaser)}`, framingVariable: "factor_teaser_take", isDefault: false },
              { id: "wave_off", label: "Wave him off", framingVariable: "factor_teaser_decline", isDefault: true },
            ],
            chosenOptionId: "take",
            deferred: false,
            npc: { npc: "The Factor", decision: "accept" },
            immediateConsequence: "Taken — cash today, the customer gone. He'll be back at the close with the real number.",
          });
          state.run = 1;
          showRun();
        }),
        choiceButton("Wave him off", "Keep the debt — he tips his hat and leaves", () => {
          deps.record({
            chapter: 2,
            day: 23,
            experimentId: "factor_teaser",
            prompt: "The Factor stops by mid-week with a teaser offer.",
            optionsShown: [
              { id: "take", label: `Take it — ${money(teaser)}`, framingVariable: "factor_teaser_take", isDefault: false },
              { id: "wave_off", label: "Wave him off", framingVariable: "factor_teaser_decline", isDefault: true },
            ],
            chosenOptionId: "wave_off",
            deferred: false,
            npc: { npc: "The Factor", decision: "decline" },
            immediateConsequence: "Waved off. The debt stays yours — and so does the customer.",
          });
          state.run = 1;
          showRun();
        }),
      ),
    );
  }

  function collectorIntl(): void {
    const probe = collectorProbe();
    clear(stage);
    // The Collector's number on the table — his buy price, not the claim.
    renderChrome(probe.buyPrice);
    renderLedger(chrome.ledger, [
      { client: CH2_CLIENT, amount: CH2_INVOICE, status: `${CH2_DAYS_LATE} days late · the Collector wants to buy it`, tone: "overdue" },
    ]);
    deps.say("zana", "Collector at the end of the row. Careful — he buys the customer with the debt.");
    // The Ch.3 scene treatment: figure above the card, one dominant number —
    // his buy price in ledger-green, because buying your debt IS relief
    // dressed as a trap (same staging as the Factor's beat).
    const figWrap = el("div", { class: "lm-beat-fig", "aria-hidden": "true" }, stallFigure("collector"));
    stage.append(
      el("h3", { text: "The Collector — vulture in pinstripes" }),
      figWrap,
      el("div", { class: "lm-surface lm-collector" },
        el("p", { class: "lm-collector-today", text: `${gbp(probe.buyPrice)} today` }),
        el("p", { class: "lm-hint", text: probe.copy }),
        el("p", { class: "lm-hint", text: "Fictional · typical UK recovery commission range shown elsewhere as 5–15% · indicative" }),
      ),
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
    // The debrief reveals the true number — put it on the till, not just in
    // the prose (the place is the point; the fact that sat still is now shown).
    renderTill(chrome.till, { value: ch2Prospect().total, caption: "What it is actually worth", decimals: 0 });
    renderLedger(chrome.ledger, [
      { client: CH2_CLIENT, amount: CH2_INVOICE, status: `${CH2_DAYS_LATE} days late · worth ${gbp(ch2Prospect().total)} to you`, tone: "chased" },
    ]);
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
            ? `The prospect sat still at ${gbp(ch2Prospect().total)} — every run, same law, same invoice, same 60 days. Your floor moved ${money(Math.round(move))} across runs. When a number moves your bottom line without touching the facts, that number is not information. It is machinery — anchoring, and its fair face, the ultimatum game.`
            : `The prospect sat still at ${gbp(ch2Prospect().total)} — every run, same law, same invoice, same 60 days. A floor you never set cannot be moved by an anchor. Set yours before the desk sets the frame.` }),
          el("p", { class: "lm-hint", text: `Their ${gbp(1050)} opening is not generous. It is an order of battle.` }),
          // Souq market: walking leaves the invoice on the books, and books
          // carry zakat before they carry cash. Practice, hedged — schools
          // differ on doubtful debts, so this is "commonly", not "always".
          ...(isSouq() && state.runs.some((r) => r.walked) && zakatNote(CH2_INVOICE)
            ? [el("p", { class: "lm-hint lm-zakat", text: `You walked at least once, so the invoice is still yours. ${zakatNote(CH2_INVOICE)!}` })]
            : []),
          choiceButton("Continue", "", next),
        );
      },
      () => {
        deps.say("zana", isSouq()
          ? "Flip it. Open with your own terms, not with their number."
          : "Flip it. Open with the law, not with their number.");
        stage.append(
          el("h3", { text: isSouq() ? "The flip: quote your terms first" : "The flip: quote the Act first" }),
          el("div", { class: "lm-surface" },
            el("h4", { text: "In writing · dated · no payment promise" }),
            el("p", { class: "lm-line zana", text: `"Invoice ${gbp(CH2_INVOICE)}, 60 days late. ${remedy().quote(CH2_INVOICE, CH2_DAYS_LATE)} Settle the account total of ${gbp(ch2Prospect().total)}."` }),
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
