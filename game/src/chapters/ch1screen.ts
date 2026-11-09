/**
 * Chapter 1 screen driver — the day loop, the lantern, the 4-beat debrief.
 * Speaks only to the pure simulator (ch1.ts), the DecisionLedger, and DOM.
 * Voice lines declare intent via `say()` so the audio manifest (Friday) can
 * bind real files without touching this code.
 */
import { el, clear, choiceButton } from "../ui/dom";
import {
  CH1_DAYS,
  ENGINEERED_PAIR,
  createCh1State,
  dayChoices,
  resolveDay,
  counterfactualForgone,
  type Ch1State,
  type DayEffect,
} from "./ch1";
import type { LedgerEntry } from "../engine/ledger";

export interface Ch1Deps {
  root: HTMLElement;
  /** Persistent ledger — owned above (one spine across chapters). */
  record: (e: Omit<LedgerEntry, "id">) => void;
  /** All ch1 pair entries so far (for the debrief replay). */
  pairEntries: () => LedgerEntry[];
  /** Audio bus marker — muted-safe; lines render as text regardless. */
  say: (speaker: "siki" | "zana", text: string) => void;
  /** Persist run state (localStorage; cleared on demand — privacy rails). */
  save: (state: Ch1State) => void;
  /** Fired when the chapter closes (main.ts chains to Chapter 2). */
  onTool?: (tool: "reminder_rule") => void;
}

const gbp = (v: number) => `£${v.toFixed(2)}`;

export function runChapter1(deps: Ch1Deps, seed: number, saved: Ch1State | null = null): void {
  // rng is only consumed at creation (arrival jitter); a saved mid-run state
  // resumes cleanly without it.
  const state = saved ?? createCh1State(seed).state;
  const root = deps.root;
  clear(root);

  const lantern = el("div", { class: "lm-lantern", "aria-live": "polite", text: "" });
  const stage = el("div", { class: "lm-stage" });
  root.append(lantern, stage);

  sikiIntro();

  function sikiIntro(): void {
    const resuming = saved !== null && saved.day > 1;
    deps.say("siki", resuming
      ? `The shutters were left open. Day ${state.day} of ${CH1_DAYS} — the books remember where you stopped.`
      : "Day one. The books are open. Money is owed to you. Some of it has been owed a while.");
    clear(stage);
    stage.append(
      el("p", { class: "lm-line siki", text: resuming
        ? "Same seed. Same invoices. Pick up where the lantern left off."
        : "Money owed to you is not abstract. It has a price, and the price moves every day you wait — though nobody will ever hand you that bill." }),
      el("p", { class: "lm-hint", text: resuming
        ? `Day ${state.day} of ${CH1_DAYS}. The queue hasn't moved while you were away.`
        : `Twenty trading days. ${CH1_DAYS} days. Do the work in front of you — or the work you keep meaning to do.` }),
      choiceButton(resuming ? "Back to the counter" : "Open the shutters", resuming ? `Resume at Day ${state.day}` : "Begin Day 1", () => showDay()),
    );
    persist();
  }

  function persist(): void {
    deps.save(state);
  }

  function showDay(): void {
    if (state.day > CH1_DAYS) return debrief();
    const day = state.day;
    const choices = dayChoices(state, day);
    clear(stage);
    stage.append(el("h3", { text: `Day ${day}` }));
    if (choices.length === 0) {
      // Nothing chasable, no Zana available — a rest day closes itself.
      finishDay({ day, cashDelta: 0, lanternDelta: 0, lines: ["A quiet day. The street hums."], });
      return;
    }
    stage.append(
      el("p", { class: "lm-hint", text: "What does today get?" }),
      el("div", { class: "lm-choices" }, ...choices.map((c) => choiceButton(c.label, c.detail, () => pick(c.id)))),
    );
  }

  function pick(choiceId: string): void {
    // Anti double-fire handled in choiceButton; guard anyway for keyboard.
    if (state.done || state.day > CH1_DAYS) return;
    const { effects, engineeredEntry } = resolveDay(state, state.day, choiceId);
    if (engineeredEntry) deps.record(engineeredEntry);
    finishDay(effects);
  }

  function finishDay(effects: DayEffect): void {
    clear(stage);
    persist();
    const lanternNow = state.forgoneInterest + state.forgoneCompensation;
    lantern.textContent = lanternNow > 0 ? `· ${gbp(lanternNow)} ·` : "";
    const list = el("ul", { class: "lm-day-log" });
    for (const l of effects.lines) list.append(el("li", { text: l }));
    stage.append(
      el("h3", { text: `Day ${effects.day} closed` }),
      el("p", { class: "lm-cash lm-money-in", text: gbprN(effects.cashDelta) }),
      list,
      choiceButton("Next day", "", () => showDay()),
    );
  }

  function gbprN(v: number): string {
    return v === 0 ? "Nothing moved." : `+ ${gbp(v)} in walk-in trade.`;
  }

  // ── Debrief: 4 beats on the player's OWN pair data (A2), then the rule. ──
  function debrief(): void {
    clear(stage);
    const entries = deps.pairEntries();
    const deferred = entries.filter((e) => e.deferred);
    const postponedCount = deferred.length;
    const cf = counterfactualForgone(seed);
    const actualForgone = state.forgoneInterest + state.forgoneCompensation;
    const rule = "“When an invoice falls due, it is chased the same day.”";

    const frames: (() => void)[] = [
      // Beat 1 — replay the player's own paired decisions.
      () => {
        deps.say("siki", "Let's look at what you did with that pair. Not what a textbook would do. What you did.");
        stage.append(
          el("h3", { text: "Your pair, side by side" }),
          el("div", { class: "lm-surface" },
            ...entries.map((e) => el("p", { text: `Day ${e.day}: ${e.prompt} → ${e.chosenOptionId === "fun_now" ? "the easy work" : e.chosenOptionId === "chase_now" ? "chased" : "deferred"}. ${e.immediateConsequence}` })),
          ),
          choiceButton("Continue", "", next),
        );
      },
      // Beat 2 — name the timing exploit (on their data).
      () => {
        const deferredDays = deferred.map((e) => `Day ${e.day}`).join(" and ");
        deps.say("siki", `${postponedCount === 0
          ? "You chased both times. Good. But notice how the same choice felt different when both ends sat further out."
          : `${postponedCount} of the two was deferred (${deferredDays}) — the frame, not the facts, did the work.`}`);
        stage.append(
          el("h3", { text: "The framing did the work" }),
          el("p", { class: "lm-line siki", text: "Both offers were the same choice. The only engineered variable was WHEN the consequence sits. Costs near today feel huge; costs far away feel like rounding. That tilt is called present bias — hyperbolic discounting. It is not a character flaw. It is arithmetic that your gut does badly." }),
          choiceButton("Continue", "", next),
        );
      },
      // Beat 3 — acknowledge deferral-as-cashflow-realism (no shame frame).
      () => {
        deps.say("siki", "Deferral is not always a trap.");
        stage.append(
          el("h3", { text: "Sometimes tomorrow is right" }),
          el("p", { class: "lm-line siki", text: "Some months there simply is not enough, and pushing a chase a day is survival, not failure. The trick is knowing which tomorrow is a choice — and which ones the street is quietly charging you for." }),
          el("p", { class: "lm-cash lm-money-out", text: `Forgone statutory entitlement this run: ${gbp(actualForgone)} (assumptions sheet: 8% over Bank of England base, plus £40–£100 per invoice — Late Payment Act 1998, simplified, UK)` }),
          choiceButton("Continue", "", next),
        );
      },
      // Beat 4 — the reminder rule + counterfactual replay.
      () => {
        deps.say("zana", "Here's the rule. Say it until it's boring.");
        stage.append(
          el("h3", { text: "The rule that closes the gap" }),
          el("p", { class: "lm-line zana", text: rule }),
          el("div", { class: "lm-surface" },
            el("h4", { text: "Replay: the rule armed from the start" }),
            el("p", { text: `Forgone statutory entitlement — your run: ${gbp(actualForgone)} · with the rule: ${gbp(cf.interest + cf.compensation)}` }),
            el("p", { class: "lm-hint", text: "Same seed. Same invoices. One different default. Improvement is the design: the rule is a commitment device, not discipline." }),
          ),
          el("p", { class: "lm-hint", text: "From Day 14 you can enlist Zana so stage-1 reminders auto-chain — the rule keeps itself. Chapters ahead carry this with you." }),
          choiceButton("Close the books", "Chapter 1 complete", () => deps.onTool?.("reminder_rule")),
        );
      },
    ];
    let i = 0;
    function next(): void {
      clear(stage);
      i += 1;
      if (i < frames.length) frames[i]!();
    }
    frames[0]!();
  }
}

// hint: the shared pair id lives here so the ledger + profile can agree.
export const CH1_PAIR = ENGINEERED_PAIR.experimentId;
