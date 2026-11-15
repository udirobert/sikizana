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
import type { Speaker } from "../audio/voice";

export const NAMES: Record<Speaker, string> = {
  siki: "Siki",
  zana: "Zana",
  factor: "The Factor",
  collector: "The Collector",
  shark: "The Shark",
};

/** Painted V5 portraits — same keyed PNGs as the street stalls, so every
 *  voice has the cute face. Falls back to alt text if the asset 404s. */
const PORTRAIT: Record<Speaker, string> = {
  siki: "assets/sprites/siki.png",
  zana: "assets/sprites/zana.png",
  factor: "assets/sprites/factor.png",
  collector: "assets/sprites/collector.png",
  shark: "assets/sprites/shark.png",
};
export function speakerFigure(speaker: Speaker): HTMLElement {
  const img = document.createElement("img");
  img.className = `lm-speaker-img ${speaker}`;
  img.src = PORTRAIT[speaker];
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  img.width = 56;
  img.height = 56;
  return img;
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
