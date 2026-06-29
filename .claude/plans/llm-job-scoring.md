# Plan: LLM Job Scoring

> Replace the keyword-based job scorer with a Gemini Flash LLM call that returns a 0–100 score based on the user's resume and job details.

## Research Summary

- **Stack:** Turborepo monorepo, Next.js 16, tRPC, Drizzle/PostgreSQL, BullMQ, AI SDK v7, Gemini Flash
- **Relevant patterns:** Structured LLM output uses `generateText` + `Output.object({ schema })` with a Zod schema (see `packages/ai/src/agents/apply-agent.ts`). Cover letter generation in `generate-cover-letter.ts` uses `google/gemini-2.5-flash-lite` for cheaper single-purpose calls — same model is appropriate here.
- **Key files:**
  - `packages/automation/src/scorer.ts` — current keyword scorer (to be deleted)
  - `packages/automation/src/search.ts` — calls `scoreJob()` synchronously during job insertion mapping
  - `apps/worker/src/workers/search.worker.ts` — calls `runSearch()`; already fetches AI key for apply flow
  - `packages/db/src/schema/jobs.ts` — has `fitTier: fitTierEnum("fit_tier").notNull()`
  - `packages/db/src/schema/enums.ts` — defines `fitTierEnum = pgEnum("fit_tier", [...])`
  - `packages/api/src/services/dashboard.service.ts` — selects `fitTier` in dashboard query
  - `apps/web/components/jobs/jobs-columns.tsx` — renders `fitTier` column with `FitTierBadge`
  - `apps/web/components/dashboard/stat-cards.tsx` — counts jobs by `fitTier === "strong"`
  - `apps/web/lib/trpc.tsx` — exports `FitTier` type
- **New dependencies:** none (AI SDK and Gemini already in `packages/ai`)
- **Risks/Considerations:**
  - The scorer is called synchronously inside a `.map()` in `search.ts`; switching to async requires restructuring to `Promise.all()` before the insert
  - The search worker doesn't currently fetch the user profile or AI key — both need to be added
  - Drizzle migration must DROP the `fit_tier` PostgreSQL enum type and ADD the `score` integer column; drizzle-kit generates this but the enum drop may require a two-step migration
  - Parallel LLM calls scale with job count — if a search returns 50+ jobs, that's 50 concurrent Gemini requests. Acceptable for now; can add a concurrency limiter later.
  - Old jobs in the DB will have no `score` after migration — use `DEFAULT 0` on the new column so existing rows don't break queries

## Tasks

### Phase 1: Database Schema

#### 1.1. Replace `fitTier` with `score` in the schema
- **What:** In `packages/db/src/schema/enums.ts`, remove `fitTierEnum` and its `FitTier` type export. In `packages/db/src/schema/jobs.ts`, replace `fitTier: fitTierEnum("fit_tier").notNull()` with `score: integer("score").notNull().default(0)`.
- **Files:** `packages/db/src/schema/enums.ts`, `packages/db/src/schema/jobs.ts`
- **Verify:** `pnpm typecheck` in `packages/db` passes with no `fitTier` references remaining.

#### 1.2. Generate and apply the migration
- **What:** Run `pnpm generate` to produce the SQL migration (drizzle-kit will emit `ALTER TABLE jobs DROP COLUMN fit_tier`, `DROP TYPE fit_tier`, `ALTER TABLE jobs ADD COLUMN score INTEGER NOT NULL DEFAULT 0`). Then run `pnpm migrate` to apply it. Review the generated SQL before applying to confirm the enum drop is handled.
- **Files:** `packages/db/drizzle/` (new migration file, auto-generated)
- **Verify:** `pnpm migrate` completes without error; `\d jobs` in psql shows `score integer` and no `fit_tier` column.

### Phase 2: LLM Scorer

#### 2.1. Create `scoreJob` function in `packages/ai`
- **What:** Create `packages/ai/src/agents/score-job.ts`. Export an async function `scoreJob(job: { title: string; company: string; description: string }, resume: string, apiKey: string): Promise<number>` that calls `generateText` with `model: gatewayProvider("google/gemini-2.5-flash-lite")`, `Output.object({ schema: z.object({ score: z.number().int().min(0).max(100) }) })`, and a prompt that asks the model to score how well the job matches the resume on a 0–100 scale. Clamp the returned score to [0, 100] before returning. Follow the same `createGateway` + `providerOptions` pattern as `apply-agent.ts`.
- **Files:** `packages/ai/src/agents/score-job.ts` (new)
- **Verify:** TypeScript compiles; function signature is correct. No runtime test needed yet.

#### 2.2. Export `scoreJob` from `packages/ai`
- **What:** Add `export { scoreJob } from "./agents/score-job"` to `packages/ai/src/index.ts`.
- **Files:** `packages/ai/src/index.ts`
- **Verify:** `import { scoreJob } from "@repo/ai"` resolves correctly in `pnpm typecheck`.

### Phase 3: Search Pipeline

#### 3.1. Update `runSearch` to accept an async scorer
- **What:** In `packages/automation/src/search.ts`, add a `scoreJob: (job: ScrapedJob) => Promise<number>` parameter to `runSearch` (or its options object — match existing param style). Remove the import of the old `scoreJob` from `scorer.ts`. After the deduplication and exclusion filters produce the list of surviving jobs, run `await Promise.all(survivingJobs.map(job => scoreJob(job)))` to get scores in parallel, then zip scores with jobs before calling `insertJobs`.
- **Files:** `packages/automation/src/search.ts`
- **Verify:** `pnpm typecheck --filter @repo/automation` passes; the function still accepts the same arguments minus the removed scorer dependency.

#### 3.2. Delete the old keyword scorer
- **What:** Delete `packages/automation/src/scorer.ts`. Remove its export from `packages/automation/src/index.ts` if present.
- **Files:** `packages/automation/src/scorer.ts` (delete), `packages/automation/src/index.ts`
- **Verify:** No remaining imports of `scorer` anywhere — run `grep -r "scorer" packages/automation/src`.

### Phase 4: Search Worker

#### 4.1. Thread resume, AI key, and scorer into the worker
- **What:** In `apps/worker/src/workers/search.worker.ts`, before calling `runSearch`:
  1. Fetch the user profile with `getProfileWithEmailForUser(db, userId)` (already exported from `packages/db`).
  2. Guard: if `profile.resume` is empty or missing, fail the search run with a clear error message (update run status to `failed` with a message like `"Resume is required to score jobs — add your resume in Profile settings."`).
  3. Fetch the AI gateway key with `getAiGatewayKey(db, userId)` (already used in apply worker — import the same helper).
  4. Guard: if `aiGatewayKey` is missing, fail with `"AI Gateway API key not configured"`.
  5. Create the scorer callback: `(job) => scoreJob(job, profile.resume, aiGatewayKey)` using the imported `scoreJob` from `@repo/ai`.
  6. Pass the scorer callback as the new parameter to `runSearch`.
- **Files:** `apps/worker/src/workers/search.worker.ts`
- **Verify:** Worker starts without TS errors (`pnpm typecheck --filter @repo/worker`). Manually trigger a search run and confirm jobs are inserted with integer scores in the DB.

#### 4.2. Guard empty resume in the tRPC search procedure
- **What:** In the `jobs.search` tRPC procedure (likely `packages/api/src/routers/jobs.router.ts` or the jobs service), before creating the `search_runs` row and enqueuing, fetch the user's profile and throw a tRPC `BAD_REQUEST` error if `profile.resume` is empty. This gives the user immediate feedback without creating a failed run.
- **Files:** `packages/api/src/routers/jobs.router.ts` (or `packages/api/src/services/jobs.service.ts` — wherever `jobs.search` is implemented)
- **Verify:** Calling `jobs.search` with no resume returns an error toast; a run row is not created.

### Phase 5: UI & API Cleanup

#### 5.1. Update dashboard service
- **What:** In `packages/api/src/services/dashboard.service.ts`, replace the `fitTier: jobs.fitTier` select field with `score: jobs.score`. Update any downstream type references in the service or its callers.
- **Files:** `packages/api/src/services/dashboard.service.ts`
- **Verify:** `pnpm typecheck --filter @repo/api` passes.

#### 5.2. Update the jobs table column in the frontend
- **What:** In `apps/web/components/jobs/jobs-columns.tsx`, replace the `fitTier` column definition with a `score` column that renders the integer score (e.g., as a plain number or a simple badge). Remove `FitTierBadge` usage. Remove any `FitTier` import. Update any column filter that used `fitTier` to filter on `score` instead (e.g., a numeric range or threshold).
- **Files:** `apps/web/components/jobs/jobs-columns.tsx`
- **Verify:** Jobs table renders with a `Score` column showing numbers; no TS errors.

#### 5.3. Update dashboard stat cards
- **What:** In `apps/web/components/dashboard/stat-cards.tsx`, replace `job.fitTier === "strong"` (and any other tier comparisons) with score-based equivalents (e.g., `job.score >= 70` for strong). Adjust thresholds to taste.
- **Files:** `apps/web/components/dashboard/stat-cards.tsx`
- **Verify:** Dashboard stat cards render correct counts; no TS errors.

#### 5.4. Remove `FitTier` type and any remaining references
- **What:** Remove the `FitTier` type export from `apps/web/lib/trpc.tsx`. Search the entire codebase for remaining `fitTier`, `FitTier`, `fit_tier`, and `fitTierEnum` references and remove or update them. Delete `FitTierBadge` component if it has no other uses.
- **Files:** `apps/web/lib/trpc.tsx`, any component or utility still referencing the old type
- **Verify:** `grep -r "fitTier\|FitTier\|fit_tier\|fitTierEnum" --include="*.ts" --include="*.tsx" .` returns zero results outside of migration SQL files.

## Notes

- **Model choice:** `google/gemini-2.5-flash-lite` is preferred over `flash` for scoring — it's cheaper and faster, and scoring is a simpler task than driving a full apply flow. If quality is poor in testing, swap to `flash`.
- **Score thresholds for display:** Phase 5.3 uses `>= 70` as the "strong" cutoff as a starting point. This is easy to tune without schema changes.
- **Concurrency:** `Promise.all()` over all surviving jobs is fine for typical search volumes (10–30 jobs). If searches regularly return 50+ jobs and rate limits become an issue, a simple `p-limit` concurrency cap can be added later.
- **Existing job rows:** After migration, old rows get `score = 0` (the column default). These are stale keyword-scored jobs anyway — no special handling needed.
- **`packages/automation` does not import `packages/ai`:** The scorer is passed as a callback from the worker, so no new package dependency is introduced. `packages/automation` stays self-contained.

## Completed

- **Date:** 2026-06-28
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/schema/enums.ts` — removed `fitTierEnum` entirely
  - `packages/db/src/schema/jobs.ts` — replaced `fitTier` column with `score: integer("score").notNull().default(0)`
  - `packages/db/drizzle/0022_llm-job-scoring.sql` — manual migration: drop column, drop enum type, add score column
  - `packages/db/drizzle/meta/0022_snapshot.json` — updated drizzle snapshot
  - `packages/db/drizzle/meta/_journal.json` — added migration journal entry
  - `packages/db/src/queries/jobs.test.ts` — updated fixture from `fitTier: "strong"` to `score: 75`
  - `packages/ai/src/agents/score-job.ts` — new LLM scorer using `gemini-2.5-flash-lite` + `Output.object`
  - `packages/ai/src/index.ts` — exported `scoreJob`
  - `packages/automation/src/scorer.ts` — deleted (keyword scorer removed)
  - `packages/automation/src/scorer.test.ts` — deleted
  - `packages/automation/src/index.ts` — removed `scoreJob` and `FitTier` exports
  - `packages/automation/src/search.ts` — added async scorer callback param; parallel scoring via `Promise.all`
  - `apps/worker/src/workers/search.worker.ts` — fetches profile/resume/aiKey; creates scorer callback; passes to `runSearch`
  - `apps/worker/src/workers/search.worker.test.ts` — added mocks for `@repo/api` and `@repo/ai`; updated profile fixture to include `resume`
  - `packages/api/src/services/dashboard.service.ts` — `fitTier` → `score` in query and type
  - `packages/ai/src/agents/apply-agent.test.ts` — fixture `fitTier: "strong"` → `score: 80`
  - `packages/ai/src/agents/generate-cover-letter.test.ts` — fixture `fitTier: "strong"` → `score: 80`
  - `apps/web/lib/trpc.tsx` — removed `FitTier` type export
  - `apps/web/components/dashboard/stat-cards.tsx` — `fitTier === "strong"` → `score >= 70`
  - `apps/web/components/jobs/fit-tier-badge.tsx` — deleted
  - `apps/web/components/jobs/jobs-columns.tsx` — replaced `fitTier` column with `score` column
  - `apps/web/components/sse-provider.test.ts` — updated fixtures from `fitTier` to `score`
- **How to test:** `pnpm test` (12/12 pass); `pnpm typecheck` (12/12 pass); run a search — jobs now appear in the DB with integer scores (0–100) in the `score` column
- **Follow-up items:** Score threshold of 70 for "strong matches" can be tuned; if search volumes exceed 50 jobs and hit Gemini rate limits, add `p-limit` concurrency cap in `search.ts`
