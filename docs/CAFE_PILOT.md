# Matcha Mochi, City Road — a café design partner

> **Graduated.** The café Monday Briefing has been reconciled into the
> canonical `build_findings()` pipeline — café nudges are now `CafeFinding`
> objects with evidence + a one-click chat action, composed alongside
> receivables, AP integrity, and tax flags. Spend facts flow through the
> accounting connector (not `demo_scenarios` directly), benchmarks live in
> one place (`cafe_brief/config.py`), and human review state persists in
> `cafe_finding_reviews` (migration 14). The `/cafe` page keeps its richer
> briefing UX as a view over the same facts. See `src/services/cafe_brief/`
> and `AGENTS.md` for the architecture.

On a Monday morning, the owner of Matcha Mochi at The Brew on City Road opened the Square Item Sales export and watched a briefing assemble in real time. In minutes, data that usually languishes in rows and columns became actionable nudges: what sold, what margin drift looked like, and where a price discrepancy cried out for attention. The moment underscored a simple truth we chase: humans in the loop, numbers driven by code, and prose and research owned by agents.

## How it works

The workflow starts with deterministic analysis. A Square Item Sales export is ingested by a small, tight code path that normalizes SKUs, computes revenue per item, unit volume, average transaction value, and week-over-week deltas. Every calculation is deterministic and auditable; no arithmetic is left to guesswork or improvisation. The output is a structured briefing that a café operator can skim and verify, not a spreadsheet that requires a cryptic decoder ring.

From there, an agent named Manus takes over. Manus verifies the figures against raw till data to confirm consistency, researches cited market prices for ingredients and packaging, and drafts supplier emails with concrete price asks and quantities. Manus also generates a week-in-review video that distills the briefing into a short, narrated visual summary, and updates a published poster site where the briefing is shared as a one-page, printable artefact. The aim is not to replace human judgment but to present confident, research-backed nudges that a owner can evaluate quickly.

The final layer is the human in the loop. The café owner reviews the nudges, checks the source data, and approves or edits communications before anything leaves the system. In the hackathon, the owner validated the oat-milk price nudge and the supplier email live, confirming that the proposed actions reflected current conditions. The design keeps a clear boundary: the code owns the numbers; the agent owns the prose and the research; the human validates and acts.

Everything in the pipeline is replayable. The inputs, calculations, and decisions are versioned, and the sequence can be re-run with the next week’s data to produce a fresh briefing with the same level of auditable confidence. The artifacts—JSON payloads, the video, and the poster—are all derivable from the same deterministic core and the same agent prompts, ensuring that outputs are reproducible for future audits or retroactive analyses.

## What’s different here

The project treats a café's data workflow as a design surface rather than a reporting dashboard. The boundary is clear: code handles the certainty of numbers; agents handle the nuance of market context and the craft of written and visual communication; humans handle judgment, tone, and final approvals. This separation speeds action without compromising trust, and it makes the process auditable from data to dispatch.

The emphasis on replayability matters for a business that runs week-to-week operations under tight margins. If market prices shift or a supplier cost changes, the same pipeline can be re-run against the new inputs, producing updated nudges and communications without rebuilding models or re-architecting the flow.

## What next

The immediate priority is POS-first onboarding for the hospitality sector. The hackathon demonstrated the feasibility of integrating directly with a café’s point-of-sale system to generate the Monday Briefing with minimal friction. The upcoming work targets broader POS ecosystems, starting with Toast, Lightspeed, and Clover, to reduce setup time and expand adoption. The ideal onboarding flow is a plug-in experience: a café installs a connector, authorizes their POS, and receives the first Monday Briefing by Monday morning, with the option to tweak tone or content before any action is taken.

Beyond onboarding, the roadmap includes multi-site aggregation so operators can compare several locations, a daily price-alert feed for rapidly changing inputs, and a lightweight menu-engineering module that suggests price adjustments based on observed demand and elasticity signals. The poster site evolves into a live dashboard for managers and baristas alike, turning a weekly briefing into a transparent operating rhythm. Matcha Mochi remains a design partner, not a data warehouse: Sikizana’s job is to translate the realities of a café into a reliable, repeatable briefing that takes less time to read than it takes to brew a coffee.


References:

- Square, The Point of Sale Platform: https://squareup.com/us/en/product/square-online
- Toast POS: https://pos.toasttab.com/
- Lightspeed POS: https://www.lightspeedhq.com/
- Clover POS: https://www.clover.com/

(End of document)"},