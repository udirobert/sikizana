# Frontend Documentation

The Sikizana web interface is a modern, responsive chat application built for accessibility and high-impact demos.

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Icons**: Lucide React

## Key Components
- `ChatInterface`: Main interactive area with message bubbles.
- `MediationStatus`: Visual indicator of which tool the agent is currently using (Bylaws vs Finance).
- `MultilingualToggle`: (Planned) Quick switch between Sheng, Kiswahili, and English.

## API Integration
The frontend communicates with the FastAPI backend via the `/chat` endpoint.
- **Payload**: `{ "message": string, "thread_id": string }`
- **Response**: `{ "response": string, "thread_id": string }`

## Setup
```bash
cd web
pnpm install
pnpm dev
```
