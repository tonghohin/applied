# Plan: Skip Duplicate Company + Title + Location Jobs

> During scraping, skip any job whose company + title + location combination already exists in the DB for that user — before fetching job details.

## Research Summary

- **Stack:** TypeScript, Drizzle ORM (PostgreSQL), Playwright, Vitest
- **Relevant patterns:** `getJobUrlsForUser` in `packages/db/src/queries/jobs.ts` returns a flat list of strings; `runSearch` in `packages/automation/src/search.ts` builds a `Set<string>` from it and passes it to `scrapeLinkedInJobs`; the scraper checks `knownUrls.has(job.url)` before fetching job details. The new identity check follows the exact same pattern.
- **Key files:**
  - `packages/db/src/queries/jobs.ts` — DB queries for jobs
  - `packages/db/src/queries/jobs.test.ts` — unit tests for job queries
  - `packages/automation/src/search.ts` — orchestrates scrape run, calls DB queries, calls scraper
  - `packages/automation/src/linkedin/scraper.ts` — `scrapeLinkedInJobs` signature + filtering loop
  - `packages/automation/src/linkedin/scraper.test.ts` — scraper unit tests
- **New dependencies:** none
- **Risks/Considerations:** Company and title strings from LinkedIn can vary in casing/whitespace across scrape runs. The key must be normalized (lowercased + trimmed) on both the build side (search.ts) and the check side (scraper.ts) to avoid mismatches.

## Tasks

### Phase 1: DB Layer

#### 1.1. [x] Add `getJobIdentitiesForUser` query
- **What:** Add a new query that selects `{ company, title, location }` for all jobs belonging to a user. Mirrors the shape of `getJobUrlsForUser` — same file, same pattern.
- **Files:** `packages/db/src/queries/jobs.ts`
- **Verify:** TypeScript compiles (`pnpm typecheck`). The function is exported and the return type is inferred correctly.

#### 1.2. [x] Test `getJobIdentitiesForUser`
- **What:** Add unit tests in the existing jobs query test file. Cover: returns the correct fields for a user's jobs; returns an empty array when the user has no jobs. Follow the existing mock pattern (`mockSelect` / `selectWhere`).
- **Files:** `packages/db/src/queries/jobs.test.ts`
- **Verify:** `pnpm --filter @repo/db exec vitest run`

### Phase 2: Scraper Layer

#### 2.1. [x] Pass `knownIdentities` set through `scrapeLinkedInJobs`
- **What:** Add a `knownIdentities: Set<string>` parameter to `scrapeLinkedInJobs` (after `knownUrls`). Inside the per-job loop, after the `knownUrls` check, compute the normalized key `${company}|${title}|${location}` (lowercase + trim each segment) and skip if the set contains it. The check must come before `fetchJobDetails` — same as the URL check.
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** TypeScript compiles. Existing scraper tests still pass (they pass `noKnownUrls` — add a parallel `noKnownIdentities = new Set<string>()` constant to the test file and thread it through all existing calls).

#### 2.2. [x] Build `knownIdentities` in `runSearch` and pass it down
- **What:** In `runSearch`, call `getJobIdentitiesForUser` alongside `getJobUrlsForUser`. Build a `Set<string>` by mapping each row to its normalized `company|title|location` key (same normalization as the scraper). Pass the set as the new argument to `scrapeLinkedInJobs`.
- **Files:** `packages/automation/src/search.ts`
- **Verify:** TypeScript compiles (`pnpm typecheck`).

#### 2.3. [x] Test the identity-based skip in the scraper
- **What:** Add one test case to `scraper.test.ts`: two jobs on the same page where one matches a known identity — confirm the matched job is skipped without fetching its details (no `page.goto` for its URL), and the other job is returned normally. Follow the pattern of the existing "skips already-stored jobs without fetching their details" test.
- **Files:** `packages/automation/src/linkedin/scraper.test.ts`
- **Verify:** `pnpm --filter @repo/automation exec vitest run`

### Phase 3: Documentation

#### 3.1. [x] Update CLAUDE.md and README.md
- **What:** Review both docs and update any descriptions that are now inaccurate or incomplete. CLAUDE.md's "Job search pipeline" section describes the scraper logic in detail — add a sentence covering the new company + title + location deduplication check (alongside the existing URL dedup). README.md describes the scraper at a high level; update only if the user-facing behaviour description is materially affected (it likely isn't).
- **Files:** `CLAUDE.md`, `README.md`
- **Verify:** Read both files and confirm the job search pipeline description accurately reflects: (1) URL-based dedup, (2) company + title + location dedup, (3) excludeKeywords / excludeCompanies filters — in the order they are applied.

## Notes

- **Normalization key:** use `company.toLowerCase().trim() + "|" + title.toLowerCase().trim() + "|" + location.toLowerCase().trim()`. Both `runSearch` (when building the set) and `scrapeLinkedInJobs` (when checking) must use the same normalization — define it consistently in both places.
- **Location fallback in scraper:** `scrapeLinkedInJobs` falls back to `locationEntry.location` when the card's location is empty (line 197). The identity check happens at line 176–178 before this fallback is applied, so `job.location` may be an empty string at check time. The fix: compute the effective location first (`job.location || locationEntry.location`), then build the key from that. The builder should move the fallback assignment before the identity check.
- **No DB schema change needed:** this is a read-only query against the existing `jobs` table.
- **2026-06-17 — Revision:** Added Phase 3 (Documentation) with a single task to review and update CLAUDE.md and README.md after the feature is built.

## Completed

- **Date:** 2026-06-17
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/queries/jobs.ts` — added `getJobIdentitiesForUser` query
  - `packages/db/src/queries/jobs.test.ts` — added 2 tests for `getJobIdentitiesForUser`
  - `packages/automation/src/linkedin/scraper.ts` — added `identityKey()` helper + `knownIdentities` param; identity check before `fetchJobDetails`
  - `packages/automation/src/linkedin/scraper.test.ts` — threaded `noKnownIdentities` through all calls; added identity-skip test
  - `packages/automation/src/search.ts` — fetches identities in parallel with URLs, builds normalized set, passes to scraper
  - `CLAUDE.md` — updated job search pipeline section to document all 3 skip checks in order
- **How to test:** `pnpm --filter @repo/db exec vitest run && pnpm --filter @repo/automation exec vitest run`
- **Follow-up items:** Pre-existing `@repo/ai` test failure (`generate-cover-letter.test.ts` asserts wrong model name `gemini-2.5-flash` vs actual `gemini-2.5-flash-lite`) — unrelated to this feature.
