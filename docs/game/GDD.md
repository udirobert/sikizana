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
- **Platform:** browser (HTML5, itch.io; single-player; no install; ~10–15 min)
- **Target audience:** adults who own/operate or dream of running a small business; secondary: secondary-school business studies (ages 14+)
- **What's different:** most FinLit games *explain* biases. This one **runs you through them silently first** — your plays are recorded, replayed to you as experiment data, and only then are the biases named (the Shady Sam "incentive inversion" move, applied to your own psychology instead of a villain's). The second reveal layer is economic: your lateness is the **business model of an entire shadow market**, visualized as a street that visibly changes as you act — stalls light when you defer, shutter when you get paid.

**Voice rule (from `docs/BRAND.md`, canon):** Siki explains, Zana enforces. Siki's lines are calm, cited, hedged (*"typical UK ranges · indicative"*). Zana's are short, blunt, action-first, and **never promise payment**. NPCs are fictional composites; the game explains dynamics and never recommends a provider, product, or financing.

## 2. Core Gameplay

**Player objective:** keep a small business solvent through one business week while collecting the money you are owed.

**The core loop (one persistent stall screen; the whole place is always on screen):**

The whole game lives on a single screen that is a place, not a form. Three
things are always visible at once — the **till** (live cash), the **ledger**
(one card per open invoice, ageing daily with a "worth today" price that
grows), and the **street** (the shadow market outside). Each day you pick one
action from a small vocabulary — serve walk-in work, chase an invoice, pay a
supplier bill — then watch the till, the ledger, and the street react.
Minute one is a scene before it is a screen: the Shark walks past your
stall, Zana answers him, and his off-book offer — take 70% of an old debt,
refuse, or counter — is the player's first real decision before the
shutters open. On every
decision beat the day's scene and choice render ABOVE the ledger strip —
the first viewport is till → decision → buttons; the cards sit below as
the books they are. A voiced day-opener (Siki or Zana, one line) frames
each morning.

1. **Plan** — pick today's one action: *serve walk-in work, chase an invoice, pay the supplier bill, accept/decline a street offer*.
2. **Watch the ledger age** — unpaid invoices accrue a "worth today" price every day (the discounting lesson, one UI element); a chase pays the next morning, so Day 1's money is in the till before the bill.
3. **Handle temptation** — each chapter plants one engineered decision exploiting one bias.
4. **Live the consequence** — cash and the ledger update; the street's stalls light when you defer and shutter when you get paid; skipping the supplier bill can run the till empty, which ends the week early.

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
- **Accessibility (the +5 rubric bonus):** a labelled market picker before play, subtitles always on, all audio optional (never required to proceed), adjustable text size, simple-language mode, keyboard-complete play (every visible choice carries a keycap: `1`–`9` picks it, `Enter` continues — clicking always works too, and the outbound door never takes a key), no colour-only state, skip/fast-forward on every timed beat, mute + restart. This is by design from day 1; not a checklist at the end.
- **Intro cinematic:** 10–20s moonrise over the street (2–4 Kling/PixVerse shots, AI-generated; poster + skip). Falls back to a still image.

### 4a. Souq Mode — the Gulf market (the +5 localisation bonus, shipped)

The rubric's UAE/Arab-localisation bonus asks for **authentic adaptation — interest-free
finance framing, Zakat, AED — not just translation**. A currency toggle would have been
translation: converting pounds to dirhams over the UK statute's 8%-over-base interest
would keep an instrument the market does not permit, and the rubric judges accuracy at
25 points. So the game ships two lawful markets, chosen on the title screen:

| | UK | Gulf (Souq) |
|---|---|---|
| Unit | GBP | AED (indicative 4.8, labelled) |
| Remedy | Late Payment of Commercial Debts (Interest) Act 1998 — 8% over BoE base + £40–£100 fixed compensation | **Contractual late fee in the supplier's own terms** — 2% per commenced 30 days, capped at 8%, plus a fixed AED 250 administration charge |
| Cost of deferral | the street's take vs statutory entitlement | the street's take vs the contractual fee, **plus zakat on uncollected receivables** |

Why the contractual fee is the *better* teaching instrument for Ch.2 (anchoring): the
ceiling is a number the player wrote into their terms on day one and has since forgotten,
so the desk is quoting their own forgotten agreement back at them. Same bias, cleaner
instrument, no interest anywhere.

Implementation is one seam, not two codebases: `src/engine/market.ts` owns the mode,
the display conversion, the remedy, and the zakat line. All arithmetic stays in base
units so both markets carry an identical week (the balance of the game is unchanged and
every existing test keeps its meaning); only display converts, and every figure lands on
a whole dirham at the indicative rate. Switching market clears saved progress, because a
ledger recorded against one remedy would make the other's debrief incoherent.

Zakat is stated as **widely followed practice, hedged once** ("commonly due"), because
schools differ on slow and doubtful debts — the same accuracy rail the UK stat cards
carry. Sources: Atradius Payment Practices Barometer, UAE 2025 (58% of B2B invoice value
overdue; 8% written off as bad debt).


## 5. Development & Future Plans

- **In the current prototype (by Nov 15):** four chapters + finale; two primary biases + one supporting; the full decision-ledger + debrief system; the daily loop, street scene, Cost-of-Not-Acting ledger, and voice audio — all playable and tested in one HTML5 build.
- **Two markets, shipped in the jam build:** the title screen offers **UK** (pounds, statutory remedy) or **Gulf / Souq** (AED, contractual remedy). See §4a. Arabic localisation remains post-jam (Jan 7 Chroma), together with a polish pass, iOS Safari testing, a 1080p trailer, and a music v2.5 soundtrack pass.
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

## A2. Chapter 1 — *The Cost of Tomorrow* (present bias) — 3-day build

- **Setup:** 3 trading days on one stall screen, over the persistent night
  market (the cover painting is a dimmed backdrop behind every chapter).
  Harborne's £2,400 is already late when the shutters open. The supplier's
  **£2,000** bill is due Day 2. The same Harborne amount is due again on
  Day 3. The to-do mixes fun-now tasks with the boring-now chase.
- **Engineered pair:** both days offer the SAME numbers — "the money lands
  in 1 day" vs "in 10 days instead" — the only variable is how near the
  near payoff sits: Day 1's chase lands **in the week, on the till**
  (£2,400 arrives Day 2, before the bill); Day 3's chase is the identical
  arithmetic **the morning after the close**. No button leaks which arm
  is better (numbers identical), so the debrief's framing
  attribution is honest — the tilt felt is the present-bias one: the
  identical "in 1 day" is tomorrow morning on Day 1, and the morning
  after the close on Day 3. A deferral commits: each invoice is offered
  once, and a deferral (explicit or the easy work auto-committing it)
  locks the 10-day payoff and is never re-offered shorter.
- **The day the till can empty:** the supplier bill (Day 2). The till
  displays the *net position* (cash minus the unpaid bill), so skipping it
  drops the till by the full £2,000. The unpaid face exceeds the £1,200
  start, so the careless run empties **on the skip day itself**
  (`endedEarly`). A run that chased Harborne on Day 1 can pay the bill
  from the money that lands that morning. A rational run and a careless
  run end differently, and the street shows why.
- **The card falls, the street grows:** each ledger card shows a "worth
  today" that *falls* as the invoice ages (indicative 2%/day off face,
  capped 30%). The drifting lantern is the street's earnings — the exact
  value the invoices shed while they sat ("your lateness is someone else's
  business model" as literal arithmetic) — and the street strip carries the
  running tally ("the stalls keep their books — £X so far"). The statutory
  entitlement is a larger, real legal floor, named in the debrief only,
  never on the card.
- **Debrief (street → replay → name → tool):** the street's earnings first
  ("the street took £X — £Y for the invoices you let age, £Z in late
  charges… your lateness is their trade") → line-item replay of every
  invoice you let sit (priced over the exact window the lantern accrued;
  line items sum to the lantern to the penny; each line also names the
  statutory floor over the same days) → the timing exploit named on the
  player's own numbers → the reminder rule + Zana. No trap is labelled in
  play.
- **Unlock:** the reminder rule (Zana's first-stage ladder auto-chains) — the
  commitment-device thesis, now the debrief's takeaway rather than a Day-14
  toggle.

## A3. Chapter 2 — *The Offer* (anchoring)

- **Setup:** the market offers settlement on a £1,240 invoice. Three runs, three opening anchors (their numbers first, always). The player sets a floor, then accepts or counters ~3 rounds.
- **Engineered structure:** the anchor moves; the *true* collectable prospect (invoice + statutory interest + compensation) does not. Attribution is clean.
- **Debrief:** plot floor-vs-anchor across runs; show the shift; give the flip ("quote the Act first: 8% over base, plus £40–£100 — in writing, dated, no promise"). Zana's voice carries the flip; Siki cites the statute.
- **NPC scenes:** *The Collector* probes here with a debt-buy at commission.

## A4. Chapter 3 — *Good Money After Bad* (sunk cost)

- **Setup:** a 3-year client (always 60 late) gone silent. The frame is relationship depth — every UI element highlights what you already put in.
- **Engineered structure:** escalate/continue costs more resources than the prospect view supports; a rational replay exists and the debrief contrasts your choice with the prospective-only ledger ("decide at zero").
- **Debrief:** show the decision twice — once with sunk-weighted framing, once prospective. Acknowledge sensible cases for continued investment.
- **NPC scenes:** *The Factor* and *The Shark* step up in turn, each as a full-screen beat — one character, one number, one decision. The Factor's instant cash lands big in green (relief); the Shark's daily number lands big in red (the drip). Same staging, mirrored meaning.

## A5. Finale — *You Were the Experiment / Market Close*

- Full ledger aggregation → the street assembles for a final shot → stalls shutter one by one as the last invoice pays → quiet card: *"The Late Market never sleeps. Either you fetch it, or you discount it."*
- **Irrationality Profile** card: three bars (deferral / anchoring / sunk), each with one line from your own choices and a 'name that'.
- **Your week in one line:** a quotable verdict between the profile and the cost — Siki names the dominant lean from your own data, Zana gives the counter-move. The title screen reads your best week back (score, date, verdict) as the score-chase hook.
- **Siki's last line** is honest about structure: *"Some of this was not you. Some months, there simply isn't enough. Then the fix isn't willpower — it's survival support. Ask early; it works better."* (Till Next Bill-derived guard against shame framing.)

## A6. Cost of Not Acting ledger (meta-progression)

Every NPC fee, every day of forgone statutory interest, every shipped-off relationship — accumulated as one running "what deferral paid the street." The finale totals it next to the (fictional, label-tagged) £11bn/44% UK stats.

---

# Appendix B — Production milestones

**Original plan (Nov 9 → 15, superseded Nov 12 by the recovery plan):** see
`docs/game/RECOVERY_PLAN.md` §5. The 20-day Ch.1 shipped as a one-button
worksheet on Nov 10–11 (all milestones below green on paper, but the first
minute was not playable). On Nov 12 the game was rebuilt to the stall-screen
design in one day; the remaining window (Nov 12 → 15) was re-planned:

| Day | Deliverable | Gate | Status |
|---|---|---|---|
| Mon 9 | Repo scaffold, decision-ledger schema, colourblind-safe tokens | Schema committed | ✅ done |
| Tue 10 | Ch.1 v1 (20-day loop + pair decisions + debrief) | Replay with rule = improvement visible | ✅ done — later cut (below) |
| Wed 11 | Ch.2 + Ch.3 playable; NPC offers v1 | Street state changes on defer/pay | ✅ done |
| Thu 12 | **Rebuild:** 5-day Ch.1 on one stall screen (till + ledger + street always visible); money lands in 2 days; supplier bill that can empty the till; loss state; £0 counterfactual → line-item replay; traps de-labelled; simple-language mode shipped | Minute one shows cash, an overdue invoice, and a street; a choice can hurt; rational and careless runs end differently | ✅ done (pass 1) — then **second-pass rework same day** after a playthrough review: falling "worth today" card, controlled pair (both arms pay after the week), net-position till with a bill that leaves it (£1,600; the £40 fee empties the careless run's till on day 5), persistent market backdrop, street base 3 → 2 |
| Fri 13 | Street SVG stalls + NPC shapes; Ch.2/Ch.3 de-labelling; voice re-bake (4 lines); concept doc + budget PDFs | No trap labelled in play; honest accessibility claims only | ✅ done — then **third-pass rework after a sharper review**: the pair becomes the till-mover (day-3 chase lands in-week; day-5 identical arithmetic past the close), deferrals commit (no re-offer, day-2 real invoice), bill £1,600 → £2,000 (careless empties day 4, every seed), street running tally + base lit 2 → 1, ch2/ch3 persistent stall chrome, legal floor is a real Act figure (£71 not £1) |
| Sat 14 | Balance pass + edge cases, fresh-eyes playtest, screenshots, **2-min gameplay video** | "Can a new player explain the trade-off?" = yes | |
| Sun 15 | Submission package: itch page (private), cover 630×500, screenshots, AI disclosure, concept-doc PDF + budget + 2-min video, Zoud submission | Done before 23:59 AOE | |

# Appendix C — Submission materials checklists (status: Nov 13, 3rd pass)

## itch.io (HTML5 page, private until Zoud)
- [x] `kind=html` project; zip with top-level `index.html`; relative case-sensitive paths (`scripts/build-itch.mjs`, 63 files, ~4.9 MB, no externals)
- [x] Embed w/h configured (1280×860); `viewport` meta; own Start button
- [x] Cover 630×500 (`game/cover/cover_630x500.png`, generated by Recraft V4.1 Vector + composed title) — mascots readable at thumbnail; 15 genuine gameplay screenshots (`game/screenshots/v9/`)
- [x] Own Start/Enable-Sound button: creates/resumes `AudioContext` inside that click
- [ ] Mobile Friendly checkbox — NOT ticked (desktop-only; test on phone before claiming)
- [x] itch.io AI disclosure: voice + music + SFX (ElevenLabs Starter, `eleven_v4`); cover illustration (Recraft V4.1 Vector); no AI code claims

## Zoud (Nov 15, 23:59 AOE)
- [ ] Individual registration for every team member (else disqualification) — Udi Robert
- [ ] Game on itch page + submitted to jam via itch flow
- [x] Concept Doc PDF via a public no-login link (`docs/game/CONCEPT_DOC.pdf`, six sections, honest market section)
- [x] 2-minute video of **actual gameplay** — `game-video/lm_run.mp4` (~67s, silent, the real decision loop: title → Day 1 stall screen → day-3 pair (the till-mover) → bill stress → day-5 pair B → debrief)
- [x] Project budget (separate document; milestone-aware) — `docs/game/BUDGET_DOC.pdf` (≤$26, ceiling check against the $15–500 band)
- [x] AI-tool disclosure (visible to judges only): same tool list as itch

## Chroma Games (by Jan 7, 11:45 PM PT — verify category on entry form in Dec)
- [ ] Public desktop browser playable, no install; single player; < 30 min
- [ ] Public embeddable link **+ separate download link + thumbnail**
- [ ] "Tools Used:" listing; tool-tag for ElevenLabs (+ screenshot/percentage proof retained)
- [ ] Confirm eligibility (never in a prior Chroma season / Project Odyssey; created after Feb 1, 2025)

## Privacy & regulatory rail note
Game DB contains **no real user data**; decision ledger stored in browser only (clearable). No cross-user use. The game never recommends a lender, collector, or financing product; NPCs are fictional; in-game ranges are labelled indicative. UK/Gulf framing is educational, not financial advice.

---

# Appendix D — Implementation notes (as built, 2026-11-12 rebuild; 2026-11-13 3rd-pass rework)

Deltas between this document and the running code, recorded so the debrief
maths stay auditable. The Nov 12 rebuild (recovery plan, `RECOVERY_PLAN.md`)
supersedes the 20-day v1 shipped Nov 10–11; the Nov 13 third-pass rework
re-centered Chapter 1 on the pair as the till-mover. The deltas below are
the jam build's source of truth.

- **Chapter 1 is 3 days.** The pair is Day 1 and Day 3 (same `experimentId`).
  `CH1_DAYS = 3`. The Claims Desk is the next chapter, not day five.
- **The pair IS the till-mover.** The day-1 chase lands **in the week, on
  the till the player is watching** (`CHASE_CLEAR_DAYS = 1` → £2,400 lands
  Day 2, the morning the bill is due), while the day-3 chase is the identical
  arithmetic **the morning after the close**. Both days offer the SAME
  numbers ("in 1 day" vs "in 10"), so no button leaks which arm is better.
  The tilt the player feels is the present-bias one: the identical "in 1 day"
  is tomorrow morning on Day 1, and the morning after the close on Day 3.
  That concreteness gap IS the experiment.
- **Deferrals commit (round-2 fix, reworked in pass 3).** Each invoice is
  offered ONCE, on its due day; a deferral (explicit, or the easy work
  auto-committing it at day's end) locks the 10-day payoff and the invoice
  is NEVER re-offered with a shorter one. `dayChoices()` always offers the
  oldest still-undecided live invoice, so the controlled 2-vs-10 comparison
  is locked in at the choice and lasts the whole week — the second-pass
  bug (non-pair days re-offered an unchased invoice at `CHASE_CLEAR_DAYS`)
  is gone.
- **Day 2 is the bill.** Harborne's chase from Day 1 lands that morning,
  which is what makes £2,000 payable. There is no second ordinary invoice.
- **The supplier bill (Day 2):** `Quayline Foods`, **£2,000** due
  (2nd pass: £1,600 · v2: £1,800). It is a LIABILITY, not a one-shot cash
  outflow: the till displays the **net position** (`cash − unpaid bill`),
  so skipping it drops the till by the full amount, and the £40/day late
  charge then *leaves the till* (via the net position) every morning while
  walk-in trade stops. The till can empty on the skip day itself (the
  unpaid face exceeds the till), not only on the last day's fee — loss
  state is robust across seeds, not a one-seed knife edge (2nd pass
  died on the £40 fee alone). Loss state fires on net position
  (`endedEarly: "till_empty"`), checked *before* the week-end flag so a
  till that empties on the last day still ends as a loss. A run that
  chased the early invoices can still pay it cleanly.
- **The card falls, the lantern is the street's take.** The ledger card's
  "worth today" is the invoice's market value — it **falls** as the invoice
  ages (2% of face per day past due, capped at 30%, indicative, per GDD §2
  discounting lesson). The silent lantern is the **street's earnings**: the
  exact value the invoices shed while they sat (the discount the Factor
  captures) — "your lateness is someone else's business model" made literal,
  and the mirror of the card (same `daysOverdueOn`/`worth` arithmetic, so
  card count and value share one formula). The street strip carries a
  running £ tally ("the stalls keep their books — £X so far") so the take
  is felt while it accrues, not only at the debrief. The statutory
  entitlement (8% over base + s.5A compensation) is a larger, real legal
  **floor** — it is reported per line in the debrief ("the law would have
  accrued £X over those same days"), never on the card. A v2 bug conflated
  the two: the card showed a rising entitlement while the debrief called it
  "money you never get back" — the "potentially misleading implications"
  cut.
- **Counterfactual deleted (v1) → line items priced by the street (v2).**
  `deferralLines()` prices each invoice the player let sit over the exact
  window the lantern accrued it (first day past due → day before the chase,
  `lastPlayedDay` horizon for loss runs), with the same `valueShedForDay`
  daily function — line items sum to the lantern to the penny (unit-tested
  to 9 decimals), nothing the game invented. The one-time s.5A
  compensation accrues at the FIRST overdue day, which every priced window
  includes by construction — so the debrief's "legal floor" is a real Act
  figure (daily interest + the £40/£70/£100), not interest-only pennies,
  and "two prices for one habit" compares the street's take against a
  price the player could actually have collected.
- **De-labelling (rubric: learning emerges in play; accuracy band):** no
  choice button or offer card carries a statute, an annualised rate, or an
  "honest" label anymore. The Shark's true annualised cost and the Factor's
  annual discount move to the Ch.3 debrief; the Ch.2 statutory prospect moves
  off the negotiation screen into the debrief ("the facts never moved" is
  now a *reveal*). This overrules the v1 "transparency is the brand" note —
  the rubric's "potentially misleading implications" and "emergent learning"
  bands take precedence.
- **Street (Ch.1 screen + finale):** one SVG street, five stalls — the
  market CART is the only always-lit base (3rd pass: base dropped 2 → 1,
  `STREET_BASE_LIT = 1`, so the Factor/Collector/Shark stalls AND the
  awning stall all start DARK and light only on the player's own
  deferral/skipped-bill/fees — the debrief's "it lit up" is true only when
  something actually lit). The three stallholders' stalls light by
  deferrals / skipped bill / fees, shutter by collections that land. The
  caption carries the running tally: "The Late Market · N lit · M shut ·
  the stalls keep their books — £X so far". `streetState()` is the single
  derivation; `renderStreet()` is the single renderer. ch1 street events
  live in session counters (they create no ledger entries); ch2/ch3 NPC
  fees are read from the ledger. One shared `StreetCounters` feeds both.
- **Persistent stall chrome (3rd pass):** Ch.2 and Ch.3 no longer clear the
  stall for a bare number field. Both render the shared stall chrome
  (`src/ui/stall.ts`: `renderTill` + `renderLedger`, built once by
  `makeStallChrome()`) that SURVIVES every beat — Ch.2's till is "On the
  table" (the live anchor; the collector beat shows the buy price; the
  debrief shows the revealed prospect) and its ledger is the claim card;
  Ch.3's till is "Mareline's account" / "Decide at zero" and its ledger is
  the account card. Only the stage below the chrome clears per beat.
  Stalls are 44px (up from 34px) and the street strip is 720px wide.
- **Ch.2 floor instrumentation:** the floor input is blank by default — a
  pre-filled value would be anchor-derived and manufacture the correlation
  the anchoring axis measures. Unset floors record `null` and are excluded
  from the profile slope. (The prospect is no longer shown during play — see
  de-labelling above.)
- **Ch.3 sunk-cost axis:** counts `ch3_continuation_*` entries only;
  street offers (`ch3_street_*`) are a separate decision. A reveal beat was
  added to the Ch.3 debrief: the true annualised cost of the street's money,
  on the player's own choices.
- **Simple-language mode (GDD §4 / +5 bonus):** `phrased()` string swap on
  the longest teaching lines; the Options toggle ships (previously the bonus
  was claimed without the feature — now honest).
- **Compensation boundaries (s.5A):** ≤ £1,000 → £40 · > £1,000 and
  ≤ £10,000 → £70 · > £10,000 → £100.
- **Persistence:** decision ledger (`lm.ledger.v1`) + Ch.1 mid-run state
  (`lm.ch1.v1`, cleared on chapter close) in localStorage only; title-screen
  purge clears both. Prefs now also carry `simpleLang`.
