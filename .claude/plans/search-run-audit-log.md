# Plan: Search Run Audit Log

> Track every LinkedIn search run with timestamps, status, job count, and search criteria — surfaced on a new /runs page in the web app.

## Research Summary

- **Stack:** Next.js 16 App Router, tRPC, Drizzle ORM, PostgreSQL, BullMQ, Vitest, Biome
- **Relevant patterns:**
  - DB schema: `packages/db/src/schema/jobs.ts` — `pgEnum`, uuid PK, text FK `.references(() => users.id, { onDelete: "cascade" })`
  - Queries: `packages/db/src/queries/jobs.ts` — typed via `$inferInsert`/`$inferSelect`, take `db: Db` as first arg, return first row with `.then(r => r[0])`
  - Worker: `apps/worker/src/workers/search.worker.ts` → `processSearch(userId)` → `runSearch(db, userId, email, password)` in `packages/automation/src/search.ts`
  - tRPC router: `packages/api/src/routers/jobs.ts` — `protectedProcedure`, Zod input, calls service or query directly
  - Server page pattern: `getSession()` → call service → pass `initialData` (required prop) to client component
  - Client component pattern: `useQuery(undefined, { initialData })` typed via `RouterOutputs["router"]["procedure"]`
  - Nav: `NAV_LINKS` array in `apps/web/components/nav/sidebar.tsx`
- **Key files:**
  - `packages/db/src/schema/jobs.ts` — `platformEnum`, `jobs` table
  - `packages/db/src/schema/index.ts` — schema barrel
  - `packages/db/src/queries/jobs.ts` — query function patterns
  - `packages/db/src/queries/index.ts` — query barrel
  - `packages/automation/src/search.ts` — `runSearch()` implementation
  - `apps/worker/src/workers/search.worker.ts` — BullMQ consumer
  - `packages/api/src/router.ts` — top-level tRPC router
  - `packages/api/src/index.ts` — api package exports
  - `apps/web/components/nav/sidebar.tsx` — navigation
- **New dependencies:** none (shadcn `table` component needs install via `npx shadcn@latest add table` from `apps/web/`)
- **Risks/Considerations:**
  - DB wipe required before migration (confirmed by user)
  - `platformEnum` is currently defined in `jobs.ts`; `searchRuns` also needs it, and `jobs` will need to import `searchRuns` for its FK — circular import. Must move `platformEnum` to a shared `enums.ts` first.
  - `runSearch` currently returns `void` — must be changed to return `jobCount: number`
  - Run must be created *before* `runSearch` is called so jobs can reference it via non-nullable FK
  - If `runSearch` throws mid-scrape, jobs inserted before the throw remain in the DB linked to the run; the run will be marked `failed` with `jobCount: 0` (a known MVP limitation)

## Tasks

### Phase 1: DB Schema & Queries

#### 1.1. [x] Extract `platformEnum` to a shared enums file
- **What:** Move `platformEnum` (and re-export it from `jobs.ts`) into a new `packages/db/src/schema/enums.ts` so both `jobs.ts` and the new `search-runs.ts` can import it without a circular dependency.
- **Files:**
  - Create `packages/db/src/schema/enums.ts`
  - Update `packages/db/src/schema/jobs.ts` to import `platformEnum` from `./enums`
  - Update `packages/db/src/schema/index.ts` to re-export from `./enums`
- **Verify:** `pnpm typecheck` passes in `packages/db`

#### 1.2. [x] Add `searchRuns` table to schema
- **What:** Define `searchRunStatusEnum` (`"pending" | "running" | "completed" | "failed"`) and the `searchRuns` pgTable with columns: `id` (uuid PK), `userId` (text FK → users with cascade), `platform` (platformEnum), `status` (searchRunStatusEnum, default `"pending"`), `startedAt` (timestamp, defaultNow), `completedAt` (timestamp, nullable), `jobCount` (integer, default 0), `errorMessage` (text, nullable), `searchCriteria` (jsonb, nullable — snapshot of `{ jobTitles, skills, locations }` at run time).
- **Files:**
  - Create `packages/db/src/schema/search-runs.ts`
  - Update `packages/db/src/schema/index.ts` to export from `./search-runs`
- **Verify:** `pnpm typecheck` passes in `packages/db`

#### 1.3. [x] Add `runId` FK to the `jobs` table
- **What:** Add a non-nullable `runId uuid` column to the `jobs` pgTable that references `searchRuns.id` with `onDelete: "cascade"`. DB is being wiped so no backfill needed.
- **Files:**
  - `packages/db/src/schema/jobs.ts`
- **Verify:** `pnpm typecheck` passes in `packages/db`

#### 1.4. [x] Generate and apply migration
- **What:** Run `pnpm generate` then `pnpm migrate` (from `packages/db/`) to produce and apply the SQL migration covering the new table and new column.
- **Files:** `packages/db/drizzle/` (auto-generated)
- **Verify:** `pnpm migrate` exits 0; `search_runs` table and `jobs.run_id` column exist in DB

#### 1.5. [x] Add query functions for search runs
- **What:** Create `packages/db/src/queries/search-runs.ts` with:
  - `insertSearchRun(db, data: NewSearchRun)` — inserts a row and returns it
  - `updateSearchRun(db, runId: string, updates: Partial<SearchRunUpdate>)` — updates the row by id
  - `listSearchRuns(db, userId: string)` — selects all runs for a user ordered by `startedAt DESC`
  Export `NewSearchRun` and `SearchRunUpdate` types (inferred from table). Add a barrel re-export in `packages/db/src/queries/index.ts`.
- **Files:**
  - Create `packages/db/src/queries/search-runs.ts`
  - Update `packages/db/src/queries/index.ts`
- **Verify:** `pnpm typecheck` passes in `packages/db`

### Phase 2: Worker Integration

#### 2.1. [x] Update `runSearch` to accept `runId` and return job count
- **What:**
  - Change signature to `runSearch(db, userId, email, password, runId: string): Promise<number>`
  - After fetching criteria, call `updateSearchRun(db, runId, { status: "running", searchCriteria: { jobTitles, skills, locations } })`
  - Pass `runId` into the job insert so each inserted job has the FK set
  - Return the count of jobs inserted
- **Files:**
  - `packages/automation/src/search.ts`
  - `packages/automation/src/types.ts` (add `runId` to `NewJob` / insert shape if needed)
- **Verify:** `pnpm typecheck` passes in `packages/automation`

#### 2.2. [x] Update search worker to create and close the run
- **What:**
  - In `processSearch`, before calling `runSearch`: call `insertSearchRun(db, { userId, platform: "linkedin", status: "pending", startedAt: new Date() })` to get the new `runId`
  - Wrap `runSearch` call in try/catch:
    - On success: `updateSearchRun(db, runId, { status: "completed", completedAt: new Date(), jobCount })`
    - On error: `updateSearchRun(db, runId, { status: "failed", completedAt: new Date(), errorMessage: err.message })`, then re-throw
- **Files:**
  - `apps/worker/src/workers/search.worker.ts`
- **Verify:** Trigger a search from the UI; `search_runs` table shows a row with correct `status`, `startedAt`, `completedAt`, and `jobCount`. Corresponding jobs have the matching `runId`.

### Phase 3: API Layer

#### 3.1. [x] Add `runsRouter` with a `list` query
- **What:** Create `packages/api/src/routers/runs.ts` with a single `protectedProcedure` query `list` (no input) that calls `listSearchRuns(ctx.db, ctx.session.user.id)` and returns the result.
- **Files:**
  - Create `packages/api/src/routers/runs.ts`
- **Verify:** `pnpm typecheck` passes in `packages/api`

#### 3.2. [x] Register router and update exports
- **What:**
  - Add `runs: runsRouter` to `appRouter` in `packages/api/src/router.ts`
  - Export `listSearchRuns` from `packages/api/src/index.ts` for use in server components
- **Files:**
  - `packages/api/src/router.ts`
  - `packages/api/src/index.ts`
- **Verify:** `pnpm typecheck` passes across all packages (`pnpm typecheck`)

#### 3.3. [x] Unit tests for runs router
- **What:** Write `packages/api/src/routers/runs.test.ts` covering:
  - Returns the list from `listSearchRuns` for the authenticated user
  - Returns an empty array when no runs exist
  - Throws `UNAUTHORIZED` when session is null
  Follow the hoisted mock + chainable DB mock pattern from `jobs.test.ts`.
- **Files:**
  - Create `packages/api/src/routers/runs.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run` passes

### Phase 4: Web UI

#### 4.1. [x] Install shadcn table component
- **What:** Run `npx shadcn@latest add table` from `apps/web/` to install the Table, TableBody, TableCell, TableHead, TableHeader, TableRow components.
- **Files:** `apps/web/components/ui/table.tsx` (auto-generated)
- **Verify:** File exists at `apps/web/components/ui/table.tsx`

#### 4.2. [x] Add `/runs` page (server + client)
- **What:**
  - Server component `apps/web/app/(app)/runs/page.tsx`: call `getSession()`, redirect to `/sign-in` if null, call `listSearchRuns(db, session.user.id)`, render `<RunsClient initialRuns={runs} />`
  - Client component `apps/web/components/runs/runs-client.tsx`: typed with `RouterOutputs["runs"]["list"]`, `useQuery` with `initialData`, renders a `Table` with columns: Platform, Status (Badge coloured by status), Started, Completed, Duration (derived), Jobs Found, Error (only shown when status is `"failed"`)
  - Badge variants: `completed` → default (green), `failed` → destructive (red), `running` → secondary (yellow), `pending` → outline
- **Files:**
  - Create `apps/web/app/(app)/runs/page.tsx`
  - Create `apps/web/components/runs/runs-client.tsx`
- **Verify:** `pnpm turbo dev --filter=web`; navigate to `/runs` — table renders with correct columns and data.

#### 4.3. [x] Add "Runs" nav item
- **What:** Add `{ href: "/runs", label: "Runs", icon: RiHistoryLine }` to `NAV_LINKS`. Import `RiHistoryLine` from `remixicon-react` (already a dependency).
- **Files:**
  - `apps/web/components/nav/sidebar.tsx`
- **Verify:** Sidebar shows a "Runs" link that navigates to `/runs` and highlights as active when on that route.

## Completed

- **Date:** 2026-05-25
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/schema/enums.ts` — extracted all enums + new `searchRunStatusEnum`
  - `packages/db/src/schema/search-runs.ts` — new `searchRuns` table with status, criteria snapshot, job count
  - `packages/db/src/schema/jobs.ts` — added non-nullable `runId` FK to `searchRuns`
  - `packages/db/src/schema/index.ts` — re-exports `enums` and `search-runs`
  - `packages/db/src/queries/search-runs.ts` — `insertSearchRun`, `updateSearchRun`, `listSearchRuns`
  - `packages/db/src/queries/index.ts` — re-exports `search-runs`
  - `packages/db/drizzle/` — fresh migration applied (DB wiped and rebuilt)
  - `packages/automation/src/search.ts` — accepts `runId`, updates run to `running`, returns job count
  - `apps/worker/src/workers/search.worker.ts` — creates run, wraps search in try/catch, marks completed/failed
  - `packages/ai/src/agents/apply-agent.test.ts` — added `runId` to `mockJob` fixture
  - `packages/api/src/routers/runs.ts` — `runsRouter` with `list` query
  - `packages/api/src/router.ts` — registered `runs: runsRouter`
  - `packages/api/src/index.ts` — exports `listSearchRuns` for server components
  - `packages/api/src/routers/runs.test.ts` — 3 unit tests
  - `apps/web/app/(dashboard)/runs/page.tsx` — server component fetching runs
  - `apps/web/components/runs/runs-client.tsx` — client table with status badges and duration
  - `apps/web/components/nav/sidebar.tsx` — added "Runs" nav link with `RiHistoryLine` icon
  - `apps/web/components/ui/table.tsx` — installed via `npx shadcn@latest add table`
- **How to test:**
  1. `pnpm dev` to start web + worker
  2. Sign in, navigate to `/runs` — should show empty state
  3. Go to Jobs, click "Search Jobs" — worker creates a run, scrapes, completes
  4. Refresh `/runs` — row appears with platform, status, times, job count
- **Follow-up items:**
  - Partial failure: if `runSearch` throws mid-scrape, jobs already inserted remain but `jobCount: 0` on the failed run
  - No pagination — flat SELECT; add limit/offset if list grows long
  - `pending`/`running` rows are transient (worker crash = stuck row); no cleanup mechanism for MVP

## Notes

- **Circular import resolved by task 1.1:** Without extracting `platformEnum`, `jobs.ts` would import `searchRuns` (for FK) and `search-runs.ts` would import `platformEnum` from `jobs.ts` — a circular module graph. Moving the enum to `enums.ts` breaks the cycle cleanly.
- **Run lifecycle:** `pending` = job accepted by worker, not yet started. `running` = criteria fetched, scrape in progress. These states exist for a very brief window in practice; a stuck `pending`/`running` run signals a worker crash.
- **Partial failure job count:** If `runSearch` inserts N jobs then throws, those jobs remain in the DB with valid `runId`, but the run is marked `failed` with `jobCount: 0`. A future improvement could count inserted rows even on partial failure.
- **`searchCriteria` shape:** Store as `{ jobTitles: string[], skills: string[], locations: string[] }`. Consider exporting a `SearchCriteriaSnapshot` type from `packages/db` for use at the query and service layers.
- **No pagination for MVP:** The runs list is a flat `SELECT` with no limit. Add pagination if the list grows unwieldy.
