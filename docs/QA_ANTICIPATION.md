# Sikizana — Judge Q&A Anticipation Sheet

## Questions we expect and calm answers

### Q: "How is this different from Xero's built-in reconciliation?"

**A:** Xero's reconciliation tool is manual — you have to know what you're
doing, match transactions one by one, and understand which account to
code things to. Sikizana does the analysis for you. The agent
reads your books, identifies what's unreconciled, explains WHY it's a
problem, and proposes the correct journal entry with the right account
codes. It's the difference between giving someone a spreadsheet and
giving them an accountant.

---

### Q: "Why NVIDIA NIM instead of OpenAI or Gemini?"

**A:** Three reasons. First, cost — NVIDIA NIM gives us enterprise-grade
Llama 3.3 70B at a fraction of the cost per token. Second, openness —
Llama is open-weight, so if we need to self-host for data sovereignty
(important for financial data), we can. Third, the OpenAI-compatible API
means we can swap models without changing our code. We also have Venice
AI as an automatic fallback — if NVIDIA goes down, the agent switches
to Venice's Llama 3.3 70B without the user noticing. The agent loop is
model-agnostic.

---

### Q: "How do you handle errors? What if the agent proposes a wrong journal entry?"

**A:** Human-in-the-loop by design. The agent never posts anything
without explicit approval. Every journal entry is presented as a
proposal with the debit, credit, amount, and description clearly shown.
The user clicks "approve" or tells the agent what to change. We'd rather
have a cautious agent than a confident one that posts wrong entries.

---

### Q: "You mentioned webhooks. How exactly do they work in your app?"

**A:** We have a `/api/xero/webhook` endpoint that receives Xero's
webhook notifications. When a new bank transaction or invoice is created
in Xero, Xero pushes an event to us. We store it and the frontend polls
for proactive alerts. This means Sarah gets a notification — "You have
a new unreconciled transaction" — without ever opening the app. It's
push, not pull. 40% less repetitive API calls.

---

### Q: "What Xero APIs are you actually using?"

**A:** We use the Xero CLI which wraps the Accounting API. Specifically:
- Bank transactions (list, filter by reconciliation status)
- Invoices (list, filter by status, overdue detection)
- Chart of accounts (for journal entry account codes)
- Reports: Profit & Loss, Balance Sheet, Trial Balance
- Contacts (customers and suppliers)
- Organisation details
- Webhooks for real-time event notifications

---

### Q: "Is this production-ready? What's the gap between this demo and a real product?"

**A:** The core agent loop, Xero integration, and tool calling are all
production code running against live Xero data. The gaps for a real
launch are: multi-tenant OAuth (currently single-tenant via CLI),
posting journal entries back to Xero (currently proposes only), and
the security assessment required for Xero App Store certification.
The architecture is sound — it's a matter of hardening, not rebuilding.

---

### Q: "How do you make money?"

**A:** Freemium. Free tier: audit + plain-English explanations. Premium
tier (£15-25/month): auto-fix (agent posts journal entries after
approval), receipt inbox (WhatsApp/email forwarding), and tax readiness
(VAT returns, year-end prep). This undercuts traditional bookkeeping
services (£50-100/month) by 60-70%.

---

### Q: "How did you come up with this idea?"

**A:** We looked at productideas.xero.com and found the #1 requested
feature was "AI that actually reconciles for you." Then we looked at
the data: 4.4 million Xero subscribers, most without an accountant,
losing money to uncollected invoices and missing tax deductions. The
agent architecture — gather evidence, analyse, propose a fix, await
approval — is the natural fit. Same reasoning loop an accountant uses,
but in seconds instead of days, and at a fraction of the cost.

---

### Q: "What about data security and privacy?"

**A:** The agent reads Xero data via the CLI with OAuth2 PKCE — no
credentials stored on our side. Conversations are held in memory and
not persisted to disk. For production, we'd add: encrypted session
storage, per-tenant data isolation, and the Xero security assessment.
Financial data never leaves the Xero ecosystem — we read it on demand,
process it, and return plain English.

---

### Q: "Can this scale to thousands of users?"

**A:** The architecture is stateless per request — the agent loop is
a single async function call, tools are subprocess calls to the Xero
CLI, and conversation state is in-memory. For scale, we'd move session
state to Redis and run the FastAPI backend behind a load balancer. The
NVIDIA NIM API handles the LLM inference at scale. The bottleneck would
be Xero API rate limits, which webhooks help mitigate by reducing
polling.

---

### Q: "What's the most impressive technical thing you did?"

**A:** Two things. First, the report parser — Xero's CLI returns
reports in a deeply nested rows/cells format that's hard to reason
over. We wrote a recursive parser that extracts the key totals (Total
Income, Net Profit, Total Assets, etc.) into a flat structure the agent
can understand. Second, the proactive audit pattern — the agent runs
automatically on page load, so the user sees value before they type a
single word. That's the difference between a chatbot and an agent.

---

### Q: "Why should this be certified for the Xero App Store?"

**A:** We solve a real problem for the 4.4 million subscribers who
can't afford a bookkeeper. We use the Xero CLI, webhooks, and 12 API
endpoints — deep platform integration, not a surface-level wrapper.
And the human-in-the-loop design means we're safe by default — we
propose, the human approves. We're ready to start the certification
process today.

---

### Q: "What are Exa and Firecrawl doing in your stack?"

**A:** They power the 'While Siki Works' panel. When the agent is
running tools (30-60 seconds), instead of showing a blank spinner,
we fetch live HMRC guidance from gov.uk. Exa's instant search finds
the right page in ~250ms, Firecrawl scrapes it for clean markdown in
~2-5s, and we extract the most relevant paragraph. The user sees the
actual HMRC guidance text inline — not just a link. It's cached for
5 minutes so repeat queries don't hit the APIs again. If neither key
is configured, curated fallback content is shown instead.

---

### Q: "The agent takes 30-60 seconds to respond. Isn't that too slow?"

**A:** Two answers. First, we use Llama 3.3 70B — a large model that's
slow to cold-start but produces much better tool-calling and reasoning
than smaller models. We tried 8B and it looped on tool calls and
produced garbage. Second, we turned the wait into a feature: the
'While Siki Works' panel shows rotating educational tips, personalized
insights from the user's findings, and live HMRC guidance. Users learn
while they wait. The wait time is value delivery time, not dead time.

---

### Q: "How do the Siki/Zana nudges work?"

**A:** After Siki finishes a response, we scan the text for three
patterns: overdue invoices, tax/deduction mentions, and savings/expenses.
If any match, a contextual chip appears at the bottom of the message:
'Zana can draft the chasing email for this →' or 'Zana can check if
you're overpaying tax →'. Clicking it switches to Zana. It only shows
on the last agent message, only in Siki mode, and only when not
streaming — so it never interrupts the flow.

---

### Q: "How does the conversion funnel work?"

**A:** Three contextual touchpoints. After the first real answer, a
violet banner suggests signing in to save progress. At 3 out of 5 free
queries, another nudge suggests signing in for more. At 5/5, the
existing upgrade banner links to the pricing page. The sign-in nudge
uses sessionStorage so it shows once per browser session. The key
design principle: sign-in is the lighter ask, upgrade is the heavier
ask. We nudge the lighter one first.

---

### Q: "Have you considered TinyFish for browser automation?"

**A:** We evaluated TinyFish's four APIs. Their Search and Fetch overlap
with Exa and Firecrawl (which we already use), so there's no reason to
switch. Their Agent API is the genuinely novel capability — natural-
language goals to automate workflows on real websites. For a finance
product, automating browser workflows on Xero or HMRC is risky but
interesting: it could navigate filing forms, pre-fill fields, or
automate reconciliation UI flows. That's on the roadmap with human-in-
the-loop safeguards. We wouldn't let an agent autonomously submit tax
filings — but it could navigate to the right form and pre-fill it for
review.

---

## If they ask something we didn't anticipate:

- **Stay calm** — take a breath, think for 2 seconds
- **Be honest** — "I don't know, but here's how I'd approach that" beats a fake answer
- **Bridge back to strengths** — "What I can tell you is..." → lead to our differentiators
- **Don't oversell** — if something isn't built yet, say "that's on the roadmap"
