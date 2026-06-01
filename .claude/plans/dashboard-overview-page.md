# Plan: Dashboard Overview Page

> Implement the `/dashboard` overview screen from the Claude Design file — stat cards, weekly activity chart, pipeline funnel, activity feed, and agent status — wired to real DB data and integrated into the existing app shell.

## Research Summary

- **Stack:** Next.js App Router, TypeScript, Drizzle ORM + PostgreSQL, tRPC, TanStack Query v5, Tailwind v4 (OKLch tokens), shadcn/ui (Base-UI), Remixicon
- **Design source:** `applied-web/project/app/Dashboard.jsx` + `styles.css` from the exported Claude Design bundle
- **Relevant patterns:** Server pages fetch data via service functions, pass `initialData` to `"use client"` components which use `trpc.*.useQuery({ initialData })` — same as Jobs, Runs, Profile pages. `PageLayout` wraps every dashboard page.
- **Key files:**
  - `apps/web/components/nav/sidebar.tsx` — NAV_LINKS array to extend
  - `apps/web/app/(dashboard)/layout.tsx` — route group layout (no changes needed)
  - `packages/api/src/router.ts` — where new router gets merged
  - `packages/api/src/index.ts` — re-exports new service for server-side page use
  - `packages/db/src/schema/jobs.ts` — `fitTierEnum`, `jobStatusEnum`, `jobs` table
  - `packages/db/src/schema/search-runs.ts`, `apply-runs.ts`, `linkedin-accounts.ts`
- **New dependencies:** `chart` shadcn component (`npx shadcn@latest add chart`, installs Recharts + shadcn wrappers) — run from `apps/web/`. The `progress` component was considered for the pipeline bars but rejected: it doesn't expose `indicatorClassName`, so per-bar color changes require a `[&>div]:bg-*` hack; custom divs are cleaner.
- **Risks/Considerations:**
  - No numeric score column in `jobs` — design shows score numbers (94, 91…). Show `fitTier` badge instead.
  - No response-tracking data — omit the "Response rate" stat card (show 3 stats or replace with "Total found").
  - `pending_review` maps to "Pending" in the design's pipeline display.
  - Weekly chart needs Mon–Sun slots for the current ISO week. Use `date-fns` (`startOfISOWeek`, `eachDayOfInterval`, `format`).
  - Agent "Next scheduled" row is not implemented in the app — show "Manual only" as the value.
  - The design's 1.5fr/1fr two-column layout: use `grid-cols-5` with left `col-span-3`, right `col-span-2` (3:2 ≈ 1.5:1).
  - The dashboard page is new — URL `/dashboard`. A "Dashboard" nav link must be added to the sidebar above "Jobs".

---

## Tasks

### Phase 1: Data Layer

#### 1.1. [x] Dashboard service function
- **What:** Create `packages/api/src/services/dashboard.service.ts` exporting `getDashboardStats(db, userId)`. Run these queries in parallel via `Promise.all`:
  1. Status-group counts (`SELECT status, count(*) FROM jobs WHERE user_id = ? GROUP BY status`) → drives stat cards + pipeline
  2. FitTier-group counts (`GROUP BY fit_tier`) → strong matches stat
  3. This week's jobs (`createdAt >= startOfISOWeek(today)`) → weekly chart (found per day + applied per day)
  4. Last 8 completed search runs → recent activity feed
  5. Last 8 completed apply runs joined with job title/company → recent activity feed
  6. Top 4 pending-review jobs ordered by fitTier (`strong` → `potential`) → top matches
  7. Last completed search run `completedAt` → agent "Last run" timestamp
  8. Existence of a `linkedin_accounts` row for the user → agent "LinkedIn connected" badge

  Return a typed object:
  ```ts
  type DashboardStats = {
    stats: { applied: number; pendingReview: number; strongMatches: number; totalFound: number };
    pipeline: { pendingReview: number; applied: number; failed: number; skipped: number };
    weeklyActivity: Array<{ day: string; found: number; applied: number }>;  // 7 entries Mon–Sun
    recentActivity: Array<{ kind: "search" | "applied" | "failed"; title: string; meta: string; createdAt: Date }>;
    agentStatus: { lastRunAt: Date | null; linkedInConnected: boolean };
    topMatches: Array<{ id: string; title: string; company: string; location: string | null; fitTier: "strong" | "potential" | "weak" }>;
  };
  ```
- **Files:** `packages/api/src/services/dashboard.service.ts` (new)
- **Verify:** `pnpm --filter @repo/api exec vitest run` passes; type-check `pnpm typecheck`

#### 1.2. [x] Dashboard tRPC router
- **What:** Create `packages/api/src/routers/dashboard.ts` with a single `getStats` protected procedure that calls `getDashboardStats(ctx.db, ctx.session.user.id)` and returns the result.
- **Files:** `packages/api/src/routers/dashboard.ts` (new)
- **Verify:** `pnpm typecheck` passes; router file compiles without errors

#### 1.3. [x] Wire router + export service
- **What:** Merge `dashboardRouter` into the root router in `packages/api/src/router.ts`. Export `getDashboardStats` from `packages/api/src/index.ts` so the server page can call it directly.
- **Files:** `packages/api/src/router.ts`, `packages/api/src/index.ts`
- **Verify:** `pnpm typecheck` passes; `AppRouter` includes `dashboard.getStats`

#### 1.4. [x] Unit tests for dashboard service
- **What:** Add `packages/api/src/services/dashboard.service.test.ts` testing `getDashboardStats`. Mock the Drizzle DB with the same chainable query-builder mock pattern used in `jobs.service.test.ts`. Cover: empty state (all zeros, no LinkedIn), single job, weekly chart day assignment.
- **Files:** `packages/api/src/services/dashboard.service.test.ts` (new)
- **Verify:** `pnpm --filter @repo/api exec vitest run` all pass

---

### Phase 2: UI Components

> **shadcn/ui component key:** Every card section uses `Card` + `CardHeader` + `CardTitle` + `CardContent` from `@/components/ui/card`. Heading-level links/actions inside cards use `CardAction` (auto-positions to the right via the grid in `CardHeader`). All buttons use `Button` from `@/components/ui/button`; navigation buttons use `render={<Link href="..." />}` (Base-UI pattern — no `asChild`). Badges use `Badge` from `@/components/ui/badge`. Loading icon inside buttons uses `Spinner` from `@/components/ui/spinner`.

#### 2.1. [x] Stat cards
- **What:** Create `apps/web/components/dashboard/stat-cards.tsx`. Export `StatCards` receiving `jobs: DashboardJob[]` and rendering a `grid grid-cols-3 gap-3.5` of three stat cards — no response rate (not tracked). Each stat card is a `<Card>` containing:
  - `<CardHeader>`: `<CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>` + `<CardAction>` wrapping a small accent-bg icon square (`size-7 rounded-lg bg-accent flex items-center justify-center text-primary`) with the Remixicon.
  - `<CardContent>`: large value (`text-3xl font-semibold tracking-tight`), delta line below in `text-xs text-muted-foreground`.
  - Cards (all derived from the `jobs` array client-side):
    - "Applications sent" (`RiSendPlaneLine`) — `jobs.filter(j => j.status === "applied").length`
    - "Pending review" (`RiInboxLine`) — `jobs.filter(j => j.status === "pending_review").length`
    - "Strong matches" (`RiFocus3Line`) — `jobs.filter(j => j.fitTier === "strong").length`
- **Files:** `apps/web/components/dashboard/stat-cards.tsx` (new)
- **Verify:** `pnpm typecheck` passes; three cards render with correct counts

#### 2.2. [x] Install chart component + weekly activity chart
- **What:** First, install the shadcn `chart` component: run `npx shadcn@latest add chart` from `apps/web/`. This installs `components/ui/chart.tsx` (wrappers: `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`) and adds Recharts as a dependency.

  Then create `apps/web/components/dashboard/weekly-chart.tsx`. Wraps in `<Card>` with:
  - `<CardHeader>`: `<CardTitle>This week</CardTitle>` + `<CardAction><span className="text-xs text-muted-foreground font-mono">{totalApplied} applied · {totalFound} found</span></CardAction>`.
  - `<CardContent>`: A stacked `BarChart` via Recharts inside `<ChartContainer config={chartConfig} className="h-30 w-full">`. Derive chart data as `weeklyActivity.map(entry => ({ day: entry.day, applied: entry.applied, remaining: entry.found - entry.applied }))`. Config:
    ```ts
    const chartConfig = {
      applied:   { label: "Applied", color: "var(--primary)" },
      remaining: { label: "Found",   color: "var(--accent)"  },
    } satisfies ChartConfig;
    ```
    Recharts markup:
    ```tsx
    <BarChart data={chartData} barCategoryGap="20%">
      <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
      <Bar dataKey="applied"   stackId="a" fill="var(--color-applied)"   />
      <Bar dataKey="remaining" stackId="a" fill="var(--color-remaining)" radius={[4, 4, 0, 0]} />
      <ChartTooltip content={<ChartTooltipContent />} />
      <ChartLegend content={<ChartLegendContent />} />
    </BarChart>
    ```
  - The stacked bars visually replicate the design: bottom segment = applied (primary), top segment = remaining found (accent).
- **Files:** `apps/web/components/ui/chart.tsx` (installed by shadcn CLI), `apps/web/components/dashboard/weekly-chart.tsx` (new)
- **Verify:** Chart renders with correct colors and legend; all-zero week shows empty bars; `pnpm typecheck` passes

#### 2.3. [x] Pipeline funnel
- **What:** Create `apps/web/components/dashboard/pipeline.tsx`. Wraps in `<Card>` with:
  - `<CardHeader>`: `<CardTitle>Pipeline</CardTitle>` + `<CardAction><Button variant="ghost" size="sm" render={<Link href="/jobs" />}>Open jobs <RiArrowRightLine /></Button></CardAction>`.
  - `<CardContent>`: four rows in `flex flex-col gap-3`. Each row is a `grid grid-cols-[96px_1fr_40px] items-center gap-3`: name (`text-sm font-medium`), track bar (`h-6 rounded-md bg-muted overflow-hidden relative` → inner fill `absolute inset-y-0 left-0 rounded-md` width as inline style `${(count/max)*100}%`), count (`text-sm font-mono font-medium text-right`). Fill colors: Pending=`bg-[oklch(0.62_0.06_165)]`, Applied=`bg-primary`, Failed=`bg-destructive/85`, Skipped=`bg-[oklch(0.65_0.01_165)]`.
  - No shadcn equivalent for the bars — raw divs with Tailwind inline styles are correct.
- **Files:** `apps/web/components/dashboard/pipeline.tsx` (new)
- **Verify:** Bars scale relative to the highest count; "Open jobs" link renders as `Button`

#### 2.4. [x] Search criteria card
- **What:** Create `apps/web/components/dashboard/search-criteria.tsx`. Accepts `criteria: Awaited<ReturnType<typeof getJobCriteriaForUser>>` (may be `undefined` if not set). Wraps in `<Card>` with:
  - `<CardHeader>`: `<CardTitle>Search criteria</CardTitle>` + `<CardAction><Button variant="ghost" size="sm" render={<Link href="/profile" />}>Edit <RiArrowRightLine /></Button></CardAction>`.
  - `<CardContent>`: if `criteria` is undefined or all fields are empty, show `<p className="text-sm text-muted-foreground">No criteria set.</p>`. Otherwise render a `flex flex-col gap-3` with rows, each `flex items-start gap-3 text-sm`: a `w-20 shrink-0 text-muted-foreground` label, then a `flex flex-wrap gap-1.5` of `<Badge variant="secondary">` chips. Rows (only rendered when non-empty):
    - "Roles" — `criteria.jobTitle` as one badge, `criteria.skills` as individual badges
    - "Locations" — `criteria.locations` mapped to display strings (use `location.city ?? location.country ?? "Remote"`)
    - "Seniority" — `criteria.seniority` as individual badges
  - Data is fetched server-side by the page; this component is pure display.
- **Files:** `apps/web/components/dashboard/search-criteria.tsx` (new)
- **Verify:** Renders criteria badges; empty state shows muted text; `pnpm typecheck` passes

#### 2.6. [x] Activity feed
- **What:** Create `apps/web/components/dashboard/activity-feed.tsx`. Wraps in `<Card>` with:
  - `<CardHeader>`: `<CardTitle>Recent activity</CardTitle>`.
  - `<CardContent>`: `flex flex-col divide-y divide-foreground/5`. Each item is a `flex gap-3 py-3 first:pt-0 last:pb-0`: icon square (`size-7 rounded-lg shrink-0 flex items-center justify-center text-sm`, color-coded: `applied`=`bg-primary/10 text-primary`, `failed`=`bg-destructive/10 text-destructive`, `search`=`bg-accent text-primary`); body div with title line (`text-[13.5px] leading-snug` with `font-semibold` on bold parts) and meta line (`text-xs text-muted-foreground font-mono mt-0.5`). Meta shows `formatDistanceToNow(createdAt, { addSuffix: true })` from `date-fns`.
  - Empty state: `<CardContent className="text-sm text-muted-foreground">No activity yet.</CardContent>` (no `EmptyState` component since it's inside a card).
- **Files:** `apps/web/components/dashboard/activity-feed.tsx` (new)
- **Verify:** Feed renders; empty state shows muted text; `pnpm typecheck` passes

#### 2.7. [x] Agent status card
- **What:** Create `apps/web/components/dashboard/agent-status.tsx`. Takes `agentStatus: { lastRunAt: Date | null; linkedInConnected: boolean }` + `isPending: boolean` + `onRunSearch: () => void`. Renders a `<Card>` with `<CardContent className="flex flex-col gap-3.5">`:
  - Status row: `flex items-center gap-2.5`. Pulse dot: `<span className="relative size-2.5 shrink-0"><span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30" /><span className="relative size-full rounded-full bg-primary" /></span>`. Label: `<span className="text-sm font-medium">Agent idle</span>`. Badge: `<Badge variant={linkedInConnected ? "secondary" : "outline"}>{linkedInConnected ? "LinkedIn connected" : "LinkedIn not connected"}</Badge>`.
  - Meta rows: `flex flex-col gap-2`. Each row `flex items-center justify-between text-sm`: key in `text-muted-foreground`, value in `font-medium`. Show: "Last run" (`formatDistanceToNow(lastRunAt, { addSuffix: true })` or "Never"), "Next scheduled" ("Manual only"), "Auto-apply" ("Strong matches only").
  - Button: `<Button className="w-full" disabled={isPending} onClick={onRunSearch}>{isPending ? <><Spinner className="mr-2" />Searching…</> : "Run search now"}</Button>`.
- **Files:** `apps/web/components/dashboard/agent-status.tsx` (new)
- **Verify:** Pulse renders; `Badge` variant switches based on `linkedInConnected`; button disables during search

#### 2.8. [x] DashboardClient assembly
- **What:** Create `apps/web/components/dashboard/dashboard-client.tsx` (`"use client"`). Accepts `initialData: DashboardStats`. Uses `trpc.dashboard.getStats.useQuery(undefined, { initialData })`. Calls `trpc.jobs.search.useMutation()` — `onSuccess`: `toast.success("Search started", { description: "Jobs will appear shortly." })`; `onError`: `toast.error(...)`. Layout:
  - `<PageLayout title="Dashboard" action={<div className="flex items-center gap-2"><Button variant="outline" render={<Link href="/runs" />}>View runs</Button><Button disabled={isPending} onClick={() => searchMutation.mutate(…)}>{isPending ? <><Spinner className="mr-2" />Searching…</> : "Search jobs"}</Button></div>}>`.
  - Below header wrapper: `<p className="text-sm text-muted-foreground -mt-2 mb-6">Here's where your search stands.</p>`.
  - `<StatCards jobs={data.jobs} />`.
  - `<div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-5">`: left `<div className="lg:col-span-3 flex flex-col gap-5">` stacking `WeeklyChart`, `PipelineFunnel`, `SearchCriteria`, `ActivityFeed`; right `<div className="lg:col-span-2 flex flex-col gap-5">` stacking `AgentStatusCard` only.
  - `criteria` prop (type `Awaited<ReturnType<typeof getJobCriteriaForUser>>`) passed from the server page and forwarded to `SearchCriteria`.
- **Files:** `apps/web/components/dashboard/dashboard-client.tsx` (new)
- **Verify:** All sub-components render; search button triggers mutation and shows `Spinner`; `pnpm typecheck` passes

---

### Phase 3: Page + Routing

#### 3.1. [x] Dashboard server page
- **What:** Create `apps/web/app/(dashboard)/dashboard/page.tsx`. Server component: calls `getSession()`, redirects to `/sign-in` if null. Fetches in parallel: `getDashboardStats(db, session.user.id)` from `@repo/api` and `getJobCriteriaForUser(db, session.user.id)` from `@repo/db`. Returns `<DashboardClient initialData={stats} criteria={criteria} />`.
- **Files:** `apps/web/app/(dashboard)/dashboard/page.tsx` (new)
- **Verify:** Navigating to `/dashboard` while signed in renders the page with real data; unauthenticated redirects to `/sign-in`

#### 3.2. [x] Add Dashboard nav link to sidebar

#### 3.2. [x] Add Dashboard nav link to sidebar
- **What:** In `apps/web/components/nav/sidebar.tsx`, add `{ href: "/dashboard", label: "Dashboard", icon: RiDashboardLine }` as the first entry in `NAV_LINKS`. Import `RiDashboardLine` from `@remixicon/react`. Change the `isActive` check for the dashboard link to `pathname === "/dashboard"` to avoid it matching sub-paths of `/dashboard`.
- **Files:** `apps/web/components/nav/sidebar.tsx`
- **Verify:** Sidebar shows "Dashboard" at the top; active state highlights correctly; other nav items unaffected

---

## Completed

- **Date:** 2026-06-01
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/api/src/services/dashboard.service.ts` — 2-query service: custom jobs select + `listSearchRuns`; all derivations (counts, pipeline, chart, activity) done client-side
  - `packages/api/src/services/dashboard.service.test.ts` — 3 unit tests covering empty state, pass-through, and search runs
  - `packages/api/src/routers/dashboard.ts` — single `getStats` protected procedure
  - `packages/api/src/router.ts` — `dashboardRouter` merged into `appRouter`
  - `packages/api/src/index.ts` — `getDashboardStats`, `DashboardStats`, `DashboardJob` exported
  - `apps/web/components/dashboard/stat-cards.tsx` — 3 stat cards derived from `jobs[]`
  - `apps/web/components/dashboard/weekly-chart.tsx` — Recharts stacked bar chart, client-side ISO week bucketing
  - `apps/web/components/dashboard/pipeline.tsx` — horizontal proportion bars by job status
  - `apps/web/components/dashboard/search-criteria.tsx` — Roles/Locations/Seniority badge rows from `jobCriteria`
  - `apps/web/components/dashboard/activity-feed.tsx` — merged search run + job events feed
  - `apps/web/components/dashboard/agent-status.tsx` — pulse dot, LinkedIn badge, last run, search button
  - `apps/web/components/dashboard/dashboard-client.tsx` — assembles all components, tRPC wiring
  - `apps/web/components/ui/chart.tsx` — installed by shadcn CLI, 3 Biome lint fixes applied
  - `apps/web/app/(dashboard)/dashboard/page.tsx` — server component, 3 parallel fetches
  - `apps/web/components/nav/sidebar.tsx` — Dashboard nav link added at top with exact match active check
- **How to test:** `pnpm dev` → sign in → navigate to `/dashboard` (or click "Dashboard" in the sidebar)
- **Follow-up items:**
  - `jobs.test.ts` has 3 pre-existing failures (missing mocks for `insertApplyRun`/`insertSearchRun`) — unrelated to this feature
  - Agent "Next scheduled" is hard-coded "Manual only" — update when scheduling is implemented
  - Agent "Auto-apply" is hard-coded "Strong matches only" — update when a real setting is added to `jobCriteria`

## Notes

- **Stat cards:** 3 cards only — "Applications sent", "Pending review", "Strong matches". Response rate dropped (not tracked). "Total found" also dropped — the weekly chart already shows discovered jobs visually.
- **Search criteria card:** `getJobCriteriaForUser` already exists in `@repo/db`. The `locations` field is `LocationEntry[]` from `@repo/shared` — each entry has `city`, `country`, or may represent remote. Display as `location.city ?? location.country ?? "Remote"`. The `Posted` row from the design screenshot is not in the schema — omit it.
- **Agent "Next scheduled":** No scheduler is wired up. Hard-coded to display "Manual only".
- **Auto-apply setting:** The profile's job criteria doesn't have a dedicated auto-apply flag. Hard-coded "Strong matches only" to match design intent until a real setting is added.
- **Search mutation:** `jobs.search` already exists and is called from `JobsClient`. Reuse the same tRPC mutation here — no new procedure needed.
- **Responsive breakpoints:** At < 920px, collapse `grid-cols-5` to single column and `grid-cols-4` stat row to `grid-cols-2`. Use `md:` breakpoints.
