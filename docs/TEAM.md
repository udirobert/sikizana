# Team

Solo build today with AI assistance (Gemini + this codebase). GTM is run
by two apprentices on the ground who drive chama acquisition while the
developer focuses on the platform.

## Developer
- **@udirobert**: Full-stack agent architecture, Vara Network integration, decentralized arbitration logic, Kenyan linguistic prompt engineering (Sheng/Kiswahili), business operations, and Safaricom Daraja integration.

## GTM Apprentices
- **Apprentice 1**: outreach — chama WhatsApp groups, English-Swahili.
- **Apprentice 2**: outreach — chama WhatsApp groups, Sheng-Nairobi.

Apprentices authenticate to `/team` with a shared password (env var
`TEAM_PASSWORD`). They claim chama contacts, log activity, run outreach
templates, and earn per-conversion revenue attributed automatically from
the M-Pesa phone-number join.

The public `/impact` page is what we point judges, investors, and partner
chamas to. It updates every 30 seconds from the live ledger.

## AI-Assisted Development

The project uses AI coding tools to accelerate solo velocity:

- **Factory Droid**: Day-to-day development, refactoring, documentation, and infrastructure work. All AI-generated commits are co-authored.
- **Google Gemini 1.5/3.1**: The mediator brain that powers the arbitrator. The same family of models used to build the product also runs in production.
- **Claude Code / Codex / Cursor**: Available via UiPath for Coding Agents for additional pair-programming leverage.

## Strategy
As a solo+GTM build, the project prioritizes:
- **Core Agent Intelligence**: Deepening the reasoning capabilities of the Gemini-powered arbitrator.
- **On-chain Reliability**: Ensuring the Vara/Sails contract logic is robust for decentralized coordination.
- **Real Revenue Path**: 90-day sprint to validate Sikizana as a paying business via M-Pesa STK Push, not just a hackathon demo.
- **GTM Operating System**: The `/team` dashboard turns two apprentices into a measurable revenue pipeline with auto-attribution.
- **Lean UX**: Focusing on a highly functional chat interface that solves the core dispute resolution problem.
- **Production Hygiene**: Pre-commit hooks (Ruff, ESLint, TypeScript, detect-secrets), CI on GitHub Actions, and Secret Manager for credentials.
