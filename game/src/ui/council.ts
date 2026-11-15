/**
 * The council — Siki and Zana flank every major decision.
 *
 * The product's dual persona, made playable: Siki is the explainer (theory,
 * history, the law — plain English, never accusatory), Zana is the enforcer
 * (chase pressure, blunt cost reads). Canon: `web/DESIGN.md` "Siki = explain;
 * Zana = chase/enforce, direct tone", `web/components/ZanaMascot.tsx` ("the
 * bad cop to Siki's good cop").
 *
 * Layout: on wide viewports the two advisors literally stand on either side
 * of the options — the choice sits between the angel and the dark one. On
 * narrow viewports the pair stacks above the choices, side by side, so the
 * "one decision, two lenses" reading survives the collapse.
 *
 * Council lines are TEXT by design on beats where an NPC or the scene owns
 * the voice (the spoken line stays one-per-beat — the council mutters
 * beside you, it doesn't lecture at you). Beats with no competing voice
 * chain their council lines through say().
 */
import { el } from "./dom";
import { speakerFigure, NAMES } from "./characters";

export interface CouncilText {
  /** Siki's lens: the explainer read of this decision. */
  siki?: string;
  /** Zana's lens: the enforcer read of this decision. */
  zana?: string;
}

function counselAside(speaker: "siki" | "zana", text: string): HTMLElement {
  const aside = el("aside", { class: `lm-counsel ${speaker}` });
  aside.append(
    el("span", { class: `lm-speaker-fig ${speaker}`, "aria-hidden": "true" }, speakerFigure(speaker)),
    el("span", { class: "lm-counsel-name", text: NAMES[speaker] }),
  );
  const line = el("span", { class: "lm-counsel-text" });
  line.textContent = text;
  aside.append(line);
  return aside;
}

/**
 * Wrap a choices container in the council grid. The choices element is
 * re-parented (same node — caller keeps its reference for veil/clock work).
 * Beats that pass no council text get their choices back unwrapped.
 */
export function councilGrid(council: CouncilText, choices: HTMLElement): HTMLElement {
  if (!council.siki && !council.zana) return choices;
  const grid = el("div", { class: "lm-council" });
  // Both lenses are expected on every council beat; a missing one leaves its
  // column empty rather than rendering a blank speech card.
  if (council.siki) grid.append(counselAside("siki", council.siki));
  const mid = el("div", { class: "lm-council-choices" });
  mid.append(choices);
  grid.append(mid);
  if (council.zana) grid.append(counselAside("zana", council.zana));
  return grid;
}
