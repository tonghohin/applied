# Plan: Tailored Resume & Cover Letter

> From a job's detail panel, generate an ATS-friendly resume and cover letter tailored to that job's description. Users can edit, preview and download both as PDFs, and the apply agent submits the same documents.

## Research Summary

- **Stack:** Next.js 16 App Router (`output: "standalone"`, Alpine Docker image with **no Chromium**), tRPC + TanStack Query v5, Drizzle/Postgres, AI SDK v7 via the Vercel AI Gateway (per-user key), BullMQ worker, Vitest, Biome.
- **Relevant patterns:**
  - Today's resume PDF is `packages/ai/src/agents/generate-resume-pdf.ts`. It converts markdown to HTML with `marked` and prints with **Playwright Chromium**. That only works in the worker image, so the web app can't reuse it.
  - The cover letter comes from `packages/ai/src/agents/generate-cover-letter.ts` (Gemini Flash Lite). It's generated fresh inside the agent's `generate_cover_letter` tool and never stored or shown to the user.
  - `packages/api` does **not** depend on `@repo/ai`. Importing `@repo/ai` from Next would pull in playwright, playwright-extra and `@playwright/mcp`.
  - The AI key is read with `getAiGatewayKey(db, userId)` in `packages/api/src/services/profile.service.ts`.
  - There is no `/jobs/[id]` route. The "job page" is `JobDetail` (`apps/web/components/jobs/job-detail.tsx`), rendered by `jobs-split-view.tsx`. The selected job lives on the client.
  - One row per user or job is modelled with `.unique()` (see `search-schedules.ts`), and upserts use `onConflictDoUpdate`.
  - DB query tests use chainable mocks (see `packages/db/src/queries/apply-runs.test.ts`), and AI tests mock `ai` (see `generate-cover-letter.test.ts`).
- **Key files:**
  - `packages/ai/src/agents/{generate-resume-pdf,generate-cover-letter,process-apply,apply-agent}.ts`
  - `packages/db/src/schema/{jobs,enums,index}.ts` and `packages/db/src/queries/`
  - `packages/api/src/routers/jobs.ts` and `packages/api/src/services/{jobs,profile}.service.ts`
  - `apps/web/components/jobs/job-detail.tsx`
  - `apps/web/app/api/trpc/[trpc]/route.ts` (route handler pattern) and `apps/web/lib/session.ts`
- **New dependencies:**
  - `@react-pdf/renderer` (pure-JS PDF with real, selectable text and built-in Helvetica; it's already in Next's default `serverExternalPackages`)
  - `react` as a peer in the new package
  - shadcn `tabs` (not installed yet)
- **Risks/Considerations:**
  - **Changing the PDF renderer changes what the agent uploads.** The agent moves from Chromium HTML-to-PDF to react-pdf so the previewed PDF and the submitted PDF come from one renderer.
  - **Migration:** `drizzle-kit generate` needs a TTY (see memory). The builder must ask the user to run `pnpm generate` in a real terminal, and must not hand-write snapshots.
  - **Fabrication:** the LLM must not invent skills, employers, dates or metrics. This is enforced by the prompt only. The user reviews and edits before use, and the agent uses whatever they saved.

## Design decisions (confirmed with user)

- **Persistence:** one saved row per job and document kind. Regenerating overwrites it.
- **Editing:** the text is editable in a textarea, and saving re-renders the preview.
- **Execution:** a synchronous tRPC mutation (no queue).
- **Agent reuse:** the agent prefers the tailored resume and cover letter when they exist, and falls back to the base resume or on-the-fly generation otherwise.
- **ATS-standard PDF:**
  - single column, no tables, images, icons or multi-column layout
  - Helvetica (a standard PDF font) with real extractable text
  - contact details in the body, not in a PDF header or footer
  - standard section headings (Summary, Experience, Education, Skills, Projects)
  - plain `•` bullets, Letter size, 0.6–0.75in margins
  - PDF metadata `title`/`author` set, and file name `First Last - Resume.pdf` / `First Last - Cover Letter.pdf`

## Tasks

### Phase 1: Data layer

#### 1.1. [x] `tailored_documents` table
- **What:**
  - Add `tailoredDocumentKindEnum = pgEnum("tailored_document_kind", ["resume", "cover_letter"])` in `enums.ts`.
  - Add a `tailored_documents` table with these columns: `id` uuid pk, `userId` text FK→users cascade, `jobId` uuid FK→jobs cascade, `kind` enum, `content` text not null, `createdAt`, `updatedAt`.
  - Add `uniqueIndex("tailored_documents_job_id_kind_unique").on(jobId, kind)` and export `TailoredDocument` / `TailoredDocumentKind` types.
- **Files:** `packages/db/src/schema/enums.ts`, `packages/db/src/schema/tailored-documents.ts` (new), `packages/db/src/schema/index.ts`
- **Verify:**
  - `pnpm --filter @repo/db exec tsc --noEmit` passes.
  - **Stop and ask the user to run `pnpm generate` then `pnpm migrate` in their terminal.** Then confirm the table exists via `information_schema.tables`.

#### 1.2. [x] Query functions
- **What:** add these queries in `packages/db/src/queries/tailored-documents.ts` and re-export them from `queries/index.ts`:
  - `getTailoredDocumentsForJob(db, jobId, userId)` → rows for both kinds, filtered by **both** jobId and userId
  - `getTailoredDocument(db, jobId, userId, kind)` → one row or `undefined`
  - `upsertTailoredDocument(db, { userId, jobId, kind, content })` → `onConflictDoUpdate` on `(jobId, kind)` setting `content` and `updatedAt`, returning the row
- **Files:** `packages/db/src/queries/tailored-documents.ts` (new), `packages/db/src/queries/index.ts`
- **Verify:** covered by 1.3.

#### 1.3. [x] Query tests
- **What:** chain-mock tests in the style of `apply-runs.test.ts`:
  - the upsert passes the conflict target and new `updatedAt`
  - the get functions filter by userId
  - `getTailoredDocument` returns `undefined` when there are no rows
- **Files:** `packages/db/src/queries/tailored-documents.test.ts` (new)
- **Verify:** `pnpm --filter @repo/db exec vitest run`

### Phase 2: `@repo/documents` package (LLM tailoring + ATS PDF rendering)

This goes in a new package because the web app can't import `@repo/ai` (it pulls in Playwright and MCP) and can't run Chromium. Both `@repo/api` (web) and `@repo/ai` (worker) depend on it.

#### 2.1. [x] Scaffold package
- **What:**
  - Create `packages/documents` mirroring `packages/shared`: `package.json` with name `@repo/documents`, `main`/`types` set to `src/index.ts`, and the same scripts.
  - Its `tsconfig.json` extends root and adds `"jsx": "react-jsx"`.
  - Dependencies: `@react-pdf/renderer`, `react`, `marked`, `ai`, `zod`, `@repo/shared`. Dev dependencies: `@types/react`, `vitest`, `typescript`.
  - Add `"@repo/documents": "workspace:*"` to `packages/api` and `packages/ai`, then run `pnpm install`.
- **Files:** `packages/documents/{package.json,tsconfig.json,src/index.ts}`, `packages/api/package.json`, `packages/ai/package.json`
- **Verify:** `pnpm typecheck` passes, and `pnpm turbo build --filter=web` still builds.

#### 2.2. [x] Markdown → document blocks (pure)
- **What:**
  - `parseResumeMarkdown(markdown): ResumeBlock[]` uses `marked.lexer`. The `ResumeBlock` discriminated union is `{ type: "name" | "heading" | "subheading" | "paragraph" | "bullets"; ... }` with inline runs `{ text, bold, italic, href? }`.
  - Supported markdown: `#` → name, `##` → section heading, `###` → role/subheading, paragraphs, and lists (nested lists flattened one level). Strong, em and links become inline runs. Unsupported tokens (tables, images, code, html) degrade to plain paragraphs, never dropped silently.
  - Also add `stripCodeFences(text)` for LLM output wrapped in fenced code blocks.
- **Files:** `packages/documents/src/markdown.ts` (new)
- **Verify:** 2.6 tests.

#### 2.3. [x] ATS PDF renderers
- **What:**
  - `renderResumePdf({ markdown, applicantName }): Promise<Buffer>` renders the blocks from 2.2 with react-pdf `Document`/`Page`/`Text`/`View`/`Link`, following the ATS rules in "Design decisions". The name is 18–20pt bold, section headings are 10.5pt bold uppercase with a thin rule under them, and body text is 10pt.
  - `renderCoverLetterPdf({ body, applicantName, contactLines, date })` renders the name and a contact block at the top (in the body, not a PDF header), the date via `date-fns` `format(date, "MMMM d, yyyy")`, then the paragraphs split on blank lines.
  - Both set `Document` `title`/`author`/`creator`.
  - Export `documentFileName(applicantName, kind)`, generalising `resumeFileName` from `generate-resume-pdf.ts`.
- **Files:** `packages/documents/src/pdf/resume-pdf.tsx`, `packages/documents/src/pdf/cover-letter-pdf.tsx`, `packages/documents/src/pdf/file-name.ts` (new)
- **Verify:**
  - 2.6 smoke tests.
  - Manually write a sample PDF to the scratchpad and open it. Check that text can be selected, `pdftotext` output reads in order, and there's one column.

#### 2.4. [x] LLM tailoring
- **What:** both functions use `createGateway({ apiKey })` with `google/gemini-2.5-flash` and `telemetry: { isEnabled: true, functionId }`, and run the output through `stripCodeFences`.
  - `tailorResume({ resume, job: { title, company, description }, apiKey }): Promise<string>`
    - Instructions: return markdown only in the fixed structure (`# Name`, contact line, `## Summary`, `## Experience` with `### Title — Company | Dates` and bullets, `## Skills`, `## Education`, other sections only if present in the source).
    - Reorder and reword to mirror the JD's terminology **only where the source resume supports it**.
    - **Never add employers, titles, dates, degrees, certifications, skills or metrics that aren't in the source.**
    - Keep it to one page for under 10 years of experience and two pages max, with no first-person pronouns.
  - `tailorCoverLetter({ resume, job, instructions, apiKey })`
    - Move the logic from `packages/ai/src/agents/generate-cover-letter.ts`, taking plain inputs instead of `Job`/`ProfileWithEmail`.
    - Keep the "Dear Hiring Manager," opening and the no-fabrication rule. Give only the body, with no address block, because the PDF adds the header.
- **Files:** `packages/documents/src/tailor-resume.ts`, `packages/documents/src/tailor-cover-letter.ts` (new), `packages/documents/src/index.ts`
- **Verify:** 2.6 tests.

#### 2.5. [x] Switch `@repo/ai` to the shared code
- **What:**
  - Delete `generate-cover-letter.ts` and its test (the tests move to 2.6), and delete `generate-resume-pdf.ts`.
  - Drop `marked` from `@repo/ai` if nothing else uses it.
  - The apply-agent changes are in Phase 4.
- **Files:** `packages/ai/src/agents/generate-cover-letter.ts`, `generate-cover-letter.test.ts`, `generate-resume-pdf.ts` (delete), `packages/ai/package.json`
- **Verify:** `pnpm --filter @repo/ai exec tsc --noEmit` passes. It will fail until Phase 4 updates the imports, so do 2.5 and 4.1 together.

#### 2.6. [x] Tests
- **What:**
  - `markdown.test.ts`: name, heading, bullets and inline bold/link parsing; unsupported tokens degrade to paragraphs; fence stripping.
  - `tailor-resume.test.ts` / `tailor-cover-letter.test.ts`: mock `ai`. Assert the prompt includes the JD and resume, the no-fabrication instruction is present, cover letter instructions are included only when set, and output is trimmed with fences stripped.
  - `pdf.test.ts`: `renderResumePdf` / `renderCoverLetterPdf` return a Buffer starting with `%PDF-`. Also test `documentFileName` edge cases (empty name → `resume.pdf`, special characters stripped).
- **Files:** `packages/documents/src/*.test.ts`
- **Verify:** `pnpm --filter @repo/documents exec vitest run`

### Phase 3: API

#### 3.1. [x] Service functions
- **What:** add these in `packages/api/src/services/tailored-documents.service.ts`:
  - `tailoredDocumentKindSchema = z.enum(["resume", "cover_letter"])`, plus `generateTailoredDocumentsSchema = { jobId: z.uuid(), kinds: z.array(kind).min(1) }` and `saveTailoredDocumentSchema = { jobId, kind, content: z.string().trim().min(1).max(20000) }`.
  - `getTailoredDocuments(db, userId, jobId)` → `{ resume: TailoredDocument | null, coverLetter: TailoredDocument | null }`.
  - `generateTailoredDocuments(db, userId, input)`
    - `getJobForUser` → `NOT_FOUND`
    - no `job.description` → `PRECONDITION_FAILED`, "This job has no description to tailor against"
    - no `profile.resume` → `PRECONDITION_FAILED`, "Add your resume in Settings first"
    - `getAiGatewayKey` null → `PRECONDITION_FAILED`, "Add your AI Gateway key in Settings → AI"
    - Otherwise generate: when both kinds are requested, tailor the resume **first** and pass the tailored resume into `tailorCoverLetter`, so the two stay consistent. Then upsert each and return `getTailoredDocuments`.
    - LLM errors become `INTERNAL_SERVER_ERROR` with a readable message, and nothing is saved.
  - `saveTailoredDocument(db, userId, input)` checks job ownership, then upserts.
  - `renderTailoredDocumentPdf(db, userId, jobId, kind)`
    - loads the doc and profile (with email)
    - returns `null` when missing, otherwise `{ pdf: Buffer, fileName }`
    - the cover letter gets its contact lines from the profile (email, phone, address, LinkedIn)
  - Export the render and get functions from `packages/api/src/index.ts` for the route handler.
- **Files:** `packages/api/src/services/tailored-documents.service.ts` (new), `packages/api/src/index.ts`
- **Verify:** 3.3 tests.

#### 3.2. [x] tRPC procedures
- **What:** on `jobsRouter`, add:
  - `tailoredDocuments` (query, input `{ jobId }`)
  - `generateTailoredDocuments` (mutation)
  - `saveTailoredDocument` (mutation)

  All three use `protectedProcedure` and delegate to the service.
- **Files:** `packages/api/src/routers/jobs.ts`
- **Verify:** `pnpm --filter @repo/api exec tsc --noEmit`, and `RouterOutputs["jobs"]["tailoredDocuments"]` resolves in web.

#### 3.3. [x] PDF route handler
- **What:** `GET /api/jobs/[jobId]/documents/[kind]`
  - Validate `kind` with `tailoredDocumentKindSchema` and `jobId` as a uuid (400 on failure).
  - `getSession()` → 401 when no session.
  - `renderTailoredDocumentPdf` → 404 when there's nothing to render.
  - Respond with `Content-Type: application/pdf`, `Cache-Control: private, no-store`, and `Content-Disposition` set to `inline` (or `attachment` when `?download=1`) with an RFC 5987-encoded `filename*`.
  - Set `export const runtime = "nodejs"`.
- **Files:** `apps/web/app/api/jobs/[jobId]/documents/[kind]/route.ts` (new)
- **Verify:** with the dev server running and a saved doc, `curl -b <cookie> -I localhost:3000/api/jobs/<id>/documents/resume` returns 200 `application/pdf`. Another user's jobId returns 404, and no cookie returns 401.

#### 3.4. [x] Service + router tests
- **What:** mock `@repo/db`, `@repo/documents` and `getAiGatewayKey`. Test:
  - each `PRECONDITION_FAILED` branch
  - `NOT_FOUND` for another user's job
  - resume-before-cover-letter ordering, with the tailored resume passed into `tailorCoverLetter`
  - nothing upserted when the LLM throws
  - `save` checks ownership
  - `render` returns `null` when the doc is missing

  Extend `jobs.test.ts` for the three procedures, including `UNAUTHORIZED` without a session.
- **Files:** `packages/api/src/services/tailored-documents.service.test.ts` (new), `packages/api/src/routers/jobs.test.ts`
- **Verify:** `pnpm --filter @repo/api exec vitest run`

### Phase 4: Apply agent uses tailored documents

#### 4.1. [x] Prefer tailored docs in `processApplyJob` / `applyToJob` (auto-tailor when missing)
- **What:**
  - `processApplyJob` also fetches `getTailoredDocumentsForJob`.
  - **If no tailored resume exists, generate one with `tailorResume` and save it with `upsertTailoredDocument` before applying** (log "Generating tailored resume"). Every submission is then a formatted, tailored PDF the user can later inspect in the job panel. If tailoring fails, log it and fall back to rendering the base resume, so an LLM hiccup doesn't block the application.
  - Render the resume with `renderResumePdf` and write it to `mkdtemp` + `documentFileName(...)` (keep the existing `rm` cleanup). Log which resume is used.
  - Pass `tailoredCoverLetter?: string` into `applyToJob`. The `generate_cover_letter` tool returns it if present, otherwise calls `tailorCoverLetter` from `@repo/documents`.
  - Use the tailored resume text in `profileSummary`'s `--- RESUME ---` too, so answers match the uploaded file. To avoid a long positional parameter list, pass `resumeText` through an options object.
- **Files:** `packages/ai/src/agents/process-apply.ts`, `packages/ai/src/agents/apply-agent.ts`
- **Verify:** `pnpm --filter @repo/ai exec tsc --noEmit`, and 4.2 tests.

#### 4.2. [x] Tests
- **What:**
  - Update `apply-agent.test.ts` mocks: replace the `./generate-cover-letter` mock with an `@repo/documents` mock, and test that the tool returns the saved cover letter without calling the LLM.
  - Add `process-apply.test.ts`: an existing tailored resume is used as-is; a missing one is generated and saved before applying; a tailoring failure falls back to the base resume; the temp dir is removed on failure.
- **Files:** `packages/ai/src/agents/apply-agent.test.ts`, `packages/ai/src/agents/process-apply.test.ts` (new)
- **Verify:** `pnpm --filter @repo/ai exec vitest run`

#### 4.3. [x] Worker image note
- **What:** update the `apps/worker/Dockerfile` comment. Chromium is no longer used for resume PDFs, only as the stealth-browser fallback. Keep the install.
- **Files:** `apps/worker/Dockerfile`
- **Verify:** it's a comment-only change.

### Phase 5: UI

#### 5.1. [x] Install tabs
- **What:** `npx shadcn@latest add tabs` from `apps/web/`.
- **Files:** `apps/web/components/ui/tabs.tsx` (new)
- **Verify:** the file exists and `pnpm --filter web exec tsc --noEmit` passes.

#### 5.2. [x] `TailoredDocumentsSection` in `JobDetail`
- **What:**
  - Add a section between the Apply button and the description.
  - It uses `useQuery(trpc.jobs.tailoredDocuments.queryOptions({ jobId }))`. This is client-fetched because the selected job is client state. It's a deliberate exception to the server-initialData rule, and it shows a `Skeleton` while loading.
  - **No docs:** show a button "Generate tailored resume & cover letter" (`Spinner` while pending, since generation takes 10–30s).
    - Disable it with a `Tooltip` when `!job.description`.
    - On success, `toast.success` and open the sheet. On error, `toast.error(message)`.
  - **Docs exist:** show "Tailored for this job · updated {formatDistanceToNow}", an "Open" button (opens the sheet), and direct download links for both PDFs (`Button render={<a href=... download />}` with `?download=1`).
- **Files:** `apps/web/components/jobs/tailored-documents-section.tsx` (new), `apps/web/components/jobs/job-detail.tsx`
- **Verify:** in the browser, select a job, click generate, see the spinner and then the sheet opens. Reload and the section shows the saved state.

#### 5.3. [x] `TailoredDocumentsSheet` (edit + preview + download)
- **What:**
  - A wide `Sheet` (`side="right"`, `className="sm:max-w-6xl w-full"`) with `Tabs` for Resume and Cover letter.
  - Each tab is a two-column grid (stacked on mobile):
    - **Left:** a react-hook-form form with `Field` + `FieldLabel` + `Textarea` (monospace, tall) + `FieldError`. It validates with the zod schema from the service, re-exported from `@repo/api`.
    - **Right:** an `<iframe title="Resume preview" src="/api/jobs/{jobId}/documents/{kind}?v={updatedAt.getTime()}">`, where the `v` cache-buster makes the preview refresh after save or regenerate.
  - Footer buttons:
    - **Save** (disabled unless dirty) calls `saveTailoredDocument`, invalidates `tailoredDocuments` and toasts.
    - **Regenerate** opens a `Popover` confirmation: "Replaces this {kind}, including your edits." It calls `generateTailoredDocuments({ kinds: [kind] })` and resets the form to the new content.
    - **Download PDF** links to `?download=1`.
  - Reset form values when the query data changes (`useEffect` on `updatedAt`).
  - Warn before closing the sheet with unsaved changes. If that proves fiddly, drop it and add a follow-up note.
- **Files:** `apps/web/components/jobs/tailored-documents-sheet.tsx` (new)
- **Verify:** edit a bullet and Save, and the preview updates. Regenerate replaces the content. Download saves `First Last - Resume.pdf`. Open the PDF and confirm the text can be selected.

#### 5.4. [x] UI verification pass
- **What:** run the app (`/run` skill or `pnpm dev`) and walk the full flow on a real job, in both light and dark mode and at mobile width. Then apply to the job via the agent and confirm the apply log says "Using tailored resume".
- **Files:** none
- **Verify:** `pnpm lint`, `pnpm typecheck` and `pnpm test` are all green.

#### 5.5. [x] Resume settings accepts plain text
- **What:** change the resume textarea placeholder in `resume-form.tsx` from "Paste your resume in Markdown format…" to accept plain text or Markdown. Tailoring normalizes the format, so drop the "convert it to Markdown" tip.
- **Files:** `apps/web/components/settings/resume-form.tsx`
- **Verify:** check the Settings → Documents page visually.

### Phase 6: Docs

#### 6.1. [x] Update CLAUDE.md
- **What:**
  - Add `packages/documents` to the Architecture list.
  - Add a "Tailored documents" subsection covering the table, the sync mutation, the PDF route handler, the ATS renderer, and that the agent prefers tailored docs.
  - Update the "AI apply agent" paragraph: `generateResumePdf` is replaced by `renderResumePdf` from `@repo/documents`.
- **Files:** `CLAUDE.md`
- **Verify:** read-through.

## Notes

- **Why a new package instead of putting this in `@repo/ai`:** `@repo/ai`'s index pulls in Playwright, playwright-extra and the MCP server. Importing it from `@repo/api` would drag those into the Next server bundle and still wouldn't give the Alpine web image a browser to print with. Subpath exports on `@repo/ai` were the alternative, but a separate package keeps the dependency direction clean.
- **Why react-pdf over Chromium or pdfkit:**
  - It runs in both web and worker with no browser, produces real text (important for ATS parsing), and is JSX, which fits the repo.
  - `@react-pdf/renderer` is already in Next's default `serverExternalPackages`, so no `next.config` change should be needed. If the build complains, add it explicitly.
- **Why a route handler for the PDF (not tRPC):** binary responses, `Content-Disposition` downloads and the iframe `src` all work naturally over plain HTTP. tRPC with superjson would need base64 and blob URLs.
- **Mobile preview:** iOS Safari renders only the first page of a PDF in an iframe. On narrow screens, consider hiding the iframe and showing "Open PDF in new tab" instead. The builder should decide during 5.3.
- **Concurrency:** double-clicking generate is prevented by disabling the button while pending. Two tabs regenerating at once just means last write wins, which is acceptable.
- **Staleness:** if the user later edits their base resume, existing tailored docs aren't regenerated automatically. That's out of scope; the updated timestamp in the section makes it visible.
- **Out of scope / follow-ups:** version history for tailored docs; a quality check that diffs the tailored resume against the source to flag invented facts; bulk generation for multiple jobs; a DOCX export.
- **Plain-text base resumes (decided after Phase 2):** users may paste their base resume as plain text. The LLM output is always the fixed markdown structure, and the parser runs marked with `breaks: true`, so raw text that reaches the renderer keeps its line breaks.
- **Build-time deviations (Phase 2):**
  - react-pdf is ESM-only (`@react-pdf/hyphenate` publishes only an `import` condition) and the worker ran its TypeScript as CommonJS under tsx, so it crashed on import. The fix was converting the whole monorepo to ESM in a separate commit (`chore: switch all workspace packages to ESM`) rather than switching library. pdfkit was tried briefly and dropped.
  - `"jsx": "react-jsx"` now lives in the root `tsconfig.json`, because consumers typecheck `@repo/documents` from source. The `.tsx` files in `packages/documents/src/pdf/` also carry `@jsxRuntime automatic` / `@jsxImportSource react` pragmas, because tsx only applies a tsconfig's `jsx` setting to files that tsconfig includes, so the worker would otherwise compile them with the classic runtime.
  - The standard Helvetica font covers only WinAnsi (Latin-1). `toWinAnsi` maps lookalikes (→ becomes ->) and drops unsupported characters such as CJK and emoji. Follow-up: embed a Unicode font (e.g. Noto Sans) if non-Latin names or content matter.
  - Task 2.5 was done minimally: `@repo/ai` now uses `renderResumePdf` and `tailorCoverLetter` from `@repo/documents`, with no behaviour change. The "prefer tailored docs" logic remains in 4.1.
  - `tailorResume` takes an optional `contactLines` fallback, used only if the source resume has no contact details. `generateCoverLetter` moved from `gemini-2.5-flash-lite` to `gemini-2.5-flash`.
- **Agent-generated cover letters are saved (decided after Phase 4):** when `generate_cover_letter` has to write a letter mid-application, `applyToJob` calls `documents.onCoverLetterGenerated`. `processApplyJob` saves it as the job's `cover_letter`, and a save failure is logged, not thrown. The tool reuses its first letter on repeat calls, so the saved letter is always the one submitted.
- **Build-time additions (Phase 5):**
  - Installed shadcn `alert-dialog` for the "discard unsaved changes?" prompt. The shadcn CLI generated `import { cn } from "cn"` and added a stray `cn` npm package for both `tabs` and `alert-dialog`. Both were corrected to `@/lib/utils` and the package removed. Watch for this on future `shadcn add` runs.
  - `describeAiError` / `isAiKeyError` in `@repo/documents`: the AI Gateway's rejected-key error had ANSI colour codes and told users to set an env var. It now reads "Your AI Gateway key was rejected. Check it in Settings → AI." and returns PRECONDITION_FAILED (412) instead of 500. The agent's apply log uses the same text.
  - The preview iframe URL carries `#navpanes=0&view=FitH`, so Chrome's PDF viewer hides its thumbnail sidebar and fits the page to the pane width.
  - Tab panels are `keepMounted` so switching tabs keeps unsaved edits. Unsaved tabs show a dot plus screen-reader text "(unsaved)".
  - The browser walkthrough (20 checks) ran against the dev server with a throwaway user, since deleted. **Real Gemini generation wasn't exercised**, because it needs the owner's AI key.

## Completed

- **Date:** 2026-09-30
- **All tasks executed successfully:** yes (22/22). Real Gemini generation still needs a manual try with the owner's AI key.
- **Branch:** `feat/tailored-documents`. `24ac037 chore: switch all workspace packages to ESM` is committed; the rest is uncommitted.
- **Files changed:**
  - All `package.json` files: `"type": "module"` (ESM commit). Root `package.json` gained `@types/node`. Root `tsconfig.json` gained `"jsx": "react-jsx"`. `apps/web/vitest.config.ts` uses `import.meta.dirname`.
  - `packages/shared/src/tailored-document.ts`: `TAILORED_DOCUMENT_KINDS`.
  - `packages/db`: `tailored_documents` schema, enum, migration `0031_strange_karen_page`, queries and tests.
  - `packages/documents` (new): markdown parser, react-pdf resume and cover letter renderers (ATS rules, WinAnsi mapping), file names, `contactLinesFor`, `tailorResume`/`tailorCoverLetter`, `describeAiError`/`isAiKeyError`, tests.
  - `packages/api`: `tailored-documents.service.ts` plus tests; `tailoredDocuments`/`generateTailoredDocuments`/`saveTailoredDocument` procedures plus router tests; exports for the route handler.
  - `packages/ai`: removed `generate-resume-pdf.ts` and `generate-cover-letter.ts`. `process-apply.ts` auto-tailors the resume, and `apply-agent.ts` takes `ApplyDocuments` and saves generated cover letters. New `process-apply.test.ts`, extended `apply-agent.test.ts`.
  - `apps/web`: `app/api/jobs/[jobId]/documents/[kind]/route.ts`; `components/jobs/tailored-documents-{section,sheet}.tsx` and `tailored-document-editor.tsx`; `hooks/use-generate-tailored-documents.ts`; `lib/tailored-documents.ts` plus test; `lib/trpc.tsx` types; `job-detail.tsx`; `resume-form.tsx` placeholder; shadcn `tabs` and `alert-dialog`.
  - `apps/worker/Dockerfile`: comment only. `CLAUDE.md`: new package, tailored documents section, ESM/JSX pragma rules, shadcn CLI caveat.
- **How to test:**
  - `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm turbo build --filter=web`.
  - Manual: Jobs → select a job with a description → "Generate tailored resume & cover letter" → review in the sheet (edit, save, preview, download). Then "Apply now" on a job without documents and check the apply log for "Generating tailored resume" and that the job panel shows the submitted resume.
- **Follow-up items:**
  - Embed a Unicode font (e.g. Noto Sans) if non-Latin names or content need to render; standard Helvetica only covers WinAnsi.
  - A quality check that diffs the tailored resume against the base resume to flag invented facts (the no-fabrication rule is prompt-only).
  - Version history for tailored documents, bulk generation for multiple jobs, DOCX export.
  - Tailored docs are not refreshed when the base resume changes; the "Updated … ago" label makes staleness visible.
  - Toasts appear bottom-right over the sheet's footer buttons for a few seconds; consider a different toast position if it gets in the way.
