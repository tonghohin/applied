# Plan: Apply Pipeline Token Reduction

> Extract three non-LLM tasks from the apply agent: required salary from profile, browser pre-navigation, and on-demand cover letter via a custom tool.

## Research Summary

- **Stack:** Turborepo monorepo — `packages/ai` (Vercel AI SDK v6, Playwright MCP), `packages/db` (Drizzle + PostgreSQL), `packages/api` (tRPC + Zod), `apps/web` (Next.js)
- **Relevant patterns:** `generate-resume-pdf.ts` is the existing pattern for pre-processing steps before the agent. Tests use `vi.hoisted` + `vi.mock` with chainable mocks; `ai` and `../mcp` are both mocked wholesale.
- **Key files:**
  - `packages/ai/src/agents/apply-agent.ts` — `applyToJob()`, platform prompts, `FORM_FILLING_RULES`
  - `packages/ai/src/agents/process-apply.ts` — orchestrates resume PDF + `applyToJob` call
  - `packages/ai/src/mcp.ts` — `createPlaywrightMCPClient`, returns `{ tools, close }` cast as `MCPClient`
  - `packages/db/src/schema/job-criteria.ts` — `minSalary: integer("min_salary")` (currently nullable)
  - `packages/api/src/services/profile.service.ts` — `upsertCriteriaSchema`, `minSalary` is `.optional()`
  - `apps/web/components/profile/criteria-form.tsx` — criteria form, `minSalary` is not validated as required
  - `packages/ai/src/agents/apply-agent.test.ts` — existing tests to update
- **New dependencies:** none
- **Risks/Considerations:**
  - `mcp.ts` already has a `biome-ignore` for the playwright-extra/playwright-core version mismatch; exposing `browserContext` uses the same workaround pattern.
  - The `generate_cover_letter` tool uses the agent's closure (`job`, `profile`) so it takes no parameters — the agent just calls it when it sees a cover letter field.
  - `getJobCriteriaForUser` is already exported from `@repo/db`; no new query needed.

## Tasks

### Phase 1: Make `minSalary` required end-to-end

#### 1.1. DB schema: `minSalary` NOT NULL
- **What:** Add `.notNull()` to `minSalary` in the `job_criteria` table schema, then generate the migration. The existing row already has a value so the `ALTER COLUMN SET NOT NULL` migration will succeed without a default.
- **Files:** `packages/db/src/schema/job-criteria.ts` (edit), then run `pnpm generate` from repo root to produce the migration file under `packages/db/src/migrations/`
- **Verify:** `pnpm generate` completes without error; migration SQL contains `ALTER COLUMN "min_salary" SET NOT NULL`.

#### 1.2. API zod: remove `.optional()`
- **What:** In `upsertCriteriaSchema`, change `minSalary: z.number().int().positive().optional()` to `z.number().int().positive()`. This makes `minSalary` a required field at the tRPC boundary.
- **Files:** `packages/api/src/services/profile.service.ts`
- **Verify:** `pnpm typecheck` passes; calling `upsertCriteria` without `minSalary` will now produce a Zod validation error.

#### 1.3. UI form: validate `minSalary` as required
- **What:** Three changes in the criteria form: (a) change the local Zod schema from `minSalary: z.string()` to `z.string().min(1, "Required")`; (b) add `<FieldError errors={[errors.minSalary]} />` below the input; (c) in `onSubmit`, change `values.minSalary ? Number(values.minSalary) : undefined` to `Number(values.minSalary)` since it's now guaranteed non-empty.
- **Files:** `apps/web/components/profile/criteria-form.tsx`
- **Verify:** Submitting the criteria form with the salary field empty shows "Required" error beneath the input; submitting with a value saves successfully.

### Phase 2: Expose `browserContext` from the MCP client

#### 2.1. Return `browserContext` from `createPlaywrightMCPClient`
- **What:** Define a `PlaywrightMCPClient` type with `tools`, `close`, and `browserContext: BrowserContext` (imported from `playwright`). Change the function's return type from the `as unknown as MCPClient` cast to the new explicit type. Add `browserContext: context` to the returned object. Export `PlaywrightMCPClient` so `apply-agent.ts` can use it.
- **Files:** `packages/ai/src/mcp.ts`
- **Verify:** `pnpm typecheck` passes; `client.browserContext` is accessible after calling `createPlaywrightMCPClient`.

### Phase 3: Pre-navigate before the agent starts

#### 3.1. Navigate in `applyToJob` and update platform prompts
- **What:** After `createPlaywrightMCPClient` returns, use `client.browserContext` to navigate before calling `generateText`: get `client.browserContext.pages()[0]` (or open a new page if the context has none), call `page.goto(job.url, { waitUntil: "domcontentloaded" })`, and log `"Pre-navigating to job URL"`. In all five platform prompts (`LINKEDIN_PROMPT`, `GREENHOUSE_PROMPT`, `LEVER_PROMPT`, `ASHBY_PROMPT`, `GENERIC_PROMPT`), replace step 1 ("Navigate to the job URL using browser_navigate") and step 2 ("Take a snapshot…") with a single step: "The browser is already loaded on the job URL. Take a browser_snapshot to see the current page state."
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** Worker logs show `"Pre-navigating to job URL"` before `"[step 1] browser_snapshot"` (not `browser_navigate`).

### Phase 4: `generate_cover_letter` custom tool

#### 4.1. Extract `generateCoverLetter` helper
- **What:** Create `packages/ai/src/agents/generate-cover-letter.ts` with a single exported async function `generateCoverLetter(job: Job, profile: ProfileWithEmail): Promise<string>`. It calls `generateText` with no `tools` and no `stopWhen` — a single-shot call using `"google/gemini-2.5-flash"` with a focused system prompt and `experimental_telemetry: { isEnabled: true }`. Returns `text.trim()`.
- **Files:** `packages/ai/src/agents/generate-cover-letter.ts` (new)
- **Verify:** Function exists and can be imported; unit test (task 5.1) validates the call shape.

#### 4.2. Register tool in `applyToJob` and update `FORM_FILLING_RULES`
- **What:** Import `tool` from `"ai"` and `generateCoverLetter` from the new file. In `applyToJob`, add a `generate_cover_letter` entry to the tools object alongside the MCP tools:
  ```ts
  generate_cover_letter: tool({
    description: "Generate a personalized cover letter for this job application. Call this when the form has a cover letter field.",
    parameters: z.object({}),
    execute: async () => generateCoverLetter(job, profile),
  })
  ```
  In `FORM_FILLING_RULES`, replace "write a personalized cover letter…" with "call generate_cover_letter to obtain the cover letter text, then type the returned text into the field."
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** `pnpm typecheck` passes; tools object contains both MCP tools and `generate_cover_letter`.

### Phase 5: Wire `minSalary` into the agent

#### 5.1. Fetch criteria in `processApplyJob` and pass `minSalary`
- **What:** Add `getJobCriteriaForUser(db, userId)` to the `Promise.all` fetch alongside job and profile. Throw if the criteria row is missing. Pass `criteriaRow.minSalary` as a new argument to `applyToJob`.
- **Files:** `packages/ai/src/agents/process-apply.ts`
- **Verify:** `pnpm typecheck` passes with the updated `applyToJob` signature from task 5.2.

#### 5.2. Add `minSalary` parameter to `applyToJob`
- **What:** Add `minSalary: number` as a new parameter to `applyToJob` (before `linkedinSessionJson`). Add `Expected salary: ${minSalary}` to the `profileSummary` array. In `FORM_FILLING_RULES` salary section, replace the keyword-inference sentence ("use 120000 for senior roles or 90000 for mid-level roles") with "Use the 'Expected salary' value from the applicant profile."
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** `pnpm typecheck` passes; profile summary in `generateText` prompt contains the salary number.

### Phase 6: Tests

#### 6.1. Unit tests for `generateCoverLetter`
- **What:** Create `packages/ai/src/agents/generate-cover-letter.test.ts`. Mock `"ai"` (`generateText`). Verify: (a) `generateText` is called with no `tools` and no `stopWhen`; (b) the model is `"google/gemini-2.5-flash"`; (c) `experimental_telemetry` is enabled; (d) the returned text is trimmed.
- **Files:** `packages/ai/src/agents/generate-cover-letter.test.ts` (new)
- **Verify:** `pnpm --filter @repo/ai exec vitest run` passes.

#### 6.2. Update `apply-agent.test.ts` for new signature
- **What:** The `applyToJob` signature now has an extra `minSalary: number` parameter and `applyToJob` uses `client.browserContext`. Update the MCP mock to include `browserContext: { pages: () => [], newPage: vi.fn().mockResolvedValue({ goto: vi.fn() }) }`. Update all four `applyToJob(...)` calls to pass a `minSalary` value (e.g., `90000`) as the 4th argument.
- **Files:** `packages/ai/src/agents/apply-agent.test.ts`
- **Verify:** `pnpm --filter @repo/ai exec vitest run` passes with no type errors.

## Notes

- **Migration timing:** Run `pnpm generate` after task 1.1 and `pnpm migrate` after confirming the generated SQL looks correct. Since the existing row already has a salary value, the `SET NOT NULL` migration is safe.
- **Tool ordering:** The `generate_cover_letter` custom tool must be merged with the filtered MCP tools object, not added to `ALLOWED_TOOL_NAMES` (that set is for filtering MCP tools only). The custom tool is added directly to the `tools` spread.
- **`coverLetterInstructions` in prompt:** Keep `coverLetterInstructions` in the `profileSummary` passed to the agent — `generateCoverLetter` reads it from the profile via closure, so it's still used; it just no longer needs to be a separate system prompt instruction.
- **`applyToJob` parameter order:** New order is `(job, profile, resumePdfPath, minSalary, linkedinSessionJson?, log?)`. Update all callers and tests.
