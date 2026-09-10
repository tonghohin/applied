# Plan: "Interviewing" Job Status

> Add a new manual `interviewing` status to the job lifecycle, surface it in the jobs list filter and dashboard analytics, and drop the `applying` bar from the dashboard Application-status chart.

## Research Summary

- **Stack:** Turborepo monorepo — Next.js 16 App Router (`apps/web`), Drizzle + Postgres (`packages/db`), tRPC + services (`packages/api`), BullMQ worker (`apps/worker`). Biome, Vitest.
- **Relevant patterns:**
  - `job_status` is a Drizzle `pgEnum` in `packages/db/src/schema/enums.ts`. Adding a value historically done with `ALTER TYPE ... ADD VALUE 'x' BEFORE/AFTER 'y'` (see `packages/db/drizzle/0006_round_zarda.sql`, `0002_pretty_cassandra_nova.sql`).
  - UI status metadata is spread across several `Record<JobStatus, …>` maps and `JobStatus[]` arrays that will fail typecheck until the new value is added everywhere — this is the safety net; follow the compiler.
  - `updateStatusSchema` uses `z.enum(jobStatusEnum.enumValues)` so the tRPC input + SSE `Pick<Job, "status">` union pick up the new value automatically — no change needed there.
  - Dashboard charts use shadcn `ChartConfig` + Recharts; colors come from `--chart-1..5` / `--destructive` / `--primary` / `--accent` tokens in `apps/web/app/globals.css`.
- **Key files:**
  - `packages/db/src/schema/enums.ts` — enum definition
  - `packages/db/drizzle/` + `packages/db/drizzle/meta/` — migration + snapshot (generated)
  - `apps/web/components/jobs/job-status-icon.tsx` — `STATUS_ICON`, `STATUS_ICON_CLASS` maps
  - `apps/web/components/jobs/job-status-select.tsx` — `SELECTABLE_STATUSES`
  - `apps/web/components/jobs/jobs-filter-bar.tsx` — `ALL_STATUSES`
  - `apps/web/lib/jobs-filter.ts` — `DEFAULT_VISIBLE_STATUSES` (intentionally NOT touched)
  - `apps/web/components/dashboard/application-status.tsx` — pipeline breakdown chart
  - `apps/web/components/dashboard/weekly-activity-chart.tsx` — weekly stacked bar chart
  - `apps/web/components/dashboard/activity-feed.tsx` — recent activity list
  - `packages/api/src/services/jobs.service.ts` — `listJobs` company-history tally
  - `apps/web/app/globals.css` — chart color tokens
- **New dependencies:** none.
- **Risks / Considerations:**
  - **Drizzle enum migration + TTY:** enum changes can trigger drizzle-kit's interactive prompt. Per project history, the reliable path is for the user to run `pnpm generate` in a **real terminal**, then `pnpm migrate`, then verify with a query against `pg_enum` / `drizzle.__drizzle_migrations`. Do not hand-write the snapshot.
  - Postgres runs `ALTER TYPE ... ADD VALUE` fine in a migration; the new value is available immediately for subsequent statements only in newer PG — not relevant here since nothing else in the migration uses it.
  - Every `Record<JobStatus, …>` / exhaustive `JobStatus[]` literal must be updated or `pnpm typecheck` fails. Run typecheck as the cross-cutting verification.
  - `weekly-activity-chart.tsx` computes `remaining = found - applied - failed - rejected`; adding an `interviewing` term means subtracting it too, or the "Found" segment double-counts.

## Decisions (resolved with user)

- **Entry:** manual only, from any status. No automation. The `applying` guard in `JobStatusSelect` (which hides the dropdown while an apply is in-flight) stays as-is; `interviewing` is freely selectable.
- **Default visibility:** NOT added to `DEFAULT_VISIBLE_STATUSES` — opt-in via the filter bar only.
- **Analytics surfaces:** Application-status breakdown chart, Weekly-activity chart, Activity feed. **No** new dashboard stat card.
- **Dashboard Application-status chart:** additionally **remove the `applying` stage** from that chart (`PIPELINE_STAGES`).
- **Company-history tally:** `listJobs` counts `applied`/`rejected` jobs toward "applied N times at this company"; `interviewing` implies an application exists, so include it in that tally.
- **Visuals:** icon `RiCalendarEventLine`, label "Interviewing" (via `toTitleCase`), enum position **after `applied`**. New `--chart-6` color token for the breakdown chart; weekly chart + activity feed reuse existing tokens (`--accent` / an `IconBadge` variant).

## Tasks

### Phase 1: Data layer

#### 1.1. [x] Add `interviewing` to the job status enum
- **What:** In `jobStatusEnum` add `"interviewing"` immediately after `"applied"` so the enum reads `pending_review, applying, applied, interviewing, rejected, failed, skipped`.
- **Files:** `packages/db/src/schema/enums.ts`
- **Verify:** `pnpm --filter @repo/db exec tsc --noEmit` (or repo `pnpm typecheck`) still compiles; grep confirms the new value present.

#### 1.2. [x] Generate + apply the migration
- **What:** Generate the Drizzle migration for the enum addition (expected SQL: `ALTER TYPE "public"."job_status" ADD VALUE 'interviewing' BEFORE 'rejected';`) and apply it. **This step must be run by the user in a real terminal** because enum diffs can trigger drizzle-kit's interactive prompt (known issue — see `.claude/plans/` history / memory `drizzle-migration-tty`). Sequence: `cd packages/db && pnpm exec drizzle-kit generate --name interviewing-job-status`, then `pnpm migrate` from repo root.
- **Files:** `packages/db/drizzle/00XX_*.sql` (new), `packages/db/drizzle/meta/*` (regenerated) — all generated, not hand-edited.
- **Verify:** `psql $DATABASE_URL -c "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'job_status' ORDER BY e.enumsortorder;"` lists `interviewing` after `applied`; `SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1;` shows the new entry.

#### 1.3. [x] Include `interviewing` in the company-history tally
- **What:** In `listJobs`, extend the condition `job.status === "applied" || job.status === "rejected"` to also include `"interviewing"` when building `appliedCountByCompany` / `appliedTitlesByCompany` (keep `rejectedCountByCompany` limited to `rejected`).
- **Files:** `packages/api/src/services/jobs.service.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run` passes (after task 1.4).

#### 1.4. [x] Tests for the service change
- **What:** In `jobs.service.test.ts`, add/extend a case asserting that a job in `interviewing` status contributes to `appliedCountAtCompany` and `appliedTitlesAtCompany` for other jobs at the same company, and does NOT contribute to `rejectedCountAtCompany`.
- **Files:** `packages/api/src/services/jobs.service.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run` green.

### Phase 2: Jobs list UI

#### 2.1. [x] Status icon + color
- **What:** Add `interviewing` to `STATUS_ICON` (`RiCalendarEventLine` from `@remixicon/react`) and `STATUS_ICON_CLASS` (`"text-primary"`) so the `Record<JobStatus, …>` maps stay exhaustive.
- **Files:** `apps/web/components/jobs/job-status-icon.tsx`
- **Verify:** `pnpm typecheck` passes; render a job set to `interviewing` and see the calendar icon.

#### 2.2. [x] Selectable + filterable status
- **What:** Add `"interviewing"` to `SELECTABLE_STATUSES` (after `"applied"`) in `job-status-select.tsx` and to `ALL_STATUSES` (after `"applied"`) in `jobs-filter-bar.tsx`. Do **not** add it to `DEFAULT_VISIBLE_STATUSES` in `jobs-filter.ts`.
- **Files:** `apps/web/components/jobs/job-status-select.tsx`, `apps/web/components/jobs/jobs-filter-bar.tsx`
- **Verify:** In the jobs view, the status dropdown offers "Interviewing"; selecting it fires `jobs.updateStatus` and the row updates optimistically. The status filter lists "Interviewing"; `interviewing` jobs are hidden until it's checked.

#### 2.3. [x] Filter test for default-hidden behavior
- **What:** In `jobs-filter.test.ts`, add a case: with `statuses: DEFAULT_VISIBLE_STATUSES`, a job with `status: "interviewing"` is excluded; with `statuses: []` (all) it is included.
- **Files:** `apps/web/lib/jobs-filter.test.ts`
- **Verify:** `pnpm --filter web exec vitest run` (or the web test command) green.

### Phase 3: Dashboard analytics

#### 3.1. [x] Chart color for `interviewing` — reuse `--chart-2`
- **What:** ~~Add a new `--chart-6` token.~~ Superseded: since 3.2 removes `applying` from the only chart that rendered it, `--chart-2` is free. `interviewing` reuses `var(--chart-2)` in both charts; `globals.css` is untouched.
- **Files:** none.
- **Verify:** `pnpm dev` → dashboard; interviewing bar renders in the mid-pine color in both themes.

#### 3.2. [x] Application-status breakdown chart
- **What:** In `application-status.tsx`: (a) remove `"applying"` from `PIPELINE_STAGES`; (b) add `"interviewing"` after `"applied"` in `PIPELINE_STAGES`; (c) add an `interviewing: { label: "Interviewing", color: "var(--chart-6)" }` entry to `chartConfig` (leave/keep `applying` in `chartConfig` — the `JobStatus` key type still requires exhaustiveness, so keep all keys but drive the chart off `PIPELINE_STAGES`).
- **Files:** `apps/web/components/dashboard/application-status.tsx`
- **Verify:** Dashboard "Application status" card shows rows for Pending Review, Applied, Interviewing, Rejected, Failed, Skipped — no "Applying" row; counts correct against DB.

#### 3.3. [x] Weekly activity chart
- **What:** In `weekly-activity-chart.tsx`: add `interviewing: { label: "Interviewing", color: "var(--accent)" }` to `chartConfig`; compute `const interviewing = jobs.filter((job) => job.status === "interviewing" && isSameDay(job.updatedAt, day)).length;`; include it in the returned datum; subtract it in the `remaining` calc (`found - applied - failed - rejected - interviewing`, clamped at 0); add a `<Bar dataKey="interviewing" stackId="a" fill={chartConfig.interviewing.color} radius={2} />` between `applied` and `failed`; add `totalInterviewing` and include it in the summary line (`{totalApplied} applied · {totalInterviewing} interviewing · …`).
- **Files:** `apps/web/components/dashboard/weekly-activity-chart.tsx`
- **Verify:** Dashboard "Weekly activity" chart renders an interviewing segment; legend + tooltip show "Interviewing"; "Found" segment doesn't double-count.

#### 3.4. [x] Activity feed
- **What:** In `activity-feed.tsx`: add `job.status === "interviewing"` to the `buildActivity` filter; add a branch returning `{ icon: <IconBadge icon={RiCalendarEventLine} variant="secondary" iconClassName="size-3.5" />, label: <span>Moved <span className="font-medium">{job.title}</span> at {job.company} to interviewing</span>, createdAt: job.updatedAt }`.
- **Files:** `apps/web/components/dashboard/activity-feed.tsx`
- **Verify:** After setting a job to `interviewing`, the "Recent activity" card shows a "Moved … to interviewing" row with the calendar badge, ordered by `updatedAt`.

#### 3.5. [skipped] Dashboard smoke test
- **What:** Only if the dashboard components gain non-trivial branching worth locking down: extract the `remaining`/interviewing math in `weekly-activity-chart.tsx` into a small pure helper (e.g. `buildWeeklyChartData(jobs, weekDays)`) and unit-test it — otherwise skip (these are presentational and currently untested). Decide during build based on how much logic 3.3 adds.
- **Files:** `apps/web/components/dashboard/weekly-activity-chart.tsx` (+ optional `*.test.ts`)
- **Verify:** `pnpm test` green; `pnpm typecheck` green; `pnpm lint` clean.

## Notes

- **Migration ordering:** Task 1.2 is a hard prerequisite for any manual testing that writes `interviewing` to the DB, but code changes in Phases 2–3 can be written and typechecked before the migration is applied. The build agent should complete 1.1, hand 1.2 to the user, and can proceed with the rest in parallel, deferring runtime verification until the migration lands.
- **`applying` in `chartConfig`:** `chartConfig` in both charts is typed `satisfies ChartConfig` with `JobStatus`-named keys used by other code paths (tooltip/legend lookups). Keep the `applying` key in the config objects even though 3.2 drops it from the visible stages — removing the key risks a runtime `undefined` lookup elsewhere. The visible-stage list (`PIPELINE_STAGES`) is the single source of truth for what renders.
- **`toTitleCase("interviewing")`** → `"Interviewing"` (verified against `packages/shared/src/utils.ts`), so no special-casing of the label is needed anywhere that already uses `toTitleCase`.
- **No worker changes:** the apply pipeline never transitions a job to `interviewing` (manual only), and `validateApplyJobs` already restricts applying to `pending_review`/`failed`, so an `interviewing` job can't be re-queued. No `apps/worker` changes.
- **SSE:** `packages/api/src/sse.ts` broadcasts `status` via `Pick<Job, "status" | …>`, which widens automatically. Manual status changes go through `jobs.updateStatus` (tRPC) with optimistic cache updates in `JobStatusSelect` — they don't emit SSE events today, and this feature doesn't add that. Fine.
- **Chart color choice:** `--chart-6` value is left to the builder; the existing palette is a monochrome green ramp, so a low-chroma amber (`oklch(0.7 0.09 70)` light / `oklch(0.72 0.1 70)` dark, roughly) would distinguish "interviewing" without clashing. Confirm visually in both themes.

## Completed

- **Date:** 2026-09-10
- **All tasks executed successfully:** yes. Migration `0027_interviewing-job-status.sql` (`ALTER TYPE "public"."job_status" ADD VALUE 'interviewing' BEFORE 'rejected'`) generated and applied; `pg_enum` confirmed as `pending_review, applying, applied, interviewing, rejected, failed, captcha_detected, skipped`. 3.5 skipped ( — 3.3 only added a one-line filter + subtraction matching the existing `failed`/`rejected` pattern, not worth extracting a helper).
- **Files changed:**
  - `packages/db/src/schema/enums.ts` — added `"interviewing"` to `jobStatusEnum` after `"applied"`
  - `packages/api/src/services/jobs.service.ts` — `listJobs` now counts `interviewing` jobs toward the per-company applied tally / titles
  - `packages/api/src/services/jobs.service.test.ts` — added a case covering the tally change
  - `apps/web/components/jobs/job-status-icon.tsx` — `RiCalendarEventLine` + `text-primary` for `interviewing`
  - `apps/web/components/jobs/job-status-select.tsx` — `interviewing` added to `SELECTABLE_STATUSES`
  - `apps/web/components/jobs/jobs-filter-bar.tsx` — `interviewing` added to `ALL_STATUSES` (not to `DEFAULT_VISIBLE_STATUSES`)
  - `apps/web/lib/jobs-filter.test.ts` — added a default-hidden / shown-when-all case
  - **`apps/web/app/globals.css` — no change.** Plan called for a new `--chart-6` token; instead `interviewing` reuses `var(--chart-2)`, which `applying` no longer renders in either chart. Keeps the token palette untouched.
  - `apps/web/components/dashboard/application-status.tsx` — dropped `applying` from `PIPELINE_STAGES`, added `interviewing` at `var(--chart-2)` (chartConfig keeps all keys)
  - `apps/web/components/dashboard/weekly-activity-chart.tsx` — new `interviewing` series + bar + total at `var(--chart-2)`, `remaining` math adjusted.
  - `apps/web/components/dashboard/activity-feed.tsx` — `interviewing` branch ("Moved … to interviewing") with `RiCalendarEventLine` badge
- **How to test:**
  1. **Run the migration (required):** `cd packages/db && pnpm exec drizzle-kit generate --name interviewing-job-status`, then `pnpm migrate` from repo root. Verify: `psql $DATABASE_URL -c "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='job_status' ORDER BY e.enumsortorder;"`
  2. `pnpm dev`, open a job, set status to "Interviewing" via the dropdown — row icon becomes a calendar, row hides unless "Interviewing" is checked in the status filter.
  3. Dashboard: "Application status" card shows an Interviewing row and no Applying row; "Weekly activity" shows an interviewing segment; "Recent activity" shows "Moved … to interviewing".
  4. `pnpm typecheck` (green), `pnpm --filter @repo/api exec vitest run` + `pnpm --filter web exec vitest run` + `pnpm --filter @repo/db exec vitest run` (all green).
- **Follow-up items:**
  - DB enum also carries a legacy `captcha_detected` value not present in `enums.ts` — pre-existing drift, unrelated to this change.
  - `pnpm lint` (`biome check .`) fails repo-wide on pre-existing format/import-sort debt in files unrelated to this feature (confirmed present on clean `main`, e.g. `apps/web/lib/trpc.tsx`, `apps/web/tsconfig.json`, `packages/api/src/services/profile.service.ts`). All **feature** files pass `biome check`. Left untouched — out of scope. `pnpm format` fixes it but rewrites ~14 unrelated files.
