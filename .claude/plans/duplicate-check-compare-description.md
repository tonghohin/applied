# Plan: Duplicate Check Compares Description

> A listing with the same company + title + location as a known job is only skipped if its job description also matches (exact, after normalization), so different roles that share a name are no longer dropped.

## Research Summary

- **Stack:** Turborepo, TypeScript, Playwright scraper in `packages/automation`, Drizzle in `packages/db`, Next.js settings UI in `apps/web`, Vitest.
- **Relevant patterns:**
  - `identityKey(company, title, location)` in `packages/automation/src/linkedin/scraper.ts:403` builds `company|title|location` (lowercased, trimmed).
  - `runSearch` (`packages/automation/src/search.ts:82-89`) loads `getJobIdentitiesForUser` and builds a `Set<string>` of keys, passed to `scrapeLinkedInJobs` as `knownIdentities`.
  - `scrapeLinkedInJobs` (`scraper.ts:457-467`) checks the key **before** fetching details, and adds it to `seenIdentities` before the exclude/workplace filters run. The description is only known after `fetchJobDetails` (`scraper.ts:494-506`), which already retries once and keeps the job with `""` on failure.
  - Card-level skips (URL, exclude keywords/companies, workplace badge) intentionally run before any detail fetch to avoid page loads.
- **Key files:**
  - `packages/automation/src/linkedin/scraper.ts`
  - `packages/automation/src/linkedin/scraper.test.ts`
  - `packages/automation/src/search.ts`
  - `packages/db/src/queries/jobs.ts` + `jobs.test.ts`
  - `apps/web/components/settings/criteria-form.tsx` (lines 217-231)
  - `CLAUDE.md` (Job search pipeline paragraph, dedup step 2)
- **New dependencies:** none
- **Risks/Considerations:**
  - An identity match now costs one extra detail page load (no AI call). Reposts that LinkedIn shows every run will be fetched every run.
  - `getJobIdentitiesForUser` now returns descriptions for all of a user's jobs, which is more data loaded once per search. That's fine at single-user scale (thousands of jobs × a few KB).
  - No schema change: `jobs.description` already exists (nullable `text`).

## Decisions (from clarification)

- Match rule: **exact match after normalization**, meaning lowercase, collapse all whitespace runs to a single space, trim.
- New listing's description fetch fails (empty after retry): **keep the job** (saved with empty description, as today for any failed fetch).
- Saved job with empty/null description: **never counts as a match**, so the new listing is kept.
- Settings copy is updated to mention the description.
- Only applies when `skipDuplicateIdentity` is on. With it off, behaviour is unchanged.

## Tasks

### Phase 1: Data + scraper logic

#### 1.1. [x] Return descriptions from the identity query
- **What:** Add `description: jobs.description` to the select in `getJobIdentitiesForUser`. Update its tests to include `description` in mocked rows and expected output (one row with `null`).
- **Files:** `packages/db/src/queries/jobs.ts`, `packages/db/src/queries/jobs.test.ts`
- **Verify:** `pnpm --filter @repo/db exec vitest run src/queries/jobs.test.ts`

#### 1.2. [x] Add `normalizeDescription` and change `knownIdentities` to a map
- **What:** In `scraper.ts`, export `normalizeDescription(text: string): string` (`text.toLowerCase().replace(/\s+/g, " ").trim()`). Change the `scrapeLinkedInJobs` parameter `knownIdentities: Set<string>` to `knownIdentities: Map<string, Set<string>>` (identity key → normalized non-empty descriptions). Inside, copy it into `seenIdentities` as a new `Map` whose values are cloned `Set`s, so the caller's map isn't mutated.
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** `pnpm --filter @repo/automation exec tsc --noEmit` passes once 1.3 and 1.4 are also done (call sites change together).

#### 1.3. [x] Move the identity skip after the detail fetch
- **What:** Rework the loop in `scrapeLinkedInJobs`:
  1. Compute `jobIdentityKey` as now, but don't skip and don't add to `seenIdentities` at that point.
  2. Run the existing exclude-keyword, exclude-company and workplace-badge filters unchanged (still before any fetch).
  3. Fetch details (existing retry logic).
  4. If `criteria.skipDuplicateIdentity`, the description is non-empty, and `seenIdentities.get(jobIdentityKey)?.has(normalizeDescription(details.description))`, then log `SKIP (duplicate company+title+location+description) ...` and `continue`.
  5. If the job is kept and `skipDuplicateIdentity` is on and the description is non-empty, add its normalized description to the key's set (create the set if missing), so same-run duplicates are caught.
  - An empty fetched description is never compared and never added, so it's always kept.
  - If the key matches but the description differs, log once at info level (e.g. `name matches a known job but description differs — keeping`) so cases like the one reported show up in worker logs.
- **Files:** `packages/automation/src/linkedin/scraper.ts`
- **Verify:** covered by 1.5.

#### 1.4. [x] Build the map in `runSearch`
- **What:** Replace the `Set` construction in `search.ts:86-89` with a `Map<string, Set<string>>`. For each row, take `identityKey(company, title, location)`. If `row.description` is non-empty after `normalizeDescription`, add it to that key's set. Rows with an empty or null description add nothing, so they never cause a skip. Import `normalizeDescription` from `./linkedin/scraper`.
- **Files:** `packages/automation/src/search.ts`
- **Verify:** `pnpm typecheck` passes.

#### 1.5. [x] Update and add scraper tests
- **What:** In `scraper.test.ts`, change `noKnownIdentities` to `new Map<string, Set<string>>()`, then update and add tests (each identity-match case now needs a `details(...)` response queued for the matched job):
  - **Update** "skips jobs with a matching company+title+location identity…": known map `acme|job 2|remote → {"same description"}`; job 2 fetches `"Same   Description"` (case and whitespace differ). Expect skipped. Assert that job 2's URL **was** visited (detail fetched).
  - **New:** same identity, different description. Expect both jobs kept.
  - **New:** known identity whose set is empty (saved job had no description). Expect kept.
  - **New:** identity matches, but job 2's fetch fails twice (empty description). Expect kept with `description: ""`.
  - **Update** "same run, different URL": both cards share an identity and fetch the same description. Expect only the first kept. Add a sibling test where they fetch different descriptions and both are kept.
  - **New:** `skipDuplicateIdentity: false` with a matching identity and description. Expect kept.
  - **New:** `normalizeDescription` unit test (lowercases, collapses `\n\t` and multiple spaces, trims).
  - Remove the "without fetching their details" claim from the identity test names, since that no longer holds. The URL-skip test keeps it.
- **Files:** `packages/automation/src/linkedin/scraper.test.ts`
- **Verify:** `pnpm --filter @repo/automation exec vitest run`

### Phase 2: Settings copy + docs

#### 2.1. [x] Update the Settings description
- **What:** In `criteria-form.tsx`, keep the label "Skip duplicate postings" and change the `FieldDescription` to: "Skip jobs with the same company, title, location, and description as one already in your list."
- **Files:** `apps/web/components/settings/criteria-form.tsx`
- **Verify:** `pnpm --filter web exec tsc --noEmit` passes; the Settings → Job criteria page shows the new text.

#### 2.2. [x] Update CLAUDE.md
- **What:** In the "Job search pipeline" paragraph, rewrite dedup step (2): a company + title + location match no longer skips on the card. The job's details are fetched and it is skipped only if its description matches a known one (lowercased, whitespace collapsed). Empty descriptions never match. Also note the identity check now happens after details are fetched, unlike the URL and exclude checks.
- **Files:** `CLAUDE.md`
- **Verify:** Read the paragraph back; it matches the code.

#### 2.3. [x] Final checks
- **What:** Run the full checks.
- **Files:** none
- **Verify:** `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass.

## Notes

- **Why move the check after the fetch:** the description isn't on the search card, so there's no way to compare it without opening the job page. Cheap card filters still run first, so excluded jobs are never fetched.
- **Behaviour change in `seenIdentities`:** today a key is recorded even for jobs later dropped by exclude filters. After this change only kept jobs with a non-empty description are recorded. Since results don't change for excluded jobs, this is a cleanup, not a regression.
- **Exact match trade-off:** a repost with any wording change (date, salary, one bullet) now comes back as a new job. If that gets noisy, a later follow-up could switch to a similarity threshold. The comparison is isolated in step 1.3 to make that easy.
- **Memory alternative (not chosen):** the map could store a hash of each normalized description instead of the full text, to cut memory. It isn't needed at current scale, and keeping the text makes debugging easier.
- **Related plan:** `.claude/plans/skip-duplicate-company-title-location.md` introduced the original check. This plan supersedes its "skip before fetching details" behaviour.

## Completed

- **Date:** 2026-10-15
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/queries/jobs.ts`: `getJobIdentitiesForUser` also selects `description`
  - `packages/db/src/queries/jobs.test.ts`: test rows include `description` (one `null`)
  - `packages/automation/src/linkedin/scraper.ts`: new `normalizeDescription`; `knownIdentities` is a `Map<string, Set<string>>`; the identity skip moved after the detail fetch and requires a matching description; empty descriptions never match; logs when the name matches but the description differs
  - `packages/automation/src/search.ts`: builds the identity → normalized descriptions map from stored jobs
  - `packages/automation/src/linkedin/scraper.test.ts`: identity tests rewritten; new cases for different, empty and failed-fetch descriptions, same-run duplicates, the setting turned off, and `normalizeDescription`
  - `apps/web/components/settings/criteria-form.tsx`: Settings description mentions the description
  - `CLAUDE.md`: the job search pipeline paragraph describes the new order and the description match
- **How to test:** `pnpm --filter @repo/automation exec vitest run`. Manually: run a search and look for `SKIP (duplicate company+title+location+description)` and `description differs — keeping` lines in the worker log.
- **Follow-up items:** if exact matching lets too many lightly edited reposts through, consider a similarity threshold (see Notes).
