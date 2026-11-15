# Cold Open V2 — voiced cinematic (expensive track 1)

> **Superseded 2026-11-15:** the shipped intro is the 8s moonrise cut with
> Siki's line as a karaoke subtitle (film holds its last frame until the
> take lands), then the story card — where Zana's baked line
> (`welcome_zana`: "I'm Zana. You point, I chase. First one's Harborne —
> say the word.") introduces her over the player's reading time — then the
> Shark's cold open. Policy, skip etiquette, and the implementation
> contract live in `INTRO_AND_SKIP_POLICY.md`. The 45s three-shot
> storyboard below was the earlier plan; both welcome takes are now used.

Status: in progress 2026-11-14. `welcome_siki` baked (eleven_v4, 170KB).
`showWelcome()` speaks it with karaoke target; manifest-miss → silent.

## Storyboard (45s, 3 shots × 8s + holds)

1. **Moonrise over the sleeping street** — start frame `public/assets/market-bg-dusk.jpg`,
   slow push-in. Siki VO: welcome line.
2. **Zana's beat** — subject ref `art-src/v5-zana.png`, low tracking shot down the stalls.
   Zana VO (to bake): "I'm Zana. You point, I chase."
3. **The Shark's shadow** — subject ref `art-src/v5-shark.png`, shadow crosses a lit stall.
   Shark VO (reuse prologue offer take).

## Flows commands

```bash
node scripts/elevenflows.mjs video --model veo-3.1-generate-001 \
  --prompt "Moonrise over a lantern-lit night market, painted gouache, slow push-in, no text" \
  --start-frame public/assets/market-bg-dusk.jpg \
  --secs 8 --ratio 16:9 --res 1080p --out out/coldopen-shot1.mp4
```

Quality model for finals (`veo-3.1-generate-001`); fast (`-fast`) for previews only.

## VO to bake (eleven_v4, same dictionary)

- welcome_siki ✓ baked
- welcome_zana: "I'm Zana. You point, I chase. First one's Harborne — say the word."
- welcome_hint is text-only (never baked).

## Budget guardrails

- Keep `cinematic.mp4` under itch limits; ship 1080p only if <25MB else 720p.
- Reduced-motion: poster + welcome card (already ships).
