# The Dynamic Pass — making the market feel inhabited

Playtesters: "the experience is quite static." Diagnosis: the game has juice
at *event moments* (stall flare, till pop, actor bob, karaoke) but the screen
time *between* clicks is frozen — inert stalls, hard-cut panels, no ambient
life. This pass adds the world-breathes layer and beat transitions. All of it
is presentation-only: `dayChoices()`, `streetState()`, ledger schema, debrief
maths and product vectors are untouched (TRACK_A_SPEC frozen set).

## Research basis

- **Game Feel survey (ITU Copenhagen):** "ambient cues" — subtle motion with
  no explicit input — tell the player the world is still live in idle states.
  This is exactly the gap playtesters named.
- **Hicks et al. (CHI), juicy-feedback studies:** embellishments raise
  perceived quality/aesthetic appeal, but only when they preserve
  action→outcome binding; excess juice lowers competence. Every effect here
  either *is* the ledger event (coin flight, till delta) or is ambient and
  causal-free (sway, motes, parallax).
- **UI-animation craft guidance:** animate transform/opacity only; never
  animate what the player is waiting for; idle motion must be slow and
  low-contrast — fast high-contrast loops become noise.
- **Idle-animation practice:** a few frames of motion read as "alive"; the
  character doesn't need detail, it needs presence (consistent with the
  character-attachment literature: presence > visual richness).

## What ships

### Ambient life (the world breathes)

1. **Stall idle sway** — each stall figure breathes on a staggered ~5s loop
   (transform/opacity only, `transform-box: fill-box`, bottom origin).
2. **Lit-stall breathing glow** — funded stalls' amber glow pulses slowly;
   the street literally glows brighter where the player's debt lives.
3. **Ember motes** — ~8 low-contrast amber particles drift up through the
   street on long loops. Night-market air.
4. **Market-bg parallax** — the backdrop drifts a few px against the
   pointer. Desktop-first; disabled under reduced motion.

### Beat transitions (every click lands)

5. **Stage rise-in** — `.lm-stage` / `.lm-day` children rise 420ms on each
   render, staggered by nth-child. Panels stop hard-cutting. (The `lm-rise`
   keyframe already existed; it was only used on the actor bubble.)
6. **Till delta floater** — when a rendered till value changes, a `+£X` /
   `−£X` chip floats up off the number and fades. Direction is honest:
   sign of the delta, market currency.
7. **Coin flight** — when a stall newly lights, a coin travels till→stall;
   when one shutters, stall→till. The money's path is legible — the CHI-safe
   version of juice.

### The street reacts to you

8. **Hover wave** — pointer over a stall makes its figure do a small nod
   alongside the existing murmur.
9. **Street whisper** — one flavour line per ch1 day under the street
   ("The Factor was seen at the north gate."). Ambient world-texture; no
   mechanics, clearly flavour.
10. **Day tint** — `--lm-bg-deep` deepens slightly per day; the week feels
    like it progresses before the daybreak veil even lands.

## Deliberately excluded

- Real-time pressure (timers, draining meters) — would corrupt the
  paired-choice experiment.
- Character expression sets / blinks — real art task, post-submission.
- Random NPC cameos — unearned scope.
- Animating focus targets or anything the player is waiting on.
