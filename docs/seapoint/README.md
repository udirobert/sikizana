# Seapoint / FinOps Hackathon — 2026-10-20

> **Status: event complete — connector dormant.** The hackathon ended and the
> account was sandboxed, so there is no Seapoint access going forward.
> `src/services/connectors/seapoint.py` stays in the tree (opt-in via
> `SEAPOINT_ENABLED=1`, off by default) as a working reference for the second
> connector — it already normalizes a real vendor's API onto the
> `AccountingConnector` contract, and real sandbox data ran through the full
> findings pipeline end to end. If access returns, `python -m
> src.jobs.seapoint_login` + `seapoint_smoke` is the bring-up.
>
> **Event:** FinOps Hackathon, Tuesday 20 October 2026, London. Hosted by
> Seapoint and 13books Capital, supported by Claude. **Code freeze 20:20
> London** (12:20 PT). **Recording must start by 20:05 London** (12:05 PT).
>
> Scope note: unlike the HSBC namespace, this work is **not** separate from the
> product runtime — a Seapoint connector would live in `src/services/connectors/`
> and run inside the app. The *event material* is separated; the code is not.

---

## What the event is

An in-person FinOps build day for founders, CFOs and accountants. Bring a
finance workflow, build an agent to take it on, leave with a working tool.

- **Connect the Seapoint MCP** — a sandbox account with dummy data; nothing
  touches a real account. The MCP is the data source: bank accounts, Xero
  accounting, Stripe, and email-captured invoices, already categorised.
- **Pick a playbook, or bring your own problem.**
- **$100 Claude API credits** per person (Claude Console API credits, not a
  Claude.ai subscription).
- **Submit a two-minute demo video** — Loom or screen recording.

**Judging:** technical execution · product thinking · agent autonomy · UX
clarity · real-world applicability · safety and oversight. Three places; top
five demos live.

## The pitch — "what problem are you solving?"

Lead with the vignette, not the architecture. Judges have heard a dozen
"agent explains your data" pitches; the concrete moment of loss is what
makes it a problem:

> "A founder runs the monthly payment run. One invoice gets paid twice.
> Nobody notices — there's no code review for payments. Our tool flags it
> with the two source records side by side, drafts the credit-note request,
> and waits for a human to click approve."

The framing sentence: **the payment run is the last unreviewed workflow in
startup finance.** Name the workflow like a job a finance team should have —
"the payment-run review" pattern-matches instantly.

The 15-second answer:

> "Startups pay the same bill twice, vendors spike quietly, supplier bank
> details change and nobody verifies. There's no control layer between
> 'spend happened' and 'month-end' — so we built one on Seapoint. You ask
> what you spent; it explains from real transactions. It flags each leak
> *with the evidence*, and nothing happens until a human approves.
> Read-only on the source — that's the safety story."

Delivery rules:

- **Use the real number.** "Leaks money" is vague; "we scanned the sandbox
  books and found £4,120 of ownerless spend and a Notion subscription billed
  twice — in about 30 seconds" is a fact with a clock on it.
- **Say "the agent", not the persona names.** "Siki explains, Zana enforces"
  is a visual beat — let the mascot handoff land on screen, don't spend
  pitch-time on two names.
- **Say "sandbox data" out loud.** At a hackathon hosted by the platform,
  provenance honesty reads as engineering maturity, not weakness. Same for
  "possible duplicate" — risk requiring review, never a fraud allegation.

## Why Sikizana is the right project

Seapoint sells to founders the workflow Sikizana already does: month-end close,
the board pack, the payment run, invoice capture, spend categories, VAT
estimates, runway. The product claim — *find money, stop leaks, get paid* — is
a FinOps claim, and the agent already performs the hard parts:

- aged receivables (30/60/90 + true days-to-get-paid) from payment history
- **AP Integrity**: evidence-backed duplicate bill/payment detection
- a 5-stage chase ladder with statutory interest and fixed-sum compensation
- approval-gated journal proposals and chases (read-only by default)
- sector benchmarking, UK Corporation Tax estimation with HMRC citations
- local memory of the business's payment patterns

And it already has the extension point this hackathon asks for:

| Piece | Location |
|---|---|
| `AccountingConnector` ABC (16 methods) | `src/services/connectors/base.py` |
| Platform dispatch — one dict entry | `src/services/connectors/registry.py` |
| The adapter to copy | `src/services/connectors/xero.py` |
| Existing MCP surface (stateless AP scan) | `src/mcp_server.py` |
| Demo books ("cafe" / "music") that work with zero credentials | `src/services/xero_service.py` |
| Findings workflow UI | `web/app/books/page.tsx` |

**Adding a second platform is one file plus one registry line.** Nothing in the
agent, tools, findings, or API layer changes.

## The demo — work back from 4 shots (120s)

Don't demo the product. Demo 4 pausable shots. One line: *"We asked
what we spent last month. Siki explained it. Zana stopped the leaks.
Here's the proof."*

| Shot | Time | Screen | Visual — reuse, don't build | Say |
|---|---|---|---|---|
| 1. The hook | 0:00–0:25 | `/books?flow=check` pre-loaded | Chat bubble with the brief's exact prompt (*"What did we spend last month, broken down by category?"*) → big `AnimatedNumber` total (`web/components/AnimatedNumber.tsx`) → horizontal category bars (copy `BenchmarkCompareBar.tsx` pattern, not a pie — pies don't film) with MoM badges (`+12%` rose, `-3%` sky, `+22%` amber pulse) → `ProfitTrendChart.tsx` sparkline re-used as spend trend (flip green/red so up = red) | "Connected Seapoint MCP this morning, sandbox data, read-only. One question, instant breakdown." |
| 2. The leaks | 0:25–1:10 | Findings | `FindingsPanel.tsx` + `CheckProofCard.tsx` (`AgeingEvidence` / `DuplicateEvidence` row layout) re-skinned to 3 spend cards: rose = duplicate subs (`Notion ×2`), amber = spike vendor (`Vercel £1,840 vs £420 typical` + mini sparkline + `+338%` badge), sky = ownerless spend (`£4,120 no owner tag`). Siki `mood="look"`. Flash `WhileAgentWorks.tsx` + `ToolCallTrace.tsx` ~3s while it "audits", then `ProactiveAlert` slides in. Click one card only. | "Siki audits on load, before I type. Evidence first, action second." |
| 3. The action | 1:10–1:45 | Approval gate | Swap to `ZanaMascot` (dark slate, rose eyes — audience *feels* the handoff). `NegotiationEmailCard.tsx` re-used as vendor nudge + `JournalEntryCard.tsx` for reclass. Big Approve click → `SuccessCheck.tsx` + `AnimatedNumber` counting down exposure. Cut to `/activity` for 5s — every write journaled. | "Zana drafts, I approve. Every write is logged here. Revocable, auditable." |
| 4. The payoff | 1:45–2:00 | `/impact` | `OverdueTrendChart.tsx` — renamed because the series, caption and copy are overdue-specific: **film it as what it plots**, don't relabel it "preventable spend". `demoTrend()` already handles <2 snapshots — perfect for tonight. `StatCard`s (`web/components/StatCard.tsx`) with `AnimatedNumber`; note "Money Recovered" reads £0 until a chase actually completes — either drive one or let the £0 be true. Siki `mood="celebrate"`. Freeze on this chart — it's the thumbnail. | "£X still owed across N invoices, flagged with the source records. Read-only until approval, fully traceable." |

Visual rules: 1440px window, 125% zoom (`text-[11px]` labels vanish on
Loom otherwise), stone-50 bg, separate takes per shot. On provenance, what the
code actually renders: `ModeBadge` takes no `label` and says **"Sample data"**,
and the impact chart says *"connect Xero"* **twice** in sample mode — the
sub-header (`OverdueTrendChart.tsx:144`) and the Siki caption under the mascot
(`:60`, "…connect Xero and I'll track your real numbers") — on a Seapoint
demo that wording contradicts the voiceover, so pass the connector's `mode()`
through or don't film that frame. One
interaction only on camera: the Approve click. Everything else is scroll.
Pre-seed the thread so `?flow=check` opens with findings already there —
typing and loading kill Looms.

## Why this reuses Sikizana's visual system

| Tonight's shot needs | Already shipped in `web/components/` | Change for Seapoint |
|---|---|---|
| Animated total | `AnimatedNumber.tsx` (blur-slide digit pop) | None — pass spend total |
| Category bars | `BenchmarkCompareBar.tsx` pattern | New labels + MoM badges |
| Spend trend | `ProfitTrendChart.tsx` sparkline / `OverdueTrendChart.tsx` area | Sparkline takes a value + label — usable for spend. The area chart is overdue-only; don't force it |
| Finding cards with evidence rows | `FindingsPanel.tsx` + `CheckProofCard.tsx` | **Reuse `ap_duplicate_payment` / `ap_payment_anomaly` / `ap_supplier_detail_change`** — they already carry icon, label, gloss, and the review affordance. A genuinely new kind is 3 edits: constant + `ALL_KINDS` in `src/services/finding_kinds.py`, the `FindingKind` union in `web/lib/api.ts`, one entry in `FINDING_KIND_META` (`web/lib/finding-kinds.ts`) — `tsc` and `tests/test_finding_kinds.py` both fail until all three match |
| Agent working state | `WhileAgentWorks.tsx` + `ToolCallTrace.tsx` + `ThinkingTrace` | None — point at Seapoint tools |
| Approve → celebrate | `JournalEntryCard.tsx` + `NegotiationEmailCard.tsx` → `SuccessCheck.tsx` | Copy strings to spend wording |
| Impact close | `OverdueTrendChart.tsx` + `StatCard.tsx` + `ModeBadge.tsx` | `demoTrend()` seed + honest demo copy |
| Duo handoff | `SikiMascot.tsx` (`look`/`celebrate`) vs `ZanaMascot.tsx` (rose eyes) | Siki explains, Zana enforces — per `docs/BRAND.md` |

## The decision gate — resolve in the first 20 minutes

The Seapoint sandbox MCP tool list decides what the demo can be. Connect it and
run *"What did we spend last month, broken down by category?"* — if that returns
something sensible, we are connected.

Then: **does the MCP expose invoice/payment/contact-level tools, or only
aggregates (burn, runway, spend-by-category, VAT, overdue invoices)?**

| MCP surface | Demo wedge |
|---|---|
| Invoices + payments + contacts exposed | **Full wedge** — aged receivables → chase draft; duplicate bill → AP finding → **Approve** |
| Aggregates only | **Month-end close briefing** — spend-by-category anomalies, burn/runway, overdue items, rendered in the same findings UI |

Do not build against a guessed tool surface. Read the tools first.

## Scope

**In scope**

- `src/services/connectors/seapoint.py` implementing the `AccountingConnector`
  methods the demo needs, reading the Seapoint MCP.
- One entry in `_REGISTRY` in `src/services/connectors/registry.py`.
- A session/platform toggle so the demo session resolves to Seapoint.
- Provenance surfaced in the UI — the app already reports `mode()` per connector;
  the demo must say **"sandbox data"** on screen.

**Out of scope**

- No migration of the product to Seapoint. Xero stays the default platform.
- No writes to Seapoint. The MCP is a read surface; the demo stays read-only
  against the source, with Sikizana's own approval gate in front of anything
  consequential.
- No new product surface. The demo enters through the canonical findings
  workflow (`/books?flow=check`), not a bespoke dashboard.
- No claims of customer, savings, ROI, or measured impact. The sandbox data is
  dummy; the output is illustrative.

## Doc-truth housekeeping (do this at implementation, not now)

When the connector is actually registered, three statements in the repo become
stale and must be corrected in the same change:

1. `AGENTS.md` § *Connector abstraction layer* — "Today only Xero is registered.
   Adding QuickBooks/Sage means: …"
2. Root `README.md` — the "connects to Xero" framing and the "Sign in with
   Xero" auth-model language.
3. Any user-facing string about the connector. **Read `docs/BRAND.md` first** —
   the Siki/Zana duo rule and the honesty rules govern all copy.

## Files

- [`BUILD_PLAN.md`](./BUILD_PLAN.md) — the timed run sheet, the method→MCP-tool
  mapping, the demo script, the fallback path, and the submission checklist.
