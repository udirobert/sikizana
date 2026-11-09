# The Late Market — Game Design Document

**Siki & Zana: The Late Market** · a game about why nobody gets paid on time.
**For:** Zoud GameLab (deadline Nov 15, 2026 AOE) → Chroma Awards Games division (deadline Jan 7, 2027 PT)
**Version:** 0.2 · 2026-11-09 · **Status:** in production — Chapters 1–3 playable end-to-end, finale pending

> Pitch in three sentences (the Zoud starter-kit test):
> You run a small business and the money keeps slipping — and the game quietly runs behavioural
> experiments on you the whole way down. Every invoice you defer quietly funds a night-market
> street of stallholders — a factor, a collector, a shark — whose businesses exist *because*
> players like you didn't act today. At the end, the game shows you your own data, names what
> the market exploited, and closes the street the moment you finally get paid.

Companion docs: `RESEARCH_VALIDATION.md` (evidence), `docs/BRAND.md` (voice rules), `docs/REGULATORY_PERIMETER.md` (compliance rails).

---

## 1. Game Overview

- **Title:** *The Late Market* (series line: *Siki & Zana*)
- **Genre:** narrative management/deduction hybrid — chapterified mini-games (day-planner, negotiation, mystery) around one persistent bookkeeping frame
- **Platform:** browser (HTML5, itch.io; single-player; no install; ~20–25 min)
- **Target audience:** adults who own/operate or dream of running a small business; secondary: secondary-school business studies (ages 14+)
- **What's different:** most FinLit games *explain* biases. This one **runs you through them silently first** — your plays are recorded, replayed to you as experiment data, and only then are the biases named (the Shady Sam "incentive inversion" move, applied to your own psychology instead of a villain's). The second reveal layer is economic: your lateness is the **business model of an entire shadow market**, visualized as a street that visibly shrinks as you get paid.

**Voice rule (from `docs/BRAND.md`, canon):** Siki explains, Zana enforces. Siki's lines are calm, cited, hedged (*"typical UK ranges · indicative"*). Zana's are short, blunt, action-first, and **never promise payment**. NPCs are fictional composites; the game explains dynamics and never recommends a provider, product, or financing.

## 2. Core Gameplay

**Player objective:** keep a small business solvent through one business quarter while collecting the money you are owed.

**The core loop (repeats daily within chapters, ~25 seconds per day):**

1. **Plan** — pick today's actions from a small vocabulary: *inspect books (Siki), chase an invoice (Zana stage), serve walk-in work, pay a bill, accept/decline a Midnight Market offer*.
2. **Watch the ledger age** — unpaid invoices tick 30/60/90; the **"worth today" strip** shows each invoice's market price falling as it ages (the discounting/NPV lesson rendered as one UI element).
3. **Handle temptation** — each chapter plants one engineered decision exploiting one bias.
4. **Live the consequence** — cash, stress, and the ledger update; the street's stalls brighten when you defer, shutter when you get paid.

**Challenges/decisions:** chaptered experiments (§A1), each *structurally identical choice pairs* differing in one exploited variable — the design constraint that makes the debrief attribution credible (MACBETH-aligned).

**Progression:** shared state (cash buffer, debt, relationships, days) carried across chapters; nothing resets between chapters. Chapter debriefs unlock **decision tools**, not just points: total-cost view, statutory-interest counter, "decide at zero" panel.

**Fun:** role identity ( realise you're the subject), escalating dread of the street that feeds on you, the cat-and-mouse of negotiation, and a finale that *pays off the whole board* — then immediately invites "beat your Rationality Delta" replay.

## 3. Financial Literacy Integration

The learning spine (with the research-backed pedagogical order: **decide → experience → debrief on own data → strategise → repeat**):

| Chapter | Primary bias (research anchor) | The engineered decision | Debrief lesson (player's own data) | Tool unlocked |
|---|---|---|---|---|
| 1. *The Cost of Tomorrow* | Present bias / hyperbolic discounting (Thaler/Benartzi–Thaler) | Two structurally identical "act now vs. defer" choices whose only difference is timing framing | A replay of every deferred chase + the silent interest/compensation now forgone (statutory: 8% over BoE base + £40/£70/100, Late Payment of Commercial Debts (Interest) Act 1998 s.5A) | A "when X then Y" reminder rule for Zana's first-stage ladder |
| 2. *The Offer* | Anchoring + ultimatum-game fairness (Tversky–Kahneman) | Counterparty settles at different anchors across three runs; you set a minimum acceptable price each time | Graph of your minimum-acceptable-settlement vs open anchor; show the shift is caused by the anchor, not the facts | **Flip the anchor**: open negotiations with statutory interest + fixed compensation already accrued |
| 3. *Good Money After Bad* | Sunk cost (Arkes–Blumer) | Escalate-or-walk on a long-standing late-paying client, framed in relationship/history terms | Your choice vs. the prospective-only "Siki baseline" (exactly the Reliability→risk scoring mental model Sikizana's assessment engine uses) | The "decide at zero" panel — evaluate every counterparty prospectively |
| Finale | — | — | **You Were the Experiment**: full decision ledger (every offer shown, default displayed, selection, immediate result, later consequence) + **Irrationality Profile** (three axes: deferral, anchoring, sunk cost) + the £11bn/44% stat cards* | Replay with Rationality Delta as the score |

*\*Real figures, labelled with source and year in-game (Commons Library briefing for the Commercial Payments Bill [HL] 2026–27; DBT/OSBC London Economics research July 2025).*

**Shadow-market economics (the novel-insight layer):** three NPCs arrive as offers on the chase ladder as invoices age, each with honest-in-fiction pricing that makes their business model visible when the debrief adds it to the **Cost of Not Acting ledger**:

| NPC (fictional) | Offer | Cost mechanic the game tallies |
|---|---|---|
| **The Factor** (polished otter) | instant cash today, X% off | "solves today, discounts every day" — hides discount + service fee inside a base-rate-sounding quote |
| **The Collector** (vulture in pinstripes) | buys the debt | takes a commission % of recovery and your customer relationship with it |
| **The Shark** (smiling fish) | money now, fixed *daily* repayment | compounding shown at true-annualised terms — the daily-quote illusion, rendered honest |

Each offer shows indicative real-world ranges in its Siki card (factoring ~6.75–9.75%/yr + 0.5–2.5% service fee; collectors ~5–15% of recovery — *labelled fictional ranges, indicative*). No NPC is ever recommended; **the Zana ladder collects for free but requires consistent action** — the player draws the trade, mirroring Sikizana's read-only, human-in-the-loop brand.

**Accuracy guardrails (per rubric + BRAND.md):** UK jurisdiction named; fictional meters labelled *fictional*; everyone's "typical UK range · indicative"; no realistic credit score simulation; simplified interest flagged in an in-game assumptions sheet; edge cases (zero balance, partial payments, negative balances, rounding) tested for arithmetic.

**After playing, players should understand:** (1) deferral has a *compounding price* they never see — present bias is the tax, statutory interest is the rate; (2) counterparties exploit anchoring so *you* should quote first and quote the law; (3) persistence in chasing can be rational or bias — prospects, not history, decide; (4) the receivables industry exists on the margin between what you're owed and when — you can sell your diet to it or eat it yourself.

## 4. Visual Style & Player Experience

- **Art:** hand-drawn 2D, layered portraits (Siki's production ethos: owl + dog mascots exist in `web/components/SikiMascot.tsx` / `ZanaMascot.tsx`). Night-market palette: deep indigo sky, lantern amber, ledger green — **colourblind-safe by construction** (no red/green-only encoding; shapes + icons everywhere numbers change state).
- **Setting/lore:** a coastal night market where your books *are* the market. One recurring street scene, revisited between chapters. Siki's history panels ("ledgers since Ur" — soft lore, high texture): bills of exchange, the Medici correspondents, and the UK Statute of 1998 read as ledger entries.
- **Tone:** warm dread. Losing shouldn't read as moral failure — the street's warmth makes the exploitation *sociable*, which is the point.
- **Audio:** two persistent ElevenLabs voices (Siki/Zana), one instrumental loop for market ambience, four-five foley one-shots. All pre-baked.
- **Accessibility (the +5 rubric bonus):** subtitles always on, all audio optional (never required to proceed), adjustable text size, simple-language mode, keyboard-complete play, no colour-only state, skip/fast-forward on every timed beat, mute + restart. This is by design from day 1; not a checklist at the end.
- **Intro cinematic:** 10–20s moonrise over the street (2–4 Kling/PixVerse shots, AI-generated; poster + skip). Falls back to a still image.

## 5. Development & Future Plans

- **In the current prototype (by Nov 15):** four chapters + finale; two primary biases + one supporting; the full decision-ledger + debrief system; the daily loop, street scene, Cost-of-Not-Acting ledger, and voice audio — all playable and tested in one HTML5 build.
- **Post-jam (Jan 7 Chroma):** polish pass, a "Souq Mode" (AED currency + Gulf chapters flavour; *stretch*: Arabic subs), iOS Safari testing, a 1080p trailer, maybe a quick music v2.5 soundtrack pass.
- **Priorities:** (1) the core loop and the debrief system; (2) Ch.1 + Ch.2 complete end-to-end; (3) Ch.3 + finale; (4) art/voice polish; (5) *prototyped* nonsense cut before polish. The finale is contractually the product's learning payoff — it will not be cut for time.
- **Risks:** scope creep towards a 4th biome (watch: bookkeeping-complexity drift), voice iteration burns credits, lean art leads to "AI-slop" reads on the mascots, mobile Safari audio (desktop-judged only, but test Chrome/Firefox on Mac anyway).
- **Budget (draft, separate document also required):** ElevenLabs Starter $6/mo × 2 ($12) for two persistent voices + music + SFX; justification for PixVerse/Kling spend from Chroma pack credits (not assumed); 2D art time (solo/designed away by me), no paid hosting (itch.io is free); ≤ 10h of contract illustration at ~$300-450 if the layered-2D look needs an artist push; total cash point: ~$15–500 depending on illustration choice. Reports as receipts in the separate budget doc.

**Distribution hooks straight out of the concept:** post-jam, *The Late Market* sits at the top of Sikizana's actual funnel — `/books?flow=check` and `/check/{sector}` CTA equivalents inside the game, and the Irrationality Profile card is designed as a shareable artefact. But nothing in-game ever recommends financing — the regulatory rails (`docs/REGULATORY_PERIMETER.md`) bind the game too: exploration of debt economics, never advice.

## 6. Your Team

- **Udi Robert (@udirobert)** — solo developer. Background: production **Sikizana** AI finance assistant (Next.js/FastAPI, ~214-test backend), receivables/chase design, UK statutory-interest calculations (in production code today), Siki/Zana IP owner. This game is built by the person who already operates the receivables mechanics it teaches.
- **Needed support (hunt, optional):** contract illustration for the market street & stall portraits (~10h); a UK-Gulf cross-check read on chapter copy (~2h); fresh-eyes playtests at the internal gate.

---

# Appendix A — Chapter specs (production detail)

## A1. Experiment design discipline

Each chapter pairs **structurally symmetric** choices and changes exactly one variable, so the debrief can attribute behaviour honestly. All decisions recorded to the **decision ledger** (JSON): timestamp, chapter, options shown (incl. defaults), framing variable, choice, immediate consequence, deferred consequence. The Irrationality Profile is computed from ledger aggregates, not vibes.

## A2. Chapter 1 — *The Cost of Tomorrow* (present bias)

- **Setup:** 20 days of trading. Invoices arrive every ~3 days. A to-do queue mixes fun-now tasks (reply emails, restock, customer chat) with the boring-now task (initiate chase).
- **Engineered pair:** Day 4 & Day 12 repeat the same "chase now, cash in 30" vs "defer, cash in 30+8.3" choice — first with a *today* cost framing, second with both payoffs moved out (delayed comparison, classic hyperbolic test).
- **Silent cost engine:** each defer = 8% over base + compensation forgone, silently accruing, shown only as a drifting lantern number in the corner (never instructed to watch).
- **Debrief (4 beats then replay):** replay both paired decisions → name the timing exploit → acknowledge "sometimes deferral is cash-flow realism" → hand the reminder rule + replay 5 days with it armed.
- **Unlock:** Day 14+ lets the player **enlist Zana** (toggle): stage-1 reminders now auto-chain, exactly the commitment-device thesis.

## A3. Chapter 2 — *The Offer* (anchoring)

- **Setup:** the market offers settlement on a £1,240 invoice. Three runs, three opening anchors (their numbers first, always). The player sets a floor, then accepts or counters ~3 rounds.
- **Engineered structure:** the anchor moves; the *true* collectable prospect (invoice + statutory interest + compensation) does not. Attribution is clean.
- **Debrief:** plot floor-vs-anchor across runs; show the shift; give the flip ("quote the Act first: 8% over base, plus £40–£100 — in writing, dated, no promise"). Zana's voice carries the flip; Siki cites the statute.
- **NPC scenes:** *The Collector* probes here with a debt-buy at commission.

## A4. Chapter 3 — *Good Money After Bad* (sunk cost)

- **Setup:** a 3-year client (always 60 late) gone silent. The frame is relationship depth — every UI element highlights what you already put in.
- **Engineered structure:** escalate/continue costs more resources than the prospect view supports; a rational replay exists and the debrief contrasts your choice with the prospective-only ledger ("decide at zero").
- **Debrief:** show the decision twice — once with sunk-weighted framing, once prospective. Acknowledge sensible cases for continued investment.
- **NPC scenes:** *The Factor* and *The Shark* compete in the street while this decision runs.

## A5. Finale — *You Were the Experiment / Market Close*

- Full ledger aggregation → the street assembles for a final shot → stalls shutter one by one as the last invoice pays → quiet card: *"The Late Market never sleeps. Either you fetch it, or you discount it."*
- **Irrationality Profile** card: three bars (deferral / anchoring / sunk), each with one line from your own choices and a 'name that'.
- **Siki's last line** is honest about structure: *"Some of this was not you. Some months, there simply isn't enough. Then the fix isn't willpower — it's survival support. Ask early; it works better."* (Till Next Bill-derived guard against shame framing.)

## A6. Cost of Not Acting ledger (meta-progression)

Every NPC fee, every day of forgone statutory interest, every shipped-off relationship — accumulated as one running "what deferral paid the street." The finale totals it next to the (fictional, label-tagged) £11bn/44% UK stats.

---

# Appendix B — Production milestones (Nov 9 → Nov 15)

| Day | Deliverable | Gate | Status |
|---|---|---|---|
| Mon 9 | Repo scaffold (game logic is pure TS/Vite, no web/ dependency), decision-ledger schema, colourblind-safe tokens | Schema committed | ✅ done |
| Tue 10 | Ch.1 complete (loop + pair decisions + debrief + Zana toggle) | Replay with rule = improvement visible | ✅ done — ahead of schedule, verified in browser |
| Wed 11 | Ch.2 + Ch.3 playable; NPC offers v1 (no polish, honest maths) | Street scene state changes on defer/pay | ✅ playable — Factor/Shark/Collector offers live with honest maths |
| Thu 12 | Finale + ledger UI + Irrationality Profile; itch page drafted but **unpublished** | Clean private loop from title → reveal | 🔶 finale + profile + Rationality Delta done & browser-verified; itch page pending |
| Fri 13 | Voices generated + cut (ElevenLabs Starter), SFX pass, hit 300–500 line script budget, text-size/mute/skip Options | ~10:1 threshold: watch the ~10:1 day-test clips |
| Sat 14 | Balance pass + edge cases (zero balance, partial payment, negative, rounding), fresh-eyes playtest, screenshots | "Can a new player explain the trade-off?" = yes |
| Sun 15 | Submission package: itch page drafted privately (cover 630×500, 3–5 screenshots, AI disclosure), **Zoud: concept-Doc PDF + budget + 2-min actual-gameplay video**; submit before AOE | Done with >6h buffer |

# Appendix C — Submission materials checklists

## itch.io (HTML5 page, private until Zoud)
- [ ] `kind=html` project; zip with top-level `index.html`; relative case-sensitive paths; HTTPS externals
- [ ] Embed w/h configured; fullscreen button; `viewport` meta; canvas resize handles fullscreen
- [ ] Cover 630×500 (mascots readable at thumbnail), 3–5 genuine gameplay screenshots
- [ ] Own Start/Enable-Sound button: creates/resumes `AudioContext` inside that click
- [ ] Mobile Friendly checkbox only if it actually is
- [ ] itch.io AI disclosure completed (generative art/audio listed with tools)

## Zoud (Nov 15, 23:59 AOE)
- [ ] Individual registration for every team member (else disqualification)
- [ ] Game on itch page + submitted to jam via itch flow
- [ ] Concept Doc/initial GDD as PDF via a public no-login link (this document, trimmed, in their six-sections)
- [ ] 2-minute video of **actual gameplay** (shows the decision loop, not a trailer)
- [ ] Project budget (separate document; milestone-aware)
- [ ] AI-tool disclosure (visible to judges only)

## Chroma Games (by Jan 7, 11:45 PM PT — verify category on entry form in Dec)
- [ ] Public desktop browser playable, no install; single player; < 30 min
- [ ] Public embeddable link **+ separate download link + thumbnail**
- [ ] "Tools Used:" listing; tool-tag for ElevenLabs (+ screenshot/percentage proof retained)
- [ ] Confirm eligibility (never in a prior Chroma season / Project Odyssey; created after Feb 1, 2025)

## Privacy & regulatory rail note
Game DB contains **no real user data**; decision ledger stored in browser only (clearable). No cross-user use. The game never recommends a lender, collector, or financing product; NPCs are fictional; in-game ranges are labelled indicative. UK/Gulf framing is educational, not financial advice.

---

# Appendix D — Implementation notes (as built, 2026-11-09)

Deltas between this document and the running code, recorded so the debrief
maths stay auditable:

- **Silent cost engine (Ch.1):** the lantern accrues a *daily delta* per
  overdue-unchased invoice — one day's simple statutory interest
  (`principal × 11.75% / 365`) plus the fixed compensation **once**, on the
  first overdue day. It is NOT the cumulative s.5A entitlement re-summed
  daily (that double-counts). Clock stops at chase, not at payment — the
  30-day clearing lag is out of scope ("simplified" per the assumptions sheet).
- **Counterfactual ("the rule armed from the start"):** unconditional —
  every invoice chased the day it falls due, independent of the player's
  Zana choice. Result is £0.00 forgone by construction; the debrief's claim
  is "your run vs. the rule", not "your run vs. Zana-armed-from-day-1"
  (mathematically identical, labelled honestly).
- **Ch.2 floor instrumentation:** the floor input is blank by default — a
  pre-filled value would be anchor-derived and manufacture the correlation
  the anchoring axis measures. Unset floors record `null` and are excluded
  from the profile slope. The statutory prospect IS shown during negotiation
  (deliberate: transparency is the brand; "the facts never moved" needs the
  constant on screen).
- **Ch.3 sunk-cost axis:** counts `ch3_continuation_*` entries only;
  street offers (`ch3_street_*`) are a separate decision.
- **Compensation boundaries (s.5A):** ≤ £1,000 → £40 · > £1,000 and
  ≤ £10,000 → £70 · > £10,000 → £100.
- **Persistence:** decision ledger (`lm.ledger.v1`) + Ch.1 mid-run state
  (`lm.ch1.v1`, cleared on chapter close) in localStorage only; title-screen
  purge clears both.
