# Plan: Job Score Reasoning

> Add an LLM-generated prose `reasoning` explanation alongside the existing 0-100 job match score, driven by a clearer weighted-dimension rubric, and surface it in the score tooltip that's already on the dashboard.

## Research Summary

- **Stack:** Turborepo monorepo — `packages/ai` (AI SDK + Gemini via `createGateway`), `packages/db` (Drizzle/Postgres), `packages/automation` (Playwright scraper), `apps/worker` (BullMQ), `apps/web` (Next.js 16 App Router).
- **Relevant patterns:**
  - `packages/ai/src/agents/score-job.ts` — `scoreJob()` uses `generateText` + `Output.object({ schema })` (Gemini 2.5 Flash Lite via AI Gateway) to produce structured output. Currently schema only has `score` (int 0-100); function returns `Promise<number>`.
  - `packages/automation/src/search.ts` — `runSearch()` accepts `scoreJob: (job: ScrapedJob) => Promise<number>` as an injected callback (keeps `packages/automation` free of an `packages/ai` dependency), calls it via `Promise.all`, and writes `score: scores[index]` into `insertJobs`.
  - `apps/worker/src/workers/search.worker.ts` — wires the real `scoreJobWithLLM` into that callback.
  - `packages/db/src/schema/jobs.ts` — `jobs` table, `score: integer("score").notNull().default(0)`.
  - `packages/db/src/queries/jobs.ts` — `insertJobs(db, rows: NewJob[])` where `NewJob = typeof jobs.$inferInsert`; the main list query (`getJobsForUser`-equivalent, `jobs.service.ts:30`) uses `.select()` (all columns), so a new column flows to the tRPC output automatically. Only `dashboard.service.ts` explicitly picks columns (`id/title/company/status/score/createdAt/appliedAt/updatedAt`) and does not need the new field.
  - `apps/web/components/jobs/job-score.tsx` — `ScoreRing` renders a shadcn `Tooltip` with a single hardcoded `SCORE_EXPLANATION` string, used only from `apps/web/components/jobs/job-list-item.tsx:52`. No other usages exist (`job-detail.tsx` doesn't render a score at all).
- **Key files:**
  - `packages/ai/src/agents/score-job.ts`
  - `packages/automation/src/search.ts`
  - `apps/worker/src/workers/search.worker.ts`
  - `packages/db/src/schema/jobs.ts`
  - `apps/web/components/jobs/job-score.tsx`, `apps/web/components/jobs/job-list-item.tsx`
- **New dependencies:** none.
- **Risks/Considerations:**
  - Schema field **order** matters for structured-output quality: put `reasoning` before `score` in the Zod schema so the model writes its explanation first and the score follows from it (chain-of-thought via field order), rather than justifying a number decided first.
  - Making `scoreReasoning` `NOT NULL` on a populated table normally makes `drizzle-kit generate` prompt interactively for a default (see project memory: drizzle migration TTY issue). Avoid the prompt entirely by declaring a DB-level `.default(...)` on the column in the schema — this backfills all existing rows and satisfies `NOT NULL` without any interactive step. New inserts always pass an explicit `scoreReasoning`, so the default is only ever hit by legacy rows.
  - `scoreJob`'s return type changes from `Promise<number>` to `Promise<{ score: number; reasoning: string }>` — every call site and mock must change shape together, or type errors will surface across three packages at once. Do this in one task to avoid a half-migrated state.
  - Six existing test files build `Job`-shaped fixtures/mocks and will fail to typecheck once `scoreReasoning` becomes a required field: `packages/ai/src/agents/generate-cover-letter.test.ts`, `packages/ai/src/agents/apply-agent.test.ts`, `packages/db/src/queries/jobs.test.ts`, `apps/web/components/sse-provider.test.ts`, `apps/web/lib/jobs-filter.test.ts` (via its `makeJob` factory), and `apps/worker/src/workers/search.worker.test.ts` (`mockScoreJob`).

## Tasks

### Phase 1: AI scoring — rubric + reasoning field

#### 1.1. [x] Rewrite `scoreSchema` and instructions in `score-job.ts`
- **What:** Add a `reasoning` string field to `scoreSchema`, ordered **before** `score`, described as "2-4 sentences on what in the resume matched the job's requirements and what didn't, written for a candidate deciding whether to apply." Rewrite the `instructions` string into an explicit weighted rubric: skills/experience overlap (50%), seniority fit (20%), role/industry relevance (20%), salary fit (10%, applied as a penalty when a listed salary falls below the candidate's minimum) — tell the model to weigh each dimension, note the salary penalty rule explicitly, and only then commit to the final 0-100 integer. Change `scoreJob`'s return type from `Promise<number>` to `Promise<{ score: number; reasoning: string }>`, returning `{ score: clamped, reasoning: output.reasoning }`.
- **Files:** `packages/ai/src/agents/score-job.ts`
- **Verify:** `pnpm --filter @repo/ai exec tsc --noEmit` (or `pnpm typecheck`) passes; manually inspect the new instructions string reads as a clear, unambiguous rubric.

#### 1.2. [x] Add a unit test for `scoreJob`
- **What:** New `packages/ai/src/agents/score-job.test.ts` following the `vi.mock("ai", ...)` + `vi.hoisted` pattern used in `generate-cover-letter.test.ts`. Mock `generateText` to resolve `{ output: { reasoning: "...", score: 85 } }` and assert `scoreJob` returns `{ score: 85, reasoning: "..." }` unchanged; add a case asserting the score is clamped to `[0, 100]` if the mocked output is out of range.
- **Files:** `packages/ai/src/agents/score-job.test.ts` (new)
- **Verify:** `pnpm --filter @repo/ai exec vitest run`

### Phase 2: Data layer

#### 2.1. [x] Add `scoreReasoning` column to the `jobs` schema
- **What:** Add `scoreReasoning: text("score_reasoning").notNull().default("Legacy job — no AI reasoning recorded.")` to `packages/db/src/schema/jobs.ts`, placed next to the existing `score` column.
- **Files:** `packages/db/src/schema/jobs.ts`
- **Verify:** Column appears in `Job` type (`typeof jobs.$inferSelect`) via `pnpm --filter @repo/db exec tsc --noEmit`.

#### 2.2. [x] Generate and run the migration
- **What:** Run `pnpm generate` (drizzle-kit generate) to produce the new migration SQL adding `score_reasoning text NOT NULL DEFAULT '...'`, then `pnpm migrate` to apply it. Since the column has a schema-level default, this should not require an interactive default-value prompt — if drizzle-kit still prompts (e.g. it doesn't pick up `.default()` for the `NOT NULL` backfill step), fall back to hand-writing the migration SQL directly per the drizzle-migration-TTY project note, being careful to also update `packages/db/drizzle/meta/_journal.json` and snapshot the way prior hand-written migrations in this repo have done.
- **Files:** `packages/db/drizzle/00XX_*.sql` (new), `packages/db/drizzle/meta/*`
- **Verify:** `pnpm migrate` completes without error; spot-check with `psql`/db client that existing job rows now have `score_reasoning = 'Legacy job — no AI reasoning recorded.'`.

#### 2.3. [x] Update `Job`-shaped test fixtures across the repo
- **What:** Add a `scoreReasoning` value to every hand-built `Job` object so TypeScript compiles: `packages/ai/src/agents/generate-cover-letter.test.ts` (`mockJob`), `packages/ai/src/agents/apply-agent.test.ts`, `packages/db/src/queries/jobs.test.ts`, `apps/web/components/sse-provider.test.ts`, and the `makeJob` factory in `apps/web/lib/jobs-filter.test.ts`.
- **Files:** the five files above
- **Verify:** `pnpm typecheck` (repo-wide) passes with no `Job`-shape errors.

### Phase 3: Wiring the new return shape through search

#### 3.1. [x] Update `runSearch`'s scorer callback type and job insert
- **What:** In `packages/automation/src/search.ts`, change the `scoreJob` param type to `(job: ScrapedJob) => Promise<{ score: number; reasoning: string }>`, rename the resolved array to `scored` (or similar) and update the `insertJobs` mapping to spread `score: scored[index].score, scoreReasoning: scored[index].reasoning`.
- **Files:** `packages/automation/src/search.ts`
- **Verify:** `pnpm --filter @repo/automation exec tsc --noEmit`

#### 3.2. [x] Update the worker's scorer wiring
- **What:** In `apps/worker/src/workers/search.worker.ts`, no signature change is needed since `scorer` just forwards to `scoreJobWithLLM` — but update `search.worker.test.ts`'s `mockScoreJob` to resolve `{ score: 75, reasoning: "..." }` instead of a bare `75`, and check the test's assertions on the inserted job row for a `score` field that may need a companion `scoreReasoning` expectation.
- **Files:** `apps/worker/src/workers/search.worker.test.ts`
- **Verify:** `pnpm --filter @repo/worker exec vitest run`

### Phase 4: UI — show reasoning in the score tooltip

#### 4.1. [x] Thread `reasoning` into `ScoreRing`
- **What:** Change `ScoreRing`'s props to `{ score, reasoning, className }`, delete the hardcoded `SCORE_EXPLANATION` constant, and render `reasoning` inside `TooltipContent` instead. Update the call in `job-list-item.tsx` to `<ScoreRing score={job.score} reasoning={job.scoreReasoning} />`.
- **Files:** `apps/web/components/jobs/job-score.tsx`, `apps/web/components/jobs/job-list-item.tsx`
- **Verify:** Run `pnpm turbo dev --filter=web`, open the dashboard, hover a job's score ring, confirm the per-job reasoning text renders (including for a legacy job showing the backfilled placeholder text).

## Notes

- Dashboard stat cards (`stat-cards.tsx`) and `dashboard.service.ts` intentionally stay untouched — they only ever needed the numeric score for the ≥70 "strong match" count, not the reasoning text.
- `job-detail.tsx` does not currently render a score at all; per user direction this feature only needs to land in the existing tooltip (`ScoreRing`), so no detail-panel changes are in scope.
- The rubric weights (50/20/20/10) are a reasonable default split reflecting the existing instruction's emphasis order (skill overlap first, then seniority/role/industry, salary as a hard modifier) — flagged here in case the user wants to tune the split before building.
- If `pnpm generate`'s interactive prompt can't be avoided by the schema-level default (see 2.2), the builder should stop and hand-write the migration rather than guessing at drizzle's snapshot format from scratch — cross-reference an existing simple column-add migration in `packages/db/drizzle/` for the exact SQL/meta shape.

## Completed

- **Date:** 2026-09-17
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/ai/src/agents/score-job.ts` — added weighted rubric (skills/experience 50%, seniority 20%, role/industry 20%, salary penalty 10%) to the instructions; `scoreSchema` now has `reasoning` (ordered before `score`) and `scoreJob` returns `{ score, reasoning }` instead of a bare number
  - `packages/ai/src/agents/score-job.test.ts` (new) — unit tests for the return shape and score clamping
  - `packages/db/src/schema/jobs.ts` — added `scoreReasoning` text column, `NOT NULL` with a schema-level default for legacy-row backfill
  - `packages/db/drizzle/0029_slow_mystique.sql` (new) — migration adding the column, applied to the dev database
  - `packages/automation/src/search.ts` — `scoreJob` callback type updated; scoring and row-building merged into one `Promise.all` map to avoid an indexed-lookup possibly-undefined issue
  - `apps/web/components/jobs/job-score.tsx` — `ScoreRing` takes a `reasoning` prop instead of a hardcoded static explanation string
  - `apps/web/components/jobs/job-list-item.tsx` — passes `job.scoreReasoning` into `ScoreRing`
  - Test fixture updates: `packages/ai/src/agents/generate-cover-letter.test.ts`, `packages/ai/src/agents/apply-agent.test.ts`, `apps/web/components/sse-provider.test.ts`, `apps/web/lib/jobs-filter.test.ts`, `apps/worker/src/workers/search.worker.test.ts`
- **How to test:** Run a new job search — jobs scored from now on will carry a real per-job reasoning string. Hover a job's score ring in the dashboard job list to see it in the tooltip. Existing jobs show the backfilled placeholder ("Legacy job — no AI reasoning recorded.") until re-scored.
- **Follow-up items:**
  - Manual in-browser verification of the tooltip wasn't completed — the running dev server required login credentials I didn't have and wasn't willing to guess/bypass. Wiring was instead confirmed via full-repo typecheck, lint, and the 128-test suite all passing; a quick manual hover-check by the user is worth doing before considering this fully done.
  - The rubric weights (50/20/20/10) are a first pass — tune them in `score-job.ts` if real scoring output doesn't feel right in practice.
