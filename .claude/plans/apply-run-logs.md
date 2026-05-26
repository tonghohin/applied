# Plan: Apply Run Logs

> Log each job apply attempt step-by-step and display the log inline on the job card, so users can see what happened instead of a silent failure.

## Research Summary

- **Stack:** Turborepo monorepo — Next.js 16 App Router, tRPC, Drizzle/Postgres, BullMQ, Gemini AI SDK
- **Relevant patterns:**
  - `search_runs` table (`packages/db/src/schema/search-runs.ts`) is the exact model to mirror — same status enum shape, same insert/update query pattern
  - Search worker (`apps/worker/src/workers/search.worker.ts`) creates a run row, wraps the job in try/catch, updates status on success/failure — apply worker should follow the same structure
  - `listJobs` service (`packages/api/src/services/jobs.service.ts`) is a simple `db.select()` — will be extended to join latest apply run per job
  - Job type flows from `listJobs` → tRPC router → `RouterOutputs["jobs"]["list"][number]` → `Job` in job-card — no manual type updates needed
  - DB mock pattern in tests uses a chainable `vi.fn()` builder (see `packages/db/src/queries/jobs.test.ts`)
- **Key files:**
  - `packages/db/src/schema/enums.ts` — add `applyRunStatusEnum`
  - `packages/db/src/schema/search-runs.ts` — model for new schema file
  - `packages/db/src/queries/search-runs.ts` — model for new queries file
  - `packages/ai/src/agents/process-apply.ts` — add `log` callback, instrument steps
  - `packages/ai/src/agents/apply-agent.ts` — add `log` callback, instrument steps
  - `apps/worker/src/workers/apply.worker.ts` — create/update apply_run rows
  - `packages/api/src/services/jobs.service.ts` — extend `listJobs` to merge apply runs
  - `apps/web/components/jobs/job-card.tsx` — render log section
- **New dependencies:** none
- **Risks/Considerations:**
  - `processApplyJob` currently returns `void` and doesn't throw for known agent failures (it catches them and calls `updateJobFailed`). Apply run status = `"completed"` for both successful and known-failure outcomes; status = `"failed"` only for unexpected exceptions. The logs capture the full story in both cases.
  - `inArray(applyRuns.jobId, [])` must be guarded — Drizzle/Postgres errors on empty `IN ()`. Guard with early return in `listLatestApplyRunsByJobIds`.
  - Migration must run before any worker code changes are deployed.

## Tasks

### Phase 1: Database — schema, queries, migration

#### 1.1. [x] Add `applyRunStatusEnum` and create `apply_runs` schema
- **What:** Add `applyRunStatusEnum` (values: `"pending" | "running" | "completed" | "failed"`) to `enums.ts`. Create `packages/db/src/schema/apply-runs.ts` mirroring the `search_runs` shape, with columns: `id`, `jobId` (FK → jobs, cascade), `userId` (FK → users, cascade), `status`, `startedAt`, `completedAt`, `errorMessage`, `logs` (jsonb typed as `{ timestamp: string; message: string }[]`, default `[]`). Export `ApplyRun = typeof applyRuns.$inferSelect`.
- **Files:**
  - `packages/db/src/schema/enums.ts` (modify)
  - `packages/db/src/schema/apply-runs.ts` (create)
- **Verify:** `pnpm typecheck` from repo root passes with no new errors.

#### 1.2. [x] Create apply-runs query functions
- **What:** Create `packages/db/src/queries/apply-runs.ts` with three functions:
  - `insertApplyRun(db, data)` — inserts and returns the row (same pattern as `insertSearchRun`)
  - `updateApplyRun(db, runId, updates)` — updates by id (same pattern as `updateSearchRun`)
  - `listLatestApplyRunsByJobIds(db, jobIds)` — returns one row per jobId (the most recent by `startedAt`). Fetch all rows with `inArray(applyRuns.jobId, jobIds)` ordered by `desc(applyRuns.startedAt)`, then deduplicate in JS keeping the first seen per `jobId`. Guard with `if (jobIds.length === 0) return []`.
- **Files:**
  - `packages/db/src/queries/apply-runs.ts` (create)
- **Verify:** `pnpm typecheck` passes; imports resolve correctly.

#### 1.3. [x] Wire into indexes and run migration
- **What:** Export the new schema and queries from their respective index files. Then generate and run the migration.
  - Add `export * from "./apply-runs"` to `packages/db/src/schema/index.ts`
  - Add `export * from "./apply-runs"` to `packages/db/src/queries/index.ts`
  - Run `pnpm generate` then `pnpm migrate`
- **Files:**
  - `packages/db/src/schema/index.ts` (modify)
  - `packages/db/src/queries/index.ts` (modify)
- **Verify:** Migration succeeds; `apply_runs` table visible in DB.

### Phase 2: Apply pipeline instrumentation

#### 2.1. [x] Thread `log` callback through `processApplyJob` and `applyToJob`
- **What:** Add an optional `log: (msg: string) => void = () => {}` parameter (last position) to both `processApplyJob` and `applyToJob`. Inside each, add `log(...)` calls at key boundaries:
  - `processApplyJob`: `"Fetching job and profile"`, `"Generating resume PDF"`, `"Launching AI agent"`, then after result: `"Application submitted successfully"` (success) or `"Application failed: {reason}"` (failure).
  - `applyToJob`: `"Initializing Playwright session"`, `"Session restored from saved state"` or `"Starting fresh session"`, `"AI agent running (up to 30 steps)"`, `"AI agent finished"`.
  - Pass `log` from `processApplyJob` into `applyToJob`.
- **Files:**
  - `packages/ai/src/agents/process-apply.ts` (modify)
  - `packages/ai/src/agents/apply-agent.ts` (modify)
- **Verify:** `pnpm typecheck` passes; existing callers of `processApplyJob` without a `log` arg still compile (default no-op).

#### 2.2. [x] Update apply worker to create and update apply_run rows
- **What:** In `apply.worker.ts`, restructure the BullMQ handler to:
  1. Create a log accumulator: `const logs: { timestamp: string; message: string }[] = []` and `const log = (msg: string) => logs.push({ timestamp: new Date().toISOString(), message: msg })`.
  2. Insert an apply_run row with status `"running"` before calling `processApplyJob`.
  3. Wrap `processApplyJob(db, jobId, userId, linkedinSessionJson, log)` in try/catch.
  4. On success (no throw): `updateApplyRun(db, run.id, { status: "completed", completedAt: new Date(), logs })`.
  5. On exception: append the error to logs, then `updateApplyRun(db, run.id, { status: "failed", completedAt: new Date(), errorMessage: err.message, logs })`, re-throw.
  - Import `insertApplyRun` and `updateApplyRun` from `@repo/db`.
- **Files:**
  - `apps/worker/src/workers/apply.worker.ts` (modify)
- **Verify:** Run the worker locally and trigger an apply job — `apply_runs` row appears in DB with logs after completion.

### Phase 3: API — surface apply runs in `listJobs`

#### 3.1. [x] Update `listJobs` service to merge latest apply run per job
- **What:** In `packages/api/src/services/jobs.service.ts`, update `listJobs` to:
  1. Fetch job rows as before.
  2. Extract `jobIds` and call `listLatestApplyRunsByJobIds(db, jobIds)`.
  3. Build a `Map<jobId, ApplyRun>` and merge: return `jobRows.map(job => ({ ...job, latestApplyRun: applyRunByJobId.get(job.id) ?? null }))`.
  - Import `listLatestApplyRunsByJobIds` from `@repo/db`.
- **Files:**
  - `packages/api/src/services/jobs.service.ts` (modify)
- **Verify:** `pnpm typecheck` passes; `trpc.jobs.list` response now includes `latestApplyRun` field (check with a quick console.log in the page or type inspection).

### Phase 4: UI — inline apply log on job card

#### 4.1. [x] Render apply log section in job card
- **What:** Update `JobCard` to accept the updated `Job` type (which now includes `latestApplyRun`). For jobs with `latestApplyRun` and status `"applied"` or `"failed"`, render an expandable log section below the job info. Use a `useState(false)` toggle. The section shows:
  - A "View apply log" / "Hide apply log" toggle button (small, ghost variant).
  - When expanded: a list of log entries, each showing the timestamp (formatted as `h:mm:ss a`) and message. Style with a small monospace font and subtle background. If `latestApplyRun.errorMessage` is present (unexpected crash), show it as a red error line above the log entries.
  - Check `apps/web/components/ui/` for a Collapsible component before using raw HTML — use shadcn Collapsible if installed, otherwise a `<details>`/`<summary>` element.
- **Files:**
  - `apps/web/components/jobs/job-card.tsx` (modify)
- **Verify:** Trigger a failing apply job, reload the jobs page, open the Failed tab — the job card shows the log with steps and failure reason.

### Phase 5: Tests

#### 5.1. [x] Unit tests for apply-runs query functions
- **What:** Create `packages/db/src/queries/apply-runs.test.ts` following the mock pattern in `jobs.test.ts`. Test:
  - `insertApplyRun` calls `insert().values().returning()` and returns the first row.
  - `updateApplyRun` calls `update().set().where()`.
  - `listLatestApplyRunsByJobIds` returns empty array for empty input; returns the most recent run per jobId when multiple runs exist for same jobId.
- **Files:**
  - `packages/db/src/queries/apply-runs.test.ts` (create)
- **Verify:** `pnpm --filter @repo/db exec vitest run` passes.

#### 5.2. [x] Unit test for updated `listJobs` service
- **What:** Add a test in a new `packages/api/src/services/jobs.service.test.ts` (or extend if one exists) that verifies `listJobs` merges `latestApplyRun` correctly: when a job has a matching apply run, it appears on the returned object; when no run exists, `latestApplyRun` is `null`. Mock the DB calls with `vi.fn()`.
- **Files:**
  - `packages/api/src/services/jobs.service.test.ts` (create)
- **Verify:** `pnpm --filter @repo/api exec vitest run` passes.

## Completed

- **Date:** 2026-05-26
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/schema/enums.ts` — added `applyRunStatusEnum`
  - `packages/db/src/schema/apply-runs.ts` — new `apply_runs` table schema + `ApplyRun` / `ApplyRunLog` types
  - `packages/db/src/schema/index.ts` — export apply-runs schema
  - `packages/db/src/queries/apply-runs.ts` — `insertApplyRun`, `updateApplyRun`, `listLatestApplyRunsByJobIds`
  - `packages/db/src/queries/index.ts` — export apply-runs queries
  - `packages/db/drizzle/` — migration files for `apply_runs` table
  - `packages/db/src/queries/jobs.test.ts` — fixed pre-existing mock gap (`.returning` missing from insert chain)
  - `packages/db/src/queries/apply-runs.test.ts` — new tests for all three query functions
  - `packages/ai/src/agents/apply-agent.ts` — added `log` callback param; logs Playwright init, session state, agent start/finish
  - `packages/ai/src/agents/apply-agent.test.ts` — updated 4 callsites to pass `undefined` as explicit 4th arg
  - `packages/ai/src/agents/process-apply.ts` — added `log` callback param; logs fetch, PDF gen, agent launch, result
  - `apps/worker/src/workers/apply.worker.ts` — creates `apply_run` row before job; accumulates log entries; updates status + logs on completion/failure
  - `packages/api/src/services/jobs.service.ts` — `listJobs` now merges `latestApplyRun` into each job
  - `packages/api/src/services/jobs.service.test.ts` — new tests verifying apply run merge logic
  - `apps/web/components/jobs/job-card.tsx` — renders expandable `<details>` log section for applied/failed jobs
- **How to test:**
  1. `pnpm test` — all tests pass
  2. `pnpm typecheck` — clean across all packages
  3. Manually: trigger an apply job, reload the Jobs page, open Failed tab — card shows "View apply log (N steps)" that expands to show timestamped steps and failure reason
- **Follow-up items:**
  - Real-time polling: add `refetchInterval` to the jobs list query when an apply is in-flight (no schema change needed)
  - Consider switching `listJobs` to a single SQL query using Drizzle's `selectDistinctOn` if query count becomes a concern at scale

## Notes

- **Real-time upgrade path:** The current schema and query are polling-ready. To add live updates later, add a `trpc.jobs.getApplyRun.useQuery({ jobId }, { refetchInterval: 2000 })` call in the job card when the apply mutation is in-flight. No schema change needed.
- **`apply_run.status` semantics:** `"completed"` means the process ran to completion (the job may still end up `"failed"` if the agent reported FAILURE). `"failed"` means the process crashed with an unhandled exception. This mirrors the distinction between a job's `failureReason` field (expected) vs an exception in the worker (unexpected).
- **Log granularity:** No AI tool-call tracing (per user preference). The ~6–8 boundary events per run are enough to diagnose most failures without noise.
- **Empty `IN ()` guard:** Drizzle passes the array directly to `pg`, which rejects an empty `IN ()`. The early-return guard in `listLatestApplyRunsByJobIds` is load-bearing — don't remove it.
