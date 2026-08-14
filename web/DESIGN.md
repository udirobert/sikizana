# Sikizana design guardrails

Sikizana’s differentiation is **character + finance-specific UX**, not animation libraries.
Motion (transitions.dev), dither charts, and polish are a **craft layer** on top of that.

## Three zones

### Zone A — Signature (mascot + persona + voice)

**Where:** Landing hero, `/books` chat, finance-check handoff, findings panel, connect/onboarding, impact hero caption, `AnalysisCard` headers, auto-chase confirmation (`AutoChaseNotice`), `/check` thinking trace + Siki's read.

**Rules:**
- Siki = explain, sky/orange accents, plain English.
- Zana = chase/enforce, rose/stone accents, direct tone.
- Mascot mood matches state: `look` = working, `celebrate` = win, `wave` = welcome.
- Dither charts and rich motion are allowed here as **accents**.
- Inline analysis cards get a small mascot + persona title in the header (e.g. "Zana's overdue snapshot"), not emoji badges.

### Zone B — Proof (numbers must scan)

**Where:** Stat cards, benchmarks, scorecards, journal previews, P&L numbers, inline `AnalysisCard`s in chat, `/check` benchmark strip + "yours" comparison inputs.

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
| Chat `AnalysisCard`s | HTML compare bar (typical tick + yours) + verdict pill |
| `/check` + `/b` snapshots | Same compare bar; short status (`In band` / `Above typical` / `Below typical`) |
| Benchmarks / scorecards | No dither |

## Benchmark comparison

One visual language across `/check`, `/b` margin notes, and chat sector cards:

- **Bar** = typical tick + yours marker (+ shaded range when we have a band). Zone B: crisp HTML, no dither.
- **Status** = three words on the card (`In band`), not a recap sentence.
- **Siki's read** = one sentence on the *outlier*, only after the visitor types numbers. If everything is in band: “You're in the typical {sector} shape.”
- **Copy once.** Headline + one teaching `watchFor` line. Do not also explain the comparison in a bubble, a subtitle, per-card prose, *and* a recap.
- Lead-magnet CTAs: one primary action to run the sample-books check. Skip-links that repeat the same action are noise.

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

## Sector intelligence tips (mascot knowledge layer)

Siki can offer sector-specific educational tips (sources, benchmarks, methodology) drawn from a lightweight knowledge file. The goal is **contextual teaching, not information dumping** — the tips are a delight/trust layer, not a product surface.

### Dosage by surface

| Surface | What to show | Why |
|---------|-------------|-----|
| Quick-check lead magnet (`/check/[sector]`) | Single `watchFor` line already shipped in `sector-benchmarks.ts` | Compact, on-brand, doesn't distract from conversion |
| Post-scan findings panel | Collapsible "Siki knows" (`SectorTipsCard`) with the sector's full tip set, shown after all findings are reviewed | Reward after engagement, feels like Siki is teaching |
| Chat / agent | On-demand knowledge bank (`SectorChatKnows`) in the `/books` chat empty state showing full methodology + each tip seeds an "Ask Siki" conversation; the same tips are injected into the agent system prompt (`sector_tips` on the chat request) so generated replies cite the exact public sources | Natural Q&A, not pushing info |
| `/books` sidebar + mobile panel | Rotating "Siki's sector note" (`SectorNoteCard`) — 1 tip per visit, rotates | Ambient delight, repeat visitors discover new things |

### Data model (reference for implementation)

```ts
type TipPhase = "post-findings" | "chat" | "sidebar";

interface SectorTip {
  id: string;
  topic: string;        // "Competitor benchmarking", "Rate shopping", etc.
  summary: string;      // One-sentence Siki-voice hook (sidebar / post-findings collapsed)
  body: string;         // Short markdown-ish body (1–3 paragraphs) — shown in chat bank
  sourceLabel?: string; // "Companies House", "Booking.com" etc.
  sourceUrl?: string;   // Optional link
  phase: TipPhase[];    // Which surface(s) this tip serves — a tip can span several
}
```

Exposed via `getSectorTips(sectorId, phase?)` in `web/lib/sector-tips.ts`, which filters a tip in when `phase` is included in its array.

### Status — all four surfaces shipped

| Surface | Component | Live? |
|---------|-----------|-------|
| Lead magnet | `watchFor` on `BenchmarkCard` / OG | ✅ |
| Post-findings | `SectorTipsCard` | ✅ |
| Chat bank | `SectorChatKnows` | ✅ |
| Sidebar + mobile note | `SectorNoteCard` | ✅ |
| Agent grounding (chat) | `sector_tips` → system prompt | ✅ |

**Grounding flow:** the `/books` chat sends the known sector's tips (`getSectorTips(sector, "chat")`) as `sector_tips` on `POST /api/xero/chat/stream`. `src/api/routes/chat.py` passes them to `run_bookkeeper[_streaming]`, which appends a `### SECTOR KNOWLEDGE (grounding)` block to the system prompt so Siki can name the real sources (Companies House, BEIS indices, etc.) in generated replies — while staying honest ("guide on methodology rather than fabricate data").

### Rules

- Keep the lead magnet dose to one line. Richer tips are a product feature, not a lead-gen feature.
- Post-findings tips must be **collapsible** (no content shift) and shown only after the user has reviewed findings — never during.
- Chat/full methodology is the natural place for depth; Siki answers when asked, not unprompted.
- The `/books` sidebar tip should rotate on each visit (localStorage keyed by tip id) to keep ambient delight fresh.
- Tips are stored client-side or fetched once and cached — no new backend compute.
- Voice must be Siki's (not Zana's): plain English, helpful, teaching. Never accusatory or "you should know this."

### Source material

The first sector to receive rich tips is **hospitality**. A detailed methodology for free hotel/hospitality benchmarking (Companies House, annual reports, rate shops, comp sets, tourism data) has been assembled as a template. Other sectors can follow the same pattern.

A `watchFor` field already exists on every `SectorBenchmark` in `sector-benchmarks.ts` — that is the single-line lead-magnet tip. The richer per-sector knowledge file (`SectorTip[]`) should be built as a separate data layer.

## Before shipping UI polish

1. High-frequency surface? → Reduce motion.
2. Would a generic fintech app ship this unchanged? → Add mascot voice or honest copy.
3. Is Zana's territory (chase, overdue, enforce)? → Rose accent + direct label.
4. Can the user read the number in 2 seconds? → Numbers win over pixels.
