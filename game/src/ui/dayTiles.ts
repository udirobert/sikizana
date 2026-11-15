/** Day tiles — the week has a shape, drawn by CSS.
 *
 * The old shape was text ("●○○"), which hands the geometry to whatever font
 * the player's machine picks: circles, squares, anything. These tiles are
 * real elements — spent days dim amber, today full amber, days to come
 * hollow — so the same craft object reads identically everywhere: the day
 * header ("Day 2 of 3" + tiles) and the street rail's chapter chip.
 * Purely decorative: aria-hidden, the label carries the count.
 */
import { el } from "./dom";

/** `reached` tiles filled (the last one is "now"), `total` slots total. */
export function dayTiles(reached: number, total: number): HTMLElement {
  const wrap = el("span", { class: "lm-day-tiles", "aria-hidden": "true" });
  for (let i = 0; i < total; i++) {
    const cls =
      i < reached - 1 ? "lm-day-tile done" :
      i === reached - 1 ? "lm-day-tile now" :
      "lm-day-tile";
    wrap.append(el("i", { class: cls }));
  }
  return wrap;
}
