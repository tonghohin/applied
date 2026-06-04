# Plan: Job Workplace Type + Exclusion Keywords

> Feature 1: Add `workplaceType` (on-site/remote/hybrid) to jobs — scraped from LinkedIn detail pages, stored in DB, filterable in the UI. Feature 2: Add `excludeKeywords` to user criteria — the scraper skips any job whose title contains an excluded whole word before navigating to it.

## Research Summary

- **Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM + PostgreSQL, tRPC, TanStack Table v7, react-hook-form + Zod, Playwright scraper, BullMQ worker
- **Relevant patterns:**
  - pgEnum defined in `packages/db/src/schema/enums.ts`; existing enums: `platformEnum`, `fitTierEnum`, `jobStatusEnum`
  - Jobs table schema in `packages/db/src/schema/jobs.ts`; inserted via `insertJobs` in `packages/db/src/queries/jobs.ts`
  - Criteria stored via Drizzle upsert (`insert().onConflictDoUpdate()`) — new fields flow through automatically once added to schema and input Zod schema
  - `WorkType = "on-site" | "remote" | "hybrid"` already defined in `packages/shared/src/job-criteria.ts`
  - TanStack Table filter: `filterFn: "arrIncludesSome"` + `DataTableColumnHeader` auto-builds a faceted multi-select dropdown from column values — no extra filter UI code needed
  - Scraper visits each job detail page in `fetchDescription` — workplace type can be extracted there without extra page loads
  - `upsertCriteriaSchema` in `packages/api/src/routers/profile.ts`
- **Key files:**
  - `packages/db/src/schema/enums.ts`
  - `packages/db/src/schema/jobs.ts`
  - `packages/db/src/schema/job-criteria.ts`
  - `packages/automation/src/types.ts`
  - `packages/automation/src/linkedin/scraper.ts`
  - `packages/automation/src/search.ts`
  - `packages/api/src/routers/profile.ts`
  - `apps/web/components/jobs/jobs-columns.tsx`
  - `apps/web/components/profile/criteria-form.tsx`
- **New dependencies:** none
- **Risks/Considerations:**
  - LinkedIn DOM selectors for workplace type are fragile and may need tuning after testing against a live session. Log when falling back to "on-site" so it's visible in worker output.
  - `workplaceTypeEnum` values use "on-site", "remote", "hybrid" to stay consistent with the existing `WorkType` from `packages/shared`.
  - Existing jobs default to "on-site" via `DEFAULT 'on-site'` in the migration — no backfill needed.
  - Whole-word keyword matching uses `\b` regex boundaries. Keywords with special regex chars (e.g., "C++") must be escaped before building the RegExp.

---

## Tasks

### Phase 1: Data Layer

#### 1.1. [x] Add `workplaceTypeEnum` and `workplaceType` column to jobs
- **What:** Add `export const workplaceTypeEnum = pgEnum("workplace_type", ["on-site", "remote", "hybrid"])` to `enums.ts`. Add `workplaceType: workplaceTypeEnum().notNull().default("on-site")` column to the `jobs` table in `jobs.ts`.
- **Files:** `packages/db/src/schema/enums.ts`, `packages/db/src/schema/jobs.ts`
- **Verify:** `pnpm typecheck` passes.

#### 1.2. [x] Add `excludeKeywords` column to job_criteria
- **What:** Add `excludeKeywords: text("exclude_keywords").array().notNull().default([])` to the `jobCriteria` table in `job-criteria.ts`.
- **Files:** `packages/db/src/schema/job-criteria.ts`
- **Verify:** `pnpm typecheck` passes.

#### 1.3. [x] Generate and run migration
- **What:** Run `pnpm generate` (creates Drizzle migration), then `pnpm migrate` (applies it).
- **Files:** `packages/db/drizzle/` (new migration file auto-generated)
- **Verify:** Both commands exit 0. Inspect the generated SQL — expect `ALTER TABLE jobs ADD COLUMN workplace_type workplace_type NOT NULL DEFAULT 'on-site'` and `ALTER TABLE job_criteria ADD COLUMN exclude_keywords text[] NOT NULL DEFAULT '{}'`.

---

### Phase 2: Scraper — Workplace Type

#### 2.1. [x] Update `ScrapedJob` type
- **What:** Add `workplaceType: WorkType` to the `ScrapedJob` interface. Import `WorkType` from `@repo/shared`.
- **Files:** `packages/automation/src/types.ts`
- **Verify:** TypeScript errors appear on all callers — expected, fixed in subsequent tasks.

#### 2.2. [x] Extend `fetchDescription` to also extract workplace type
- **What:** Rename `fetchDescription` → `fetchJobDetails`, return `{ description: string; workplaceType: WorkType }`. In the `page.evaluate()`, after extracting the description, also look for the workplace type. LinkedIn renders it as a badge text in the job header area. Strategy:
  1. Look for an element whose `textContent.trim()` is exactly `"On-site"`, `"Remote"`, or `"Hybrid"` (case-insensitive) inside `.job-details-jobs-unified-top-card__tertiary-description-container` or `.job-details-jobs-unified-top-card__job-insight`.
  2. If found, map to `WorkType`: `"On-site"` → `"on-site"`, `"Remote"` → `"remote"`, `"Hybrid"` → `"hybrid"`.
  3. Fall back to `"on-site"` if not found.
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** `pnpm typecheck` passes after step 2.3 updates all callers.

#### 2.3. [x] Update `scrapeLinkedInJobs` to include `workplaceType`
- **What:** Call `fetchJobDetails` instead of `fetchDescription`. Spread both `description` and `workplaceType` into the job result: `results.push({ ...job, description, workplaceType })`.
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** `pnpm typecheck` passes.

#### 2.4. [x] Pass `workplaceType` to `insertJobs` in `runSearch`
- **What:** In `search.ts`, add `workplaceType: job.workplaceType` to the object mapped over `scraped` before calling `insertJobs`. Drizzle will accept it since the column now exists in the table schema.
- **Files:** `packages/automation/src/search.ts`
- **Verify:** `pnpm typecheck` passes; `pnpm --filter @repo/automation exec vitest run` — all existing tests pass.

---

### Phase 3: Scraper — Exclusion Keywords

#### 3.1. [x] Add `excludeKeywords` to `SearchCriteria` and pass from `runSearch`
- **What:** Add `excludeKeywords: string[]` to `SearchCriteria` in `types.ts`. In `runSearch`, include `excludeKeywords: criteriaRow.excludeKeywords` when constructing the criteria object passed to `scrapeLinkedInJobs`. (`criteriaRow.excludeKeywords` is available once the migration runs and the schema is updated.)
- **Files:** `packages/automation/src/types.ts`, `packages/automation/src/search.ts`
- **Verify:** `pnpm typecheck` passes.

#### 3.2. [x] Implement exclusion filtering in the scraper loop
- **What:** Add an exported pure helper at the top of `scraper.ts`:
  ```ts
  function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  export function isExcluded(title: string, keywords: string[]): boolean {
    return keywords.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(title));
  }
  ```
  In `scrapeLinkedInJobs`, inside the per-job loop (after the `seen` dedup check, before `fetchJobDetails`), add:
  ```ts
  if (isExcluded(job.title, criteria.excludeKeywords)) {
    console.log(`[scraper] excluded by keyword: "${job.title}"`);
    continue;
  }
  ```
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** Unit tests in 3.3 pass.

#### 3.3. [x] Unit tests for `isExcluded`
- **What:** Create `packages/automation/src/linkedin/scraper.test.ts`. Test cases:
  - `isExcluded("Java Developer", ["java"])` → `true`
  - `isExcluded("JavaScript Engineer", ["java"])` → `false` (whole-word boundary)
  - `isExcluded("Senior PHP Developer", ["java"])` → `false`
  - `isExcluded("C++ Engineer", ["C++"])` → `true` (special chars escaped)
  - `isExcluded("React Developer", [])` → `false` (empty keywords)
  - `isExcluded("PHP Backend", ["java", "php"])` → `true` (any match)
  - `isExcluded("JAVA Senior", ["java"])` → `true` (case-insensitive)
- **Files:** `packages/automation/src/linkedin/scraper.test.ts` (new file)
- **Verify:** `pnpm --filter @repo/automation exec vitest run` — all tests pass.

---

### Phase 4: API Layer

#### 4.1. [x] Add `excludeKeywords` to `upsertCriteriaSchema`
- **What:** Add `excludeKeywords: z.array(z.string()).default([])` to `upsertCriteriaSchema` in the profile router. The `upsertCriteria` DB service uses `{ ...input, userId }` spread into `insertJobs`, so the new field flows through automatically — no changes to the service function needed.
- **Files:** `packages/api/src/routers/profile.ts`
- **Verify:** `pnpm typecheck` passes; `pnpm --filter @repo/api exec vitest run` — existing tests pass.

---

### Phase 5: UI

#### 5.1. [x] Create `TagInput` component
- **What:** Create `apps/web/components/ui/tag-input.tsx`. Controlled component: `{ value: string[]; onChange: (tags: string[]) => void; placeholder?: string }`. Renders existing tags as `<Badge variant="secondary">` chips (each with an `×` button that removes the tag), plus a plain `<Input>` for typing new tags. On `Enter` or `,` key: trim + lowercase, skip empty/duplicate, call `onChange([...value, newTag])`. Wrap in a `flex flex-wrap gap-1.5 rounded-md border p-2` container so chips and input appear inline.
- **Files:** `apps/web/components/ui/tag-input.tsx` (new file)
- **Verify:** `pnpm typecheck` passes.

#### 5.2. [x] Add `excludeKeywords` field to `CriteriaForm`
- **What:**
  1. Add `excludeKeywords: z.array(z.string()).default([])` to the Zod `schema` in `criteria-form.tsx`.
  2. Extend the `initial` prop type with `excludeKeywords?: string[] | null`.
  3. Set `defaultValues.excludeKeywords: initial?.excludeKeywords ?? []`.
  4. Render a `<Field>` with `<FieldLabel>Exclude keywords</FieldLabel>` and a `<TagInput>` controlled via `useWatch`/`setValue` (same pattern as `workTypes`), or use `Controller` from react-hook-form.
  5. Pass `excludeKeywords: values.excludeKeywords` to `mutateAsync`.
- **Files:** `apps/web/components/profile/criteria-form.tsx`
- **Verify:** Dev server runs; typing a keyword and pressing Enter adds a chip; clicking × removes it; saving shows `toast.success("Job criteria saved")`.

#### 5.3. [x] Add `workplaceType` column to jobs table
- **What:** Add a new column entry to the `columns` array in `jobs-columns.tsx`, positioned between `location` and `fitTier`:
  ```ts
  {
    accessorKey: "workplaceType",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Workplace" />,
    cell: ({ getValue }) => toTitleCase(getValue<string>()),
    filterFn: "arrIncludesSome",
    enableGlobalFilter: false,
  }
  ```
  Import `toTitleCase` from `@repo/shared` (already available). `DataTableColumnHeader` auto-builds the multi-select filter from faceted column values — no additional filter component needed.
- **Files:** `apps/web/components/jobs/jobs-columns.tsx`
- **Verify:** Dev server shows "Workplace" column in jobs table; column header dropdown shows "On-site", "Remote", "Hybrid" filter options; multi-selecting filters rows correctly.

---

## Notes

- **LinkedIn DOM selector stability:** The selectors in step 2.2 are best guesses based on LinkedIn's 2024-2025 DOM. They will need validation against a live scraper run. If none of the selectors match, the fallback to "on-site" ensures no breakage — just check worker logs for `[scraper] excluded by keyword` or lack of "Remote" jobs to detect selector drift.
- **`workplaceTypeEnum` vs `WorkType`:** Both use the same string values. `workplaceTypeEnum` is the DB-level pgEnum; `WorkType` is the TypeScript-level type from `packages/shared`. They stay in sync by sharing values.
- **No retroactive backfill:** The DB migration uses `DEFAULT 'on-site'`, so all existing jobs get "on-site". This is acceptable per user preference.
- **`isExcluded` is exported:** This makes it unit-testable without needing to mock Playwright.
- **Tag input on comma:** Accepting `,` as a delimiter in addition to `Enter` is a common UX expectation for tag inputs and reduces friction.
- **Pre-existing test failures:** 3 tests in `packages/api/src/routers/jobs.test.ts` were already failing before this feature (missing `insertApplyRun`/`insertSearchRun` mock exports). Not introduced by this work.
- **Scraper test refactor:** The existing `scrapeLinkedInJobs` tests required a significant mock update because `scrapeJobsPage` uses an alternating evaluate/scroll loop that wasn't accounted for. Updated `makePage` to skip scroll calls and updated all response arrays to match the real call sequence.

## Completed

- **Date:** 2026-06-02
- **All tasks executed successfully:** yes (excluding 3 pre-existing api test failures unrelated to this feature)
- **Files changed:**
  - `packages/db/src/schema/enums.ts` — added `workplaceTypeEnum`
  - `packages/db/src/schema/jobs.ts` — added `workplaceType` column (not null, default "on-site")
  - `packages/db/src/schema/job-criteria.ts` — added `excludeKeywords` text array column
  - `packages/db/drizzle/0009_amazing_spitfire.sql` — migration
  - `packages/automation/src/types.ts` — added `workplaceType` to `ScrapedJob`, `excludeKeywords` to `SearchCriteria`
  - `packages/automation/src/linkedin/scraper.ts` — `fetchJobDetails` (extracts description + workplaceType), `isExcluded` helper, exclusion check in loop
  - `packages/automation/src/search.ts` — passes `workplaceType` and `excludeKeywords` through
  - `packages/automation/src/linkedin/scraper.test.ts` — updated mock + all tests for scroll loop; added `isExcluded` tests
  - `packages/automation/src/scorer.test.ts` — added `workplaceType` to fixture
  - `packages/api/src/services/profile.service.ts` — added `excludeKeywords` to `upsertCriteriaSchema`
  - `apps/web/components/ui/tag-input.tsx` — new TagInput component
  - `apps/web/components/profile/criteria-form.tsx` — added excludeKeywords TagInput field
  - `apps/web/components/jobs/jobs-columns.tsx` — added Workplace column with multi-select filter
  - `packages/ai/src/agents/apply-agent.test.ts` + `apps/web/components/sse-provider.test.ts` — added `workplaceType` to mock fixtures
- **How to test:**
  1. `pnpm migrate` — already run
  2. Open the criteria settings tab → "Exclude keywords" field accepts tag input (Enter/comma to add, × to remove)
  3. Run a job search → worker logs show `[scraper] excluded by keyword: "..."` for matched titles
  4. Jobs table → "Workplace" column with dropdown filter for On-site / Remote / Hybrid
- **Follow-up items:**
  - LinkedIn DOM selectors for workplace type extraction (`fetchJobDetails`) need validation against a live session — the fallback "on-site" ensures no breakage but logging will show when it's defaulting
