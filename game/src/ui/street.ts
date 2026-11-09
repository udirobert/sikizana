/**
 * The street — one element, one lesson (GDD §2 step 2).
 * Stalls light when deferral funds them; shutter when you get paid.
 * Derived from countable session events (street counters), not vibes.
 */
import { el } from "./dom";

export interface StreetCounters {
  /** £ actually paid to the street (NPC fees) — lit stays the stalls. */
  toStreet: number;
  /** Successful chase completions recorded by the session. */
  collected: number;
  /** Recorded deferrals. */
  deferrals: number;
}

export function streetState(c: StreetCounters): { lit: number; shut: number; total: number } {
  const total = 7;
  const lit = Math.min(total, Math.max(0, Math.floor(c.toStreet / 50) + Math.floor(c.deferrals / 2)));
  const shut = Math.min(lit, c.collected); // each collection closes one stall
  return { lit, shut, total };
}

export function renderStreet(c: StreetCounters): HTMLElement {
  const { lit, shut, total } = streetState(c);
  const row = el("div", { class: "lm-street", role: "img", "aria-label": `The Late Market street: ${lit} stalls lit, ${shut} shuttered` });
  for (let i = 0; i < total; i++) {
    const state = i < shut ? "shut" : i < lit ? "lit" : "dim";
    row.append(el("span", { class: `lm-stall ${state}`, "data-i": String(i), text: "⌂" }));
  }
  row.append(el("span", { class: "lm-street-cap", text: ` The Late Market · ${lit} lit · ${shut} shuttered` }));
  return row;
}
