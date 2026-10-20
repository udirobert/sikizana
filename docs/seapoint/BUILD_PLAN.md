# FinOps Hackathon — build plan & run sheet

> Companion to [`README.md`](./README.md). Times are **London** (BST). The
> operator is in US Pacific — subtract 7 hours for local time.
>
> **20:20 London = 12:20 PT.** Recording starts **20:05 London = 12:05 PT**.

---

## Progress (as of ~19:40 London)

**Built and tested offline (stubbed MCP):**

- **Connector.** `src/services/connectors/seapoint.py` maps tools onto the
  contract: `query_invoices`, `query_payments`, `query_transactions`,
  `query_transaction_participants`, `query_categories` and `get_current_user`.
  The five write tools are deliberately never called.
  - Spend by category is a `query_transactions` aggregate (`where.direction:
    "debit"`, sum of `reporting_amount` grouped by `category_id`). Labels come
    from `query_categories`; last month is compared with the month before.
  - Seapoint invoices are payables, so they surface as overdue *bills*, never
    as receivables to chase.
  - Only `outbound` + `succeeded` payments count, so a scheduled payment can't
    pair with a completed one as a false duplicate.
  - No unreconciled findings: the schema has no field that proves it.
  - Responses are cached for 120s per tool and arguments.
- **Off switch.** `SEAPOINT_ENABLED=1` registers the platform. When it's unset,
  Seapoint is invisible and sessions fall back to Xero/sample.
- **Auth.** seapoint-staging is OAuth-only. `python -m src.jobs.seapoint_login`
  runs a one-time browser sign-in and stores the token at
  `data/seapoint_oauth.json` (gitignored, 0600, plain JSON: a sandbox-only
  simplification). `SEAPOINT_MCP_TOKEN` is an optional bearer override.
- **Provenance in three states.** `/api/xero/status` returns `provenance:
  live | sandbox | sample`. The sandbox badge reads
  "● Seapoint sandbox · read-only"; no "your books", Xero CTAs or upgrade
  banner under sandbox.
- **Review is the approval.** AP and café review decisions write a
  `finding_reviewed` audit row (*"Confirmed: Possible duplicate payment —
  {supplier} £{amount}"*). The card shows "Logged to audit trail" linking to
  `/activity`. Journals the connector refuses show "Not posted — read-only".
- **Shot 1 tool.** `get_spend_by_category` (agent tool) renders a
  `spend_breakdown` card: horizontal bars that grow in, MoM badges, spikes of
  25% or more highlighted.
- **Judge self-serve.** "Try it on the Seapoint sandbox" in the `/books`
  hero (only shown when signed in), deep link `/books?source=seapoint`,
  "Switch to sample books" to leave, and the kickoff prompt as the first chip.
- **Brand cards.** `cards/` holds the A/B/C stings and `assemble.sh`.

**Not yet proven:**

1. A live run: `seapoint_login`, then `seapoint_smoke`. Still unconfirmed: the
   aggregate response envelope and the `query_categories` record shape (both
   parsed tolerantly).
2. Whether the sandbox data contains any duplicate-payment findings. If not,
   Shot 2 uses the banked café take.
3. The backend on :8080 must be restarted with `SEAPOINT_ENABLED=1` and
   `SEAPOINT_MCP_URL`.

**Bring-up:**

```bash
export SEAPOINT_MCP_URL=<seapoint-staging URL>
python -m src.jobs.seapoint_login
SEAPOINT_ENABLED=1 python -m src.jobs.seapoint_smoke
SEAPOINT_ENABLED=1 python -m uvicorn src.api.main:app --port 8080
```

---

## The clock

| London | PT | Work | Done when |
|---|---|---|---|
| 18:10 | 11:10 | **Phase 0 — the gate.** Connect the Seapoint MCP. Run "What did we spend last month, broken down by category?". Capture the full tool list + one sample of each tool's output to a scratch file. | You can name the tools. You know which of the two wedges applies. |
| 18:30 | 11:30 | **Phase 1 — connector.** `src/services/connectors/seapoint.py`. Map the MCP tools onto the `AccountingConnector` methods below. | `get_organisation` + `list_invoices` + `list_contacts` return real sandbox data. |
| 19:10 | 12:10 | **Phase 2 — wire.** One entry in `_REGISTRY`. A demo session that resolves to `seapoint`. Provenance badge reads "sandbox". | `/books?flow=check` renders findings from Seapoint data. |
| 19:35 | 12:35 | **Phase 3 — rehearse.** Run the 4 shots end to end. Cut anything that takes longer than it should. | Four clean takes, each matching its shot budget. |
| 19:55 | 12:55 | Buffer. Close everything except the demo window. | — |
| **20:05** | **12:05** | **Start recording. Hard deadline.** | — |
| **20:20** | **12:20** | **Code freeze. Submit.** | Video uploaded. |

**The recording deadline is the real deadline.** A 20-minute overrun on Phase 1
costs more than the demo is worth. If the connector is not returning data by
19:10, take the fallback below.

## Phase 1 — the connector spec

Implement only the methods the demo touches. The ABC requires all of them, but
the un-implemented ones can return empty/None and log — the rest of the product
must not break.

| `AccountingConnector` method | Source (resolved) | Needed? |
|---|---|---|
| `get_organisation` | `get_current_user` (org block) | yes — name, country, base currency |
| `list_invoices` | `query_invoices` | **yes — the whole receivables story** |
| `list_contacts` | `query_transaction_participants` | yes — debtor names, emails, status |
| `list_payments` | `query_payments` | yes — true days-to-get-paid + duplicate-payment detection |
| `find_overdue_invoices` | derived from `list_invoices` | yes — derivable, no new call needed |
| `list_bank_transactions` | `query_transactions` | yes — AP Integrity inputs |
| `get_profit_and_loss` | `query_transactions` with `aggregate=category` | yes — server-side totals, no client sum |
| `list_accounts` | `query_accounting_accounts` | stub — available if the demo needs codes |
| `list_tax_rates` | `query_accounting_tax_rates` | stub |
| `get_balance_sheet`, `get_trial_balance`, `find_unreconciled_transactions`, `match_bank_to_invoice`, `create_manual_journal`, `disconnect`, `get_connection_status` | — | **stub** — journal writes stay disabled against Seapoint |

Write tools exposed but deliberately unused from the connector:
`set_transaction_category`, `set_transaction_coding`,
`set_transaction_vendor`, `update_vendor`, `approve_reconciliation`. They map
1:1 to the governed write-path story — if Shot 3 wants a real Seapoint write
behind the approval gate, `set_transaction_vendor` is the safest one to demo
(lowest blast radius, human-confirmable). Read them as resources first:
`seapoint://finance/methodology/*` defines their formulas — match their
numbers if the VO quotes burn/runway.

**Shapes.** `base.py` documents the normalized shapes; the docstring on
`list_payments` is explicit that AP Integrity depends on stable payment,
invoice and contact IDs. Preserve those — if the MCP's IDs are not stable,
map them to stable local IDs and say so in the method docstring rather than
letting duplicate detection silently misfire.

**`mode()`** must return something honest — `"seapoint-sandbox"` — and
`is_live()` must be `False`. The sandbox holds dummy data; the UI reads these
to disclose provenance.

**`create_manual_journal`** returns an error explaining that writes are not
supported on this platform. Do not implement a write path. Read-only against
the source is the safety story.

## Phase 2 — wiring (feeds Shots 1–3)

1. `src/services/connectors/registry.py` — Seapoint registers behind
   `SEAPOINT_ENABLED=1` (env-gated: off = platform invisible to the UI and
   sessions fall back to Xero; the connector code can stay dormant). For the
   demo session, insert a `platform_connections` row with `platform='seapoint'`
   via `record_platform_connection` — no new plumbing needed.
2. Session resolution: `get_active_platform()` reads `platform_connections` for
   the session. Insert the demo session's row (or add a temporary
   `SEAPOINT_DEMO_SESSION_ID` escape hatch) so the demo session resolves to
   Seapoint. **Do not change `_DEFAULT_PLATFORM`** — Xero stays the default for
   every other visitor.
3. Surface `mode()` where the app already reports provenance. Under the
   connector path label it **"Seapoint sandbox — dummy data"**; under the
   fallback let `ModeBadge` say what the code says (**"Sample data"**). Pre-seed
   the thread so `/books?flow=check` opens with the **findings** (Shot 2) already
   rendered — but leave the **question** unasked so Shot 1 runs live.
4. Re-skin, don't rebuild: Shot 2 = `FindingsPanel.tsx` + `CheckProofCard.tsx`
   using the existing `ap_duplicate_payment` / `ap_payment_anomaly` /
   `ap_supplier_detail_change` kinds — they already carry icon, label, gloss and
   the review affordance. A brand-new kind is three coordinated edits (backend
   constants, the `FindingKind` union, `FINDING_KIND_META`) and `tsc` plus
   `tests/test_finding_kinds.py` fail until all three agree, so don't invent one
   at 19:20. **No Shot 4:** `/impact` is cut (Phase 3) — do not relabel
   `OverdueTrendChart.tsx`; end on `/activity` instead.

## Phase 3 — the demo script (3 shots + end card, 120s)

Work back from pausable shots. One line: *"We asked what we spent last month.
The agent explained it, flagged every leak with its source records, and nothing
moved until I approved it."*

**Shot 1 must be live.** Judges score *agent autonomy*; a pre-seeded answer
shows none of it. `ToolCallTrace` actually running is the most watchable 15
seconds in the video. Everything else may be pre-seeded.

| Shot | Time | Screen | What is on camera | VO (≤12 words a beat) |
|---|---|---|---|---|
| **1. The question, live** | 0:00–0:45 | `/books?flow=check` | The brief's own prompt — *"What did we spend last month, broken down by category?"* — lands in the chat and **the agent really runs it**: `ToolCallTrace` names the tools → answer renders → horizontal category bars (`BenchmarkCompareBar` pattern, never a pie) with MoM badges. Open on their prompt, not on a vignette: every judge wrote that line down at kickoff. | "Sandbox data, read-only connector. Their kickoff question — live." *then shut up and let it run* |
| **2. The leaks** | 0:45–1:25 | `FindingsPanel` + `CheckProofCard` | Scroll to findings, **click exactly one card** so the two source records sit side by side. Rose = duplicate sub, amber = vendor spike against its own typical, sky = spend with no owner. Say the real number **here**, over the evidence — not at the open. `WhileAgentWorks` ~3s, then `ProactiveAlert`. | "There's no code review for payments. So every finding shows its evidence — a risk requiring review, never an accusation." |
| **3. The decision** | 1:25–1:50 | Zana handoff → review → `/activity` | Mascot swap to `ZanaMascot` (**say "Zana" once, here, and only here**). Zana drafts the supplier query (`NegotiationEmailCard`, a draft, not sent). Then **the one click: Confirm** on the duplicate finding → `SuccessCheck` + "Logged to audit trail" → follow the link to `/activity`. **No journal approve**: the connector is read-only, so a journal card would say "not posted". The review decision *is* the approval. | "Zana drafts the query. I confirm the duplicate. Nothing touched Seapoint." |
| **End card** | 1:50–2:00 | freeze on `/activity` | Hold the `finding_reviewed` row (*"Confirmed: Possible duplicate payment — {supplier} £{amount}"*). It is the thumbnail *and* the oversight proof. No chart, no `/impact`, no ROI claim. | "The payment run, with a control layer in front of it." |

**Why the decision beats a write.** A read-only connector that refuses to
write, while a human records a decision against evidence, shows restraint *and*
oversight. An approved journal against a sandbox would show neither, and
Seapoint's own write tools (`set_transaction_*`) stay out of tonight's demo.

**Why `/impact` is gone.** That chart plots overdue exposure, so relabelling it
"preventable spend" would be a lie on camera, and `Money Recovered` reads £0
until a chase actually completes. A chart that doesn't match its caption is the
weakest possible freeze frame; the audit trail is the strongest.

### Recording + submission protocol (this is what kills entries)

20:05 → 20:20 is **15 minutes** to record, stop, encode, upload and fill a form.
That is not enough time. So:

- **Capture Shot 1 as its own take by 19:35 and keep it.** It is the only shot
  with an unknown — is the model path fast enough on camera? Convert that
  unknown while there is slack. If it errors you still have 30 minutes.
- **Record with Loom, not QuickTime** — Loom streams to cloud *during* capture,
  so the upload is effectively finished when you stop.
- Export **1080p**. Label legibility comes from 125% browser zoom in a 1440px
  window, not from capture resolution.
- **Assemble before 20:05.** Rehearsal takes of the same app state are valid
  footage — 20:05 is when the *final* capture happens, not when assembly starts.
- Default to **one continuous take, VO read live, no stitching**. Stitch only if
  time survives.
- Start the upload, then complete the submission form while it processes. Do not
  watch the progress bar.
- **Say "sandbox data" in the first 20 seconds and show it on screen.**
  Under the connector the badge reads **"Seapoint sandbox · read-only"**,
  driven by the connector's `mode()` rather than set for the camera. Under the
  fallback it reads **"Sample data"**.
- One interaction only on camera: the Confirm click. Everything else is scroll.
  If something breaks, narrate it as the agent being careful and move on. Never
  debug live.
- Do not tour the app. One workflow, end to end, no implementation talk — judges
  score the product, not the diff.

## Fallback path (decide by 19:10)

**If the MCP connection fails or is too slow:** demo the live app at
`sikizana.persidian.com` against the seeded demo books — Shots 2–4 already
play there (findings → Approve → impact chart). Show the connector diff on
screen as the integration built today and say plainly the sandbox connection
did not complete. Weaker, still shippable.

**If the MCP exposes only aggregates:** Shot 1 carries the demo —
spend-by-category bars + burn/runway in the same findings UI. Shots 3–4
unchanged. Do not attempt to fake invoice-level data.

**If Phase 1 is not returning data by 19:35:** stop building. Rehearse the
fallback demo. A rehearsed fallback beats an unrehearsed success.

## Submission checklist

- [ ] Team registered (the form — one per person, solo is fine)
- [ ] Seapoint account created; MCP connected
- [ ] Claude credits claimed (`platform.claude.com` account first)
- [ ] Code frozen before **20:20 London**
- [ ] Two-minute video recorded (start by **20:05**) and uploaded
- [ ] Video shows: question → agent tool calls → finding → human approval
- [ ] "Sandbox data" disclosed on screen or in voice
- [ ] No customer, savings, or ROI claims anywhere in the submission
- [ ] Nothing in this namespace claims to be shipped

## Judging, mapped to the demo

| Criterion | Where the demo earns it |
|---|---|
| Technical execution | A real connector against a real MCP, using the platform abstraction the product already has |
| Product thinking | One complete finance workflow, not a feature tour |
| Agent autonomy | The agent picks the tools and produces the finding unprompted |
| UX clarity | The shipped findings UI — one job per view, no new surface |
| Real-world applicability | UK SME books: receivables, statutory interest, HMRC citations, duplicate bills |
| Safety and oversight | Read-only against the source, approval gate in front of every consequential action, evidence attached to every finding, audit trail |

## Pain, sourced (for the VO — pick two numbers, max)

London-weighted, because the demo enters through UK books.

| Claim | Number | Source | Safe to say? |
|---|---|---|---|
| Scale of the receivable leak | **£26bn owed to UK businesses in late payments at any one time**; ~1.5m businesses (28% of all UK businesses) affected each year | Dept for Business & Trade + Office of the Small Business Commissioner, 31 Jul 2025 | **Yes — government source. Use this one.** |
| Personal to the ICP | **62% of UK small businesses were chasing unpaid invoices, average £21.4k owed** | Intuit QuickBooks UK Small Business Late Payments Report 2025 | Yes — named, recent |
| How universal | **90% of UK companies experienced late payment; average delay 32 days** | Coface 2025 UK Payment Survey | Yes |
| The AP error rate | **1.6% error rate per invoice under manual data entry**; ~$53 to correct one error; $12.88–19.83 to process an invoice manually | Sterling Commerce study (widely cited); Parseur/Resolve compilations | Say "about 1 in 60 invoices touched by hand has an error" — don't quote the 39% figure, it's a secondary compilation |
| Duplicates are a control gap, not a crime | *"It usually isn't fraud. It's a control gap, and it's more common than most finance teams want to admit."* | Corpay | **Quote this verbatim — it is our positioning from a third party** |
| Duplicate/erroneous spend | ~0.1–0.8% of invoices paid twice; "5% of AP spend" on duplicates + errors | Peakflo / vendor content marketing | **Weak — content marketing. Use only as "industry estimates put it in the low single digits."** |
| Supplier-detail change = the real money | **BEC: $3.05bn reported losses on 24,768 complaints (FBI IC3 2025); ~86% of losses left by wire transfer** | FBI IC3 Annual Report 2025 | Yes — and it's exactly what `ap_supplier_detail_change` catches |
| Ownerless spend | **~30% of SaaS budget wasted on unused licences / duplicate tools** | Gartner, cited by Block 64 | Yes, attributed |
| Reconciliation is still spreadsheets | **58% of mid-sized finance teams reconcile partly in spreadsheets, losing ~15 hours a month** | IFOM 2023 survey | Yes |

### The line that lands in *this* room

Founders and investors, so name the gap they personally live in:

> "You don't hire a controller until 30–50 people — and the first one gets hired
> when the close slips past a week. But you're paying vendors from week one. So
> for the first five years of the company, the payment run is the only money
> workflow with nobody reviewing it."

(First-hire timing: multiple 2026 startup-finance guides converge on 30–50
employees / close >1 week. Close benchmarks: 5–10 business days for $2–20M
revenue companies.)

### Recommended VO numbers, if you only get two

1. **£26 billion** — the size of the hole (Shot 2, over the findings).
2. **"About 1 in 60"** — the error rate on hand-keyed invoices (Shot 2 or end card).

Do not stack three stats in a 120-second video. One number, felt, beats three
recited.

## VO locked to the pixels — re-verified 19:30 on the RESTARTED server

The first rehearsal ran against a stale `uvicorn` (started before the connector
and tool work landed) and so picked `get_profit_and_loss` over a 90-day window.
After `--reload` the same question picks the right tool. **Always rehearse
against the reloaded server.**

Live run, 9 seconds, session `demo`, `provenance: "sample"`:

```
[TOOL]   get_spend_by_category | "Breaking down spend by category" | {}
[RESULT] Spend by category (2026-09-01 to 2026-09-30) — total £21,155.00
```

| On screen (real) | Say |
|---|---|
| Tool chip **"Breaking down spend by category"** — I did not name that tool | "I didn't tell it which report to pull." |
| Rent £7,500 (35%) · COGS £7,200 (34%) · Wages £4,800 (23%) · Utilities £1,120 · Marketing £450 · Bank fees £85 · **total £21,155** | "Twenty-one thousand pounds, September, broken down in nine seconds." |
| Period label **2026-09-01 → 2026-09-30** | **"last month" is now correct** — the spend tool defaults to the previous calendar month. Keep the brief's wording verbatim. |
| `ap_duplicate_payment` — **"Possible duplicate payment: Bean There Coffee Roasters" £680**, evidence `2026-09-26 · £680.00 · BACS-COFFEE-4521` vs `2026-09-27 · £680.00 · BACS-COFFEE-4521` | "Same vendor, same amount, same reference, twenty-four hours apart. It says *possible* — and shows you both." |
| `unreconciled` — "STANDING ORDER REF 8892" £1,200 | "Twelve hundred a month to something that matches nothing." |
| `overdue_invoice` — INV-0001 Catering Co Ltd £1,250 · outstanding £4,225.50 | "Then it works the other way, on the money coming in." |

### Press Confirm, not Approve

`JournalEntryCard` under demo mode returns *"Journal entry SIMULATED (demo mode
— nothing was written to Xero)"* plus a connect-your-Xero nudge
(`accounting_tools.py:556`) — a live on-camera contradiction of the safety
story. **The one human action on camera is Confirm on the Bean There £680
finding** (`FindingsPanel.tsx:537`), which writes a `finding_reviewed` row
(`xero.py:124`) and lands on `/activity` as *"Confirmed: Possible duplicate
payment — Bean There Coffee Roasters £680"*. Hold on the button for a beat
before clicking — "nothing has happened yet" is the point.

### Seapoint: attempted, not connected

The connector is real (`src/services/connectors/seapoint.py`, `_TOOL_MAP`
populated from the sandbox's `list_tools`, contract tests in
`tests/test_seapoint_connector.py`) and registers only under
`SEAPOINT_ENABLED=1`. Live MCP was reached at `https://mcp.seapoint.dev/mcp`
(streamable HTTP; the connector only speaks SSE today) and the server returned
an MCP error on request — no credentials are stored for it locally, so it needs
an auth header the client does not send. **Stopped at 19:30 per the time-box.**

So the film is café sample books, and the VO must say **"sample books"**, never
"Seapoint data" — `provenance` is literally `"sample"`. One honest sentence at
the end scores better than a bluff: *"we wired the Seapoint connector against
their MCP; the sandbox wouldn't authenticate inside our window, so this runs our
own sample books through the same findings pipeline."*

### Story spine (locked)

1. **Card 0** — the two identical BACS lines. "One of these was paid twice."
2. Refrain: *"There's no code review for payments."*
3. The Daily Grind Ltd — real org name in the demo books — asked the brief's
   question live, 9 seconds, timer left in.
4. Findings → the mystery resolved on evidence, with *possible* intact.
5. **Card B** handoff → Confirm → `/activity`.
6. **Card C** — £1,930 found (680 + 1,250), "found, flagged, awaiting a human".
   Never "saved" — `recovered.total` is genuinely £0.
7. Close on a person: *"Tonight the reviewer is a founder at eleven on a
   Tuesday."* Refrain back: *"There's no code review for payments."*

## Inference path (fixed tonight — keep this)

`meta/llama-3.1-70b-instruct` was retired on NVIDIA NIM (HTTP 410, EOL
2026-08-26), and `jiter` was an x86_64 wheel on an arm64 machine, so the OpenAI
SDK import failed and **every** provider died. Fixes: arm64 `jiter` reinstall;
`_NVIDIA_BASE_URL` now reads `NVIDIA_BASE_URL` from env (`bookkeeper.py:35`);
`.env` points the agent at the Vercel AI Gateway with `zai/glm-5.2` (verified
function-calling) and `alibaba/qwen3-next-80b-a3b-instruct` as fallback.
Live run: tool call + streamed answer in **9 seconds**.
