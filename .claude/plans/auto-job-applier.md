# Plan: Auto Job Applier

> A web app that searches LinkedIn for jobs matching the user's criteria, scores them by fit, and automatically fills and submits applications on the user's behalf — with a full tracker UI.

## Research Summary

- **Stack:** Next.js 16.2.6 App Router, TypeScript, tRPC v11.17, Drizzle ORM 0.45.2, PostgreSQL (Docker Compose), Better Auth 1.6.11, Vercel AI SDK 6.x + `@ai-sdk/google` 3.x (Gemini 2.5 Flash), Playwright 1.60, `@playwright/mcp` 0.0.75, Vitest 4.x, Zod 4.x, pnpm monorepo with Turborepo 2.9, shadcn 4.x
- **Relevant patterns:**
  - tRPC v11 uses `fetchRequestHandler` in `app/api/trpc/[trpc]/route.ts`; client uses TanStack Query v5 with `trpc.x.queryOptions()` syntax
  - Better Auth Drizzle adapter: `drizzleAdapter(db, { provider: "pg" })` — run `npx auth@latest generate` to scaffold tables
  - Vercel AI SDK multi-step agent: `generateText({ tools, maxSteps })` where tools come from `experimental_createMCPClient` (Playwright MCP) rather than hand-rolled wrappers; `experimental_createMCPClient` remains under the `experimental_` prefix in AI SDK 6.x but is production-ready
  - Playwright MCP (`@playwright/mcp`) provides `browser_navigate`, `browser_snapshot` (accessibility tree), `browser_fill`, `browser_click`, `browser_select_option`, `browser_press_key` — no screenshots/vision needed, works with free Gemini tier
  - Playwright used directly (not via MCP) in `packages/automation` for job scraping only; the AI apply agent uses MCP
  - **Next.js 16 key changes vs 15:** Turbopack is now the default bundler; `middleware.ts` replaced by `proxy.ts` for edge route protection; synchronous Request APIs removed (all async); caching is now opt-in via `use cache` directive (not implicit); all dynamic code defaults to request-time execution
  - Turborepo one-way dependency: apps depend on packages, packages never depend on apps
- **Key files (new — no existing codebase):**
  - `apps/web/` — Next.js app
  - `packages/api/` — all tRPC routers + business logic
  - `packages/db/` — Drizzle schema, migrations, db connection
  - `packages/automation/` — Playwright LinkedIn scraper + form filler
  - `packages/ai/` — Gemini agent (form analysis + field mapping)
- **New dependencies:**
  - `better-auth`, `@better-auth/drizzle-adapter`
  - `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10 (stable — not the 1.0 RC), `pg`, `@types/pg`
  - `@trpc/server`, `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query`
  - `ai`, `@ai-sdk/google`
  - `playwright`, `@playwright/mcp`
  - `zod`, `vitest`, `@vitejs/plugin-react`, `@testing-library/react`
- **Risks/Considerations:**
  - LinkedIn ToS: Playwright scraping violates LinkedIn ToS; user accepts this risk
  - LinkedIn anti-bot: expect CAPTCHAs and rate limits in production; for MVP treat as known limitation
  - LinkedIn credentials: stored encrypted (AES-256 via Node `crypto`) in the `profiles` table; never logged
  - Long-running Playwright ops: fire-and-forget async from tRPC handler works for local Docker MVP; note this needs a proper queue (e.g. pg-boss) before production deployment
  - External form filling reliability: each platform (Greenhouse, Lever, Workday) has unique DOM; Gemini agent may fail on novel layouts — `failed` status + `failure_reason` column captures this
  - Gemini free tier: 15 RPM limit — serialize apply calls, don't parallelize

---

## Tasks

### Phase 0: Monorepo Scaffold

#### 0.1. Init Turborepo + pnpm workspace
- **What:** Bootstrap the monorepo root with `pnpm dlx create-turbo@latest`, configure `pnpm-workspace.yaml`, root `tsconfig.json` (base config extended by all packages), and `turbo.json` with `build`, `typecheck`, `lint`, `format`, `test`, `dev` tasks. Set `"packageManager": "pnpm@9"` in root `package.json`. Install `@biomejs/biome` as a root devDependency and add `biome.json` at the repo root. `lint` script: `biome check .`; `format` script: `biome format --write .` (CI uses `biome format --check .`).- **Files:** `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, `package.json`, `biome.json`
- **Verify:** `pnpm install` succeeds from root; `turbo build` exits cleanly with no packages yet; `biome check .` exits 0

#### 0.2. Create package skeletons
- **What:** Scaffold four packages (`packages/db`, `packages/api`, `packages/automation`, `packages/ai`) each with a `package.json` (name `@repo/db` etc., `"main": "src/index.ts"`), a `tsconfig.json` extending root, and an empty `src/index.ts`. No implementation yet.
- **Files:** `packages/db/package.json`, `packages/api/package.json`, `packages/automation/package.json`, `packages/ai/package.json` + matching `tsconfig.json` and `src/index.ts`
- **Verify:** `pnpm install` resolves all workspace packages; `tsc --noEmit` passes from each package

#### 0.3. Bootstrap Next.js app
- **What:** Run `pnpm create next-app@16 apps/web --ts --tailwind --no-eslint --app --no-src-dir --turbopack`. Then run `pnpm dlx shadcn@latest init` inside `apps/web` (New York style, zinc base color). Add `@repo/db`, `@repo/api` as `workspace:*` dependencies in `apps/web/package.json`.
- **Files:** `apps/web/` (entire Next.js scaffold), `apps/web/components.json`
- **Verify:** `pnpm --filter web dev` starts on port 3000 with the default Next.js page

#### 0.4. Docker Compose for PostgreSQL
- **What:** Add `docker-compose.yml` at repo root with a `postgres:16` service (port 5432, named volume `pgdata`, env vars `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`). Add `.env.example` with `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `LINKEDIN_ENCRYPTION_KEY`.
- **Files:** `docker-compose.yml`, `.env.example`, `.gitignore` (add `.env`)
- **Verify:** `docker compose up -d` starts postgres; `psql $DATABASE_URL -c "\l"` lists databases

---

### Phase 1: Database Schema

#### 1.1. Drizzle config + connection
- **What:** Install `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `dotenv` in `packages/db`. Create `drizzle.config.ts` pointing at `src/schema/index.ts` and `./drizzle` migrations folder. Create `src/db.ts` exporting a `pg.Pool`-based `db` instance using `DATABASE_URL`.
- **Files:** `packages/db/drizzle.config.ts`, `packages/db/src/db.ts`, `packages/db/package.json`
- **Verify:** `pnpm --filter @repo/db exec tsc --noEmit` passes

#### 1.2. Better Auth tables schema
- **What:** Run `npx auth@latest generate` (or manually write) the Better Auth required tables: `users`, `sessions`, `accounts`, `verifications`. Export them from `packages/db/src/schema/auth.ts`. These must match Better Auth's expected column names exactly.
- **Files:** `packages/db/src/schema/auth.ts`
- **Verify:** Schema file compiles; column names match Better Auth Drizzle adapter expectations (cross-check against `better-auth` generated output)

#### 1.3. App tables schema
- **What:** Write three Drizzle table definitions in `packages/db/src/schema/`:
  - `profiles` — `id uuid PK`, `userId text FK→users.id unique`, `firstName`, `lastName`, `phone`, `location`, `linkedinUrl`, `githubUrl`, `websiteUrl`, `resumeMarkdown text`, `coverLetterMarkdown text`, `linkedinEmailEncrypted text`, `linkedinPasswordEncrypted text`, `createdAt`, `updatedAt`
  - `jobCriteria` — `id uuid PK`, `userId text FK→users.id unique`, `jobTitles text[]`, `skills text[]`, `locations text[]`, `remote boolean`, `seniority text[]`, `minSalary integer nullable`
  - `jobs` — `id uuid PK`, `userId text FK→users.id`, `title`, `company`, `location`, `description text`, `url text`, `platform platformEnum default 'linkedin'` (pgEnum: `linkedin`), `fitTier fitTierEnum` (pgEnum: `strong`, `potential`, `weak`), `status text enum(pending_review|applied|failed|skipped) default pending_review`, `appliedAt timestamp nullable`, `failureReason text nullable`, `createdAt`, `updatedAt`
- **Files:** `packages/db/src/schema/profiles.ts`, `packages/db/src/schema/job-criteria.ts`, `packages/db/src/schema/jobs.ts`, `packages/db/src/schema/index.ts` (re-exports all)
- **Verify:** `tsc --noEmit` passes; `pnpm --filter @repo/db exec drizzle-kit generate` produces valid SQL migration files

#### 1.4. Run initial migration
- **What:** Add `migrate` script to `packages/db/package.json` using `drizzle-kit migrate`. Run it against the local Docker Postgres to create all tables.
- **Files:** `packages/db/package.json` (scripts), `packages/db/drizzle/` (migration SQL files)
- **Verify:** `pnpm --filter @repo/db migrate` exits 0; `psql $DATABASE_URL -c "\dt"` shows all tables

---

### Phase 2: Authentication

#### 2.1. Better Auth server config
- **What:** Install `better-auth`, `@better-auth/drizzle-adapter` in `packages/api`. Create `packages/api/src/auth.ts` configuring `betterAuth` with the Drizzle adapter (importing `db` from `@repo/db`), `emailAndPassword: { enabled: true }`, Google OAuth social provider, and `accountLinking`. Export `auth` and `toNextJsHandler(auth)`.
- **Files:** `packages/api/src/auth.ts`, `packages/api/package.json`
- **Verify:** `tsc --noEmit` passes in `packages/api`

#### 2.2. Auth route handler in Next.js
- **What:** Create `apps/web/app/api/auth/[...all]/route.ts` that imports `toNextJsHandler` from `packages/api` and exports `GET` and `POST`. Add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` to `apps/web/.env.local`.
- **Files:** `apps/web/app/api/auth/[...all]/route.ts`
- **Verify:** `GET /api/auth/get-session` returns `null` (unauthenticated)

#### 2.3. Auth client + route protection
- **What:** Create `apps/web/lib/auth-client.ts` with `createAuthClient({ baseURL })`. In Next.js 16, `middleware.ts` is replaced by `proxy.ts` for edge route protection — create `apps/web/proxy.ts` that checks the Better Auth session cookie and redirects unauthenticated requests to `/sign-in` for all routes under `/(dashboard)`.
- **Files:** `apps/web/lib/auth-client.ts`, `apps/web/proxy.ts`
- **Verify:** Visiting `/jobs` (protected) redirects to `/sign-in`

#### 2.4. Sign-in and sign-up pages
- **What:** Build sign-in page at `app/(auth)/sign-in/page.tsx` and sign-up page at `app/(auth)/sign-up/page.tsx` using shadcn `Card`, `Input`, `Button`. Sign-in supports email/password and a "Continue with Google" button via `authClient.signIn.social`. Sign-up uses `authClient.signUp.email`.
- **Files:** `apps/web/app/(auth)/sign-in/page.tsx`, `apps/web/app/(auth)/sign-up/page.tsx`
- **Verify:** Can create an account via sign-up form and sign in; session cookie is set; redirected to `/jobs`

#### 2.5. Auth tests
- **What:** Write Vitest unit tests in `packages/api` for the auth context helper (`getSession` returns null for missing headers, returns session shape for valid session mock). Mock the Better Auth `auth.api.getSession` call.
- **Files:** `packages/api/src/auth.test.ts`
- **Verify:** `pnpm --filter @repo/api test` passes

---

### Phase 3: tRPC Infrastructure

#### 3.1. tRPC init + context
- **What:** Install `@trpc/server`, `zod` in `packages/api`. Create `packages/api/src/trpc.ts` with `initTRPC.context<Context>().create()`, exporting `router`, `publicProcedure`, `protectedProcedure` (throws `UNAUTHORIZED` if no session). Create `packages/api/src/context.ts` exporting `createContext(req: Request)` which reads the Better Auth session and attaches `db` (from `@repo/db`) and `session`.
- **Files:** `packages/api/src/trpc.ts`, `packages/api/src/context.ts`
- **Verify:** `tsc --noEmit` passes; context type includes `db` and `session | null`

#### 3.2. Root router
- **What:** Create `packages/api/src/router.ts` composing all sub-routers (profile, jobs — added in later phases) into `appRouter`. Export `AppRouter` type. Create `packages/api/src/index.ts` re-exporting `appRouter`, `AppRouter`, `createContext`.
- **Files:** `packages/api/src/router.ts`, `packages/api/src/index.ts`
- **Verify:** `tsc --noEmit` passes; `AppRouter` type is importable

#### 3.3. tRPC HTTP handler in Next.js
- **What:** Install `@trpc/server` in `apps/web`. Create `apps/web/app/api/trpc/[trpc]/route.ts` using `fetchRequestHandler` with `appRouter` and `createContext`. Both `GET` and `POST` export the same handler.
- **Files:** `apps/web/app/api/trpc/[trpc]/route.ts`
- **Verify:** `GET /api/trpc/health` (stub procedure) returns `{"result":{"data":"ok"}}`

#### 3.4. tRPC client + React Query provider
- **What:** Install `@trpc/client`, `@trpc/react-query`, `@tanstack/react-query` in `apps/web`. Create `apps/web/lib/trpc.ts` with `createTRPCReact<AppRouter>()` and a `TRPCProvider` client component wrapping `QueryClientProvider` + `trpc.Provider`. Mount `TRPCProvider` in `apps/web/app/layout.tsx`.
- **Files:** `apps/web/lib/trpc.ts`, `apps/web/app/layout.tsx`
- **Verify:** No TypeScript errors; any client component can import `trpc` and see typed procedures

---

### Phase 4: Profile Feature

#### 4.1. Profile tRPC router
- **What:** Create `packages/api/src/routers/profile.ts` with three `protectedProcedure`s:
  - `getProfile` — fetch profile + job criteria for current user (LEFT JOIN or two queries)
  - `upsertProfile` — insert-or-update `profiles` row; input validated with Zod (all personal fields + resume/coverLetter markdown + encrypted LinkedIn creds). Encrypt `linkedinEmail` and `linkedinPassword` using AES-256-GCM via Node `crypto` before storing.
  - `upsertCriteria` — insert-or-update `jobCriteria` row; input: `{ jobTitles: string[], skills: string[], locations: string[], remote: boolean, seniority: string[], minSalary?: number }`
- **Files:** `packages/api/src/routers/profile.ts`
- **Verify:** `tsc --noEmit` passes; Zod schemas reject invalid input shapes

#### 4.2. Encryption utility
- **What:** Create `packages/api/src/lib/encrypt.ts` with `encrypt(text: string): string` and `decrypt(ciphertext: string): string` using Node.js `crypto.createCipheriv` (AES-256-GCM). Key derived from `LINKEDIN_ENCRYPTION_KEY` env var. Output format: `iv:authTag:ciphertext` as hex, colon-separated.
- **Files:** `packages/api/src/lib/encrypt.ts`
- **Verify:** Round-trip test: `decrypt(encrypt("hello")) === "hello"`; incorrect key throws

#### 4.3. Profile setup UI
- **What:** Build `apps/web/app/(dashboard)/profile/page.tsx` as a multi-section form with shadcn components:
  - **Personal details** tab: first/last name, phone, location, LinkedIn URL, GitHub URL, website URL
  - **Resume** tab: `Textarea` for markdown content (full-height, monospace font)
  - **Cover Letter** tab: same `Textarea` pattern
  - **Job Criteria** tab: tag-input for job titles, skills, locations; toggle for remote; checkbox group for seniority (Intern/Junior/Mid/Senior/Lead/Principal); number input for min salary
  - **LinkedIn Credentials** tab: email + password inputs (type="password"); displayed separately with a security notice
  - On submit: calls `trpc.profile.upsertProfile.useMutation` and `trpc.profile.upsertCriteria.useMutation`; shows toast on success/error
- **Files:** `apps/web/app/(dashboard)/profile/page.tsx`, `apps/web/components/profile/profile-form.tsx`, `apps/web/components/profile/criteria-form.tsx`
- **Verify:** Form pre-populates from `getProfile` query on load; saving persists to DB; LinkedIn password field does not show plaintext after save

#### 4.4. Profile tests
- **What:** Write Vitest unit tests for the `profile` router: mock `db` in context, verify `upsertProfile` inserts correct fields, verify `getProfile` returns null profile for new user, verify `upsertCriteria` validates array inputs. Write unit tests for `encrypt.ts` covering round-trip and tampered-ciphertext rejection.
- **Files:** `packages/api/src/routers/profile.test.ts`, `packages/api/src/lib/encrypt.test.ts`
- **Verify:** `pnpm --filter @repo/api test` passes

---

### Phase 5: Job Search + Matching

#### 5.1. Playwright browser manager
- **What:** Install `playwright` in `packages/automation`; run `npx playwright install chromium`. Create `packages/automation/src/browser.ts` exporting a `BrowserManager` singleton with `launch()` (creates a headless Chromium browser + context with a realistic user-agent) and `close()`. Browser is created lazily on first call and reused.
- **Files:** `packages/automation/src/browser.ts`, `packages/automation/package.json`
- **Verify:** `node -e "require('./src/browser.ts')"` (via `tsx`) launches and closes Chromium without error

#### 5.2. LinkedIn login helper
- **What:** Create `packages/automation/src/linkedin/login.ts` exporting `loginToLinkedIn(page, email, password)`. Navigates to `https://www.linkedin.com/login`, fills credentials, submits, and waits for the feed URL (`/feed`). Returns `true` on success, throws on CAPTCHA detection (check for `#captcha-challenge` or security verification text).
- **Files:** `packages/automation/src/linkedin/login.ts`
- **Verify:** With valid credentials, `loginToLinkedIn` sets auth cookies and lands on feed; with wrong password it throws a descriptive error

#### 5.3. LinkedIn job scraper
- **What:** Create `packages/automation/src/linkedin/scraper.ts` exporting `scrapeLinkedInJobs(page, criteria: JobCriteria): Promise<ScrapedJob[]>`. Flow: navigate to `https://www.linkedin.com/jobs/search/?keywords={encodeURIComponent(titles.join(' '))}&location={location}&f_WT={remoteFilter}`, paginate up to 3 pages, extract per-card: `title`, `company`, `location`, `url`. Click each card to load description panel; extract full description text. Return array of `ScrapedJob` objects. Respect a 1–2s delay between page navigations.
- **Files:** `packages/automation/src/linkedin/scraper.ts`, `packages/automation/src/types.ts` (ScrapedJob, JobCriteria types)
- **Verify:** Running against LinkedIn with real criteria returns an array of job objects with non-empty `title`, `company`, `url`, `description`

#### 5.4. Rule-based job scorer
- **What:** Create `packages/automation/src/scorer.ts` exporting `scoreJob(job: ScrapedJob, criteria: JobCriteria): FitTier`. Scoring: +3 for each matched job title keyword (case-insensitive substring in `job.title`), +1 for each matched skill (in `job.description`), +2 for location match, +2 for remote match. Thresholds: score ≥ 7 → `"strong"`, score 3–6 → `"potential"`, score < 3 → `"weak"`. Export `FitTier = "strong" | "potential" | "weak"`.
- **Files:** `packages/automation/src/scorer.ts`
- **Verify:** Unit tests confirm threshold boundaries and keyword matching

#### 5.5. Search tRPC procedure
- **What:** Create `packages/api/src/routers/jobs.ts` with a `protectedProcedure` `search` mutation (no input). It: (1) fetches the user's profile + criteria, (2) throws `PRECONDITION_FAILED` if LinkedIn credentials or criteria are missing, (3) decrypts LinkedIn credentials, (4) calls `BrowserManager.launch()` → `loginToLinkedIn` → `scrapeLinkedInJobs`, (5) scores each job, (6) bulk-inserts into `jobs` table (skip duplicates by `url` + `userId`), (7) fires-and-forgets (returns `{ queued: true }` immediately after inserting; browser work runs async). On async error, log to stderr.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** Calling `trpc.jobs.search.mutate()` from the client returns `{ queued: true }` without waiting for scraping; new job rows appear in DB after scraping completes

#### 5.6. Job search + scorer tests
- **What:** Write Vitest unit tests for `scorer.ts` covering all three tiers, edge cases (empty skills array, all criteria match, none match). Write unit tests for the `jobs.search` router procedure: mock `BrowserManager`, `loginToLinkedIn`, `scrapeLinkedInJobs`, and `db`; verify that scraped jobs are scored and inserted, and that missing criteria throws `PRECONDITION_FAILED`.
- **Files:** `packages/automation/src/scorer.test.ts`, `packages/api/src/routers/jobs.test.ts`
- **Verify:** `pnpm test` passes for both packages

---

### Phase 6: Job Dashboard UI

#### 6.1. Jobs list tRPC procedures
- **What:** Add to `packages/api/src/routers/jobs.ts`:
  - `list` query — input: `{ status?: JobStatus }`. Returns jobs for current user ordered by `createdAt desc`, filtered by status if provided. Joins nothing (all data on the jobs row).
  - `updateStatus` mutation — input: `{ jobId: string, status: 'skipped' }`. Updates a single job's status. Only `pending_review → skipped` is allowed via this endpoint; other transitions are internal.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** `list` returns typed array; `updateStatus` with a wrong status throws `BAD_REQUEST`

#### 6.2. Jobs dashboard layout
- **What:** Create `apps/web/app/(dashboard)/jobs/page.tsx` as the main tracker. Use shadcn `Tabs` with four tabs: **Pending Review**, **Applied**, **Failed**, **Skipped**. Each tab renders a job list. Add a "Search Jobs" button in the header that calls `trpc.jobs.search.useMutation()` with a loading spinner; on completion, invalidates the `jobs.list` query to refresh the list.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`, `apps/web/components/jobs/job-tabs.tsx`
- **Verify:** Tabs render; clicking "Search Jobs" triggers the mutation; after scraping, pending jobs appear in the Pending tab

#### 6.3. Job card component
- **What:** Create `apps/web/components/jobs/job-card.tsx`. Shows: company name, job title, location, platform badge, fitTier badge (color-coded: green/yellow/red for strong/potential/weak), posted-date. For `pending_review` jobs: "Apply" button and "Skip" button. Truncated description (2 lines) with "See more" expand. "Skip" calls `trpc.jobs.updateStatus.useMutation()`.
- **Files:** `apps/web/components/jobs/job-card.tsx`
- **Verify:** Card renders correct fitTier badge color; Skip button updates job status and card disappears from Pending tab

#### 6.4. Apply selection + trigger
- **What:** Add multi-select to Pending tab: checkbox on each card, "Apply to Selected (N)" button in the tab header. Clicking triggers a new `trpc.jobs.apply.useMutation({ jobIds: string[] })` (stub for now — procedure created in Phase 7). Show a toast: "Applying to N jobs in the background…". After mutation returns, invalidate `jobs.list`.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`, `apps/web/components/jobs/job-tabs.tsx`
- **Verify:** Selecting 2 cards and clicking Apply sends the correct `jobIds` array; toast appears; jobs move to `applied` or `failed` after automation runs

---

### Phase 7: Auto Apply Agent

#### 7.1. Gemini + Playwright MCP setup
- **What:** Install `ai`, `@ai-sdk/google`, `@playwright/mcp`, `zod` in `packages/ai`. Create `packages/ai/src/gemini.ts` exporting the configured `google('gemini-2.5-flash')` model. Create `packages/ai/src/mcp.ts` exporting `createPlaywrightMCPClient()` which uses `experimental_createMCPClient` with `Experimental_StdioMCPTransport` to spawn `@playwright/mcp --headless` as a subprocess. The function returns the client; callers are responsible for calling `client.close()` when done.
- **Files:** `packages/ai/src/gemini.ts`, `packages/ai/src/mcp.ts`, `packages/ai/package.json`
- **Verify:** `tsc --noEmit` passes; calling `createPlaywrightMCPClient()` then `client.tools()` returns a non-empty tools object with `browser_navigate` and `browser_snapshot` present

#### 7.2. Apply agent orchestrator
- **What:** Create `packages/ai/src/agents/apply-agent.ts` exporting `applyToJob(job: JobRow, profile: ProfileRow): Promise<{ success: boolean; reason?: string }>`. Flow: (1) call `createPlaywrightMCPClient()`, (2) `await client.tools()` to get the MCP tool set, (3) call `generateText` with the Gemini model, the MCP tools, and `maxSteps: 30`. System prompt: inject all profile fields as context (name, phone, location, skills, resume markdown, LinkedIn credentials for login); instruct the agent to navigate to `job.url`, log in to LinkedIn if needed, inspect the form via `browser_snapshot` (accessibility tree), fill every required field using profile data, and submit. After each major step use `browser_snapshot` to verify state before proceeding. Agent should output `SUCCESS` or `FAILURE:<reason>` as its final message. (4) Parse that sentinel and return. (5) Always call `client.close()` in a `finally` block.
- **Files:** `packages/ai/src/agents/apply-agent.ts`, `packages/ai/src/index.ts`
- **Verify:** `tsc --noEmit` passes; system prompt correctly injects all profile fields; `client.close()` is called even on error

#### 7.3. LinkedIn Easy Apply flow guidance
- **What:** Add a LinkedIn-specific section to the `apply-agent.ts` system prompt instructing the agent to detect the apply flow dynamically via `browser_snapshot`: if an "Easy Apply" button is present, click it to open the modal and handle multi-step navigation ("Next" / "Review" / "Submit application") using `browser_snapshot` after each step to confirm the modal advanced; otherwise treat the page as an external ATS form. For the resume upload step, instruct the agent to skip it or dismiss with `browser_press_key` if blocking.
- **Files:** `packages/ai/src/agents/apply-agent.ts` (extend)
- **Verify:** System prompt instructs the agent to detect "Easy Apply" button presence at runtime rather than relying on a stored flag

#### 7.4. Apply tRPC procedure wiring
- **What:** Add `apply` mutation to `packages/api/src/routers/jobs.ts`. Input: `{ jobIds: string[] }`. Validates all jobs belong to current user and have `status = 'pending_review'`. Returns `{ queued: true }` immediately. Async: for each jobId in sequence, fetch job row + profile row, call `applyToJob(job, profile)` from `@repo/ai`, update the `jobs` row to `applied` (set `appliedAt = now()`) on success or `failed` (set `failureReason`) on failure. Never throw from the async block — log errors to stderr.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** Calling `apply` with valid jobIds returns `{ queued: true }`; unauthorized jobIds throw `FORBIDDEN`; after async completes, job rows have updated status

#### 7.5. Apply agent tests
- **What:** Write Vitest unit tests for `apply-agent.ts`: mock `experimental_createMCPClient` and `generateText` to return canned responses, verify the system prompt contains all profile fields, verify `SUCCESS` sentinel is parsed correctly, verify `FAILURE:reason` parsing, verify `client.close()` is always called. Write unit tests for the `jobs.apply` router: mock `applyToJob` from `@repo/ai`, verify only `pending_review` jobs are processed, verify status updates are written after success/failure, verify foreign jobIds are rejected.
- **Files:** `packages/ai/src/agents/apply-agent.test.ts`, `packages/api/src/routers/jobs.test.ts` (extend)
- **Verify:** `pnpm test` passes across all packages

---

### Phase 8: Polish + Integration

#### 8.1. Navigation shell
- **What:** Create `apps/web/app/(dashboard)/layout.tsx` with a persistent sidebar (shadcn `Sheet` on mobile, static on desktop) containing: app logo/name, nav links to `/jobs` and `/profile`, user avatar + email from session (via `authClient.useSession()`), and a sign-out button (`authClient.signOut()`).
- **Files:** `apps/web/app/(dashboard)/layout.tsx`, `apps/web/components/nav/sidebar.tsx`
- **Verify:** Sidebar renders on all dashboard pages; sign-out redirects to `/sign-in`

#### 8.2. Loading + empty states
- **What:** Add skeleton loaders (shadcn `Skeleton`) to the jobs list while `trpc.jobs.list` is loading. Add an empty state component for each tab ("No pending jobs — run a search to find matches"). Add error boundary for failed tRPC queries (shadcn `Alert` with retry button).
- **Files:** `apps/web/components/jobs/job-list-skeleton.tsx`, `apps/web/components/jobs/empty-state.tsx`
- **Verify:** Temporarily introduce a `sleep(2000)` in the `list` procedure and confirm skeleton renders; remove after verifying

#### 8.3. Status polling
- **What:** In the jobs dashboard, use `refetchInterval: 3000` on the `trpc.jobs.list.useQuery()` call only when there are jobs with no terminal status currently in flight (i.e., when a search or apply was triggered in this session). Track this with a `isProcessing` React state flag set on mutation trigger and cleared when all jobs have terminal statuses.
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`
- **Verify:** After triggering apply, job status cards update from `pending_review` to `applied`/`failed` without a manual page refresh

#### 8.4. CLAUDE.md
- **What:** Run `/init` to generate a `CLAUDE.md` at the repo root documenting the monorepo structure, package responsibilities, key env vars, how to run the app locally (docker compose + pnpm dev), how to run tests, and the Drizzle migration workflow.
- **Files:** `CLAUDE.md`
- **Verify:** File exists and accurately describes the project structure

---

## Notes

- **LinkedIn ToS:** Scraping and automated form submission violates LinkedIn's Terms of Service. This is a known, accepted risk for this project.

- **LinkedIn credential storage:** AES-256-GCM encryption is sufficient for MVP. Before any public deployment, consider a proper secrets manager (e.g., Vault, AWS Secrets Manager) or a delegated auth approach (OAuth token instead of password).

- **Next.js 16 `proxy.ts`:** Next.js 16 replaces `middleware.ts` with `proxy.ts` for edge route protection. The Better Auth docs may still reference `middleware.ts` — ignore those examples and use `proxy.ts` instead. If the `create-auth-skill` or `better-auth-best-practices` skill generates a `middleware.ts`, rename it.

- **Next.js 16 caching:** Caching is now fully opt-in via `use cache` directive. There is no implicit caching of fetch calls or route handlers. This is fine for this app since all data fetching goes through tRPC + React Query (client-side), which manages its own cache — no `use cache` directives needed for MVP.

- **Fire-and-forget in Next.js:** Long-running async operations (scraping, applying) started inside a tRPC route handler may be cut off by the serverless function timeout in hosted environments. This works reliably for local Docker MVP. Before deploying to Vercel or similar, migrate the heavy work to a proper queue (pg-boss on the existing Postgres, or BullMQ + Redis).

- **Gemini free tier rate limit:** 15 RPM on `gemini-2.5-flash`. The apply procedure serializes jobs (not parallel) to stay under this. If the user applies to more than ~10 jobs in one batch, the agent will naturally throttle due to sequential execution.

- **Resume upload:** For MVP, the resume is stored as markdown and uploaded as a `.txt` file to form file inputs. Most ATS systems (Greenhouse, Lever) accept plain text. For better compatibility, a future task would generate a PDF from the markdown (e.g., using Puppeteer or a library like `pdf-lib`).

- **External platform reliability:** The Gemini agent approach will work on simple forms but may struggle with Workday (heavy JavaScript, iframe-based) and other complex ATS. Expect a non-trivial `failed` rate on external platforms. The `failureReason` column captures agent output for debugging.

- **tRPC `health` stub:** Task 3.3 references a `health` procedure. Add it as a simple `publicProcedure.query(() => "ok")` in `router.ts` for initial verification; it can be removed later.

- **`packages/ai` vs `packages/automation` boundary:** The AI agent (`packages/ai`) is responsible for deciding *what* to fill; it owns a full browser session via `@playwright/mcp`. The automation layer (`packages/automation`) is responsible for job scraping and uses direct Playwright (no MCP). This separation makes it easy to swap the AI model independently.

- **Why Playwright MCP for apply but not scrape:** The scraper (`packages/automation`) runs structured, deterministic DOM extraction — direct Playwright API is faster and more reliable for this. The form-filler needs the AI to reason about arbitrary, unknown form structures — MCP's `browser_snapshot` (accessibility tree) gives the agent a structured page view without screenshots, which works well with Gemini's free tier (no vision API charges). Writing custom tool wrappers would have duplicated what `@playwright/mcp` already provides and maintained by Microsoft.

- **MCP subprocess lifecycle:** Each `applyToJob` call spawns a new `@playwright/mcp` subprocess and closes it when done. This is intentional — it ensures clean browser state per job. The overhead (~1s startup) is acceptable since jobs are processed sequentially.
