# Sikizana design guardrails

Sikizana’s differentiation is **character + finance-specific UX**, not animation libraries.
Motion (transitions.dev), dither charts, and polish are a **craft layer** on top of that.

## Three zones

### Zone A — Signature (mascot + persona + voice)

**Where:** Landing hero, `/books` chat, finance-check handoff, findings panel, connect/onboarding, impact hero caption, `AnalysisCard` headers, auto-chase confirmation (`AutoChaseNotice`).

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
| `getRecoveredCelebrationCopy()` | Payment moment modal when a chased invoice is paid |
| `getNegotiationCardCopy()` | `NegotiationEmailCard` header + chase draft chrome |
| `getJournalCardCopy()` | `JournalEntryCard` approve/post voice |
| `getResponseSummaryCopy()` | Peak-end `ResponseSummary` after agent answers |
| `getLandingPersonaPaths()` | Landing page dual entry cards + bottom CTA |
| `getPricingTryLinks()` | Pricing page Siki/Zana demo + connect URLs |
| `getConnectMomentCopy()` | Post-OAuth connect overlay on `/books` |
| `getActivityEventStyle()` | Persona-aware labels on `/activity` |
| `getTrendBuildingCopy()` | Sidebar + impact chart empty states |
| `findingActionLabel()` | Findings panel primary actions |
| `cleanFindingsCopy()` | Clean-audit empty state |

Persisted persona: `PERSONA_STORAGE_KEY` / `usePersona()`. Chat messages carry optional `persona` so cards and mascots match the agent that produced them.

## Finance-check entry flow

Landing, pricing, and Xero OAuth callback paths converge on `/books?flow=check`.
That flow should feel like the user has arrived inside the product, not a
second landing page. The page may show a focused handoff panel and `TodaySummary`,
but both must read from canonical findings and send users into existing finding
actions.

Rules:
- `TodaySummary` is a compact return-state surface: priority finding, amount,
  source status, and one review action.
- Do not duplicate `FindingsPanel`, create a separate AP dashboard, or invent
  marketing-only metrics.
- Clean states should be quiet and credible; risk states should make the next
  review action obvious.
- Persona accents can guide tone, but findings evidence and source links carry
  the trust.

## Chart placement

| Surface | Chart type |
|---------|------------|
| `/impact` hero | dither AreaChart |
| `/books` sidebar | dither Sparkline (margin trend) |
| Chat `AnalysisCard`s | HTML bars / SVG sparklines (persona header in Zone A) |
| Benchmarks / scorecards | No dither |

## Metric snapshot cadence

Sidebar sparkline and impact hero need **2+ snapshots** to render.

| Trigger | Capture mode |
|---------|----------------|
| `/books` load | Passive — max once per day (upsert) |
| Xero OAuth connect | Bootstrap — today + week-ago baseline (flat line, honest values) |
| Auto-chase armed | Force — upserts today's row |
| Journal posted to Xero | Force — upserts today's row |
| Daily cron (`src/jobs/capture_metrics.py`) | Passive per connected / recently active session |
| `GET /api/metrics/snapshots?force=true` | Force — bypasses daily throttle |

Same calendar day (UTC) upserts one row — repeated captures refresh today's numbers instead of duplicating. Sidebar and impact show an honest **trend building** empty state when fewer than two points exist.

## Before shipping UI polish

1. High-frequency surface? → Reduce motion.
2. Would a generic fintech app ship this unchanged? → Add mascot voice or honest copy.
3. Is Zana’s territory (chase, overdue, enforce)? → Rose accent + direct label.
4. Can the user read the number in 2 seconds? → Numbers win over pixels.
