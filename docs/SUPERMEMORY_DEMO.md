# Supermemory Integration Demo Script

A 3-minute walkthrough showing Supermemory Local powering memory, multi-region
tax RAG, proactive alerts, and transparency in Sikizana.

## Prerequisites
- Backend running: `python -m uvicorn src.api.main:app --port 8080`
- Frontend running: `cd web && npm run dev`
- Supermemory Local running: `supermemory-server`
- Xero connected (or demo mode)

## Demo Flow

### Beat 1: Memory OFF baseline (30s)
1. Stop Supermemory: `kill $(lsof -ti:6767)`
2. Open http://localhost:3000/books
3. Point at the "Memory: OFF" badge in the chat header
4. Ask: "What's the mileage allowance for business driving?"
5. Siki answers with the UK rule (45p/mile) — keyword lookup only
6. Note: no "What Siki remembered" panel appears

### Beat 2: Turn memory ON — tax RAG across 3 regions (45s)
1. Restart Supermemory: `supermemory-server &`
2. Refresh the page — badge flips to "Memory: ON"
3. Ask: "I'm based in Australia — what's the mileage rate?"
4. Siki detects the region from Xero org country code and answers with
   the ATO rule (88 cents/km) — powered by Supermemory semantic RAG
5. Ask: "What about the US rate?"
6. Siki answers with the IRS rule (67 cents/mile)
7. Point out: same question, 3 jurisdictions, correct answer each time
   — Supermemory's semantic search finds the right rule, not keyword matching

### Beat 3: Cross-session memory (45s)
1. Ask: "Acme Ltd is overdue on INV-0042, £4200. What should I do?"
2. Siki recommends a chasing strategy
3. The conversation is ingested into Supermemory (fire-and-forget)
4. Open http://localhost:3000/memory — show the memory being stored
5. Say: "Imagine we come back tomorrow..."
6. Ask: "Tell me about Acme Ltd"
7. Siki recalls the previous conversation — "Acme was overdue on INV-0042,
   I recommended a firm reminder citing the Late Payment Act"
8. The "What Siki remembered" panel appears above the response

### Beat 4: Proactive memory alert (30s)
1. Ask: "Show me overdue invoices"
2. When Siki returns the invoice list, it automatically searches Supermemory
   for past context about the overdue customers
3. If memories are found, a "Proactive Memory Alert" appears:
   "Acme was late last time too — a final notice got them to pay in 5 days"
4. Siki's response references the memory naturally
5. Point out: the memory layer drives value proactively, not just on recall

### Beat 5: Graceful degradation (30s)
1. Kill Supermemory again: `kill $(lsof -ti:6767)`
2. Badge flips to "Memory: OFF"
3. Ask another tax question — Siki still answers (keyword fallback)
4. Ask about a customer — Siki says "I don't have memory of past conversations"
5. Point out: the app never breaks — Supermemory is a bonus layer, not a
   dependency. This is production-grade architecture.

### Beat 6: Transparency + user control (30s)
1. Restart Supermemory
2. Open http://localhost:3000/memory
3. Show the list of stored memories
4. Click delete on one — it's removed (GDPR right-to-erasure)
5. Point out: users can see exactly what Siki remembers and delete anything
6. This is the "show, don't tell" of AI memory transparency

## Key Talking Points

- **Supermemory is load-bearing, not a wrapper**: it powers 4 features
  (memory, RAG, proactive alerts, transparency page)
- **Multi-region semantic RAG**: 62 documents across UK/AU/US, region
  auto-detected from Xero org — no other Xero app does this
- **Proactive, not passive**: memory surfaces automatically when overdue
  invoices are detected, not just when the user asks
- **Graceful degradation**: kill the server, the app keeps working —
  production-grade optional dependency pattern
- **Transparency**: users can inspect and delete memories — GDPR-aligned
- **101 tests pass**: including 24 Supermemory-specific tests covering
  degradation, multi-region RAG, and the ContextVar region routing
