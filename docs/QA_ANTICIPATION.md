# Sikizana Books — Judge Q&A Anticipation Sheet

## Questions we expect and calm answers

### Q: "How is this different from Xero's built-in reconciliation?"

**A:** Xero's reconciliation tool is manual — you have to know what you're
doing, match transactions one by one, and understand which account to
code things to. Sikizana Books does the analysis for you. The agent
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
means we can swap models without changing our code. The agent loop is
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

### Q: "You said you repurposed this from a Kenyan chama platform. What's the connection?"

**A:** Sikizana was originally an AI arbitrator for Kenyan savings
groups (chamas) — informal ROSCAs where members contribute money and
take turns receiving payouts. The core problem was identical: nobody
reconciles, discrepancies pile up, and nobody can afford to fix them.
The agent architecture — gather evidence, analyse, propose a fix, await
approval — was built and tested for that harder, multilingual, informal
domain. We pointed it at Xero because the reasoning loop transfers
perfectly. Same problem, bigger market.

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
can't afford a bookkeeper. We use the Xero CLI, webhooks, and 8 API
endpoints — deep platform integration, not a surface-level wrapper.
The agent architecture is proven (battle-tested in Kenya). And the
human-in-the-loop design means we're safe by default — we propose, the
human approves. We're ready to start the certification process today.

---

## If they ask something we didn't anticipate:

- **Stay calm** — take a breath, think for 2 seconds
- **Be honest** — "I don't know, but here's how I'd approach that" beats a fake answer
- **Bridge back to strengths** — "What I can tell you is..." → lead to our differentiators
- **Don't oversell** — if something isn't built yet, say "that's on the roadmap"
