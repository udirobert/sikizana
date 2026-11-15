/**
 * Particle vocabulary — one pooled emitter, five material presets.
 * Grammar borrowed from Phaser's particle emitter examples
 * (lifespan / speed-range / scale start→end / gravity / blend) and
 * Godot's GPUParticles2D + ParticleProcessMaterial (one system, many
 * presets). DOM implementation: pooled <i> nodes in #fx-layer,
 * animated with WAAPI, recycled on finish — zero per-event churn.
 *
 * Valence rule (FEEL_MATRIX): ambient `trail()` motes are dim, slow,
 * non-directional; consequence `burst()`s are bright, fast, and fire
 * from the thing that moved. Ambience must never mimic an event.
 */

export type FxShape = "coin" | "mote" | "petal" | "shard" | "dot";

export interface BurstOpts {
  shape?: FxShape;
  /** Particles to fire. Clamped — this is a vocabulary, not a bomb. */
  count?: number;
  /** CSS colors; defaults to the shape's preset palette. */
  colors?: string[];
  /** Where they come from — a DOMRect or viewport {x,y,w,h}. */
  origin?: DOMRect | { x: number; y: number; w?: number; h?: number };
}

interface Preset {
  /** px size [w,h] — mirrored by .lm-fx-<shape> in tokens.css */
  speed: [number, number];   // horizontal launch speed px/s-ish
 rise: number;               // -1 launches upward, 0 radial, + drifts down
  gravity: number;           // extra downward pull px added to end position
  life: [number, number];    // ms range
  spin: number;              // max rotation deg
  scaleEnd: number;
  arc: number;               // peak height above the launch line
}

const PRESETS: Record<FxShape, Preset> = {
  coin:  { speed: [120, 260], rise: -1,   gravity: 60,  life: [650, 900],  spin: 0,   scaleEnd: 0.35, arc: 46 },
  mote:  { speed: [10, 36],  rise: -1,   gravity: -14, life: [1500, 2300], spin: 0,   scaleEnd: 0.4,  arc: 10 },
  petal: { speed: [26, 80],  rise: -0.35, gravity: 90, life: [1200, 1700], spin: 340, scaleEnd: 0.7,  arc: 18 },
  shard: { speed: [190, 380], rise: 0,    gravity: 130, life: [480, 720],  spin: 220, scaleEnd: 0.5,  arc: 8 },
  dot:   { speed: [80, 180], rise: -0.6, gravity: 40,  life: [700, 1000],  spin: 0,   scaleEnd: 0.3,  arc: 22 },
};

const DEFAULT_COLORS: Record<FxShape, string[]> = {
  coin:  ["#ffd166", "#ffb454"],
  mote:  ["rgba(190,190,225,0.55)"],
  petal: ["#d9c9a4", "#c4b28c"],
  shard: ["#ff7b72"],
  dot:   ["#b79bff"],
};

const POOL_SIZE = 36;
const MAX_PER_BURST = 40;

let layer: HTMLElement | null = null;
const pools = new Map<FxShape, HTMLElement[]>();

const reduced = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function fxLayer(): HTMLElement {
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.append(layer);
  }
  return layer;
}

function poolFor(shape: FxShape): HTMLElement[] {
  let pool = pools.get(shape);
  if (!pool) {
    pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = document.createElement("i");
      p.className = `lm-fx lm-fx-${shape}`;
      p.style.display = "none";
      fxLayer().append(p);
      pool.push(p);
    }
    pools.set(shape, pool);
  }
  return pool;
}

function spawn(shape: FxShape, preset: Preset, color: string, ox: number, oy: number, ow: number, oh: number): void {
  const node = poolFor(shape).find((n) => n.style.display === "none");
  if (!node) return; // pool exhausted — skip, never allocate mid-beat
  const x = ox + Math.random() * ow;
  const y = oy + Math.random() * oh;
  node.style.display = "";
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.background = color;
  node.style.opacity = "1";

  // Launch angle: `rise` biases the fan upward (-1) or radial (0).
  const base = preset.rise === 0 ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * (preset.rise === -1 ? 2.4 : 1.6);
  const speed = preset.speed[0] + Math.random() * (preset.speed[1] - preset.speed[0]);
  const dx = Math.cos(base) * speed * 0.55;
  const dy = Math.sin(base) * speed * 0.55 * (preset.rise === 0 ? 1 : 1);
  const life = preset.life[0] + Math.random() * (preset.life[1] - preset.life[0]);
  const spin = (Math.random() - 0.5) * 2 * preset.spin;
  const scaleFrom = 0.6 + Math.random() * 0.5;
  const arc = preset.arc * (0.6 + Math.random() * 0.8);

  const endX = dx * (life / 1000);
  const endY = dy * (life / 1000) + preset.gravity * 0.09 + arc * 0.4;
  const midX = dx * (life / 2000);
  const midY = dy * (life / 2000) - arc;

  const anim = node.animate([
    { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", opacity: 1 },
    { transform: `translate(calc(-50% + ${midX.toFixed(1)}px), calc(-50% + ${midY.toFixed(1)}px)) scale(${(scaleFrom * 1.15).toFixed(2)}) rotate(${(spin * 0.5).toFixed(0)}deg)`, opacity: 0.9, offset: 0.45 },
    { transform: `translate(calc(-50% + ${endX.toFixed(1)}px), calc(-50% + ${endY.toFixed(1)}px)) scale(${preset.scaleEnd}) rotate(${spin.toFixed(0)}deg)`, opacity: 0 },
  ], { duration: life, easing: "cubic-bezier(.25,.6,.4,1)" });
  anim.onfinish = () => { node.style.display = "none"; };
}

function originBox(origin?: BurstOpts["origin"]): { x: number; y: number; w: number; h: number } {
  if (!origin) {
    return { x: window.innerWidth / 2 - 20, y: window.innerHeight / 2 - 20, w: 40, h: 40 };
  }
  if (origin instanceof DOMRect) {
    return { x: origin.left, y: origin.top, w: origin.width, h: origin.height };
  }
  return { x: origin.x, y: origin.y, w: origin.w ?? 24, h: origin.h ?? 24 };
}

/** Fire a consequence burst. No-op under reduced motion or before #fx-layer exists. */
export function burst(opts: BurstOpts = {}): void {
  if (reduced()) return;
  const shape = opts.shape ?? "dot";
  const preset = PRESETS[shape];
  const colors = opts.colors ?? DEFAULT_COLORS[shape];
  const o = originBox(opts.origin);
  const n = Math.min(opts.count ?? 14, MAX_PER_BURST);
  for (let i = 0; i < n; i++) {
    spawn(shape, preset, colors[i % colors.length]!, o.x, o.y, o.w, o.h);
  }
}

/** Ambient drift — dim, slow, non-directional. For world texture only. */
export function trail(opts: BurstOpts = {}): void {
  burst({ ...opts, shape: opts.shape ?? "mote", count: Math.min(opts.count ?? 10, 18) });
}
