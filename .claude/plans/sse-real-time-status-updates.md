# Plan: SSE Real-Time Status Updates

> Replace static status displays on dashboard, jobs, and runs pages with live updates via Server-Sent Events backed by Redis pub/sub.

## Research Summary

- **Stack:** Next.js 16 App Router, TypeScript, tRPC + TanStack Query v5, Better Auth (cookie-based), BullMQ + Redis, Drizzle ORM, superjson
- **Relevant patterns:**
  - Auth in API routes: `auth.api.getSession({ headers: req.headers })` — cookie-based, works with native `EventSource` (same-origin cookies sent automatically)
  - Worker shutdown: `apps/worker/src/index.ts` already calls `await Promise.all([searchWorker.close(), applyWorker.close(), ...])` — add Redis disconnect here
  - Web env validation: `apps/web/lib/env.ts` (Zod, currently only `NEXT_PUBLIC_BASE_URL`)
  - tRPC cache surgery: `trpc.useUtils()` gives typed `setData` / `invalidate` per procedure
- **Key files:**
  - `apps/worker/src/workers/apply.worker.ts` — apply run lifecycle, log collection
  - `apps/worker/src/workers/search.worker.ts` — search run lifecycle
  - `apps/worker/src/index.ts` — worker shutdown
  - `apps/web/app/(dashboard)/layout.tsx` — where `SseProvider` will be mounted
  - `apps/web/lib/env.ts` — add `REDIS_URL` here
  - `apps/web/lib/trpc.tsx` — `TRPCProvider` (wraps `QueryClientProvider`)
- **New dependencies:** `ioredis` added explicitly to `apps/worker` and `apps/web` (currently only transitive via BullMQ); `superjson` already in `apps/web`
- **Risks/Considerations:**
  - Redis pub/sub requires dedicated connections — ioredis enforces this; the publish client and each per-request subscribe client must be separate instances
  - Apply run logs are currently collected in-memory and flushed in one DB write on completion. The plan streams each log entry via SSE immediately but keeps the final batch DB write unchanged — live view will show more entries than a hard-refresh mid-job
  - `export const runtime = "nodejs"` is required on the SSE route (ioredis is not edge-compatible)
  - Next.js middleware matcher `/((?!api|...))` already excludes `/api/*` — SSE route auth must be done inside the route handler itself

## Tasks

### Phase 1: Shared event types

#### 1.1 [x] Define `SseEvent` discriminated union
- **What:** Create `packages/api/src/sse.ts` with a typed union for every event the worker can emit. Export it from `packages/api/src/index.ts`.
- **Files:** `packages/api/src/sse.ts` (new), `packages/api/src/index.ts`
- **Details:**
  ```ts
  export type SseEvent =
    | { type: "job:status"; jobId: string; status: Job["status"]; appliedAt: Date | null; failureReason: string | null; updatedAt: Date }
    | { type: "apply-run:update"; jobId: string; run: ApplyRun }
    | { type: "apply-run:log"; jobId: string; runId: string; log: ApplyRunLog }
    | { type: "search-run:update"; run: SearchRun }
  ```
  Import `Job`, `ApplyRun`, `ApplyRunLog`, `SearchRun` from `@repo/db`.
- **Verify:** `pnpm typecheck` passes with no new errors.

---

### Phase 2: Redis pub/sub utilities

#### 2.1 [x] Worker publish client
- **What:** Create `apps/worker/src/redis.ts` — instantiate one ioredis client for publishing, export `publishEvent(userId: string, event: SseEvent): void` (fire-and-forget using `void redisClient.publish(...)`) and `closeRedisPublisher(): Promise<void>`. Wire `closeRedisPublisher` into the shutdown sequence in `apps/worker/src/index.ts`.
- **Files:** `apps/worker/src/redis.ts` (new), `apps/worker/src/index.ts`
- **Details:** Channel name: `` `events:${userId}` ``. Serialize payload with `superjson.stringify(event)`. Publish errors should only `console.error` — never throw, never block the worker.
- **Verify:** Worker starts and shuts down cleanly (`pnpm turbo dev --filter=@repo/worker`).

#### 2.2 [x] Web subscribe client + env
- **What:** Add `REDIS_URL: z.string().min(1)` to `apps/web/lib/env.ts`. Create `apps/web/lib/redis.ts` exporting `createRedisSubscriber(): Redis` — returns a fresh ioredis instance configured from `env.REDIS_URL`. Each SSE request gets its own subscriber (ioredis requires dedicated connections for subscribe mode).
- **Files:** `apps/web/lib/env.ts`, `apps/web/lib/redis.ts` (new)
- **Verify:** `pnpm typecheck` passes; `REDIS_URL` missing at startup throws a Zod error.

#### 2.3 [x] Add `ioredis` as a direct dependency
- **What:** Add `ioredis` to `dependencies` in both `apps/worker/package.json` and `apps/web/package.json`. Run `pnpm install`.
- **Files:** `apps/worker/package.json`, `apps/web/package.json`
- **Verify:** `import Redis from "ioredis"` resolves in both apps without TS errors.

---

### Phase 3: Worker event publishing

#### 3.1 [x] Search worker — publish run status changes
- **What:** In `search.worker.ts`, after each `updateSearchRun` call, call `publishEvent(userId, { type: "search-run:update", run: { id: runId, userId, platform: "linkedin", status, startedAt, completedAt, jobCount, errorMessage, searchCriteria } })`. Construct the run object from values already in scope — no extra DB fetch needed.
- **Files:** `apps/worker/src/workers/search.worker.ts`
- **Verify:** Trigger a search; `redis-cli subscribe events:<userId>` receives three messages (running → completed/failed).

#### 3.2 [x] Apply worker — publish run status, job status, and log entries
- **What:** In `apply.worker.ts`, make four additions:
  1. Change the `log` closure to also call `publishEvent(userId, { type: "apply-run:log", jobId, runId, log: entry })` after pushing to the array.
  2. After `updateApplyRun(db, runId, { status: "running" })`, publish `apply-run:update` with `status: "running"`.
  3. In the success branch after `updateApplyRun(completed)`, publish `apply-run:update` with `status: "completed"` and `job:status` with `status: "applied"`.
  4. In the catch branch after `updateApplyRun(failed)`, publish `apply-run:update` with `status: "failed"` and `job:status` with `status: "failed"`.
  
  Job status fields (`appliedAt`, `failureReason`, `updatedAt`) are inferable from the branch: success branch sets `appliedAt: new Date()`, failure branch sets `failureReason: err.message`.
- **Files:** `apps/worker/src/workers/apply.worker.ts`
- **Verify:** Trigger an apply job; Redis channel receives: `apply-run:update (running)` → multiple `apply-run:log` entries → `apply-run:update (completed/failed)` + `job:status (applied/failed)`.

---

### Phase 4: SSE API route

#### 4.1 [x] `/api/events` streaming route
- **What:** Create `apps/web/app/api/events/route.ts`:
  1. `export const runtime = "nodejs"`
  2. `GET` handler: authenticate via `auth.api.getSession({ headers: req.headers })` — return `401` if no session.
  3. Create a `createRedisSubscriber()` client, subscribe to `` `events:${session.user.id}` ``.
  4. Return a `new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } })` where `stream` is a `ReadableStream` that:
     - Enqueues each Redis `message` event as `data: <payload>\n\n`
     - Sends a heartbeat comment `": heartbeat\n\n"` every 30 s via `setInterval`
     - In `cancel()`, clears the interval, calls `subscriber.unsubscribe()` and `subscriber.disconnect()`
- **Files:** `apps/web/app/api/events/route.ts` (new)
- **Verify:** `curl -N --cookie "<session-cookie>" http://localhost:3000/api/events` holds open and emits `: heartbeat` lines every 30 s. Triggering a job search emits `data:` lines.

---

### Phase 5: Client-side SSE integration

#### 5.1 [x] `SseProvider` component
- **What:** Create `apps/web/components/sse-provider.tsx` — a `"use client"` component that:
  1. Opens `new EventSource("/api/events")` on mount; closes it on unmount.
  2. Tracks whether the connection has opened at least once; on subsequent `open` events (reconnects), calls `utils.jobs.list.invalidate()`, `utils.runs.list.invalidate()`, and `utils.dashboard.getStats.invalidate()` to recover missed events.
  3. On each `message` event, calls `superjson.parse<SseEvent>(event.data)` and dispatches to the appropriate `utils.***.setData` call:
     - `job:status` → patch the matching job in `jobs.list` cache (update `status`, `appliedAt`, `failureReason`, `updatedAt`) and in `dashboard.getStats.jobs` (only the fields `DashboardJob` carries: `status`, `appliedAt`, `updatedAt`).
     - `apply-run:update` → replace `latestApplyRun` on the matching job in `jobs.list` cache.
     - `apply-run:log` → append the log entry to `latestApplyRun.logs` on the matching job in `jobs.list` cache.
     - `search-run:update` → replace the matching run in `runs.list` cache and in `dashboard.getStats.searchRuns`.
  4. Uses `trpc.useUtils()` for all cache access — must be rendered inside `TRPCProvider`.
- **Files:** `apps/web/components/sse-provider.tsx` (new)
- **Verify:** Covered by task 5.3 end-to-end test.

#### 5.2 [x] Mount `SseProvider` in dashboard layout
- **What:** Wrap `children` with `<SseProvider>` in `apps/web/app/(dashboard)/layout.tsx`. The layout is a server component — `SseProvider` is a client component, so this is a valid server→client boundary.
- **Files:** `apps/web/app/(dashboard)/layout.tsx`
- **Verify:** One `EventSource` connection appears in the DevTools Network tab when any dashboard page is open.

#### 5.3 [x] Add fallback polling to client components
- **What:** Add `refetchInterval` to the `useQuery` call in each of the three client components. Poll every 10 s (not 3 s — SSE handles the fast path) only when active statuses are present; return `false` when idle. Use `(query) => { const data = query.state.data; ... }` pattern (TanStack Query v5 API). This catches any events missed during SSE reconnect gaps.
  - `dashboard-client.tsx`: active when any job has `status === "applying"` or any searchRun has `status === "pending" | "running"`
  - `jobs-client.tsx`: active when any job has `status === "applying"` or `latestApplyRun?.status === "pending" | "running"`
  - `runs-client.tsx`: active when any run has `status === "pending" | "running"`
- **Files:** `apps/web/components/dashboard/dashboard-client.tsx`, `apps/web/components/jobs/jobs-client.tsx`, `apps/web/components/runs/runs-client.tsx`
- **Verify:** With SSE connected and a job actively applying, Network tab shows: one persistent SSE connection, and `/api/trpc` batched only every 10 s. With no active jobs, no tRPC polling fires at all.

---

### Phase 6: Tests

#### 6.1 [x] Unit test `publishEvent`
- **What:** In `apps/worker/src/redis.test.ts`, mock ioredis and assert that `publishEvent(userId, event)` calls `redis.publish` with channel `` `events:${userId}` `` and a superjson-serialized payload for each event type.
- **Files:** `apps/worker/src/redis.test.ts` (new)
- **Verify:** `pnpm --filter @repo/worker exec vitest run` passes.

#### 6.2 [x] Unit test `SseProvider` cache update logic
- **What:** Extract the per-event-type cache update functions from `SseProvider` into testable pure functions (take `oldData` and `event`, return `newData`). Test each: `job:status` patches correct job, `apply-run:log` appends without mutating other jobs, `search-run:update` replaces the right run, unknown event types are ignored.
- **Files:** `apps/web/components/sse-provider.test.ts` (new), `apps/web/components/sse-provider.tsx` (export the updater functions)
- **Verify:** `pnpm turbo test --filter=web` passes.

---

## Completed

- **Date:** 2026-06-01
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/api/src/sse.ts` — new `SseEvent` discriminated union using `Pick<Job, ...>` for the status event
  - `packages/api/src/index.ts` — exports `SseEvent`
  - `packages/db/src/queries/search-runs.ts` — `updateSearchRun` now returns the updated row via `.returning()`
  - `packages/db/src/queries/apply-runs.ts` — `updateApplyRun` now returns the updated row via `.returning()`
  - `apps/worker/src/redis.ts` — new Redis publish client: `publishEvent`, `closeRedisPublisher`
  - `apps/worker/src/index.ts` — `closeRedisPublisher` added to shutdown sequence
  - `apps/worker/src/workers/search.worker.ts` — publishes `search-run:update` after each status transition
  - `apps/worker/src/workers/apply.worker.ts` — publishes `apply-run:log` per log entry, `apply-run:update` + `job:status` on completion/failure
  - `apps/worker/src/redis.test.ts` — 6 unit tests for `publishEvent`
  - `apps/worker/package.json` — added `ioredis`, `superjson`, `@repo/api`, `vitest`; added `test` script
  - `apps/worker/vitest.config.ts` — new vitest config
  - `apps/web/lib/env.ts` — added `REDIS_URL` validation
  - `apps/web/lib/redis.ts` — new `createRedisSubscriber()` factory
  - `apps/web/app/api/events/route.ts` — new SSE streaming route with auth, Redis subscribe, heartbeat, cleanup
  - `apps/web/components/sse-provider.tsx` — new `SseProvider` with 6 exported pure cache-updater functions
  - `apps/web/app/(dashboard)/layout.tsx` — wraps children with `<SseProvider>`
  - `apps/web/components/dashboard/dashboard-client.tsx` — 10 s conditional fallback polling
  - `apps/web/components/jobs/jobs-client.tsx` — 10 s conditional fallback polling
  - `apps/web/components/runs/runs-client.tsx` — 10 s conditional fallback polling
  - `apps/web/components/sse-provider.test.ts` — 8 unit tests for cache updater functions
  - `apps/web/package.json` — added `ioredis`, `vitest`; added `test` script
  - `apps/web/vitest.config.ts` — new vitest config with `@/` path alias
- **How to test:**
  1. `pnpm dev` — starts web + worker
  2. Open the jobs or runs page, trigger a job search or apply run
  3. Watch status badges update in real-time without page refresh
  4. Open DevTools Network — one persistent `/api/events` SSE connection; `/api/trpc` only polls every 10 s when active statuses are present
- **Follow-up items:**
  - `isLoading` branch in `jobs-client.tsx` is dead code when `initialData` is set (TanStack Query never enters loading state) — low-priority cleanup
  - `searchCriteria` field will be `null` in live SSE `search-run:update` events during/after a run (it's set inside `packages/automation`, not the worker). The field is populated on the next 10 s poll or page refresh.

## Notes

- **`ioredis` dep:** BullMQ v5 bundles ioredis internally but doesn't expose it. Add `ioredis` directly to avoid relying on a transitive dep at a potentially different version.

- **Date serialization:** superjson handles `Date` fields in SSE events. The tRPC cache already holds superjson-deserialized `Date` objects (from the tRPC transport); SSE cache updates must use the same serialization or `setData` will write string dates where `Date` objects are expected, breaking type safety.

- **Fire-and-forget publish:** `publishEvent` must never throw or await — blocking the worker on a Redis write would risk BullMQ lock expiry. Use `void redisClient.publish(...).catch(console.error)`.

- **Log streaming vs DB:** SSE streams each log entry in real-time, but the DB batch write on completion is unchanged. A hard-refresh mid-job will show no logs (DB has none yet); the live SSE stream shows them. This is an accepted trade-off — the live view is for monitoring, not auditability.

- **Multiple tabs:** Each tab opens its own `EventSource` and its own Redis subscription. Standard practice — no fan-out needed beyond Redis pub/sub.

- **`searchCriteria` in published run:** `searchCriteria` is written to the run partway through `runSearch()` (in `packages/automation`), not at the worker level. For the `search-run:update (running)` publish, set `searchCriteria: null` since it isn't available yet. The `completed` publish will also have `null` from the worker's perspective. If `searchCriteria` matters on the runs page, the invalidation on reconnect / 10 s poll will fetch the real value.
