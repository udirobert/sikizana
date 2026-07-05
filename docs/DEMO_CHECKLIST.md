# Sikizana Books — Demo Checklist (Day of Hackathon)

## LIVE URL

**https://sikizana.persidian.com**

Everything is deployed on the VPS. No local setup needed for the demo.

---

## BEFORE THE PITCH (10 min before)

### 1. Verify the live site
Open: **https://sikizana.persidian.com/books**

Check:
- Siki the Owl mascot appears in the nav and chat header
- "● Xero Live" badge in the top right
- Proactive audit notification appears ("I've audited your books...")
- Quick Audit sidebar shows 9 unreconciled, 1 overdue

If the site is down:
```bash
ssh nuncio-vultr "cd ~/sikizana && sudo docker compose -f docker-compose.vps.yml restart"
```

If Xero says "Demo Data" instead of "Live":
```bash
ssh nuncio-vultr "sudo docker exec sikizana-api xero login"
# follow the OAuth flow, then restart:
ssh nuncio-vultr "cd ~/sikizana && sudo docker compose -f docker-compose.vps.yml restart sikizana-api"
```

### 2. Test the agent
In the chat box, type: "What is my net profit?"
- Siki's eyes should shift to "look" mode (loading)
- While Siki Works panel appears with educational tips + insights
- Tool calls appear in the trace
- Response within 30-60 seconds with £4,883.13
- After response, Zana nudge chip may appear if tax/savings detected

If agent doesn't respond:
- Check NVIDIA_API_KEY is set: `ssh nuncio-vultr "cat ~/sikizana/.env"`
- Check backend logs: `ssh nuncio-vultr "sudo docker logs sikizana-api --tail 20"`
- The 70B model can take up to 60s on cold start — wait for it

### 3. Open the pitch slides
```bash
open ~/Dev/sikizana/docs/pitch-slides.html
```
Press `T` to start the 3-minute timer.
Press `→` or `Space` to advance slides.

### 4. Have a backup tab ready
Open https://sikizana.persidian.com/books in a second tab as fallback.

---

## THE PITCH (3 minutes)

### 0:00-0:30 — Hook
- "Meet Sarah..." (problem + opportunity)
- Slide 1-2

### 0:30-1:40 — Demo (THE BIG MOMENT)
- Switch to https://sikizana.persidian.com/books
- Point out Siki the Owl mascot in the nav
- Show proactive audit notification (auto-appears on page load)
- Type: "Check my books and tell me what's wrong"
- Watch the While Siki Works panel — point out the rotating tips,
  personalized insights, and live HMRC guidance from gov.uk
- Watch the tool call trace stream in real-time (transparency!)
- Wait for response (30-60s — DON'T talk over it, let it land)
- Point out the Zana nudge chip ("Zana can draft the chasing email →")
- Click it to switch to Zana — show the persona change
- Type: "What's my net profit this month?"
- Wait for response (£4,883.13)
- If time: upload a receipt or ask about overdue invoices
- Slides 3-5 if needed

### 1:40-2:30 — Tech
- Slide 6 (architecture)
- Mention: NVIDIA NIM (Llama 3.3 70B), Venice fallback, Xero CLI, webhooks
- Mention Exa + Firecrawl: "Live HMRC guidance from gov.uk, fetched in real-time"
- Mention While Siki Works: "Educational content while the agent works — no dead spinner"
- Mention Siki mascot: "Built entirely from SVG rectangles, no images"
- Mention streaming transparency: "Users see every tool call in real-time"

### 2:30-3:00 — Future
- Slide 7 (roadmap)
- Slide 8 (closing)
- "AI bookkeeping for the 4.4 million who can't afford one"

---

## DURING Q&A

- Stay calm, take a breath
- Reference Q&A anticipation sheet
- If asked something unexpected: "That's a great question. Here's how I'd approach that..."
- Bridge back to strengths: human-in-the-loop, streaming transparency, live Xero data, Siki mascot

---

## IF THINGS GO WRONG

### Site is down
→ SSH to VPS and restart: `ssh nuncio-vultr "cd ~/sikizana && sudo docker compose -f docker-compose.vps.yml restart"`
→ If still down: pitch from slides (they're self-contained HTML)

### Xero CLI not authenticated
→ `ssh nuncio-vultr "sudo docker exec sikizana-api xero login"`
→ Follow OAuth flow, then restart the API container
→ If no time: the app falls back to demo data (still works, just not "live")

### Agent doesn't respond
→ Check NVIDIA_API_KEY: `ssh nuncio-vultr "cat ~/sikizana/.env"`
→ Restart: `ssh nuncio-vultr "cd ~/sikizana && sudo docker compose -f docker-compose.vps.yml restart sikizana-api"`
→ If no time: show the chat UI and explain what it would do

### No wifi at all
→ Pitch from slides (they're self-contained HTML)
→ Screenshot the live site beforehand as backup

---

## KEY NUMBERS TO REMEMBER

| Metric | Value |
|--------|-------|
| Live URL | https://sikizana.persidian.com |
| Xero subscribers | 4.4 million |
| Unreconciled transactions | 9 |
| Overdue invoices | 1 (£270.63) |
| Revenue (this month) | £5,039.80 |
| Net profit | £4,883.13 |
| Bank transactions | 23 |
| Invoices | 10 |
| Accounts | 90 |
| Contacts | 52 |
| Agent tools | 15 |
| LLM model | Llama 3.3 70B (NVIDIA NIM) |
| Fallback model | Llama 3.3 70B (Venice AI) |
| Live HMRC content | Exa search + Firecrawl scrape |
| Edu tips library | 25+ tips across 10 tool categories |
| Bookkeeper cost (traditional) | £50-100/month |
| Our price (planned) | £15-25/month |
| Mascot | Siki the Owl (pure SVG, 5 moods) |
| Response time | 30-60s (70B model cold start) |
