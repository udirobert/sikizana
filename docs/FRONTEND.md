# Frontend Documentation

The Sikizana web interface is a modern, responsive chat application built for accessibility, trust, and high-impact demos.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Icons**: Lucide React
- **Web3**: `@gear-js/api`, `@polkadot/extension-dapp`

## Key Components
- `ChatInterface` (in `app/page.tsx`): Main interactive area with message bubbles, agent avatar, and tool-usage indicators.
- `PaymentModal`: Modal dialog for the premium M-Pesa STK Push flow. Collects phone number, triggers payment, polls for confirmation, and gates the deep audit behind a confirmed transaction.
- `RevenueBadge`: Live revenue counter in the header, fetching from `GET /api/revenue`. Serves as visible proof of real business activity.
- `VaraConnect`: Wallet connection button for Polkadot/Vara extensions (SubWallet, Enkrypt).
- `VaraProvider`: React context provider managing the Vara Network API connection.

## API Integration
The frontend communicates with the FastAPI backend:

| Endpoint | Method | Purpose |
|---|---|---|
| `/chat` | POST | Send message to arbitrator agent |
| `/api/payments/stk-push` | POST | Start M-Pesa STK Push |
| `/api/payments/callback` | POST | Safaricom webhook (server-side) |
| `/api/payments/status/{id}` | GET | Poll payment confirmation |
| `/api/revenue` | GET | Revenue summary for dashboard |

## Premium Flow
1. User toggles "Premium Audit" in the input area.
2. A payment modal opens collecting the M-Pesa phone number.
3. Frontend calls `/api/payments/stk-push` to trigger the STK push.
4. Frontend polls `/api/payments/status/{id}` every 3 seconds.
5. Once confirmed, the message is sent to `/chat` with the premium flag.
6. The agent verifies payment via `verify_premium_payment` before running the deep audit.

## Setup
```bash
cd web
pnpm install
pnpm dev
```

Set `NEXT_PUBLIC_API_BASE` to point to the backend (defaults to `http://localhost:8080`).
