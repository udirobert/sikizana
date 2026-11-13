/**
 * Finale screen driver — "You Were the Experiment / Market Close" (GDD A5).
 * Presentational only: the view-model comes from finale.ts (pure, ledger-
 * derived); persistence of the Rationality Delta lives in main.ts.
 */
import { el, clear, choiceButton } from "../ui/dom";
import { renderStreet, type StreetCounters } from "../ui/street";
import type { LedgerEntry } from "../engine/ledger";
import { phrased } from "../i18n";
import { verdictLine, type FinaleView } from "./finale";

export interface FinaleDeps {
  root: HTMLElement;
  say: (speaker: "siki" | "zana", text: string) => void;
  view: FinaleView;
  /** Raw ledger entries for the replay beat. */
  entries: () => readonly LedgerEntry[];
  street: StreetCounters;
  /** Rationality Delta vs the player's best previous run, null on first run. */
  delta: { score: number; improved: boolean } | null;
  onRestart: () => void;
}

const gbp = (v: number) => `£${v.toFixed(2)}`;
const STALL_SHUT_MS = 380;

export function runFinale(deps: FinaleDeps): void {
  const { root, view } = deps;
  clear(root);
  const stage = el("div", { class: "lm-stage" });
  root.append(stage);

  // ── Beat 1: the street assembles, then closes stall by stall. ──
  function marketClose(): void {
    deps.say("siki", "Market close. This is the street your decisions built.");
    stage.append(
      el("h3", { text: "The week, read back" }),
      el("p", { class: "lm-hint", text: "Every stall below was lit by something you postponed, paid for, or walked away from. One week, one stall — this is what your own ledger funded." }),
    );
    const streetWrap = el("div", { class: "lm-surface" });
    stage.append(streetWrap, el("div", { class: "lm-choices" },
      choiceButton("Let the market close", "Watch what your ledger funded, shutter", beginClose),
    ));

    function beginClose(): void {
      clear(stage);
      streetWrap.remove();
      const row = renderStreet(deps.street);
      stage.append(
        el("h3", { text: "Market close" }),
        row,
        el("div", { class: "lm-choices" },
          choiceButton("Skip the lights going out", "", () => finishClose()),
        ),
      );
      const stalls = Array.from(row.querySelectorAll<HTMLElement>(".lm-stall.lit"));
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || stalls.length === 0) return finishClose();
      stalls.forEach((s, i) => {
        window.setTimeout(() => {
          s.className = "lm-stall shut";
          if (i === stalls.length - 1) finishClose();
        }, (i + 1) * STALL_SHUT_MS);
      });
    }

    function finishClose(): void {
      // All stalls end shuttered — the market closes on your terms now.
      const cap = stage.querySelector(".lm-street-cap");
      if (cap) cap.textContent = " The Late Market · closed";
      clear(stage);
      const row = renderStreet(deps.street);
      for (const s of row.querySelectorAll(".lm-stall")) s.className = "lm-stall shut";
      const cap2 = row.querySelector(".lm-street-cap");
      if (cap2) cap2.textContent = " The Late Market · closed";
      stage.append(
        el("h3", { text: "Market close" }),
        row,
        el("div", { class: "lm-surface" },
          el("p", { class: "lm-line siki", text: "The Late Market never sleeps. Either you fetch it, or you discount it." }),
        ),
        el("p", { class: "lm-hint", text: "Some of this was not you. Some months, there simply isn't enough. Then the fix isn't willpower — it's survival support. Ask early; it works better." }),
        choiceButton("Read your ledger", "Every offer shown, every default, every consequence", ledgerBeat),
      );
    }
  }

  // ── Beat 2: the full decision ledger, replayed. ──
  function ledgerBeat(): void {
    deps.say("siki", "Let's read what you actually did — not what a textbook would do.");
    clear(stage);
    const entries = deps.entries();
    const list = el("div", { class: "lm-surface lm-review-scroll" });
    if (entries.length === 0) {
      list.append(el("p", { class: "lm-hint", text: "Nothing recorded — a clean ledger is its own kind of run." }));
    }
    for (const e of entries) {
      list.append(el("div", { class: "lm-review-entry" },
        el("p", { text: `Day ${e.day} · ${e.prompt}` }),
        el("p", { class: "lm-hint", text: `→ ${e.chosenOptionId}${e.deferred ? " (deferred)" : ""} — ${e.immediateConsequence}` }),
      ));
    }
    stage.append(
      el("h3", { text: `Your ledger — ${entries.length} recorded decisions` }),
      list,
      choiceButton("Continue", "", profileBeat),
    );
  }

  // ── Beat 3: where the player leaned — three axes, own data, n honest. ──
  function profileBeat(): void {
    deps.say("siki", "Three numbers, computed from your own choices. Not a diagnosis — a mirror.");
    clear(stage);
    stage.append(el("h3", { text: "Where you leaned" }));
    // The honest frame: each axis is measured from the player's own recorded
    // choices against the baseline that chases on time — not a clinical "you
    // have bias X". The pair was the same offer run twice (the visible
    // repetition is in the deferral line below), so the lean is something the
    // player can SEE in their own data, not the designer's attribution.
    stage.append(el("p", { class: "lm-hint", text: "One playthrough, a handful of decisions — this suggests a lean, it doesn't diagnose one. Read it as your week, not your character." }));
    stage.append(el("p", { class: "lm-hint", text: phrased({
      normal: "Each number is measured from your own recorded choices, against the baseline that chases on time. It is not a diagnosis — it is where you leaned this week, and by how much.",
      plain: "Each number is from your own choices, compared to the player who always chases on time. Not a test — where you leaned.",
    }) }));
    if (view.partial) {
      stage.append(el("p", { class: "lm-hint", text: "Partial run — some chapters were skipped, so unmeasured axes read low. The bars below reflect only what was recorded." }));
    }
    const card = el("div", { class: "lm-surface lm-profile" });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const axis of view.axes) {
      const num = el("strong", { text: reduced ? `${axis.value}` : "0" });
      const bar = el("div", { class: "lm-bar", style: `width:${reduced ? Math.min(100, axis.value) : 0}%` });
      // The mirror lands gradually: each number counts up and its bar grows.
      if (!reduced) {
        const t0 = performance.now(), dur = 850;
        const frame = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          const e = 1 - Math.pow(1 - p, 3);
          num.textContent = `${Math.round(axis.value * e)}`;
          bar.setAttribute("style", `width:${Math.min(100, axis.value) * e}%`);
          if (p < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }
      card.append(
        el("div", { class: "lm-axis" },
          el("div", { class: "lm-axis-head" },
            el("span", { text: axis.key === "deferral" ? "Deferral" : axis.key === "anchoring" ? "Anchoring" : "Sunk cost" }),
            num,
          ),
          bar,
          el("p", { class: "lm-hint", text: axis.line }),
          el("p", { class: "lm-hint", text: `Named: ${axis.nameThat}` }),
        ),
      );
    }
    stage.append(card, choiceButton("Continue", "", verdictBeat));
  }

  // ── Beat 3½: the week in one line — the quotable verdict. ──
  function verdictBeat(): void {
    const v = verdictLine(view.profile);
    deps.say("siki", v.siki);
    clear(stage);
    stage.append(
      el("h3", { text: "Your week in one line" }),
      el("div", { class: "lm-surface lm-verdict" },
        el("p", { class: "lm-line siki", text: v.siki }),
        el("p", { class: "lm-line zana", text: v.zana }),
      ),
      el("p", { class: "lm-hint", text: "One run suggests; it doesn't prove. Run it back and watch the line move." }),
      choiceButton("See the cost", "What the street kept", costBeat),
    );
    deps.say("zana", v.zana);
  }

  // ── Beat 4: what deferral paid the street, vs the country. ──
  function costBeat(): void {
    deps.say("siki", "Finally — the ledger the street keeps.");
    clear(stage);
    const c = view.cost;
    stage.append(
      el("h3", { text: "The Cost of Not Acting" }),
      el("div", { class: "lm-surface" },
        (() => {
          const total = el("p", { class: "lm-cash" });
          const target = c.toStreet + c.forgoneStatutory;
          // The final number counts up to its full weight — then the verdict.
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) {
            total.textContent = gbp(target);
          } else {
            const t0 = performance.now(), dur = 1100;
            const frame = (t: number) => {
              const p = Math.min(1, (t - t0) / dur);
              const e = 1 - Math.pow(1 - p, 3);
              total.textContent = gbp(target * e);
              if (p < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          }
          return total;
        })(),
        el("p", { class: "lm-hint", text: `To the street (NPC fees): ${gbp(c.toStreet)} · forgone statutory entitlement: ${gbp(c.forgoneStatutory)}` }),
        el("p", { class: "lm-hint", text: "Fictional run total — your books, your choices. The country-wide numbers are real:" }),
      ),
      el("div", { class: "lm-stat-grid" },
        ...view.stats.map((s) => el("div", { class: "lm-surface lm-stat" },
          el("p", { class: "lm-stat-value", text: s.value }),
          el("p", { text: s.label }),
          el("p", { class: "lm-hint", text: s.source }),
        )),
      ),
      el("p", { class: "lm-hint", text: deps.delta
        ? deps.delta.score === 0
          ? "Rationality Delta vs your best run: no change — the frames found the same footing twice."
          : `Rationality Delta vs your best run: ${deps.delta.improved ? "−" : "+"}${Math.abs(deps.delta.score).toFixed(0)} (lower irrationality is better; 0 = untouched by the frames)`
        : "First run complete — this profile is your baseline. Run it back and beat your Rationality Delta." }),
      el("div", { class: "lm-choices" },
        choiceButton("Run it back", "Reset the ledger and play again — the delta is the score", deps.onRestart),
        choiceButton("Back to the title", "Close the books for tonight", () => window.location.reload()),
      ),
    );
  }

  marketClose();
}
