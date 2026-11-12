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
  worthToday,
  daysOverdueOn,
  netPosition,
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
    // The till is the NET position: cash minus the unpaid supplier bill. The
    // bill is the stall's own money, set aside — so skipping it drops the
    // till by the full amount, not by a caption-sized late charge.
    const net = netPosition(state);
    const t = document.createElement("div");
    t.className = "lm-till-num";
    t.textContent = gbp(net);
    if (pop) t.classList.add("lm-pop");
    const cap = el("span", { class: "lm-till-cap", text: "The till" });
    till.replaceChildren(cap, t);
    if (net < 0) {
      till.append(el("span", { class: "lm-till-warn", text: "▼ the till is in the red" }));
    }
    // Show the set-aside bill while it is live, so the drop is legible.
    if (state.bill.skippedDay !== null && state.bill.paidDay === null) {
      till.append(el("span", { class: "lm-till-warn", text: `− ${gbp0(state.bill.amount + state.lateFees)} owed to ${state.bill.client}` }));
    }
    till.classList.toggle("lm-till-neg", net < 0);

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
        // The "worth today" FALLS as the invoice ages (GDD §2 discounting
        // lesson). The count and the value share one formula (daysOverdueOn),
        // so "N days overdue · worth today £X" is the same arithmetic the
        // lantern's street take is built from.
        const n = daysOverdueOn(inv, day);
        status = `${n} day${n === 1 ? "" : "s"} overdue · worth today ${gbp0(worthToday(inv, day))}`;
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
      // The debt GROWS — the late charge is added on, and the till position
      // carries it, so this number going up is the till number going down.
      const owed = state.bill.amount + state.lateFees;
      ledgerStrip.append(
        el("div", { class: "lm-inv-card lm-inv-bill lm-inv-dead" },
          el("span", { class: "lm-inv-client", text: state.bill.client + " (your bill)" }),
          el("span", { class: "lm-inv-amt", text: gbp0(owed) }),
          el("span", { class: "lm-inv-status", text: `unpaid — ${gbp0(state.bill.lateFee)}/day late charge · growing` }),
        ),
      );
    }

    const lanternNow = state.streetTake;
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
      case 4: return `A bill is due today — ${gbp0(state.bill.amount)}. The till is ${gbp(netPosition(state))}.`;
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
    // The street's total take this run: the market value the invoices shed
    // while they sat (the lantern) + the late charges on the unpaid bill.
    const streetTake = state.streetTake;
    const streetTotal = streetTake + state.lateFees;
    // The real legal floor over the same windows — the Act, for beat 3.
    const statutoryFloor = lines.reduce((t, l) => t + l.statutory, 0);

    // Beat 3's spoken line — exact match against the baked variants.
    const deferredDays = deferred.map((e) => `Day ${e.day}`).join(" and ");
    const spoken =
      deferred.length === 0
        ? "You chased both times. Good. But notice how the same choice felt different when both ends sat further out."
        : deferred.length === 1
          ? `1 of the two was deferred (${deferredDays}) — the frame, not the facts, did the work.`
          : `2 of the two was deferred (${deferredDays}) — the frame, not the facts, did the work.`;

    const frames: (() => void)[] = [
      // Beat 1 — the street as you built it. No names yet. The street's
      // earnings are the real number: the value your invoices shed while
      // they sat (what the stalls bought them for) plus the late charges.
      () => {
        clear(dayPanel);
        dayPanel.append(
          el("h3", { text: "First — what your week paid for" }),
          el("p", {
            class: "lm-line siki",
            text: streetTotal > 0
              ? `The street took ${gbp(streetTotal)} this week — ${gbp(streetTake)} for the invoices you let age,${state.lateFees > 0 ? ` and ${gbp(state.lateFees)} in late charges on the unpaid bill.` : ""} That money came out of the value your own invoices lost. Your lateness is their trade.`
              : "You paid the street nothing this week. Nothing aged on your desk. That is the whole lesson in one sentence: the market runs on someone's lateness — this week it wasn't yours.",
          }),
          el("p", {
            class: "lm-hint",
            text: "Watch the ledger: the 'worth today' of each invoice fell while the lantern grew. Same money, two screens. Every collection you made lit a stall off; every deferral lit one on.",
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
                text: `${l.client} · ${gbp0(l.principal)} · sat ${l.daysLate} day${l.daysLate === 1 ? "" : "s"} unchased — the street kept ${gbp(l.streetTake)} of its value${l.stillOwed ? " (still owed — the number is still moving)" : ""}. The law would have accrued ${gbp0(l.statutory)} over those same days.`,
              }),
            ),
            el("p", { class: "lm-cash lm-money-out", text: `The street's take this run: ${gbp(streetTake)} — the same money the cards above stopped being worth` }),
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
              normal: `The street doesn't claim — it buys: ${gbp(streetTake)} of your invoices' value changed hands this week. The law sets a different price for the same delay: the Late Payment of Commercial Debts (Interest) Act 1998 s.5A (UK, 8% over base + £40–£100 per invoice, simplified) would have accrued ${gbp0(statutoryFloor)} in claims over those same days — recoverable only if you chase it. Two prices for one habit. You paid the street's.`,
              plain: `The street bought your delay for ${gbp(streetTake)}. The law prices that same delay at ${gbp0(statutoryFloor)} (UK Late Payment Act 1998, simplified) — but you only get it if you chase. You paid the street's price.`,
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
    // The street's earnings this run (value the invoices shed + the late
    // charges) is the streetFee; the statutory floor is recorded as the
    // forgone entitlement (the legal price of the same delay, claimable only
    // by the player — the finale shows the two as separate figures).
    const runLines = deferralLines(state);
    const runStatutory = runLines.reduce((t, l) => t + l.statutory, 0);
    const runStreetTake = state.streetTake;
    const runStreetTotal = runStreetTake + state.lateFees;
    deps.record({
      chapter: 1,
      day: CH1_DAYS,
      experimentId: "cost_of_not_acting_ch1",
      prompt: "Chapter 1 — what the street earned",
      optionsShown: [{ id: "run_complete", label: "Run complete", framingVariable: "cost_ledger", isDefault: false }],
      chosenOptionId: "run_complete",
      deferred: false,
      forgoneEntitlement: { interest: runStatutory, compensation: 0, total: runStatutory },
      streetFee: runStreetTotal,
      immediateConsequence: `The street took ${gbp(runStreetTotal)} on your delay this run.`,
    });
    deps.onTool?.("reminder_rule");
  }
}
