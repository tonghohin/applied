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
| Auth           | Better Auth                       |
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

**Prerequisites:** Node.js 20+, pnpm 11+, Docker

### 1. Clone and install

```bash
git clone <repo-url>
cd applied
pnpm install
pnpm --filter @repo/automation exec playwright install chromium
```

### 2. Set up environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env
cp packages/db/.env.example packages/db/.env
```

Most values are pre-filled and work out of the box. You only need to add:

- `AI_GATEWAY_API_KEY` in `apps/worker/.env` — from [v0.dev/gateway](https://v0.dev/gateway) (requires a Vercel account)

### 3. Start infrastructure

```bash
# Project services (Postgres + Redis)
docker compose up -d

# Langfuse observability (ClickHouse + MinIO + Langfuse)
docker compose -p langfuse -f docker-compose.langfuse.yml up -d
```

Langfuse UI: [http://localhost:3001](http://localhost:3001) — login `admin@local.dev` / `admin123`.

### 4. Run migrations

```bash
pnpm migrate
```

### 5. Start the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and create an account.

## Disclaimer

This tool automates interactions with LinkedIn in ways that may violate their [User Agreement](https://www.linkedin.com/legal/user-agreement). Use it at your own risk. The authors are not responsible for any consequences including account suspension or legal action.

## Development

```bash
pnpm test
pnpm typecheck
pnpm lint

# After schema changes in packages/db/src/schema/
pnpm generate
pnpm migrate
```
