/**
 * The street — the place the game teaches with (recovery plan §3).
 *
 * Five SVG stalls, colourblind-safe by shape (state is glow + badge, never
 * colour-only): two market stalls that are always lit (the market runs on
 * everyone's lateness — it predates the player), and three that the player's
 * own choices fund: the Factor's, the Collector's, the Shark's. Each deferral,
 * each skipped supplier bill, each fee paid to the street lights one more
 * stall; every collection that lands closes one. The finale closes them all.
 *
 * `renderStreet` is the single renderer — the persistent strip on the ch1
 * stall screen and the finale's market close both call it, so the street is
 * one place, not two.
 */
import { el } from "./dom";

export interface StreetCounters {
  /** £ actually paid to the street (NPC fees) this session. */
  toStreet: number;
  /** Recorded deferrals (ch1 pair days + ordinary days). */
  deferrals: number;
  /** Collections whose money landed in the till inside the chapter. */
  collected: number;
  /** Supplier bills left unpaid — the street takes the late charge. */
  billSkipped: number;
}

export const STREET_TOTAL = 5;
/**
 * Stalls lit before the player does anything. Deliberately ONLY the two
 * generic market stalls (cart + awning) — the Factor's, the Collector's, and
 * the Shark's stalls start DARK. A stall lights only when the player's own
 * deferral or skipped bill funds it, so the debrief's "it lit up" is true
 * only when something actually lit. (Base-3 was the v1's "the street was
 * alive before you did anything" — the critic read that as the game
 * pre-justifying its own earnings.)
 */
export const STREET_BASE_LIT = 2;

export interface StreetState {
  /** Ever-lit stalls (lit + shut). */
  lit: number;
  /** Of the lit, how many have shut (your collections closed them). */
  shut: number;
  total: number;
}

/**
 * lit = base + funded (capped); shut = collections (capped at lit). Render
 * order: shut stalls first (closed, were lit), then lit, then dim — so a
 * collection visibly closes a stall on the left and a deferral lights one on
 * the right: the street changes when you leave it.
 */
export function streetState(c: StreetCounters): StreetState {
  const funded = c.deferrals + c.billSkipped + (c.toStreet > 0 ? 1 : 0);
  const lit = Math.min(STREET_TOTAL, Math.max(1, STREET_BASE_LIT + funded));
  const shut = Math.min(lit, c.collected);
  return { lit, shut, total: STREET_TOTAL };
}

type StallKind = "cart" | "awning" | "factor" | "collector" | "shark";

/** Fixed order: market stalls first (the base), then the three that get funded. */
const STALLS: { kind: StallKind; name: string }[] = [
  { kind: "cart", name: "the market cart" },
  { kind: "awning", name: "the awning stall" },
  { kind: "factor", name: "the Factor's stall" },
  { kind: "collector", name: "the Collector's stall" },
  { kind: "shark", name: "the Shark's stall" },
];

/**
 * Stall silhouettes — shapes, not words. Each carries its stall kind's
 * figure; state (lit/dim/shut) is CSS on the wrapping span (glow, opacity,
 * ✕ badge) so the same art works in every state.
 */
function stallSvg(kind: StallKind): string {
  switch (kind) {
    case "cart":
      // A push-cart: box, two wheels, a handle.
      return `<svg viewBox="0 0 40 44" aria-hidden="true">
        <rect x="6" y="12" width="24" height="16" rx="2"/>
        <line x1="30" y1="16" x2="38" y2="8" stroke-width="2.5"/>
        <circle cx="12" cy="34" r="5"/><circle cx="26" cy="34" r="5"/>
      </svg>`;
    case "awning":
      // A curtained stall: striped awning over a counter.
      return `<svg viewBox="0 0 40 44" aria-hidden="true">
        <path d="M4 14 L36 14 L32 6 L8 6 Z"/>
        <line x1="8" y1="14" x2="8" y2="38" stroke-width="2.5"/>
        <line x1="32" y1="14" x2="32" y2="38" stroke-width="2.5"/>
        <rect x="8" y="24" width="24" height="4"/>
      </svg>`;
    case "factor":
      // The Factor — polished otter: rounded head, small ears, slick body.
      return `<svg viewBox="0 0 40 44" aria-hidden="true">
        <ellipse cx="20" cy="14" rx="7" ry="6"/>
        <circle cx="15" cy="8" r="2.4"/><circle cx="25" cy="8" r="2.4"/>
        <path d="M10 40 Q10 24 20 24 Q30 24 30 40 Z"/>
        <rect x="8" y="38" width="24" height="4"/>
      </svg>`;
    case "collector":
      // The Collector — vulture in pinstripes: hooked beak over a tall coat.
      return `<svg viewBox="0 0 40 44" aria-hidden="true">
        <circle cx="18" cy="12" r="5"/>
        <path d="M21 12 L30 15 L21 17 Z"/>
        <path d="M12 40 L14 20 L24 20 L26 40 Z"/>
        <rect x="8" y="38" width="24" height="4"/>
      </svg>`;
    case "shark":
      // The Shark — smiling fish: round body, triangular tail, top fin.
      return `<svg viewBox="0 0 40 44" aria-hidden="true">
        <path d="M28 16 L36 10 L36 26 L28 20 Z"/>
        <ellipse cx="18" cy="18" rx="11" ry="8"/>
        <path d="M14 10 L18 4 L22 10 Z"/>
        <rect x="8" y="38" width="24" height="4"/>
      </svg>`;
  }
}

/**
 * Parse a stall's SVG string into a real element. `el()` treats string
 * children as text nodes, so the markup must be a Node before it's passed
 * down — otherwise the SVG prints as literal text.
 */
function svgNode(markup: string): SVGElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = markup;
  const node = wrap.firstElementChild as SVGElement | null;
  if (!node) throw new Error("stall SVG failed to parse");
  return node;
}

export function renderStreet(c: StreetCounters): HTMLElement {
  const { lit, shut, total } = streetState(c);
  const row = el(
    "div",
    {
      class: "lm-street",
      role: "img",
      "aria-label": `The Late Market street: ${lit - shut} stalls lit, ${shut} shuttered, ${total - lit} dark`,
    },
  );
  for (let i = 0; i < total; i++) {
    const stall = STALLS[i]!;
    const state = i < shut ? "shut" : i < lit ? "lit" : "dim";
    const span = el(
      "span",
      { class: `lm-stall ${state}`, "data-kind": stall.kind, "aria-label": state },
      svgNode(stallSvg(stall.kind)),
    );
    row.append(span);
  }
  row.append(
    el("span", {
      class: "lm-street-cap",
      text: ` The Late Market · ${lit - shut} lit · ${shut} shut — the stalls keep their books`,
    }),
  );
  return row;
}
