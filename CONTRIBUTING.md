# Contributing

## Local development setup

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

- `AI_GATEWAY_API_KEY` in `apps/worker/.env` — from [v0.dev/gateway](https://v0.dev/gateway)

### 3. Start infrastructure

```bash
# Project services (Postgres + Redis)
docker compose -f docker-compose.dev.yml up -d

# Langfuse observability (ClickHouse + MinIO + Langfuse) — optional, enables LLM tracing
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

## Commands

```bash
pnpm test        # run all tests
pnpm typecheck   # type check all packages
pnpm lint        # lint
pnpm format      # auto-fix formatting

# After schema changes in packages/db/src/schema/
pnpm generate
pnpm migrate
```

## Architecture

See [CLAUDE.md](CLAUDE.md) for a detailed breakdown of the request flow, package responsibilities, and coding conventions.
