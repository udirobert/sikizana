/**
 * The street scene — PixiJS diorama replacing the DOM stall strip's
 * visuals (v4 engine rebuild; docs/game/V3_DIRECTION.md §engine).
 *
 * What the engine buys that DOM could not:
 *  - real depth: ground shadows, per-stall scale/baseline variance,
 *    additive light pools that bloom *behind* figures (Light2D pattern)
 *  - a living cast: idle sway/bob/wag on a shared ticker, staggered,
 *    paused by reactions — the world runs between clicks
 *  - in-scene ambience: ember motes drift inside the same space as
 *    the stalls, not as an overlay
 *  - a day-grade: the whole street warms from dusk to dawn across
 *    the week, tied to the real day counter
 *
 * Honesty rails (unchanged): states come only from streetState();
 * textures are the same line-art cast, recoloured — no invented
 * detail. Under prefers-reduced-motion the ticker idles and the
 * scene renders static poses. If WebGL is unavailable the caller
 * falls back to the DOM stall strip — the game must never depend
 * on a renderer.
 */
import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { StallKind } from "../ui/street";

/* ── Layout contract (shared with the DOM hit-areas) ────────────────
 * Stall i's figure center as a fraction of scene width; the DOM
 * buttons use the same fractions so invisible hit-areas always sit
 * exactly on their sprites at any viewport width. */
export const STALL_FX = [0.15, 0.315, 0.48, 0.645, 0.81] as const;
export const HOME_FX = 0.035;
const HIT_W = 0.14; // fraction of width per hit-area

export interface SceneStallRect { fx: number; w: number }
export const STALL_RECTS: SceneStallRect[] = STALL_FX.map((fx) => ({ fx, w: HIT_W }));

const SCENE_H = 208;
/* Painted sprites carry real detail — they earn more pixels than the
 * old line-art did. Bumped from 128 → 148 so the cast actually reads. */
const STALL_H = 148;

/* ── Colour tokens (read live so theme changes propagate) ────────── */
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const C = {
  ink: () => cssVar("--lm-ink-dim", "#8b86b8"),
  amber: () => cssVar("--lm-amber", "#ffb454"),
  factor: () => cssVar("--lm-factor", "#f5c04e"),
  collector: () => cssVar("--lm-collector", "#b79bff"),
  shark: () => cssVar("--lm-shark", "#e5604f"),
  siki: () => cssVar("--lm-siki", "#ffb454"),
  zana: () => cssVar("--lm-zana", "#ff9e7a"),
};

function litColor(kind: StallKind): string {
  switch (kind) {
    case "factor": return C.factor();
    case "collector": return C.collector();
    case "shark": return C.shark();
    default: return C.amber();
  }
}

/* ── SVG → texture pipeline ────────────────────────────────────────
 * The cast is stroke-only line art styled by CSS; for Pixi we bake
 * the stroke colour into the markup and rasterize at 2×. */
const texCache = new Map<string, Texture>();

/* The SVG strings live in ui/street.ts as module-private consts.
 * Rather than duplicate art (drift risk), street.ts exports
 * `stallSvgMarkup`/`mascotSvgMarkup` — see street.ts. */
import { stallSvgMarkup, mascotSvgMarkup } from "../ui/street";
import { getMarketMode } from "../engine/market";

async function svgTexture(key: string, markup: string, stroke: string): Promise<Texture> {
  const hit = texCache.get(key);
  if (hit) return hit;
  const styled = markup
    .replace(/<svg /, `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="48" `)
    .replace(/(<svg[^>]*>)/, `$1<style>*{fill:none;stroke:${stroke};stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}</style>`);
  const url = URL.createObjectURL(new Blob([styled], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const px = 192;
    const cv = document.createElement("canvas");
    cv.width = px; cv.height = px;
    const ctx = cv.getContext("2d")!;
    // viewBox is 0 0 40 44 — letterbox into the square canvas.
    const scale = Math.min(px / 44, px / 40);
    const w = 40 * scale, h = 44 * scale;
    ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
    const tex = Texture.from(cv);
    texCache.set(key, tex);
    return tex;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ── Painted sprite pipeline (v5) ──────────────────────────────────
 * Recraft-generated sprites in public/assets/sprites/. One texture per
 * subject; states are carried by tint + the existing shade overlay, so
 * a single painted asset covers dim/lit/shut. Missing files fall back
 * to the rasterized line-art path below — the scene must never depend
 * on generated art being present. */
const paintedCache = new Map<string, Texture | null>();
async function paintedTexture(name: string): Promise<Texture | null> {
  if (paintedCache.has(name)) return paintedCache.get(name)!;
  try {
    const tex = await Assets.load<Texture>(`/assets/sprites/${name}.png`);
    paintedCache.set(name, tex);
    return tex;
  } catch (e) {
    console.warn("paintedTexture fail", name, e);
    paintedCache.set(name, null);
    return null;
  }
}
/* Painted sprites can't be recoloured per state like the baked SVG
 * strokes, so "dim" is a cool multiply-tint; "lit" is untinted white.
 * The dim tint stays light enough to read as a presence, not an absence:
 * the market exists before the player arrives, only the lit state is
 * earned (lit keeps untinted paint + glow + £ badge — no confusion). */
const PAINTED_DIM_TINT = 0xc9c2e4;

function glowTexture(color: string): Texture {
  const key = `glow:${color}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const px = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = px;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(px / 2, px / 2, 4, px / 2, px / 2, px / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color + "88");
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  const tex = Texture.from(cv);
  texCache.set(key, tex);
  return tex;
}

function moteTexture(): Texture {
  const hit = texCache.get("mote");
  if (hit) return hit;
  const px = 16;
  const cv = document.createElement("canvas");
  cv.width = cv.height = px;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, "rgba(255,214,140,0.9)");
  g.addColorStop(1, "rgba(255,214,140,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  const tex = Texture.from(cv);
  texCache.set("mote", tex);
  return tex;
}

/* ── Scene ───────────────────────────────────────────────────────── */

export interface StreetScene {
  setState(lit: number, shut: number): void;
  /** Re-read host size — call after the host enters layout. */
  refresh(): void;
  /** Stall index 0..4 scale-pop — the "it changed" beat. */
  pulse(index: number): void;
  setHover(index: number | null): void;
  reactHome(cls: "lm-home-cheer" | "lm-home-droop"): void;
  setDay(day: number): void;
  /** Redress generic stalls after a market switch (scene singleton persists). */
  syncMarket(): void;
  /** The Shark's shadow crosses the row once (day 1 — pays off the
   *  welcome hint). No-op under reduced motion or while passing. */
  sharkPass(): void;
  /** Stallholder steps up to your counter in-scene: lifts + enlarges the
   *  named stall's sprite for ~6s so the fiction performs in the place,
   *  not in a DOM overlay. Null clears. */
  stepUp(index: number | null): void;
  /** Stall figure rects in viewport px — origins for DOM coin flights. */
  stallRects(): { x: number; y: number; w: number; h: number }[];
  destroy(): void;
}

interface StallNode {
  root: Container;
  fig: Sprite;
  glow: Sprite;
  shade: Graphics;
  kind: StallKind;
  index: number;
  phase: number;
  baseY: number;
  /** Design height of the figure in px at scale()=1, incl. depth. */
  targetH: number;
  hover: boolean;
  pulseT: number; // >0 while a pulse tween runs
  gutterT: number; // >0 while the lantern gutters (flicker dip)
  /** Painted texture in use — states switch to tint instead of swap. */
  painted?: boolean;
  baseTex?: Texture;
}

const reduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function streetSceneSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export async function createStreetScene(
  host: HTMLElement,
  kinds: StallKind[],
): Promise<StreetScene | null> {
  const app = new Application();
  try {
    await app.init({
      backgroundAlpha: 0,
      antialias: true,
      preference: "webgl",
    });
  } catch {
    return null;
  }
  host.appendChild(app.canvas);
  app.canvas.style.position = "absolute";
  app.canvas.style.inset = "0";
  app.canvas.style.width = "100%";
  app.canvas.style.height = "100%";
  app.canvas.setAttribute("aria-hidden", "true");

  const W = () => host.clientWidth || 1;
  let viewH = SCENE_H;
  const scale = () => {
    const wScale = Math.min(1.15, Math.max(0.55, W() / 1150));
    // Compact mode (132px host): shrink the cast so it fits instead of squashing.
    const hScale = Math.max(0.5, viewH / SCENE_H);
    return Math.min(wScale, hScale);
  };

  /* Layers: ground → glows → figures → shade → motes → grade */
  const ground = new Container();
  const figures = new Container();
  const shadeLayer = new Container();
  const moteLayer = new Container();
  const grade = new Graphics();
  app.stage.addChild(ground, figures, shadeLayer, moteLayer, grade);

  const baseline = () => viewH - 26;
  const figH = () => STALL_H * scale();

  /* ── Home pitch: Siki & Zana, bigger than the stalls ── */
  const home = new Container();
  const siki = new Sprite(Texture.EMPTY);
  const zana = new Sprite(Texture.EMPTY);
  siki.anchor.set(0.5, 1);
  zana.anchor.set(0.5, 1);
  home.addChild(siki, zana);
  figures.addChild(home);

  /* ── Stalls ── */
  const stalls: StallNode[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const root = new Container();
    const glow = new Sprite(Texture.EMPTY);
    glow.anchor.set(0.5);
    glow.blendMode = "add";
    const shade = new Graphics();
    const fig = new Sprite(Texture.EMPTY);
    fig.anchor.set(0.5, 1);
    root.addChild(glow, shade, fig);
    figures.addChild(root);
    stalls.push({
      root, fig, glow, shade,
      kind: kinds[i]!, index: i,
      phase: i * 1.7, baseY: 0, targetH: 0, hover: false, pulseT: 0, gutterT: 0,
    });
  }

  /* Souq dressing: the two generic stalls wear brass-and-carpet paint on the
   *  Souq path; the three named keepers are characters, not architecture,
   *  and stay themselves in both markets. */
  const paintedName = (kind: StallKind): string =>
    getMarketMode() === "souq" && (kind === "cart" || kind === "awning") ? `${kind}_souq` : kind;
  let loadedMode = getMarketMode();

  /* ── Textures (async; scene shows empty for a frame at most) ── */
  const ink = C.ink();
  const loadStallPaint = async (s: StallNode): Promise<void> => {
    const name = paintedName(s.kind);
    const lit = litColor(s.kind);
    const painted = await paintedTexture(name);
    if (painted) {
      s.painted = true;
      s.baseTex = painted;
      s.fig.texture = painted;
      s.fig.tint = 0xffffff;
    } else {
      s.painted = false;
      s.baseTex = undefined;
      const dimT = await svgTexture(`stall:${s.kind}:dim`, stallSvgMarkup(s.kind), ink);
      const litT = await svgTexture(`stall:${s.kind}:lit`, stallSvgMarkup(s.kind), lit);
      s.fig.texture = dimT;
      (s as unknown as { litTex: Texture }).litTex = litT;
    }
    (s as unknown as { glowTex: Texture }).glowTex = glowTexture(lit);
    s.glow.texture = (s as unknown as { glowTex: Texture }).glowTex;
    layout();
  };
  const texJobs: Promise<void>[] = [];
  for (const s of stalls) texJobs.push(loadStallPaint(s));
  texJobs.push((async () => {
    const sikiTex = (await paintedTexture("siki")) ??
      await svgTexture("mascot:siki", mascotSvgMarkup("siki"), C.siki());
    const zanaTex = (await paintedTexture("zana")) ??
      await svgTexture("mascot:zana", mascotSvgMarkup("zana"), C.zana());
    siki.texture = sikiTex;
    zana.texture = zanaTex;
    layout();
  })());
  void Promise.all(texJobs);

  /* ── Ground shadows + light pools (redrawn on layout) ── */
  function drawGround(): void {
    ground.removeChildren().forEach((c) => c.destroy());
    const w = W();
    const by = baseline() + 6;
    const sc = scale();
    for (const s of stalls) {
      const x = STALL_FX[s.index]! * w;
      const g = new Graphics();
      g.ellipse(0, 0, 46 * sc, 9 * sc).fill({ color: 0x000000, alpha: 0.42 });
      g.position.set(x, by);
      ground.addChild(g);
    }
    // Home pitch shadow — wider, the companions share one spot.
    const hg = new Graphics();
    hg.ellipse(0, 0, 92 * sc, 12 * sc).fill({ color: 0x000000, alpha: 0.45 });
    hg.position.set(HOME_FX * w + 46 * sc, by);
    ground.addChild(hg);
  }

  /* ── Shutter slats for shut stalls ── */
  function drawShade(s: StallNode): void {
    s.shade.clear();
    const h = s.targetH * 0.72, w = h * 0.8;
    s.shade.rect(-w / 2, -h, w, h).fill({ color: 0x0b0918, alpha: 0.55 });
    s.shade.rect(-w / 2, -h, w, h).stroke({ color: 0x000000, alpha: 0.6, width: 2 });
    for (let i = 1; i <= 3; i++) {
      const y = -h + (h / 4) * i;
      s.shade.moveTo(-w / 2 + 6, y).lineTo(w / 2 - 6, y).stroke({ color: 0x3a3560, alpha: 0.8, width: 3 });
    }
    // A small ✕ — state is shape, never colour-only.
    const cx = 0, cy = -h * 0.55, r = h * 0.1;
    s.shade.moveTo(cx - r, cy - r).lineTo(cx + r, cy + r).stroke({ color: 0xb79bff, alpha: 0.9, width: 3.5 });
    s.shade.moveTo(cx + r, cy - r).lineTo(cx - r, cy + r).stroke({ color: 0xb79bff, alpha: 0.9, width: 3.5 });
  }

  /* ── Layout: positions from shared fractions ──
   * root.scale stays a pure multiplier (~1): all sizing lives in
   * targetH/fig.scale so hover/pulse pops never compound depth. */
  function layout(nextH?: number): void {
    if (typeof nextH === "number" && nextH > 0) viewH = nextH;
    const w = W();
    const sc = scale();
    const by = baseline();
    drawGround();
    for (const s of stalls) {
      // Depth: outer stalls sit slightly further back (smaller, higher).
      const depth = 1 - Math.abs(s.index - 2) * 0.04;
      s.targetH = STALL_H * sc * depth;
      s.baseY = by - Math.abs(s.index - 2) * 5;
      s.root.position.set(STALL_FX[s.index]! * w, s.baseY);
      s.root.scale.set(1);
      s.root.alpha = 1;
      const tex = s.fig.texture;
      if (tex && tex !== Texture.EMPTY) s.fig.scale.set(s.targetH / tex.height);
      // Glow pool blooms on the ground behind the figure's feet.
      s.glow.position.set(0, -s.targetH * 0.1);
      s.glow.scale.set((s.targetH * 1.7) / 128);
      s.glow.alpha = 0;
      // Shade hugs the figure's lower body.
      s.shade.position.set(0, -s.targetH * 0.04);
      s.shade.visible = false;
    }
    // Home duo — Siki left, Zana right, ~1.45× stall height.
    const hh = STALL_H * sc * 1.45;
    const hx = HOME_FX * w;
    const homeBy = by + 6;
    for (const [spr, tex, dx] of [[siki, siki.texture, 0], [zana, zana.texture, hh * 0.6]] as const) {
      if (tex && tex !== Texture.EMPTY) {
        spr.scale.set(hh / tex.height);
        spr.position.set(hx + dx, homeBy);
      }
    }
    resizeGrade();
  }

  function resizeGrade(): void {
    grade.clear();
    grade.rect(0, 0, W(), viewH).fill({ color: 0x000000, alpha: 0 });
  }

  /* ── Motes — in-scene ember drift ── */
  interface Mote { spr: Sprite; speed: number; sway: number; phase: number; x0: number }
  const motes: Mote[] = [];
  if (!reduced()) {
    const tex = moteTexture();
    for (let i = 0; i < 14; i++) {
      const spr = new Sprite(tex);
      spr.anchor.set(0.5);
      const size = 6 + Math.random() * 10;
      spr.scale.set(size / 16);
      spr.alpha = 0.12 + Math.random() * 0.22;
      moteLayer.addChild(spr);
      motes.push({
        spr,
        speed: 9 + Math.random() * 14, // px/s upward
        sway: 6 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        x0: Math.random(),
      });
    }
  }

  /* ── State ── */
  let lit = 1, shut = 0, day = 1;
  const stallState = (i: number): "shut" | "lit" | "dim" =>
    i < shut ? "shut" : i < lit ? "lit" : "dim";

  function applyState(): void {
    for (const s of stalls) {
      const st = stallState(s.index);
      if (s.painted && s.baseTex) {
        s.fig.texture = s.baseTex;
        s.fig.tint = st === "lit" ? 0xffffff : PAINTED_DIM_TINT;
      } else {
        const litTex = (s as unknown as { litTex?: Texture }).litTex;
        s.fig.texture = st === "dim" || st === "shut"
          ? texCache.get(`stall:${s.kind}:dim`) ?? s.fig.texture
          : litTex ?? s.fig.texture;
        s.fig.tint = 0xffffff;
      }
      s.glow.visible = st === "lit";
      s.shade.visible = st === "shut";
      if (st === "shut") drawShade(s);
      // Dim stalls read as present-but-unlit silhouettes (the market exists
    // before you arrive; only the lit state is earned). Lit keeps the glow
    // + untinted paint + £ badge, so the states never collide.
    s.root.alpha = st === "dim" ? 0.8 : st === "shut" ? 0.85 : 1;
    }
    applyDayGrade();
  }

  /* Day grade — dusk indigo deepening toward dawn amber. */
  function applyDayGrade(): void {
    const t = Math.min(1, Math.max(0, (day - 1) / 3));
    // dusk #2a2350 → dawn #ffbe78; alpha breathes 0.10 → 0.16
    const r = Math.round(42 + (255 - 42) * t);
    const g = Math.round(35 + (190 - 35) * t);
    const b = Math.round(80 + (120 - 80) * t);
    grade.clear();
    grade.rect(0, 0, W(), viewH).fill({ color: (r << 16) | (g << 8) | b, alpha: 0.05 + t * 0.07 });
  }

  /* ── The Shark's shadow pass (day 1, once per scene lifetime) ──
   * A long low shadow crosses the row over ~4.5s — the welcome hint
   * ("The Shark walks past before the shutters open") paid in-scene.
   * Pure Graphics silhouette, no new art; DOM fallback simply skips it. */
  let passT = -1;
  let passShadow: Graphics | null = null;
  let passDone = false;
  function sharkPass(): void {
    if (reduced() || passDone || passT >= 0) return;
    passDone = true;
    passT = 0;
    passShadow = new Graphics();
    passShadow.ellipse(0, 0, 150, 15).fill({ color: 0x05030f, alpha: 1 });
    passShadow.ellipse(60, -26, 46, 20).fill({ color: 0x05030f, alpha: 1 });
    passShadow.alpha = 0;
    moteLayer.addChild(passShadow);
  }

  /* ── Ticker: idle life, staggered; paused poses under reduced motion ── */
  let homeReact: { cls: string; until: number } | null = null;
  let steppedUp: { index: number; until: number } | null = null;
  const t0 = performance.now();
  app.ticker.add(() => {
    const t = (performance.now() - t0) / 1000;
    const calm = reduced();
    for (const s of stalls) {
      const st = stallState(s.index);
      if (!calm) {
        // Idle business bob + sway — the street never fully sleeps.
        const bob = Math.sin(t * 0.55 + s.phase) * (st === "shut" ? 1.1 : 1.8);
        const sway = Math.sin(t * 0.4 + s.phase * 1.3) * 0.022;
        s.root.position.y = s.baseY + bob * (st === "dim" ? 0.5 : 1);
        s.root.rotation = sway;
        // Lit glow breathes on a fast shimmer; hover lifts. Rare random
        // gutter dips keep the lanterns candle-lit, never fluorescent.
        if (st === "lit") {
          let gutter = 1;
          if (s.gutterT > 0) {
            s.gutterT = Math.max(0, s.gutterT - app.ticker.deltaMS);
            gutter = 0.35;
          } else if (Math.random() < 0.0012) {
            s.gutterT = 150 + Math.random() * 250;
          }
          const pulse = 0.55 + Math.sin(t * 1.4 + s.phase) * 0.18
            + Math.sin(t * 7.3 + s.phase * 3) * 0.05;
          s.glow.alpha = (s.hover ? Math.min(1, pulse + 0.25) : pulse) * gutter;
        }
        // Hover lift + change-pulse pop, eased toward target.
        // A stepped-up stallholder approaches your counter: larger + lifted.
        let mult = s.hover ? 1.05 : 1;
        let lift = 0;
        if (steppedUp && steppedUp.index === s.index) {
          if (performance.now() < steppedUp.until) {
            mult *= 1.18;
            lift = -14;
            s.glow.alpha = Math.max(s.glow.alpha, 0.85);
          } else steppedUp = null;
        }
        if (s.pulseT > 0) {
          s.pulseT = Math.max(0, s.pulseT - app.ticker.deltaMS);
          const k = s.pulseT / 420;
          mult *= 1 + Math.sin((1 - k) * Math.PI) * 0.16;
        }
        s.root.scale.set(mult);
        s.root.position.y += lift;
      } else {
        s.root.position.y = s.baseY;
        s.root.rotation = 0;
        s.glow.alpha = st === "lit" ? 0.7 : 0;
        s.root.scale.set(s.hover ? 1.03 : 1);
      }
    }
    // Home duo: Zana's wag, Siki's slow look — overridden by reactions.
    const react = homeReact && performance.now() < homeReact.until ? homeReact.cls : null;
    const homeY = baseline() + 6; // matches layout()'s homeBy
    if (react === "lm-home-cheer" && !calm) {
      const hop = Math.abs(Math.sin(t * 9)) * 10;
      siki.position.y = homeY - hop;
      zana.position.y = homeY - hop;
      siki.rotation = Math.sin(t * 9) * 0.06;
      zana.rotation = -Math.sin(t * 9) * 0.08;
    } else if (react === "lm-home-droop" && !calm) {
      const sag = Math.min(1, (homeReact!.until - performance.now()) / 1400);
      siki.position.y = homeY + 7 * sag;
      zana.position.y = homeY + 7 * sag;
      siki.rotation = 0.05 * sag;
      zana.rotation = -0.04 * sag;
      siki.alpha = zana.alpha = 1 - 0.25 * sag;
    } else if (!calm) {
      siki.alpha = zana.alpha = 1;
      const wag = Math.sin(t * 3.4) * 0.09;
      zana.rotation = wag;
      zana.position.y = homeY + Math.sin(t * 3.4) * 1.5;
      const look = Math.sin(t * 0.7) * 0.05;
      siki.rotation = look;
      siki.position.y = homeY + Math.sin(t * 0.7 + 1) * 1.2;
    } else {
      siki.rotation = zana.rotation = 0;
      siki.alpha = zana.alpha = 1;
      siki.position.y = homeY;
      zana.position.y = homeY;
    }
    // The Shark's shadow crosses once, then is destroyed.
    if (passT >= 0 && !calm) {
      passT = Math.min(1, passT + app.ticker.deltaMS / 4500);
      const w = W();
      passShadow!.position.set(
        w + 220 - passT * (w + 520),
        baseline() - 14 + Math.sin(passT * Math.PI * 3) * 4,
      );
      passShadow!.alpha = Math.sin(passT * Math.PI) * 0.55;
      if (passT >= 1) {
        moteLayer.removeChild(passShadow!);
        passShadow!.destroy();
        passShadow = null;
        passT = -1;
      }
    }
    // Motes rise and sway.
    if (!calm) {
      for (const m of motes) {
        const cyc = ((t * m.speed) / viewH + m.phase) % 1;
        m.spr.position.set(
          m.x0 * W() + Math.sin(t * 0.8 + m.phase) * m.sway,
          viewH - cyc * (viewH + 24) + 8,
        );
        m.spr.alpha = 0.1 + Math.sin(cyc * Math.PI) * 0.3;
      }
    }
  });

  /* ── Resize — manual: the host is detached at init, so resizeTo
   * would bind to a 0×0 element. refresh() runs on attach + window resize. */
  const resizeRenderer = (): void => {
    const w = host.clientWidth || 800;
    // Compact mode slims the host (132px): lay out from the host height so
    // the 208px bitmap is never squashed into it — the cast keeps shape.
    viewH = host.clientHeight > 0 ? host.clientHeight : SCENE_H;
    app.renderer.resize(w, viewH);
    layout();
  };
  window.addEventListener("resize", resizeRenderer);
  resizeRenderer();
  applyState();

  return {
    setState(l, s) { lit = l; shut = s; applyState(); },
    refresh: resizeRenderer,
    pulse(index) {
      const s = stalls[index];
      if (s) s.pulseT = 420;
    },
    setHover(index) {
      stalls.forEach((s) => { s.hover = s.index === index; });
    },
    reactHome(cls) { homeReact = { cls, until: Date.now() + 1400 }; },
    stepUp(index) { steppedUp = index === null ? null : { index, until: performance.now() + 6200 }; },
    setDay(d) { day = d; applyDayGrade(); },
    sharkPass() { sharkPass(); },
    syncMarket() {
      // A new run on the other market reuses the scene singleton — redress
      // the two generic stalls when the mode moved under it. Idempotent.
      if (getMarketMode() === loadedMode) return;
      loadedMode = getMarketMode();
      void Promise.all(stalls.map(loadStallPaint)).then(() => applyState());
    },
    stallRects() {
      const w = W(), h = viewH;
      return stalls.map((s) => {
        const fw = HIT_W * w;
        return {
          x: STALL_FX[s.index]! * w - fw / 2,
          y: h - figH() - 30,
          w: fw,
          h: figH() + 40,
        };
      });
    },
    destroy() {
      window.removeEventListener("resize", resizeRenderer);
      app.destroy(true, { children: true });
    },
  };
}
