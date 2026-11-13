/**
 * The stall chrome — the till and the ledger, rendered ONE way (recovery plan
 * §2.1). Chapter 1, 2 and 3 all call these, so the market is a single place
 * throughout the game, not a place that ch1 owns and ch2/ch3 abandon for a
 * number field (the third-pass charge). The street strip is a separate
 * persistent element owned by main.ts; this is the till + ledger that sit
 * under it.
 */
import { el, clear } from "./dom";

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

/** Render the till (a live number with an optional liability note) into `container`. */
export function renderTill(container: HTMLElement, v: TillView): void {
  clear(container);
  const decimals = v.decimals ?? 2;
  const wrap = el("div", { class: `lm-till${v.negative ? " lm-till-neg" : ""}${v.glow ? " lm-till-glow" : ""}`, "aria-live": "polite" });
  const num = document.createElement("div");
  num.className = `lm-till-num${v.pop ? " lm-pop" : ""}`;
  num.textContent = `£${v.value.toFixed(decimals)}`;
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
        el("span", { class: "lm-inv-amt", text: `£${Math.round(c.amount)}` }),
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
