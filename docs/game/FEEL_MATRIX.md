# Feel Matrix — v3

Every significant beat and its full response recipe. The rule (V3_DIRECTION):
**a beat is bare only if it is boring** — but a decorative response must never
imply a financial event that didn't happen. All numbers come from real
counters; motion is transform/opacity and dies under `prefers-reduced-motion`.

Legend: **S** = sound stinger, **C** = camera, **P** = particles, **A** = actor,
**W** = visible surface.

| Event | S | C | P | A | W |
|---|---|---|---|---|---|
| Invoice deferred (stall lights) | `defer` | punch | `mote` trail at stall (10) | Zana murmur + home droop | coin flight till→stall; stall halo blooms |
| Invoice collected (coin home) | `collect` | punch | `coin` burst at stall (16, gold+green) | home cheer | coin flight stall→till; halo on |
| Bill skipped | `bill` | punch + settle | `petal` burst at till (8) | — | late-fee tally grows |
| Bill paid | `collect` | punch | `coin` burst (16) | home cheer | cash pops |
| Factor's stall lights (wave-off) | `defer` | punch | `coin` burst, brass (10) | Factor steps up w/ line | stall kind=`factor` |
| Collector's shutters close | `defer` | **settle** | `shard` burst, violet (12) | Collector steps up | `shut` stall + occupied bob |
| Shark's drip starts | `defer` | **shake 3px** | `shard` burst, arterial (14) | Shark steps up | `shut` stall + drip line |
| Chapter turn (1→2→3) | sting | panIn travel + flash | — | sting card | `lm-sting-card` 2.4s |
| Market pick (title→game) | — | — | — | — | stall-figure cards |
| Stall hover/focus/tap | — | — | — | figure nod | `lm-stall-inspect` + ledger line + Zana murmur |
| Till hover/focus | — | — | — | — | `#till-tip` real 3-part breakdown |
| Choice hover/focus | — | — | — | — | kind tag (`lm-kind-*`) |
| Day begin | — | — | — | — | ticket-stub header + whisper feed line |
| Finale total | sting | settle → flash → **shake 3px** | per-lit-stall `coin` bursts, 90ms stagger | verdict lines | cost bill + receipt stats |
| Idle between beats | — | drift (9s, ±4px) | none (ambient ≠ consequence) | sway / wag / look | halo breathe, business bob, occupied bob |

## Reserved shake (only these three)

Shark drip begins · Collector shutters · Finale total.
Everything else is punch (140ms, scale 1→1.018→1) or settle (220ms weight).

## Honesty rails

- Coin flights fire **only** on real counter deltas (collected, deferral,
  bill skipped). No autonomous money movement.
- `mote`/`petal`/`shard`/`coin` shapes are bound to meaning — ambient motes
  are small, dim, non-directional; consequence bursts are fast and bright.
- Till tip and stall ledger lines show only counters `streetCounters()`
  already computes; choice kind tags echo the engine's own `DayChoice.kind`.
- The whisper feed is flavour text, capped at 2 visible lines, newest on top.
