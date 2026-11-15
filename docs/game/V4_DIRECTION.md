# V4 Direction — Engine Rebuild (the street becomes a scene)

Judge feedback after v3: "UI/UX too simple to win." Three passes of
motion/particles on the same DOM architecture hit its ceiling — the
fix is not more decoration, it is a real renderer.

## What changed

`src/scene/streetScene.ts` — a PixiJS 8 scene that replaces the DOM
stall strip's *visuals* while DOM keeps the *semantics*:

- **Canvas scene** (`#lm-street-scene`, 208px): stalls, Siki & Zana,
  ground shadows, additive light pools, shutter slats, in-canvas
  ember motes, and a dusk→dawn day-grade — all on one ticker.
- **DOM hit-areas** (`.lm-stall-hit`): real `<button>`s positioned
  over the sprites via shared layout fractions (`STALL_FX`), so
  inspect/keyboard/aria are pixel-identical to the old strip.
- **Legacy fallback**: `streetSceneSupported()` (WebGL check) gates
  the whole path — no WebGL → the old DOM stalls render unchanged.
  The UI probe (`--disable-gpu`) exercises exactly that path.
- **Textures**: the canonical SVG cast (single source in
  `ui/street.ts`) is recoloured per state and rasterized at 2× —
  dim ink, faction-lit, mascot ambers — no art drift, no new assets.

## Scene behaviours (ticker, all reduced-motion gated)

- Staggered idle bob/sway per stall; shuttered stalls bob slower
  (occupied, not dead); lit stalls' glow pools breathe.
- Home duo: Zana tail-wag oscillation, Siki slow look-around;
  cheer = shared hop, droop = shared sag — driven by the same
  `homeReact` flag the DOM path used.
- `pulse(index)` scale-pop on the stall that just changed;
  `setHover` lifts the sprite under the DOM hit-area.
- `setDay(n)` warms the grade dusk→dawn across ch1 days and the
  finale (day 4 = market close).

## Wiring

- `renderStreet()` mounts/moves the persistent scene host into each
  rebuilt row; `setState(lit, shut)` mirrors `streetState()` —
  frozen semantics untouched.
- `main.ts`: `scenePulse` on newly-lit/shuttered stalls,
  `sceneReactHome` alongside the DOM flag, `noteSceneDay` dep into
  ch1 (`sceneDay`), day 4 at the finale.
- `record-run.mjs --gpu`: keeps WebGL alive in headless captures so
  review screenshots show the real scene (default stays
  `--disable-gpu` for the DOM probe).

## Verified

- tsc clean · 84/84 Vitest · UI probe all green (fallback path) ·
  REGCHECK PASS · CDP probe: canvas 880×208 mounted, 5 hit buttons
  positioned, lit state + inspect + zero page errors (scene path) ·
  itch.zip rebuilt (138 files).
- Screenshots: `game/screenshots/v13/` → `~/Downloads/late-market-screenshots-v13/`
  (captured with `--gpu` so the Pixi scene is what you see).

## Honest caveats

- The cast is still line-art, now rasterized — the engine buys
  *behaviour and light*, not painted fidelity. Painted sprites are
  the obvious next art pass and drop into the same texture pipeline.
- Scene height is a fixed 208px strip; it is not yet a full-screen
  diorama. That is the v5 conversation if this lands.
