# ProtoRun — builders hackathon entry

> **Status: registered.** Team `papajams` is entered for ProtoRun, the online
> builders hackathon at [protorun.build.host](https://protorun.build.host/).
> Submission deadline: **end of day Friday, November 20 (PST)**.
>
> Finish line checklist: [protorun.build.host/checklist](https://protorun.build.host/checklist/)
> (17 items — the source of truth for what's required).

## What ProtoRun asks for

Four steps: take a real business → build its app on **erp.ai** with **Proto**
(download at [protoagent.ai](https://protoagent.ai/), also served at
proto.erp.ai) → submit → get it customers with Meta ads (spend reimbursed,
see rules below). Prizes: $5K / $3K / $2K for the top three plus $40K across
100+ more winners. Teams of 1–4; every builder gets $100+ in AI tokens.

Judging is on **app quality, not revenue** — the app doesn't have to make
money. Real customers only; fakes mean disqualification.

## Registration details

| Field | Value |
|---|---|
| Team name | `papajams` |
| Team size | Solo |
| Captain | papa jams — papaandthejimjams@gmail.com — Discord `papajams` — UK |
| Business | **Sikizana** ("I own / run it"; they're in) |
| Website | https://sikizana.persidian.com |
| Industry | Professional Services |
| Registration ID | `8d41d516-74fb-4ac7-b074-ba39f864bb0b` |

There is no login on the site. Submissions are made at
protorun.build.host/submit using the **registered email** (it finds the team;
any teammate can submit), and resubmitting replaces the earlier version.

## The pitch on file

> Sikizana is a live AI finance assistant for Xero-using small businesses — it
> finds money at risk, drafts late-payment chase emails, and tracks recoveries.
> For ProtoRun I will build its customer-facing client portal on erp.ai
> (aged-receivables dashboard, approval queue for AI-drafted chases, recovery
> tracking) served by build.host, plus the internal ops system running
> Sikizana itself — subscriptions, support desk, and churn signals.

Target customers: UK small businesses and freelancers on Xero — agencies,
tradespeople, and service businesses losing cash to late-paying clients.

## Build plan

- **Backend:** erp.ai — the portal's data, workflows, and logic. Signups must
  land as records in the erp.ai app — that's what ProtoRun counts as
  customers, not signups on the existing Sikizana funnel.
- **Front end:** build.host — customer-facing site live. **Never embed the
  erp.ai API key in the site code** — it opens the whole erp.ai org. Use
  erp.ai's public form / server-side path for signup writes.
- **Funnel:** ads point at the build.host site (required — ads to
  sikizana.persidian.com don't count); from there link into the existing
  `/books?flow=check` flow.

## Compliance (from the finish-line checklist)

- Footer on the build.host site: privacy policy, terms, contact email —
  Meta's ad review checks for these.
- Own domain: buy one, manage DNS on Cloudflare, point at build.host site.
- Google Search Console verification + sitemap submission.
- Google Analytics on the site.
- Meta Pixel on the site (tracks signups/purchases from ads).
- If payments are taken: real checkout only — test mode doesn't count.

## Ad spend reimbursement

- **Submit first.** They only repay spend from teams that have submitted.
- You pay first; they repay **per $10 spent** (Wise or similar).
- Own ad account: business.facebook.com → business portfolio → ad account.
- Add ProtoRun as **view-only partner**: ad account → Assign partner →
  business ID `1476827121261452` → view performance only.
- Post each $10 spend in the per-team Discord channel (created after
  submission); they verify in Meta. Only spend visible in the ad account is
  reimbursed. Ads for anything else = disqualification.

## Submission assets to prepare

The submit form asks for:

- build.host live site URL + erp.ai app link
- Screenshots via a shared-folder link (anyone-with-link view access)
- Business name, what it does, owner name + phone/email — **judges may
  contact the owner to confirm the business is real**
- A quote from the owner
- Optional but recommended: 2–3 min demo video (Loom/YouTube) showing the
  app working and the business using it
- Two consent checkboxes: results are real / provable; ProtoRun may feature
  the project publicly

## Next steps

1. Download Proto at protoagent.ai (claim the $100+ AI tokens).
2. Join the **ERP AI Official Community** Discord — updates and help in
   `#protorun-help`.
3. Build the client portal on erp.ai; ship the front end on build.host.
4. Do the compliance items (footer legal, domain, GSC/GA, Meta Pixel).
5. **Submit** at protorun.build.host/submit (with assets above).
6. Then launch Meta ads at the build.host site and log each $10 spend in
   Discord for reimbursement.
