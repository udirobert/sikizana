# Itch Best Practices — How The Late Market Stacks Up

> Written 2026-11-15 from itch.io creator docs, jam rubric literature, and onboarding research. Companion to GDD, ITCH_PAGE, SUBMISSION.

## Rubric we are judged on

Most itch jams weight: Gameplay+fun 25-50%, Theme/creativity ~30%, Visuals+audio ~20%, Polish/completeness ~15%, Pitch/GDD ~10%.

Our edge: one-sentence pitch passes the starter-kit test ("stall for a week, every invoice you leave funds the street, ending reads your data back"). Behavioural experiments run silently first, named later — unusual vs explain-first FinLit games. Keep this verbatim everywhere.

## First 5 minutes (competence → context → hook)

Research consensus: one input = one understood response in <60s; visible goal not tutorial text; one mystery for "one more step"; drip-feed one mechanic at a time inside fiction.

- DONE: Shark offer before any ledger (decision in minute 1, keyboard 1-9 + click, skip everywhere, reduced-motion respected).
- FIX: first viewport must contain the choice at 1280x860 embed. Till + whisper + street + day panel + ledger currently stack past the fold. Rule: anything not serving the first action is a tax — collapse ledger, 1-line whisper during decisions.
- FIX: one voice per beat. Top narrator bubble + street-actor bubble + panel title triple-tell the same beat. Say() already clears old say bubbles; actorStepUp must clear say bubbles and vice versa.
- FIX: first win by minute 2. Chase-lands payoff only arrives Day 2. Give prologue-refuse a micro-win (Zana line + tiny till pulse) so every path gets feedback fast.

## Core loop

Plan (1 action) → watch till/ledger/street react → next day. Street lighting/shuttering is readable-consequence feedback that systems-jam rubrics explicitly score. Keep vocabulary to chase-vs-defer on Day 1; introduce walk-in work Day 2.

## Presentation

- One cast language (painterly PNG portraits everywhere; line-art only on street stalls). Fixed 2026-11-15.
- One board material + two radii (12px panels / 8px tags). Fixed 2026-11-14/15.
- Colourblind-safe by construction (never colour-alone), subtitles always on, audio optional. Already a differentiator.

## Itch page (highest ROI tonight)

Per itch docs + 2026 launch guides: browser-playable is the single highest-conversion move (we have it). Cover 630x500 must read at thumbnail. Minimum 3-5 screenshots; GIF sells the game by itself; theme the page to the game (indigo/amber) — featured pages always do.

Lead order: market_pick (premise in one glance) → shark_offer (decision + face) → day1_stall (consequence). Never lead with menus. Add 3s GIFs into description body.

## Scope

One critical path + two branches (defer / anchor / sunk) is exactly the shipped-scope pattern that finishes jams. Don't add mechanics today.

## Tonight, in order

1. 90s gameplay cut (no finished cut exists).
2. First-viewport CSS (choice visible at 860px embed height).
3. One-voice dedup.
4. Lead screenshots + GIFs + page theme.
