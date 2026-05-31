# Plan: Runs Data Table

> Replace the plain `<Table>` in the runs page with the shared `DataTable` component, following the same pattern as the jobs table.

## Research Summary

- **Stack:** Next.js App Router, TypeScript, TanStack Table v5, tRPC, Drizzle, date-fns
- **Relevant patterns:** `apps/web/components/jobs/` — `jobs-columns.tsx` → `jobs-data-table.tsx` → `jobs-client.tsx`; the `Job` and `JobStatus` types are exported from `apps/web/lib/trpc.tsx`
- **Key files:**
  - `apps/web/components/runs/runs-client.tsx` — current plain `<Table>` implementation to replace
  - `apps/web/components/runs/run-status-badge.tsx` — existing badge component; inlines its own `RunStatus` type from `RouterOutputs`
  - `apps/web/components/ui/data-table.tsx` — shared DataTable component
  - `apps/web/components/ui/data-table-column-header.tsx` — sortable column header
  - `apps/web/lib/trpc.tsx` — where `Job`, `JobStatus`, `FitTier` types are co-located; `Run` / `RunStatus` should go here too
  - `apps/web/app/(dashboard)/runs/page.tsx` — server page (no changes needed)
- **New dependencies:** none
- **Risks/Considerations:**
  - The error column in the current table uses `max-w-xs truncate` — inside DataTable cells the same Tailwind classes apply; use `title={run.errorMessage}` for tooltip on hover so the full message is accessible
  - No row selection needed (runs have no bulk actions)
  - No `renderSubRow` needed (runs have no expandable log detail)
  - `RunStatus` is currently defined inline in `run-status-badge.tsx` — unify it into `lib/trpc.tsx` and update the badge to import from there

## Tasks

### Phase 1: Types & Column Definitions

#### 1.1. Export `Run` and `RunStatus` types from `lib/trpc.tsx`
- **What:** Add `Run` and `RunStatus` type aliases alongside the existing `Job`/`JobStatus` exports so column definitions and the badge have a single source of truth.
- **Files:** `apps/web/lib/trpc.tsx`
- **Verify:** `pnpm typecheck` passes with no new errors.

#### 1.2. Update `RunStatusBadge` to import `RunStatus` from `lib/trpc.tsx`
- **What:** Replace the inline `RouterOutputs["runs"]["list"][number]["status"]` derivation with `import type { RunStatus } from "@/lib/trpc"`. No runtime change.
- **Files:** `apps/web/components/runs/run-status-badge.tsx`
- **Verify:** `pnpm typecheck` passes; badge renders identically.

#### 1.3. Create `runs-columns.tsx` with column definitions
- **What:** Define `columns: ColumnDef<Run>[]` for all seven columns — Platform (capitalize via `cell`), Status (`RunStatusBadge`), Started (`format(…, "MMM d, yyyy h:mm a")`), Completed (same format or `"—"`), Duration (`formatDuration(intervalToDuration({…}))` or `"—"`), Jobs Found (`run.jobCount` or `"—"` when status is `"failed"`), Error (truncated cell with `title` attribute for full message). Use `DataTableColumnHeader` for each header. Mark date columns with `sortingFn: "datetime"` and `enableGlobalFilter: false`; mark badge/derived columns with `enableColumnFilter: false`.
- **Files:** `apps/web/components/runs/runs-columns.tsx` *(new)*
- **Verify:** File compiles without type errors (`pnpm typecheck`).

### Phase 2: DataTable Wrapper & Client

#### 2.1. Create `runs-data-table.tsx`
- **What:** Thin wrapper that renders `<DataTable data={runs} columns={columns} getRowId={(row) => row.id} initialSorting={[{ id: "startedAt", desc: true }]} emptyMessage="No runs yet. Start a job search to see results here." />`. No `enableRowSelection` or `renderSubRow` (runs have no bulk actions or expandable logs).
- **Files:** `apps/web/components/runs/runs-data-table.tsx` *(new)*
- **Verify:** File compiles without type errors.

#### 2.2. Update `runs-client.tsx` to use `RunsDataTable`
- **What:** Replace the `<Table>` block (and its manual empty-state guard) with `<RunsDataTable runs={runs} />`. The DataTable handles the empty state via `emptyMessage`. Remove the now-unused `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow` imports and the `format`/`formatDuration`/`intervalToDuration` imports (they move to the columns file).
- **Files:** `apps/web/components/runs/runs-client.tsx`
- **Verify:** `pnpm typecheck` passes; visiting `/runs` in the browser shows the DataTable with sorting, pagination, and global search.

## Notes

- The `h1` heading is currently rendered inside `RunsClient`. Keep it there — the jobs page does the same in `JobsClient`.
- The error column: in the existing table it uses `max-w-xs truncate`. In the DataTable this should be handled at the cell level with a `className="max-w-xs truncate"` on the cell content and a `title={value}` attribute so the full message is readable on hover without a separate tooltip component.
- The `Duration` column value is derived (not a stored field), so `enableSorting: false` is appropriate for it.
- No tests needed for this change — it is a pure UI refactor with no logic changes; existing tRPC query and badge rendering are unchanged.

## Completed

- **Date:** 2026-05-31
- **All tasks executed successfully:** yes
- **Files changed:**
  - `apps/web/lib/trpc.tsx` — added `Run` and `RunStatus` type exports
  - `apps/web/components/runs/run-status-badge.tsx` — imports `RunStatus` from `lib/trpc` instead of inlining it
  - `apps/web/components/runs/runs-columns.tsx` — new file; 7-column `ColumnDef<Run>[]` with `DataTableColumnHeader`, datetime sorting, and error cell with `title` tooltip
  - `apps/web/components/runs/runs-data-table.tsx` — new file; thin `DataTable` wrapper sorted by `startedAt` desc
  - `apps/web/components/runs/runs-client.tsx` — replaced plain `<Table>` block with `<RunsDataTable runs={runs} />`
- **How to test:** `pnpm dev`, navigate to `/runs` — table should show sorting, global search, pagination, and an empty-state message when there are no runs
- **Follow-up items:** none
