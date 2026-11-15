# Progressive disclosure — research & application (Nov 2026)

Why this doc exists: the first screen shipped with every system visible at
once (street strip + tally + Details + captions + progress + chapter header
+ prologue scene + fiction mark). Judge feedback called it cluttered; the
fix is a disclosure strategy, not more hiding ad hoc.

## What the exemplars do

- **Universal Paperclips** — the canonical incremental. Controls are
  revealed exactly when they become usable; the interface never presents a
  control the player cannot yet act on. Capability appears at the
  threshold that makes it relevant.
- **Chaotic Era** (itch devlog) — hides UI elements that aren't yet
  relevant; tooltips only on demand; detail views positioned dynamically
  rather than fixed.
- **Rogue's Doom** (Wayline UX writeup) — contextual tooltips that appear
  when a control first becomes relevant; skill trees reveal one branch at
  a time instead of the whole tree upfront.
- **Dawnmaker** (Adrian Gaudebert) — drip-feed: the player gets only what
  they need at a given moment; complexity is taught through doing, and
  even then the tutorial had to *add* words when players got lost —
  disclosure is a dial, not a delete key.
- **Power Network Tycoon** — stats hidden by default, revealed via
  overlays/pop-outs; "beginners aren't overwhelmed, advanced players
  still get their nerd fix."

Common thread: **show the consequence, hide the instrument until it can
act.** The world may always be visible; the controls and readouts arrive
when they mean something.

## Applied in The Late Market (v5.1)

1. **Austerity cold open** — ch1 phases `coldOpen → prologuePick →
   shutters` run with `#street-slot.lm-street-pre`: the Pixi scene renders
   (Shark shadow pass, stalls, motes) but tally, Details, stall captions,
   inspect line, and hit-areas are hidden/disabled. The ledger chrome
   arrives in `showDay()` — the moment money can move. Resuming players
   skip austerity. (`ch1screen.ts streetAusterity`, `tokens.css`)
2. **Details gated on content** — the tally breakdown only renders when
   `toStreet > 0 || held > 0`. A breakdown of all-zeroes is noise. When it
   appears it opens with a small rise animation so the disclosure is felt.
   (Verified by CDP probe: toggle was never broken — it disclosed zeros.)
3. **Fiction mark kept, demoted** — "Fictional figures · indicative ·
   arithmetic audited in public" stays as a fixed 0.78em footnote. It's
   the only always-on surface for the honesty rail; the audit page is
   real and the claim is the AP-integrity pitch. Cutting it saves pixels
   and spends credibility.
4. **Market pick = one picker** — the title's radio fieldset became an
   Options setting; the painted door cards are the canonical first-run
   choice. Options radios deliberately don't set `marketPicked` so they
   can't suppress the doors.

## Audit rule going forward

Before any new surface ships, ask: *can the player act on this right now?*
If not, it waits for the threshold — a day boundary, first money moved,
first stall lit — not for "the player might want it."

## Open candidates (not yet done)

- Stall inspect notes could deepen progressively (state line first,
  ledger numbers only once `toStreet > 0` — partially done already).
- Choice-card `kind` tags (chase/defer/trade) could reveal only after the
  player has seen each kind once — currently always-on hover.
- The till breakdown popover could teach itself: first hover shows the
  three parts, later hovers collapse to the total.
