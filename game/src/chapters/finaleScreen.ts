/**
 * Finale screen driver — "You Were the Experiment / Market Close" (GDD A5).
 * Presentational only: the view-model comes from finale.ts (pure, ledger-
 * derived); persistence of the Rationality Delta lives in main.ts.
 */
import { el, clear, choiceButton } from "../ui/dom";
import { renderStreet, type StreetCounters } from "../ui/street";
import type { LedgerEntry } from "../engine/ledger";
import { money, remedy, zakatNote, isSouq, SOUQ_VO } from "../engine/market";
import { productCheckUrl } from "../engine/links";
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

const gbp = (v: number) => money(v, 2);
const STALL_SHUT_MS = 380;

export function runFinale(deps: FinaleDeps): void {
  const { root, view } = deps;
  clear(root);
  const stage = el("div", { class: "lm-stage" });
  root.append(stage);

  // ── Beat 1: the street assembles, then closes stall by stall. ──
  function marketClose(): void {
    // Souq: the zakat callback gets its own beat first — the AR line runs
    // ~7s and speak() cuts the previous take, so it can't share a frame.
    if (isSouq()) {
      deps.say("siki", SOUQ_VO.debriefZakat);
      stage.append(
        el("h3", { text: "The souq keeps one more ledger" }),
        el("p", { class: "lm-hint lm-zakat", text: "2.5% on what you are still owed — due whether or not the invoice ever clears." }),
        el("div", { class: "lm-choices" },
          choiceButton("Let the market close", "Watch what your ledger funded, shutter", marketCloseOpen),
        ),
      );
      return;
    }
    marketCloseOpen();
  }

  function marketCloseOpen(): void {
    deps.say("siki", isSouq() ? SOUQ_VO.finaleClose : "Market close. This is the street your decisions built.");
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
        choiceButton("Your week in one line", "", verdictBeat),
      );
    }
  }

  // ── The week in one line — the quotable verdict. ──
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
      el("p", { class: "lm-hint", text: "Run it back. The line should move." }),
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
          const total = el("p", { class: "lm-take" });
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
        el("p", { class: "lm-hint", text: `To the street (NPC fees): ${gbp(c.toStreet)} · forgone ${remedy().label}: ${gbp(c.forgoneStatutory)}` }),
        // The souq market's second cost of deferral: the money you never
        // collected is still on your books, and commonly still in the zakat
        // base. Basis is the uncollected receivable only — street fees are
        // already gone, so they are not owed to you and not zakatable here.
        // Practice, not a ruling (schools differ on doubtful debts).
        ...(zakatNote(c.forgoneStatutory)
          ? [el("p", { class: "lm-hint lm-zakat", text: zakatNote(c.forgoneStatutory)! })]
          : []),
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
      // The ending lands forward, not hedged: the dare is the score, and
      // the week's eyes have somewhere real to go — Sikizana reads actual
      // books the way the player just learned to read this one. Copy only;
      // read-only, human-in-the-loop, no money moved, no provider named.
      el("div", { class: "lm-choices" },
        choiceButton("Run it back", !deps.delta
          ? "First run banked — the street raises its prices next week"
          : deps.delta.score === 0
            ? "Dead level with your best — the street raises its prices next week"
            : deps.delta.improved
              ? `${Math.abs(deps.delta.score).toFixed(0)} under your best — the street raises its prices next week`
              : `${Math.abs(deps.delta.score).toFixed(0)} over your best — take it back next week`, deps.onRestart),
        choiceButton("Back to the title", "Close the books for tonight", () => window.location.reload()),
      ),
      // A footnote, not a choice. The week ends on the replay. The product
      // stays available and read-only, and it does not take a key.
      el("p", { class: "lm-hint" },
        "The same scan, on a real set of books, stays read-only. ",
        el("a", {
          href: productCheckUrl(),
          target: "_blank",
          rel: "noopener noreferrer",
          text: "Look when you want.",
        }),
      ),
    );
  }

  marketClose();
}
