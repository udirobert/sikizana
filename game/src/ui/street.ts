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
import { createStreetScene, streetSceneSupported, STALL_RECTS, type StreetScene } from "../scene/streetScene";

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

export type StallKind = "cart" | "awning" | "factor" | "collector" | "shark";

/** Fixed order: market stalls first (the base), then the three that get funded. */
const STALLS: { kind: StallKind; name: string; short: string }[] = [
  { kind: "cart", name: "the market cart", short: "Cart" },
  { kind: "awning", name: "the awning stall", short: "Awning" },
  { kind: "factor", name: "the Factor's stall", short: "Factor" },
  { kind: "collector", name: "the Collector's stall", short: "Collector" },
  { kind: "shark", name: "the Shark's stall", short: "Shark" },
];
/** Short caption under every stall — the street is labelled, not decoded. */
function stallName(short: string): HTMLElement {
  return el("span", { class: "lm-stall-name", "aria-hidden": "true", text: short });
}

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

/** The narrators' figures — same line-art language as the stalls, big
 *  enough to hold a pitch. Used by the home stall and every voice line. */
export function mascotFigure(who: "siki" | "zana"): SVGElement {
  return svgNode(who === "siki" ? SIKI_SVG : ZANA_SVG);
}

/**
 * Parse a stall's SVG string into a real element. `el()` treats string
 * children as text nodes, so the markup must be a Node before it's passed
 * down — otherwise the SVG prints as literal text.
 */
export function stallFigure(kind: StallKind): SVGElement {
  return svgNode(stallSvg(kind));
}

/** Raw markup for the Pixi scene's texture pipeline — one source of
 *  truth for the cast's art (scene/streetScene.ts rasterizes it). */
export function stallSvgMarkup(kind: StallKind): string {
  return stallSvg(kind);
}
export function mascotSvgMarkup(who: "siki" | "zana"): string {
  return who === "siki" ? SIKI_SVG : ZANA_SVG;
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
 *  The stall names itself and its state first; the note carries the meaning.
 *  A lit stall also gets Zana's murmur — the running street take, so the
 *  hover answers "what has this cost me?" in the game's own voice. */
function showStallNote(row: HTMLElement, kind: StallKind, state: "shut" | "lit" | "dim", c: StreetCounters): void {
  row.querySelector(".lm-stall-inspect")?.remove();
  const name = STALLS.find((s) => s.kind === kind)?.name ?? kind;
  const stateWord = state === "lit" ? "lit" : state === "shut" ? "shuttered" : "dark";
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const note = stallNote(kind, state);
  const parts: (Node | string)[] = [`${cap} — ${stateWord}. ${note.charAt(0).toUpperCase()}${note.slice(1)}`];
  if (c.toStreet > 0) {
    // Inspection answers with real numbers: Zana's voice plus the dim
    // ledger line — flavour first, audit second (never invented values).
    parts.push(el("span", {
      class: "lm-stall-ledger",
      text: ` · street ${money(c.toStreet, 0)} · shed ${money(c.streetTake ?? 0, 0)}`,
    }));
    if (state === "lit") {
      parts.push(el("span", { class: "lm-stall-murmur", text: ` — Zana: ${money(c.toStreet, 0)} to the street so far.` }));
    }
  }
  row.append(el("span", { class: "lm-stall-inspect", role: "status" }, ...parts));
}

/** Whose money the lit stalls hold — components only, never invented splits. */
function holdingsLine(c: StreetCounters): string {
  const shed = c.streetTake ?? 0;
  const late = c.lateFees ?? 0;
  const npc = c.npcFees ?? 0;
  const held = c.held ?? 0;
  if (held > 0) return `On the street now: ${money(held, 0)} unchased · realised take ${money(c.toStreet, 0)} (shed ${money(shed, 0)} · late ${money(late, 0)} · fees ${money(npc, 0)})`;
  return `Realised take ${money(c.toStreet, 0)} (shed ${money(shed, 0)} · late ${money(late, 0)} · fees ${money(npc, 0)})`;
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

/* ── Pixi street scene (v4) ────────────────────────────────────────
 * The canvas is the visual layer; DOM keeps semantic hit-areas so
 * inspect/keyboard/a11y are unchanged. The scene host persists across
 * row rebuilds (appended into each fresh stalls container); if WebGL
 * is unavailable we render the legacy DOM stalls instead. */
let scenePromise: Promise<StreetScene | null> | null = null;
let sceneHost: HTMLElement | null = null;
let sceneDay = 1;

function streetScene(): Promise<StreetScene | null> {
  if (!scenePromise) {
    scenePromise = (async () => {
      const host = document.createElement("div");
      host.id = "lm-street-scene";
      host.className = "lm-street-scene";
      sceneHost = host;
      const s = await createStreetScene(host, STALLS.map((x) => x.kind));
      if (s) s.setDay(sceneDay);
      return s;
    })();
  }
  return scenePromise;
}

/** Forward a day counter into the scene's dusk→dawn grade AND the
 *  panorama backdrop — day 1 dusk, 2 night, 3+/finale pre-dawn. */
export function noteSceneDay(day: number): void {
  sceneDay = day;
  void streetScene().then((s) => {
    s?.setDay(day);
    // A fresh run on the other market reuses the scene — redress first.
    s?.syncMarket();
    // Day 1 opens with the Shark walking past — the welcome hint paid
    // off in-scene. The scene guards it to once per lifetime + no motion
    // when reduced; the DOM fallback simply never gets it.
    if (day === 1) s?.sharkPass();
  });
  const idx = Math.min(2, Math.max(0, day - 1));
  document.querySelectorAll<HTMLElement>("#market-bg .lm-bg-layer").forEach((el, i) => {
    el.classList.toggle("is-on", i === idx);
  });
}

/** Rack focus: desk-work chapters (ch2's negotiation) push the street back
 *  — cooler, smaller, quieter — while your counter stays sharp. The world
 *  never leaves; it just stops being the subject. CSS transition does the
 *  move; reduced-motion gets an instant cut. */
export function streetFocus(mode: "full" | "recede"): void {
  document.getElementById("street-slot")?.classList.toggle("lm-street-recede", mode === "recede");
}

/** The "it changed" pop on the stall that just moved (scene path). */
export function scenePulse(index: number): void {
  void streetScene().then((s) => s?.pulse(index));
}

/** Companions' reaction — cheer/droop carried as a ~1.4s flag. */
export function sceneReactHome(cls: "lm-home-cheer" | "lm-home-droop"): void {
  void streetScene().then((s) => s?.reactHome(cls));
}

/** Stallholder steps up in-scene (Pixi) as well as in DOM. */
export function sceneStepUp(index: number | null): void {
  void streetScene().then((s) => s?.stepUp(index));
}

function sceneHitButtons(stalls: HTMLElement, c: StreetCounters, row: HTMLElement): void {
  const { lit, shut, total } = streetState(c);
  for (let i = 0; i < total; i++) {
    const stall = STALLS[i]!;
    const state = i < shut ? "shut" : i < lit ? "lit" : "dim";
    const stateWord = state === "lit" ? "lit" : state === "shut" ? "shuttered" : "dark";
    const rect = STALL_RECTS[i]!;
    const btn = el(
      "button",
      {
        class: `lm-stall lm-stall-hit ${state}`,
        "data-kind": stall.kind,
        "data-idx": String(i),
        type: "button",
        "aria-label": `${stall.name}, ${stateWord}`,
      },
    ) as HTMLElement;
    btn.style.left = `${((rect.fx - rect.w / 2) * 100).toFixed(2)}%`;
    btn.style.width = `${(rect.w * 100).toFixed(2)}%`;
    // Visible caption + state badge: lit/dark/shut is never glow-only.
    btn.append(stallName(stall.short), el("span", { class: `lm-stall-badge lm-stall-badge--${state}`, "aria-hidden": "true", text: state === "lit" ? "£" : state === "shut" ? "\u2715" : "·" }));
    const inspect = () => showStallNote(row, stall.kind, state, c);
    const hover = (on: boolean) => () => void streetScene().then((s) => s?.setHover(on ? i : null));
    btn.addEventListener("click", inspect);
    btn.addEventListener("mouseenter", () => { inspect(); hover(true)(); });
    btn.addEventListener("mouseleave", hover(false));
    btn.addEventListener("focus", () => { inspect(); hover(true)(); });
    btn.addEventListener("blur", hover(false));
    stalls.append(btn);
  }
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
  const useScene = streetSceneSupported();
  if (useScene) {
    stalls.classList.add("lm-street-stalls--scene");
    if (sceneHost) stalls.append(sceneHost); // moves the live canvas into the fresh row
    else {
      const pending = document.createElement("div");
      pending.className = "lm-street-scene lm-street-scene--pending";
      stalls.append(pending);
      void streetScene().then((s) => {
        if (s && sceneHost) {
          pending.replaceWith(sceneHost);
          s.refresh(); // host just entered layout — size the renderer
          s.setState(lit, shut);
        }
      });
    }
    sceneHitButtons(stalls, c, row);
    void streetScene().then((s) => s?.setState(lit, shut));
  } else {
    // Legacy DOM stalls — the no-WebGL fallback (and the probe's DOM path).
    const home = el("div", { class: "lm-stall-home", "aria-hidden": "true" });
    const sikiFig = mascotFigure("siki");
    sikiFig.classList.add("lm-home-fig", "siki");
    const zanaFig = mascotFigure("zana");
    zanaFig.classList.add("lm-home-fig", "zana");
    home.append(sikiFig, zanaFig);
    stalls.append(home);
    for (let i = 0; i < total; i++) {
      const stall = STALLS[i]!;
      const state = i < shut ? "shut" : i < lit ? "lit" : "dim";
      const stateWord = state === "lit" ? "lit" : state === "shut" ? "shuttered" : "dark";
      const span = el(
        "span",
        {
          class: `lm-stall ${state}`,
          "data-kind": stall.kind,
          "data-idx": String(i),
          role: "button",
          tabindex: "0",
          "aria-label": `${stall.name}, ${stateWord}`,
        },
      );
      const halo = document.createElement("i");
      halo.className = "lm-stall-halo";
      halo.setAttribute("aria-hidden", "true");
      span.append(halo, svgNode(stallSvg(stall.kind)), stallName(stall.short), el("span", { class: `lm-stall-badge lm-stall-badge--${state}`, "aria-hidden": "true", text: state === "lit" ? "£" : state === "shut" ? "\u2715" : "·" }));
      const inspect = () => showStallNote(row, stall.kind, state, c);
      span.addEventListener("click", inspect);
      span.addEventListener("mouseenter", inspect);
      span.addEventListener("focus", inspect);
      span.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); inspect(); }
      });
      stalls.append(span);
    }
  }
  // The money sits on its own line, never wrapped into the stall row.
  // Static headline (not a button) + a small Details toggle: the tally
  // must read as a number, not an action. Class kept for probes/a11y.
  const taken = money(c.toStreet, 0);
  const held = c.held ?? 0;
  const headline = held > 0 ? `${money(held, 0)} still on the street` : `${taken} to the street`;
  const meta = el("div", { class: "lm-street-meta" });
  const tally = el("span", { class: "lm-street-cap lm-street-tally", text: headline });
  const toggle = el("button", {
    class: "lm-street-books-toggle",
    type: "button",
    "aria-expanded": "false",
    "aria-label": held > 0
      ? `${money(held, 0)} of your invoices are due and still unchased. Show the breakdown.`
      : `The stalls keep their books — ${taken}. Show the breakdown.`,
    text: "Details",
  });
  const books = el("span", { class: "lm-street-books", hidden: true });
  for (const line of tallyLines(c)) books.append(el("span", { class: "lm-street-book-line", text: line }));
  // Whose money each lit stall holds — components only, never invented splits.
  books.append(el("span", { class: "lm-street-book-line lm-street-book-holdings", text: holdingsLine(c) }));
  meta.append(tally);
  // Progressive disclosure: no Details until there is something to
  // disclose — a breakdown of all-zeroes is noise, not information.
  if (c.toStreet > 0 || held > 0) {
    toggle.addEventListener("click", () => {
      const open = books.hidden;
      books.hidden = !open;
      books.classList.toggle("lm-street-books--open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    meta.append(toggle, books);
  }
  // The street's books live ON the counter: the tally + Details ride the
  // rail (the wooden edge between street and boards), not under the stalls.
  // The rail persists across renders, so replace its contents — a fresh
  // meta each time, never a stack of stale tallies. Falls back to the row
  // when no rail exists (tests, early renders).
  const rail = document.getElementById("counter-rail");
  if (rail) rail.replaceChildren(meta);
  else row.append(meta);
  row.append(stalls);
  if (!useScene) {
    // Ember motes — DOM fallback ambience only; the Pixi scene carries
    // its own in-canvas motes, so they never double up.
    const embers = el("div", { class: "lm-embers", "aria-hidden": "true" });
    for (let i = 0; i < 8; i++) embers.append(el("span", { class: "lm-ember" }));
    row.append(embers);
  }
  return row;
}
