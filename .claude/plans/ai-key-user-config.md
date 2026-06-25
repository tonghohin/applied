# Plan: AI Key User Config

> Move AI Gateway API key from deployment env var to per-user encrypted DB config, making AI apply an opt-in add-on.

## Research Summary

- **Stack:** Next.js 16 App Router, tRPC, Drizzle ORM, BullMQ worker, Vercel AI SDK (`ai` package)
- **Relevant patterns:**
  - LinkedIn credentials: stored encrypted in `linkedin_accounts` via `encrypt()`/`decrypt()` from `@repo/shared`
  - Settings tabs: sidebar nav → server page → client form → `protectedProcedure` tRPC mutation
  - `createGateway({ apiKey })` from `ai` (re-exported from `@ai-sdk/gateway`) creates a per-call gateway with custom key
- **Key files:**
  - `packages/db/src/schema/profiles.ts` — add nullable `ai_gateway_key_encrypted` column
  - `packages/api/src/services/profile.service.ts` — add `upsertAiKey` + `getAiGatewayKey`
  - `packages/api/src/routers/profile.ts` — add `upsertAiKey` procedure
  - `packages/ai/src/agents/apply-agent.ts` — accept `apiKey`, use `createGateway({ apiKey })`
  - `packages/ai/src/agents/generate-cover-letter.ts` — same
  - `apps/worker/src/workers/apply.worker.ts` — fetch key from DB, pass to agent
  - `apps/web/components/jobs/jobs-columns.tsx` — `columns` → `createColumns(hasAiKey)`
  - `apps/web/components/jobs/apply-button.tsx` — disable + tooltip when `!hasAiKey`
  - `apps/web/components/jobs/jobs-client.tsx` — accept `hasAiKey` prop
  - `apps/web/app/(dashboard)/jobs/page.tsx` — fetch profile, derive `hasAiKey`
- **New dependencies:** none (`createGateway` already in `ai` package)
- **Risks/Considerations:**
  - `AI_GATEWAY_API_KEY` must be removed from worker `.env`, `.env.example`, and `docker-compose.yml`
  - `columns` is a static array — must become `createColumns(hasAiKey: boolean)` to thread the flag down to `ApplyButton`
  - `generateCoverLetter` is called inside `applyToJob` — both need `apiKey` threaded through
  - Worker's `processApplyJob` fetches account + profile; add key fetch there too

---

## Tasks

### Phase 1: Data Layer

#### 1.1. [x] Add `ai_gateway_key_encrypted` to profiles schema
- **What:** Add a nullable `text("ai_gateway_key_encrypted")` column to the `profiles` table in `packages/db/src/schema/profiles.ts`. Nullable because the key is optional.
- **Files:** `packages/db/src/schema/profiles.ts`
- **Verify:** `pnpm generate` produces a new migration SQL file adding the column.

#### 1.2. [x] Run migration
- **What:** Apply the generated migration with `pnpm migrate`.
- **Files:** `packages/db/drizzle/` (new migration file created by 1.1)
- **Verify:** Migration applies without error; column visible in DB schema.

#### 1.3. [x] Add `upsertAiKey` and `getAiGatewayKey` to profile service
- **What:** In `packages/api/src/services/profile.service.ts`, add:
  - `upsertAiKeySchema` — `z.object({ aiGatewayKey: z.string().min(1) })`
  - `upsertAiKey(db, userId, input)` — encrypts `aiGatewayKey` with `env.LINKEDIN_ENCRYPTION_KEY` and upserts into `profiles.ai_gateway_key_encrypted`
  - `getAiGatewayKey(db, userId)` — fetches `ai_gateway_key_encrypted` from profiles, decrypts and returns the key string, or `null` if not set
- **Files:** `packages/api/src/services/profile.service.ts`
- **Verify:** TypeScript compiles (`pnpm typecheck`).

#### 1.4. [x] Export `getAiGatewayKey` from api package
- **What:** Add `export { getAiGatewayKey } from "./services/profile.service"` to `packages/api/src/index.ts` so the worker can import it.
- **Files:** `packages/api/src/index.ts`
- **Verify:** `pnpm typecheck` passes.

---

### Phase 2: tRPC

#### 2.1. [x] Add `upsertAiKey` procedure to profile router
- **What:** Add a `protectedProcedure` to `packages/api/src/routers/profile.ts`:
  ```ts
  upsertAiKey: protectedProcedure
    .input(upsertAiKeySchema)
    .mutation(({ ctx, input }) => upsertAiKey(ctx.db, ctx.session.user.id, input))
  ```
- **Files:** `packages/api/src/routers/profile.ts`
- **Verify:** `pnpm typecheck` passes; procedure appears in the router type.

---

### Phase 3: AI Package

#### 3.1. [x] Thread `apiKey` through `generateCoverLetter`
- **What:** Update `generateCoverLetter(job, profile, apiKey: string)` in `packages/ai/src/agents/generate-cover-letter.ts` to accept an `apiKey` parameter and replace `model: "google/gemini-2.5-flash-lite"` with:
  ```ts
  import { createGateway } from "ai";
  const gatewayProvider = createGateway({ apiKey });
  model: gatewayProvider("google/gemini-2.5-flash-lite"),
  ```
- **Files:** `packages/ai/src/agents/generate-cover-letter.ts`
- **Verify:** `pnpm typecheck` passes.

#### 3.2. [x] Thread `apiKey` through `applyToJob`
- **What:** Update `applyToJob` in `packages/ai/src/agents/apply-agent.ts` to accept `apiKey: string` in its params, pass it to `generateCoverLetter`, and use `createGateway({ apiKey })` for the main `generateText` call (replacing the string model id with a gateway instance).
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** `pnpm typecheck` passes.

#### 3.3. [x] Update `processApplyJob` export to accept `apiKey`
- **What:** Update the exported `processApplyJob` function in `packages/ai/src/index.ts` (or wherever it's exported) to accept and forward `apiKey: string` to `applyToJob`.
- **Files:** `packages/ai/src/index.ts`
- **Verify:** `pnpm typecheck` passes.

---

### Phase 4: Worker

#### 4.1. [x] Fetch AI key from DB and pass to agent
- **What:** In `apps/worker/src/workers/apply.worker.ts`, inside `processApplyJob`:
  1. Call `getAiGatewayKey(db, userId)` after the existing profile/account fetch
  2. If `null`, throw `new Error("AI Gateway API key not configured — add it in Settings → AI")`
  3. Pass the decrypted key to `processApplyJob` (from `@repo/ai`)
- **Files:** `apps/worker/src/workers/apply.worker.ts`
- **Verify:** `pnpm typecheck` passes.

#### 4.2. [x] Remove `AI_GATEWAY_API_KEY` from env and config
- **What:** Remove `AI_GATEWAY_API_KEY` from:
  - `apps/worker/.env.example` (delete the line)
  - `apps/worker/.env` (delete the line)
  - `docker-compose.yml` (delete the `AI_GATEWAY_API_KEY: ${AI_GATEWAY_API_KEY}` line from worker env)
- **Files:** `apps/worker/.env.example`, `apps/worker/.env`, `docker-compose.yml`
- **Verify:** Worker starts without referencing that var; `docker compose config --quiet` produces no `AI_GATEWAY_API_KEY` warning.

---

### Phase 5: UI

#### 5.1. [x] Add AI settings tab to sidebar nav
- **What:** Add `{ href: "/settings/ai", label: "AI" }` to `SETTINGS_LINKS` in `apps/web/components/nav/sidebar.tsx`.
- **Files:** `apps/web/components/nav/sidebar.tsx`
- **Verify:** AI link appears in the settings sidebar.

#### 5.2. [x] Create AI settings form component
- **What:** Create `apps/web/components/settings/ai-form.tsx` — a client component with a password `<Input>` for the API key, a `FieldDescription` linking to `https://v0.dev/gateway`, and a Save button. Calls `trpc.profile.upsertAiKey.useMutation` on submit. Does not pre-fill the input (never send encrypted key to client); shows a status indicator ("Key saved" badge) when `initial.hasAiKey` is true.
- **Files:** `apps/web/components/settings/ai-form.tsx` (new)
- **Verify:** Component renders and submits without TypeScript errors.

#### 5.3. [x] Create AI settings page
- **What:** Create `apps/web/app/(dashboard)/settings/ai/page.tsx` — a server component that fetches the profile, derives `hasAiKey: profile?.aiGatewayKeyEncrypted != null`, and passes it to `<AiForm initial={{ hasAiKey }} />`.
- **Files:** `apps/web/app/(dashboard)/settings/ai/page.tsx` (new)
- **Verify:** Page renders at `/settings/ai`.

#### 5.4. [x] Gate Apply button on `hasAiKey`
- **What:**
  1. In `apps/web/app/(dashboard)/jobs/page.tsx`, also call `getProfile(db, session.user.id)` and derive `hasAiKey: !!profile?.aiGatewayKeyEncrypted`.
  2. Pass `hasAiKey` to `<JobsClient initialJobs={jobs} hasAiKey={hasAiKey} />`.
  3. Update `JobsClient` to accept and forward `hasAiKey` to `createColumns`.
  4. Convert `columns` in `jobs-columns.tsx` from a static array to `createColumns(hasAiKey: boolean): ColumnDef<Job>[]`.
  5. Update `ApplyButton` to accept `disabled?: boolean` — when true, render the button as disabled and change tooltip text to "Add your AI API key in Settings → AI to enable applying".
- **Files:** `apps/web/app/(dashboard)/jobs/page.tsx`, `apps/web/components/jobs/jobs-client.tsx`, `apps/web/components/jobs/jobs-columns.tsx`, `apps/web/components/jobs/apply-button.tsx`
- **Verify:** With no AI key set, Apply button is visually disabled and tooltip shows the settings message. With a key set, button works as before.

---

## Completed

- **Date:** 2026-06-25
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/schema/profiles.ts` — added `aiGatewayKeyEncrypted` nullable text column
  - `packages/db/drizzle/0021_shiny_brood.sql` — migration adding the column
  - `packages/db/src/queries/profiles.ts` — added `aiGatewayKeyEncrypted` to `getProfileWithEmailForUser` select
  - `packages/api/src/services/profile.service.ts` — added `upsertAiKeySchema`, `upsertAiKey`, `getAiGatewayKey`
  - `packages/api/src/routers/profile.ts` — added `upsertAiKey` procedure
  - `packages/api/src/index.ts` — exported `getAiGatewayKey`
  - `packages/ai/src/agents/generate-cover-letter.ts` — accept `apiKey`, use `createGateway`
  - `packages/ai/src/agents/apply-agent.ts` — accept `apiKey`, use `createGateway`, pass to `generateCoverLetter`
  - `packages/ai/src/agents/process-apply.ts` — accept `apiKey`, pass to `applyToJob`
  - `packages/ai/src/agents/generate-cover-letter.test.ts` — updated mocks/fixtures for new signature
  - `packages/ai/src/agents/apply-agent.test.ts` — updated mocks/fixtures for new signature
  - `apps/worker/src/workers/apply.worker.ts` — fetch `aiGatewayKey` via `getAiGatewayKey`, throw if null, pass to `processApplyJob`
  - `apps/worker/src/workers/apply.worker.test.ts` — mock `@repo/api` with `getAiGatewayKey`
  - `apps/worker/.env` — removed `AI_GATEWAY_API_KEY`
  - `apps/worker/.env.example` — removed `AI_GATEWAY_API_KEY`
  - `docker-compose.yml` — removed `AI_GATEWAY_API_KEY` from worker environment
  - `apps/web/components/nav/sidebar.tsx` — added AI link to `SETTINGS_LINKS`
  - `apps/web/components/settings/ai-form.tsx` — new AI key form component
  - `apps/web/app/(dashboard)/settings/ai/page.tsx` — new AI settings page
  - `apps/web/components/jobs/apply-button.tsx` — added `disabled` prop with settings tooltip
  - `apps/web/components/jobs/jobs-columns.tsx` — converted `columns` to `createColumns(hasAiKey)`
  - `apps/web/components/jobs/jobs-data-table.tsx` — accepts and forwards `hasAiKey`
  - `apps/web/components/jobs/jobs-client.tsx` — accepts and forwards `hasAiKey`
  - `apps/web/app/(dashboard)/jobs/page.tsx` — fetches profile, derives and passes `hasAiKey`
- **How to test:**
  1. `pnpm dev` — visit `/settings/ai`, enter an AI Gateway API key, save
  2. Visit `/jobs` — Apply button should be enabled; without a key it's disabled with tooltip
  3. `pnpm test` — all 12 tasks pass, all tests green
- **Follow-up items:** none

## Notes

- **Key never sent to client:** The settings page derives `hasAiKey` as a boolean from the server — the encrypted key itself never leaves the server. The form input is always empty on load.
- **Same encryption key:** `aiGatewayKeyEncrypted` uses `LINKEDIN_ENCRYPTION_KEY` for encryption, same as the LinkedIn password. No new env vars added.
- **`getProfile` already called server-side on jobs page:** The existing `listJobs` call doesn't include profile data, so a separate `getProfile` call is needed. Since both use React `cache()` via `getSession()`, the DB hit for session is shared; the profile fetch is one extra query.
- **Batch apply:** The Apply button can batch-apply selected rows. The `hasAiKey` gate applies equally — all or nothing. No per-job key check needed in the UI since the worker already fails cleanly if the key is missing.
