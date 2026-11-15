# V3 Direction — The Feel Pass

**Status:** approved direction, detailed spec. Judge feedback: "UI/UX too
simple to win." V2 fixed composition; V3 fixes *game feel* — the layer
that makes a game feel like a game rather than a styled document.

**Hard constraint (unchanged):** presentation only. `dayChoices()`,
`streetState()`, ledger schema, debrief maths, experiment semantics —
frozen. Every system below reads real counters; nothing invents numbers
or adds timers/pressure.

---

## 0. First principles

The references converge on one claim: **richness is composed, not
painted.** A shipped game is a stack of small, named, reusable feel
primitives — camera moves, tween curves, particle process materials,
named easings — each borrowed from a catalogue, composed per beat. Our
game has ~6 such primitives; the exemplars ship dozens. V3 is therefore
not "add effects" — it is **adopt a catalogue of 15 named techniques,
each with a defined slot in our event vocabulary**, then bind every
beat to its recipe.

The 15 techniques below were read from source, not imagined:
`phaserjs/examples@master public/3.86/src/`, `godot-demo-projects@master
2d/`, and OpenTTD's published feature set.

---

## The 15 borrowed techniques

Each entry: **source → what it actually is → how we use it → where it
lands in our code.**

### Camera & framing (Phaser `src/camera/`)

**1. `cam.pan(x, y, duration, ease)` + `cam.zoomTo()`**
(`camera/pan to.js`, `camera/zoom to.js` — eases `'Power2'`,
`'Elastic'`, `'Sine.easeInOut'`).
Panning is never a cut; it *travels*. → Our chapter transitions stop
being opacity fades and become a slow drift: `#game-cam` translates
6-10px over 600ms with a soft ease when a chapter opens, and the street
strip counter-drifts 2px the other way (parallax, already half-built).
Chapter change = camera *moves*, not content *swaps*.

**2. `cam.shake(duration)` — decaying oscillation**
(`camera/shake.js`).
Reserved for impacts; Phaser defaults ~500ms but games tune to 150-250.
→ `camera.shake(3)` = 2-3px, ~160ms, 3 decaying oscillations. Fired ONLY
on: Shark drip begins, Collector shutters, finale total. Three beats in
the whole game — scarcity is what makes it land.

**3. `cam.flash()`**
(`camera/flash.js`) — a full-frame colour pulse on impact.
→ Chapter turns get a 120ms warm-amber flash at 8% opacity (not white —
our palette is lantern, not stadium). The cinematic→Ch.1 reveal uses it.

**4. `cam.fade()` in/out**
(`camera/fade.js`, `camera/camera fade in and out.js`).
→ Kept for the dusk→dawn daybreak veil (already shipped) and reused for
ch3→finale — the only true "scene change" in the game deserves the only
full fade.

**5. Deadzone follow** (`camera/follow sprite with deadzone.js` —
camera ignores input inside a 400×200px deadzone).
→ Our pointer parallax gets a deadzone: sub-8px pointer movement does
nothing. Prevents the backdrop "swimming" when the mouse is still —
the jitter that makes cheap parallax feel seasick.

### Tweens & easing (Phaser `src/tweens/`)

**6. Named ease vocabulary** (`tweens/eases/back.js` — `Back.in/out`,
`Bounce`, `Elastic`, `Sine.easeInOut`; every tween takes `.set_ease()`).
→ We adopt the same named-curve discipline in CSS: document our four
workhorse curves once (`--lm-ease-out` = cubic-bezier(.2,.9,.3,1.2) ≈
Back.out for landings; `--lm-ease-soft` ≈ Sine.inOut for travels;
`--lm-ease-punch` for the 140ms beat punch). Every new animation picks
a named curve — no more ad-hoc `ease-out` everywhere.

**7. Tween chains with `parallel()`** (`tweens/chains/chest
sequence.js` — sequential tweens, parallel sub-tweens, `bounce.out`
landing).
→ The finale total: stalls burst in *sequence* (chain, 80ms stagger =
the street's cost revealed stall by stall) while the camera shake runs
`parallel`. DOM: `element.animate()` calls chained via
`animation.finished.then()` — same semantics as Phaser's chain.

**8. `tween_property` relative moves + `as_relative()`** (tween demo
uses `position:x, 200.0` relative).
→ Our coin-flight already animates between rects; extend it to support
*relative* tweens so the till delta chip can "kick" upward 6px relative
to its current position without measuring — same trick, less code.

### Particles (Phaser `src/game objects/particle emitter/`)

**9. Emitter parameter grammar** (`explode emitter.js`:
`lifespan:4000, speed:{min:150,max:250}, scale:{start:.8,end:0},
gravityY:150, blendMode:'ADD'`, then `emitter.explode(16)` on click).
→ This IS our `fx.ts` spec, verbatim: every burst declares
lifespan/speed-range/scale-start→end/gravity/blend. `blendMode:'ADD'`
maps to CSS `mix-blend-mode: screen` on `#fx-layer` children — coin
sparks literally glow-add onto the scene instead of painting over it.

**10. `emitting:false` + fire-on-demand** (same example — emitter sits
dormant until `explode()`).
→ Our particle pool: create N `<i>` nodes once per burst-type at game
start (hidden), `explode()` animates them via WAAPI and recycles.
Zero per-event DOM churn; matches Phaser's pooled-emitter model and
keeps GC silent during play.

**11. `createGravityWell` / gravity processor** (`gravity processor.js`).
→ Petals (skipped bills) get `gravityY` equivalent: they accelerate
downward as they fade — paper falls. Motes get negative gravity (rise).
One parameter per shape, exactly like Phaser's per-emitter gravity.

**12. Emit zones / distributed origins** (`add emit zone.js`,
`emitter zone total.js`).
→ The finale burst doesn't fire from one point — each stall is an emit
zone, particles spawn distributed across the stall's width. Our
`burst({origin: rect})` already takes a rect; we sample x uniformly
inside it.

### Godot `2d/` demos

**13. `GPUParticles2D` + `ParticleProcessMaterial`** (`2d/particles/` —
one material, many parameter presets).
→ Confirms the architecture: ONE particle system, FIVE material presets
(`coin/mote/petal/shard/dot`). In DOM terms: one `#fx-layer`, five CSS
classes. If we ever need a sixth shape it's a preset, not a system.

**14. `create_tween()` chains: `set_trans` on Tween, `set_ease` per
Tweener, `parallel()`** (`2d/tween/main.gd` — the demo literally lets you
compose sequential+parallel tweens with different eases per step).
→ This is the formal justification for our camera+fx composition:
`camera.shake()` and `burst()` run as *parallel tweeners* under one
"consequence" parent tween; the actor step-up and coin flight are
*sequential* steps after it. We implement a 30-line `sequence()` helper
(a tween-chain shim over `animation.finished`) rather than ad-hoc
setTimeout spaghetti — timeouts already bit us once (the homeReact
flag exists because of one).

**15. `lights_and_shadows` / `glow` (`Light2D` + glow map,
`2d/glow/`)**
→ Lit stalls currently get `drop-shadow` filter on the SVG. Godot's
lesson: light is a *layer*, not a filter — add a radial-gradient halo
div *behind* each lit stall (`.lm-stall-halo`, blend screen, pulsing
with the existing breathe). The stall figure stays crisp; the light
blooms around it. Cheap, huge depth payoff — this is the single most
"expensive-looking" CSS trick available.

### OpenTTD (published feature set, openttd.org/about)

**16. "Snappy and sticky windows that always stay on top and neatly
align"**
→ Our panels already feel like pinned objects; formalize it: every
chapter surface gets consistent margins and *never* re-centers between
beats. The stage column keeps a fixed left edge — content grows
downward only. Judges read layout stability as craft.

**17. "Cost estimation with the shift key" + "colour coded vehicle
profits"**
→ The till-breakdown popover (P4) is literally OpenTTD's cost-estimation
pattern: hover the money, see the components. And profit colour-coding
maps to our ledger deltas — green in / red out is already the rule;
audit that EVERY money surface obeys it (stat cards, chips, murmurs).

**18. News feed / message queue**
→ `#street-whisper` currently shows one line. OpenTTD's ticker pattern:
make it a 2-line feed — newest on top, previous fades down and out
after ~6s. Chapters push whispers; the street *remembers* recent events
visually. Cheap DOM, big "the world noticed" payoff.

---

## Workstreams (build order)

1. **`ui/fx.ts` + `#fx-layer`** — pooled emitter, 5 presets, WAAPI,
   `mix-blend-mode: screen`, reduced-motion early-return. Techniques
   9-12, 13.
2. **`ui/camera.ts` + `#game-cam` rig** — idle drift (with deadzone,
   tech 5), punch (tech 6 curve), settle, shake (tech 2), flash (tech
   3), directional pan for chapter turns (tech 1), fade for ch3→finale
   (tech 4). Sticky/fixed audit; `#street-slot` stays outside the rig.
3. **`ui/tween.ts` — the 30-line chain shim** (tech 14) — everything
   above composes through it; kills setTimeout ordering bugs.
4. **Wire `noteStreet` + chapter transitions** to camera+fx — first
   *felt* pass.
5. **Ambient world sim** — per-stall business cycles, lantern hue
   flicker, Zana tail-wag / Siki look-around (pauses during real
   reactions). Plus **stall halos** (tech 15).
6. **Inspection** — till breakdown popover (tech 17), stall popover
   upgrade, choice-arm tags, whisper feed (tech 18), panel stability
   audit (tech 16).
7. **`docs/game/FEEL_MATRIX.md`** — every beat → {stinger, camera,
   particles, actor, surface}; doubles as probe checklist.

## Verification (unchanged rails + new probes)

- `tsc --noEmit`, `vitest` (84), `record-run.mjs --mode ui`,
  `regcheck.mjs`, `build-itch.mjs`.
- DOM probe additions: camera transform present on beats, `.lm-fx`
  particle count >0 then returns to 0 (pool recycling), reduced-motion
  ⇒ zero fx/camera DOM output, `#street-slot` sticky still computed.
- Screenshot set v12; the *feel* claims still need a human playthrough.

## Named risks

- **Motion sickness:** idle drift + shake stay tiny; shake reserved for
  3 beats; deadzone kills parallax swim. Idle drift is first to cut.
- **Valence confusion:** ambient motes dim/slow; consequence bursts
  bright/fast + directional. Never let ambience mimic a ledger event.
- **Cam rig breaking layout:** `position: sticky` (#street-slot) and
  `fixed` (.lm-fiction-mark, .lm-scrim is outside #game) audited in
  probe; rig wraps only scrollable content.
- **Scope:** items 1-4 are the must-ship win; 5-7 descope cleanly
  without breaking coherence — the matrix defines done-ness per beat.
