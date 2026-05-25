# Plan: Auto Job Applier

> A web app that searches LinkedIn for jobs matching the user's criteria, scores them by fit, and automatically fills and submits applications on the user's behalf — with a full tracker UI.

## Research Summary

- **Stack:** Next.js 16.2.6 App Router (frontend + API routes), TypeScript, tRPC v11.17, Drizzle ORM 0.45.2, PostgreSQL + Redis (Docker Compose), Better Auth 1.6.11, Vercel AI SDK 6.x + `@ai-sdk/google` 3.x (Gemini 2.5 Flash), Playwright 1.60, `@playwright/mcp` 0.0.75, BullMQ, Vitest 4.x, Zod 4.x, pnpm monorepo with Turborepo 2.9, shadcn 4.x
- **Relevant patterns:**
  - **Better Auth on Next.js App Router:** `apps/web/app/api/auth/[...all]/route.ts` exports `export const GET = auth.handler` and `export const POST = auth.handler` directly — no adapter needed; `auth.handler` accepts web-standard `Request` and returns `Response`, which Next.js App Router passes through unchanged
  - **tRPC on Next.js App Router:** `apps/web/app/api/trpc/[trpc]/route.ts` uses `fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter, createContext: () => createContext(req) })`. Export `GET` and `POST`. tRPC client uses relative `/api/trpc` endpoint — no env var needed
  - **BullMQ queues:** Queue instances (`searchQueue`, `applyQueue`) and TypeScript job data types (`SearchJobData`, `ApplyJobData`) defined in `packages/api/src/queues/index.ts` — single source of truth imported by both the tRPC routers (enqueue) and `apps/worker` (consume). Redis connection string from `REDIS_URL` env var
  - **tRPC client:** uses `/api/trpc` as `httpBatchLink` endpoint (relative, same-origin — no `NEXT_PUBLIC_API_URL` needed); `import type { AppRouter }` from `@repo/api` (type-only — no DB connection in the web process)
  - tRPC v11 client uses TanStack Query v5 with `trpc.x.queryOptions()` syntax
  - **Forms:** `react-hook-form` + `@hookform/resolvers/zod` — `useForm<T>({ resolver: zodResolver(schema) })`; field errors via `errors.x.message`; server errors via `setError("root", ...)`; loading state via `isSubmitting`
  - Better Auth Drizzle adapter: `drizzleAdapter(db, { provider: "pg", usePlural: true })`
  - Vercel AI SDK multi-step agent: `generateText({ tools, maxSteps })` where tools come from `experimental_createMCPClient` (Playwright MCP)
  - Playwright MCP (`@playwright/mcp`) provides `browser_navigate`, `browser_snapshot`, `browser_fill`, `browser_click`, `browser_select_option`, `browser_press_key`
  - Playwright used directly (not via MCP) in `packages/automation` for job scraping only
  - **Next.js 16:** `proxy.ts` for edge route protection; caching opt-in via `use cache`; all async APIs
  - Turborepo one-way dependency: apps depend on packages, packages never depend on apps
- **Key files:**
  - `apps/web/` — Next.js frontend + API routes (`/api/auth/*`, `/api/trpc/*`)
  - `apps/worker/` — BullMQ worker app consuming search and apply queues
  - `packages/api/` — all tRPC routers + business logic + Better Auth config + BullMQ queue definitions
  - `packages/db/` — Drizzle schema, migrations, db connection
  - `packages/automation/` — Playwright LinkedIn scraper
  - `packages/ai/` — Gemini agent (form analysis + field mapping)
- **New dependencies:**
  - `better-auth`, `@better-auth/drizzle-adapter`
  - `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `pg`, `@types/pg`
  - `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query`
  - `ai`, `@ai-sdk/google`
  - `playwright`, `@playwright/mcp`
  - `bullmq` (in `packages/api` and `apps/worker`)
  - `zod`, `vitest`
  - `react-hook-form`, `@hookform/resolvers` (in `apps/web`)
- **Env vars:**
  - `apps/web/.env.local`: `NEXT_PUBLIC_BASE_URL` (=`http://localhost:3000`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (=`http://localhost:3000`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `LINKEDIN_ENCRYPTION_KEY`, `REDIS_URL` (=`redis://localhost:6379`); loaded by Next.js automatically
  - `apps/worker/.env`: `DATABASE_URL`, `REDIS_URL`, `GEMINI_API_KEY`, `LINKEDIN_ENCRYPTION_KEY`; loaded via `tsx --env-file apps/worker/.env`
  - `packages/db/.env`: `DATABASE_URL`; loaded by drizzle-kit automatically for `generate`/`migrate`
- **Env validation pattern:** each package's `src/env.ts` validates only the vars its own code uses (`packages/db` → `DATABASE_URL`, `packages/api` → auth + LinkedIn + `REDIS_URL`, `packages/ai` → `GEMINI_API_KEY`, `apps/web/lib/env.ts` → `NEXT_PUBLIC_BASE_URL`). Loading is handled by the entry point (Next.js auto-loads `.env.local`; `tsx --env-file` for the worker; drizzle-kit for DB).
- **Turborepo env keys:** runtime secrets use `passThroughEnv` (available to task, not hashed). `NEXT_PUBLIC_*` vars in `apps/web` are auto-inferred by Turbo's Next.js framework detection.
- **Risks/Considerations:**
  - LinkedIn ToS: Playwright scraping violates LinkedIn ToS; user accepts this risk
  - LinkedIn anti-bot: expect CAPTCHAs and rate limits in production; MVP known limitation
  - LinkedIn credentials: stored encrypted (AES-256-GCM) in `profiles` table; never logged
  - Worker crash resilience: BullMQ jobs persist in Redis; failed jobs are retried. Worker must update job status in DB before returning so the frontend reflects the outcome
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

#### 0.5. [x] Cleanup: Delete apps/server
- **What:** Delete the entire `apps/server/` directory — the Hono server is replaced by Next.js API routes. Remove any `apps/server` entries from `turbo.json` pipeline and `pnpm-workspace.yaml` if not covered by the `apps/*` glob.
- **Files:** `apps/server/` (delete entire directory), `turbo.json`, `pnpm-workspace.yaml`
- **Verify:** `ls apps/server/` returns "No such file or directory"; `grep -r "apps/server" turbo.json` returns no matches

#### 0.6. [x] Add Redis to Docker Compose
- **What:** Add a `redis:7-alpine` service to `docker-compose.yml` on port 6379. Add `REDIS_URL=redis://localhost:6379` to `apps/web/.env.local` and `apps/worker/.env`.
- **Files:** `docker-compose.yml`, `apps/web/.env.local`, `apps/worker/.env`
- **Verify:** `docker compose up -d` starts both postgres and redis; `redis-cli ping` returns `PONG`

#### 0.7. [x] Bootstrap apps/worker
- **What:** Create `apps/worker/` with `package.json` (name `@repo/worker`, scripts: `dev: tsx watch src/index.ts`), `tsconfig.json` extending root, stub `src/index.ts`. Add `@repo/api`, `@repo/ai`, `@repo/db` as `workspace:*` dependencies and `tsx` as devDependency. Add `@repo/worker` to the Turborepo `dev` pipeline in `turbo.json`.
- **Files:** `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/index.ts`, `turbo.json`
- **Verify:** `pnpm --filter @repo/worker dev` starts without error

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
- **What:** `packages/api/src/auth.ts` configures `betterAuth` with the Drizzle adapter (`usePlural: true`), `emailAndPassword: { enabled: true }`, Google OAuth, and `accountLinking`. Export only `auth` — Next.js API route calls `auth.handler` directly. `packages/api/src/env.ts` validates `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Files:** `packages/api/src/auth.ts`, `packages/api/src/index.ts`
- **Verify:** `tsc --noEmit` passes in `packages/api`

#### 2.2. [x] Add Next.js auth route handler
- **What:** Re-create `apps/web/app/api/auth/[...all]/route.ts` — this file was deleted in a previous build and must be restored. Export `GET` and `POST` using `auth.handler` from `@repo/api` directly (`export const GET = auth.handler; export const POST = auth.handler`). No adapter needed — `auth.handler` accepts web-standard `Request` and returns `Response`. Add server-side env vars to `apps/web/.env.local`: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3000`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `LINKEDIN_ENCRYPTION_KEY`.
- **Replaces previous build:** `apps/web/app/api/auth/[...all]/route.ts` was deleted — re-create it.
- **Files:** `apps/web/app/api/auth/[...all]/route.ts`, `apps/web/.env.local`
- **Verify:** `curl http://localhost:3000/api/auth/get-session` returns `{"session":null}`

#### 2.3. [x] Update auth client + sweep NEXT_PUBLIC_API_URL
- **What:** Update `apps/web/lib/auth-client.ts` to set `baseURL` to `http://localhost:3000` (Next.js, same process — not the old Hono URL). Remove `NEXT_PUBLIC_API_URL` from `apps/web/lib/env.ts` schema entirely. Remove all remaining references to `NEXT_PUBLIC_API_URL` across `apps/web` (env.ts, auth-client.ts, any other imports).
- **Replaces previous build:** `apps/web/lib/auth-client.ts` — change `baseURL` source. `apps/web/lib/env.ts` — remove `NEXT_PUBLIC_API_URL` field. `apps/web/.env.local` — remove `NEXT_PUBLIC_API_URL` line.
- **Files:** `apps/web/lib/auth-client.ts`, `apps/web/lib/env.ts`, `apps/web/.env.local`
- **Verify:** `grep -r "NEXT_PUBLIC_API_URL" apps/web` returns no matches; auth client initialises without error

#### 2.4. [x] Update proxy.ts for Next.js auth
- **What:** Update `apps/web/proxy.ts` to validate sessions against the Next.js auth endpoint (`http://localhost:3000/api/auth/get-session`, same origin) instead of the old Hono server URL. Remove the `NEXT_PUBLIC_API_URL` dependency from proxy.ts.
- **Replaces previous build:** `apps/web/proxy.ts` — update session check URL.
- **Files:** `apps/web/proxy.ts`
- **Verify:** Visiting `/jobs` unauthenticated redirects to `/sign-in`; authenticated requests pass through

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

#### 3.3. [x] tRPC HTTP handler on Next.js
- **What:** Create `apps/web/app/api/trpc/[trpc]/route.ts` using `fetchRequestHandler` from `@trpc/server/adapters/fetch`. Export `GET` and `POST`. Import `appRouter` and `createContext` from `@repo/api`. The Hono-based handler is gone with `apps/server` (task 0.5).
- **Replaces previous build:** tRPC was mounted on the Hono server (now deleted). Create the Next.js route handler instead.
- **Files:** `apps/web/app/api/trpc/[trpc]/route.ts`
- **Verify:** `curl "http://localhost:3000/api/trpc/health"` returns `{"result":{"data":"ok"}}`

#### 3.4. [x] tRPC client
- **What:** Update `apps/web/lib/trpc.ts` to use `/api/trpc` as the `httpBatchLink` endpoint (relative URL, same-origin — no env var required).
- **Replaces previous build:** `apps/web/lib/trpc.ts` — change endpoint from `env.NEXT_PUBLIC_API_URL + "/trpc"` to `"/api/trpc"`.
- **Files:** `apps/web/lib/trpc.ts`
- **Verify:** No TypeScript errors; `trpc.health.useQuery()` returns `"ok"` in the browser

---

### Phase 4: Profile Feature

#### 4.1. [x] Profile tRPC router
- **What:** `packages/api/src/routers/profile.ts` with `protectedProcedure`s split by tab: `getProfile`, `upsertPersonal`, `upsertResume`, `upsertCoverLetter`, `upsertLinkedIn`, `upsertCriteria`. Each validates and updates only its own fields.
  - `resume` — plain text (NOT NULL); stored in `profiles.resume`
  - `coverLetterInstructions` — optional free-text hints (nullable); stored in `profiles.cover_letter_instructions`
- **Files:** `packages/api/src/routers/profile.ts`, `packages/api/src/services/profile.service.ts`
- **Verify:** `tsc --noEmit` passes; Zod schemas reject invalid inputs

#### 4.2. [x] Encryption utility
- **What:** `packages/api/src/lib/encrypt.ts` with AES-256-GCM `encrypt`/`decrypt`. Key from `LINKEDIN_ENCRYPTION_KEY` env var. Format: `iv:authTag:ciphertext` hex.
- **Files:** `packages/api/src/lib/encrypt.ts`
- **Verify:** Round-trip `decrypt(encrypt("hello")) === "hello"`; wrong key throws

#### 4.3. [x] Profile setup UI
- **What:** `apps/web/app/(dashboard)/profile/page.tsx` — multi-tab form: Personal details, Resume, Cover Letter, Job Criteria, LinkedIn Credentials. Calls `trpc.profile.upsertProfile.useMutation` and `trpc.profile.upsertCriteria.useMutation`.
- **Files:** `apps/web/app/(dashboard)/profile/page.tsx`, `apps/web/components/profile/profile-form.tsx`, `apps/web/components/profile/criteria-form.tsx`
- **Verify:** Form pre-populates from `getProfile`; saving persists to DB

#### 4.4. [x] Profile tests
- **What:** Vitest unit tests for profile router and encrypt utility.
- **Files:** `packages/api/src/routers/profile.test.ts`, `packages/api/src/lib/encrypt.test.ts`
- **Verify:** `pnpm --filter @repo/api test` passes

---

### Phase 5: Job Search + Matching

#### 5.1. [x] Playwright browser manager
- **What:** `packages/automation/src/browser.ts` — `BrowserManager` singleton with lazy headless Chromium launch.
- **Files:** `packages/automation/src/browser.ts`, `packages/automation/package.json`
- **Verify:** Launches and closes Chromium without error

#### 5.2. [x] LinkedIn login helper
- **What:** `packages/automation/src/linkedin/login.ts` — `loginToLinkedIn(page, email, password)`. Navigates to LinkedIn login, fills credentials, waits for `/feed`. Throws on CAPTCHA.
- **Files:** `packages/automation/src/linkedin/login.ts`
- **Verify:** With valid credentials, lands on feed; wrong password throws

#### 5.3. [x] LinkedIn job scraper
- **What:** `packages/automation/src/linkedin/scraper.ts` — `scrapeLinkedInJobs(page, criteria)`. Paginates up to 3 pages, extracts title/company/location/url/description. 1–2s delay between navigations.
- **Files:** `packages/automation/src/linkedin/scraper.ts`, `packages/automation/src/types.ts`
- **Verify:** Returns array with non-empty `title`, `company`, `url`, `description`

#### 5.4. [x] Rule-based job scorer
- **What:** `packages/automation/src/scorer.ts` — `scoreJob(job, criteria): FitTier`. Thresholds: ≥7 strong, 3–6 potential, <3 weak.
- **Files:** `packages/automation/src/scorer.ts`
- **Verify:** Unit tests confirm all three tiers and edge cases

#### 5.5. [x] Search tRPC procedure
- **What:** Update `packages/api/src/routers/jobs.ts` `search` mutation to enqueue a job to `searchQueue` (from `packages/api/src/queues/`) instead of calling `runSearch` as fire-and-forget async. Return `{ queued: true }` immediately after enqueue.
- **Replaces previous build:** `packages/api/src/routers/jobs.ts` `search` mutation — replace `runSearch(...)` fire-and-forget with `searchQueue.add("search", { userId, criteria })`.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** Returns `{ queued: true }` immediately; a BullMQ job is visible in the queue

#### 5.6. [x] Job search + scorer tests
- **What:** Update `packages/api/src/routers/jobs.test.ts` to mock `searchQueue` from `packages/api/src/queues/` and assert `searchQueue.add` is called with the correct job data instead of asserting the scraper was called directly.
- **Replaces previous build:** `packages/api/src/routers/jobs.test.ts` — update mocks and assertions for the new enqueue pattern.
- **Files:** `packages/api/src/routers/jobs.test.ts`
- **Verify:** `pnpm --filter @repo/api vitest run` passes

---

### Phase 6: Job Dashboard UI

#### 6.1. [x] Jobs list tRPC procedures
- **What:** Add `list` query and `updateStatus` mutation to `packages/api/src/routers/jobs.ts`.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** `list` returns typed array; wrong status on `updateStatus` throws `BAD_REQUEST`

#### 6.2. [x] Jobs dashboard layout
- **What:** `apps/web/app/(dashboard)/jobs/page.tsx` — shadcn `Tabs` (Pending/Applied/Failed/Skipped) with "Search Jobs" button.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`, `apps/web/components/jobs/job-tabs.tsx`
- **Verify:** Tabs render; Search Jobs triggers mutation; pending jobs appear

#### 6.3. [x] Job card component
- **What:** `apps/web/components/jobs/job-card.tsx` — company, title, location, platform badge, fitTier badge, Apply/Skip buttons.
- **Files:** `apps/web/components/jobs/job-card.tsx`
- **Verify:** fitTier badge correct color; Skip updates status

#### 6.4. [x] Apply selection + trigger
- **What:** Multi-select checkboxes on Pending tab, "Apply to Selected (N)" button calling `trpc.jobs.apply.useMutation`.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`, `apps/web/components/jobs/job-tabs.tsx`
- **Verify:** Correct `jobIds` sent; toast appears

---

### Phase 7: Auto Apply Agent

#### 7.1. [x] Gemini + Playwright MCP setup
- **What:** `packages/ai/src/gemini.ts` (Gemini 2.5 Flash model) and `packages/ai/src/mcp.ts` (`createPlaywrightMCPClient()` via `experimental_createMCPClient` + `Experimental_StdioMCPTransport`).
- **Files:** `packages/ai/src/gemini.ts`, `packages/ai/src/mcp.ts`, `packages/ai/package.json`
- **Verify:** `client.tools()` returns non-empty object with `browser_navigate` and `browser_snapshot`

#### 7.2. [x] Apply agent orchestrator
- **What:** `packages/ai/src/agents/apply-agent.ts` — `applyToJob(job, profile, resumePdfPath)`. `resumePdfPath` is required (always generated by `processApplyJob` before this call). Spawns MCP client, calls `generateText` (stopWhen: stepCountIs(30)), parses `SUCCESS`/`FAILURE:<reason>` sentinel, always closes client.
- **Files:** `packages/ai/src/agents/apply-agent.ts`, `packages/ai/src/index.ts`
- **Verify:** `tsc --noEmit` passes; `client.close()` called on error

#### 7.3. [x] LinkedIn Easy Apply flow guidance + cover letter + PDF upload
- **What:** System prompt covers: Easy Apply detection, multi-step modal navigation, personalised cover letter per job (uses `coverLetterInstructions` if provided), PDF resume upload via `browser_file_chooser` when a file upload field appears and `resumePdfPath` is in context.
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** Prompt handles Easy Apply, cover letter generation, and file upload at runtime

#### 7.6. [x] Resume PDF generation
- **What:** `packages/ai/src/agents/generate-resume-pdf.ts` — `generateResumePdf(resumeText): Promise<string>`. Renders plain-text resume as HTML in a headless Playwright page, exports to a temp file via `page.pdf()`, returns the path. Called by `processApplyJob` before `applyToJob`.
- **Files:** `packages/ai/src/agents/generate-resume-pdf.ts`, `packages/ai/src/agents/process-apply.ts`
- **Verify:** Returns a valid PDF path; temp file exists on disk

#### 7.4. [x] Apply tRPC procedure wiring
- **What:** Update `packages/api/src/routers/jobs.ts` `apply` mutation to enqueue one job per `jobId` to `applyQueue` (from `packages/api/src/queues/`) instead of calling `applyToJob` as fire-and-forget async. Validate ownership + `pending_review` status before enqueuing. Return `{ queued: true }`.
- **Replaces previous build:** `packages/api/src/routers/jobs.ts` `apply` mutation — replace per-job `applyToJob(...)` fire-and-forget with `applyQueue.add("apply", { jobId, userId })`.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** Returns `{ queued: true }`; foreign jobIds throw `FORBIDDEN`; jobs appear in BullMQ apply queue

#### 7.5. [x] Apply agent tests
- **What:** Update `packages/api/src/routers/jobs.test.ts` to mock `applyQueue` from `packages/api/src/queues/` and assert `applyQueue.add` is called with correct job data per jobId.
- **Replaces previous build:** `packages/api/src/routers/jobs.test.ts` — update apply mutation mocks and assertions for the new enqueue pattern.
- **Files:** `packages/api/src/routers/jobs.test.ts`
- **Verify:** `pnpm --filter @repo/api vitest run` passes

---

### Phase 8: Polish + Integration

#### 8.1. [x] Navigation shell
- **What:** `apps/web/app/(dashboard)/layout.tsx` — sidebar with nav links, user avatar, sign-out.
- **Files:** `apps/web/app/(dashboard)/layout.tsx`, `apps/web/components/nav/sidebar.tsx`
- **Verify:** Sidebar renders; sign-out redirects to `/sign-in`

#### 8.2. [x] Loading + empty states
- **What:** Skeleton loaders and empty state components for the jobs list.
- **Files:** `apps/web/components/jobs/job-list-skeleton.tsx`, `apps/web/components/jobs/empty-state.tsx`
- **Verify:** Skeleton renders while loading

#### 8.3. [x] Status polling
- **What:** `refetchInterval: 3000` on `jobs.list` while processing is in flight.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`
- **Verify:** Job statuses update without manual refresh

#### 8.4. [x] CLAUDE.md
- **What:** Update `CLAUDE.md` to reflect the new architecture: Next.js API routes for tRPC and Better Auth, `apps/worker` BullMQ app, Redis in Docker Compose, removed Hono server. Update dev commands (`pnpm turbo dev --filter=worker` replaces `--filter=server`), env var table, and architecture diagram.
- **Replaces previous build:** `CLAUDE.md` — rewrite architecture section, dev commands, and env vars.
- **Files:** `CLAUDE.md`
- **Verify:** File accurately describes the new architecture

---

### Phase 9: BullMQ Queue + Worker

#### 9.1. [x] BullMQ queue definitions in packages/api
- **What:** Install `bullmq` in `packages/api`. Create `packages/api/src/queues/index.ts` defining `searchQueue` and `applyQueue` as BullMQ `Queue` instances connected via `REDIS_URL`. Export TypeScript job data types: `SearchJobData` (`{ userId: string; criteriaId: string }`) and `ApplyJobData` (`{ jobId: string; userId: string }`). Add `REDIS_URL` to `packages/api/src/env.ts` Zod validation. Add `REDIS_URL` to `packages/api` turbo `passThroughEnv`.
- **Files:** `packages/api/src/queues/index.ts`, `packages/api/src/env.ts`, `packages/api/package.json`
- **Verify:** `tsc --noEmit` passes in `packages/api`; queue instances connect to Redis without error

#### 9.2. [x] Worker: search job processor
- **What:** `apps/worker/src/workers/search.worker.ts` — BullMQ `Worker` consuming `searchQueue`. Fetches user criteria from DB, decrypts LinkedIn credentials, runs `packages/automation` scraper + scorer, bulk-inserts results to `jobs` table. Marks job complete on success, failed on error. Export the worker instance for graceful shutdown.
- **Files:** `apps/worker/src/workers/search.worker.ts`
- **Verify:** Enqueueing a search job via tRPC triggers scrape; rows appear in `jobs` table

#### 9.3. [x] Worker: apply job processor
- **What:** `apps/worker/src/workers/apply.worker.ts` — BullMQ `Worker` consuming `applyQueue`. Fetches job + profile from DB, calls `applyToJob(job, profile)` from `@repo/ai`, updates job status to `applied` or `failed` in DB based on the `SUCCESS`/`FAILURE` sentinel. Export the worker instance for graceful shutdown.
- **Files:** `apps/worker/src/workers/apply.worker.ts`
- **Verify:** Enqueueing an apply job triggers the Gemini agent; job status updates in DB

#### 9.4. [x] Worker entrypoint + dev script
- **What:** `apps/worker/src/index.ts` imports both worker instances and registers a `SIGTERM` handler that calls `worker.close()` on each before exiting. `apps/worker/.env` holds `DATABASE_URL`, `REDIS_URL`, `GEMINI_API_KEY`, `LINKEDIN_ENCRYPTION_KEY`; loaded via `tsx --env-file apps/worker/.env`. Add `REDIS_URL`, `GEMINI_API_KEY`, `LINKEDIN_ENCRYPTION_KEY` to `apps/worker` turbo `passThroughEnv`.
- **Files:** `apps/worker/src/index.ts`, `apps/worker/.env`, `apps/worker/package.json`
- **Verify:** `pnpm turbo dev --filter=@repo/worker` starts and processes queued jobs; `CTRL+C` shuts down gracefully without dropping in-progress jobs

---

### Phase 10: Locations Structure Refactor

#### 10.1. [x] Schema: change locations column to JSONB
- **What:** In `packages/db/src/schema/job-criteria.ts`, replace `locations: text("locations").array().notNull().default([])` with a JSONB column typed as `LocationEntry[]`. Define and export `WorkType = "on-site" | "remote" | "hybrid"` as a const and `LocationEntry = { location: string; workTypes: WorkType[] }`. Export both types from `packages/db/src/index.ts`. Edit the existing migration SQL in `packages/db/drizzle/0000_bent_human_fly.sql` in-place to change the `locations` column definition from `text[]` to `jsonb` (app is not deployed — no new migration needed). Reset the local DB with `docker compose down -v && docker compose up -d`, then run `pnpm migrate` to apply the updated migration cleanly.
- **Replaces previous build:** `packages/db/src/schema/job-criteria.ts` — change `locations` column. `packages/db/drizzle/0000_bent_human_fly.sql` — edit in-place.
- **Files:** `packages/db/src/schema/job-criteria.ts`, `packages/db/src/index.ts`, `packages/db/drizzle/0000_bent_human_fly.sql`
- **Verify:** `docker compose down -v && docker compose up -d && pnpm migrate` succeeds; `tsc --noEmit` passes in `packages/db`

#### 10.2. [x] Update criteria form for per-location work types + required field indicators
- **What:** Rewrite the location section of `apps/web/components/profile/criteria-form.tsx`. Each location entry is a `LocationEntry` object: a text input for the location name and three checkboxes for work types (`On-site`, `Remote`, `Hybrid`). New entries default to all three checked. Add/remove entries with a button. Also add required field indicators (`*`) to all required field labels in both `profile-form.tsx` (firstName, lastName, phone, address, resume, coverLetter) and `criteria-form.tsx` (jobTitles, skills, locations).
- **Replaces previous build:** `apps/web/components/profile/criteria-form.tsx` — rewrite location input section. `apps/web/components/profile/profile-form.tsx` — add `*` markers to required labels.
- **Files:** `apps/web/components/profile/criteria-form.tsx`, `apps/web/components/profile/profile-form.tsx`
- **Verify:** New location entry defaults to all three work types checked; can uncheck individual types; form submits `LocationEntry[]` to DB; required fields show `*`

#### 10.3. [x] Update scraper to consume LocationEntry[]
- **What:** Update the `criteria` parameter in `packages/automation/src/linkedin/scraper.ts` — change `locations: string[]` to `locations: LocationEntry[]`. Build one search pass per location entry; apply LinkedIn work-type filter params (`f_WT`: `1`=on-site, `2`=remote, `3`=hybrid) from each entry's `workTypes`. Import `LocationEntry` from `@repo/db`. Update `packages/automation/src/search.ts` to pass `criteriaRow.locations` (already `LocationEntry[]` after the schema change).
- **Replaces previous build:** `packages/automation/src/linkedin/scraper.ts` — update param type and URL construction. `packages/automation/src/search.ts` — no logic change needed if types align.
- **Files:** `packages/automation/src/linkedin/scraper.ts`, `packages/automation/src/search.ts`
- **Verify:** `tsc --noEmit` passes in `packages/automation`; each location entry produces a search URL with the correct `f_WT` values

---

### Phase 11: Search Readiness Guard

#### 11.1. [x] Server-side readiness check in search mutation
- **What:** At the top of the `search` mutation in `packages/api/src/routers/jobs.ts`, call `getProfileForUser` and `getJobCriteriaForUser` from `@repo/db`. Build a `missingFields: string[]` array by checking:
  - Profile (if row missing or field falsy): `"First name"`, `"Last name"`, `"Phone"`, `"Address"`, `"Resume"`, `"Cover letter"`, `"LinkedIn email"`, `"LinkedIn password"`
  - Criteria (if row missing or array empty): `"Job titles"`, `"Skills"`, `"Locations"`
  - If `missingFields.length > 0`, throw `new TRPCError({ code: "PRECONDITION_FAILED", message: missingFields.join(", ") })`
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** `tsc --noEmit` passes; calling `search` with an incomplete profile returns `PRECONDITION_FAILED` whose message lists the missing field names

#### 11.2. [x] UI readiness guard — disabled button + Sonner toast
- **What:** In the jobs UI, derive readiness from the `trpc.profile.getProfile.useQuery()` result. Compute `missingFields` using the same field list as the server (check profile fields + criteria arrays). Pass `disabled={missingFields.length > 0}` to the "Search Jobs" button. In `search.onError`, call `toast.error("Complete your profile first", { description: missingFields.join(", ") })` from Sonner. Also handle the `PRECONDITION_FAILED` case from the server as a fallback.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx` or `apps/web/components/jobs/job-tabs.tsx`
- **Verify:** Button is disabled when any required field is missing; hovering or clicking shows missing fields in a Sonner toast; button enables once all fields are filled

---

## Notes

- **LinkedIn ToS:** Scraping and automated form submission violates LinkedIn's Terms of Service. Known, accepted risk.

- **LinkedIn credential storage:** AES-256-GCM for MVP. Use a secrets manager before public deployment.

- **Next.js owns all HTTP:** `apps/web` serves the frontend, tRPC API (`/api/trpc/*`), and Better Auth (`/api/auth/*`) from the same Next.js process. No separate backend server.

- **BullMQ as the async boundary:** tRPC mutations enqueue jobs; the worker processes them. The frontend polls `jobs.list` at 3s intervals to pick up status changes written by the worker.

- **`packages/api` is the queue source of truth:** Queue instances and job data types live in `packages/api/src/queues/`. Both the Next.js app (enqueue) and `apps/worker` (consume) import from `@repo/api` — no type duplication.

- **Next.js 16 `proxy.ts`:** Edge route protection middleware. Checks the Better Auth session by calling `/api/auth/get-session` on the same Next.js origin and redirects unauthenticated requests to `/sign-in` for `/(dashboard)` routes.

- **Fire-and-forget replaced:** Long-running Playwright ops (scrape, apply) are now BullMQ jobs. Jobs persist in Redis; if the worker crashes mid-job, BullMQ retries automatically. Worker must write status to DB before completing so the frontend reflects the outcome.

- **Gemini free tier rate limit:** 15 RPM on `gemini-2.5-flash`. Apply worker processes jobs serially (one BullMQ worker concurrency = 1).

- **`packages/ai` vs `packages/automation` boundary:** `packages/ai` owns AI-driven form filling via MCP. `packages/automation` owns deterministic scraping via direct Playwright.

- **2026-05-22 — Revision:** Swapped backend from Next.js route handlers to a separate Hono server (`apps/server`, port 3001). Added task 0.5 (Hono scaffold), replaced task 2.2 (Next.js auth route → cleanup + new Hono auth task), added task 2.4 (auth client update). Task 3.3 now mounts tRPC on Hono instead of Next.js. `apps/web` is frontend-only.

- **2026-05-22 — Env architecture:** Each package owns its own `.env`. `apps/server/.env` holds all server runtime vars (loaded via `tsx --env-file .env`). `packages/db/.env` holds `DATABASE_URL` (auto-loaded by drizzle-kit). `apps/web/.env.local` holds `NEXT_PUBLIC_API_URL` (auto-loaded by Next.js). Root `.env` deleted. Each package's `src/env.ts` validates only what its own code uses; `packages/ai/src/env.ts` validates `GEMINI_API_KEY`. Per-package `turbo.json` files use `passThroughEnv` for runtime secrets (not hashed into cache key). `NEXT_PUBLIC_*` in `apps/web` auto-inferred by Turbo.

- **2026-05-24 — Revision:** Replaced Hono server with Next.js API routes + BullMQ worker. Deleted `apps/server`; added `apps/worker` (BullMQ). tRPC and Better Auth moved to Next.js App Router API routes. Long-running search and apply tasks now enqueue to BullMQ (`searchQueue`, `applyQueue`) defined in `packages/api/src/queues/`. Redis added to Docker Compose. `NEXT_PUBLIC_API_URL` removed; auth client uses same-origin `http://localhost:3000`. Tasks cleared: 0.5 (cleanup), 2.2, 2.3, 2.4, 3.3, 3.4, 5.5, 5.6, 7.4, 7.5, 8.4. Phase 9 added.

- **`packages/api/src/auth-env.ts`:** Auth env vars (`BETTER_AUTH_*`, `GOOGLE_*`) were split out of `env.ts` into `auth-env.ts` so the worker can import from `packages/api` services without needing those vars. `env.ts` now only validates `LINKEDIN_ENCRYPTION_KEY` and `REDIS_URL`.

- **Worker import isolation:** `apps/worker` imports directly from `@repo/db`, `@repo/automation`, and `@repo/ai` — NOT from `@repo/api`. A local `src/decrypt.ts` inlines the AES-256-GCM decrypt function to avoid the auth env chain.

- **2026-05-24 — Repository pattern + worker refactor:** Moved all DB queries out of `packages/automation` and `packages/ai` into `packages/db/src/queries/` (repository layer). Added `getJobCriteriaForUser`, `getJobForUser`, `insertJobs`, `updateJobApplied`, `updateJobFailed`, `getProfileForUser` as named functions exported from `@repo/db`. `packages/db` also now exports a `Db` type. `packages/automation/src/search.ts` (`runSearch`) and `packages/ai/src/agents/process-apply.ts` (`processApplyJob`) use these query functions instead of writing raw Drizzle. `packages/api/src/services/jobs.service.ts` is now CRUD-only (no automation imports). `@repo/automation` removed from `packages/api` deps. `drizzle-orm` removed from `packages/automation` and `packages/ai` deps.

- **2026-05-24 — Revision:** Added Phase 10 (locations refactor: `text[]` → `jsonb` `LocationEntry[]` with per-location work types, criteria form rewrite, scraper update, required field `*` indicators) and Phase 11 (search readiness guard: server-side `PRECONDITION_FAILED` + UI disabled button + Sonner toast). Required fields confirmed: profile firstName/lastName/phone/address/resume/coverLetter/linkedinEmail/linkedinPassword; criteria jobTitles/skills/locations (each ≥1 entry). Work types: `on-site`, `remote`, `hybrid`; default all three on new location entry.

- **2026-05-25 — Profile form + apply agent overhaul:**
  - `resume_markdown` column renamed to `resume` (plain text, not markdown); `cover_letter_markdown` renamed to `cover_letter_instructions` (nullable). Migrations in `0002_cover_letter_instructions.sql` and `0003_resume_rename.sql` — applied directly via node/pg (drizzle-kit skips manually added journal entries without a snapshot file).
  - Cover letter tab replaced with optional free-text instructions field. Agent writes a personalised cover letter per job from the resume + job details, following instructions if provided.
  - Resume tab: plain textarea, no markdown preview. `streamdown` dependency installed and removed.
  - `generateResumePdf` added to `packages/ai` — renders resume as HTML via Playwright and exports to a temp PDF. Called by `processApplyJob` before every apply job.
  - `applyToJob` signature changed: `resumePdfPath` is now a required third argument. Agent uploads the PDF when a file upload field appears.
  - `search-readiness.ts`: removed stale `coverLetterMarkdown` check; renamed `resumeMarkdown` → `resume`.
  - `CLAUDE.md` updated to reflect all above.

- **2026-05-24 — Turbopack module resolution fix:** Turbopack does NOT remap `.js` → `.ts` for workspace packages — it looks for literal file paths. Root `tsconfig.json` changed from `module: "NodeNext" / moduleResolution: "NodeNext"` to `module: "esnext" / moduleResolution: "bundler"`. All relative imports across packages and `apps/worker` had `.js` extensions stripped (40 files). No `transpilePackages` or `serverExternalPackages` needed — the extension removal alone fixes resolution.

---

## Completed

- **Date:** 2026-05-24
- **All tasks executed successfully:** yes
- **Files changed:**
  - `apps/server/` — deleted (replaced by Next.js API routes)
  - `apps/web/app/api/auth/[...all]/route.ts` — created; Next.js auth route handler
  - `apps/web/app/api/trpc/[trpc]/route.ts` — created; Next.js tRPC route handler
  - `apps/web/lib/trpc.tsx` — endpoint changed to `/api/trpc`
  - `apps/web/lib/auth-client.ts` — baseURL uses `NEXT_PUBLIC_BASE_URL`
  - `apps/web/lib/env.ts` — replaced `NEXT_PUBLIC_API_URL` with `NEXT_PUBLIC_BASE_URL`
  - `apps/web/proxy.ts` — unchanged (already cookie-based, no Hono URL)
  - `apps/web/.env.local` / `.env.example` — updated vars, removed `GEMINI_API_KEY`
  - `apps/web/package.json` — added `@trpc/server`
  - `apps/worker/` — new BullMQ worker app (search + apply workers, graceful shutdown)
  - `apps/worker/.env` / `.env.example` — created
  - `docker-compose.yaml` — added Redis service
  - `packages/api/src/auth-env.ts` — new; auth-specific env validation
  - `packages/api/src/env.ts` — now only validates `LINKEDIN_ENCRYPTION_KEY` + `REDIS_URL`
  - `packages/api/src/auth.ts` — imports from `auth-env.ts`, removed `trustedOrigins`
  - `packages/api/src/queues/index.ts` — new; `searchQueue` + `applyQueue` + job data types
  - `packages/api/src/routers/jobs.ts` — search + apply mutations now enqueue to BullMQ
  - `packages/api/src/services/jobs.service.ts` — removed `applyJobs`/`applyToJob`; added `validateApplyJobs`
  - `packages/api/src/routers/jobs.test.ts` — asserts queue enqueue calls
  - `packages/api/package.json` — removed `@repo/ai`, added `bullmq`
  - `CLAUDE.md` — updated for new architecture
- **How to test:**
  1. `docker compose up -d` (starts postgres + redis)
  2. `pnpm turbo dev --filter=web` — Next.js on port 3000
  3. `pnpm turbo dev --filter=@repo/worker` — BullMQ worker
  4. Visit http://localhost:3000, sign in, fill profile, click Search Jobs
  5. Jobs appear after the worker processes the search queue
- **Follow-up items:**
  - LinkedIn ToS: scraping and auto-apply violate LinkedIn's Terms of Service (known risk)
  - Worker needs a proper job queue with retry/backoff config for production
  - Gemini free tier: 15 RPM — apply worker concurrency is already 1
  - LinkedIn CAPTCHA: expect blocks in real usage; MVP limitation
  - `BETTER_AUTH_SECRET` and Google OAuth vars must match between `apps/web/.env.local` and `apps/worker/.env` if worker ever needs auth context (currently it doesn't)
