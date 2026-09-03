# Plan: Virtualize the Jobs list

> Stop the Jobs page from hanging for seconds when a status filter (e.g. "skipped") matches thousands of jobs, by rendering only the visible rows.

## Research Summary

- **Stack:** Next.js 16 App Router + Turbopack, React 19.2, TypeScript, tRPC v11 + TanStack Query v5, Tailwind v4, Biome. Tests: Vitest (`*.test.ts` next to source, no jsdom-heavy render tests for layout).
- **The problem:** [`jobs-split-view.tsx`](apps/web/components/jobs/jobs-split-view.tsx) maps every filtered job to a live `<li>` inside a shadcn `ScrollArea`. Each [`JobListItem`](apps/web/components/jobs/job-list-item.tsx) mounts a `Checkbox`, a `DropdownMenu` (`JobStatusSelect`), an SVG `ScoreRing`, a `StatusIcon`, and a `formatDistanceToNow` call. The default filter (`DEFAULT_VISIBLE_STATUSES = ["pending_review", "applying", "failed"]`) keeps the list short; enabling **skipped** / **rejected** / **applied** can push it to thousands of rows, all mounted synchronously → multi-second main-thread block.
- **Data path:** `trpc.jobs.list` → `listJobs` ([jobs.service.ts:29](packages/api/src/services/jobs.service.ts#L29)) returns **all** of a user's jobs, unpaginated. Filtering + sorting is 100% client-side in [`filterAndSortJobs`](apps/web/lib/jobs-filter.ts). **Not changing this** — scope is client-render only.
- **Relevant patterns:**
  - shadcn `ScrollArea` wraps base-ui `ScrollArea` ([scroll-area.tsx](apps/web/components/ui/scroll-area.tsx)). `ScrollAreaPrimitive.Viewport` is a `ForwardRefExoticComponent<... & RefAttributes<HTMLDivElement>>` — it **accepts a ref**, so react-virtual can scroll it. The wrapper currently does not forward one.
  - `ScrollArea` is used in exactly one place (the job list), so adding an optional prop is safe.
  - Search input is **already debounced** (300ms) via [`DebouncedInput`](apps/web/components/ui/debounced-input.tsx) in [`jobs-filter-bar.tsx`](apps/web/components/jobs/jobs-filter-bar.tsx) — no work needed there.
  - Selection state: `selectedJobId` is synced to the `?jobId=` query param in [`jobs-client.tsx`](apps/web/components/jobs/jobs-client.tsx); an effect auto-selects the first filtered job when the current selection isn't in the list.
  - SSE updates ([sse-provider.tsx](apps/web/components/sse-provider.tsx)) call `utils.jobs.list.setData(...)` with `.map()`, replacing the array identity on every `job:status` / `apply-run:*` event — the virtualizer must tolerate frequent new array references (it does; keyed by `job.id`).
- **Key files:**
  - `apps/web/components/jobs/jobs-split-view.tsx` — the list container (main change)
  - `apps/web/components/jobs/job-list-item.tsx` — the row (fixed-height change)
  - `apps/web/components/ui/scroll-area.tsx` — add `viewportRef` passthrough
  - `apps/web/components/jobs/jobs-client.tsx` — owns selection state; pass selected index / wire scroll-to
  - `apps/web/lib/jobs-filter.ts` (+ `.test.ts`) — home for the new pure helper + its test
- **New dependencies:** `@tanstack/react-virtual` (`^3.13.0`) in `apps/web`. Same TanStack family as the already-present `@tanstack/react-query`. React 19 compatible. If pnpm's release-age policy blocks install, add `@tanstack/react-virtual` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` (unlikely — v3 is long-stable).
- **Risks / Considerations:**
  - **Row height must be fixed.** Plan clamps the job title to one line (`line-clamp-1`) so every row is the same height and we can use a constant `estimateSize` with no `measureElement`. Full title still shows in the detail pane. If the user wants wrapped titles instead, switch to `measureElement` + dynamic measurement (more moving parts).
  - `divide-y` on the `<ul>` stops working once rows are absolutely positioned — move the divider to a per-row `border-b`.
  - Virtualization removes off-screen rows from the DOM, so they leave the tab order. Minor a11y regression, acceptable for a list of this size; noted for the reviewer.
  - `<ul>`/`<li>` semantics: keep the `<ul>` as the sized, `position: relative` spacer and keep each row an `<li>` positioned with `transform: translateY(...)`.
  - Keep `JobStatusSelect` inline in every row (per decision) — fine once only ~25 rows mount.

## Tasks

### Phase 1: Virtualize the list

#### 1.1. [x] Add `@tanstack/react-virtual` to `apps/web`
- **What:** Add `"@tanstack/react-virtual": "^3.13.0"` to `apps/web/package.json` dependencies and run `pnpm install`. If install is blocked by the release-age policy, add the package name to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` and re-run.
- **Files:** `apps/web/package.json`, `pnpm-lock.yaml` (, `pnpm-workspace.yaml` only if needed)
- **Verify:** `pnpm --filter web exec tsc --noEmit` still passes; `node -e "require.resolve('@tanstack/react-virtual', { paths: ['apps/web'] })"` resolves.

#### 1.2. [x] Forward a viewport ref through the `ScrollArea` wrapper
- **What:** Add an optional `viewportRef?: React.Ref<HTMLDivElement>` prop to `ScrollArea` in [scroll-area.tsx](apps/web/components/ui/scroll-area.tsx) and pass it to `<ScrollAreaPrimitive.Viewport ref={viewportRef} ...>`. Keep it optional and destructured out of `...props` so the single existing call site is unaffected.
- **Files:** `apps/web/components/ui/scroll-area.tsx`
- **Verify:** `pnpm --filter web typecheck`; Jobs page still scrolls normally with no `viewportRef` passed.

#### 1.3. [x] Make job rows fixed-height
- **What:** In [job-list-item.tsx](apps/web/components/jobs/job-list-item.tsx), clamp the title `<span>` to a single line (`line-clamp-1`, add `min-w-0` on the flex parent so truncation works). Confirm the row has no other wrapping content (company / location are single-line; the timestamp + "applied before" line is a single flex row). Note the resulting pixel height for use as `estimateSize` in 1.4 (measure in browser; ~76px expected).
- **Files:** `apps/web/components/jobs/job-list-item.tsx`
- **Verify:** In the app, every row in the list is visually identical in height regardless of title length; long titles show an ellipsis; full title still visible in the detail pane.

#### 1.4. [x] Virtualize the list in `JobsSplitView`
- **What:** Replace the `jobs.map(...)` `<ul>` block in [jobs-split-view.tsx](apps/web/components/jobs/jobs-split-view.tsx) with a `useVirtualizer` setup:
  - A **state-backed callback ref** (`const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)`) passed as `<ScrollArea viewportRef={setScrollElement}>`, with `getScrollElement: () => scrollElement`. A plain `useRef` leaves the list empty on first paint — nothing re-renders when the base-ui viewport attaches, so the virtualizer computes a zero range and never recovers until another render. (Discovered during build.)
  - `useVirtualizer({ count: jobs.length, getScrollElement: () => scrollElement, estimateSize: () => ROW_HEIGHT, overscan: 10, getItemKey: (index) => jobs[index].id, initialRect: { width: 384, height: 800 } })`.
  - **`initialRect` is required**, not optional polish. In `@tanstack/virtual-core` 3.17.x `calculateRange` returns `null` whenever `outerSize === 0`, so with the default zero rect the list renders **zero** rows until the base-ui ScrollArea viewport's `ResizeObserver` fires — imperceptible on a fast machine, but seconds of blank list under CPU load / on a slow device (reproduced at 6× CPU throttle: ~1.7s blank without it, 0ms with it). A non-zero `initialRect` gives it a screenful to render immediately; the real measured size takes over as soon as it's observed. (Discovered during build.)
  - Render `<ul style={{ height: virtualizer.getTotalSize(), position: "relative" }}>` containing one `<li>` per `virtualizer.getVirtualItems()` entry, each `position: absolute; top: 0; left: 0; right: 0; transform: translateY(${virtualItem.start}px)`, wrapping the existing `<JobListItem>`.
  - Move the `divide-y` divider to a `border-b` on each row (`<li>` or the `JobListItem` root).
  - Keep the empty state (`jobs.length === 0`) and the `{jobs.length} jobs` count exactly as-is.
- **Files:** `apps/web/components/jobs/jobs-split-view.tsx`
- **Verify:** Enable the **skipped** status filter on an account with many jobs. The page no longer hangs; scrolling is smooth; the DOM inspector shows ~20–35 `<li>` elements, not thousands. `pnpm --filter web typecheck` passes.

#### 1.5. [x] Stabilize `selectedJobIds` passed to rows
- **What:** In `JobsSplitView`, replace the per-row `selectedJobIds={Array.from(selectedIds)}` ([jobs-split-view.tsx:81](apps/web/components/jobs/jobs-split-view.tsx#L81)) with a single `const selectedJobIds = useMemo(() => Array.from(selectedIds), [selectedIds])` computed once and passed by the same reference to every row.
- **Files:** `apps/web/components/jobs/jobs-split-view.tsx`
- **Verify:** `pnpm --filter web typecheck`; multi-select + bulk status change from a row still updates all checked jobs (unchanged behavior in `JobStatusSelect.handleValueChange`).

### Phase 2: Selection behavior (replaces "scroll the selected row into view")

> Revised mid-build per user: don't scroll/highlight for a URL-set `jobId` — just show it in the
> detail pane. On any filter/sort/search change, select the first job of the new list.

#### 2.1. [x] Source `selectedJob` from the full list; make `selectJob` accept `null`
- **What:** In [jobs-client.tsx](apps/web/components/jobs/jobs-client.tsx), change `selectedJob` to `jobs.find(...)` (was `filteredSortedJobs.find(...)`) so a `?jobId=` that the current filter hides still renders on the right. Widen `selectJob` to `(jobId: string | null)` — on `null` it clears the `jobId` search param.
- **Files:** `apps/web/components/jobs/jobs-client.tsx`
- **Verify:** `pnpm --filter web typecheck` (the `(string | null) => void` handler is still assignable to `JobsSplitView`'s `onSelectJob: (jobId: string) => void`).

#### 2.2. [x] Rework the auto-select effect
- **What:** Replace the "select first when selection not in filtered list" effect with one keyed on a `filterKey = JSON.stringify([statusFilter, workplaceFilter, search, sortBy])` plus a `lastFilterKey` ref:
  - first run: keep a `?jobId=` that resolves to a real job; otherwise select `filteredSortedJobs[0]`
  - `filterKey` changed since last run (user touched a filter control): select `filteredSortedJobs[0]` (or `null` if the list is now empty)
  - `filterKey` unchanged (job data updated via SSE): do nothing
- **Files:** `apps/web/components/jobs/jobs-client.tsx`
- **Verify:** browser — (a) fresh load, no `jobId` → first job highlighted + shown; (b) `/jobs?jobId=<skipped job>` → detail pane shows it, **no** list row highlighted, no scroll; (c) then enable the Skipped filter → selection jumps to the first job of the larger list; (d) change sort → selection jumps to the new first job.

#### 2.3. [x] Revert the Phase-1 scroll-into-view code
- **What:** Remove `resolveScrollToIndex` from `jobs-filter.ts` and its tests, and the `useEffect` + `useEffect` import that called `virtualizer.scrollToIndex` in `jobs-split-view.tsx`. (These were built earlier in this session before the revision.)
- **Files:** `apps/web/lib/jobs-filter.ts`, `apps/web/lib/jobs-filter.test.ts`, `apps/web/components/jobs/jobs-split-view.tsx`
- **Verify:** `pnpm --filter web exec vitest run` passes; `grep -r resolveScrollToIndex apps/web` finds only build-cache hits.

## Notes

- **Decision left open for build time — title wrapping.** The plan makes rows fixed-height by clamping the title to one line (task 1.3), which keeps the virtualizer simple (constant `estimateSize`, no measurement). If the user prefers the title to wrap to two lines in the list, task 1.3 changes to "leave the title wrapping" and task 1.4 gains: `measureElement: (el) => el.getBoundingClientRect().height` on the virtualizer and `ref={virtualizer.measureElement}` + `data-index` on each row, with `estimateSize` as a rough average. Everything else is the same.
- **Out of scope:** server-side pagination / status filtering in `listJobs`, trimming the per-job company-aggregate payload, and the per-row `JobStatusSelect` (stays inline). Per-row render cost is now handled by the React Compiler (enabled during build at the user's request) rather than manual `React.memo` / `useMemo`.
- **a11y:** off-screen rows leave the tab order once virtualized. Acceptable here; call it out in review. If it matters later, react-virtual supports it but it's extra work.
- Existing [jobs-filter.test.ts](apps/web/lib/jobs-filter.test.ts) covers `filterAndSortJobs` and stays green.
- **Selection semantics did change** (Phase 2, per mid-build revision): a URL-set `jobId` now shows in the detail pane without highlighting/scrolling the list; any filter/sort/search change re-selects the first visible job.

## Completed

- **Date:** 2026-09-03
- **All tasks executed successfully:** yes
- **Files changed:**
  - `apps/web/package.json` / `pnpm-lock.yaml` — added `@tanstack/react-virtual` (resolved to 3.14.10; release-age policy did not block it)
  - `apps/web/components/ui/scroll-area.tsx` — optional `viewportRef?: React.Ref<HTMLDivElement>` prop forwarded to the base-ui `ScrollArea.Viewport`
  - `apps/web/components/jobs/job-list-item.tsx` — root changed from `<li>` to `<div className="h-full">` (the `<li>` now lives in the virtualized list); title/company/location clamped with `truncate` + `min-w-0` so every row is a fixed 92px
  - `apps/web/components/jobs/jobs-split-view.tsx` — `useVirtualizer` over `jobs`; state-backed callback ref for the viewport; `initialRect: { width: 384, height: 800 }` (see task 1.4 — without it the list is blank for seconds under CPU load); `<ul>` is a `getTotalSize()`-tall spacer with absolutely-positioned `<li>`s carrying `border-b`
  - `apps/web/next.config.ts` + `apps/web/package.json` — enabled the **React Compiler** (`reactCompiler: true`, `babel-plugin-react-compiler@^1` devDep) so per-row memoization (`selectedJobIds`, inline row callbacks, `JobListItem`) is handled automatically instead of by hand-written `useMemo`. Verified: `next build` (Turbopack) succeeds and emits `react/compiler-runtime`; jobs page smoke-tested with the compiler on (render, filter, scroll recycle, selection — no runtime errors)
  - `apps/web/components/jobs/jobs-client.tsx` — `selectedJob` sourced from the full `jobs` list; `selectJob` accepts `null` (clears `?jobId=`); auto-select effect reworked around a `filterKey` ref so filter/sort/search changes select the first visible job while a valid URL `jobId` and SSE data updates leave selection alone. `useMemo`/`useCallback` removed (React Compiler covers them); the URL-param write is now a module-level `writeJobIdParam(pathname, jobId)` helper so the effect depends on `pathname` rather than an unstable `selectJob` (Biome 1.9.4's exhaustive-deps rule isn't compiler-aware)
  - `apps/web/lib/jobs-filter.ts` (+ `.test.ts`) — unchanged from `main` (the mid-build `resolveScrollToIndex` helper + tests were added then reverted)
- **How to test:**
  - `pnpm --filter web exec vitest run` (20 pass) · `pnpm --filter web exec tsc --noEmit` · `pnpm --filter web exec biome check .`
  - Manual: open `/jobs`, enable the **Skipped** status filter on an account with many jobs → list appears instantly, no hang; scroll → rows recycle, DOM holds ~17 `<li>`; hard-refresh under CPU throttle → list is never blank; `/jobs?jobId=<hidden job>` → detail pane shows it with no list highlight; change a filter → selection jumps to the first visible job.
  - Verified during build with a seeded 40-job throwaway account driven by Playwright, incl. 6× CPU throttle (all since removed).
- **Follow-up items:**
  - Title wrapping decision (Notes) was resolved as **clamp to one line**. Full title still shows in the detail pane. Revisit if two-line rows are wanted (switch to `measureElement`).
  - a11y: off-screen rows are out of the tab order — flagged for review, not addressed.
  - Server-side pagination / payload trimming for `listJobs` remains out of scope; the client now handles thousands of rows fine, but the full list is still shipped on every `jobs.list` fetch.
  - `jobs-client.tsx`'s auto-select effect recomputes a `JSON.stringify` filter key each render — cheap, but a reviewer may prefer wrapping the filter setters instead.
  - React Compiler is now on for the whole `apps/web` — worth a normal click-through of the app before merging (build + jobs-page smoke test pass; other pages not exercised).
  - Pre-existing: `apps/web/lib/trpc.tsx` fails `biome check` (stray blank line) on `main` — untouched here.
