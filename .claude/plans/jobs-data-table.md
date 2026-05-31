# Plan: Jobs Data Table ✅ COMPLETED

> Replace the tab-based jobs view with a single TanStack Table (shadcn data-table pattern) that shows all jobs in one place with column sorting, multi-field filtering, row expansion for apply logs, and batch apply via checkboxes.

## What was built

- `apps/web/components/jobs/jobs-columns.tsx` — column defs with `DataTableColumnHeader` for sortable columns; Status and Fit columns have dropdown filter checkboxes via `filterOptions` prop
- `apps/web/components/jobs/jobs-data-table.tsx` — main table component with TanStack Table (sort, filter, row selection, row expansion)
- `apps/web/components/jobs/jobs-table-toolbar.tsx` — toolbar with title/company text search, Apply to Selected button, and `DataTableViewOptions`
- `apps/web/components/ui/data-table-column-header.tsx` — reusable sortable header with dropdown; extended with optional `filterOptions` for checkbox filters
- `apps/web/components/ui/data-table-view-options.tsx` — column visibility toggle dropdown
- Deleted `job-tabs.tsx` and `job-card.tsx`
- Dashboard pages widened: jobs/runs use full width (`p-8`), profile uses `max-w-3xl`

## Research Summary

- **Stack:** Next.js App Router, TypeScript, tRPC, TanStack Query v5, `@base-ui/react` tabs (currently), shadcn/ui components
- **Relevant patterns:**
  - `Job` / `JobStatus` / `FitTier` types re-exported from `apps/web/lib/trpc.tsx`
  - tRPC mutations used inside client components (`trpc.jobs.applyJobs`, `trpc.jobs.updateStatus`)
  - `trpc.useUtils().jobs.list.invalidate()` for post-mutation cache refresh
  - Badge variants already defined: `default`, `warning`, `secondary`, `destructive`, `outline`
  - `format` from `date-fns` for date display
- **Key files:**
  - `apps/web/components/jobs/jobs-client.tsx` — top-level client wrapper, renders JobTabs today
  - `apps/web/components/jobs/job-tabs.tsx` — to be deleted
  - `apps/web/components/jobs/job-card.tsx` — to be deleted
  - `apps/web/components/ui/table.tsx` — already installed (shadcn table primitives)
  - `apps/web/components/ui/badge.tsx` — `Badge`, `BadgeVariant`
  - `apps/web/components/ui/button.tsx` — `Button`
  - `apps/web/components/ui/checkbox.tsx` — `Checkbox`
  - `apps/web/components/ui/input.tsx` — for search field (check if installed)
- **New dependencies:** `@tanstack/react-table` (not yet in `apps/web/package.json`)
- **Risks/Considerations:**
  - Row selection must be restricted to `pending_review` and `failed` jobs only (use TanStack Table's `enableRowSelection` per row)
  - Apply logs should only expand for `applied`/`failed` jobs that have a `latestApplyRun`
  - The existing `JobListSkeleton` and `EmptyState` components stay unchanged

## Tasks

### Phase 1: Install Dependency

#### 1.1. Add `@tanstack/react-table`
- **What:** Install the package into `apps/web`. Run from the `apps/web` directory.
- **Files:** `apps/web/package.json` (updated by pnpm)
- **Verify:** `pnpm --filter web ls @tanstack/react-table` shows the installed version

### Phase 2: Build the Data Table

#### 2.1. Create column definitions
- **What:** Create `apps/web/components/jobs/jobs-columns.tsx` exporting `createColumns(opts)` — a function that accepts `{ onSkip, onToggleExpand }` callbacks and returns `ColumnDef<Job>[]`. Columns:
  - `select` — checkbox header (toggle all selectable rows), cell checkbox disabled unless `status` is `pending_review` or `failed`. Use `enableRowSelection` at the table level (see 2.2) rather than per-cell disabling for the cleaner TanStack API.
  - `title` — `accessorKey: "title"`, rendered as `<a href={job.url} target="_blank">` with an inline fit-tier `<Badge>` next to it. Enable sorting. Filter function: global filter covers this column.
  - `company` — `accessorKey: "company"`, sortable. Filter function: `includesString`.
  - `location` — `accessorKey: "location"`, nullable, sortable.
  - `fitTier` — `accessorKey: "fitTier"`, rendered as `<Badge>` (strong→`default`, potential→`warning`, weak→`secondary`). Use a `filterFn` that checks inclusion in an array of selected values.
  - `status` — `accessorKey: "status"`, rendered as `<Badge>` (pending_review→`secondary`, applying→`warning`, applied→`default`, failed→`destructive`, skipped→`outline`). Same array `filterFn`.
  - `listedAt` — `accessorKey: "listedAt"`, rendered with `format(date, "MMM d, yyyy")`, sortable.
  - `actions` — `id: "actions"`, shows Skip `<Button variant="outline" size="xs">` only when `status === "pending_review"`. Calls `onSkip(job.id)`.
  - `expand` — `id: "expand"`, shows a `<ChevronDown>` icon button only for jobs where `status` is `applied` or `failed` AND `latestApplyRun` is non-null. Calls `onToggleExpand(row)` / uses `row.toggleExpanded()`.
- **Files:** `apps/web/components/jobs/jobs-columns.tsx` (new)
- **Verify:** TypeScript compiles — `pnpm typecheck`

#### 2.2. Create the DataTable component
- **What:** Create `apps/web/components/jobs/jobs-data-table.tsx` as a `"use client"` component. It:
  - Accepts `{ jobs: Job[] }` as props
  - Owns tRPC mutations: `trpc.jobs.applyJobs.useMutation` (clears selection + invalidates on success) and `trpc.jobs.updateStatus.useMutation` (invalidates on success)
  - Sets up TanStack Table with: `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getExpandedRowModel`
  - State: `sorting`, `columnFilters`, `globalFilter`, `rowSelection`, `expanded`
  - `enableRowSelection: (row) => row.original.status === "pending_review" || row.original.status === "failed"`
  - Passes `onSkip` and `onToggleExpand` callbacks to `createColumns`
  - Renders `<JobsTableToolbar table={table} onApply={...} isApplying={...} />` above the table
  - Renders the `<Table>` from `components/ui/table` using TanStack's `flexRender`; for each body row, if `row.getIsExpanded()` and job has a `latestApplyRun`, renders an extra `<TableRow>` with a single `<TableCell colSpan={columns.length}>` containing the apply log UI (adapt `ApplyRunLog` from old `job-card.tsx` inline)
  - "Apply to Selected" logic: `table.getSelectedRowModel().rows.map(r => r.original.id)`
- **Files:** `apps/web/components/jobs/jobs-data-table.tsx` (new)
- **Verify:** TypeScript compiles — `pnpm typecheck`

#### 2.3. Create the table toolbar
- **What:** Create `apps/web/components/jobs/jobs-table-toolbar.tsx`. Props: `{ table: Table<Job>; onApply: () => void; isApplying: boolean }`. Renders:
  - A text `<Input>` wired to `table.setGlobalFilter(value)` for searching by title/company
  - Status toggle buttons — one per status value (`pending_review`→"Pending", `applying`→"Applying", etc.). Clicking a status toggles it in the `status` column filter (array). Active statuses shown with a filled/highlighted button style. An "All" button clears the filter.
  - Fit tier toggle buttons — one per tier (`strong`/`potential`/`weak`). Same toggle pattern for the `fitTier` column filter.
  - "Apply to Selected (N)" `<Button>` that only renders when `table.getSelectedRowModel().rows.length > 0`, disabled while `isApplying`
- **Files:** `apps/web/components/jobs/jobs-table-toolbar.tsx` (new)
- **Verify:** TypeScript compiles — `pnpm typecheck`

### Phase 3: Wire Up & Clean Up

#### 3.1. Replace JobTabs with JobsDataTable in jobs-client
- **What:** In `apps/web/components/jobs/jobs-client.tsx`, replace the `import { JobTabs }` and `<JobTabs jobs={jobs} />` with `import { JobsDataTable }` and `<JobsDataTable jobs={jobs} />`. No other logic changes.
- **Files:** `apps/web/components/jobs/jobs-client.tsx`
- **Verify:** Dev server starts without errors; jobs page renders the table

#### 3.2. Delete old tab/card files
- **What:** Delete `apps/web/components/jobs/job-tabs.tsx` and `apps/web/components/jobs/job-card.tsx` — fully replaced by the data table.
- **Files:** deleted files above
- **Verify:** `pnpm typecheck` passes with no missing import errors

## Notes

- The `input` shadcn component — check `apps/web/components/ui/input.tsx` exists before task 2.3; install via `npx shadcn@latest add input` from `apps/web/` if missing.
- TanStack Table's global filter needs `getFilteredRowModel` and a `globalFilterFn` that covers the `title` and `company` columns. Pass `globalFilterFn: "includesString"` or a custom function covering both fields.
- The status column filter uses a custom `filterFn` (array membership). Register it in the column def as `filterFn: (row, id, filterValues: string[]) => filterValues.length === 0 || filterValues.includes(row.getValue(id))`. Same pattern for fitTier.
- Status display labels: `pending_review` → "Pending", `applying` → "Applying", `applied` → "Applied", `failed` → "Failed", `skipped` → "Skipped" — reuse the `TAB_LABELS` pattern from the old `job-tabs.tsx`.
- Sorting on `listedAt` (nullable timestamp): handle nulls by sorting them last.
