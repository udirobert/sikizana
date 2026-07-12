# Sikizana design guardrails

Sikizana’s differentiation is **character + finance-specific UX**, not animation libraries.
Motion (transitions.dev), dither charts, and polish are a **craft layer** on top of that.

## Three zones

### Zone A — Signature (mascot + persona + voice)

**Where:** Landing hero, `/books` chat, findings panel, connect/onboarding, impact hero caption, `AnalysisCard` headers, auto-chase confirmation (`AutoChaseNotice`).

**Rules:**
- Siki = explain, sky/orange accents, plain English.
- Zana = chase/enforce, rose/stone accents, direct tone.
- Mascot mood matches state: `look` = working, `celebrate` = win, `wave` = welcome.
- Dither charts and rich motion are allowed here as **accents**.
- Inline analysis cards get a small mascot + persona title in the header (e.g. "Zana's overdue snapshot"), not emoji badges.

### Zone B — Proof (numbers must scan)

**Where:** Stat cards, benchmarks, scorecards, journal previews, P&L numbers, inline `AnalysisCard`s in chat.

**Rules:**
- Crisp HTML/SVG or typography — no canvas dither.
- Minimal animation (number pop-in is fine; no bloom/sparkle).
- Honest sourcing labels (“typical UK ranges · indicative”) stay visible.

### Zone C — Delight (rare, earned)

**Where:** First Xero connect, clean audit, chase sent (`AutoChaseNotice`), first trend snapshot, impact hero, journal posted to Xero.

**Rules:**
- Full delight OK: `SuccessCheck`, dither hero, mascot `celebrate`.
- Zana auto-chase uses rose panel + `SuccessCheck` — this is a signature moment, not a generic toast.
- Emil frequency rule: if users see it 10+ times per session, strip animation.

## Persona copy (`persona-theme.ts`)

| Helper | Used on |
|--------|---------|
| `getPersonaCopy()` | Navigation links, `/memory`, `/activity`, memory recall, upgrade banners |
| `getPersonaTheme()` | `/books` chrome — buttons, bubbles, findings, toggles |
| `getAnalysisCardMeta()` | Inline chat `AnalysisCard` headers + chase-specific body copy |
| `getAutoChaseCopy()` | `AutoChaseNotice` headline + tagline after arming a chase |
| `findingActionLabel()` | Findings panel primary actions |
| `cleanFindingsCopy()` | Clean-audit empty state |

Persisted persona: `PERSONA_STORAGE_KEY` / `usePersona()`. Chat messages carry optional `persona` so cards and mascots match the agent that produced them.

## Chart placement

| Surface | Chart type |
|---------|------------|
| `/impact` hero | dither AreaChart |
| `/books` sidebar | dither Sparkline (margin trend) |
| Chat `AnalysisCard`s | HTML bars / SVG sparklines (persona header in Zone A) |
| Benchmarks / scorecards | No dither |

## Before shipping UI polish

1. High-frequency surface? → Reduce motion.
2. Would a generic fintech app ship this unchanged? → Add mascot voice or honest copy.
3. Is Zana’s territory (chase, overdue, enforce)? → Rose accent + direct label.
4. Can the user read the number in 2 seconds? → Numbers win over pixels.
