# Plan: Scheduled Job Search

> Automatically trigger LinkedIn job searches on an opt-in per-user schedule (defaults when enabled: every 2 hours, 9:00–17:00, Mon–Fri, in the user's browser-detected timezone) using BullMQ job schedulers, with a settings UI to configure interval, hours window, days, and timezone, and a live "Next scheduled" status on the dashboard's Agent status card.

## Research Summary

- **Stack:** Turborepo monorepo — Next.js 16 (apps/web), BullMQ worker (apps/worker), tRPC + services (packages/api), Drizzle/Postgres (packages/db), shared helpers (packages/shared). BullMQ ^5.77 (job schedulers / `upsertJobScheduler` fully supported, including cron `pattern` + `tz`).
- **Relevant patterns:**
  - Manual search: `jobs.search` mutation (`packages/api/src/routers/jobs.ts`) checks readiness via `getMissingSearchFields` (`packages/shared/src/search-readiness.ts`), inserts a `search_runs` row, then `searchQueue.add("search", { userId, runId })`.
  - Worker: `apps/worker/src/workers/search.worker.ts` — `processSearch(userId, runId)` handles login/session, run status transitions, captcha session clearing, and publishes `search-run:update` SSE events via `publishEvent`.
  - Per-tab profile mutations: `profile.upsert*` in `packages/api/src/services/profile.service.ts` + `routers/profile.ts`; forms in `apps/web/components/profile/*-form.tsx` (react-hook-form + zodResolver + `Field`/`FieldError` + Sonner toasts), tabs in `profile-content.tsx`.
  - DB queries live in `packages/db/src/queries/*` with tests next to them; schema in `packages/db/src/schema/*`.
- **Key files:** `packages/api/src/queues/index.ts`, `packages/api/src/routers/{jobs,profile}.ts`, `packages/api/src/services/profile.service.ts`, `apps/worker/src/workers/search.worker.ts`, `apps/worker/src/index.ts`, `packages/db/src/schema/`, `apps/web/components/profile/`, `apps/web/components/sse-provider.tsx`
- **New dependencies:** none (BullMQ job schedulers are built in). One shadcn component to install: `switch`.
- **Risks/Considerations:**
  - **Worker must NOT runtime-import `@repo/api`'s root** — `packages/api/src/index.ts` re-exports `auth`, which evaluates Better Auth config and `auth-env.ts` (vars the worker doesn't have). Worker currently only does `import type` from `@repo/api`. The worker therefore creates its **own** `Queue("search")` instance for scheduler syncing; shared pure logic lives in `@repo/shared`, DB queries in `@repo/db`.
  - BullMQ job schedulers live **only in Redis**. The DB `search_schedules` table is the source of truth; a worker-startup sync reconciles Redis schedulers from the DB. This recovers from a flushed Redis and cleans up stale schedulers.
  - Dashboard already has an **Agent status card** (`apps/web/components/dashboard/agent-status.tsx`) with a hardcoded "Next scheduled: Manual only" row (`META_ROWS`). Dashboard data flows server → client via `getDashboardStats` (`packages/api/src/services/dashboard.service.ts`, returns `DashboardStats`) into `DashboardClient` → `<AgentStatus searchRuns={...} />`. The "Next scheduled" value will come from the BullMQ scheduler's own next-run timestamp (`searchQueue.getJobScheduler(id)` → `next` millis), which is authoritative.
  - Migration: `drizzle-kit generate` needs a TTY (see prior project experience — hand-written snapshots make `pnpm migrate` silently no-op). Use `pnpm generate --name search-schedules`; if it still fails non-interactively, **ask the user to run it** — never hand-write migration/snapshot files.
  - `searchWorker` has `concurrency: 1` — if many ticks queue up, they run serially. Fine for a personal app; ticks that find an active run skip silently.

## Decisions (confirmed with user)

- Per-user config: interval, active-hours window, active days, timezone — all stored in DB.
- **Off by default (opt-in)**: auto-search only runs after the user flips the toggle on. The form pre-fills the defaults (every 2h, 9–17, Mon–Fri) plus the browser-detected timezone so enabling is one click. *(Revised 2026-06-11 — was on-by-default with hardcoded America/Toronto.)*
- Dashboard's Agent status card shows the real next scheduled run (relative time from the Redis scheduler) or "Disabled".
- Scheduled runs use the saved profile criteria (identical to a manual search).
- Overlap/captcha: if a `search_runs` row for the user is `pending`/`running` when a tick fires, skip silently. After a captcha failure the next tick just retries (existing code already clears the session, forcing fresh login).

## Design

- **Cron pattern:** `0 {startHour}-{endHour}/{intervalHours} * * {days}` with `tz: timezone`. Default → `0 9-17/2 * * 1,2,3,4,5` in the user's timezone (e.g. `America/Toronto`) → fires 9:00, 11:00, 13:00, 15:00, 17:00 Mon–Fri.
- **Scheduler id:** one BullMQ job scheduler per user on the existing `search` queue: `searchQueue.upsertJobScheduler(`search-schedule:${userId}`, { pattern, tz }, { name: "scheduled-search", data: { userId } })`. Disable/ineligible → `removeJobScheduler(id)`. `upsertJobScheduler` is idempotent, so re-syncing is always safe.
- **Job data:** `SearchJobData` becomes `{ userId: string; runId?: string }`. Manual path keeps passing `runId`; scheduled ticks have no `runId` and the worker creates the run row itself.
- **Defaults without a row:** no `search_schedules` row means auto-search is **disabled**. `getSchedule` returns the row or `null`; the form merges `SEARCH_SCHEDULE_DEFAULTS` with the browser-detected timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) when there's no row — timezone is never prefilled from a hardcoded value. A row is only written when the user saves the form.

## Tasks

### Phase 1: Shared config + data layer

#### 1.1. [x] Shared schedule helpers
- **What:** New `packages/shared/src/search-schedule.ts`: `SearchScheduleConfig` type (`enabled: boolean; intervalHours: number; startHour: number; endHour: number; days: number[]; timezone: string`), `SEARCH_SCHEDULE_DEFAULTS` (`{ enabled: false, intervalHours: 2, startHour: 9, endHour: 17, days: [1,2,3,4,5] }` as a `const` object — **no timezone**; that's always browser-detected or user-chosen, never hardcoded), `buildSearchCronPattern(config)` returning the cron string (sort + dedupe days; when `startHour === endHour` emit just that hour), and `isValidTimeZone(tz)` (try/catch `new Intl.DateTimeFormat(undefined, { timeZone: tz })`). Export from `packages/shared/src/index.ts`.
- **Files:** `packages/shared/src/search-schedule.ts`, `packages/shared/src/index.ts`, `packages/shared/src/search-schedule.test.ts`
- **Verify:** `pnpm --filter @repo/shared exec vitest run` — tests cover default pattern (`0 9-17/2 * * 1,2,3,4,5`), single-hour window, unsorted/duplicate days, invalid timezone rejection.

#### 1.2. [x] `search_schedules` table
- **What:** New `packages/db/src/schema/search-schedules.ts`: `id` uuid pk default random, `userId` text notNull unique references `users.id` onDelete cascade, `enabled` boolean notNull default `false`, `intervalHours` integer notNull default `2`, `startHour` integer notNull default `9`, `endHour` integer notNull default `17`, `days` integer array notNull default `[1,2,3,4,5]`, `timezone` text notNull (no column default — the form always submits a detected or user-chosen value). Export `SearchSchedule` select type. Re-export from `packages/db/src/schema/index.ts` (match how `search-runs.ts` is wired).
- **Files:** `packages/db/src/schema/search-schedules.ts`, `packages/db/src/schema/index.ts`
- **Verify:** `pnpm typecheck` passes.

#### 1.3. [x] Migration
- **What:** Generate and run the Drizzle migration for the new table.
- **Files:** generated files under `packages/db` migrations dir (do not hand-write)
- **Verify:** `pnpm generate --name search-schedules` then `pnpm migrate` completes; if `generate` fails for lack of a TTY, stop and ask the user to run it rather than hand-writing snapshot files.

#### 1.4. [x] DB queries
- **What:** New `packages/db/src/queries/search-schedules.ts`: `getSearchScheduleForUser(db, userId)` (row or null), `upsertSearchSchedule(db, userId, values)` (insert `onConflictDoUpdate` target `userId`, returning row), `listScheduleSyncTargets(db)` — all `search_schedules` rows (users without a row are disabled and need no scheduler), each joined with whether a `job_criteria` row and a `linkedin_accounts` row exist, returning `{ schedule: SearchSchedule; hasCriteria: boolean; hasLinkedIn: boolean }[]` (used by worker startup sync). Add `hasActiveSearchRun(db, userId)` to `packages/db/src/queries/search-runs.ts` (`status` in `["pending","running"]`, return boolean). Export via `packages/db/src/queries/index.ts`.
- **Files:** `packages/db/src/queries/search-schedules.ts`, `packages/db/src/queries/search-runs.ts`, `packages/db/src/queries/index.ts`, `packages/db/src/queries/search-schedules.test.ts`
- **Verify:** `pnpm --filter @repo/db exec vitest run` — use the existing chainable query-builder mock pattern from `jobs.test.ts`.

### Phase 2: Scheduling engine (API service + worker)

#### 2.1. [x] Schedule service + scheduler sync
- **What:** Make `runId` optional in `SearchJobData` (`packages/api/src/queues/index.ts`). New `packages/api/src/services/search-schedule.service.ts`:
  - `upsertScheduleSchema` (zod): `enabled: z.boolean()`, `intervalHours: z.number().int().min(1).max(8)`, `startHour: z.number().int().min(0).max(23)`, `endHour: z.number().int().min(0).max(23)`, `days: z.array(z.number().int().min(0).max(6)).min(1)`, `timezone: z.string().refine(isValidTimeZone)`, with a `.refine` enforcing `startHour <= endHour`.
  - `syncSearchScheduler(db, userId)` → load the schedule row (`getSearchScheduleForUser` — `null` means disabled), `getJobCriteriaForUser`, `getLinkedInAccount`; if `schedule?.enabled && criteria && account` → `searchQueue.upsertJobScheduler("search-schedule:" + userId, { pattern: buildSearchCronPattern(config), tz: config.timezone }, { name: "scheduled-search", data: { userId } })`; otherwise `searchQueue.removeJobScheduler("search-schedule:" + userId)`.
  - `upsertSchedule(db, userId, input)` → `upsertSearchSchedule` then `syncSearchScheduler`.
- **Files:** `packages/api/src/queues/index.ts`, `packages/api/src/services/search-schedule.service.ts`, `packages/api/src/services/search-schedule.service.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run` — mock `../queues/index` (existing pattern); assert upsert vs remove decisions for: enabled+ready, disabled, missing criteria, missing LinkedIn account; assert cron/tz passed through.

#### 2.2. [x] Router wiring
- **What:** In `packages/api/src/routers/profile.ts` add schedule data by extending `getProfile` in `profile.service.ts` to also return `schedule: await getSearchScheduleForUser(db, userId)` (row or `null`), and add `upsertSchedule: protectedProcedure.input(upsertScheduleSchema).mutation(...)`. Also call `syncSearchScheduler(ctx.db, userId)` after `upsertCriteria` and `upsertLinkedIn` mutations resolve (in the router, matching how `jobs.ts` does queue work in routers) — this covers the user who enables the schedule *before* connecting LinkedIn or saving criteria: the scheduler activates the moment they become eligible. It's a no-op for users who haven't enabled auto-search.
- **Files:** `packages/api/src/routers/profile.ts`, `packages/api/src/services/profile.service.ts`
- **Verify:** `pnpm typecheck && pnpm --filter @repo/api exec vitest run`.

#### 2.3. [x] Worker: handle scheduled ticks
- **What:** In `apps/worker/src/workers/search.worker.ts`, branch on `job.data.runId`:
  - Present → existing `processSearch(userId, runId)` path, unchanged.
  - Absent (scheduled tick): (1) load profile/criteria/LinkedIn account and run `getMissingSearchFields` — if anything is missing, log and **return** (skip, don't throw, so BullMQ doesn't record a failure for a misconfigured user); (2) `hasActiveSearchRun(db, userId)` → log and return if true; (3) `insertSearchRun(db, { userId, platform: "linkedin", status: "pending", startedAt: new Date() })`, publish `search-run:update` with the new row so the UI sees it appear live, then call `processSearch(userId, run.id)`.
- **Files:** `apps/worker/src/workers/search.worker.ts`, `apps/worker/src/workers/search.worker.test.ts`
- **Verify:** `pnpm --filter @repo/worker exec vitest run` — cases: manual path untouched, scheduled tick skips on missing readiness, skips on active run, creates run + processes when eligible.

#### 2.4. [x] Worker: startup scheduler sync
- **What:** New `apps/worker/src/schedule-sync.ts`: create a local `new Queue("search", { connection: { url: env.REDIS_URL } })` (do **not** import the queue from `@repo/api` root — it would evaluate Better Auth env). Export `syncAllSearchSchedulers()`: iterate `listScheduleSyncTargets(db)`; for each target, if `schedule.enabled && hasCriteria && hasLinkedIn` upsert the job scheduler (same id/name/data/pattern as 2.1), else remove it. Call it once at startup from `apps/worker/src/index.ts` (after worker creation, fire-and-forget with error logging) and close the queue in `shutdown()`.
- **Files:** `apps/worker/src/schedule-sync.ts`, `apps/worker/src/index.ts`, `apps/worker/src/schedule-sync.test.ts`
- **Verify:** `pnpm --filter @repo/worker exec vitest run`; manually: start redis + worker, then `pnpm dev` and confirm via a quick redis-cli `keys *search-schedule*` (or BullMQ's `getJobSchedulers`) that schedulers exist for eligible users.

#### 2.5. [x] Dashboard stats: expose schedule status
- **What:** Extend `DashboardStats` in `packages/api/src/services/dashboard.service.ts` with `searchSchedule: { enabled: boolean; nextRunAt: Date | null }`. In `getDashboardStats`, load the user's schedule row via `getSearchScheduleForUser` (no row → `{ enabled: false, nextRunAt: null }`); when enabled, call `searchQueue.getJobScheduler("search-schedule:" + userId)` and map its `next` millis to a `Date` (`null` when no scheduler exists in Redis, e.g. enabled but not yet eligible). superjson preserves the `Date` across tRPC; the server-component path gets it directly.
- **Files:** `packages/api/src/services/dashboard.service.ts`, `packages/api/src/services/dashboard.service.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run` — mock `../queues/index`; cases: no schedule row, enabled with scheduler `next`, enabled with no Redis scheduler.

### Phase 3: Settings UI

#### 3.1. [x] Install switch component
- **What:** `npx shadcn@latest add switch` from `apps/web/`.
- **Files:** `apps/web/components/ui/switch.tsx`
- **Verify:** file exists; `pnpm typecheck` passes.

#### 3.2. [x] Schedule form
- **What:** New `apps/web/components/profile/schedule-form.tsx` ("use client"), mirroring `linkedin-form.tsx`/`criteria-form.tsx` conventions: react-hook-form + zodResolver (reuse field constraints client-side), `Field`/`FieldLabel`/`FieldError`/`FieldDescription`, Sonner toasts, mutation `trpc.profile.upsertSchedule` with `utils.profile.getProfile.invalidate()` on success. Controls: enabled `Switch`; interval `Select` (1/2/3/4/6/8 hours); start/end hour `Select`s (00:00–23:00, format labels with `date-fns` `format`); days as a row of `Checkbox`es (Sun–Sat, values 0–6); timezone `Select` populated from `Intl.supportedValuesOf("timeZone")`. The `initial` prop is `SearchSchedule | null`: with a saved row, use it as defaultValues; with `null`, use `SEARCH_SCHEDULE_DEFAULTS` and **detect the timezone** via `Intl.DateTimeFormat().resolvedOptions().timeZone` — apply the detected value after mount (`useEffect` + `setValue`/`reset`), not in `useForm` defaultValues, so the SSR-rendered markup doesn't mismatch the client during hydration. Disable the non-toggle fields when `enabled` is off.
- **Files:** `apps/web/components/profile/schedule-form.tsx`
- **Verify:** `pnpm typecheck && pnpm lint`.

#### 3.3. [x] Schedule tab
- **What:** Add a "Schedule" `TabsTrigger`/`TabsContent` to `apps/web/components/profile/profile-content.tsx` rendering `<ScheduleForm initial={data?.schedule} />`. Schedule data flows through the extended `getProfile` output automatically (`RouterOutputs["profile"]["getProfile"]`), so the server component page needs no changes.
- **Files:** `apps/web/components/profile/profile-content.tsx`
- **Verify:** `pnpm dev`, open /profile → Schedule tab shows defaults; save a change, reload, values persist; toggling off then re-running worker startup removes/re-adds the Redis scheduler.

#### 3.4. [x] SSE: show scheduled runs live
- **What:** `applySearchRunUpdateEvent` and `applyDashboardSearchRunUpdateEvent` in `apps/web/components/sse-provider.tsx` only map over existing runs, so a run created by the worker (scheduled tick) never appears until a refetch. Change both to prepend the run when its id isn't in the list (runs are ordered by `startedAt` desc, so prepend is correct).
- **Files:** `apps/web/components/sse-provider.tsx`, `apps/web/components/sse-provider.test.ts`
- **Verify:** `pnpm --filter web exec vitest run` — add test cases for unknown-run prepend; existing update cases still pass.

#### 3.5. [x] Agent status card: live "Next scheduled"
- **What:** In `apps/web/components/dashboard/agent-status.tsx`, add a `searchSchedule: DashboardStats["searchSchedule"]` prop and replace the hardcoded `nextScheduled` entry in `META_ROWS` with a computed value: disabled → `"Disabled"`; enabled with `nextRunAt` → relative time via `formatDistanceToNow(nextRunAt, { addSuffix: true })` (capitalized, matching the "Last run" row); enabled but `nextRunAt === null` → `"Waiting for setup"` (enabled before criteria/LinkedIn are complete). Keep the `autoApply` row hardcoded. In `apps/web/components/dashboard/dashboard-client.tsx`, pass `searchSchedule={data.searchSchedule}` (the field arrives through the extended `DashboardStats`, so the dashboard page server component needs no changes).
- **Files:** `apps/web/components/dashboard/agent-status.tsx`, `apps/web/components/dashboard/dashboard-client.tsx`
- **Verify:** `pnpm typecheck && pnpm lint`; manually: with schedule disabled the card shows "Disabled"; enable it in /profile → Schedule, reload dashboard → card shows e.g. "In about 2 hours".

## Notes

- **Why the worker has its own Queue instance:** `packages/api`'s root export evaluates Better Auth config (needs `BETTER_AUTH_*` env the worker doesn't have). Runtime scheduler logic shared between web and worker therefore lives in `@repo/shared` (pure cron/defaults) and `@repo/db` (queries); only the thin `upsertJobScheduler`/`removeJobScheduler` call is duplicated between `search-schedule.service.ts` and `schedule-sync.ts`. If this duplication grows, adding an `exports` subpath map to `@repo/api`'s package.json is the follow-up — out of scope here.
- **End hour is inclusive** (cron range semantics): 9–17 every 2h fires at 17:00. The form should label it "Last run at" or similar so this is unambiguous.
- **No "pause after captcha"** by user decision — a captcha-failed run completes as `failed`, the session is cleared (existing behavior), and the next tick retries with a fresh login.
- **Tick failures and retries:** scheduled jobs are added by BullMQ with default attempts (1); a thrown error inside `processSearch` marks that tick failed but does not affect future ticks. Skips (not ready / already running) must `return`, not throw, to avoid noisy failure stats.
- **Drift between DB and Redis:** any code path that changes eligibility (criteria saved, LinkedIn saved, schedule saved) calls `syncSearchScheduler`; worker startup reconciles everything else (Redis flush, rows edited out-of-band). There is currently no account-deletion flow to clean up; the startup sync's remove branch covers stragglers.
- **2026-06-11 — Revision:** switched enablement from on-by-default to opt-in (defaults `enabled: false` in shared config + DB column; startup sync now iterates only saved `search_schedules` rows); added tasks 2.5 and 3.5 to wire the dashboard Agent status card's hardcoded "Next scheduled: Manual only" row to the real BullMQ scheduler next-run time.
- **Timezone list size:** `Intl.supportedValuesOf("timeZone")` is ~400 entries in a plain `Select`. Acceptable for now; swap to a combobox later if it annoys.
- **2026-06-11 — Revision:** timezone is never prefilled from a hardcoded default — removed it from `SEARCH_SCHEDULE_DEFAULTS` and the DB column default; the form detects it client-side via `Intl.DateTimeFormat().resolvedOptions().timeZone` (applied post-mount to avoid hydration mismatch). `getProfile` now returns the schedule row or `null` instead of merged defaults.

## Completed

- **Date:** 2026-06-11
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/shared/src/search-schedule.ts` (+test) — `SearchScheduleConfig`, `SEARCH_SCHEDULE_DEFAULTS` (no timezone), `buildSearchCronPattern`, `isValidTimeZone`
  - `packages/shared/package.json` — added vitest devDep + `test` script (package had no tests before)
  - `packages/db/src/schema/search-schedules.ts` — `search_schedules` table; migration `drizzle/0014_search-schedules.sql` generated (`drizzle-kit generate --name search-schedules` — works non-interactively for new tables) and applied
  - `packages/db/src/queries/search-schedules.ts` (+test) — `getSearchScheduleForUser`, `upsertSearchSchedule`, `listScheduleSyncTargets`; `hasActiveSearchRun` added to `search-runs.ts`
  - `packages/api/src/queues/index.ts` — `SearchJobData.runId` now optional
  - `packages/api/src/services/search-schedule.service.ts` (+test) — zod schema, `searchSchedulerId`, `syncSearchScheduler`, `upsertSchedule`
  - `packages/api/src/routers/profile.ts` + `services/profile.service.ts` — `getProfile` returns `schedule`; `upsertSchedule` mutation; `upsertCriteria`/`upsertLinkedIn` re-sync the scheduler
  - `packages/api/src/services/dashboard.service.ts` (+test) — `DashboardStats.searchSchedule { enabled, nextRunAt }` from `searchQueue.getJobScheduler`
  - `apps/worker/src/workers/search.worker.ts` (+test) — scheduled ticks (no `runId`) check readiness + active-run overlap, create the run row, publish SSE, then run the normal search path
  - `apps/worker/src/schedule-sync.ts` (+test) + `index.ts` — local `Queue("search")`, `syncAllSearchSchedulers()` at startup, queue closed on shutdown
  - `apps/web/components/ui/switch.tsx` — installed via shadcn
  - `apps/web/components/profile/schedule-form.tsx` + `profile-content.tsx` — Schedule tab (toggle, interval, first/last run hours, days, browser-detected timezone)
  - `apps/web/components/sse-provider.tsx` (+test) — search-run updates now prepend unknown runs
  - `apps/web/components/dashboard/agent-status.tsx` + `dashboard-client.tsx` — "Next scheduled" shows Disabled / relative next-run time / Waiting for setup
- **How to test:** `pnpm dev` → /profile → Schedule tab → enable + save; dashboard Agent status card should show the next run time; `docker exec applied-redis-1 redis-cli keys '*search-schedule*'` shows the scheduler; disable + save removes it. Worker logs `[worker] Search schedulers synced` on boot.
- **Follow-up items:**
  - Pre-existing lint failures (import order/format) in `packages/api/src/routers/dashboard.ts`, `packages/api/src/sse.ts`, `apps/web/app/(dashboard)/layout.tsx`, `apps/web/components/jobs/jobs-client.tsx` — untouched by this feature; a one-off `pnpm format` would clear them
  - Timezone `Select` is a plain ~400-entry list; swap to a combobox if it annoys
  - If worker/api scheduler-call duplication grows, add an `exports` subpath map to `@repo/api`
