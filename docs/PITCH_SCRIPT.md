# Sikizana Books — 3-Minute Pitch Script
# Xero App & Agent Hackathon, London, 5 July 2026

**Live URL: https://sikizana.persidian.com**

## TIMING: 0:00–0:30 — THE HOOK (Problem + Opportunity)

[Slide 1: Title card — "Sikizana Books — Your AI Bookkeeper" with Siki the Owl]

"Meet Sarah. She runs a café in Shoreditch. She does £5,000 in sales
this month, but she has 9 unreconciled bank transactions and an
overdue invoice she doesn't know about.

Sarah is one of Xero's 4.4 million small business subscribers. Most of
them are not accountants. They log transactions but never reconcile.
When tax season arrives, they pay an accountant £200 to clean up
months of mess — or they file wrong and pay penalties.

The bookkeeping gap isn't a knowledge problem. It's a cost problem.
They know they should reconcile. They just can't afford £100 a month
for a bookkeeper.

So we built one they can. Meet Siki — your AI bookkeeper."

---

## TIMING: 0:30–1:40 — THE DEMO (70 seconds — the biggest chunk)

[Slide 2: Screenshot of /books page with Siki mascot and proactive audit]

"This is Sikizana Books. The moment Sarah opens the app, Siki runs
an audit — no prompting needed."

[LIVE DEMO: Open https://sikizana.persidian.com/books]

"See that owl in the nav? That's Siki. And see that notification?
Siki already found 9 unreconciled transactions and 1 overdue invoice.
£270 outstanding. An accountant would charge £200 and take 3 days.
Siki did it in 4 seconds."

[Type in chat: "Check my books and tell me what's wrong"]

"Watch the tool call trace — you can see exactly which Xero tools Siki
is calling in real-time. Full transparency, no black box. The agent
pulls live bank transactions, invoices, the trial balance, cross-
references everything and responds in plain English."

[Wait for agent response]

"Now watch this — I ask for my P&L:"

[Type: "What's my net profit this month?"]

"Siki pulls the Profit & Loss report from Xero, reads the numbers,
and explains them. Revenue £5,039. Expenses £157. Net profit £4,883.
Not just numbers — context."

[Wait for agent response]

"And when Siki finds a discrepancy, it doesn't just tell you — it
proposes a fix. A journal entry with the right account codes, ready
to approve. One click. And when you approve, Siki celebrates."

[Point to journal entry proposal if visible, or mention it]

"Human-in-the-loop. Siki proposes, Sarah approves. Safe by design."

---

## TIMING: 1:40–2:30 — THE TECH (50 seconds)

[Slide 3: Architecture diagram — simple, bold]

"Under the hood: the agent runs on Llama 3.3 70B via NVIDIA NIM, with
OpenAI-compatible function calling. It has 10 tools — each one calls
the Xero CLI to pull live data. And it streams every tool call to the
frontend via Server-Sent Events, so users see the agent thinking in
real-time."

[Slide 4: Xero integration highlights]

"We use the Xero CLI for OAuth2 PKCE authentication and full API
access — bank transactions, invoices, chart of accounts, P&L,
balance sheet, trial balance, contacts.

But here's the clever part: we also use Xero webhooks. Instead of
polling Xero every 5 minutes asking 'anything new?', Xero tells US
the moment a transaction lands. Siki proactively alerts Sarah —
'Hey, you have a new unreconciled transaction' — before she even
opens the app.

That's 40% less repetitive API calls. Better for Xero's servers,
better for Sarah."

[Slide 5: Receipt matching + mascot]

"And it's multimodal. Sarah snaps a photo of a receipt, Siki reads it
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
2. Premium tier — free audit, paid auto-fix
3. Receipt inbox — WhatsApp a photo, it reconciles automatically
4. Tax readiness — VAT returns and year-end prep from clean data"

[Slide 7: Closing — "Sikizana Books — AI bookkeeping for the 4.4 million who can't afford one"]

"The whole thing is live right now at sikizana.persidian.com —
frontend, backend, and real Xero data, all on a single VPS.

Sikizana Books fixes the bookkeeping gap. Thank you."

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
- **Mention Siki**: the mascot is memorable — "built from SVG rectangles,
  no images" is a good sound bite
- **Mention streaming transparency**: "you can see the agent thinking"
  is another good sound bite

## SLIDE DESIGN RULES (from Annie Terry)

- Body text: 30pt minimum
- Headings: 60pt minimum
- High contrast: light text on dark background (or reverse)
- One major idea per slide
- Use icons, screenshots, simple charts — not dense paragraphs
- Slides are scenery, not the script
