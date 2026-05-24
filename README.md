# Applied

Automated job application tool. Scrapes LinkedIn for matching positions, scores them against your profile, and uses an AI agent to submit Easy Apply applications on your behalf.

## How it works

1. You fill in your profile (target job titles, skills, resume details)
2. Click **Search Jobs** — the scraper finds matching LinkedIn postings and scores each one
3. Review the results in the dashboard (Strong / Potential / Weak fit)
4. Select the jobs you want and click **Apply to Selected** — a Gemini-powered agent fills out and submits each application via Playwright

## Stack

| Layer | Tech |
|---|---|
| Frontend + API | Next.js 16 App Router |
| Auth | Better Auth (Google OAuth) |
| Job queue | BullMQ + Redis |
| Database | PostgreSQL + Drizzle ORM |
| Scraper | Playwright (LinkedIn) |
| AI Agent | Gemini 2.5 Flash + MCP (Playwright tools) |

## Monorepo structure

```
apps/
  web/        Next.js frontend + API routes (port 3000)
  worker/     BullMQ worker — runs scraper and AI agent
packages/
  api/        tRPC routers, services, BullMQ queue definitions
  db/         Drizzle schema + migrations + repository query functions
  automation/ LinkedIn scraper + job scorer
  ai/         Gemini apply agent
```

## Getting started

**Prerequisites:** Node.js 20+, pnpm, Docker

### 1. Clone and install

```bash
git clone <repo-url>
cd applied
pnpm install
```

### 2. Set up environment variables

**`apps/web/.env.local`**
```
NEXT_PUBLIC_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://applied:applied@localhost:5432/applied
BETTER_AUTH_SECRET=<random 32+ char string>
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
LINKEDIN_ENCRYPTION_KEY=<64 hex chars — openssl rand -hex 32>
REDIS_URL=redis://localhost:6379
```

**`apps/worker/.env`**
```
DATABASE_URL=postgresql://applied:applied@localhost:5432/applied
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=<from Google AI Studio>
LINKEDIN_ENCRYPTION_KEY=<64 hex chars — same as above>
```

**`packages/db/.env`**
```
DATABASE_URL=postgresql://applied:applied@localhost:5432/applied
```

### 3. Start the database and Redis

```bash
docker compose up -d
pnpm migrate
```

### 4. Start the app

```bash
pnpm dev
```

This starts both `apps/web` (port 3000) and `apps/worker` in parallel.

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

## Development

```bash
pnpm test
pnpm typecheck
pnpm lint

# After schema changes
pnpm generate
pnpm migrate
```
