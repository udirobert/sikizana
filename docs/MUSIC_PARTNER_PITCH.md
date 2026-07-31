# Sikizana for Music — Design Partner Pitch

A one-pager to send to a musician, manager, or music accountant you trust.
Adapt the greeting and the specific names; keep the promises literal. This is
an invitation to shape the product, not a sales close.

---

## Subject idea

> Want a free assistant that watches your books (and chases the people who owe you)?

## The pitch

Hi [name],

I'm building Sikizana, an AI finance assistant that plugs into Xero and does
two things: it watches your books for money slipping away, and it helps you
get paid. I'm looking for a handful of music people to try it early and tell
me what's actually useful.

**Why now, and why music.** You probably already know about Making Tax Digital
— from April 2026, if you earn over £50k as a self-employed musician you have
to keep digital records and file quarterly through software like Xero instead
of the old annual tax return. That's pushing a lot of musicians onto proper
books whether they wanted to or not. The problem nobody solves is the next
step: once your money's in Xero, who's actually watching it?

You already know the answer most people use — you pay someone. Services like
PPS bill on your behalf, watch your income, and report back, for a cut. That
works, but it's a person with a spreadsheet. I'm building the software that
does the watching continuously, so a human can do the judgement.

**What it actually does, in plain English.**

- **Siki watches.** She scans your Xero for the quiet leaks: a bill paid
  twice, a supplier's bank details suddenly changing, a first payment to
  somewhere new, an invoice that's gone quiet. She shows you the evidence and
  the amount at risk, and she flags it as *something to check* — never as
  fraud, and never as a done deal.
- **Zana chases.** When a promoter, label, or venue owes you and it's late,
  she drafts the reminder (and the formal Letter Before Action when it comes to
  it) in your business's name. You approve before anything sends.

**The promises, literally.**

- Sikizana is read-only. Siki can't change your bills, suppliers, or bank
  details. Zana can't send anything without your sign-off. Human-in-the-loop
  by design.
- She never alleges fraud. A weird-looking payment is a risk to review through
  a contact you already know and trust — not an accusation.
- Your data is yours. Disconnecting keeps your history; deleting erases
  everything.

**What I'm asking.**

About 30 minutes of your time, plus permission to connect your Xero (a
sandbox is fine — you don't have to use live data). I want you to look at the
findings she surfaces and tell me, honestly, whether they'd have saved you
money or just been noise. I'm especially keen if you have a busy history:
session fees, royalties, merch, PR, multiple payers — the messier the better,
because that's where the leaks hide.

**What you get.**

- Free access while we're in this phase, and your say in what gets built.
- A real answer to "is anything slipping through my books?" — the kind of
  thing that usually only surfaces at tax time, when it's too late.
- If you're an accountant or manager: a tool your clients can run themselves,
  so the routine watching doesn't bill your hours.

No contract, no obligation, and I'd love to show you the duplicate-payment
demo first so you can see exactly what you're signing up for.

Can I book 30 minutes with you next week?

[Your name]
hello@persidian.com

---

## Internal notes (do not send)

- This is the construction-pilot playbook applied to music; see
  `docs/MUSIC_BEACHHEAD.md` for the case and guardrails, and
  `docs/AP_INTEGRITY_DESIGN_PARTNERS.md` for the operating loop and scorecard.
- Before inviting a cohort, set `AP_INTEGRITY_USER_IDS` to their user IDs on
  the production server and get their consent to AP scans first.
- The highest-value conversations are music accountants and managers, not
  individual artists — one accountant with twenty clients beats twenty cold
  musicians. Aim for the channel.
- Keep every claim traceable to something real (BRAND.md honesty rules). Do
  not promise a domain, certification, or response time we don't have.
