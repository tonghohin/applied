# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

Automated job application tool. Scrapes LinkedIn for matching positions, scores them against the user's profile, and uses a Gemini-powered AI agent to submit Easy Apply applications via Playwright.

## Commands

```bash
# Start everything
pnpm dev

# Individual app/package (use turbo filter, not pnpm --filter — turbo handles dep ordering)
pnpm turbo dev --filter=web
pnpm turbo dev --filter=server

# Tests (all packages)
pnpm test

# Run a single package's tests directly
pnpm --filter @repo/api vitest run
pnpm --filter @repo/automation vitest run

# After changing packages/db/src/schema/
pnpm generate   # drizzle-kit generate
pnpm migrate    # drizzle-kit migrate

# Type checking + lint
pnpm typecheck
pnpm lint
pnpm format
```

## Architecture

Turborepo monorepo with strict one-way deps: apps depend on packages, packages never depend on apps.

```
apps/web        Next.js 16 App Router frontend (port 3000) — no API routes; pure UI + tRPC client
apps/server     Hono server (port 3001) — mounts Better Auth at /api/auth/* and tRPC at /trpc/*
packages/api    All tRPC routers, services, Better Auth config, and context — the only place that touches the DB at runtime
packages/db     Drizzle schema, migrations, and db connection — re-exported for use in packages/api only
packages/automation  Playwright LinkedIn scraper + keyword-based job scorer
packages/ai     Gemini 2.5 Flash agent that fills and submits job applications using Playwright MCP
```

### Request flow

1. Next.js frontend calls tRPC via `trpc.*` hooks (TanStack Query v5)
2. tRPC client sends HTTP to `NEXT_PUBLIC_API_URL/trpc` (the Hono server)
3. Hono calls `createContext(req)` — reads session from Better Auth, attaches `db` + `session` to context
4. tRPC router dispatches to `packages/api` routers → services
5. Services import from `@repo/db`, `@repo/automation`, `@repo/ai` as needed

### Auth

Better Auth with Google OAuth, configured in `packages/api/src/auth.ts`. The Drizzle adapter uses `usePlural: true`. Auth routes handled by Hono via `auth.handler(c.req.raw)` — no special adapter needed.

### Job search pipeline

`jobs.search` tRPC mutation fires `runSearch` in the background (fire-and-forget). `runSearch`:
1. Fetches user's `jobCriteria` and decrypts their LinkedIn credentials (AES-256-GCM, key from `LINKEDIN_ENCRYPTION_KEY`)
2. Uses `packages/automation` Playwright scraper to log in to LinkedIn and scrape job listings
3. Scores each job with `scoreJob` (keyword matching: title worth 4pts, skills worth up to 6pts; ≥7 = strong, ≥3 = potential, else weak)
4. Inserts results into `jobs` table

### AI apply agent

`jobs.applyJobs` fires `applyToJob` per job (fire-and-forget). The agent:
- Spawns a Playwright MCP server via `@playwright/mcp --headless`
- Uses `generateText` with `stopWhen: stepCountIs(30)` and the MCP tools
- Returns `SUCCESS` or `FAILURE:<reason>`; caller writes status back to DB

### Environment variables

Each package/app validates only the env vars it uses via its own `src/env.ts` (Zod parse at startup). Loading is handled by the entry point:
- `apps/server`: `tsx --env-file apps/server/.env src/index.ts`
- `apps/web`: Next.js auto-loads `.env.local`
- `packages/db`: drizzle-kit auto-loads `packages/db/.env`

### tRPC patterns

- Client in `apps/web/lib/trpc.tsx` — `createTRPCReact<AppRouter>()` with `httpBatchLink` + superjson
- Use `trpc.x.queryOptions()` syntax (TanStack Query v5)
- All procedures except `health` require authentication (`protectedProcedure` throws `UNAUTHORIZED` if no session)

### Testing

Vitest with `vi.mock` — mocks are defined before imports. DB is mocked with a chainable query builder mock; no real DB in unit tests. Tests live next to the code they test (`*.test.ts`).

### Linter / formatter

Biome (not ESLint/Prettier). 2-space indent, 100 char line width, double quotes, ES5 trailing commas. Run `pnpm lint` to check, `pnpm format` to fix.

## Coding rules

**React components** — inline props, no separate interface:
```tsx
// correct
export function JobCard({ title, company }: { title: string; company: string }) {}

// wrong
interface JobCardProps { title: string; company: string }
export function JobCard({ title, company }: JobCardProps) {}
```

**Type safety**
- No `any`, no type casts (`as Foo`, `as unknown as Foo`)
- Prefer enum values (Drizzle `pgEnum`, `z.enum`, or `as const` objects) over plain `string` for fields with a fixed set of values — e.g. `fitTier`, `jobStatus`, `platform`
- Reuse existing types from `@repo/db` (`Job`, `Profile`, enum value types) rather than redefining them
