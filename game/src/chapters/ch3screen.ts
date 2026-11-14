/**
 * Chapter 3 screen driver — the sunk frame first, the prospective panel
 * unlocked by the debrief ("decide at zero"). Street offers interleave.
 */
import { el, clear, choiceButton } from "../ui/dom";
import {
  CH3_CLIENT,
  CH3_INVOICE,
  CH3_DAYS_LATE,
  SUNK_RECORD,
  ch3Prospect,
  createCh3State,
  act,
  ch3LedgerEntry,
  streetOffers,
  streetLedgerEntry,
  Ch3State,
} from "./ch3";
import { renderTill, renderLedger, makeStallChrome } from "../ui/stall";
import type { LedgerEntry } from "../engine/ledger";
import { money, isSouq, SOUQ_VO } from "../engine/market";
import type { Speaker } from "../audio/voice";

export interface Ch3Deps {
  root: HTMLElement;
  record: (e: Omit<LedgerEntry, "id">) => void;
  say: (speaker: Speaker, text: string) => void;
  onTool?: (tool: "decide_at_zero") => void;
}

/** The silence gets louder each round (Zana, baked for rounds 2–3). */
const ROUND_SILENCE = [
  "Still no reply. The line of credit is £60 open on the shelf, and doing nothing has to travel somewhere.",
  "Still silence. The shelf keeps score.",
  "Third knock, nothing. Decide what the silence is worth.",
];

const gbp = (v: number) => money(v, 0);

export function runChapter3(deps: Ch3Deps): void {
  const state: Ch3State = createCh3State();
  const { root } = deps;
  clear(root);
  // The stall chrome PERSISTS through every beat (the place doesn't clear to
  // a bare form — third-pass charge): the till shows the Mareline claim, the
  // ledger the account card. Only the stage below changes between beats.
  const chrome = makeStallChrome();
  const stage = el("div", { class: "lm-stage" });
  root.append(chrome.till, chrome.ledger, stage);

  /** Till = the claim on the shelf; ledger = the account card. */
  function renderChrome(value = CH3_INVOICE, status = `${CH3_DAYS_LATE} days late`): void {
    renderTill(chrome.till, { value, caption: "Mareline's account", decimals: 0, note: `− ${gbp(CH3_INVOICE)} still owed (${status})` });
    renderLedger(chrome.ledger, [
      { client: CH3_CLIENT, amount: CH3_INVOICE, status, tone: "overdue" },
    ]);
  }

  intro();

  function intro(): void {
    deps.say("zana", isSouq() ? SOUQ_VO.ch3Intro : "Mareline. Three years a customer, sixty days late, four times a year. Now silence.");
    renderChrome();
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
    renderChrome();
    const p = ch3Prospect();
    // The silence speaks once per round (voiced overhead bubble, baked) — the
    // stage below stays a decision, not a transcript.
    deps.say(n === 1 ? "siki" : "zana", ROUND_SILENCE[n - 1]!);
    stage.append(
      el("h3", { text: `Round ${n} of 3 — ${CH3_CLIENT}` }),
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

  /** Street scenes, played in turn: the Factor steps up, then the Shark
   *  (GDD A4). Each beat is one character, one number, one decision — never
   *  a menu of offers. Ledger semantics unchanged: one entry per
   *  stallholder, same rows as the old combined beat. */
  function street(): void {
    deps.say("zana", "Word travels. Two offers found your door already.");
    factorBeat();
  }

  function factorBeat(): void {
    const o = streetOffers();
    clear(stage);
    // The street's number is on the table now — the Factor's buy price.
    renderTill(chrome.till, { value: o.factor.buyPrice, caption: "On the table", decimals: 0, note: `− ${gbp(CH3_INVOICE - o.factor.buyPrice)} the street keeps` });
    renderLedger(chrome.ledger, [
      { client: CH3_CLIENT, amount: CH3_INVOICE, status: `${CH3_DAYS_LATE} days late · the street wants to buy it`, tone: "dead" },
    ]);
    // Static bark (baked, voiced); the number itself stays dynamic text.
    deps.say("factor", "No waiting. Today’s money, today — that is the whole of my offer.");
    // No honest-maths numbers on the offer cards (recovery plan §4): the
    // trap is what the player FEELS in play. The true costs surface in the
    // debrief, and again on the street's own ledger in the finale.
    // Rhyme with the Shark's close: one card, one number. The Factor's is
    // money TODAY, so it lands in ledger-green — the trap dressed as relief.
    stage.append(
      el("h3", { text: "The Factor — polished otter" }),
      el("div", { class: "lm-surface lm-factor" },
        el("p", { class: "lm-factor-today", text: `${gbp(o.factor.buyPrice)} today` }),
        el("p", { class: "lm-hint", text: "the rest of the invoice is theirs · fictional · indicative" }),
      ),
      el("div", { class: "lm-choices" },
        choiceButton(`Take the Factor's money — ${gbp(o.factor.buyPrice)}`, "Cleared today", () => {
          const fee = CH3_INVOICE - streetOffers().factor.buyPrice;
          deps.record(streetLedgerEntry("The Factor", fee, true));
          sharkBeat();
        }),
        choiceButton("Turn him down", "Keep the debt — someone else is already smiling", () => {
          deps.record(streetLedgerEntry("The Factor", 0, false));
          sharkBeat();
        }),
      ),
    );
  }

  function sharkBeat(): void {
    const o = streetOffers();
    clear(stage);
    renderTill(chrome.till, { value: o.shark.cashNow, caption: "On the table", decimals: 0, note: `then £${o.shark.daily} a day` });
    deps.say("shark", "A little now. A little each day. The daily number is small — that is rather the point.");
    // The close is a full-screen beat: the street goes quiet, one card, one
    // number. The daily figure is the whole trap, so it gets the whole card.
    stage.append(
      el("h3", { text: "The Shark — smiling fish" }),
      el("div", { class: "lm-surface lm-shark" },
        el("p", { class: "lm-shark-now", text: `${gbp(o.shark.cashNow)} now` }),
        el("p", { class: "lm-shark-daily", text: `then just £${o.shark.daily} a day` }),
        el("p", { class: "lm-hint", text: "fictional · indicative" }),
      ),
      el("div", { class: "lm-choices" },
        choiceButton(`Take the Shark's money — ${gbp(o.shark.cashNow)}`, `Today yes, then £${o.shark.daily} a day`, () => {
          const o2 = streetOffers();
          // Their true take: termDays × daily − cashNow (the rest is still owed).
          const fee = Math.max(0, Math.round(o2.shark.termDays * o2.shark.daily - o2.shark.cashNow));
          deps.record(streetLedgerEntry("The Shark", fee, true));
          debrief();
        }),
        choiceButton("Decline", "Keep the debt, keep the ladder", () => {
          deps.record(streetLedgerEntry("The Shark", 0, false));
          debrief();
        }),
      ),
    );
  }

  function debrief(): void {
    const invested = state.rounds.reduce((s, r) => s + r.costPaid, 0);
    const p = ch3Prospect();
    // The debrief's reveal: the account judged like a fresh one. The till now
    // shows the PROSPECTIVE view — invoice + entitlement — not the sunk frame.
    renderTill(chrome.till, { value: p.total, caption: "Decide at zero", decimals: 0, note: `${gbp(CH3_INVOICE)} invoice + ${gbp(p.total - CH3_INVOICE)} entitlement` });
    renderLedger(chrome.ledger, [
      { client: CH3_CLIENT, amount: CH3_INVOICE, status: `60 days late · worth ${gbp(p.total)} judged at zero`, tone: "chased" },
    ]);
    let beat = 0;
    const frames: (() => void)[] = [
      () => {
        deps.say("siki", "Look at what you paid while nobody answered.");
        stage.append(
          el("h3", { text: "What you put in, and what is left" }),
          el("p", { class: "lm-take", text: gbp(invested) }),
          el("p", { class: "lm-hint", text: `Put in while nobody answered. Judged at zero, the account is ${gbp(p.total)}.` }),
          choiceButton("Continue", "", next),
        );
      },
      () => {
        deps.say("siki", "History is a fact. It is not a reason.");
        stage.append(
          el("h3", { text: "Sunk cost" }),
          el("p", { class: "lm-line siki", text: "History is a fact. It is not a reason. Decide at zero: the prospect pays for the next chase, or it doesn't." }),
          choiceButton("To the finale", "Chapter 3 complete", () => deps.onTool?.("decide_at_zero")),
        );
      },
    ];
    function next(): void { beat += 1; clear(stage); frames[Math.min(beat, frames.length - 1)]?.(); }
    clear(stage);
    frames[0]!();
  }
}
