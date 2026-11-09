/**
 * Chapter 3 screen driver — the sunk frame first, the prospective panel
 * unlocked by the debrief ("decide at zero"). Street offers interleave.
 */
import { el, clear, choiceButton } from "../ui/dom";
import {
  CH3_CLIENT,
  CH3_INVOICE,
  SUNK_RECORD,
  ch3Prospect,
  createCh3State,
  act,
  ch3LedgerEntry,
  streetOffers,
  streetLedgerEntry,
  assumptionsLine,
  Ch3State,
} from "./ch3";
import type { LedgerEntry } from "../engine/ledger";

export interface Ch3Deps {
  root: HTMLElement;
  record: (e: Omit<LedgerEntry, "id">) => void;
  say: (speaker: "siki" | "zana", text: string) => void;
  onTool?: (tool: "decide_at_zero") => void;
}

const gbp = (v: number) => `£${Math.round(v)}`;

export function runChapter3(deps: Ch3Deps): void {
  const state: Ch3State = createCh3State();
  const { root } = deps;
  clear(root);
  const stage = el("div", { class: "lm-stage" });
  root.append(stage);

  intro();

  function intro(): void {
    deps.say("zana", "Mareline. Three years a customer, sixty days late, four times a year. Now silence.");
    stage.append(
      el("h3", { text: "Chapter 3 · Good Money After Bad" }),
      el("div", { class: "lm-surface" },
        el("h4", { text: "What you already put in — the account's history" }),
        el("ul", { class: "lm-day-log" },
          el("li", { text: `${SUNK_RECORD.yearsClient} years of orders` }),
          el("li", { text: `${SUNK_RECORD.extensions} payment extensions granted` }),
          el("li", { text: `${gbp(SUNK_RECORD.goodwillDiscounts)} of goodwill discounts given` }),
          el("li", { text: `${SUNK_RECORD.chasesSent} chases already sent` }),
          el("li", { text: `~${gbp(SUNK_RECORD.relationshipOrderBook)}/yr of further work, hopeful` }),
        ),
      ),
      el("p", { class: "lm-hint", text: "Every number above is in the past. The decision below is not." }),
      choiceButton("Open the account", "Round 1 of 3", () => round()),
    );
  }

  function round(): void {
    if (state.cursor >= 3) return street();
    const n = state.cursor + 1;
    clear(stage);
    const p = ch3Prospect();
    stage.append(
      el("h3", { text: `Round ${n} of 3 — ${CH3_CLIENT}` }),
      el("p", { class: "lm-line siki", text: "Still no reply. The line of credit is £60 open on the shelf, and doing nothing has to travel somewhere." }),
      el("div", { class: "lm-choices" },
        choiceButton("Keep the line going", `Quiet cost this round: £${p.perRoundCost} of your time`, () => step("continue")),
        choiceButton("Escalate — discount + call", "£60 and a phone call you don't want to make", () => step("escalate")),
        choiceButton("Stop work on this account", "Close the account; keep the door open", () => step("walk")),
      ),
    );
  }

  function step(a: "continue" | "escalate" | "walk"): void {
    const idx = state.cursor as 0 | 1 | 2; // the round being acted on NOW
    act(state, a);
    deps.record(ch3LedgerEntry(state, state.rounds[idx]!));
    if (state.cursor === 3) street();
    else round();
  }

  /** Street scenes: The Factor then The Shark (GDD A4). */
  function street(): void {
    const o = streetOffers();
    clear(stage);
    deps.say("zana", "Word travels. Two offers found your door already.");
    stage.append(
      el("h3", { text: "The street has heard you are patient" }),
      el("div", { class: "lm-surface" },
        el("h4", { text: "The Factor — polished otter" }),
        el("p", { class: "lm-line", text: `"${gbp(o.factor.buyPrice)} today, no waiting."` }),
        el("p", { class: "lm-hint", text: `Fictional · their shave is ~${Math.round(o.factor.annualDiscountPct)}%/yr cost-of-impatience · indicative` }),
      ),
      el("div", { class: "lm-surface" },
        el("h4", { text: "The Shark — smiling fish" }),
        el("p", { class: "lm-line", text: `"${gbp(o.shark.cashNow)} now, pay back just £${o.shark.daily} a day."` }),
        el("p", { class: "lm-hint", text: `Fictional · the daily number is real, so is the annualised one: ${(o.shark.annualisedPct / 100).toFixed(1)}× per year · indicative` }),
      ),
      el("div", { class: "lm-choices" },
        choiceButton("Decline both", "Keep the debt, keep the ladder", () => {
          deps.record(streetLedgerEntry("The Factor", 0, false));
          deps.record(streetLedgerEntry("The Shark", 0, false));
          debrief();
        }),
        choiceButton(`Take the Factor's money — ${gbp(o.factor.buyPrice)}`, `Cleared today; £${CH3_INVOICE - o.factor.buyPrice} of it theirs`, () => {
          const fee = CH3_INVOICE - streetOffers().factor.buyPrice;
          deps.record(streetLedgerEntry("The Factor", fee, true));
          debrief();
        }),
        choiceButton(`Take the Shark's money — ${gbp(o.shark.cashNow)}`, `Today yes, then ${(o.shark.annualisedPct / 100).toFixed(1)}× per year, honest`, () => {
          const o2 = streetOffers();
          // Their true take: termDays × daily − cashNow (the rest is still owed).
          const fee = Math.max(0, Math.round(o2.shark.termDays * o2.shark.daily - o2.shark.cashNow));
          deps.record(streetLedgerEntry("The Shark", fee, true));
          debrief();
        }),
      ),
    );
  }

  function debrief(): void {
    const invested = state.rounds.reduce((s, r) => s + r.costPaid, 0);
    const p = ch3Prospect();
    let beat = 0;
    const frames: (() => void)[] = [
      () => {
        deps.say("siki", "Look at what you paid while nobody answered. Then look again — as if the account were brand new.");
        stage.append(
          el("h3", { text: "Your account has a past. The decision doesn't." }),
          el("div", { class: "lm-surface" },
            el("p", { text: `Put in this chapter: ${gbp(invested)} (rounds: ${state.rounds.map((r) => r.action ?? "—").join(" → ")})` }),
            el("p", { text: `Prospect, decide-at-zero view: ${gbp(p.total)} of invoice + statutory entitlement` }),
            el("p", { class: "lm-hint", text: assumptionsLine() }),
          ),
          choiceButton("Continue", "", next),
        );
      },
      () => {
        deps.say("siki", "History is a fact. It is not a reason.");
        stage.append(
          el("h3", { text: "Sunk cost, named" }),
          el("p", { class: "lm-line siki", text: "Every round you kept a silent account because of the three years behind it — the discounts, the extensions, the phone calls — is a round the street's arithmetic charged you twice. Continuing can be right. But it is right when the PROSPECT pays for it — always 60-late, interest-priced, silent — not when the history does. That is the panel you now carry: decide at zero." }),
          el("p", { class: "lm-hint", text: "Tool unlocked: DECIDE AT ZERO — old accounts get judged like fresh ones: prospects only." }),
          el("p", { class: "lm-hint", text: "And honestly: sometimes the only realistic prospect is a discount or a lawyer, and the fall you take is smaller than the one you fear. Support exists; ask early. (No provider will ever be named here.)" }),
          choiceButton("To the finale prep", "Chapter 3 complete", () => deps.onTool?.("decide_at_zero")),
        );
      },
    ];
    function next(): void { beat += 1; clear(stage); frames[Math.min(beat, frames.length - 1)]?.(); }
    clear(stage);
    frames[0]!();
  }
}
