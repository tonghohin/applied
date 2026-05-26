# Plan: Job Deduplication

> Prevent duplicate job rows across search runs, cap first-run scraping to 30 days, and skip already-seen listings on subsequent runs by tracking each job's LinkedIn `listedAt` date.

## Research Summary

- **Stack:** Drizzle ORM + PostgreSQL, Vitest, TypeScript
- **Relevant patterns:** `profiles` and `jobCriteria` use `onConflictDoUpdate` — same Drizzle API surface; `insertJobs` is the only write path for job rows
- **Key files:**
  - `packages/db/src/schema/jobs.ts` — table definition, add unique index + `listedAt` column
  - `packages/db/src/queries/jobs.ts` — `insertJobs`, new `getLatestListedAtForUser`
  - `packages/db/drizzle/` — migration output directory (auto-named by drizzle-kit)
  - `packages/automation/src/types.ts` — `ScrapedJob`, add `listedAt`
  - `packages/automation/src/linkedin/scraper.ts` — pagination + cutoff logic
  - `packages/automation/src/search.ts` — wire `sinceDate` into scraper call
- **New dependencies:** none
- **Risks/Considerations:**
  - `onConflictDoNothing` silently skips conflicting rows; `insertJobs` stays `void` so no call-site changes needed beyond passing `listedAt`.
  - The unique index is on `(user_id, url)` only — `platform` is omitted because LinkedIn URLs are already globally unique.
  - `listedAt` is confirmed present on every LinkedIn job card (`time[datetime]` attribute). Stored as a nullable column to be safe in case LinkedIn's DOM ever changes.

## Tasks

### Phase 1: Schema + Migration

#### 1.1. [x] Add unique index and `listedAt` column to jobs schema
- **What:** In the jobs schema file: (1) import `uniqueIndex` from `drizzle-orm/pg-core` and add a second argument to `pgTable` with `.uniqueIndex("jobs_user_id_url_unique", (t) => [t.userId, t.url])`; (2) add `listedAt: timestamp("listed_at")` as a nullable column.
- **Files:** `packages/db/src/schema/jobs.ts`
- **Verify:** `pnpm typecheck` passes with no errors.

#### 1.2. [x] Generate and apply the migration
- **What:** Run `pnpm generate` then `pnpm migrate`. DB is clean so no pre-existing duplicates to handle.
- **Files:** new file in `packages/db/drizzle/` (auto-named by drizzle-kit)
- **Verify:** `pnpm migrate` completes without error; `\d jobs` in psql shows the unique index on `(user_id, url)` and a `listed_at` column.

### Phase 2: Scraper Pagination

#### 2.1. [x] Normalize job URLs to strip tracking parameters
- **What:** In `scrapeJobsPage`, replace the `linkEl.href` extraction with a canonical URL built from the card's `data-occludable-job-id` attribute: `https://www.linkedin.com/jobs/view/${card.getAttribute("data-occludable-job-id")}/`. This produces a stable, parameter-free URL that is identical across scrapes, making both the `seen` Set and the DB unique constraint reliable. Filter out cards where the attribute is missing or empty.
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** `pnpm typecheck` passes; logged URLs contain no query parameters.

#### 2.2. [x] Extract `listedAt` from job cards
- **What:** Add `listedAt?: string` to `ScrapedJob` in `types.ts`. In `scrapeJobsPage`, add `const timeEl = card.querySelector("time[datetime]")` and include `listedAt: timeEl?.getAttribute("datetime") ?? undefined` in the returned object.
- **Files:** `packages/automation/src/types.ts`, `packages/automation/src/linkedin/scraper.ts`
- **Verify:** `pnpm typecheck` passes.

#### 2.3. [x] Wrap `fetchDescription` in per-job error handling
- **What:** Wrap the `fetchDescription` call in a try/catch. On failure, log the error and fall back to an empty string so a single flaky job page cannot abort the entire run.
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** `pnpm typecheck` passes.

#### 2.4. [x] Paginate up to 10 pages with a `sinceDate` cutoff
- **What:** Add `sinceDate?: Date` parameter to `scrapeLinkedInJobs`. Extract `const MAX_PAGES = 10` and `const CUTOFF_MS = 30 * 24 * 60 * 60 * 1000` as module-level constants. Compute `const effectiveCutoff = sinceDate ?? new Date(Date.now() - CUTOFF_MS)` inside the function. Change the pagination loop from `pageNum < 3` to `pageNum < MAX_PAGES`. Per `jobTitle × location`: if a card's `listedAt` is older than `effectiveCutoff`, skip that card and break pagination — jobs are sorted newest-first so everything after is also old.
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** `pnpm typecheck` passes.

#### 2.5. [x] Update scraper tests
- **What:** In `packages/automation/src/linkedin/scraper.test.ts` (new): test (1) URL normalization — cards with `data-occludable-job-id` produce canonical URLs with no query params; (2) cutoff logic — mock `scrapeJobsPage` to return jobs with known `listedAt` values and assert old jobs are skipped and pagination stops; (3) `fetchDescription` failure — assert the job is still included with an empty description.
- **Files:** `packages/automation/src/linkedin/scraper.test.ts` (new)
- **Verify:** `pnpm --filter @repo/automation exec vitest run` passes.

### Phase 3: Query Layer + Wiring

#### 3.1. [x] Store `listedAt` in `insertJobs` and switch to `onConflictDoNothing`
- **What:** Chain `.onConflictDoNothing()` onto the insert. In `search.ts`, add `listedAt: job.listedAt ? new Date(job.listedAt) : null` to the row mapping so the value is persisted. No signature change to `insertJobs`.
- **Files:** `packages/db/src/queries/jobs.ts`, `packages/automation/src/search.ts`
- **Verify:** `pnpm typecheck` passes.

#### 3.2. [x] Add `getLatestListedAtForUser` query
- **What:** Add a new exported function to `packages/db/src/queries/jobs.ts` that runs `SELECT MAX(listed_at) FROM jobs WHERE user_id = ?` and returns `Date | null`. Export it from `packages/db/src/queries/index.ts`.
- **Files:** `packages/db/src/queries/jobs.ts`, `packages/db/src/queries/index.ts`
- **Verify:** `pnpm typecheck` passes.

#### 3.3. [x] Wire `sinceDate` into `runSearch`
- **What:** In `runSearch`, call `getLatestListedAtForUser(db, userId)` before the scrape. Pass the result as `sinceDate` to `scrapeLinkedInJobs`. On first run it returns `null` so the 30-day cutoff applies automatically.
- **Files:** `packages/automation/src/search.ts`
- **Verify:** `pnpm typecheck` passes.

#### 3.4. [x] Unit tests for DB query layer
- **What:** In `packages/db/src/queries/jobs.test.ts` (new): test `insertJobs` with `onConflictDoNothing` — cover fresh insert, all-duplicate batch (no error thrown), and verify `listedAt` is included in the values. Test `getLatestListedAtForUser` returns `Date | null`. Use the chainable mock builder pattern from `packages/api/src/routers/jobs.test.ts`.
- **Files:** `packages/db/src/queries/jobs.test.ts` (new)
- **Verify:** `pnpm --filter @repo/db exec vitest run` passes.

## Completed

- **Date:** 2026-05-25
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/schema/jobs.ts` — added `listedAt` timestamp column and `UNIQUE(user_id, url)` index
  - `packages/db/drizzle/0001_next_slyde.sql` — migration with `ALTER TABLE` + `CREATE UNIQUE INDEX`
  - `packages/db/src/queries/jobs.ts` — `insertJobs` uses `onConflictDoNothing`; new `getLatestListedAtForUser`
  - `packages/db/src/queries/jobs.test.ts` — new: 5 tests for insertJobs and getLatestListedAtForUser
  - `packages/db/package.json` + `packages/db/vitest.config.ts` — vitest added to db package
  - `packages/automation/src/types.ts` — `listedAt: string` added to `ScrapedJob`
  - `packages/automation/src/linkedin/scraper.ts` — canonical URLs, listedAt extraction, fetchDescription fallback, 10-page pagination with sinceDate cutoff
  - `packages/automation/src/linkedin/scraper.test.ts` — new: 4 tests covering cutoff, sinceDate, description fallback, dedup
  - `packages/automation/src/search.ts` — queries `getLatestListedAtForUser`, passes `sinceDate` to scraper, persists `listedAt`
  - `packages/ai/src/agents/apply-agent.test.ts` — added `listedAt: null` to mock job fixture
  - `packages/automation/src/scorer.test.ts` — added `listedAt` to mock job fixture
- **How to test:**
  - `pnpm --filter @repo/db exec vitest run` — 5 DB query tests
  - `pnpm --filter @repo/automation exec vitest run` — 9 scraper + scorer tests
  - `pnpm migrate` — apply schema migration before running the app
- **Follow-up items:**
  - 2 pre-existing test failures in `@repo/api` (unrelated to this feature)
  - Future: `onConflictDoUpdate` for `pending_review` rows can refresh stale job descriptions without schema changes

## Notes

- The `seen` Set in `scrapeLinkedInJobs` stays — it guards against the same URL appearing twice on different pages within a single run, which avoids redundant `fetchDescription` calls regardless of cutoff.
- On subsequent runs, `sinceDate` will typically be hours or days ago, so pagination will usually stop on page 1 or 2 — this makes repeated runs very fast.
- Future: a "refresh on re-scrape" mode (`onConflictDoUpdate` for `pending_review` rows) can be layered on later without schema changes — the unique index is already the right foundation.
