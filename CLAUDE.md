# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

Automated job application tool. Scrapes LinkedIn for matching positions, scores them against the user's profile, and uses a Gemini-powered AI agent to submit Easy Apply applications via Playwright.

## Commands

```bash
# Start everything (web + worker in parallel)
pnpm dev

# Individual app/package (use turbo filter, not pnpm --filter — turbo handles dep ordering)
pnpm turbo dev --filter=web
pnpm turbo dev --filter=@repo/worker

# Tests (all packages)
pnpm test

# Run a single package's tests directly
pnpm --filter @repo/api exec vitest run
pnpm --filter @repo/automation exec vitest run

# After changing packages/db/src/schema/
pnpm generate   # drizzle-kit generate
pnpm migrate    # drizzle-kit migrate

# Type checking + lint
pnpm typecheck
pnpm lint
pnpm format
```

## Architecture

Turborepo monorepo with strict one-way deps: apps depend on packages, packages never depend on apps.

```
apps/web        Next.js 16 App Router — frontend UI + API routes (/api/auth/*, /api/trpc/*)
apps/worker     BullMQ worker — consumes search and apply queues, runs Playwright + Gemini
packages/api    tRPC routers, services, Better Auth config, BullMQ queue definitions
packages/db     Drizzle schema, migrations, db connection, and repository query functions
packages/automation  Playwright LinkedIn scraper (no scorer — scoring is handled by packages/ai)
packages/ai     All LLM work. Root entry (`@repo/ai`): Gemini 2.5 Flash agent that fills and submits job applications using Playwright MCP, plus scoreJob (Gemini Flash Lite, facts extracted by the model and scored by the deduction table in `score-rubric.ts`) used during search. Lightweight subpaths, safe to import from the web app's API: `@repo/ai/tailoring` (`tailorResume`/`tailorCoverLetter`, Gemini 2.5 Flash) and `@repo/ai/errors` (`describeAiError`/`isAiKeyError`, also re-exported from the root)
packages/documents  ATS-friendly PDF rendering with react-pdf (`renderResumePdf`/`renderCoverLetterPdf`), the resume markdown parser, file naming and contact lines. No LLM calls and no browser, so both web and worker use it
packages/shared Shared utilities and constants (used by api + worker), e.g. cron pattern building for search schedules
```

### Request flow

1. Next.js frontend calls tRPC via `trpc.*` hooks (TanStack Query v5)
2. tRPC client sends HTTP to `/api/trpc` (same-origin Next.js route handler)
3. Next.js calls `createContext(req)` — reads session from Better Auth, attaches `db` + `session` to context
4. tRPC router dispatches to `packages/api` routers → services
5. Long-running work (search, apply) is enqueued to BullMQ; `apps/worker` processes it asynchronously

### Auth

Better Auth with email + password, configured in `packages/api/src/auth.ts`. The Drizzle adapter uses `usePlural: true`. Auth routes served by Next.js via `apps/web/app/api/auth/[...all]/route.ts` — `auth.handler` accepts web-standard Request/Response directly.

### Job search pipeline

`jobs.search` inserts a `search_runs` row (`pending`) and enqueues to `searchQueue`. Worker updates the run to `running`, fetches the user's `linkedin_accounts` row, decrypts `passwordEncrypted` (AES-256-GCM), and reuses `sessionEncrypted` (Playwright storage state) if present to skip re-login. Calls `runSearch` from `packages/automation` which scrapes LinkedIn via Playwright. Each location × workplace type is a separate search limited to jobs posted in the last 24 hours (`f_TPR=r86400`; LinkedIn rounds anything under a day up to 24h) and at most `DEFAULT_MAX_PAGES` (5) pages ≈ 125 cards — coverage relies on the schedule running daily, and nothing catches up skipped days. Before fetching job details, each scraped card is checked against already-stored jobs: (1) skip if the URL is already in the DB, (2) if the user's `skipDuplicateIdentity` criteria flag is enabled (default true), skip if a job with the same company + title + location already exists (normalized via lowercase + trim), (3) skip if the title or company matches `excludeKeywords`/`excludeCompanies`. Surviving jobs have their details fetched, then scored in parallel via `scoreJob` from `packages/ai` (Gemini Flash Lite, `Output.object`) using the user's resume — all LLM calls run concurrently via `Promise.all`. The model never outputs a score: it returns structured facts about the match (missing required/preferred skills, required vs. candidate years, title level, role/industry match, stated salary, whether the job blocks sponsorship) plus the candidate-facing `reasoning`, and `computeScore` in `packages/ai/src/agents/score-rubric.ts` starts at 100 and applies a fixed deduction table with per-rule caps (tune the point values there). A work-authorization blocker (the job explicitly denies sponsorship and the candidate needs it) also caps the score at `BLOCKER_SCORE_CAP` (40), below `STRONG_MATCH_THRESHOLD`. The scorer is passed as a callback from the worker into `runSearch` so `packages/automation` has no dependency on `packages/ai`. Jobs are inserted into the `jobs` table with the `score` column (`STRONG_MATCH_THRESHOLD` = 70 from `packages/shared` marks a strong match in the UI). On success the fresh session is saved back and run status is set to `completed`; on captcha error the stale session is cleared so the next run forces a fresh login.

### AI apply agent

`jobs.applyJobs` inserts an `apply_runs` row (`pending`) per job and enqueues to `applyQueue`. Worker updates the run to `running`, then calls `processApplyJob` from `packages/ai`, which picks the resume to submit: the job's saved tailored resume if there is one; otherwise it tailors one with `tailorResume` and saves it to `tailored_documents` first, so every application's resume can be inspected afterwards. Tailored documents are the point of the tool, so there is **no fallback to the base resume**: if a resume can't be tailored or saved (model error, empty output, a job with no description and no saved resume), `processApplyJob` throws and the application is marked `failed` with that reason. It renders that resume to a temp PDF with `renderResumePdf`, sets job status to `applying`, then calls `applyToJob` which launches a stealth browser (playwright-extra + StealthPlugin, `--disable-blink-features=AutomationControlled`) and loads the saved LinkedIn session into a browser context. The `@playwright/mcp` MCP server runs in-process against that context via `InMemoryTransport`, and `generateText` with `stopWhen: [isLoopFinished(), isStepCount(150)]` drives the agent to fill and submit the application. `applyToJob` receives an `ApplyDocuments` object (PDF path, resume text used for form answers, optional saved cover letter). The model never sees the PDF path: the raw `browser_file_upload` MCP tool is hidden, and the agent clicks the resume upload field and then calls `upload_resume()` (no arguments), which runs `browser_file_upload` with the known path. `cancel_file_upload()` closes a chooser opened for any other attachment, because an open chooser blocks every other browser tool. Cover letters have two tools sharing one routine (`obtainCoverLetter`: saved letter, else generate and save): `generate_cover_letter({ required })` returns text for a text box, and `upload_cover_letter({ required })` attaches it as a PDF (rendered via the `writeCoverLetterPdf` callback into the same temp folder as the resume). When the user saved a cover letter, the prompt gets a "SAVED COVER LETTER" note telling the agent to use it even without a cover letter field: in a general free-text field, else a general attachments field, else skip. Cover letter text is typed in full at `delay:40`, so `browser_press_sequentially` has a 200s tool timeout (see `AGENT_TIMEOUTS`, typed separately because MCP tool names aren't in the inferred timeout keys). The `generate_cover_letter` tool returns the saved cover letter, or, only when the form actually has a cover letter field, writes one from the submitted resume and saves it via the `onCoverLetterGenerated` callback, so the job panel shows exactly what was sent. The agent calls it for any cover letter field and passes `required` (whether the form marks the field as required). If generating or saving the letter fails: for a **required** field the tool aborts the whole `generateText` run (an `AbortController` on `abortSignal`, since a tool error alone just goes back to the model, which could submit without the letter) and `applyToJob` returns `success: false` with the reason; for an **optional** field it logs the failure and tells the agent to leave the field empty, and later calls in the same run don't retry. `generate_cover_letter` gets a 120s tool timeout (`timeout.tools.generate_cover_letterMs`); browser tools keep 30s. Job status is updated to `applied` or `failed`; run status to `completed` or `failed`.

### Tailored documents

Each job can have one tailored resume and one tailored cover letter (`tailored_documents`, unique on `job_id` + `kind`, `kind` from `TAILORED_DOCUMENT_KINDS` in `packages/shared`). Content is text: the resume is a fixed markdown structure (`#` name, `##` sections, `###` roles, `-` bullets), and the cover letter is paragraphs separated by blank lines.

- `jobs.generateTailoredDocuments` is a synchronous mutation (no queue, about 10–30s) taking `kinds` (one or both). It checks ownership, a job description, a base resume and an AI key. When both are requested it tailors the resume first and writes the cover letter from it so the two agree; a cover letter on its own is written from the saved tailored resume, else the base resume. Nothing is saved unless every requested document generates. Prompts forbid inventing facts not in the base resume.
- `jobs.saveTailoredDocument` stores the user's edits, `jobs.deleteTailoredDocument` removes one kind, and `jobs.tailoredDocuments` reads both documents.
- PDFs are served by the route handler `GET /api/jobs/[jobId]/documents/[kind]` (`?download=1` for an attachment). It renders on each request via `renderTailoredDocumentPdf`, and files are named `Name - Resume - Company.pdf` by `documentFileName`; the agent uploads under the same name. The UI adds `?v=<updatedAt>` as a cache-buster.
- The UI is `TailoredDocumentsSection` in `JobDetail`. It always shows a Resume row and a Cover letter row: Generate when the document is missing, and Open/Download/Regenerate/Delete when it exists (`RegenerateTailoredDocumentButton` is shared with the editor footer and confirms first). Each is generated on its own and independently, so both can run at once; the API still accepts both kinds in one call, but the UI doesn't offer it. Generation progress comes from TanStack Query's shared mutation cache filtered by job and kind (`useGenerateTailoredDocuments().isGenerating(kind)`), because the section component is reused across jobs. A finished generation only opens the sheet if that job is still on screen and the sheet isn't already open. Open shows `TailoredDocumentsSheet`, with a textarea editor, iframe preview, and Regenerate/Download/Delete/Save per tab. Deleting asks for confirmation (`DeleteTailoredDocumentButton`).
- **ATS rules for the renderer:** single column; the resume puts contact details in the body, not a PDF header (the cover letter has no contact header at all, just date, letter and sign-off); standard section headings; no hyphenation (`Font.registerHyphenationCallback`); PDF title/author metadata set.
- **Fonts** (`packages/documents/src/pdf/fonts.ts`): Noto Sans (4 styles) is registered once with `Font.register` using pinned, versioned Google Fonts URLs (v42); react-pdf downloads them on first use, and they're embedded and subset in each PDF. It covers Latin with accents, Greek, Cyrillic, punctuation and currency. Known limitations, accepted to keep this simple: (1) characters Noto Sans lacks (arrows, ≥, ✓, CJK, emoji) fall back to react-pdf's built-in Helvetica and print as garbage; (2) fontkit caches glyphs with the characters they were first shaped from, so after a PDF with regular-weight text like "Dvořák" or "Đorđević", later PDFs in the same process can have a wrong text layer (e.g. "October" extracts as "tober") until restart. react-pdf caches a font's load result, including a failed download, per registration, so renders go through `renderWithFontRetry()`, which re-registers the family after a failed render so the next render downloads again instead of failing until restart (`font-retry.test.ts`, kept in its own file). A fix for (2) was built and tested (re-register the family before each render from in-memory bytes, serialized) and then removed by choice; see the plan file.
- AI Gateway credential errors go through `describeAiError`/`isAiKeyError` (which also unwrap the AI SDK's `RetryError`), so users see "Your AI Gateway key was rejected. Check it in Settings → AI." instead of the gateway's developer-facing message (which has ANSI colour codes and tells them to set an env var). It's used for the Generate mutation (412), the agent's tailoring fallback log, and the apply and search workers' user-visible `failureReason`/`errorMessage`. Any new place that shows an AI error to users should use it too.

### Search scheduling

The schedule is on by default (`SEARCH_SCHEDULE_DEFAULTS.enabled = true` in `packages/shared`; every 4 hours, 9–17, all days). Because the row needs the browser's timezone, `profile.upsertCriteria` accepts a `timezone` and calls `createDefaultScheduleIfMissing`, which inserts the default row with `onConflictDoNothing` — an existing row (including a disabled one) is never overwritten. `profile.upsertSchedule` writes a `search_schedules` row (frequency, day/time, timezone, `enabled`). `apps/worker/src/schedule-sync.ts` runs `syncAllSearchSchedulers()` at startup, converting each enabled schedule (with criteria and a LinkedIn account present) into a BullMQ `upsertJobScheduler` call on the search queue using a cron pattern from `buildSearchCronPattern` (`packages/shared`); disabled/incomplete schedules have their job scheduler removed. `packages/api/src/services/search-schedule.service.ts` does the same upsert/remove when a schedule is edited via tRPC, so a schedule change takes effect immediately without waiting for worker restart.

### Observability (Langfuse)

The apply agent is instrumented with [Langfuse](https://langfuse.com) for LLM observability. Self-hosted via `docker compose -p langfuse -f docker-compose.langfuse.yml up -d` (uses the official Langfuse compose with `CLICKHOUSE_CLUSTER_ENABLED=false` for single-node setup). UI at `http://localhost:3001`.

**How it works:**
- `apps/worker/src/instrumentation.ts` — initializes the OTEL SDK with `LangfuseSpanProcessor` at worker startup (must be the first import in `index.ts`)
- `apps/worker/src/workers/apply.worker.ts` — wraps each apply job with `propagateAttributes({ traceName, userId, metadata })` from `@langfuse/tracing`; this attaches user/job context to all OTEL spans created inside the callback, then `forceFlush()` ships the trace before BullMQ marks the job done
- `packages/ai/src/agents/apply-agent.ts` — `experimental_telemetry: { isEnabled: true }` on `generateText` causes the AI SDK to emit OTEL spans (one generation per call, one child span per tool call/step) which are intercepted by the span processor

**Local credentials** (pre-seeded by Docker Compose `LANGFUSE_INIT_*`):
- UI login: `admin@local.dev` / `admin123`
- API keys in `apps/worker/.env`: `LANGFUSE_PUBLIC_KEY=pk-lf-local-public-key`, `LANGFUSE_SECRET_KEY=sk-lf-local-secret-key`

### Environment variables

Each package/app validates only the env vars it uses via its own `src/env.ts` (Zod parse at startup). Loading is handled by the entry point:
- `apps/web`: Next.js auto-loads `.env.local` — holds all server-side vars (`DATABASE_URL`, `BETTER_AUTH_*`, `ENCRYPTION_KEY`, `REDIS_URL`). The auth client (`apps/web/lib/auth-client.ts`) has no `baseURL` configured — Better Auth's client falls back to `window.location.origin`, so it works correctly regardless of what host/port the app is actually served on
- `apps/worker`: `tsx --env-file .env src/index.ts` — holds `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`. The AI Gateway key is **not** an env var — it's stored per-user (`profiles.aiGatewayKeyEncrypted`, AES via `ENCRYPTION_KEY`), set via `profile.upsertAiKey`, and read by the workers with `getAiGatewayKey(db, userId)`.
- `packages/db`: drizzle-kit auto-loads `packages/db/.env`

### tRPC patterns

- Client in `apps/web/lib/trpc.tsx` — `createTRPCReact<AppRouter>()` with `httpBatchLink` pointing at `/api/trpc` + superjson
- Use `trpc.x.queryOptions()` syntax (TanStack Query v5)
- All procedures except `health` require authentication (`protectedProcedure` throws `UNAUTHORIZED` if no session)
- Profile mutations are split by tab: `upsertPersonal`, `upsertResume`, `upsertCoverLetter`, `upsertLinkedIn`, `upsertCriteria`, `upsertSchedule`, `upsertAiKey` — each only validates and updates its own fields
- `resume` is whatever the user pastes, usually plain text copied from a PDF or Word file, though markdown also works (`profiles.resume`); the Settings copy deliberately never mentions markdown. It's the source for tailoring and is never rendered or submitted directly. The markdown parser runs with `breaks: true`, so pasted plain text keeps its line breaks
- `coverLetterInstructions` is optional free-text (tone, length, emphasis hints); the agent writes a personalised cover letter per job using the resume and job details, following the instructions if provided

### Data fetching pattern (server → client)

All GET requests happen in server components. Pages call services directly (not tRPC), pass results as required `initialData` props to client components, which pass them into `useQuery({ initialData })` — no loading skeleton on first render, TanStack Query takes over for re-fetches and post-mutation invalidation.

- Use `getSession()` from `lib/session.ts` (React `cache()` — one DB hit per request even if called in both proxy and page)
- Always `redirect("/sign-in")` if session is null — defense-in-depth even though proxy already guards
- Service functions called server-side must be exported from `packages/api/src/index.ts`
- Type `initialData` props using `RouterOutputs["router"]["procedure"]` and make them required

### Testing

Vitest with `vi.mock` and `vi.hoisted` — hoisted mocks are defined with `vi.hoisted()` so they're available inside `vi.mock` factories. DB is mocked with a chainable query builder mock; no real DB in unit tests. Queue modules are mocked via `vi.mock("../queues/index", ...)`. Tests live next to the code they test (`*.test.ts`).

### Linter / formatter

Biome (not ESLint/Prettier). 2-space indent, 100 char line width, double quotes, ES5 trailing commas. Run `pnpm lint` to check, `pnpm format` to fix.

## Coding rules

**React components** — inline props, no separate interface:
```tsx
// correct
export function JobCard({ title, company }: { title: string; company: string }) {}

// wrong
interface JobCardProps { title: string; company: string }
export function JobCard({ title, company }: JobCardProps) {}
```

**Module imports**
- `packages/api` and `apps/web` must import `@repo/ai/tailoring` or `@repo/ai/errors`, never the root `@repo/ai`. The root pulls in the apply agent, whose stealth plugin (`chromium.use(StealthPlugin())` at module top level) crashes the Next.js server build when bundled (`TypeError: o.typeOf is not a function`). Biome enforces this with `nursery/noRestrictedImports` in a `biome.json` override. Keep `packages/ai/src/tailoring/` and `packages/ai/src/errors.ts` free of imports from the agent, MCP or Playwright.
- Never use `.js` extensions on relative imports (e.g. `from "./auth"` not `from "./auth.js"`). The root tsconfig uses `moduleResolution: "bundler"` — Turbopack resolves imports literally and does not remap `.js` → `.ts`.
- Every workspace package is ESM (`"type": "module"`), so ESM-only dependencies such as `@react-pdf/renderer` load in the worker, which runs through tsx. Don't use `__dirname`/`require`; use `import.meta.dirname`.
- `.tsx` files in `packages/*` that the worker imports need `/** @jsxRuntime automatic */` and `/** @jsxImportSource react */` pragmas. tsx applies a tsconfig's `jsx` setting only to files that tsconfig includes, so without them the worker compiles them with the classic runtime (`React is not defined`). Type checking uses `"jsx": "react-jsx"` from the root tsconfig.

**Package manager**
- pnpm is pinned via the root `packageManager` field; pnpm 12 tracks its own version + the `@pnpm/exe.*` binaries in `pnpm-lock.yaml` (`packageManagerDependencies`). Bump both together (`pnpm self-update latest-N`), never hand-edit.
- The `apps/*/Dockerfile`s install pnpm with `npm install -g --allow-scripts=pnpm pnpm@<version>` — the `--allow-scripts` flag is required because recent npm blocks global install scripts by default and pnpm 12's native binary is placed by one. Keep the pinned version in sync with `packageManager`.

**shadcn/ui components**
- Before writing any UI markup, check `apps/web/components/ui/` for an installed component that covers the use case. Prefer the shadcn component over raw HTML + Tailwind every time — even for one-off elements like pills, dividers, or loading states.
- If no installed component fits, install one: `npx shadcn@latest add <name>` (run from `apps/web/`). Only fall back to raw HTML when no shadcn component exists for the pattern. Afterwards, check the new file: the CLI has generated `import { cn } from "cn"` and added a stray `cn` package to `package.json`. Change the import to `@/lib/utils`, run `pnpm remove cn`, and answer "no" when it offers to overwrite existing components.
- For links styled as buttons, use `<Button nativeButton={false} render={<Link href="..." />}>` — this Button uses base-ui's `render` prop (not Radix's `asChild`). Works in server components: `@base-ui/react` declares its own `"use client"` boundary internally. For a plain `<a>` (downloads, API routes), use the function form `render={(props) => <a {...props} href="..." download />}`. Biome's `useAnchorContent` rule rejects a self-closing `<a />`.
- For forms, use `Field`, `FieldLabel`, `FieldError`, `FieldDescription` from `@/components/ui/field` with react-hook-form. Each `Field` takes `data-invalid={!!errors.x}`; each input takes `aria-invalid={!!errors.x}`; `<FieldError errors={[errors.x]} />` renders nothing when there is no error so no conditional needed.

**Form feedback**
- Field validation errors go under the input via `<FieldError errors={[errors.field]} />` (no conditional wrapper needed)
- Submission success and server errors go to Sonner: `toast.success(...)` in `onSuccess`, `toast.error(...)` in the `catch` block
- Never use `setError("root", ...)` or render `errors.root` in the JSX

**Naming**
- Never use single-character variable names (e.g. `s`, `f`, `l`, `t`, `d`). Use descriptive names even in short callbacks — `step`, `feature`, `entry`, etc.

**Type safety**
- No `any`, no type casts (`as Foo`, `as unknown as Foo`)
- Prefer enum values (Drizzle `pgEnum`, `z.enum`, or `as const` objects) over plain `string` for fields with a fixed set of values — e.g. `jobStatus`, `platform`, `workplaceType`
- Reuse existing types and constants exported from workspace packages rather than redefining them inline
- Use `date-fns` for all date/time formatting and manipulation — never `toLocaleDateString`, `toLocaleTimeString`, or manual date arithmetic
