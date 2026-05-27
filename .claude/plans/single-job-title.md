# Plan: Single Job Title

> Restrict job search criteria to one job title instead of an array of titles, simplifying the DB schema, types, search pipeline, and UI form.

## Research Summary

- **Stack:** Next.js App Router, TypeScript, Drizzle ORM (PostgreSQL), tRPC, BullMQ, Playwright, Zod, Biome
- **Relevant patterns:**
  - DB schema changes require `pnpm generate` then `pnpm migrate` (drizzle-kit)
  - Zod schemas live in `packages/api/src/services/profile.service.ts` alongside service functions
  - tRPC router for criteria is `upsertCriteria` in `packages/api/src/routers/profile.ts`, backed by `upsertCriteria` service
  - UI form uses react-hook-form + Zod resolver; CSV splitting via `splitCsv` from `@repo/shared`
  - `SearchCriteria` type is defined in `packages/automation/src/types.ts` and consumed by scraper + scorer
- **Key files:**
  - `packages/db/src/schema/job-criteria.ts` — DB column definition
  - `packages/db/src/schema/search-runs.ts` — `SearchCriteriaSnapshot` type (JSONB snapshot, not a live column)
  - `packages/automation/src/types.ts` — `SearchCriteria` interface
  - `packages/automation/src/linkedin/scraper.ts` — loops over `jobTitles`
  - `packages/automation/src/scorer.ts` — scores using `jobTitles` array
  - `packages/automation/src/search.ts` — passes `jobTitles` to scraper + snapshot
  - `packages/api/src/services/profile.service.ts` — `upsertCriteriaSchema` and `upsertCriteria` service
  - `packages/shared/src/search-readiness.ts` — readiness check for `jobTitles.length`
  - `apps/web/components/profile/criteria-form.tsx` — criteria form UI
- **New dependencies:** none
- **Risks/Considerations:**
  - `SearchCriteriaSnapshot` in `search_runs.searchCriteria` is a JSONB blob — existing rows will still have `jobTitles: string[]`. This is historical audit data only; no code reads it for logic, so no backfill is needed. The type change is forward-looking.
  - Scorer's title score drops from max 4 pts (2 titles × 2 pts) to max 2 pts (1 title × 2 pts). With 6 skill pts available, "strong" threshold (≥7) now requires 1 title match + 5 skills. This is acceptable and intentional.

---

## Tasks

### Phase 1: Data Layer

#### 1.1. [x] Rename column in job_criteria schema
- **What:** Change the `jobTitles` column from `text("job_titles").array()` to `jobTitle: text("job_title").notNull().default("")` in the Drizzle schema file.
- **Files:** `packages/db/src/schema/job-criteria.ts`
- **Verify:** Run `pnpm generate` — drizzle-kit should produce a new migration SQL file that renames/drops the old column and adds the new one.

#### 1.2. [x] Run migration
- **What:** Apply the generated migration to the local database.
- **Files:** `packages/db/drizzle/` (auto-generated)
- **Verify:** Run `pnpm migrate` with no errors. Confirm `\d job_criteria` in psql shows `job_title text` instead of `job_titles text[]`.

#### 1.3. [x] Update SearchCriteriaSnapshot type
- **What:** Change `jobTitles: string[]` to `jobTitle: string` in the `SearchCriteriaSnapshot` type. This is a JSONB type annotation used for the historical snapshot stored on `search_runs`; no migration needed for existing rows.
- **Files:** `packages/db/src/schema/search-runs.ts`
- **Verify:** `pnpm typecheck` passes with no errors in the db package.

---

### Phase 2: Core Types & Logic

#### 2.1. [x] Update SearchCriteria interface
- **What:** Change `jobTitles: string[]` to `jobTitle: string` in the shared `SearchCriteria` interface.
- **Files:** `packages/automation/src/types.ts`
- **Verify:** TypeScript errors now surface in all consumers (scraper, scorer, search) — expected, resolved in subsequent tasks.

#### 2.2. [x] Simplify scorer to single string
- **What:** Update `scoreJob` to accept `{ jobTitle: string }` instead of `{ jobTitles: string[] }`. Replace the `countMatches` array check with a single `text.includes(normalize(criteria.jobTitle))` check worth 2 pts (max title contribution is now 2 pts per job instead of 4).
- **Files:** `packages/automation/src/scorer.ts`
- **Verify:** `pnpm --filter @repo/automation exec vitest run scorer` passes.

#### 2.3. [x] Update search-readiness check
- **What:** In `CriteriaReadiness`, change `jobTitles?: string[] | null` to `jobTitle?: string | null`. In `getMissingSearchFields`, change the check from `criteria?.jobTitles?.length` to `criteria?.jobTitle` (falsy check on a plain string).
- **Files:** `packages/shared/src/search-readiness.ts`
- **Verify:** `pnpm typecheck` passes for the shared package.

---

### Phase 3: Search Pipeline

#### 3.1. [x] Remove jobTitles loop in scraper
- **What:** Replace `for (const jobTitle of criteria.jobTitles.slice(0, MAX_JOB_TITLES))` with a direct use of `criteria.jobTitle`. Remove the `MAX_JOB_TITLES` constant (now unnecessary).
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** `pnpm --filter @repo/automation exec vitest run scraper` passes. Confirm the outer loop is gone and `buildSearchUrl` is called once per location.

#### 3.2. [x] Update search orchestration
- **What:** Update two call sites in `runSearch` that pass `criteriaRow.jobTitles`:
  1. The `updateSearchRun` snapshot: change `jobTitles: criteriaRow.jobTitles` → `jobTitle: criteriaRow.jobTitle`
  2. The `scrapeLinkedInJobs` call: change `{ jobTitles: criteriaRow.jobTitles, ... }` → `{ jobTitle: criteriaRow.jobTitle, ... }`
  3. The `scoreJob` call: change `{ jobTitles: criteriaRow.jobTitles, ... }` → `{ jobTitle: criteriaRow.jobTitle, ... }`
- **Files:** `packages/automation/src/search.ts`
- **Verify:** `pnpm typecheck` passes for the automation package.

---

### Phase 4: API Layer

#### 4.1. [x] Update upsertCriteria schema and service
- **What:** In `upsertCriteriaSchema`, change `jobTitles: z.array(z.string())` to `jobTitle: z.string().min(1, "Required")`. Update `UpsertCriteriaInput` inferred type accordingly. The `upsertCriteria` service function body needs no changes since it passes `input` directly into the DB insert.
- **Files:** `packages/api/src/services/profile.service.ts`
- **Verify:** `pnpm typecheck` passes for the api package.

---

### Phase 5: UI

#### 5.1. [x] Update criteria form
- **What:**
  - In the form Zod schema, rename `jobTitles` field to `jobTitle: z.string().min(1, "Required")`.
  - In `defaultValues`, change `jobTitles: initial?.jobTitles?.join(", ") ?? ""` to `jobTitle: initial?.jobTitle ?? ""`.
  - In `onSubmit`, change `jobTitles: splitCsv(values.jobTitles)` to `jobTitle: values.jobTitle`.
  - In the JSX, remove `"(comma-separated)"` from the label and update the placeholder to e.g. `"Software Engineer"`.
  - Update all `register("jobTitles")` / `errors.jobTitles` references to `jobTitle`.
- **Files:** `apps/web/components/profile/criteria-form.tsx`
- **Verify:** Start the dev server and open the Criteria tab — field shows a plain text input with no comma hint, saving succeeds with a single title, and validation shows error if left empty.

---

### Phase 6: Tests

#### 6.1. [x] Update profile router tests
- **What:** In `upsertCriteria` test, change `jobTitles: ["Software Engineer"]` to `jobTitle: "Software Engineer"`. In `getProfile` test, change `fakeCriteria.jobTitles: ["SWE"]` to `fakeCriteria.jobTitle: "SWE"`.
- **Files:** `packages/api/src/routers/profile.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run profile` passes.

#### 6.2. [x] Update scorer tests
- **What:** Change the `criteria` fixture from `{ jobTitles: ["Software Engineer", "Frontend Developer"], skills: [...] }` to `{ jobTitle: "Software Engineer", skills: [...] }`. Update expected scores where needed — with one title max 2 pts, "strong" requires 1 title match + 5 skills (score 7). Adjust test cases so they still cover strong / potential / weak tiers meaningfully.
- **Files:** `packages/automation/src/scorer.test.ts`
- **Verify:** `pnpm --filter @repo/automation exec vitest run scorer` passes.

#### 6.3. [x] Update scraper tests
- **What:** Change `criteria: SearchCriteria` fixture from `{ jobTitles: ["Software Engineer"], locations: [...] }` to `{ jobTitle: "Software Engineer", locations: [...] }`.
- **Files:** `packages/automation/src/linkedin/scraper.test.ts`
- **Verify:** `pnpm --filter @repo/automation exec vitest run scraper` passes.

#### 6.4. [x] Update jobs router test fixture
- **What:** Change `completeCriteria.jobTitles: ["SWE"]` to `completeCriteria.jobTitle: "SWE"`.
- **Files:** `packages/api/src/routers/jobs.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run jobs` passes.

---

## Completed

- **Date:** 2026-05-26
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/schema/job-criteria.ts` — `jobTitles: text[]` → `jobTitle: text`
  - `packages/db/drizzle/0005_single_job_title.sql` — migration: add column, copy first element, drop old
  - `packages/db/drizzle/meta/0005_snapshot.json` + `_journal.json` — Drizzle meta updated
  - `packages/db/src/schema/search-runs.ts` — `SearchCriteriaSnapshot.jobTitle: string`
  - `packages/automation/src/types.ts` — `SearchCriteria.jobTitle: string`
  - `packages/automation/src/scorer.ts` — single-string title match, max 2 pts
  - `packages/shared/src/search-readiness.ts` — `CriteriaReadiness.jobTitle`, falsy check
  - `packages/automation/src/linkedin/scraper.ts` — removed outer loop + `MAX_JOB_TITLES`
  - `packages/automation/src/search.ts` — all 3 `criteriaRow.jobTitles` → `criteriaRow.jobTitle`
  - `packages/api/src/services/profile.service.ts` — `upsertCriteriaSchema.jobTitle: z.string().min(1)`
  - `apps/web/components/profile/criteria-form.tsx` — plain `<Input>` for one title, no CSV hint
  - `packages/api/src/routers/profile.test.ts` — fixtures updated
  - `packages/automation/src/scorer.test.ts` — criteria fixture updated, scores recalibrated
  - `packages/automation/src/linkedin/scraper.test.ts` — criteria fixture updated
  - `packages/api/src/routers/jobs.test.ts` — criteria fixture updated
- **How to test:**
  - `pnpm test` — 27 tests across automation + api should pass
  - `pnpm typecheck` — 11/11 packages clean
  - Open the app, go to Profile → Criteria tab — the "Job title" field is now a plain single input (no comma hint)
- **Follow-up items:** none

## Notes

- **Scorer max score change:** Before this change, two matching titles scored 4 pts; after, one title scores 2 pts max. The "strong" tier (≥7) now needs 1 title match + 5 skill matches. "Potential" (≥3) needs 1 title match + 1 skill match, or 3 skill matches alone. This is a minor but real behaviour change — mention it in a comment in `scorer.ts`.
- **JSONB historical rows:** Existing `search_runs.search_criteria` blobs will have `jobTitles: string[]`. The type annotation change in `SearchCriteriaSnapshot` is forward-looking. No runtime code reads the snapshot for logic, so stale rows are safe.
- **`splitCsv` import:** After removing `splitCsv(values.jobTitles)` from the form, verify that `splitCsv` is no longer imported anywhere in the form file and remove the import to keep the code clean.
