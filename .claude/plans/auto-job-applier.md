# Plan: Auto Job Applier

> A web app that searches LinkedIn for jobs matching the user's criteria, scores them by fit, and automatically fills and submits applications on the user's behalf — with a full tracker UI.

## Research Summary

- **Stack:** Next.js 16.2.6 App Router (frontend only), Hono 4.x + `@hono/node-server` (backend, port 3001), TypeScript, tRPC v11.17, Drizzle ORM 0.45.2, PostgreSQL (Docker Compose), Better Auth 1.6.11, Vercel AI SDK 6.x + `@ai-sdk/google` 3.x (Gemini 2.5 Flash), Playwright 1.60, `@playwright/mcp` 0.0.75, Vitest 4.x, Zod 4.x, pnpm monorepo with Turborepo 2.9, shadcn 4.x
- **Relevant patterns:**
  - **Better Auth on Hono:** `app.on(["POST","GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))` — no special adapter; Better Auth uses web-standard Request/Response which Hono passes via `c.req.raw`
  - **tRPC on Hono:** `app.all("/trpc/*", (c) => fetchRequestHandler({ endpoint: "/trpc", req: c.req.raw, router: appRouter, createContext: () => createContext(c.req.raw) }))` — same fetch adapter as before
  - **CORS:** `hono/cors` middleware added to Hono server; allows `NEXT_PUBLIC_API_URL` origin
  - **Auth client baseURL:** points to `NEXT_PUBLIC_API_URL` (the Hono server), not the Next.js app
  - **tRPC client:** uses `NEXT_PUBLIC_API_URL + "/trpc"` as the endpoint; `import type { AppRouter }` from `@repo/api` (type-only — no DB connection in the web process)
  - tRPC v11 client uses TanStack Query v5 with `trpc.x.queryOptions()` syntax
  - **Forms:** `react-hook-form` + `@hookform/resolvers/zod` — `useForm<T>({ resolver: zodResolver(schema) })`; field errors via `errors.x.message`; server errors via `setError("root", ...)`; loading state via `isSubmitting`
  - Better Auth Drizzle adapter: `drizzleAdapter(db, { provider: "pg", usePlural: true })`
  - Vercel AI SDK multi-step agent: `generateText({ tools, maxSteps })` where tools come from `experimental_createMCPClient` (Playwright MCP)
  - Playwright MCP (`@playwright/mcp`) provides `browser_navigate`, `browser_snapshot`, `browser_fill`, `browser_click`, `browser_select_option`, `browser_press_key`
  - Playwright used directly (not via MCP) in `packages/automation` for job scraping only
  - **Next.js 16:** `proxy.ts` for edge route protection; caching opt-in via `use cache`; all async APIs
  - Turborepo one-way dependency: apps depend on packages, packages never depend on apps
- **Key files:**
  - `apps/web/` — Next.js frontend only (no API route handlers for auth or tRPC)
  - `apps/server/` — Hono server: Better Auth + tRPC, port 3001
  - `packages/api/` — all tRPC routers + business logic + Better Auth config
  - `packages/db/` — Drizzle schema, migrations, db connection
  - `packages/automation/` — Playwright LinkedIn scraper
  - `packages/ai/` — Gemini agent (form analysis + field mapping)
- **New dependencies:**
  - `hono`, `@hono/node-server` (in `apps/server`)
  - `better-auth`, `@better-auth/drizzle-adapter`
  - `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `pg`, `@types/pg`
  - `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query`
  - `ai`, `@ai-sdk/google`
  - `playwright`, `@playwright/mcp`
  - `zod`, `vitest`
  - `react-hook-form`, `@hookform/resolvers` (in `apps/web`)
- **Env vars:**
  - `apps/server/.env`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (=`http://localhost:3001`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_ORIGIN`, `GEMINI_API_KEY`, `LINKEDIN_ENCRYPTION_KEY`
  - `apps/web/.env.local`: `NEXT_PUBLIC_API_URL` (=`http://localhost:3001`)
  - `packages/db/.env`: `DATABASE_URL` (for drizzle-kit `generate`/`migrate` commands)
  - Root `.env`: no longer exists — Docker Compose uses built-in `:-applied` defaults
- **Risks/Considerations:**
  - LinkedIn ToS: Playwright scraping violates LinkedIn ToS; user accepts this risk
  - LinkedIn anti-bot: expect CAPTCHAs and rate limits in production; MVP known limitation
  - LinkedIn credentials: stored encrypted (AES-256-GCM) in `profiles` table; never logged
  - Long-running Playwright ops: fire-and-forget async from tRPC handler works for local MVP; needs a queue before production
  - Gemini free tier: 15 RPM — serialize apply calls, don't parallelize

---

## Tasks

### Phase 0: Monorepo Scaffold

#### 0.1. [x] Init Turborepo + pnpm workspace
- **What:** Bootstrap the monorepo root with `pnpm dlx create-turbo@latest`, configure `pnpm-workspace.yaml`, root `tsconfig.json` (base config extended by all packages), and `turbo.json` with `build`, `typecheck`, `lint`, `format`, `test`, `dev` tasks. Set `"packageManager": "pnpm@9"` in root `package.json`. Install `@biomejs/biome` as a root devDependency and add `biome.json` at the repo root.
- **Files:** `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, `package.json`, `biome.json`
- **Verify:** `pnpm install` succeeds from root; `biome check .` exits 0

#### 0.2. [x] Create package skeletons
- **What:** Scaffold four packages (`packages/db`, `packages/api`, `packages/automation`, `packages/ai`) each with a `package.json`, `tsconfig.json` extending root, and empty `src/index.ts`.
- **Files:** `packages/*/package.json`, `packages/*/tsconfig.json`, `packages/*/src/index.ts`
- **Verify:** `pnpm install` resolves all workspace packages; `tsc --noEmit` passes from each package

#### 0.3. [x] Bootstrap Next.js app
- **What:** `apps/web/` is a Next.js 16 App Router app with shadcn (New York, zinc). `@repo/api` is listed as a dep for type imports only — no runtime DB connection runs in the web process.
- **Files:** `apps/web/`
- **Verify:** `pnpm --filter web dev` starts on port 3000

#### 0.4. [x] Docker Compose for PostgreSQL
- **What:** `docker-compose.yml` with `postgres:16` on port 5432. Uses `:-applied` defaults so no root `.env` is needed.
- **Files:** `docker-compose.yml`
- **Verify:** `docker compose up -d` starts postgres

#### 0.5. [x] Bootstrap Hono server
- **What:** Create `apps/server/` with `package.json` (name `server`, scripts: `dev: tsx watch src/index.ts`, `build: tsc`), `tsconfig.json` extending root, and a stub `src/index.ts` that starts a Hono app on port 3001. Add `hono`, `@hono/node-server`, `tsx` as dependencies. Add `@repo/api` as `workspace:*` dependency. Register `apps/server` in `pnpm-workspace.yaml` if not already covered by the `apps/*` glob.
- **Files:** `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/src/index.ts`
- **Verify:** `pnpm --filter server dev` starts and `curl http://localhost:3001/health` returns 200

---

### Phase 1: Database Schema

#### 1.1. [x] Drizzle config + connection
- **What:** `packages/db` has `drizzle.config.ts`, `src/db.ts` (pg.Pool + Drizzle), `src/env.ts` (Zod-validated `DATABASE_URL`).
- **Files:** `packages/db/drizzle.config.ts`, `packages/db/src/db.ts`, `packages/db/src/env.ts`
- **Verify:** `pnpm --filter @repo/db exec tsc --noEmit` passes

#### 1.2. [x] Better Auth tables schema
- **What:** `packages/db/src/schema/auth.ts` has `users`, `sessions`, `accounts`, `verifications` matching Better Auth's generated output exactly (with `usePlural: true` naming, `$onUpdate` on timestamps, indexes matching generated names).
- **Files:** `packages/db/src/schema/auth.ts`
- **Verify:** Schema compiles; matches `auth@latest generate` output

#### 1.3. [x] App tables schema
- **What:** `profiles`, `job_criteria`, `jobs` tables with enums (`platform`, `fit_tier`, `job_status`).
- **Files:** `packages/db/src/schema/profiles.ts`, `packages/db/src/schema/job-criteria.ts`, `packages/db/src/schema/jobs.ts`, `packages/db/src/schema/index.ts`
- **Verify:** `tsc --noEmit` passes; `drizzle-kit generate` produces valid SQL

#### 1.4. [x] Run initial migration
- **What:** Single clean migration applied to local Docker Postgres. All 7 tables confirmed.
- **Files:** `packages/db/drizzle/0000_bent_human_fly.sql`
- **Verify:** `psql $DATABASE_URL -c "\dt"` shows all 7 tables

---

### Phase 2: Authentication

#### 2.1. [x] Better Auth server config
- **What:** `packages/api/src/auth.ts` configures `betterAuth` with the Drizzle adapter (`usePlural: true`), `emailAndPassword: { enabled: true }`, Google OAuth, and `accountLinking`. Export only `auth` (not `toNextJsHandler` — the Hono server calls `auth.handler(c.req.raw)` directly). `packages/api/src/env.ts` validates `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Replaces previous build:** `packages/api/src/auth.ts` — remove the `toNextJsHandler` import and export; keep everything else. `packages/api/src/index.ts` — remove the `toNextJsHandler` re-export.
- **Files:** `packages/api/src/auth.ts`, `packages/api/src/index.ts`
- **Verify:** `tsc --noEmit` passes in `packages/api`; no `toNextJsHandler` references remain

#### 2.2. [x] Remove Next.js auth route handler
- **What:** Delete `apps/web/app/api/auth/[...all]/route.ts` — auth is now served from the Hono server. Remove `DATABASE_URL` from `apps/web/.env.local` (web no longer connects to DB directly). Replace `NEXT_PUBLIC_BETTER_AUTH_URL` with `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` and `apps/web/lib/env.ts`.
- **Files:** `apps/web/app/api/auth/[...all]/route.ts` (delete), `apps/web/.env.local`, `apps/web/lib/env.ts`
- **Verify:** `apps/web/app/api/auth/` directory no longer exists; `grep -r "NEXT_PUBLIC_BETTER_AUTH_URL" apps/web` returns no matches

#### 2.3. [x] Hono server with Better Auth
- **What:** In `apps/server/src/index.ts`, add `hono/cors` middleware (allowing `NEXT_PUBLIC_API_URL` origin, credentials: true), mount Better Auth at `/api/auth/*` via `app.on(["POST","GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))`. Add `apps/server/.env.local` with `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3001`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`. Add a `src/env.ts` in `apps/server` with Zod validation for these vars.
- **Files:** `apps/server/src/index.ts`, `apps/server/src/env.ts`, `apps/server/.env.local`
- **Verify:** `curl http://localhost:3001/api/auth/get-session` returns `{"session":null}` (unauthenticated)

#### 2.4. [x] Auth client update
- **What:** Update `apps/web/lib/auth-client.ts` to use `NEXT_PUBLIC_API_URL` from `apps/web/lib/env.ts` as `baseURL`. Update `apps/web/lib/env.ts` to validate `NEXT_PUBLIC_API_URL` (replacing `NEXT_PUBLIC_BETTER_AUTH_URL`). Update `apps/web/proxy.ts` to check the Better Auth session against the Hono server URL.
- **Replaces previous build:** `apps/web/lib/auth-client.ts` — change `baseURL` env var. `apps/web/lib/env.ts` — rename schema field. `apps/web/proxy.ts` — update server URL if hardcoded.
- **Files:** `apps/web/lib/auth-client.ts`, `apps/web/lib/env.ts`, `apps/web/proxy.ts`
- **Verify:** Visiting `/jobs` (protected) redirects to `/sign-in`

#### 2.5. [x] Sign-in and sign-up pages
- **What:** `app/(auth)/sign-in/page.tsx` and `app/(auth)/sign-up/page.tsx` using shadcn `Card`, `Input`, `Button`. Email/password + Google OAuth via `authClient`. Forms use `react-hook-form` + `zodResolver`; field errors inline, server errors via `setError("root", ...)`.
- **Files:** `apps/web/app/(auth)/sign-in/page.tsx`, `apps/web/app/(auth)/sign-up/page.tsx`
- **Verify:** Can create account, sign in; session cookie set; redirected to `/jobs`

#### 2.6. [x] Auth tests
- **What:** Vitest unit tests in `packages/api` mocking `auth.api.getSession`.
- **Files:** `packages/api/src/auth.test.ts`
- **Verify:** `pnpm --filter @repo/api test` passes

---

### Phase 3: tRPC Infrastructure

#### 3.1. [x] tRPC init + context
- **What:** Install `@trpc/server`, `zod` in `packages/api`. Create `packages/api/src/trpc.ts` with `initTRPC.context<Context>().create()`, exporting `router`, `publicProcedure`, `protectedProcedure` (throws `UNAUTHORIZED` if no session). Create `packages/api/src/context.ts` exporting `createContext(req: Request)` which reads the Better Auth session and attaches `db` and `session`.
- **Files:** `packages/api/src/trpc.ts`, `packages/api/src/context.ts`
- **Verify:** `tsc --noEmit` passes; context type includes `db` and `session | null`

#### 3.2. [x] Root router
- **What:** Create `packages/api/src/router.ts` composing all sub-routers into `appRouter` with a `health` stub (`publicProcedure.query(() => "ok")`). Export `AppRouter` type. Re-export from `packages/api/src/index.ts`.
- **Files:** `packages/api/src/router.ts`, `packages/api/src/index.ts`
- **Verify:** `tsc --noEmit` passes; `AppRouter` type is importable

#### 3.3. [x] tRPC HTTP handler on Hono
- **What:** In `apps/server/src/index.ts`, mount tRPC via `fetchRequestHandler` from `@trpc/server/adapters/fetch`: `app.all("/trpc/*", (c) => fetchRequestHandler({ endpoint: "/trpc", req: c.req.raw, router: appRouter, createContext: () => createContext(c.req.raw) }))`. Install `@trpc/server` in `apps/server`.
- **Files:** `apps/server/src/index.ts`, `apps/server/package.json`
- **Verify:** `curl "http://localhost:3001/trpc/health"` returns `{"result":{"data":"ok"}}`

#### 3.4. [x] tRPC client + React Query provider
- **What:** Install `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query` in `apps/web`. Create `apps/web/lib/trpc.ts` with `createTRPCReact<AppRouter>()` — use `import type { AppRouter }` from `@repo/api` (type-only, no DB bundled). HTTP link points to `env.NEXT_PUBLIC_API_URL + "/trpc"`. Create `TRPCProvider` client component wrapping `QueryClientProvider` + `trpc.Provider`. Mount in `apps/web/app/layout.tsx`.
- **Files:** `apps/web/lib/trpc.ts`, `apps/web/app/layout.tsx`
- **Verify:** No TypeScript errors; client components can import `trpc` and see typed procedures

---

### Phase 4: Profile Feature

#### 4.1. Profile tRPC router
- **What:** Create `packages/api/src/routers/profile.ts` with three `protectedProcedure`s:
  - `getProfile` — fetch profile + job criteria for current user
  - `upsertProfile` — insert-or-update `profiles` row; Zod-validated; encrypts LinkedIn credentials
  - `upsertCriteria` — insert-or-update `jobCriteria` row
- **Files:** `packages/api/src/routers/profile.ts`
- **Verify:** `tsc --noEmit` passes; Zod schemas reject invalid inputs

#### 4.2. Encryption utility
- **What:** `packages/api/src/lib/encrypt.ts` with AES-256-GCM `encrypt`/`decrypt`. Key from `LINKEDIN_ENCRYPTION_KEY` env var. Format: `iv:authTag:ciphertext` hex.
- **Files:** `packages/api/src/lib/encrypt.ts`
- **Verify:** Round-trip `decrypt(encrypt("hello")) === "hello"`; wrong key throws

#### 4.3. Profile setup UI
- **What:** `apps/web/app/(dashboard)/profile/page.tsx` — multi-tab form: Personal details, Resume, Cover Letter, Job Criteria, LinkedIn Credentials. Calls `trpc.profile.upsertProfile.useMutation` and `trpc.profile.upsertCriteria.useMutation`.
- **Files:** `apps/web/app/(dashboard)/profile/page.tsx`, `apps/web/components/profile/profile-form.tsx`, `apps/web/components/profile/criteria-form.tsx`
- **Verify:** Form pre-populates from `getProfile`; saving persists to DB

#### 4.4. Profile tests
- **What:** Vitest unit tests for profile router and encrypt utility.
- **Files:** `packages/api/src/routers/profile.test.ts`, `packages/api/src/lib/encrypt.test.ts`
- **Verify:** `pnpm --filter @repo/api test` passes

---

### Phase 5: Job Search + Matching

#### 5.1. Playwright browser manager
- **What:** `packages/automation/src/browser.ts` — `BrowserManager` singleton with lazy headless Chromium launch.
- **Files:** `packages/automation/src/browser.ts`, `packages/automation/package.json`
- **Verify:** Launches and closes Chromium without error

#### 5.2. LinkedIn login helper
- **What:** `packages/automation/src/linkedin/login.ts` — `loginToLinkedIn(page, email, password)`. Navigates to LinkedIn login, fills credentials, waits for `/feed`. Throws on CAPTCHA.
- **Files:** `packages/automation/src/linkedin/login.ts`
- **Verify:** With valid credentials, lands on feed; wrong password throws

#### 5.3. LinkedIn job scraper
- **What:** `packages/automation/src/linkedin/scraper.ts` — `scrapeLinkedInJobs(page, criteria)`. Paginates up to 3 pages, extracts title/company/location/url/description. 1–2s delay between navigations.
- **Files:** `packages/automation/src/linkedin/scraper.ts`, `packages/automation/src/types.ts`
- **Verify:** Returns array with non-empty `title`, `company`, `url`, `description`

#### 5.4. Rule-based job scorer
- **What:** `packages/automation/src/scorer.ts` — `scoreJob(job, criteria): FitTier`. Thresholds: ≥7 strong, 3–6 potential, <3 weak.
- **Files:** `packages/automation/src/scorer.ts`
- **Verify:** Unit tests confirm all three tiers and edge cases

#### 5.5. Search tRPC procedure
- **What:** `packages/api/src/routers/jobs.ts` — `search` mutation: fetch criteria, decrypt creds, scrape, score, bulk-insert, return `{ queued: true }` immediately (fire-and-forget).
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** Returns `{ queued: true }` immediately; rows appear after async scrape

#### 5.6. Job search + scorer tests
- **What:** Vitest unit tests for scorer and jobs.search router (mocked browser/scraper).
- **Files:** `packages/automation/src/scorer.test.ts`, `packages/api/src/routers/jobs.test.ts`
- **Verify:** `pnpm test` passes for both packages

---

### Phase 6: Job Dashboard UI

#### 6.1. Jobs list tRPC procedures
- **What:** Add `list` query and `updateStatus` mutation to `packages/api/src/routers/jobs.ts`.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** `list` returns typed array; wrong status on `updateStatus` throws `BAD_REQUEST`

#### 6.2. Jobs dashboard layout
- **What:** `apps/web/app/(dashboard)/jobs/page.tsx` — shadcn `Tabs` (Pending/Applied/Failed/Skipped) with "Search Jobs" button.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`, `apps/web/components/jobs/job-tabs.tsx`
- **Verify:** Tabs render; Search Jobs triggers mutation; pending jobs appear

#### 6.3. Job card component
- **What:** `apps/web/components/jobs/job-card.tsx` — company, title, location, platform badge, fitTier badge, Apply/Skip buttons.
- **Files:** `apps/web/components/jobs/job-card.tsx`
- **Verify:** fitTier badge correct color; Skip updates status

#### 6.4. Apply selection + trigger
- **What:** Multi-select checkboxes on Pending tab, "Apply to Selected (N)" button calling `trpc.jobs.apply.useMutation`.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`, `apps/web/components/jobs/job-tabs.tsx`
- **Verify:** Correct `jobIds` sent; toast appears

---

### Phase 7: Auto Apply Agent

#### 7.1. Gemini + Playwright MCP setup
- **What:** `packages/ai/src/gemini.ts` (Gemini 2.5 Flash model) and `packages/ai/src/mcp.ts` (`createPlaywrightMCPClient()` via `experimental_createMCPClient` + `Experimental_StdioMCPTransport`).
- **Files:** `packages/ai/src/gemini.ts`, `packages/ai/src/mcp.ts`, `packages/ai/package.json`
- **Verify:** `client.tools()` returns non-empty object with `browser_navigate` and `browser_snapshot`

#### 7.2. Apply agent orchestrator
- **What:** `packages/ai/src/agents/apply-agent.ts` — `applyToJob(job, profile)`. Spawns MCP client, calls `generateText` (maxSteps: 30), parses `SUCCESS`/`FAILURE:<reason>` sentinel, always closes client.
- **Files:** `packages/ai/src/agents/apply-agent.ts`, `packages/ai/src/index.ts`
- **Verify:** `tsc --noEmit` passes; `client.close()` called on error

#### 7.3. LinkedIn Easy Apply flow guidance
- **What:** Extend `apply-agent.ts` system prompt with Easy Apply detection and multi-step modal navigation instructions.
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** Prompt detects "Easy Apply" at runtime via `browser_snapshot`

#### 7.4. Apply tRPC procedure wiring
- **What:** Add `apply` mutation to `packages/api/src/routers/jobs.ts`. Validates ownership + `pending_review` status, returns `{ queued: true }`, async-updates status after `applyToJob`.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** Returns `{ queued: true }`; foreign jobIds throw `FORBIDDEN`

#### 7.5. Apply agent tests
- **What:** Vitest tests for apply-agent and jobs.apply router.
- **Files:** `packages/ai/src/agents/apply-agent.test.ts`, `packages/api/src/routers/jobs.test.ts`
- **Verify:** `pnpm test` passes across all packages

---

### Phase 8: Polish + Integration

#### 8.1. Navigation shell
- **What:** `apps/web/app/(dashboard)/layout.tsx` — sidebar with nav links, user avatar, sign-out.
- **Files:** `apps/web/app/(dashboard)/layout.tsx`, `apps/web/components/nav/sidebar.tsx`
- **Verify:** Sidebar renders; sign-out redirects to `/sign-in`

#### 8.2. Loading + empty states
- **What:** Skeleton loaders and empty state components for the jobs list.
- **Files:** `apps/web/components/jobs/job-list-skeleton.tsx`, `apps/web/components/jobs/empty-state.tsx`
- **Verify:** Skeleton renders while loading

#### 8.3. Status polling
- **What:** `refetchInterval: 3000` on `jobs.list` while processing is in flight.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`
- **Verify:** Job statuses update without manual refresh

#### 8.4. CLAUDE.md
- **What:** Run `/init` to generate `CLAUDE.md` documenting monorepo structure, how to run both servers locally, env vars, migration workflow.
- **Files:** `CLAUDE.md`
- **Verify:** File accurately describes the project

---

## Notes

- **LinkedIn ToS:** Scraping and automated form submission violates LinkedIn's Terms of Service. Known, accepted risk.

- **LinkedIn credential storage:** AES-256-GCM for MVP. Use a secrets manager before public deployment.

- **Hono server separation:** `apps/server` owns all backend logic (Better Auth, tRPC, DB access). `apps/web` is purely frontend — `@repo/api` is imported type-only (`import type { AppRouter }`) so no DB pool is created in the Next.js process.

- **Next.js 16 `proxy.ts`:** Edge route protection middleware. Checks Better Auth session cookie and redirects unauthenticated requests to `/sign-in` for `/(dashboard)` routes. Calls the Hono server (`NEXT_PUBLIC_API_URL`) for session validation.

- **CORS:** Hono server must allow `http://localhost:3000` origin with `credentials: true` so the browser can send cookies cross-origin.

- **Fire-and-forget:** Long-running Playwright ops (scrape, apply) are fire-and-forget from the Hono tRPC handler. Works for local MVP; migrate to a queue (pg-boss) before deploying to hosted environments.

- **Gemini free tier rate limit:** 15 RPM on `gemini-2.5-flash`. Apply procedure serializes jobs sequentially.

- **`packages/ai` vs `packages/automation` boundary:** `packages/ai` owns AI-driven form filling via MCP. `packages/automation` owns deterministic scraping via direct Playwright.

- **2026-05-22 — Revision:** Swapped backend from Next.js route handlers to a separate Hono server (`apps/server`, port 3001). Added task 0.5 (Hono scaffold), replaced task 2.2 (Next.js auth route → cleanup + new Hono auth task), added task 2.4 (auth client update). Task 3.3 now mounts tRPC on Hono instead of Next.js. `apps/web` is frontend-only.

- **2026-05-22 — Env architecture:** Each package owns its own `.env`. `apps/server/.env` holds all server runtime vars. `packages/db/.env` holds `DATABASE_URL` for drizzle-kit. `apps/web/.env.local` holds `NEXT_PUBLIC_API_URL`. Root `.env` deleted — Docker Compose relies on `:-applied` defaults. `dotenv-cli` removed from root `package.json`; root scripts now call `turbo run <task>` directly. Per-package `turbo.json` files in `apps/server` and `packages/db` declare task-level env vars instead of a root `globalEnv`.
