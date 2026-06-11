# Plan: Exclude Keyword from Job Title

> Highlight a word or phrase in a job title on the jobs table and click the floating "Exclude" button to add it to your excluded keywords and skip existing matching jobs.

## Context

Excluded keywords (`job_criteria.exclude_keywords`, Postgres text array) currently filter jobs at scrape time, but the only way to add one is the comma-separated input on the profile criteria form. When browsing scraped jobs, the user spots noise words (e.g. "Java", "Unpaid") directly in titles and wants a one-gesture way to exclude them. Decisions confirmed with the user (right-click context menu and per-row word-dropdown designs were tried and rejected; selection is the most expressive gesture — it handles phrases like "Azure Cloud" that word lists can't):

- **Interaction:** highlight a word/phrase in the title → a floating `Exclude "…"` button appears at the selection (Medium/Kindle pattern). Multi-word phrases supported natively.
- **Discoverability:** a small ⓘ info icon with a tooltip next to the "Title" column header explains the feature — one indicator for the whole table, not per row.
- **Existing jobs:** jobs already in the table whose titles match the new keyword are marked `skipped` (only `pending_review`/`failed` — never `applying`/`applied`)
- **Title is plain text** (selection must not fight a link); a small external-link icon after it opens the LinkedIn posting in a new tab

## Research Summary

- **Stack:** Turborepo; Next.js 16 App Router (apps/web), tRPC + services (packages/api), Drizzle (packages/db), shared utils (packages/shared). Biome, Vitest.
- **Title cell:** `apps/web/components/jobs/jobs-columns.tsx:44-53` — `<Link href={row.original.url}>` inside a TanStack table rendered by `jobs-client.tsx` (`trpc.jobs.list.useQuery(undefined, { initialData })`).
- **Keyword matching at scrape time:** `isExcluded()` + `escapeRegExp()` in `packages/automation/src/utils.ts` — case-insensitive regex with lookaround word boundaries `(?<![a-zA-Z0-9_])kw(?![a-zA-Z0-9_])`. Must be reused for consistency, but `@repo/automation` cannot be imported into `@repo/api` (it depends on Playwright). Both packages already depend on `@repo/shared` (`packages/shared/src/utils.ts` holds `splitCsv`, `toTitleCase`) → relocate `isExcluded` there. Postgres `\m`/`\M` regex was rejected: different word-boundary semantics (e.g. `java_dev` vs keyword `java`).
- **Existing patterns to copy:** service + zod schema + router pairing of `updateStatus` (`packages/api/src/services/jobs.service.ts:32-56`, `packages/api/src/routers/jobs.ts`); mutation + `utils.jobs.list.invalidate()` + sonner toast in `apps/web/components/jobs/skip-button.tsx`; `getJobCriteriaForUser` exported from `@repo/db` (`packages/db/src/queries/job-criteria.ts`) and already imported by the jobs router.
- **UI primitives:** install Popover via `npx shadcn@latest add popover` (base-ui flavored; `Popover.Positioner` accepts a virtual `anchor` `{ getBoundingClientRect }` — forward `anchor` through `PopoverContent` like the earlier build did). `components/ui/tooltip.tsx` is installed and `TooltipProvider` already wraps the app in `app/layout.tsx`. Icons from `@remixicon/react` v4.9: `RiExternalLinkLine` (title link), `RiInformationLine` (header hint).
- **New dependencies:** none (shadcn popover is generated code).
- **No migration:** schema untouched (`excludeKeywords` and `skipped` status already exist).
- **Heads-up:** `apps/web/AGENTS.md` says this Next.js version has breaking changes — read `node_modules/next/dist/docs/` guides before writing web code.

## Tasks

### Phase 1: Shared util relocation

#### 1.1. [x] Move `isExcluded` to `@repo/shared`
- **What:** Copy `escapeRegExp` (private) + `isExcluded` verbatim from `packages/automation/src/utils.ts` into `packages/shared/src/utils.ts` (already re-exported via `export * from "./utils"`). Delete `packages/automation/src/utils.ts`. Update imports in `packages/automation/src/linkedin/scraper.ts` and `scraper.test.ts` to `from "@repo/shared"` (the existing 8 `isExcluded` test cases in `scraper.test.ts:130-161` stay there — `packages/shared` has no vitest setup; don't add one).
- **Files:** `packages/shared/src/utils.ts`, `packages/automation/src/utils.ts` (delete), `packages/automation/src/linkedin/scraper.ts`, `packages/automation/src/linkedin/scraper.test.ts`
- **Verify:** `pnpm --filter @repo/automation exec vitest run` and `pnpm typecheck`

### Phase 2: Service + router

#### 2.1. [x] `excludeKeyword` service function
- **What:** In `jobs.service.ts`, add `excludeKeywordSchema = z.object({ keyword: z.string().trim().min(2).max(50) })` + inferred input type, and `excludeKeyword(db, userId, input)`:
  1. `getJobCriteriaForUser(db, userId)`; if none → `TRPCError PRECONDITION_FAILED` "Set up job criteria first" (can't auto-create: `minSalary` is notNull without default).
  2. Case-insensitive dedupe against `criteria.excludeKeywords`; if new, `db.update(jobCriteria).set({ excludeKeywords: [...existing, keyword] }).where(eq(jobCriteria.userId, userId))`.
  3. Fetch user's jobs with `status` in `["pending_review", "failed"]`, filter titles with `isExcluded(title, [keyword])` from `@repo/shared` (same logic as scrape time). Run this step even when `alreadyExcluded` (older scrapes may still match).
  4. If matches exist (guard empty array — skip update), set `status: "skipped", updatedAt: new Date()` via `inArray(jobs.id, matchingIds)` scoped to `userId`.
  5. Return `{ keyword, skippedCount, alreadyExcluded }`.
- **Files:** `packages/api/src/services/jobs.service.ts`
- **Verify:** `pnpm --filter @repo/api exec tsc --noEmit`

#### 2.2. [x] Router procedure
- **What:** Add to jobs router, mirroring `updateStatus`:
  ```ts
  excludeKeyword: protectedProcedure
    .input(excludeKeywordSchema)
    .mutation(({ ctx, input }) => excludeKeyword(ctx.db, ctx.session.user.id, input)),
  ```
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** `pnpm typecheck` (web resolves `trpc.jobs.excludeKeyword`)

#### 2.3. [x] Service unit tests
- **What:** Extend `jobs.service.test.ts` using its existing chainable-mock pattern (`vi.hoisted`, mocked `@repo/db`/`drizzle-orm`; add `jobCriteria` table mock, `getJobCriteriaForUser: vi.fn()`, and an update chain). Use the real `isExcluded`. Cases: (a) throws PRECONDITION_FAILED with no criteria row; (b) appends trimmed keyword / skips append when present case-insensitively but still returns `alreadyExcluded: true`; (c) skips only word-boundary matches ("Java Developer" matches `java`, "JavaScript Engineer" does not) and only `pending_review`/`failed` rows; (d) no jobs update call when nothing matches, `skippedCount: 0`.
- **Files:** `packages/api/src/services/jobs.service.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run`

### Phase 3: UI

#### 3.1. [x] Install shadcn Popover with anchor passthrough
- **What:** `npx shadcn@latest add popover` from `apps/web/`. Add `"anchor"` to the `Pick<PopoverPrimitive.Positioner.Props, ...>` in `PopoverContent` and pass it to the Positioner (same edit as the first build).
- **Files:** `apps/web/components/ui/popover.tsx` (generated + edited)
- **Verify:** `pnpm lint` clean on the file; `pnpm typecheck`

#### 3.2. [x] `JobTitleCell`: plain-text title + link icon + selection popover
- **What:** Rework `JobTitleCell({ job }: { job: Job })` (`"use client"`, inline props; `Job` from `@/lib/trpc`):
  - **Replaces previous build:** rewrite `apps/web/components/jobs/job-title-cell.tsx` — drop the `DropdownMenu`, `RiForbid2Line` trigger button, and `titleWords` tokenizer. `jobs-columns.tsx` keeps rendering `<JobTitleCell job={row.original} />`.
  - Title renders as plain text (`font-medium`) inside `<span ref={cellRef} onPointerUp={handleSelection}>`, followed by `RiExternalLinkLine` wrapped in `<Link href={job.url} target="_blank" rel="noopener noreferrer" aria-label="Open job posting">`.
  - `handleSelection` (defer with `requestAnimationFrame` — double-click word selection finalizes after pointerup): read `window.getSelection()`; bail if collapsed/`rangeCount === 0`; require both `anchorNode` and `focusNode` inside `cellRef.current`; normalize (trim + collapse `\s+`); bail if <2 or >50 chars; snapshot `getRangeAt(0).getBoundingClientRect()` into a virtual anchor in state; open popover.
  - Controlled `<Popover>` + `<PopoverContent anchor={virtualAnchor} className="w-auto p-1">` containing one shadcn `<Button size="xs" variant="outline">Exclude "{keyword}"</Button>`.
  - On click: `trpc.jobs.excludeKeyword.useMutation()` → `await mutateAsync({ keyword })` in try/catch; success → `utils.jobs.list.invalidate()` + `toast.success` using `skippedCount`/`alreadyExcluded`; error → `toast.error`; finally close popover + `window.getSelection()?.removeAllRanges()`.
  - Close the popover on scroll while open (capture-phase `scroll` listener) — the anchor rect is a snapshot. Capture keyword + rect in state at pointerup; never read the live selection in the popover's click handler.
- **Files:** `apps/web/components/jobs/job-title-cell.tsx` (rewrite)
- **Verify:** `pnpm dev` → select a word/phrase in a title → floating button appears; click → toast, matching pending/failed rows flip to skipped, table refetches; the ↗ icon opens LinkedIn in a new tab; cross-cell selection shows nothing; keyword shows up in the criteria form CSV field on the profile page.

#### 3.3. [x] Discoverability hint in the Title column header
- **What:** In `jobs-columns.tsx`, change the title column's `header` to render `DataTableColumnHeader` alongside a small `RiInformationLine` icon (muted) wrapped in `Tooltip`/`TooltipTrigger`/`TooltipContent` (from `@/components/ui/tooltip`; `TooltipProvider` already wraps the app in `app/layout.tsx`). Tooltip text: "Highlight a word or phrase in a title to exclude it from future searches."
- **Files:** `apps/web/components/jobs/jobs-columns.tsx`
- **Verify:** hovering the ⓘ in the Title header shows the tooltip; sorting/filtering on the Title column still works.

## Verification (end-to-end)

1. `pnpm test && pnpm typecheck && pnpm lint` at repo root.
2. Manual: with seeded jobs, highlight a word → Exclude → toast reports skipped count; highlight a phrase ("Azure Cloud") → works; highlight in an `applied` job's title → that row is untouched; re-exclude the same keyword → "already excluded" toast, matching older jobs still get skipped; next `jobs.search` run skips titles containing the keyword (scrape-time path unchanged, now reading `isExcluded` from `@repo/shared`).

## Notes

- **Do not** add `@repo/automation` as a dep of `@repo/api` — that drags Playwright into the Next.js server bundle; the whole point of Task 1.1.
- Zod v4 in use (`z.uuid()`, `z.enum(jobStatusEnum.enumValues)` patterns); `.trim()` runs before `.min`/`.max`.
- CLAUDE.md rules apply: no single-char callback names, no `as` casts, no `.js` import extensions, shadcn components over raw HTML.
- Pre-existing (not part of this feature): 6 scraper tests fail on main — the mock `Page` lacks `mouse.wheel` (from the headed-browser change in commit 77e57db); fails identically on a clean tree.
- Pre-existing (not part of this feature): repo-root `pnpm lint` fails on `packages/api` files (`routers/dashboard.ts`, `sse.ts`, `services/dashboard.service.test.ts` — format/import-order). A repo-wide `pnpm format` would fix.
- **2026-06-10 — Revision:** UI swapped from selection-popover to highlight → right-click → context menu; title is now plain text with an external-link icon (the icon is the link).
- **2026-06-10 — Revision:** right-click design rejected as clunky; swapped to a ⊘ icon button opening a dropdown of the title's words. Tasks 3.1/3.2 cleared for rebuild; 3.1 now deletes the context-menu component installed for the rejected design.
- **2026-06-10 — Revision:** dropped the separate ↗ link icon (two icons felt like too much); the title is a hyperlink again, ⊘ dropdown unchanged.
- **2026-06-10 — Revision:** word dropdown can't express phrases ("Azure Cloud") — returned to the selection-popover interaction (the trigger, not the selection, was v2's real problem); title back to plain text + ↗ icon; added a ⓘ tooltip hint in the Title column header for discoverability; ⊘ dropdown removed. Tasks 3.1–3.3 cleared for rebuild.

## Completed

- **Date:** 2026-06-10
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/shared/src/utils.ts` — added `escapeRegExp` + `isExcluded` (moved from automation; `packages/automation/src/utils.ts` deleted, scraper imports updated)
  - `packages/api/src/services/jobs.service.ts` — `excludeKeywordSchema` + `excludeKeyword()`; `packages/api/src/routers/jobs.ts` — `jobs.excludeKeyword` mutation; `jobs.service.test.ts` — 6 new tests
  - `apps/web/components/ui/popover.tsx` — shadcn (base-ui) popover with `anchor` forwarded to the Positioner
  - `apps/web/hooks/use-text-selection.ts` — reusable `useTextSelection(containerRef, { minLength, maxLength })` hook owning all DOM Selection plumbing (pointerup + rAF deferral, containment validation, normalization, rect snapshot, scroll-dismiss, `clearSelection()`); returns `{ selection: { text, rect } | null, clearSelection }`
  - `apps/web/components/jobs/job-title-cell.tsx` — plain-text title + ↗ link icon; consumes `useTextSelection`; a valid selection opens a popover anchored to the selection rect with an `Exclude "…"` button → `jobs.excludeKeyword` → toast + `jobs.list` invalidate
  - `apps/web/components/jobs/jobs-columns.tsx` — title column renders `<JobTitleCell />`; Title header has a ⓘ `RiInformationLine` tooltip explaining the highlight-to-exclude gesture
- **How to test:** `pnpm dev` → sign in → /jobs → highlight a word or phrase (e.g. "Azure Cloud") in a title → click `Exclude "…"` → toast shows skipped count, matching pending/failed rows flip to skipped, keyword appears in the criteria form on /profile; ↗ icon opens the LinkedIn posting; hover the ⓘ in the Title header for the hint. Unit: `pnpm --filter @repo/api exec vitest run`.
- **Follow-up items:**
  - Manual browser verification of the selection → popover flow still pending (needs an authenticated session with scraped jobs).
  - Pre-existing issues unchanged (see Notes): 6 scraper test failures on main; repo-root `pnpm lint` failures in untouched `packages/api` files.

