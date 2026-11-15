# V2 Direction — from patched UI to composed scene

Playtesters and self-review converged: v1 reads monochromatic, cheap, and
characterless. Diagnosis (first principles, research-backed):

1. **The backdrop was at 0.13 opacity** — the illustrated market was
   functionally invisible; the game rendered as panels on a void.
2. **No scene composition** — foreground/midground/background existed but
   never composed into one image (the readability literature's core rule).
3. **Token character presence** — 1.5em stroke icons in text lines are
   bullet points, not companions. Protagonists need a *spot* in the scene.
4. **One hue doing all the work** — indigo+amber everywhere; factions had
   silhouettes but no colour identity (Zana and the Collector literally
   shared violet).

## What V2 changes (presentation only — frozen mechanics untouched)

- **The scene is visible.** `market-bg` raised to readable opacity with a
  legibility scrim; stalls get grounded shadows; the street reads as a place.
- **The companions have a home.** Siki & Zana stand at *your* pitch — a
  home stall at the head of the street row, larger figures, idle sway, and
  they react to ledger beats (cheer on collection, droop on deferral).
- **Every faction has a hue.** Siki amber, Zana warm coral, Factor brass,
  Collector steel violet, Shark arterial red — carried through figure
  stroke, nameplate, stall glow, and offer-card accents.
- **The market pick is two stalls.** Each lawful market gets its street
  figure inside the choice object — the chalkboard A-board and the lantern
  tag now have silhouettes, not just shapes.

## Explicitly not in V2

- No mechanics/experiment/ledger changes (TRACK_A_SPEC frozen set).
- No new art assets yet — everything is the existing line-art language,
  composed. A commissioned wide market scene is the obvious next step if
  V2 lands.
- No timers, no real-time pressure, no expression sets.
