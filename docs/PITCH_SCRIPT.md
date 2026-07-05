# Sikizana — 3-Minute Pitch Script
# Xero App & Agent Hackathon, London, 5 July 2026

**Live URL: https://sikizana.persidian.com**

## TIMING: 0:00–0:30 — THE HOOK (Problem + Opportunity)

[Slide 1: Title card — "Sikizana — Your AI Finance Assistant" with Siki the Owl]

"Meet Rishi. He runs a growing retail business in London. He's
expanding — new products, new customers — but he's got a problem.

He's owed £270 in overdue invoices and doesn't know it. He has 9
unreconciled bank transactions sitting in Xero. And when tax season
comes, he'll pay an accountant £200 to clean up months of mess — or
he'll file wrong and pay HMRC penalties.

Rishi is one of Xero's 4.4 million small business subscribers. Most of
them are not accountants. They log transactions but never reconcile.
They don't check for overdue invoices. And they definitely don't
understand their P&L.

The bookkeeping gap isn't a knowledge problem. It's a time and cost
problem. They know they should reconcile. They just can't afford £100
a month for a bookkeeper — and they don't have time to dig through
Xero's reports.

So we built one they can. Meet Siki — your AI finance assistant."

---

## TIMING: 0:30–1:40 — THE DEMO (70 seconds — the biggest chunk)

[Slide 2: Screenshot of /books page with Siki mascot and proactive audit]

"This is Sikizana. The moment Rishi opens the app, Siki runs
an audit — no prompting needed."

[LIVE DEMO: Open https://sikizana.persidian.com/books]

"See that owl in the nav? That's Siki. And see those health check
cards? Siki already found 9 unreconciled transactions and 1 overdue
invoice — £270.63 outstanding. An accountant would charge £200 and
take 3 days. Siki did it in 4 seconds."

[Click "Who owes me money?" sample query]

"Watch the tool call trace — you can see exactly which Xero tools Siki
is calling in real-time. Full transparency, no black box. The agent
pulls live invoices, checks due dates, and responds in plain English:
'You're owed £270.63 from 1 overdue invoice. Here's who hasn't paid
and how long it's been overdue.'"

[Wait for agent response]

"Now watch this — I ask about tax:"

[Click "How much tax will I owe?" sample query]

"Siki analyses the P&L, estimates UK Corporation Tax — £927.79 at the
19% small profits rate — flags non-deductible expenses, and identifies
deductions Rishi might be missing. This is the Cleo pattern: deterministic
financial logic plus plain-English explanation. An accountant would
charge £500 for this. Siki does it in seconds."

[Wait for agent response]

"And when Siki finds a discrepancy, it doesn't just tell you — it
proposes a fix. A journal entry with the right account codes, ready
to approve. Rishi says 'approve' and Siki posts it directly to Xero.
Human-in-the-loop. Siki proposes, Rishi approves, Siki writes back."

[Click "What needs fixing?" → wait for proposal → type "approve"]

"Human-in-the-loop by design. Safe by design."

---

## TIMING: 1:40–2:30 — THE TECH (50 seconds)

[Slide 3: Architecture diagram — simple, bold]

"Under the hood: the agent runs on Llama 3.1 via NVIDIA NIM, with
OpenAI-compatible function calling. It has 12 tools — each one calls
the Xero CLI to pull live data. And it streams every tool call to the
frontend via Server-Sent Events, so users see the agent thinking in
real-time."

[Slide 4: Xero integration highlights]

"We use the Xero CLI for OAuth2 PKCE authentication and full API
access — bank transactions, invoices, chart of accounts, P&L,
balance sheet, trial balance, contacts. And we've built a full OAuth
flow so users can connect their own Xero org — not just demo data.

We also use Xero webhooks. Instead of polling Xero every 5 minutes
asking 'anything new?', Xero tells US the moment a transaction lands.
Siki proactively alerts Rishi — 'Hey, you have a new unreconciled
transaction' — before he even opens the app.

That's 40% less repetitive API calls. Better for Xero's servers,
better for Rishi."

[Slide 5: Receipt matching + mascot]

"And it's multimodal. Rishi snaps a photo of a receipt, Siki reads it
with vision AI, extracts the supplier and amount, and matches it to a
Xero bank transaction. The bridge between physical and digital
bookkeeping.

By the way — Siki the Owl is built entirely from SVG rectangles. No
images, no GIFs. Pure code, five animated moods, about 5 kilobytes."

---

## TIMING: 2:30–3:00 — THE FUTURE (30 seconds)

[Slide 6: Roadmap — 4 bold bullets]

"This is just the beginning. Next:

1. Xero App Store listing — reach all 4.4 million subscribers
2. Stripe billing — freemium model, £29/mo Pro tier
3. Receipt inbox — WhatsApp a photo, it reconciles automatically
4. VAT returns — filed directly to HMRC from clean data"

[Slide 7: Closing — "Sikizana — AI finance for the 4.4 million who can't afford an accountant"]

"The whole thing is live right now at sikizana.persidian.com —
frontend, backend, and real Xero data, all on a single VPS.

Sikizana finds money you're owed, explains your numbers, and
fixes your books. Thank you."

---

## PITCH NOTES

- **Total time: ~2:50** — leaves 10 seconds buffer
- **Practice with a timer** — the most common way to lose is running long
- **Live URL**: https://sikizana.persidian.com/books — have it open in a tab
- **If live demo fails**: refresh the page, or use a backup tab
- **Energy**: stand tall, speak with authority, let enthusiasm show
- **Don't bury them in jargon**: "function calling" is fine, "OpenAI-compatible
  API orchestration loop" is not
- **Lead with the demo feature**: the proactive audit notification is the
  "wow" moment — make sure it lands
- **Three demo moments**: overdue invoices (cash flow), tax insights (Cleo
  pattern), journal entry write-back (human-in-the-loop)
- **Mention Siki**: the mascot is memorable — "built from SVG rectangles,
  no images" is a good sound bite
- **Mention streaming transparency**: "you can see the agent thinking"
  is another good sound bite
- **Mention write-back**: "Siki proposes, you approve, Siki posts to Xero"
  — this is what makes it a real app, not just a dashboard

## SLIDE DESIGN RULES (from Annie Terry)

- Body text: 30pt minimum
- Headings: 60pt minimum
- High contrast: light text on dark background (or reverse)
- One major idea per slide
- Use icons, screenshots, simple charts — not dense paragraphs
- Slides are scenery, not the script

## ANTICIPATED QUESTIONS

- **"How do you handle errors?"** — Human-in-the-loop. Siki proposes, user
  approves. We never auto-post without explicit approval.
- **"What about data security?"** — OAuth2, tokens stored encrypted, no
  data retained beyond the session.
- **"How is this different from Xero's built-in reports?"** — Xero shows
  you the data. Siki explains it in plain English, finds problems
  proactively, and fixes them. Reports don't chase overdue invoices.
- **"What's the business model?"** — Freemium: free audit, £29/mo for
  unlimited queries + journal entry write-back + tax insights.
- **"Why not just use an accountant?"** — £200+ per cleanup, 3-day
  turnaround. Siki is £29/mo, 4-second turnaround.
