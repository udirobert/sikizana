# Sikizana Books — Demo Checklist (Day of Hackathon)

## BEFORE THE PITCH (30 min before)

### 1. Start the backend
```bash
cd ~/Dev/sikizana
source .venv/bin/activate
python -m uvicorn src.api.main:app --port 8000
```
Verify: `curl http://localhost:8000/api/xero/status` → `{"live": true, "mode": "live"}`

If it says `"live": false`:
```bash
xero login  # re-authenticate with Xero
# then restart the backend
```

### 2. Start the frontend
```bash
cd ~/Dev/sikizana/web
npm run dev
```
Open: `http://localhost:3000/books`

### 3. Verify the agent works
In the chat box, type: "Check my books"
- Agent should respond within 10-15 seconds
- Should mention 9 unreconciled transactions and 1 overdue invoice

If agent doesn't respond:
- Check `NVIDIA_API_KEY` is in `.env`
- Check backend logs for errors
- Fallback: use the backup video

### 4. Open the pitch slides
```bash
open ~/Dev/sikizana/docs/pitch-slides.html
```
Press `T` to start the 3-minute timer.
Press `→` or `Space` to advance slides.

### 5. Have the backup video ready
If wifi is flaky or the live demo fails, play the backup video.
Have it queued in a browser tab or video player.

---

## THE PITCH (3 minutes)

### 0:00-0:30 — Hook
- "Meet Sarah..." (problem + opportunity)
- Slide 1-2

### 0:30-1:40 — Demo (THE BIG MOMENT)
- Switch to /books in browser
- Show proactive audit notification
- Type: "Check my books and tell me what's wrong"
- Wait for response (10-15s — DON'T talk over it, let it land)
- Type: "What's my net profit this month?"
- Wait for response
- Slides 3-5 if needed

### 1:40-2:30 — Tech
- Slide 6 (architecture)
- Mention: NVIDIA NIM, Xero CLI, webhooks, multimodal
- "40% less repetitive API calls" (webhook stat)

### 2:30-3:00 — Future
- Slide 7 (roadmap)
- Slide 8 (closing)
- "AI bookkeeping for the 4.4 million who can't afford one"

---

## DURING Q&A

- Stay calm, take a breath
- Reference Q&A anticipation sheet
- If asked something unexpected: "That's a great question. Here's how I'd approach that..."
- Bridge back to strengths: human-in-the-loop, proven architecture, live Xero data

---

## IF THINGS GO WRONG

### Backend won't start
→ Use backup video, pitch from slides

### Xero CLI not authenticated
→ `xero login` → re-authenticate → restart backend
→ If no time: the app falls back to mock data (still works, just not "live")

### Agent doesn't respond
→ Check NVIDIA_API_KEY in .env
→ Restart backend
→ If no time: show the chat UI and explain what it would do

### Frontend won't build
→ `cd web && rm -rf .next && npm run dev`
→ If no time: use backup video

### No wifi at all
→ Play backup video from local file
→ Pitch from slides (they're self-contained HTML)

---

## KEY NUMBERS TO REMEMBER

| Metric | Value |
|--------|-------|
| Xero subscribers | 4.4 million |
| Unreconciled transactions | 9 |
| Overdue invoices | 1 (£270.63) |
| Revenue (this month) | £5,039.80 |
| Net profit | £4,883.13 |
| Bank transactions | 23 |
| Invoices | 10 |
| Accounts | 90 |
| Contacts | 52 |
| Agent tools | 10 |
| Bookkeeper cost (traditional) | £50-100/month |
| Our price (planned) | £15-25/month |
| Webhook API call reduction | 40% |
