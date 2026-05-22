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
| Frontend | Next.js 16 App Router |
| Backend | Hono + tRPC |
| Auth | Better Auth (Google OAuth) |
| Database | PostgreSQL + Drizzle ORM |
| Scraper | Playwright (LinkedIn) |
| AI Agent | Gemini 2.5 Flash + MCP (Playwright tools) |

## Monorepo structure

```
apps/
  web/        Next.js frontend (port 3000)
  server/     Hono API server (port 3001)
packages/
  api/        tRPC routers + services
  db/         Drizzle schema + migrations
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

**`apps/server/.env`**
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/applied
BETTER_AUTH_SECRET=<random 32+ char string>
BETTER_AUTH_URL=http://localhost:3001
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
ALLOWED_ORIGIN=http://localhost:3000
GEMINI_API_KEY=<from Google AI Studio>
LINKEDIN_ENCRYPTION_KEY=<64 hex chars — openssl rand -hex 32>
```

**`apps/web/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**`packages/db/.env`**
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/applied
```

### 3. Start the database

```bash
docker compose up -d
pnpm migrate
```

### 4. Start the servers

```bash
pnpm dev
```

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
