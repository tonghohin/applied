# Plan: Fix Job Search Missing Jobs

> Stop search runs from silently skipping jobs that a manual LinkedIn search shows — replace the broken `listedAt`-based incremental cutoff with URL-based dedup, server-side date filtering, and remove the workplace-type drop on parse failures.

## Research Summary

- **Stack:** Turborepo — `packages/automation` (Playwright scraper), `packages/db` (Drizzle/Postgres), `apps/web` (Next.js 16), Vitest, Biome
- **Root causes (confirmed against live DB):**
  1. `extractCards` fabricates `listedAt = new Date()` when a card has no `time[datetime]` element (the common case in LinkedIn's logged-in UI). The next run's cutoff is `max(listed_at)` = previous run's *scrape time*, so jobs posted hours ago (real date attrs parse to midnight) are skipped. 76 of 83 stored jobs have scrape-time `listed_at` values.
  2. When `fetchJobDetails` throws, the job defaults to `workplaceType: "on-site"` and is dropped if the user's criteria for that location exclude on-site — even though the `f_WT` URL param already had LinkedIn filter by work type server-side.
- **Key files:**
  - `packages/automation/src/linkedin/scraper.ts` — `buildSearchUrl`, `extractCards`, `fetchJobDetails`, `scrapeLinkedInJobs` (cutoff at line 202, workplace filter at line 227)
  - `packages/automation/src/search.ts` — `runSearch`, calls `getLatestListedAtForUser` (line 110), inserts `listedAt` (line 137)
  - `packages/automation/src/types.ts` — `ScrapedJob.listedAt`
  - `packages/db/src/schema/jobs.ts` — `listedAt: timestamp("listed_at").notNull()` (line 28)
  - `packages/db/src/queries/jobs.ts` — `getLatestListedAtForUser`, `insertJobs` (already `onConflictDoNothing` with `(userId, url)` unique index)
  - `apps/web/components/jobs/jobs-columns.tsx` (line 97) + `jobs-data-table.tsx` (line 12) — "Listed" column and default sort on `listedAt`
- **New dependencies:** none
- **Risks/Considerations:**
  - `NewJob = typeof jobs.$inferInsert` — the schema column must be dropped **before** `search.ts` stops passing `listedAt`, or typecheck fails on excess/missing property. Phase order below respects this; full-repo `pnpm typecheck` only passes again at the end of Phase 2.
  - **drizzle-kit generate requires a TTY** — hand-written snapshots make `pnpm migrate` silently no-op. The builder must run `pnpm generate` in a real terminal (or ask the user to run it) — never hand-write migration/snapshot files.
  - Dropping the column also deletes the fabricated historical data — no backfill needed. Existing job rows (and their statuses) are retained; URL dedup means previously missed jobs from the past week get picked up on the next run.
  - `Job` type in `apps/web/lib/trpc` derives from `RouterOutputs`, so it updates automatically once the schema changes.

## Decisions (agreed with user)

- Remove `listedAt` entirely (column + scraping + UI) — most cards have no real date to scrape.
- "New job" detection = URL dedup against the user's stored jobs (skip detail-fetch for known URLs; `onConflictDoNothing` stays as safety net).
- Recency = `f_TPR=r604800` (past week) in the search URL — LinkedIn filters server-side; the 5-page cap already bounds per-run volume (~125 cards/location).
- Never drop a job based on parsed `workplaceType` — trust `f_WT`; store the parsed value as best-effort display data.
- Retry `fetchJobDetails` once before accepting empty details (empty description tanks the fit score — scorer matches skills against `title + description`).
- Log drop-reason counters per run for future diagnosability.
- **Out of scope:** scroll-handling fix, `MAX_PAGES` change.

## Tasks

### Phase 1: Schema & Data Layer

#### 1.1. [x] Drop `listedAt` column and generate migration
- **What:** Remove `listedAt: timestamp("listed_at").notNull()` from the `jobs` table schema. Generate and apply the migration.
- **Files:** `packages/db/src/schema/jobs.ts`
- **Verify:** Run `pnpm generate` (requires TTY — if not available, ask the user to run it; do NOT hand-write snapshot files), then `pnpm migrate`. Confirm with `docker exec applied-postgres-1 psql -U applied -d applied -c "\d jobs"` that `listed_at` is gone and other columns/rows are intact.

#### 1.2. [x] Replace `getLatestListedAtForUser` with `getJobUrlsForUser`
- **What:** In `packages/db/src/queries/jobs.ts`, delete `getLatestListedAtForUser` and add `getJobUrlsForUser(db, userId): Promise<string[]>` — `select({ url: jobs.url }).from(jobs).where(eq(jobs.userId, userId))`, mapped to strings. Barrel (`queries/index.ts`) is `export *`, no change needed.
- **Files:** `packages/db/src/queries/jobs.ts`, `packages/db/src/queries/jobs.test.ts`
- **Verify:** `pnpm --filter @repo/db exec vitest run` — replace the `getLatestListedAtForUser` tests with `getJobUrlsForUser` tests (returns URLs for the user, empty array when none); remove `listedAt` from the `baseJob` fixture and the "includes listedAt in inserted values" test.

### Phase 2: Scraper Pipeline

#### 2.1. [x] Rework `scrapeLinkedInJobs` — URL dedup, `f_TPR`, no client-side date or workplace filtering
- **What:** In `packages/automation/src/linkedin/scraper.ts`:
  - `buildSearchUrl`: add `f_TPR=r604800` (named constant, e.g. `PAST_WEEK_SECONDS`, with a comment that it's LinkedIn's "Date posted: past week" filter).
  - `extractCards`: remove the `time[datetime]` lookup and `listedAt` field entirely.
  - `scrapeLinkedInJobs(page, criteria, knownUrls: Set<string>)`: replace the `sinceDate?: Date` param. Delete `CUTOFF_MS` and the `effectiveCutoff` skip. In the per-job loop, skip when `seen.has(job.url) || knownUrls.has(job.url)` **before** `fetchJobDetails` (this is what keeps re-runs fast).
  - Delete the `if (!locationEntry.workTypes.includes(details.workplaceType)) continue;` post-filter. Keep storing the parsed `workplaceType` (defaults to `"on-site"`) as display data.
  - Retry `fetchJobDetails` once: wrap in a 2-attempt loop; only fall back to the empty-details default after the second failure, and still keep the job.
  - In `packages/automation/src/types.ts`: remove `listedAt` from `ScrapedJob`.
- **Files:** `packages/automation/src/linkedin/scraper.ts`, `packages/automation/src/types.ts`
- **Verify:** `pnpm --filter @repo/automation exec tsc --noEmit` compiles for the package (full-repo typecheck still red until 2.3); detailed behavior covered by tests in 2.4.

#### 2.2. [x] Add drop-reason counters
- **What:** In `scrapeLinkedInJobs`, track per-location counts: `cardsSeen`, `skippedKnown`, `skippedExcluded`, `detailFetchFailed`, `kept`. `console.log` one summary line per location after its pages complete (prefix `[scraper]`, matching the existing `[linkedin]` log style in `search.ts`).
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** Covered by the 2.4 test asserting the summary reflects a known-URL skip (spy on `console.log`), and visible in worker logs during Phase 3 e2e.

#### 2.3. [x] Wire `runSearch` to the new query and signature
- **What:** In `packages/automation/src/search.ts`: replace the `getLatestListedAtForUser` import/call with `getJobUrlsForUser`; build `new Set(urls)` and pass it to `scrapeLinkedInJobs`; remove `listedAt: new Date(job.listedAt)` from the insert payload.
- **Files:** `packages/automation/src/search.ts`
- **Verify:** `pnpm typecheck` passes repo-wide except `apps/web` (UI still references `listedAt` until 3.1); `pnpm --filter @repo/automation exec tsc --noEmit` is clean.

#### 2.4. [x] Update automation tests
- **What:** In `scraper.test.ts`: remove the date-cutoff tests (incl. "stops pagination when listedAt is older than the 30-day cutoff") and `listedAt` from `makeJob`; add tests for: (a) known URL in `knownUrls` is skipped without calling `fetchJobDetails` (assert the details mock wasn't called for that URL), (b) job is kept when `fetchJobDetails` rejects twice (with default workplace type, no drop), (c) details fetch is retried exactly once on first failure, (d) `buildSearchUrl` output includes `f_TPR=r604800` (assert via the URL passed to `page.goto`), (e) counters log line reports the known-URL skip. In `scorer.test.ts`: remove `listedAt` from the `ScrapedJob` fixture.
- **Files:** `packages/automation/src/linkedin/scraper.test.ts`, `packages/automation/src/scorer.test.ts`
- **Verify:** `pnpm --filter @repo/automation exec vitest run` — all green.

### Phase 3: UI & Final Verification

#### 3.1. [x] Switch jobs table from `listedAt` to `createdAt`
- **What:** In `jobs-columns.tsx`: change the column `accessorKey` from `listedAt` to `createdAt`, title "Listed" → "Found" (keep `format(value, "MMM d, yyyy")` via date-fns and `sortingFn: "datetime"`). In `jobs-data-table.tsx`: `initialSorting` id `"listedAt"` → `"createdAt"`. Update the `listedAt: null` fixture in `packages/api/src/services/jobs.service.test.ts` (remove the field).
- **Files:** `apps/web/components/jobs/jobs-columns.tsx`, `apps/web/components/jobs/jobs-data-table.tsx`, `packages/api/src/services/jobs.service.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run` green.

#### 3.2. [x] Full-repo verification
- **What:** Run the complete check suite and an end-to-end search.
- **Files:** none
- **Verify:** `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass. Then `pnpm dev`, trigger a search from the UI, and confirm in worker logs: the search URL contains `f_TPR=r604800`, the per-location counter summary prints, and `skippedKnown` > 0 on a second run. Spot-check that jobs visible on LinkedIn's first page (sorted by most recent, posted hours ago) now appear in the jobs table.

## Notes

- **Migration TTY caveat (important for the builder):** `drizzle-kit generate` needs an interactive terminal; if `pnpm generate` fails or produces nothing in the harness, pause and ask the user to run `pnpm generate` themselves, then continue with `pnpm migrate`. Never hand-write files in `packages/db/drizzle/`.
- **Typecheck is intentionally red mid-build** between tasks 1.1 and 3.1 (schema-derived types ripple through automation and web). Each task's verify step is scoped to what can pass at that point; 3.2 is the global gate.
- **Behavioral change to expect:** the first run after this lands will re-discover up to ~125 jobs per location from the past week that earlier runs missed (they were never stored, so URL dedup won't skip them). This is the bug fix working, not a regression.
- **Known remaining gaps (deliberately out of scope, possible follow-ups):** the lazy-load scroll (`page.mouse.wheel` without hovering the job-list panel) may still capture fewer than 25 cards per page; `MAX_PAGES = 5` caps each location at ~125 results.

## Completed

- **Date:** 2026-06-11
- **All tasks executed successfully:** yes (automated checks; the live-search e2e spot-check is left as a manual step below)
- **Files changed:**
  - `packages/db/src/schema/jobs.ts` — dropped `listedAt` column
  - `packages/db/drizzle/0012_worried_flatman.sql` — generated + applied migration (`DROP COLUMN listed_at`); `pnpm generate` ran fine non-interactively (pure drop needs no TTY prompt)
  - `packages/db/src/queries/jobs.ts` — `getLatestListedAtForUser` → `getJobUrlsForUser`
  - `packages/automation/src/linkedin/scraper.ts` — `f_TPR=r604800` in search URL; removed client-side date cutoff and `time[datetime]` extraction; `knownUrls: Set<string>` param skips already-stored jobs before detail-fetch; removed workplace-type post-filter; one retry on `fetchJobDetails`; per-location drop-reason counter log (`[scraper] …`)
  - `packages/automation/src/types.ts` — removed `ScrapedJob.listedAt`
  - `packages/automation/src/search.ts` — passes known-URL set; no longer inserts `listedAt`
  - `apps/web/components/jobs/jobs-columns.tsx` + `jobs-data-table.tsx` — "Listed" column → "Found" backed by `createdAt`; default sort on `createdAt`
  - Test fixtures/tests updated: `packages/db/src/queries/jobs.test.ts`, `packages/automation/src/linkedin/scraper.test.ts`, `packages/automation/src/scorer.test.ts`, `packages/api/src/services/jobs.service.test.ts`, `packages/ai/src/agents/apply-agent.test.ts`, `packages/ai/src/agents/generate-cover-letter.test.ts`, `apps/web/components/sse-provider.test.ts`
  - Biome-formatted (pre-existing format drift, touched by `--write`): `packages/ai/src/agents/generate-cover-letter.ts`, `packages/ai/src/agents/process-apply.ts`
- **How to test:** `pnpm dev`, trigger a search from the UI. In worker logs expect: search URL containing `f_TPR=r604800`, a `[scraper] <location>: N cards seen, …` summary per location, and on a second run `already stored > 0`. Jobs visible on LinkedIn's first page (most recent sort, posted hours ago) should now appear in the jobs table.
- **Post-build revisions:** drop-reason counters (task 2.2) were later removed at the user's request — the skip logic is plain `continue` statements with no logging; `PAST_WEEK_SECONDS` was replaced by `secondsInWeek` from `date-fns/constants` (date-fns added to @repo/automation).
- **Follow-up items:**
  - Pre-existing lint failures on main (not from this change): `organizeImports` in `apps/web/app/(dashboard)/layout.tsx`, `components/jobs/jobs-client.tsx`, `components/sse-provider.tsx`; format drift in `packages/api/src/routers/dashboard.ts`, `src/sse.ts`, `src/services/dashboard.service.test.ts`, `src/routers/jobs.test.ts`. One `pnpm format` run would clear them.
  - Known remaining scraper gaps (out of scope by decision): lazy-load scroll may capture <25 cards/page (`page.mouse.wheel` without hovering the list panel); `MAX_PAGES = 5` caps ~125 results/location.
