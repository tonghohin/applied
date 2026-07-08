# Plan: In-App Job Description Viewer

> Let users read a job's full description in a side sheet from the jobs table, without navigating to the real LinkedIn posting.

## Research Summary

- **Stack:** Next.js 16 App Router (`apps/web`), TanStack Table + TanStack Query, shadcn/ui built on `@base-ui/react`, `@remixicon/react` icons, tRPC + Drizzle (`packages/api`, `packages/db`).
- **Data already available — no backend changes needed:**
  - `packages/db/src/schema/jobs.ts:11` — `description: text("description")`, nullable plain text.
  - `packages/automation/src/linkedin/scraper.ts:108-145` — `fetchJobDetails()` extracts the description via `el.textContent?.trim()`. It's **plain text**, no HTML markup, but original LinkedIn line breaks are preserved as raw whitespace/newlines in the string.
  - `packages/api/src/services/jobs.service.ts:29-30` — `listJobs()` does an unrestricted `db.select().from(jobs)...`, so `description` is already part of every row returned by the `jobs.list` tRPC procedure (`packages/api/src/routers/jobs.ts:55`).
  - `apps/web/lib/trpc.tsx` — the `Job` type is inferred from `jobs.list`'s return shape, so `job.description` is already typed and available in every component that receives a `Job`, no route/type change required.
- **Relevant existing files:**
  - `apps/web/components/jobs/job-title-cell.tsx` — renders title + company + location per row; already has an `RiExternalLinkLine` icon (`job-title-cell.tsx:72-80`) linking to `job.url` in a new tab. This is where the new trigger icon will live, right next to the external-link icon (both stay, untouched behavior for the existing link).
  - `apps/web/components/jobs/jobs-columns.tsx` — defines the TanStack `ColumnDef<Job>[]`; the `job` column delegates its cell to `JobTitleCell`.
  - `apps/web/components/ui/sheet.tsx` — shadcn `Sheet` is already installed (`Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, likely `SheetTitle`/`SheetDescription`/`SheetFooter` further in the file — confirm exports when implementing). Built on `@base-ui/react/dialog`. **Not used anywhere else in the codebase yet** — this feature is the first consumer, so there's no existing call-site pattern to copy, just the primitive itself.
  - Default `SheetContent` width caps at `sm:max-w-sm` (~384px) via `data-[side=right]:sm:max-w-sm` in its class list (`sheet.tsx:56`) — too narrow for a job description; the new component will need to override this with a wider `className` (e.g. `sm:max-w-xl` or `sm:max-w-2xl`).
  - No `ScrollArea` component is installed in `apps/web/components/ui/`. Since `SheetContent` is a fixed-height flex column (`h-full` on the right side), the description body needs its own `overflow-y-auto` wrapper div rather than relying on page scroll.
- **New dependencies:** none. No new shadcn component needs installing (`Sheet` already present).
- **Icon convention:** `@remixicon/react`, `Ri*Line` icons throughout (e.g. `RiExternalLinkLine`, `RiInformationLine`). Suggest `RiFileTextLine` at `size-3.5` (matching the existing external-link icon's sizing) for the new "view description" trigger.
- **Risks/Considerations:**
  - Some jobs may have a `null`/empty `description` (e.g. detail fetch failed or was skipped) — the sheet must show an explicit empty state ("No description available") rather than rendering blank.
  - The scraped text has raw whitespace/newlines from LinkedIn's DOM, not semantic paragraph/bullet markup — render with `whitespace-pre-wrap` so line breaks are preserved, and do not attempt markdown/HTML rendering since the source has neither.
  - No `@testing-library/react` / jsdom rendering setup exists in `apps/web` (only one existing web test, `apps/web/components/sse-provider.test.ts`, is a non-rendering unit test). Adding a rendering test harness is out of scope for this feature — see Notes.

## Tasks

### Phase 1: In-app description sheet

#### 1.1. [x] Create `JobDescriptionSheet` component
- **What:** New client component that wraps shadcn `Sheet` around a trigger icon button. `SheetContent` shows the job's title, `company · location`, and the description body in a scrollable area (`overflow-y-auto` on a flex child, since `SheetContent` is a fixed-height flex column). Render the description with `whitespace-pre-wrap break-words` (plain text, preserve LinkedIn's original line breaks). If `job.description` is null/empty, show a muted "No description available" message instead. Widen the sheet beyond the default `sm:max-w-sm` (e.g. `sm:max-w-xl`) via `className` on `SheetContent` so body text is readable.
- **Files:** `apps/web/components/jobs/job-description-sheet.tsx` (new)
- **Verify:** `pnpm typecheck` passes for `apps/web`; component compiles with `job: Job` as its only prop (no new tRPC calls, no new types beyond what `Job` already provides).

#### 1.2. [x] Wire the trigger into the job title cell
- **What:** In `job-title-cell.tsx`, add a `RiFileTextLine` icon button (size-3.5, same muted/hover styling as the existing `RiExternalLinkLine` link at `job-title-cell.tsx:72-80`) next to the external-link icon, wrapped in `JobDescriptionSheet`. Give it an `aria-label="View job description"` for accessibility, matching the existing `aria-label="Open job posting"` convention. The existing external-link `<Link>` to `job.url` stays completely unchanged — this is an additive trigger, not a replacement.
- **Files:** `apps/web/components/jobs/job-title-cell.tsx`
- **Verify:** Run `pnpm turbo dev --filter=web`, open the jobs table, click the new icon on a row with a description — sheet slides in from the right showing title/company/location/description, is scrollable for long descriptions, and closes via the built-in close button or clicking the overlay. Click it on a row where `description` is null (if any exist in local data) and confirm the empty-state message shows instead of a blank panel. Confirm the pre-existing external-link icon still opens LinkedIn in a new tab unchanged.

## Notes

- **No backend/schema/tRPC changes required.** `description` is already selected and typed end-to-end; this is a pure `apps/web` UI addition confined to two files (one new, one edited).
- **No automated test added.** `apps/web` has no component-rendering test harness (`@testing-library/react` + jsdom) — the one existing web test file is a non-rendering unit test. Standing up an RTL/jsdom harness just for this one presentational component would be disproportionate to the feature; verification is manual (Phase 1.2's verify step). If the project later adopts component testing broadly, add a test asserting the empty-state renders when `description` is null/empty.
- **Decision surfaced during clarification:** user chose a side sheet/drawer (not modal/inline-expand), a dedicated icon trigger (title text and its external link stay untouched), and a minimal panel (title/company/location/description only — no score, status, or duplicate "open on LinkedIn" link inside the sheet).
- **Sheet width:** shadcn's default `SheetContent` cap is `sm:max-w-sm`; widen it in `JobDescriptionSheet` specifically rather than editing the shared `sheet.tsx` primitive, so other future consumers of `Sheet` aren't affected by a width change made for this one use case.
