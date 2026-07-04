# Sikizana Books — 3-Minute Pitch Script
# Xero App & Agent Hackathon, London, 5 July 2026

## TIMING: 0:00–0:30 — THE HOOK (Problem + Opportunity)

[Slide 1: Title card — "Sikizana Books — Your AI Bookkeeper"]

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

So we built one they can."

---

## TIMING: 0:30–1:40 — THE DEMO (70 seconds — the biggest chunk)

[Slide 2: Screenshot of /books page with proactive audit notification]

"This is Sikizana Books. The moment Sarah opens the app, the agent
runs an audit — no prompting needed."

[LIVE DEMO or VIDEO: Open /books page]

"See that notification? The agent already found 9 unreconciled
transactions and 1 overdue invoice. £270 outstanding."

[Type in chat: "Check my books and tell me what's wrong"]

"The agent calls the Xero CLI to pull live data — bank transactions,
invoices, the trial balance. It cross-references everything and
responds in plain English."

[Wait for agent response]

"Now watch this — I ask for my P&L:"

[Type: "What's my net profit this month?"]

"The agent pulls the Profit & Loss report from Xero, reads the
numbers, and explains them. Revenue £5,039. Expenses £157. Net profit
£4,883. Not just numbers — context."

[Wait for agent response]

"And when the agent finds a discrepancy, it doesn't just tell you —
it proposes a fix. A journal entry with the right account codes,
ready to approve. One click."

[Point to journal entry proposal if visible, or mention it]

"Human-in-the-loop. The agent proposes, Sarah approves. Safe by
design."

---

## TIMING: 1:40–2:30 — THE TECH (50 seconds)

[Slide 3: Architecture diagram — simple, bold]

"Under the hood: the agent runs on Llama 3.3 70B via NVIDIA NIM, with
OpenAI-compatible function calling. It has 10 tools — each one calls
the Xero CLI to pull live data."

[Slide 4: Xero integration highlights]

"We use the Xero CLI for OAuth2 PKCE authentication and full API
access — bank transactions, invoices, chart of accounts, P&L,
balance sheet, trial balance, contacts.

But here's the clever part: we also use Xero webhooks. Instead of
polling Xero every 5 minutes asking 'anything new?', Xero tells US
the moment a transaction lands. The agent proactively alerts Sarah —
'Hey, you have a new unreconciled transaction' — before she even
opens the app.

That's 40% less repetitive API calls. Better for Xero's servers,
better for Sarah."

[Slide 5: Receipt matching]

"And it's multimodal. Sarah snaps a photo of a receipt, the agent
reads it with vision AI, extracts the supplier and amount, and
matches it to a Xero bank transaction. The bridge between physical
and digital bookkeeping."

---

## TIMING: 2:30–3:00 — THE FUTURE (30 seconds)

[Slide 6: Roadmap — 4 bold bullets]

"This is just the beginning. Next:

1. Xero App Store listing — reach all 4.4 million subscribers
2. Premium tier — free audit, paid auto-fix
3. Receipt inbox — WhatsApp a photo, it reconciles automatically
4. Tax readiness — VAT returns and year-end prep from clean data"

[Slide 7: Closing — "Sikizana Books — AI bookkeeping for the 4.4 million who can't afford one"]

"We built this by repurposing an agent architecture from our Kenyan
chama arbitration platform — same reasoning loop, harder domain. The
problem is identical: nobody reconciles, and when it piles up, nobody
can afford to fix it.

Sikizana Books fixes that. Thank you."

---

## PITCH NOTES

- **Total time: ~2:50** — leaves 10 seconds buffer
- **Practice with a timer** — the most common way to lose is running long
- **If live demo fails**: have the backup video ready (see DEMO_VIDEO.md)
- **Energy**: stand tall, speak with authority, let enthusiasm show
- **Don't bury them in jargon**: "function calling" is fine, "OpenAI-compatible
  API orchestration loop" is not
- **Lead with the demo feature**: the proactive audit notification is the
  "wow" moment — make sure it lands

## SLIDE DESIGN RULES (from Annie Terry)

- Body text: 30pt minimum
- Headings: 60pt minimum
- High contrast: light text on dark background (or reverse)
- One major idea per slide
- Use icons, screenshots, simple charts — not dense paragraphs
- Slides are scenery, not the script
