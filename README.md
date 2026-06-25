# Applied

Automated job application tool. Scrapes LinkedIn for matching positions, scores them against your profile, and uses an AI agent to submit Easy Apply applications on your behalf.

## How it works

1. You fill in your profile (target job titles, skills, resume, location preferences)
2. Click **Search Jobs** — the scraper finds matching LinkedIn postings and scores each one
3. Review the results in the dashboard (Strong / Potential / Weak fit)
4. Select the jobs you want and click **Apply to Selected** — a Gemini-powered agent fills out and submits each application, generating a personalized cover letter and a PDF resume on the fly
5. Optionally configure a schedule to run searches automatically on a daily or weekly cron

## Stack

| Layer          | Tech                              |
| -------------- | --------------------------------- |
| Frontend + API | Next.js 16 App Router             |
| Auth           | Better Auth (email + password)    |
| Job queue      | BullMQ + Redis                    |
| Database       | PostgreSQL + Drizzle ORM          |
| Scraper        | Playwright (LinkedIn)             |
| AI Agent       | Gemini 2.5 Flash + Playwright MCP |
| Observability  | Langfuse (self-hosted)            |

## Monorepo structure

```
apps/
  web/        Next.js frontend + API routes (port 3000)
  worker/     BullMQ worker — runs scraper and AI agent
packages/
  api/        tRPC routers, services, BullMQ queue definitions
  db/         Drizzle schema + migrations + repository query functions
  automation/ LinkedIn scraper + job scorer
  ai/         Gemini apply agent + resume PDF generator
  shared/     Shared utilities and constants (used by api + worker)
```

## Getting started

### Self-hosting with Docker

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) with Compose v2.20+ (ships with Docker Desktop 4.22+)

#### 1. Clone

```bash
git clone <repo-url>
cd applied
```

#### 2. Start

```bash
echo "AI_GATEWAY_API_KEY=your-key" > .env
docker compose up -d
```

That's it. Everything else is pre-configured. Migrations run automatically before the app comes up.

> **Before exposing to the internet:** set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `LINKEDIN_ENCRYPTION_KEY` (`openssl rand -hex 32`) in your `.env` file.

#### 3. Open the app

Go to [http://localhost:3000](http://localhost:3000) and create an account.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup, commands, and architecture notes.

## Disclaimer

This tool automates interactions with LinkedIn in ways that may violate their [User Agreement](https://www.linkedin.com/legal/user-agreement). Use it at your own risk. The authors are not responsible for any consequences including account suspension or legal action.
