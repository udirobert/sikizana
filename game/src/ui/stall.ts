/**
 * The stall chrome — the till and the ledger, rendered ONE way (recovery plan
 * §2.1). Chapter 1, 2 and 3 all call these, so the market is a single place
 * throughout the game, not a place that ch1 owns and ch2/ch3 abandon for a
 * number field (the third-pass charge). The street strip is a separate
 * persistent element owned by main.ts; this is the till + ledger that sit
 * under it.
 */
import { el, clear } from "./dom";
import { money } from "../engine/market";

export interface TillView {
  /** The number to show (a net position, a claim value, the money on the table). */
  value: number;
  /** Caption above the number (defaults to "The till"). */
  caption?: string;
  /** Decimal places on the number (default 2; 0 for whole pounds). */
  decimals?: number;
  /** Small red note under the number, e.g. "− £2,000 owed to …". */
  note?: string;
  /** Render the number red with a ▼ (the position runs empty). */
  negative?: boolean;
  /** Animate the number on this draw (money just changed). */
  pop?: boolean;
  /** Animate a green wash on the till (money actually landed). */
  glow?: boolean;
}

export interface LedgerCard {
  client: string;
  amount: number;
  status: string;
  /** CSS tone: overdue (amber) | chased (green) | bill (violet) | dead (red). */
  tone?: "overdue" | "chased" | "bill" | "dead";
}

/**
 * The last number drawn per till, so a figure that changes ARRIVES instead of
 * teleporting. This is presentation only — the sim owns every value — but it
 * is the whole feel of chapter 2: the desk's number sliding up toward your
 * floor is the anchor doing its work, and a number that just swaps shows the
 * player nothing. (Ch.1 has its own three-line till with the same motion.)
 */
const lastDrawn = new WeakMap<HTMLElement, number>();
const TWEEN_MS = 520;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Render the till (a live number with an optional liability note) into `container`. */
export function renderTill(container: HTMLElement, v: TillView): void {
  clear(container);
  const decimals = v.decimals ?? 2;
  const wrap = el("div", { class: `lm-till${v.negative ? " lm-till-neg" : ""}${v.glow ? " lm-till-glow" : ""}`, "aria-live": "polite" });
  const num = document.createElement("div");
  num.className = `lm-till-num${v.pop ? " lm-pop" : ""}`;
  const from = lastDrawn.get(container);
  lastDrawn.set(container, v.value);
  const tween = from !== undefined && from !== v.value && !prefersReducedMotion();
  num.textContent = money(tween ? from : v.value, decimals);
  if (tween) {
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / TWEEN_MS);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic: fast first, settles
      num.textContent = money(from + (v.value - from) * e, decimals);
      if (p < 1) requestAnimationFrame(step);
      else num.textContent = money(v.value, decimals); // land exactly on the sim's number
    };
    requestAnimationFrame(step);
  }
  wrap.append(el("span", { class: "lm-till-cap", text: v.caption ?? "The till" }), num);
  if (v.negative) wrap.append(el("span", { class: "lm-till-warn", text: "▼ in the red" }));
  if (v.note) wrap.append(el("span", { class: "lm-till-warn", text: v.note }));
  container.append(wrap);
}

/** Render the ledger strip (one card per open item) into `container`. */
export function renderLedger(container: HTMLElement, cards: LedgerCard[]): void {
  clear(container);
  if (cards.length === 0) return;
  const wrap = el("div", { class: "lm-ledger" });
  wrap.append(el("h4", { class: "lm-ledger-cap", text: "The ledger" }));
  for (const c of cards) {
    const cls = `lm-inv-card${c.tone ? ` lm-inv-${c.tone}` : ""}`;
    wrap.append(
      el("div", { class: cls },
        el("span", { class: "lm-inv-client", text: c.client }),
        el("span", { class: "lm-inv-amt", text: money(c.amount, 0) }),
        el("span", { class: "lm-inv-status", text: c.status }),
      ),
    );
  }
  container.append(wrap);
}

/**
 * Build the two chrome containers (till + ledger) for a chapter that doesn't
 * already have them. Call once per chapter; the chapter then fills them with
 * renderTill/renderLedger on every beat, so the place persists through the
 * debrief instead of clearing to a bare form.
 */
export function makeStallChrome(): { till: HTMLElement; ledger: HTMLElement } {
  return {
    till: el("div", { class: "lm-stall-chrome-till" }),
    ledger: el("div", { class: "lm-stall-chrome-ledger" }),
  };
}
