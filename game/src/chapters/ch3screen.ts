/**
 * Chapter 3 screen driver — the sunk frame first, the prospective panel
 * unlocked by the debrief ("decide at zero"). Street offers interleave.
 */
import { el, clear, choiceButton } from "../ui/dom";
import { speakerPara } from "../ui/characters";
import { councilGrid } from "../ui/council";
import { streetFocus } from "../ui/street";
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
  sharkFlipTerms,
  haggleOutcome,
  haggledBuyPrice,
  sharkBloodPrice,
  Ch3State,
} from "./ch3";
import { renderTill, renderLedger, makeStallChrome } from "../ui/stall";
import { profileCard } from "../ui/profileCard";
import type { LedgerEntry } from "../engine/ledger";
import { money, isSouq, SOUQ_VO } from "../engine/market";
import { PROLOGUE_EXPERIMENT_ID } from "./ch1screen";
import type { Speaker } from "../audio/voice";

export interface Ch3Deps {
  root: HTMLElement;
  record: (e: Omit<LedgerEntry, "id">) => void;
  /** Full ledger, read-only: the street remembers the prologue + teaser. */
  entries?: () => readonly LedgerEntry[];
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

/** A visible moment of chance: the disc turns through its faces, then the
 *  caller reveals the landing. Display-only suspense — the sim prices both
 *  landings up front, so the animation can never move money. Reduced-motion
 *  gets the landing with no spin. */
function fateRoll(faces: string[], ms: number, done: (face: string) => void): HTMLElement {
  const disc = el("div", { class: "lm-fate", "aria-hidden": "true", text: faces[0]! });
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const land = (): void => done(faces[Math.floor(Math.random() * faces.length)]!);
  if (still || faces.length < 2) { window.setTimeout(land, 0); return disc; }
  let i = 0;
  const tick = window.setInterval(() => { i = (i + 1) % faces.length; disc.textContent = faces[i]!; }, 90);
  window.setTimeout(() => { window.clearInterval(tick); land(); }, ms);
  return disc;
}

export function runChapter3(deps: Ch3Deps): void {
  streetFocus("full"); // the street's offers are the subject again
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
    // Sublabels teach on round 1; rounds 2–3 repeat the same three doors, so
    // the labels stand alone (the cost figure is identical every round).
    const taught = state.cursor === 0;
    stage.append(
      el("h3", { text: `Round ${n} of 3 — ${CH3_CLIENT}` }),
      el("div", { class: "lm-choices" },
        choiceButton("Keep the line going", taught ? `Quiet cost this round: £${p.perRoundCost} of your time` : "", () => step("continue")),
        choiceButton("Escalate — discount + call", taught ? "£60 and a phone call you don't want to make" : "", () => step("escalate")),
        choiceButton("Stop work on this account", taught ? "Close the account; keep the door open" : "", () => step("walk")),
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

  /** What the street remembers about this player (UK path only — copy, never sim). */
  function streetMemory(): { factorHint: string | null; sharkHint: string | null } {
    if (isSouq()) return { factorHint: null, sharkHint: null };
    const all = deps.entries?.() ?? [];
    const teaser = all.find((e) => e.experimentId === "factor_teaser");
    const prologue = all.find((e) => e.experimentId === PROLOGUE_EXPERIMENT_ID);
    return {
      factorHint: teaser?.chosenOptionId === "take"
        ? "You paid him for impatience once already this week. He knows."
        : teaser?.chosenOptionId === "wave_off"
          ? "You waved him off mid-week. He kept the smile. The number didn't move."
          : null,
      sharkHint: !prologue ? null : (prologue.chosenOptionId ?? "").endsWith("take_70")
        ? "He remembers the old debt. Act like it."
        : prologue.chosenOptionId === "counter_then_refuse"
          ? "You tried his patience twice and walked. He remembers that best of all."
          : "You left his money on the table once. He remembers that too.",
    };
  }

  function factorBeat(): void {
    const o = streetOffers();
    clear(stage);
    /** One counter only: the die decides, the door remembers. A nod clears
     *  today at +8%; a walk shuts the Factor's door and the Shark smells
     *  blood (his advance shrinks). The button is gone once pushed. */
    function pushHim(): void {
      const row = stage.querySelector(".lm-choices");
      if (!(row instanceof HTMLElement)) return;
      clear(row);
      row.append(
        el("p", { class: "lm-hint", text: "The die is on the table — one throw, no appeals." }),
        fateRoll(["1", "2", "3", "4", "5", "6"], 1100, (face) => {
          const haggled: Omit<LedgerEntry, "id"> = {
            ...streetLedgerEntry("The Factor", 0, false),
            optionsShown: [...streetLedgerEntry("The Factor", 0, false).optionsShown,
              { id: "haggle", label: "Push him — one counter", framingVariable: "street_factor_haggle", isDefault: false }],
          };
          if (haggleOutcome(Number(face)) === "nod") {
            const price = haggledBuyPrice(streetOffers().factor.buyPrice);
            state.factorHaggle = "nod";
            deps.record({
              ...haggled,
              npc: { npc: "The Factor", decision: "accept", feePaid: CH3_INVOICE - price },
              chosenOptionId: "accept",
              immediateConsequence: `Pushed once and he nodded — cleared today at ${gbp(price)}.`,
            });
            clear(stage);
            stage.append(
              speakerPara("factor", "Bold. Lucky. Paid — never push twice."),
              el("p", { class: "lm-take", text: `${gbp(price)} today` }),
              el("div", { class: "lm-choices" }, choiceButton("Continue", "", () => sharkBeat())),
            );
          } else {
            state.factorHaggle = "walk";
            deps.record({
              ...haggled,
              chosenOptionId: "decline",
              immediateConsequence: "Pushed once and he walked. The Factor's door is shut; the Shark smells blood.",
            });
            clear(stage);
            stage.append(
              speakerPara("factor", "He keeps the smile and shuts his door. The fish is still smiling — try him."),
              el("div", { class: "lm-choices" }, choiceButton("Continue", "", () => sharkBeat())),
            );
          }
        }),
      );
    }
    // The street's number is on the table now — the Factor's buy price.
    renderTill(chrome.till, { value: o.factor.buyPrice, caption: "Their offer", decimals: 0, note: `− ${gbp(CH3_INVOICE - o.factor.buyPrice)} the street keeps · owed, not cash` });
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
      el("div", { class: "lm-beat-fig", "aria-hidden": "true" }, el("img", { class: "lm-beat-art", src: "assets/sprites/factor.png", alt: "" })),
      el("div", { class: "lm-surface lm-factor" },
        el("p", { class: "lm-factor-today", text: `${gbp(o.factor.buyPrice)} today` }),
        el("p", { class: "lm-hint", text: "the rest of the invoice is theirs" }),
        ...(streetMemory().factorHint ? [el("p", { class: "lm-hint", text: streetMemory().factorHint! })] : []),
      ),
      // The council flanks the offer (text only — the Factor's bark owns
      // the beat's voice). The street's own ledger reads back in the finale.
      !isSouq()
        ? councilGrid({
            siki: "Selling the invoice at a discount has a name — factoring. The lawful alternative was the interest you never claimed.",
            zana: "Take his money and the week's maths ends here. Turn him down and I keep the chase.",
          }, el("div", { class: "lm-choices" },
            choiceButton(`Take the Factor's money — ${gbp(o.factor.buyPrice)}`, "Cleared today", () => {
              const fee = CH3_INVOICE - streetOffers().factor.buyPrice;
              deps.record(streetLedgerEntry("The Factor", fee, true));
              sharkBeat();
            }),
            choiceButton("Turn him down", "Keep the debt — someone else is already smiling", () => {
              deps.record(streetLedgerEntry("The Factor", 0, false));
              sharkBeat();
            }),
            choiceButton("Push him — one counter", "Name a better price. He nods, or he walks.", () => pushHim()),
          ))
        : el("div", { class: "lm-choices" },
            choiceButton(`Take the Factor's money — ${gbp(o.factor.buyPrice)}`, "Cleared today", () => {
              const fee = CH3_INVOICE - streetOffers().factor.buyPrice;
              deps.record(streetLedgerEntry("The Factor", fee, true));
              sharkBeat();
            }),
            choiceButton("Turn him down", "Keep the debt — someone else is already smiling", () => {
              deps.record(streetLedgerEntry("The Factor", 0, false));
              sharkBeat();
            }),
            choiceButton("Push him — one counter", "Name a better price. He nods, or he walks.", () => pushHim()),
          ),
    );
  }

  function sharkBeat(): void {
    const o = streetOffers();
    clear(stage);
    // A walked-away Factor talks: the Shark smells blood and the advance
    // shrinks. The daily never moves — only the cash now does.
    const blooded = state.factorHaggle === "walk";
    const cashNow = blooded ? sharkBloodPrice(o.shark.cashNow) : o.shark.cashNow;
    renderTill(chrome.till, { value: cashNow, caption: "Their offer", decimals: 0, note: blooded ? `then £${o.shark.daily} a day · owed, not cash — less up front, the Factor talked` : `then £${o.shark.daily} a day · owed, not cash` });
    deps.say("shark", "A little now. A little each day. The daily number is small — that is rather the point.");
    /** Double-or-nothing on his own coin: heads doubles the cash now,
     *  tails leaves nothing now — the daily stands either way. The sim
     *  prices both landings up front; the spin is only suspense. */
    function flipCoin(): void {
      const row = stage.querySelector(".lm-choices");
      if (!(row instanceof HTMLElement)) return;
      clear(row);
      row.append(
        el("p", { class: "lm-hint", text: "The coin is in the air — his coin, his rules." }),
        fateRoll(["Heads", "Tails"], 1300, (face) => {
          const won = face === "Heads";
          const t = sharkFlipTerms(cashNow, o.shark.daily, o.shark.termDays);
          const fee = won ? t.winFee : t.loseFee;
          const base = streetLedgerEntry("The Shark", fee, true);
          deps.record({
            ...base,
            optionsShown: [...base.optionsShown,
              { id: "counter_flip", label: "Counter — double or nothing", framingVariable: "street_shark_counter", isDefault: false }],
            immediateConsequence: won
              ? `Called heads on his coin and it landed — twice the cash now at ${gbp(t.winCashNow)}. The daily stands.`
              : "Called heads on his coin and it didn't land — nothing now, and the daily still stands.",
          });
          clear(stage);
          stage.append(
            ...(won
              ? [speakerPara("shark", "Heads. He pays double and smiles wider — pride is also a tell."),
                el("p", { class: "lm-take", text: `${gbp(t.winCashNow)} now` })]
              : [speakerPara("shark", "Tails. Nothing now — the daily still stands. That smile was the whole offer.")]),
            el("div", { class: "lm-choices" }, choiceButton("Continue", "", () => debrief())),
          );
        }),
      );
    }
    // The close is a full-screen beat: the street goes quiet, one card, one
    // number. The daily figure is the whole trap, so it gets the whole card.
    stage.append(
      el("h3", { text: "The Shark — smiling fish" }),
      el("div", { class: "lm-beat-fig", "aria-hidden": "true" }, el("img", { class: "lm-beat-art", src: "assets/sprites/shark.png", alt: "" })),
      el("div", { class: "lm-surface lm-shark" },
        el("p", { class: "lm-shark-now", text: `${gbp(cashNow)} now` }),
        el("p", { class: "lm-shark-daily", text: `then just £${o.shark.daily} a day` }),
        el("p", { class: "lm-hint", text: "the daily number is the whole offer" }),
        ...(streetMemory().sharkHint ? [el("p", { class: "lm-hint", text: streetMemory().sharkHint! })] : []),
      ),
      !isSouq()
        ? councilGrid({
            siki: "The daily number is the whole offer. Small numbers hide in daylight — price the full term before you nod.",
            zana: "He's betting you won't multiply the daily by the days. Don't oblige him.",
          }, el("div", { class: "lm-choices" },
            choiceButton(`Take the Shark's money — ${gbp(cashNow)}`, `Today yes, then £${o.shark.daily} a day`, () => {
              // Their true take: termDays × daily − cashNow (the rest is still owed).
              const fee = Math.max(0, Math.round(o.shark.termDays * o.shark.daily - cashNow));
              deps.record(streetLedgerEntry("The Shark", fee, true));
              debrief();
            }),
            choiceButton("Decline", "Keep the debt, keep the ladder", () => {
              deps.record(streetLedgerEntry("The Shark", 0, false));
              debrief();
            }),
            choiceButton("Counter — double or nothing", "Heads: twice the cash now. Tails: nothing now — the daily still stands.", () => flipCoin()),
          ))
        : el("div", { class: "lm-choices" },
            choiceButton(`Take the Shark's money — ${gbp(cashNow)}`, `Today yes, then £${o.shark.daily} a day`, () => {
              const fee = Math.max(0, Math.round(o.shark.termDays * o.shark.daily - cashNow));
              deps.record(streetLedgerEntry("The Shark", fee, true));
              debrief();
            }),
            choiceButton("Decline", "Keep the debt, keep the ladder", () => {
              deps.record(streetLedgerEntry("The Shark", 0, false));
              debrief();
            }),
            choiceButton("Counter — double or nothing", "Heads: twice the cash now. Tails: nothing now — the daily still stands.", () => flipCoin()),
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
        // The deduction: the evidence (frame 0's total) is on screen, so ask
        // what it was FOR before the card names the bias. Display-only
        // verdicts — the voiced line above stays verbatim.
        const card = (): HTMLElement => profileCard({
          key: "sunkCost",
          value: state.rounds.length ? Math.round((state.rounds.filter((r) => r.action === "continue" || r.action === "escalate").length / state.rounds.length) * 100) : 0,
          line: `You put in ${gbp(invested)} across ${state.rounds.filter((r) => r.action).length} rounds. Judged at zero, the account is ${gbp(p.total)}. One run suggests; it doesn't prove.`,
          nameThat: "sunk cost — history priced as if it were prospect",
        }, "Chapter 3");
        const finish = (verdict: string | null): void => {
          clear(stage);
          stage.append(
            el("h3", { text: "Sunk cost" }),
            ...(verdict ? [speakerPara("siki", verdict)] : []),
            card(),
            choiceButton("To the finale", "Chapter 3 complete", () => deps.onTool?.("decide_at_zero")),
          );
        };
        stage.append(
          el("h3", { text: "Sunk cost" }),
          speakerPara("siki", "History is a fact. It is not a reason. Decide at zero: the prospect pays for the next chase, or it doesn't."),
        );
        // Nothing paid in, nothing to deduce from — keep today's straight path.
        if (invested <= 0) { finish(null); return; }
        stage.append(
          el("p", { class: "lm-hint", text: "She never answered. What were you paying for?" }),
          el("div", { class: "lm-choices" },
            choiceButton("A live customer", "", () => finish(`Four rounds, no answer — the rounds are the data. ${gbp(invested)} in while nobody answered; the account is ${gbp(p.total)} judged at zero.`)),
            choiceButton("The money already in", "", () => finish(`That's the one. ${gbp(invested)} in, the account worth ${gbp(p.total)} judged fresh — history, not prospect.`)),
          ),
        );
      },
    ];
    function next(): void { beat += 1; clear(stage); frames[Math.min(beat, frames.length - 1)]?.(); }
    clear(stage);
    frames[0]!();
  }
}
