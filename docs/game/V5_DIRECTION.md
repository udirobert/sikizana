# V5 Direction — the painted world

**Premise.** The Duo proved the bar: hand-painted gouache storybook sprites
read as *finished objects*. Everything else — flat panels, hard rectangles,
a single dim backdrop — reads as a wireframe wearing the art. V5 rebuilds
the presentation as one painted world: the interface is scenery, not chrome.

**Sequencing (approved): world first, materials second.**

## Phase B — the world

1. **Three panorama backdrops** — dusk / deep night / pre-dawn, generated in
   the same gouache style as the cast. Crossfaded on the real day counter
   (`setDay` already exists in the Pixi scene; the DOM backdrop layer follows
   it). The week visibly moves through the night — a mechanic DOM could
   never carry.
2. **Title key-art** — a composed scene of Siki & Zana at the stall. First
   thing judges see; doubles as market-pick backdrop.
3. **Market-pick painted stalls** — the picker cards show the real painted
   cart/awning sprites instead of line-art SVG.

## Phase A — materials (next)

Wood, parchment, brass, ink — a material kit every component is built from:
panels become boards, choices become pinned tags, buttons get physical
pressed states, the till becomes a scale. Irregular edges via border-image /
SVG masks. Text stays DOM — painted lettering is illegible; craft lives in
surfaces and shadows.

## Rails

- Frozen engine, audited arithmetic, semantic DOM, Pixi/DOM split, a11y
  hit-areas, reduced-motion, no-WebGL fallback — all unchanged.
- Generated assets live in `art-src/` (raws) → `public/assets/` (shipped).
- Honesty: no painted detail may imply ledger facts the engine doesn't have.
