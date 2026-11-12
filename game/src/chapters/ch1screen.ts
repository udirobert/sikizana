/**
 * Chapter 1 screen driver — the stall (recovery plan §2.1).
 *
 * One persistent screen, never cleared between days: the till (live cash),
 * the ledger strip (one card per open invoice, ageing daily), the street
 * (owned by main.ts, above this screen), and the day panel (narration,
 * choices, then the day's log + "Next day"). The debrief reuses the same
 * place: street first, then the player's own line items, then the name,
 * then the tool — the loss lands before the lecture.
 *
 * Spoken lines go through deps.say() (audio is optional; text always).
 * Rule: the spoken line is short; the card carries the content — never
 * both saying the same thing (recovery plan §2.3).
 */
import { el, clear, choiceButton } from "../ui/dom";
import {
  CH1_DAYS,
  createCh1State,
  dayChoices,
  resolveDay,
  deferralLines,
  invoiceAccrual,
  type Ch1State,
  type DayEffect,
} from "./ch1";
import type { LedgerEntry } from "../engine/ledger";
import { phrased } from "../i18n";

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
  /** Street-moving events that don't create ledger entries. */
  noteStreet: (ev: { deferral?: boolean; billSkipped?: boolean; collected?: number; lateFee?: number }) => void;
}

const gbp = (v: number) => `£${v.toFixed(2)}`;
const gbp0 = (v: number) => `£${Math.round(v)}`;

export function runChapter1(deps: Ch1Deps, seed: number, saved: Ch1State | null = null): void {
  const state = saved ?? createCh1State(seed).state;
  const root = deps.root;
  clear(root);

  const lantern = el("div", { class: "lm-lantern", "aria-live": "polite", text: "" });
  const till = el("div", { class: "lm-till", "aria-live": "polite" });
  const ledgerStrip = el("div", { class: "lm-ledger" });
  const dayPanel = el("div", { class: "lm-day" });
  root.append(lantern, till, ledgerStrip, dayPanel);

  /** Redraw till + ledger + lantern from state. The street is main's. */
  function renderChrome(pop = false): void {
    const t = document.createElement("div");
    t.className = "lm-till-num";
    t.textContent = gbp(state.cash);
    if (pop) t.classList.add("lm-pop");
    till.replaceChildren(el("span", { class: "lm-till-cap", text: "The till" }), t);
    till.classList.toggle("lm-till-neg", state.cash < 0);
    if (state.cash < 0) till.append(el("span", { class: "lm-till-warn", text: "▼ the till is in the red" }));

    clear(ledgerStrip);
    ledgerStrip.append(el("h4", { class: "lm-ledger-cap", text: "The ledger" }));
    const day = state.day;
    for (const inv of state.invoices) {
      if (inv.paidDay !== null && inv.paidDay <= day) continue; // collected — off the strip
      let status: string;
      if (inv.chasedDay !== null && inv.paidDay !== null) {
        status = inv.paidDay <= CH1_DAYS
          ? `pays in ${inv.paidDay - day} day${inv.paidDay - day === 1 ? "" : "s"}`
          : "pays after this week";
      } else if (inv.dueDay < day) {
        const a = invoiceAccrual(inv, day);
        status = `${day - inv.dueDay + 1} day${day - inv.dueDay + 1 === 1 ? "" : "s"} overdue · owed today ${gbp0(inv.principal + a.interest + a.compensation)}, still growing`;
      } else if (inv.dueDay === day) {
        status = "due today";
      } else {
        status = `due day ${inv.dueDay}`;
      }
      ledgerStrip.append(
        el("div", { class: `lm-inv-card${inv.chasedDay !== null ? " lm-inv-chased" : " lm-inv-overdue"}` },
          el("span", { class: "lm-inv-client", text: inv.client }),
          el("span", { class: "lm-inv-amt", text: gbp0(inv.principal) }),
          el("span", { class: "lm-inv-status", text: status }),
        ),
      );
    }
    // The supplier bill, while it is live.
    if (state.bill.paidDay === null && state.bill.skippedDay === null && day <= state.bill.dueDay) {
      ledgerStrip.append(
        el("div", { class: "lm-inv-card lm-inv-bill" },
          el("span", { class: "lm-inv-client", text: state.bill.client + " (your bill)" }),
          el("span", { class: "lm-inv-amt", text: gbp0(state.bill.amount) }),
          el("span", { class: "lm-inv-status", text: `pay day ${state.bill.dueDay}` }),
        ),
      );
    } else if (state.bill.skippedDay !== null && state.bill.paidDay === null) {
      ledgerStrip.append(
        el("div", { class: "lm-inv-card lm-inv-bill lm-inv-dead" },
          el("span", { class: "lm-inv-client", text: state.bill.client + " (your bill)" }),
          el("span", { class: "lm-inv-status", text: `unpaid — the street charges ${gbp0(state.bill.lateFee)}/day` }),
        ),
      );
    }

    const lanternNow = state.forgoneInterest + state.forgoneCompensation;
    lantern.textContent = lanternNow > 0 ? `· ${gbp(lanternNow)} ·` : "";
  }

  intro();

  function intro(): void {
    const resuming = saved !== null && saved.day > 1;
    deps.say("siki", resuming
      ? `The shutters were left open. Day ${state.day} of ${CH1_DAYS} — the books remember where you stopped.`
      : "Day one. The books are open. Money is owed to you. Some of it has been owed a while.");
    clear(dayPanel);
    dayPanel.append(
      el("h3", { text: `Day ${state.day} of ${CH1_DAYS}` }),
      el("p", { class: "lm-hint", text: resuming
        ? `Back at the counter. The books remember where you stopped.`
        : phrased({
            normal: "The stall is open. The till, the ledger, the street — everything you do this week is on this screen.",
            plain: "This is your stall. Your cash, your invoices, and the street outside are all on this screen.",
          }) }),
      choiceButton(resuming ? "Back to the counter" : "Open the shutters", resuming ? `Resume at Day ${state.day}` : "Begin Day 1", () => showDay()),
    );
    renderChrome();
    persist();
  }

  function persist(): void {
    deps.save(state);
  }

  function dayHint(day: number): string {
    switch (day) {
      case 1: return "The stall is open. What does today get?";
      case 2: return "The week keeps moving. So do the books.";
      case 3: return "Harborne's invoice is on the desk.";
      case 4: return `A bill is due today. The till is ${gbp(state.cash)}.`;
      case 5: return "The last day of the week. The books are waiting.";
      default: return "The week closes.";
    }
  }

  function showDay(): void {
    if (state.done) return debrief();
    const day = state.day;
    renderChrome();
    const choices = dayChoices(state, day);
    clear(dayPanel);
    dayPanel.append(
      el("h3", { text: `Day ${day} of ${CH1_DAYS}` }),
      el("p", { class: "lm-hint", text: dayHint(day) }),
      el("ul", { class: "lm-day-log" }),
      el("div", { class: "lm-choices" },
        ...choices.map((c) => choiceButton(c.label, c.detail, () => pick(c.id))),
      ),
    );
  }

  function pick(choiceId: string): void {
    if (state.done || state.day > CH1_DAYS) return;
    const { effects, engineeredEntry } = resolveDay(state, state.day, choiceId);
    if (engineeredEntry) deps.record(engineeredEntry);
    if (effects.lateFeeDelta > 0) deps.noteStreet({ lateFee: effects.lateFeeDelta });
    if (effects.streetNote === "deferral") deps.noteStreet({ deferral: true });
    if (effects.streetNote === "bill_skipped") deps.noteStreet({ billSkipped: true });
    if (effects.collected > 0) deps.noteStreet({ collected: effects.collected });
    finishDay(effects);
  }

  function finishDay(effects: DayEffect): void {
    clear(root); // re-render chrome with a pop on the till
    root.append(lantern, till, ledgerStrip, dayPanel);
    const day = effects.day;
    renderChrome(true);
    // Money actually landed in the till today (a chase cleared, or trade came
    // in): the till glows, not just the number.
    if (effects.cashDelta > 0) till.classList.add("lm-till-glow");

    clear(dayPanel);
    const log = el("ul", { class: "lm-day-log" });
    if (effects.cashDelta !== 0) {
      log.append(el("li", {
        class: effects.cashDelta > 0 ? "lm-money-in" : "lm-money-out",
        text: effects.cashDelta > 0
          ? `the till is up ${gbp(effects.cashDelta)}`
          : `the till is down ${gbp(-effects.cashDelta)}`,
      }));
    }
    for (const l of effects.lines) log.append(el("li", { text: l }));
    if (effects.lateFeeDelta > 0) {
      log.append(el("li", { class: "lm-latefee", text: `${gbp0(effects.lateFeeDelta)} to the street — late charge on the unpaid bill` }));
    }
    dayPanel.append(el("h3", { text: `Day ${day} closed` }), log);
    if (state.done) {
      dayPanel.append(
        el("div", { class: "lm-choices" },
          choiceButton("Close the books", state.endedEarly === "till_empty" ? "The till ran empty" : "The week is over", () => debrief()),
        ),
      );
    } else {
      dayPanel.append(el("div", { class: "lm-choices" }, choiceButton("Next day", "", () => showDay())));
    }
    persist();
  }

  // ── Debrief on the stall: street → replay → name → tool (plan §2.3). ──
  function debrief(): void {
    const entries = deps.pairEntries();
    const deferred = entries.filter((e) => e.deferred);
    const lines = deferralLines(state);
    const totalForgone = state.forgoneInterest + state.forgoneCompensation;

    // Beat 3's spoken line — exact match against the baked variants.
    const deferredDays = deferred.map((e) => `Day ${e.day}`).join(" and ");
    const spoken =
      deferred.length === 0
        ? "You chased both times. Good. But notice how the same choice felt different when both ends sat further out."
        : deferred.length === 1
          ? `1 of the two was deferred (${deferredDays}) — the frame, not the facts, did the work.`
          : `2 of the two was deferred (${deferredDays}) — the frame, not the facts, did the work.`;

    const frames: (() => void)[] = [
      // Beat 1 — the street as you built it. No names yet.
      () => {
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "First — what your week paid for" }),
          el("p", {
            class: "lm-line siki",
            text: state.lateFees > 0
              ? `The street took ${gbp(state.lateFees)} in late charges while your bill sat unpaid. That's the street's money, not your till's — but it lit up.`
              : "You paid the street nothing this week. Its stalls keep their base light anyway — the market runs on everyone's lateness, not just yours.",
          }),
          el("p", {
            class: "lm-hint",
            text: "Every deferral, every unpaid bill, every fee lit a stall. Every collection that landed closed one. Watch the street in the strip above.",
          }),
          choiceButton("Look at the books", "Your own pair, side by side", next),
        );
      },
      // Beat 2 — replay the player's own paired decisions + line items.
      () => {
        deps.say("siki", "Let's look at what you did with that pair. Not what a textbook would do. What you did.");
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "Your pair, side by side" }),
          el("div", { class: "lm-surface" },
            ...entries.map((e) =>
              el("p", {
                text: `Day ${e.day}: ${e.prompt} → ${e.chosenOptionId === "fun_now" ? "the easy work" : e.chosenOptionId === "chase_now" ? "chased" : "deferred"}. ${e.immediateConsequence}`,
              }),
            ),
          ),
          el("div", { class: "lm-surface" },
            el("h4", { text: "Every invoice you let sit" }),
            ...lines.map((l) =>
              el("p", {
                text: `${l.client} · ${gbp0(l.principal)} · sat ${l.daysLate} day${l.daysLate === 1 ? "" : "s"} unchased — ${gbp(l.total)} of entitlement you'll never get back${l.stillOwed ? " (and it is still growing)" : ""}.`,
              }),
            ),
            el("p", { class: "lm-cash lm-money-out", text: `Total forgone this run: ${gbp(totalForgone)}` }),
          ),
          choiceButton("Continue", "", next),
        );
      },
      // Beat 3 — name it, on their numbers. The statute arrives here.
      () => {
        deps.say("siki", spoken);
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "The frame did the work" }),
          el("p", {
            class: "lm-line siki",
            text: phrased({
              normal: "Both offers were the same choice. The only variable was WHEN the consequence sits. Costs near today feel huge; costs far away feel like rounding. That tilt is present bias — hyperbolic discounting. It is not a character flaw. It is arithmetic your gut does badly.",
              plain: "Both offers were the same choice, changed only in WHEN the money lands. Things close to today feel big. Things far away feel small. That tilt has a name: present bias.",
            }),
          }),
          el("p", {
            class: "lm-hint",
            text: phrased({
              normal: "The price is real, not invented: each day an invoice sits unpaid, the law accrues interest at 8% over the Bank of England base plus a fixed £40–£100 per invoice — Late Payment of Commercial Debts (Interest) Act 1998 s.5A, UK, simplified (assumptions sheet).",
              plain: "The price is real: late invoices build up interest and a fixed charge by law (UK Late Payment Act 1998, simplified). See the assumptions sheet for the exact rates.",
            }),
          }),
          choiceButton("Continue", "", next),
        );
      },
      // Beat 4 — the tool.
      () => {
        deps.say("zana", "Here's the rule. Say it until it's boring.");
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "The rule that closes the gap" }),
          el("p", { class: "lm-line zana", text: "“When an invoice falls due, it is chased the same day.”" }),
          el("p", {
            class: "lm-hint",
            text: phrased({
              normal: "The rule is a commitment device, not discipline: Zana's first-stage reminders chain automatically, so the boring task does itself. The rule keeps the gap — between what the street earned and what it would have — closed.",
              plain: "Zana's reminders do the chasing for you from then on — the boring task does itself. That rule keeps the gap closed.",
            }),
          }),
          choiceButton("Close the books", "Chapter 1 complete", () => closeBooks()),
        );
      },
      // Loss tail — only when the till ran empty.
      ...(state.endedEarly === "till_empty"
        ? [
            () => {
              clear(dayPanel);
              dayPanel.append(
                el("h3", { text: "The till ran empty" }),
                el("p", {
                  class: "lm-line siki",
                  text: phrased({
                    normal: "This is what it cost to skip the supplier — the till went red before the week closed, and the street noticed. Losing isn't moral failure. It's the price of the choice, made visible. The rule above is how a week like this stops being possible.",
                    plain: "Skipping the bill cost the till its cash. That's what the choice cost. The rule above is how a week like this stops happening.",
                  }),
                }),
                choiceButton("Close the books", "Chapter 1 complete", () => closeBooks()),
              );
            },
          ]
        : []),
    ];
    let i = 0;
    function next(): void {
      i += 1;
      frames[i]!();
    }
    frames[0]!();
  }

  function closeBooks(): void {
    // Chapter-cost summary for the finale's Cost-of-Not-Acting ledger.
    // experimentId deliberately does NOT start "ch1_" — it must not
    // dilute the deferral axis in irrationalityProfile.
    const total = state.forgoneInterest + state.forgoneCompensation;
    deps.record({
      chapter: 1,
      day: CH1_DAYS,
      experimentId: "cost_of_not_acting_ch1",
      prompt: "Chapter 1 — the lantern's final reading",
      optionsShown: [{ id: "run_complete", label: "Run complete", framingVariable: "cost_ledger", isDefault: false }],
      chosenOptionId: "run_complete",
      deferred: false,
      forgoneEntitlement: { interest: state.forgoneInterest, compensation: state.forgoneCompensation, total },
      streetFee: state.lateFees,
      immediateConsequence: `Forgone statutory entitlement this run: ${gbp(total)}.`,
    });
    deps.onTool?.("reminder_rule");
  }
}
