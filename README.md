<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/lockup-on-dark.svg">
    <img src="apps/web/public/lockup.svg" alt="Applied" height="72">
  </picture>

  <p>Automated job application tool — find, score, and apply to LinkedIn positions hands-free.</p>
</div>

---

## How it works

1. Fill in your profile — target job titles, skills, resume, and location preferences
2. Click **Search Jobs** — the scraper finds matching LinkedIn postings and scores each one
3. Review results in the dashboard — each job is scored 0–100 against your resume by an LLM
4. Select jobs and click **Apply to Selected** — an AI agent fills out and submits each application, generating a personalized cover letter and PDF resume on the fly
5. Optionally configure a schedule to run searches automatically on a daily or weekly cron

## Job tracking

Every job found by a search is saved and stays in your dashboard whether or not you ever apply to it — so the app works as a standalone job board even if you skip Easy Apply entirely.

- **Status pipeline** — each job starts at `pending_review` and can be moved to `applied`, `rejected`, or `skipped` manually from the dashboard (`applying`/`failed` are set automatically when the AI agent runs)
- **Search + filter + sort** — filter by status or workplace type (on-site/remote/hybrid), search by title/company/location, sort by score or recency
- **Score at a glance** — every job carries its 0–100 LLM match score, so you can triage without re-reading each posting
- **Company history** — the detail view shows how many times you've applied to or been rejected by that company before, and which titles
- **One-click back to source** — every job links back to the original LinkedIn posting
- **Smart deduplication** — skips jobs already in your dashboard by URL, and (if enabled) by matching company + title + location, so re-running a search doesn't flood you with the same postings; exclude keywords and companies you never want to see

## Stack

| Layer          | Tech                              |
| -------------- | --------------------------------- |
| Frontend + API | Next.js 16 App Router             |
| Auth           | Better Auth (email + password)    |
| Job queue      | BullMQ + Redis                    |
| Database       | PostgreSQL + Drizzle ORM          |
| Scraper        | Playwright (LinkedIn)             |
| AI Agent       | LLM agent + Playwright MCP        |
| Observability  | Langfuse (self-hosted)            |

## Monorepo structure

```
apps/
  web/        Next.js frontend + API routes (port 3000)
  worker/     BullMQ worker — runs scraper and AI agent
packages/
  api/        tRPC routers, services, BullMQ queue definitions
  db/         Drizzle schema + migrations + repository query functions
  automation/ LinkedIn scraper
  ai/         AI apply agent + resume PDF generator + LLM job scorer
  shared/     Shared utilities and constants (used by api + worker)
```

## Getting started

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) with Compose v2.20+ (ships with Docker Desktop 4.22+)

### 1. Clone

```bash
git clone <repo-url>
cd applied
```

### 2. Configure

Get an API key from [v0.dev/gateway](https://v0.dev/gateway) (requires a Vercel account):

```bash
echo "AI_GATEWAY_API_KEY=your-key" > .env
```

> **Before exposing to the internet:** also set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `ENCRYPTION_KEY` (`openssl rand -hex 32`) in `.env`.

### 3. Start

```bash
docker compose up -d
```

Migrations run automatically before the app starts. Everything else is pre-configured.

### 4. Open

Go to [http://localhost:3000](http://localhost:3000) and create an account.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup, commands, and architecture notes.

## Disclaimer

This tool automates interactions with LinkedIn in ways that may violate their [User Agreement](https://www.linkedin.com/legal/user-agreement). Use it at your own risk. The authors are not responsible for any consequences including account suspension or legal action.
