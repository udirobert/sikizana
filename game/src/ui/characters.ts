/**
 * The cast, as objects. Every voiced line carries its speaker's figure —
 * Siki and Zana finally get faces instead of emoji prefixes, and the three
 * creditors keep the same silhouettes they have on the street and at their
 * beats. Figures are stroke-only line art in the stallFigure style; colour
 * comes from CSS per speaker.
 *
 * Karaoke safety: the spoken text lives in `.lm-line-text`, a sibling of
 * the figure — VoicePlayer rebuilds only that node's innerHTML, so the
 * portrait and nameplate survive word highlighting.
 */
import { el } from "./dom";
import { stallFigure } from "./street";
import type { Speaker } from "../audio/voice";

const NAMES: Record<Speaker, string> = {
  siki: "Siki",
  zana: "Zana",
  factor: "The Factor",
  collector: "The Collector",
  shark: "The Shark",
};

/** Siki — the owl bookkeeper: ear tufts, round spectacles, ledger brow. */
const SIKI_SVG = `<svg viewBox="0 0 40 44" aria-hidden="true">
  <path d="M11 11 L8 4 L15 8 Z"/>
  <path d="M29 11 L32 4 L25 8 Z"/>
  <ellipse cx="20" cy="16" rx="10" ry="9"/>
  <circle cx="16.5" cy="15" r="3.8"/><circle cx="23.5" cy="15" r="3.8"/>
  <line x1="20.3" y1="15" x2="19.7" y2="15"/>
  <circle cx="16.5" cy="15" r="1.3"/><circle cx="23.5" cy="15" r="1.3"/>
  <path d="M20 18.5 L17.8 21.5 L22.2 21.5 Z"/>
  <path d="M10 40 Q10 29 20 29 Q30 29 30 40 Z"/>
</svg>`;

/** Zana — the dog who chases: floppy ears, muzzle, wagging tail. */
const ZANA_SVG = `<svg viewBox="0 0 40 44" aria-hidden="true">
  <path d="M12 13 Q5 8 8 20 Q9 25 14 23 Z"/>
  <path d="M28 13 Q35 8 32 20 Q31 25 26 23 Z"/>
  <ellipse cx="20" cy="16" rx="9" ry="8"/>
  <ellipse cx="20" cy="21" rx="4.2" ry="3"/>
  <circle cx="20" cy="20" r="1.5"/>
  <path d="M13 40 Q13 30 20 30 Q27 30 27 40 Z"/>
  <path d="M27 36 Q33 32 32 25"/>
</svg>`;

function svgNode(markup: string): SVGElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = markup;
  const node = wrap.firstElementChild as SVGElement | null;
  if (!node) throw new Error("character SVG failed to parse");
  return node;
}

/** The speaker's figure — mascots for the narrators, street figures for
 *  the creditors (same art they have on the stalls and at their beats). */
export function speakerFigure(speaker: Speaker): SVGElement {
  if (speaker === "siki") return svgNode(SIKI_SVG);
  if (speaker === "zana") return svgNode(ZANA_SVG);
  return stallFigure(speaker);
}

/** A voiced line as a DOM node: figure + nameplate + karaoke-safe text. */
export function speakerPara(speaker: Speaker, text: string): HTMLParagraphElement {
  const p = el("p", { class: `lm-line ${speaker}`, role: "note" });
  const fig = el("span", { class: `lm-speaker-fig ${speaker}`, "aria-hidden": "true" }, speakerFigure(speaker));
  const name = el("span", { class: "lm-speaker-name", text: NAMES[speaker] });
  const line = el("span", { class: "lm-line-text" });
  line.textContent = text;
  p.append(fig, name, document.createTextNode(" — "), line);
  return p;
}
