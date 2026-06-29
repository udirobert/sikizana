# Frontend Documentation

The Sikizana web interface is a modern, responsive chat application built for accessibility, trust, and high-impact demos.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4 (utility) + plain CSS variables in `globals.css` for surfaces/colours
- **Language**: TypeScript
- **Web3**: `@gear-js/api`, `@polkadot/extension-dapp`

## Routes
- `/` (Static landing page): hero, how-it-works, pricing, footer.
- `/arbitrate` (Static with client island): chat interface. Supports `?sample=<id>` for marketing CTAs.
- `/impact` (Static with client island): public live-impact dashboard pulling from `/api/revenue`.
- `/team` (Dynamic, client-only): shared-password team dashboard for GTM apprentices.

## Key Components
- `ChatInterface` (in `app/arbitrate/page.tsx`): Main interactive area with message bubbles, agent avatar, and tool-usage indicators.
- `PaymentModal`: Modal dialog for the premium M-Pesa STK Push flow. Collects phone number, triggers payment, polls for confirmation, and gates the deep audit behind a confirmed transaction. Saves the last-used phone in localStorage and shows a live countdown while polling.
- `RevenueBadge`: Live revenue counter in the header, fetching from `GET /api/revenue`. Serves as visible proof of real business activity.
- `MarkdownMessage`: Zero-dependency Markdown renderer for agent replies (headings, lists, code, links).
- `FeedbackButtons`: Optimistic UI for thumbs up/down feedback, sends `POST /api/feedback`.
- `OnboardingFlow`: First-visit micro-onboarding (language -> chama -> dispute kind). On completion, auto-creates an "onboarding" lead so the team has signal.
- `ApiHealthDot`: Small status dot in the header showing backend reachability.
- `VaraConnect`: Wallet connection button for Polkadot/Vara extensions (SubWallet, Enkrypt).
- `VaraProvider`: React context provider managing the Vara Network API connection.

## API Integration
A single API client in `web/lib/api.ts` centralises:
- Base URL resolution (`NEXT_PUBLIC_API_BASE`)
- JSON request/response handling
- Error normalisation (status code + message)
- Timeout enforcement
- Team token injection (`X-Team-Token` header from `localStorage`)

Components and hooks MUST use this client rather than calling `fetch` directly.

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/chat` | POST | public | Send message to arbitrator agent |
| `/api/payments/stk-push` | POST | public | Start M-Pesa STK Push |
| `/api/payments/callback` | POST | Daraja webhook | Confirm payment (server-side) |
| `/api/payments/status/{id}` | GET | public | Poll payment confirmation |
| `/api/revenue` | GET | public | Revenue summary for dashboard / impact |
| `/api/feedback` | POST | public | Thumbs up/down + comment on an agent reply |
| `/api/leads` | POST | public | Create lead (used by onboarding + team form) |
| `/api/leads` | GET | team token | List leads (filter by owner/status) |
| `/api/leads/{id}/status` | POST | team token | Update lead status (pipeline moves) |
| `/api/leads/{id}/claim` | POST | team token | Claim an unowned lead |
| `/api/leads/{id}/activity` | POST/GET | team token | Append / list activity log entries |
| `/api/leads/aggregate/scoreboard` | GET | team token | Per-owner revenue + counts |
| `/api/leads/aggregate/funnel` | GET | team token | Lead counts by status |
| `/api/leads/aggregate/daily-revenue` | GET | team token | Daily revenue per owner |
| `/api/testimonials` | POST | public | Submit testimonial |
| `/api/testimonials` | GET | public | Public list (approved) / all (team) |

## Premium Flow
1. User toggles "Premium Audit" in the input area.
2. A payment modal opens collecting the M-Pesa phone number.
3. Frontend calls `/api/payments/stk-push` to trigger the STK push.
4. Frontend polls `/api/payments/status/{id}` every 3 seconds (3-minute cap).
5. Once confirmed, the message is sent to `/chat` with the premium flag.
6. The agent verifies payment via `verify_premium_payment` before running the deep audit.
7. PaymentStore → LeadsService auto-attributes the M-Pesa receipt to the apprentice who owns the matching lead.

## Team Dashboard (`/team`)
- Shared-password sign-in (password stored in `TEAM_PASSWORD` env var).
- Pipeline overview: counters per status, colour-coded.
- Per-owner scoreboard: lead count, engaged count, paid conversions, total revenue (KES), confirmed transaction count.
- Add-lead form: chama name (required), contact name, phone (auto-normalised), handle, language, county, source, status, notes.
- Per-lead card: status chip with one-tap transitions, claim button if unowned, copy-link, mask phone for privacy.
- Outreach templates: WhatsApp/Swahili/English intros, price-objection handler, follow-ups, testimonial ask. One-tap copy to clipboard.

## Impact Page (`/impact`)
- Live revenue counter (refreshes every 30s).
- Paid-mediations count, approved testimonials, thumbs-up rate.
- Lead funnel counters (contacted -> ... -> testimonial).
- Approved-testimonial wall with attribution to chama + contact.
- Bottom CTA back to `/arbitrate?sample=...` for free trial conversion.

## Setup
```bash
cd web
pnpm install
pnpm dev
```

Set `NEXT_PUBLIC_API_BASE` to point to the backend (defaults to `http://localhost:8080`).
Set `TEAM_PASSWORD` on the backend to enable the `/team` dashboard.
