# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

Automated job application tool. Scrapes LinkedIn for matching positions, scores them against the user's profile, and uses a Gemini-powered AI agent to submit Easy Apply applications via Playwright.

## Commands

```bash
# Start everything (web + worker in parallel)
pnpm dev

# Individual app/package (use turbo filter, not pnpm --filter — turbo handles dep ordering)
pnpm turbo dev --filter=web
pnpm turbo dev --filter=@repo/worker

# Tests (all packages)
pnpm test

# Run a single package's tests directly
pnpm --filter @repo/api exec vitest run
pnpm --filter @repo/automation exec vitest run

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
apps/web        Next.js 16 App Router — frontend UI + API routes (/api/auth/*, /api/trpc/*)
apps/worker     BullMQ worker — consumes search and apply queues, runs Playwright + Gemini
packages/api    tRPC routers, services, Better Auth config, BullMQ queue definitions
packages/db     Drizzle schema, migrations, db connection, and repository query functions
packages/automation  Playwright LinkedIn scraper + keyword-based job scorer
packages/ai     Gemini 2.5 Flash agent that fills and submits job applications using Playwright MCP
```

### Request flow

1. Next.js frontend calls tRPC via `trpc.*` hooks (TanStack Query v5)
2. tRPC client sends HTTP to `/api/trpc` (same-origin Next.js route handler)
3. Next.js calls `createContext(req)` — reads session from Better Auth, attaches `db` + `session` to context
4. tRPC router dispatches to `packages/api` routers → services
5. Long-running work (search, apply) is enqueued to BullMQ; `apps/worker` processes it asynchronously

### Auth

Better Auth with Google OAuth, configured in `packages/api/src/auth.ts`. The Drizzle adapter uses `usePlural: true`. Auth routes served by Next.js via `apps/web/app/api/auth/[...all]/route.ts` — `auth.handler` accepts web-standard Request/Response directly.

### Job search pipeline

`jobs.search` enqueues to `searchQueue`. Worker decrypts LinkedIn credentials (AES-256-GCM), calls `runSearch` from `packages/automation` which scrapes LinkedIn via Playwright, scores jobs (title 4pts + skills up to 6pts; ≥7 strong, ≥3 potential, else weak), and inserts into `jobs` table.

### AI apply agent

`jobs.applyJobs` enqueues to `applyQueue`. Worker calls `processApplyJob` from `packages/ai` which spawns a Playwright MCP server (`@playwright/mcp --headless`), uses `generateText` with `stopWhen: stepCountIs(30)` to fill and submit the application, then updates job status to `applied` or `failed`.

### Environment variables

Each package/app validates only the env vars it uses via its own `src/env.ts` (Zod parse at startup). Loading is handled by the entry point:
- `apps/web`: Next.js auto-loads `.env.local` — holds all server-side vars (`DATABASE_URL`, `BETTER_AUTH_*`, `GOOGLE_*`, `LINKEDIN_ENCRYPTION_KEY`, `REDIS_URL`) plus `NEXT_PUBLIC_BASE_URL`
- `apps/worker`: `tsx --env-file .env src/index.ts` — holds `DATABASE_URL`, `REDIS_URL`, `GEMINI_API_KEY`, `LINKEDIN_ENCRYPTION_KEY`
- `packages/db`: drizzle-kit auto-loads `packages/db/.env`

### tRPC patterns

- Client in `apps/web/lib/trpc.tsx` — `createTRPCReact<AppRouter>()` with `httpBatchLink` pointing at `/api/trpc` + superjson
- Use `trpc.x.queryOptions()` syntax (TanStack Query v5)
- All procedures except `health` require authentication (`protectedProcedure` throws `UNAUTHORIZED` if no session)

### Data fetching pattern (server → client)

All GET requests happen in server components. Pages call services directly (not tRPC), pass results as required `initialData` props to client components, which pass them into `useQuery({ initialData })` — no loading skeleton on first render, TanStack Query takes over for re-fetches and post-mutation invalidation.

- Use `getSession()` from `lib/session.ts` (React `cache()` — one DB hit per request even if called in both proxy and page)
- Always `redirect("/sign-in")` if session is null — defense-in-depth even though proxy already guards
- Service functions called server-side must be exported from `packages/api/src/index.ts`
- Type `initialData` props using `RouterOutputs["router"]["procedure"]` and make them required

### Testing

Vitest with `vi.mock` and `vi.hoisted` — hoisted mocks are defined with `vi.hoisted()` so they're available inside `vi.mock` factories. DB is mocked with a chainable query builder mock; no real DB in unit tests. Queue modules are mocked via `vi.mock("../queues/index", ...)`. Tests live next to the code they test (`*.test.ts`).

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

**Module imports**
- Never use `.js` extensions on relative imports (e.g. `from "./auth"` not `from "./auth.js"`). The root tsconfig uses `moduleResolution: "bundler"` — Turbopack resolves imports literally and does not remap `.js` → `.ts`.

**Form feedback**
- Field validation errors (e.g. "Required") go under the input via `{errors.field && <p>...`
- Submission success and server errors go to Sonner: `toast.success(...)` in `onSuccess`, `toast.error(...)` in the `catch` block
- Never use `setError("root", ...)` or render `errors.root` in the JSX

**Type safety**
- No `any`, no type casts (`as Foo`, `as unknown as Foo`)
- Prefer enum values (Drizzle `pgEnum`, `z.enum`, or `as const` objects) over plain `string` for fields with a fixed set of values — e.g. `fitTier`, `jobStatus`, `platform`
- Reuse existing types and constants exported from workspace packages rather than redefining them inline
