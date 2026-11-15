/** Per-chapter mirror card (G2): one axis, player's own data, no lecture. */
import { el } from "./dom";
import type { AxisEvidence } from "../chapters/finale";
import { sendTelemetry } from "../engine/telemetry";

export function profileCard(axis: AxisEvidence, chapterLabel: string): HTMLElement {
  const card = el("div", { class: "lm-surface lm-profile-card" },
    el("p", { class: "lm-hint", text: `Your ${chapterLabel} mirror — one run suggests, it doesn't prove.` }),
    el("p", { text: axis.line }),
    el("p", { class: "lm-hint", text: axis.nameThat }),
  );
  try { sendTelemetry({ event: "profile_card_seen", stage: chapterLabel }); } catch { /* noop */ }
  return card;
}
