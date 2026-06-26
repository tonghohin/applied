# Plan: Search Run Sidebar Badge

> Replace the Runs page with a small status indicator on the Jobs sidebar nav item showing the latest search run's state.

## Research Summary

- **Stack:** Next.js App Router, tRPC, TanStack Query v5, Drizzle, base-ui, Tailwind
- **Relevant patterns:** Sidebar is a `"use client"` component (`components/nav/sidebar.tsx`); tRPC queries called directly from client components using `trpc.x.useQuery()`. `PingDot`, `Spinner`, `Tooltip`/`TooltipContent` already installed in `components/ui/`.
- **Key files:**
  - `components/nav/sidebar.tsx` — NAV_LINKS array + AppSidebar render
  - `packages/db/src/queries/search-runs.ts` — DB query layer
  - `packages/api/src/routers/runs.ts` — tRPC router (currently only `runs.list`)
  - `packages/api/src/router.ts` — root router
  - `packages/api/src/index.ts` — public exports
  - `app/(dashboard)/runs/page.tsx` — page to delete
  - `components/runs/` — directory to delete
- **New dependencies:** none
- **Risks/Considerations:** The `runs.list` tRPC procedure is the only consumer of `listSearchRuns` from `@repo/db` in the API package. Deleting the runs page and renaming the procedure to `runs.latest` is a clean break — no other callers.

## Tasks

### Phase 1: Data Layer

#### 1.1. Add `getLatestSearchRun` DB query
- **What:** Add a new exported function `getLatestSearchRun(db, userId)` that returns the single most recent search run row for a user (ordered by `startedAt` desc, limit 1). Returns `undefined` when no runs exist.
- **Files:** `packages/db/src/queries/search-runs.ts`, `packages/db/src/index.ts` (add export)
- **Verify:** Function is exported from `@repo/db`; TypeScript compiles (`pnpm typecheck`).

#### 1.2. Replace `runs.list` with `runs.latest` tRPC procedure
- **What:** Replace the `list` procedure in `runsRouter` with a `latest` procedure that calls `getLatestSearchRun` and returns the single run (or `null`). Update the test file to cover `runs.latest` instead of `runs.list`.
- **Files:** `packages/api/src/routers/runs.ts`, `packages/api/src/routers/runs.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run` passes.

### Phase 2: Sidebar Status Indicator

#### 2.1. Build `SearchRunStatusIndicator` component
- **What:** Create `components/nav/search-run-status-indicator.tsx` — a client component that calls `trpc.runs.latest.useQuery()` with `refetchInterval: (query) => (query.state.data?.status === "pending" || query.state.data?.status === "running") ? 3000 : false` to poll while active. Renders:
  - `pending` / `running`: `<Spinner />` (small, inline)
  - `completed`: a small solid green dot (`size-2 rounded-full bg-green-500`)
  - `failed`: a small solid red dot wrapped in `<Tooltip>` + `<TooltipContent>` showing `errorMessage`. Use `side="right"` so it appears to the right of the sidebar.
  - `null`/no data: renders nothing
- **Files:** `components/nav/search-run-status-indicator.tsx`
- **Verify:** Component renders without TypeScript errors; `pnpm typecheck` passes.

#### 2.2. Update sidebar — add indicator to Jobs, remove Runs link
- **What:** Remove `/runs` from `NAV_LINKS`. Pull the Jobs entry out of the mapped array and render it directly (or add an optional `badge` slot) so `<SearchRunStatusIndicator />` can be placed inside the `SidebarMenuButton` after the label. The indicator should be positioned with `ml-auto` so it floats right.
- **Files:** `components/nav/sidebar.tsx`
- **Verify:** Sidebar renders Jobs with the indicator slot; Runs link is gone; `pnpm typecheck` passes.

### Phase 3: Cleanup

#### 3.1. Delete runs page and components
- **What:** Delete the following files/directories entirely:
  - `app/(dashboard)/runs/page.tsx` (and the `runs/` directory)
  - `components/runs/runs-client.tsx`
  - `components/runs/runs-columns.tsx`
  - `components/runs/run-status-badge.tsx`
  - `components/runs/runs-data-table.tsx`
- **Files:** see above
- **Verify:** `find apps/web -path "*/runs/*" -name "*.tsx"` returns nothing relevant; `pnpm typecheck` passes.

#### 3.2. Clean up API exports
- **What:** Remove the `listSearchRuns` re-export from `packages/api/src/index.ts` (it was only used by the now-deleted runs page server component).
- **Files:** `packages/api/src/index.ts`
- **Verify:** `pnpm typecheck` passes; no other file imports `listSearchRuns` from `@repo/api`.

## Completed

- **Date:** 2026-06-26
- **All tasks executed successfully:** yes (Phase 3 cleanup was pulled into Phase 1 to unblock typecheck)
- **Files changed:**
  - `packages/db/src/queries/search-runs.ts` — added `getLatestSearchRun`
  - `packages/api/src/routers/runs.ts` — replaced `runs.list` with `runs.latest`
  - `packages/api/src/routers/runs.test.ts` — updated tests for `runs.latest`
  - `packages/api/src/index.ts` — removed stale `listSearchRuns` re-export
  - `apps/web/lib/trpc.tsx` — `Run` type derived from `runs.latest`
  - `apps/web/components/sse-provider.tsx` — updated cache ops to `runs.latest`; removed `applySearchRunUpdateEvent`
  - `apps/web/components/sse-provider.test.ts` — removed `RunList` type and `applySearchRunUpdateEvent` tests
  - `apps/web/components/nav/search-run-status-indicator.tsx` — new component (spinner / green dot / red dot + tooltip)
  - `apps/web/components/nav/sidebar.tsx` — removed Runs nav link; added Jobs item with `SearchRunStatusIndicator`
  - Deleted `app/(dashboard)/runs/` and `components/runs/`
- **How to test:** `pnpm dev` → sidebar should show Jobs with a status dot; trigger a search run and observe the indicator change from spinner → green dot
- **Follow-up items:** In collapsed sidebar mode, the indicator is hidden (icon-only view). Acceptable per plan notes.

## Notes

- The `RunStatus` type is referenced via `@/lib/trpc` in the deleted components — no action needed, it stays in the generated tRPC types and is still used by other files.
- The `runs.latest` query returns `null` when no runs exist (user hasn't searched yet). The indicator component must handle this gracefully by rendering nothing.
- The `Spinner` used in the indicator should be `size-3` or `size-4` to match the dot sizes. Check the existing `Spinner` component for available size props.
- In collapsed sidebar mode (icon-only), the `SidebarMenuButton` `tooltip` prop already shows "Jobs" — the indicator will be hidden since the button collapses to just the icon. That's acceptable.
