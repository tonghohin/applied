# Plan: Jobs Split View

> Replace the jobs table with a LinkedIn-style two-pane layout — a scrollable, filterable job list on the left and the selected job's full detail (score, badges, Apply/Skip, description) on the right — so a job can be read without leaving the page.

## Research Summary

- **Stack:** Next.js 16.2.9 App Router (this repo has `cacheComponents` off, so no Suspense requirements for `useSearchParams`), TypeScript, tRPC + TanStack Query v5, Biome, shadcn/ui (`base-nova` style, remixicon).
- **Relevant patterns:**
  - Server → client data flow: `apps/web/app/(dashboard)/jobs/page.tsx:7-12` calls `listJobs` server-side, passes `initialJobs` into `JobsClient`, which does `trpc.jobs.list.useQuery(undefined, { initialData })` (`apps/web/components/jobs/jobs-client.tsx:22-24`). **This stays unchanged** — `jobs.list` takes no args; all filtering/sorting/selection is client-side today via TanStack Table and will move to plain React state.
  - `Job` / `JobStatus` types: `apps/web/lib/trpc.tsx:10-11`, derived from `RouterOutputs["jobs"]["list"]`.
  - Schema: `packages/db/src/schema/jobs.ts:8-33`; enums in `packages/db/src/schema/enums.ts:4-13` (`jobStatusEnum`: `pending_review | applying | applied | rejected | failed | skipped`); `workplaceTypeEnum` values from `WORK_TYPES` (`packages/shared/src/job-criteria.ts:1`: `on-site | remote | hybrid`).
  - `JobStatusBadge` + `STATUS_ICON` already exist at `apps/web/components/jobs/job-status-badge.tsx` — reuse as-is for both list rows and the detail pane.
  - No existing "Strong"/"Potential" score-tier bucketing anywhere in the code (`jobs-columns.tsx:76-81` just renders the raw number) — this is new UI to build, following the ≥70-is-a-strong-match convention already documented in the root `CLAUDE.md`.
  - Bulk apply/status-change today is implicit: clicking a per-row action while multiple rows are checked applies to all of them (`apps/web/components/jobs/apply-button.tsx:10-20`, `apps/web/components/jobs/job-status-select.tsx:36-54`), both driven by a TanStack `Table`/`Row` instance. There is no "N selected" bar.
  - `apps/web/components/jobs/job-title-cell.tsx` currently bundles several things inside one table cell: external link, highlight-text-to-exclude-keyword (`useTextSelection` hook + popover), exclude-company popover, "applied Nx before" tooltip, and the description-sheet trigger. These interactions have more room in a detail pane header than a compact list row, so they move there.
  - `apps/web/components/jobs/job-description-sheet.tsx` is the only existing "detail view" (a slide-over `Sheet`, not a route) — no `/jobs/[id]` page exists. It gets superseded entirely by the new detail pane.
- **Key files:**
  - `apps/web/app/(dashboard)/jobs/page.tsx` — server entry, unchanged
  - `apps/web/components/jobs/jobs-client.tsx` — rewritten (state shell, no more table)
  - `apps/web/components/jobs/jobs-data-table.tsx`, `jobs-columns.tsx` — deleted
  - `apps/web/components/jobs/job-title-cell.tsx`, `job-description-sheet.tsx` — deleted, logic absorbed into new detail pane
  - `apps/web/components/jobs/apply-button.tsx`, `job-status-select.tsx` — refactored off `Table`/`Row` props
  - `apps/web/components/jobs/job-status-badge.tsx` — reused unchanged
  - `apps/web/components/ui/data-table*.tsx` (4 files) + `@tanstack/react-table` dep — confirmed (via repo-wide grep) used **only** by the jobs table today; once jobs stops using them they become dead code (Phase 5 verifies and removes)
- **New dependencies:** shadcn `scroll-area` (list pane scrolling) — install via `npx shadcn@latest add scroll-area` from `apps/web/`. No new npm packages otherwise (URL sync uses `next/navigation`'s `useRouter`/`useSearchParams`, already available and unchanged in this Next.js version per docs check).
- **Risks/Considerations:**
  - **Architecture change, not just visual:** dropping `@tanstack/react-table` for the jobs view means filtering, sorting, and row-selection state move from table config to plain `useState`/`useMemo`. This is a deliberate simplification (a card list has no real use for column definitions/faceted values) but is a bigger structural change than a pure styling redo — flagging so it isn't mistaken for scope creep.
  - Bulk actions become an **explicit** "N selected" action bar instead of today's implicit "apply-while-others-are-checked" behavior. Same end capability (bulk apply, bulk status change) as confirmed with the user, different — clearer — trigger mechanism, since there's no table header row to hide it in anymore.
  - Selected job persists via `?jobId=<id>` query param (confirmed with user), updated with `router.replace(pathname + "?" + params, { scroll: false })` — confirmed unchanged/supported API in this repo's Next.js 16.2.9.
  - Auto-select first job in the filtered/sorted list on load, and re-select the first job whenever the currently-selected job falls out of the active filter set (confirmed with user).
  - Old detail view (`JobDescriptionSheet`) is fully removed, not kept as a fallback (confirmed with user) — there's no route to preserve for deep-linking, only the sheet component.
  - No backend/schema changes needed anywhere in this plan — `jobs.list`, `jobs.updateStatus`, `jobs.applyJobs` all already support what's needed (`applyJobs` already takes an array of ids; bulk status change stays a `Promise.all` of the existing single-job `updateStatus` mutation).
  - Must double check no other page relies on `apps/web/components/ui/data-table*.tsx` or `@tanstack/react-table` before deleting them in Phase 5 — repo-wide grep during research found none, but re-verify at delete time in case Phase 1-4 work introduces a new usage.

## Tasks

### Phase 1: Shared primitives (score tiers, filter/sort logic)

#### 1.1. [x] Install `scroll-area` shadcn component
- **What:** Run `npx shadcn@latest add scroll-area` from `apps/web/` so the left-hand job list can scroll independently of the page.
- **Files:** `apps/web/components/ui/scroll-area.tsx` (generated), `apps/web/components.json` (registry entry, if updated by the CLI)
- **Verify:** File exists and exports `ScrollArea`; `pnpm typecheck` passes.

#### 1.2. [x] Add score-tier util + components
- **What:** Create `getScoreTier(score: number): "strong" | "potential"` (threshold at 70, matching the ≥70-strong-match convention in root `CLAUDE.md`) plus two small presentational components: a compact `ScoreDot` (colored dot + tier label, for list rows) and a fuller `ScoreMeter` (tier label + `${score}/100` + a small segmented bar, for the detail pane). Co-locate in `apps/web/components/jobs/job-score.tsx`.
- **Files:** `apps/web/components/jobs/job-score.tsx` (new)
- **Verify:** `pnpm --filter web exec vitest run job-score` (add a couple of unit tests for `getScoreTier` boundary cases: 69 → potential, 70 → strong).

#### 1.3. [x] Pure filter/sort utility for the job list
- **What:** Extract the filtering/sorting logic that currently lives inside TanStack Table config (`jobs-data-table.tsx`, `jobs-columns.tsx`) into a pure function, e.g. `filterAndSortJobs(jobs, { statuses, workplaceTypes, search, sortBy })` in `apps/web/lib/jobs-filter.ts`. Behavior to preserve: status filter defaults to `DEFAULT_VISIBLE_STATUSES = ["pending_review", "applying", "failed"]` (currently `jobs-data-table.tsx:6`); workplace filter defaults to "all"; search matches against `title + company + location` substring (case-insensitive, mirrors today's global filter which only the composite `job` column opts into); `sortBy` supports at least `score-desc` (default, matches the mockup's "Sort: Score"), `score-asc`, `newest`, `oldest` (`createdAt`).
- **Files:** `apps/web/lib/jobs-filter.ts` (new), `apps/web/lib/jobs-filter.test.ts` (new)
- **Verify:** `pnpm --filter web exec vitest run jobs-filter` — cover: default status filter hides applied/rejected/skipped, "all" status shows everything, workplace filter narrows correctly, search matches title/company/location and is case-insensitive, each `sortBy` option orders correctly, empty input returns `[]`.

### Phase 2: State shell & layout

#### 2.1. [x] Rewrite `JobsClient` state management
- **What:** Replace the TanStack Table state in `jobs-client.tsx` with plain state: `statusFilter: JobStatus[]`, `workplaceFilter: WorkType[]`, `search: string`, `sortBy`, `selectedIds: Set<string>` (bulk checkboxes), and `selectedJobId` synced to the `?jobId=` query param via `useSearchParams()` + `useRouter()` (read on mount; `router.replace` with `{ scroll: false }` on change — no full navigation). Compute `filteredSortedJobs` via `useMemo` calling `filterAndSortJobs` (1.3). Add an effect: if `selectedJobId` is missing or no longer present in `filteredSortedJobs`, default to the first job's id (auto-select, confirmed with user) and sync that into the URL.
- **Files:** `apps/web/components/jobs/jobs-client.tsx`
- **Verify:** Manually load `/jobs`, confirm a job auto-selects and `?jobId=` appears in the URL; change a filter so the selected job drops out of the list and confirm it reselects the new first result.

#### 2.2. [x] Two-pane layout shell
- **What:** Build the split layout: fixed-width left column (list + filter bar) wrapped in `ScrollArea` (1.1) for independent scrolling, flexible-width right column (detail pane) — plain flex/grid, no resizable divider (not shown in the reference screenshot, kept out of scope). Replaces the single `JobsDataTable` render in `jobs-client.tsx:46`.
- **Files:** `apps/web/components/jobs/jobs-split-view.tsx` (new — houses the two-column layout, rendered by `JobsClient`)
- **Verify:** `pnpm turbo dev --filter=web`, visually confirm two columns render side by side at desktop width.

### Phase 3: Left pane — filters and list

#### 3.1. [x] `JobsFilterBar` component
- **What:** Toolbar above the list with: search input (reuse existing `DebouncedInput`), a Status multi-select dropdown (checkbox list, same values/semantics as today's per-column filter, default = `DEFAULT_VISIBLE_STATUSES`), a Workplace multi-select dropdown (same pattern, values from `WORK_TYPES`), and a Sort dropdown (`Score` / `Newest` / `Oldest`, default `Score` per the mockup). Wired to the state from 2.1.
- **Files:** `apps/web/components/jobs/jobs-filter-bar.tsx` (new)
- **Verify:** Each control updates `filteredSortedJobs` and is reflected in the list immediately; default state on load matches today's default (pending_review/applying/failed visible, sorted by score).

#### 3.2. [x] `JobListItem` component
- **What:** Compact row for the left list: checkbox (bulk-select, toggles `selectedIds` — must not also trigger row selection), title, `company · location`, `ScoreDot` (1.2), workplace type text, `JobStatusBadge` (read-only display — no dropdown in the list; status changes happen in the detail pane per 4.1), relative time via `formatDistanceToNow` (reuse `capitalize` from `@repo/shared` like `jobs-columns.tsx:87`). Clicking the row (not the checkbox) sets `selectedJobId`; the currently-selected row gets a visual highlight (border/background, matching the screenshot).
- **Files:** `apps/web/components/jobs/job-list-item.tsx` (new)
- **Verify:** Click various rows and confirm the URL `?jobId=` and detail pane update; toggling the checkbox does not change the selected/open job.

#### 3.3. [x] Bulk action bar
- **What:** When `selectedIds.size > 0`, show a bar above the list: "{n} selected", an Apply button (calls `trpc.jobs.applyJobs.useMutation()` with `Array.from(selectedIds)`, same mutation as today), a status-change dropdown (reuses `SELECTABLE_STATUSES` from 4.2's refactored `JobStatusSelect`, firing `Promise.all` of `updateStatus` — same approach as today's `job-status-select.tsx:44-48`), and a "Clear" action. On success: clear `selectedIds`, `utils.jobs.list.invalidate()`.
- **Files:** `apps/web/components/jobs/jobs-bulk-action-bar.tsx` (new)
- **Verify:** Select 2+ pending-review jobs, bulk-apply, confirm both move to `applying`/`applied` and the bar disappears; repeat for bulk status change.

### Phase 4: Right pane — job detail

#### 4.1. [x] `JobDetail` component
- **What:** Full detail pane for the selected job: header row (title, external link icon to `job.url`, highlight-text-to-exclude-keyword interaction and exclude-company popover — port this behavior from `job-title-cell.tsx:22-64` since it's real existing functionality, not decoration), `company · location` line with the "applied Nx before" tooltip (port from `job-title-cell.tsx:115-142`), `ScoreMeter` (1.2), workplace badge, `JobStatusBadge` as an interactive dropdown (reuse the refactored `JobStatusSelect`, 4.2), Apply and Skip buttons (only rendered when the job is in an actionable state — mirror today's eligibility: not `applying`, not `skipped`-already-final; "Skip" is just `updateStatus({ jobId, status: "skipped" })`), and the full description body (port rendering from `job-description-sheet.tsx:30-36`).
- **Files:** `apps/web/components/jobs/job-detail.tsx` (new)
- **Verify:** Select a `pending_review` job, confirm Apply/Skip both work and update status; select an `applied`/`rejected` job and confirm Apply/Skip are hidden appropriately; test the highlight-to-exclude and exclude-company interactions still work exactly as before.

#### 4.2. [x] Refactor `ApplyButton` and `JobStatusSelect` off TanStack Table
- **What:** Change `ApplyButton`'s props from `{ jobId, table }` to `{ jobId, selectedJobIds }: { jobId: string; selectedJobIds?: string[] }` — if provided and `selectedJobIds` includes `jobId` with length > 1, apply to all; otherwise just `jobId`. Used two ways: detail pane calls it with only `jobId` (always single-job apply); bulk bar (3.3) calls the underlying mutation directly for `selectedIds`. Similarly change `JobStatusSelect` from `{ job, row, table }` to `{ job, selectedJobIds }: { job: Job; selectedJobIds?: string[] }`, using the same "is this job part of a larger active selection" check, replacing `row.getIsSelected()`/`table.getSelectedRowModel()` with plain array/set membership.
- **Files:** `apps/web/components/jobs/apply-button.tsx`, `apps/web/components/jobs/job-status-select.tsx`
- **Verify:** `pnpm typecheck` (no more `@tanstack/react-table` types referenced in these two files); manual single-job apply/status-change from the detail pane still works.

#### 4.3. [x] Empty states
- **What:** Handle: (a) no jobs at all — keep the existing `Empty`/`SearchJobsButton` state from `jobs-client.tsx:31-44` at the page level (unchanged); (b) jobs exist but none match the active filters — list pane shows a small "No jobs match your filters" message, detail pane shows a neutral placeholder ("Select a job to view details" or similar) since there's nothing to auto-select.
- **Files:** `apps/web/components/jobs/jobs-split-view.tsx` or `job-detail.tsx` (whichever ends up owning the conditional)
- **Verify:** Set filters to a combination that matches zero jobs, confirm both empty states render without errors.

### Phase 5: Cleanup & verification

#### 5.1. [x] Delete superseded components and dead dependencies
- **What:** Delete `apps/web/components/jobs/jobs-data-table.tsx`, `jobs-columns.tsx`, `job-description-sheet.tsx`, `job-title-cell.tsx` (fully absorbed into `job-detail.tsx`/`job-list-item.tsx` by now). Re-run the repo-wide grep for `DataTable`/`@tanstack/react-table` usage outside `apps/web/components/ui/`; if truly unused, remove `apps/web/components/ui/data-table*.tsx` (4 files) and the `@tanstack/react-table` dependency from `apps/web/package.json`.
- **Files:** deletions as above; `apps/web/package.json`
- **Verify:** `pnpm typecheck && pnpm lint` clean; `grep -rn "jobs-data-table\|jobs-columns\|job-description-sheet\|job-title-cell" apps/web` returns nothing.

#### 5.2. [x] Test pass
- **What:** Run the full suite to confirm no backend contract regressions (this plan makes no backend changes) and that the new Phase 1 unit tests pass.
- **Files:** none (verification only)
- **Verify:** `pnpm --filter @repo/api exec vitest run`, `pnpm --filter web exec vitest run`, `pnpm typecheck`, `pnpm lint`.

#### 5.3. [x] Manual end-to-end check
- **What:** Start the app and walk the full flow.
- **Files:** none
- **Verify:** `pnpm turbo dev --filter=web` → open `/jobs` → confirm: first job auto-selected with `?jobId=` in URL; Status/Workplace/Sort/Search all filter the list and the detail pane stays in sync; refreshing the page preserves the selected job via the URL; single Apply/Skip from the detail pane works; multi-select checkboxes bulk-apply and bulk-change status via the action bar; highlight-to-exclude and exclude-company popovers still work from the detail header.

## Notes

- **Biggest open decision already resolved with the user:** dropping `@tanstack/react-table` for this view (Phase 1.3, 5.1) in favor of plain state — flagged here again because it's a real architecture change, not just a re-skin, even though the end-user behavior (filters, sort, bulk actions) is preserved.
- **Next.js version:** this repo runs a customized Next.js 16.2.9 (see `apps/web/AGENTS.md` warning). Confirmed via its bundled docs that `redirect()`, `useRouter()`, and `useSearchParams()` are all unchanged from stock Next.js, and `router.replace(url, { scroll: false })` is the correct no-scroll-jump pattern for URL-syncing `selectedJobId` — no Suspense boundary is required since `cacheComponents` is off in this repo's `next.config.ts`.
- **Not in scope:** a draggable/resizable divider between panes (screenshot doesn't show one), server-side pagination or infinite scroll for the list (confirmed matching current all-at-once loading), and a dedicated `/jobs/[id]` route (selection state lives in a query param on the existing `/jobs` page instead).

## Completed

- **Date:** 2026-07-22
- **All tasks executed successfully:** yes
- **Files changed:**
  - `apps/web/components/ui/scroll-area.tsx` — new shadcn `ScrollArea`/`ScrollBar`
  - `apps/web/components/jobs/job-score.tsx` + `.test.ts` — new `getScoreTier`/`ScoreDot`/`ScoreMeter`
  - `apps/web/lib/jobs-filter.ts` + `.test.ts` — new pure `filterAndSortJobs` (status/workplace/search filter + score/date sort), replacing the old TanStack Table config
  - `apps/web/components/jobs/jobs-client.tsx` — rewritten: plain React state for filters/sort/search/bulk-selection; `selectedJobId` synced to `?jobId=` via `useSearchParams`/`router.replace`; auto-selects the first visible job when the current selection falls out of the filtered set
  - `apps/web/components/jobs/jobs-split-view.tsx` — new two-pane layout shell composing the pieces below
  - `apps/web/components/jobs/jobs-filter-bar.tsx` — new: search input + Status/Workplace/Sort dropdown filters
  - `apps/web/components/jobs/job-list-item.tsx` — new: compact list row (checkbox, title, company/location, score dot, workplace, status badge, relative time)
  - `apps/web/components/jobs/jobs-bulk-action-bar.tsx` — new: "{n} selected" bar with bulk Apply, bulk status-change dropdown, and Clear
  - `apps/web/components/jobs/job-detail.tsx` — new: full detail pane (title with highlight-to-exclude, external link, exclude-company popover, applied-before tooltip, score meter, workplace, interactive status dropdown, Apply now/Skip buttons gated to actionable statuses, description, and apply-run logs when present)
  - `apps/web/components/jobs/apply-button.tsx` — refactored off `Table`/`Row` props to `{ jobId, selectedJobIds? }`; added `variant: "icon" | "labeled"` so the same mutation serves both the compact and detail-pane usages
  - `apps/web/components/jobs/job-status-select.tsx` — same prop refactor to `{ job, selectedJobIds? }`; exported `SELECTABLE_STATUSES` for reuse by the bulk action bar
  - Deleted: `jobs-data-table.tsx`, `jobs-columns.tsx`, `job-title-cell.tsx`, `job-description-sheet.tsx` (all logic ported into `job-detail.tsx`/`job-list-item.tsx`), plus `apps/web/components/ui/data-table*.tsx` (4 files) and the `@tanstack/react-table` dependency (`apps/web/package.json`, `pnpm-lock.yaml`) — all confirmed fully unused after the rewrite
- **How to test:** `pnpm turbo dev --filter=web` → sign in → open `/jobs`. Confirm: first job auto-selects with `?jobId=` in the URL; Status/Workplace/Sort/Search filter the list live; refreshing the page preserves the selected job; Apply now/Skip work from the detail pane and are hidden for non-actionable statuses; multi-select checkboxes show a bulk action bar that can bulk-apply or bulk-change status; highlighting a word in the job title offers to exclude it, and clicking the company name offers to exclude that company.
- **Follow-up items:**
  - A real product-scope gap was found and closed mid-build: the old table's expandable "apply run logs" view (`ApplyRunLog`, SSE-streamed) had no home in the new layout until it was explicitly wired into `job-detail.tsx` (shown below the description whenever a job has a `latestApplyRun`) — confirmed with the user before implementing.
  - `jobs-data-table.tsx`/`jobs-columns.tsx` were deleted a phase earlier than planned (during 4.2 instead of 5.1): refactoring `ApplyButton`/`JobStatusSelect` off their `Table`/`Row` props broke those two files' compile, and they were already fully dead code by that point, so deleting them immediately was more sensible than patching a soon-to-be-removed file.
  - Full-repo `pnpm lint` still reports 5 pre-existing issues (formatting in `apps/web/tsconfig.json`, import order in two page files, formatting in the auth route handler and `lib/trpc.tsx`) — none in files this feature touched; confirmed via `git diff`/`git log` that they predate this work and were left alone as out of scope.
  - **Post-completion fix (2026-07-22):** the left job list didn't actually scroll — reported by the user after this plan was marked done. Root cause was a two-level flexbox `min-height` bug in `jobs-split-view.tsx`: both the left column (`flex ... flex-col`) and the `ScrollArea` itself (a flex item within that column) need `min-h-0`, since flex items default to `min-height: auto` and will grow to fit content instead of being clamped to the available space — without it, `ScrollArea`'s internal scroll never engaged and the list just got silently clipped by the outer `overflow-hidden`. Fixed by adding `min-h-0` to both elements. Verified with 20 seeded jobs: viewport `clientHeight` (676px) is now properly smaller than `scrollHeight` (2019px), a programmatic `scrollTop` change moves the list without moving the page (`window.scrollY` stays 0), and a screenshot confirms scrolled rows render correctly with the filter bar and detail pane staying fixed in place.
  - **Post-completion fix (2026-07-22):** selecting a job in the list felt slow — reported by the user. Root cause: `jobs-client.tsx`'s `selectJob` used `next/navigation`'s `router.replace()` to sync `?jobId=` to the URL. Since `apps/web/app/(dashboard)/jobs/page.tsx` is a dynamic Server Component, every `router.replace()` call triggered a full Next.js RSC round-trip — re-running `getSession()` and the `listJobs()` DB query on the server on every single click — plus a redundant client-side `jobs.list` refetch, even though the job was already loaded client-side and no new data was needed. Confirmed via network trace (`GET /jobs?jobId=...&_rsc=...` firing on every click). Fixed by dropping `useRouter()` entirely: `selectedJobId` is now local `useState` (seeded once from `useSearchParams()` on mount), updated instantly and synced to the URL bar cosmetically via `window.history.replaceState()`, which bypasses Next's router/RSC-fetch machinery entirely. Verified via network trace that clicking jobs no longer produces any `_rsc` or `jobs.list` requests, that the URL still updates on each click, and that a page refresh still correctly restores the previously selected job.
