# Game as Distribution — Research Validation

**Project:** Siki & Zana game concept (working title: *The Late Market*)
**Date:** 2026-11-09 · **Researched via:** Parallel AI Task API (3 × pro deep-research runs) + Search
**Run IDs:** design `trun_3fbfb0976af5481185a825e5da29355d` · sponsors `trun_3fbfb0976af5481198b9b3d28bc55873` · platform `trun_3fbfb0976af54811a767814a8af4ada6`

Full raw reports + citations: `/private/var/folders/70/0d2zqmt917ng4z2hc30v8hvc0000gn/T/opencode/parallel-research/` (`task_design.md`, `task_sponsors.md`, `task_platform.md`, `facts_*.json`).

---

## 1. Tasks entered

| Event | Deadline | Notes |
|---|---|---|
| **Zoud GameLab** (Zoud + Global Game Jam, on itch.io) | **Nov 15, 2026, 23:59 AOE** | Financial-literacy jam, "Make FinLit Fun". Up to $140K prizes + milestone-based dev funding. IP stays with creator (non-commercial license on submitted version only). Individual registration required for every team member or entry may be disqualified. |
| **Chroma Awards — Games division** (ElevenLabs) | **Jan 7, 2027, 23:45 PT** (paper work published Nov 6, 2026) | Browser-playable, single-player, completable < 30 min, "significant AI tool use" required. ElevenLabs sponsor award: $22K pool ($6K/$3K/$1.5K). Pre-existing projects eligible if never entered a prior Chroma season or Project Odyssey. |

> ⚠️ **Correction to earlier planning:** Chroma's deadline is **January 7, 2027, NOT November 19** (earlier dates came from an older judging page). The jam (Nov 15) now precedes Chroma (~Dec submission) with genuine polish runway between them.

## 2. Sequencing & eligibility (critical)

- **Zoud prior-release rule:** an outside-jam project is only eligible if adapted during the jam AND **never previously released, submitted to another jam, or in beta/early access**. Therefore: keep the itch.io page **private until Zoud submission**; submit Zoud first; then ask Zoud about cross-submission to Chroma; then publish publicly.
- **Licence exposure differs:** Zoud takes a non-exclusive, non-commercial licence to the *submitted version only*. Chroma's grant is broader/perpetual and includes **adaptation and modification**. Character IP (Siki/Zana) ownership is retained in both, but understand what the submitted build gets reused for.
- **Zoud funding package = game + concept doc/initial GDD + 2-minute video of actual gameplay + a project budget.** Milestone-based dev awards, not upfront cash.
- **Zoud AI disclosure** answers are visible to judges only; itch.io has its own mandatory **AI disclosure** for generative material.

## 3. Official Zoud rubric (design constraint)

Submissions scored **/100** + 10 bonus:

| Criterion | Points | Outstanding band (what to aim for) |
|---|---|---|
| Prototype & Gameplay | 25 | Cohesive, well-tested, intuitive controls, engaging loop |
| Financial Literacy Integration | 25 | **"Learning emerges naturally through play without relying on explicit instruction"** — accuracy judged explicitly |
| Educational Impact | 15 | Critical reflection, retention, real-world relevance |
| Creativity & Innovation | 15 | Distinctive, memorable, fresh interpretation of theme |
| Development & Commercial Potential | 20 | Realistic scope, **credible budget**, market appeal, delivery confidence |
| *Bonus:* UAE / Arab localization | +5 | Authentic adaptation — Arabic, **interest-free finance framing, Zakat, AED**, not just translation |
| *Bonus:* Inclusivity & Accessibility | +5 | Subtitles, colorblind-safe, adjustable text, **simple-language mode**, no stereotyping |

Two flags from the rubric text relevant to our concept:

- The 25-pt FinLit band explicitly rewards **accuracy** and warns against "potentially misleading implications" — every in-game number needs a labelled source/assumptions sheet.
- The Educational Impact band warns when learning "rel[ies] on explicit explanation rather than player discovery" AND the FinLit band rewards emergent learning — the research-backed resolution (below) is *decision first, debrief second*.

## 4. Design research: what the evidence says

**Precedents that mirror our concept (sources in full report):**

- **Shady Sam's Slick Wheels** (NGPF, Sept 2025; won a 2026 MAIA): the player *plays the exploiter* (car salesperson, pressure/upselling/scare tactics) and later recognizes the tactics. This is **incentive inversion** — our "You Were the Experiment" finale is the same trick at game scale. Strong validation.
- **NOVA Financial Lab** (PBS/NOVA + Duke's Center for Advanced Hindsight): a **chain of three mini-games under one emotional frame** (pet care) — validates our chapter structure with a persistent frame.
- **Till Next Bill** (2023, ~15 min avg): money, time and relationships in a short browser narrative — validates session length and consequence carry-through.
- **$ave Our Summer / Super Coupon Club / Kittyconomy** (Coolmath 2026 jam winners, 138 entries): recognizable tension > broad "teach money" promise; genre-driven approaches also win.

**The pedagogy correction (important):** the MACBETH study (703 participants, ScienceDirect 2014) — cognitive-bias training games work best when **experience is paired with explicit instruction and repetition**. A single end-of-game reveal is the weakest version of our idea. Adjustment, same scope:

> Each chapter ends with a **4-beat debrief** on the player's own data: (1) *What happened* — replay an actual decision; (2) *What shaped it* — name the exploited feature (anchor, delay, default); (3) *What else could explain it* — acknowledge genuine need/uncertainty; (4) *What to try next time* + one targeted replay with a countermeasure. The finale then aggregates into "You Were the Experiment."

**Scope discipline:** research recommendation — **two primary biases deep, one supporting**, not seven shallow. Our build: **present bias (Ch.1) + anchoring (Ch.2)** primary; **sunk cost (Ch.3)** supporting. Each chapter must manipulate **one variable at a time** (paired, structurally identical choices differing in a single exploited feature) or the reveal can't credibly attribute the player's behaviour.

**Pitfalls to design out (from the pitfalls table + studies):**

- Preachiness → give competing legitimate goals; never *_only_* "you were manipulated" (also acknowledge structural shortfall — some businesses genuinely lack income; don't moralize).
- Engagement ≠ transfer → the Moonshot study (293 students) found better game experience without attitude change. Judge learning with a **replay delta** (in-game), not vibes.
- Numerical false precision → fictional meters named "fictional," simplified models disclosed, a **source-and-assumptions sheet** per financial rule, arithmetic edge cases tested (zero balance, partial payment, negative balance, rounding, repeated cycles).
- "One correct budget" and scoring realism → no fake realistic credit score; label indicators as fictional.

## 5. Tech pipeline (sponsor tools, late-2026 with sources)

| Area | Finding | Decision |
|---|---|---|
| **ElevenLabs voices** | Voice Design endpoint `POST /v1/text-to-voice/design` (default `eleven_multilingual_ttv_v2`; audition text must be 100–1,000 chars; selected preview saved via `/v1/text-to-voice`). Models: `eleven_v4` (expressive, audition first), `v4_turbo` (~100ms model latency, only if genuinely runtime). Music model `music_v2_5`; SFX generation available. | **Two persistent voice IDs** — one for Siki (warm, measured narrator), one for Zana (blunt, punchy). Pre-bake all lines; polish in editing. Personality = writing + casting + editing, not a preset. |
| **ElevenLabs budget** | Creative Free 10k credits/mo (evaluation, no commercial licence assumed); **Starter $6/mo = 30k credits + commercial licence**. API: v4 $0.08/1k chars; Music $0.15/min; SFX $0.12/min. Don't mix subscription credits with API-billed accounts; don't depend on expiring promos (Chroma pack's redemption amounts are NOT reliably established — treat as bonus). | Starter plan for jam month. Budget discarded takes (×1.5). |
| **Meshy (mascot → 3D)** | Image-to-3D (`meshy-t2`/`t2.5`, Meshy 7.1: 20–35 credits; rigging 5, animation 3/action). Free plan: 100 credits/mo, **CC BY 4.0 attribution**, downloads capped at 10 Meshy-6-Lite models; Pro $20/mo = private, owned. | **Default to layered 2D / sprites.** Real-time 3D only pays off for spatial play we don't have. Meshy-to-rendered-sprites is the option if a 3D look is wanted — an asset pipeline, not a one-click feature. |
| **Cutscene video** | Kling 3–15s (first/end-frame control); PixVerse V5.6 5/8/10s clips; Dreamina (Seedance 2.5) up to 30s. PixVerse API: 225 credits/$1; 5s 720p silent ≈ $0.20. | Build the 10–20s **Late Market intro** from 2–4 controlled silent shots (locked camera for loops), edit together, add voices after. Poster image + skip button + still fallback so the cinematic never blocks play. |
| **Architecture** | itch.io HTML5: zip with top-level `index.html`, 500MB extracted / 200MB file / 1,000 files / 240-char paths, HTTPS externals, case-sensitive. Audio needs our own **Start/Enable Sound button** (Web Audio unlock inside the interaction; itch's launch click doesn't unlock our iframe audio). | **Pre-baked everything.** Asset manifest with voice IDs, settings, licences. Never ship an API key to the client; runtime TTS only via a rate-limited server proxy if ever. |

## 6. Domain facts for the game (the Late Market's real numbers)

| Fact | Figure | Source |
|---|---|---|
| Invoices paid late | **44%** of SME invoices (evidence to Business & Trade Committee) | Commons Library briefing, Commercial Payments Bill [HL] 2026–27 |
| Economic cost | **~£11bn/year** to the UK economy | DBT / Small Business Commissioner (London Economics), July 2025 |
| Closures | **~14,000 business closures** linked to late payment | Same briefing |
| Speed of payment (Xero data, Sept 2026) | small businesses wait **29.6 days** to be paid; invoices paid **8.3 days past due** | paidnice aggregation of Xero payments data |
| Debt-collection agencies | commission typically **5–15%** of recovered (plus fixed-fee variants) | debtadvocate.co.uk practitioner guide |
| Invoice factoring | discount **~6.75–9.75% p.a.** (base 3.75% + 3–6%) **plus** service fee **0.5–2.5% of turnover**; quotes invited as "base + margin" hide the spread | Doulton, Spark Finance, Bolton, MarketInvoice UK guides (2026) |
| Statutory interest | Late Payment of Commercial Debts (Interest) Act 1998, as amended 2002 (s. 5A): interest at **8% above BoE base rate** + fixed compensation **£40/£70/£100** depending on debt size | legislation.gov.uk, 1998 c. 20 |

Presentation rule (per rubric accuracy + our own BRAND.md): in-game numbers are **fictional rounds of indicative real ranges**, always labelled, UK-framed where statutory, with a public assumptions sheet.

## 7. Open gaps / follow-ups

1. Ancient-history lore (Mesopotamia/Medici receivables) — first search pass came back statutory-heavy; needs one more Search or keep lore soft ("Siki has read ledgers since Ur").
2. Chroma Games category list beyond "20. Fighting / Shooter" — check the actual entry form (Dec).
3. UAE localization (+5 bonus): **shipped** as Souq Mode (GDD §4a) — AED display, the statutory interest remedy replaced by a pre-agreed contractual late fee (interest-free framing), and zakat on uncollected receivables as the second cost of deferral. Arabic *voice/subtitling* is still too heavy pre-Nov 15 and stays a Chroma (Jan 7) item; the adaptation does not depend on it, because the rubric rewards the framing, not the translation.
4. Zoud GDD starter kit = the six sections in `docs/game/GDD.md` + a final PDF published via public link (no login).
5. **Rotate the Parallel API key** — research batch complete.
