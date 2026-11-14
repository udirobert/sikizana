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
import { money } from "../engine/market";

export interface StreetCounters {
  /** £ the street earned this session (ch1 shed value + late charges + NPC fees). */
  toStreet: number;
  /** The ch1 lantern: market value the invoices shed while they sat unchased. */
  streetTake: number;
  /** Recorded deferrals (ch1 pair days + ordinary days). */
  deferrals: number;
  /** Collections whose money landed in the till inside the chapter. */
  collected: number;
  /** Supplier bills left unpaid — the street takes the late charge. */
  billSkipped: number;
  /** Late charges on skipped supplier bills (component of toStreet). */
  lateFees?: number;
  /** Fees paid to stallholders via npc.feePaid ledger entries. */
  npcFees?: number;
  /**
   * Face of invoices that are due and still unchased. This is the number
   * the street shows — the money that has not come in — rather than the
   * few pounds a fictional daily haircut sheds.
   */
  held?: number;
}

export const STREET_TOTAL = 5;
/**
 * Stalls lit before the player does anything. Deliberately ONLY the market
 * cart — the market itself, which predates the stall. The awning and the three
 * NPC stalls (Factor, Collector, Shark) all start DARK: a stall lights only
 * when the player's own deferral or skipped bill funds it, so the debrief's
 * "it lit up" is true only when something actually lit. (Base-3 was the v1's
 * "the street was alive before you did anything"; base-2 still pre-lit a
 * second stall. Base-1: the place is there, but nothing is lit for the
 * player's lateness yet.)
 */
export const STREET_BASE_LIT = 1;

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
export function stallFigure(kind: StallKind): SVGElement {
  return svgNode(stallSvg(kind));
}
function svgNode(markup: string): SVGElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = markup;
  const node = wrap.firstElementChild as SVGElement | null;
  if (!node) throw new Error("stall SVG failed to parse");
  return node;
}

/** One clause per stall per state — the meaning only; showStallNote()
 *  supplies the name and state word so the line never says them twice. */
function stallNote(kind: StallKind, state: "shut" | "lit" | "dim"): string {
  if (state === "shut") return "one of your collections closed this stall.";
  switch (kind) {
    case "cart": return "here before your week, lit by everyone's lateness.";
    case "awning": return state === "lit"
      ? "lit by your waiting — deferrals fund the street."
      : "nothing of yours funds it yet.";
    case "factor": return state === "lit"
      ? "your aged invoices are his stock — he buys the wait."
      : "he sets up when you let invoices age.";
    case "collector": return state === "lit"
      ? "he buys the customer with the debt still on it."
      : "nothing to collect yet.";
    case "shark": return state === "lit"
      ? "a little cash now, a little back each day."
      : "no daily drip to sell you yet.";
  }
}

/** Show (or replace) the inspector line under the strip. Re-rendering the
 *  street replaces the row, which clears the note — fresh state, fresh note.
 *  The stall names itself and its state first; the note carries the meaning. */
function showStallNote(row: HTMLElement, kind: StallKind, state: "shut" | "lit" | "dim"): void {
  row.querySelector(".lm-stall-inspect")?.remove();
  const name = STALLS.find((s) => s.kind === kind)?.name ?? kind;
  const stateWord = state === "lit" ? "lit" : state === "shut" ? "shuttered" : "dark";
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const note = stallNote(kind, state);
  row.append(el("span", {
    class: "lm-stall-inspect",
    role: "status",
    text: `${cap} — ${stateWord}. ${note.charAt(0).toUpperCase()}${note.slice(1)}`,
  }));
}

/** The tally's breakdown — the components streetCounters() already computes,
 *  never an invented per-stall split (the honesty rule: components yes,
 *  fabricated precision no). */
function tallyLines(c: StreetCounters): string[] {
  const shed = c.streetTake ?? 0;
  const late = c.lateFees ?? 0;
  const npc = c.npcFees ?? 0;
  return [
    `Value shed while invoices sat unchased — ${money(shed, 0)}`,
    `Late charges on skipped bills — ${money(late, 0)}`,
    `Fees paid to stallholders — ${money(npc, 0)}`,
    `Deferrals ${c.deferrals} · collections that landed ${c.collected} · skipped bills ${c.billSkipped}`,
  ];
}

export function renderStreet(c: StreetCounters): HTMLElement {
  const { lit, shut, total } = streetState(c);
  const row = el(
    "div",
    {
      class: "lm-street",
      role: "img",
      "aria-label": `The Late Market street: ${lit - shut} stalls lit, ${shut} shuttered, ${total - lit} dark; the stalls have taken ${money(c.toStreet, 0)}`,
    },
  );
  const stalls = el("div", { class: "lm-street-stalls" });
  for (let i = 0; i < total; i++) {
    const stall = STALLS[i]!;
    const state = i < shut ? "shut" : i < lit ? "lit" : "dim";
    const stateWord = state === "lit" ? "lit" : state === "shut" ? "shuttered" : "dark";
    const span = el(
      "span",
      {
        class: `lm-stall ${state}`,
        "data-kind": stall.kind,
        role: "button",
        tabindex: "0",
        "aria-label": `${stall.name}, ${stateWord}`,
      },
      svgNode(stallSvg(stall.kind)),
    );
    // The street is tappable: each stall names itself and says what it means
    // right now — the place answers back instead of sitting as decoration.
    const inspect = () => showStallNote(row, stall.kind, state);
    span.addEventListener("click", inspect);
    span.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); inspect(); }
    });
    stalls.append(span);
  }
  // The money sits on its own line, never wrapped into the stall row.
  // The breakdown lists only components the counters actually carry.
  const taken = money(c.toStreet, 0);
  const held = c.held ?? 0;
  const headline = held > 0 ? `${money(held, 0)} still on the street` : `${taken} to the street`;
  const meta = el("div", { class: "lm-street-meta" });
  const tally = el(
    "button",
    {
      class: "lm-street-cap lm-street-tally",
      type: "button",
      "aria-expanded": "false",
      "aria-label": held > 0
        ? `${money(held, 0)} of your invoices are due and still unchased. Show the breakdown.`
        : `The stalls keep their books — ${taken} so far. Show the breakdown.`,
    },
    document.createTextNode(headline),
  );
  const books = el("span", { class: "lm-street-books", hidden: true });
  for (const line of tallyLines(c)) books.append(el("span", { class: "lm-street-book-line", text: line }));
  tally.addEventListener("click", () => {
    const open = books.hidden;
    books.hidden = !open;
    tally.setAttribute("aria-expanded", String(open));
  });
  meta.append(tally, books);
  row.append(stalls, meta);
  return row;
}
