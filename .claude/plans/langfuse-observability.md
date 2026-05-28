# Plan: Langfuse Self-Hosted Observability for AI Apply Agent

> Self-host Langfuse v3 via Docker and wire it into the Gemini agent so every job application run is traced with LLM input/output, tool calls, token usage, and success/failure — using Langfuse's official OTEL integration for the Vercel AI SDK.

## Research Summary

- **Stack:** Turborepo monorepo, BullMQ worker (`apps/worker`), Vercel AI SDK v6 (`ai`), Gemini 2.5 Flash, `packages/ai`
- **Integration approach:** OTEL-based — `@langfuse/otel` registers a `LangfuseSpanProcessor`; `@langfuse/tracing`'s `propagateAttributes()` attaches userId/metadata per job; `experimental_telemetry: { isEnabled: true }` on `generateText` auto-creates traces/generations. No manual `trace()` or `generation()` calls needed.
- **Key files:**
  - `docker-compose.yaml` — add Langfuse v3 services (langfuse-db, clickhouse, minio, langfuse-web, langfuse-worker)
  - `apps/worker/src/otel.ts` — new file: init OTEL SDK, export `langfuseSpanProcessor`
  - `apps/worker/src/index.ts` — import `./otel` first (before other imports)
  - `apps/worker/src/workers/apply.worker.ts` — wrap job with `propagateAttributes`, flush after
  - `apps/worker/src/env.ts` — add optional Langfuse env vars
  - `packages/ai/src/agents/apply-agent.ts` — add `experimental_telemetry: { isEnabled: true }` to `generateText`
- **New dependencies (in `apps/worker`):** `@langfuse/tracing`, `@langfuse/otel`, `@opentelemetry/sdk-node`
- **`packages/ai`:** zero new dependencies — only a one-line change to `generateText`
- **Risks/Considerations:**
  - OTEL SDK **must** be the very first import in `index.ts` — otherwise spans from early BullMQ worker init are missed
  - Existing `docker-compose.yaml` has `postgres` and `redis`; Langfuse gets a separate `langfuse-db` and reuses the existing `redis`
  - Langfuse v3 requires `minio` (S3-compatible storage) for event uploads — the original plan was missing this
  - Correct env var is `LANGFUSE_BASE_URL` (not `LANGFUSE_BASEURL`)

---

## Tasks

### Phase 1: Docker — Langfuse Self-Host

#### 1.1. [x] Add Langfuse v3 services to `docker-compose.yaml`

- **What:** Add five new services. `langfuse-db` is a dedicated Postgres for Langfuse (no conflict with the app's `postgres`). Existing `redis` is reused by Langfuse. `clickhouse` is the analytics DB. `minio` handles event/media blob storage (required by Langfuse v3 — was missing from original plan). `langfuse-web` on port 3001 (avoiding Next.js on 3000). `langfuse-worker` is Langfuse's internal ingestion worker. `LANGFUSE_INIT_*` vars auto-seed an org, project, and API keys on first boot.

- **Files:** `docker-compose.yaml`

- **Add these services** (leave existing `postgres` and `redis` untouched):
  ```yaml
  langfuse-db:
    image: postgres:16
    environment:
      POSTGRES_USER: langfuse
      POSTGRES_PASSWORD: langfuse
      POSTGRES_DB: langfuse
    volumes:
      - langfuse-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U langfuse"]
      interval: 5s
      timeout: 5s
      retries: 5

  clickhouse:
    image: clickhouse/clickhouse-server:24.12
    environment:
      CLICKHOUSE_DB: langfuse
      CLICKHOUSE_USER: langfuse
      CLICKHOUSE_PASSWORD: langfuse
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: "1"
    volumes:
      - clickhouse-data:/var/lib/clickhouse
    healthcheck:
      test: ["CMD", "clickhouse-client", "--user", "langfuse", "--password", "langfuse", "--query", "SELECT 1"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    environment:
      MINIO_ROOT_USER: langfuse
      MINIO_ROOT_PASSWORD: langfuse123
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 5

  langfuse-web:
    image: langfuse/langfuse:3
    ports:
      - "3001:3000"
    depends_on:
      langfuse-db: { condition: service_healthy }
      clickhouse: { condition: service_healthy }
      redis: { condition: service_healthy }
      minio: { condition: service_healthy }
    environment:
      DATABASE_URL: postgresql://langfuse:langfuse@langfuse-db:5432/langfuse
      DIRECT_URL: postgresql://langfuse:langfuse@langfuse-db:5432/langfuse
      CLICKHOUSE_MIGRATION_URL: clickhouse://langfuse:langfuse@clickhouse:9000
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_USER: langfuse
      CLICKHOUSE_PASSWORD: langfuse
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: langfuse123
      LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: langfuse123
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true"
      NEXTAUTH_URL: http://localhost:3001
      NEXTAUTH_SECRET: local-langfuse-secret-change-in-prod
      SALT: local-langfuse-salt-change-in-prod
      ENCRYPTION_KEY: 0000000000000000000000000000000000000000000000000000000000000000
      LANGFUSE_INIT_ORG_ID: local-org
      LANGFUSE_INIT_ORG_NAME: Local
      LANGFUSE_INIT_PROJECT_ID: local-project
      LANGFUSE_INIT_PROJECT_NAME: Applied
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: pk-lf-local-public-key
      LANGFUSE_INIT_PROJECT_SECRET_KEY: sk-lf-local-secret-key
      LANGFUSE_INIT_USER_EMAIL: admin@local.dev
      LANGFUSE_INIT_USER_NAME: admin
      LANGFUSE_INIT_USER_PASSWORD: admin123

  langfuse-worker:
    image: langfuse/langfuse-worker:3
    depends_on:
      langfuse-db: { condition: service_healthy }
      clickhouse: { condition: service_healthy }
      redis: { condition: service_healthy }
      minio: { condition: service_healthy }
    environment:
      DATABASE_URL: postgresql://langfuse:langfuse@langfuse-db:5432/langfuse
      DIRECT_URL: postgresql://langfuse:langfuse@langfuse-db:5432/langfuse
      CLICKHOUSE_MIGRATION_URL: clickhouse://langfuse:langfuse@clickhouse:9000
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_USER: langfuse
      CLICKHOUSE_PASSWORD: langfuse
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: langfuse123
      LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: langfuse
      LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: langfuse123
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true"
      ENCRYPTION_KEY: 0000000000000000000000000000000000000000000000000000000000000000
      SALT: local-langfuse-salt-change-in-prod
      NEXTAUTH_SECRET: local-langfuse-secret-change-in-prod
  ```

  Add to the `volumes:` block: `langfuse-pgdata:`, `clickhouse-data:`, `minio-data:`

- **Verify:** `docker compose up -d` → wait ~30s → `curl http://localhost:3001/api/public/health` returns `{"status":"ok"}`. Open `http://localhost:3001`, log in as `admin@local.dev` / `admin123`, confirm the "Applied" project exists.

---

### Phase 2: Package Setup

#### 2.1. [x] Install OTEL + Langfuse packages in `apps/worker`

- **What:** The OTEL SDK and Langfuse packages go in the worker app — it owns process-level observability. `packages/ai` needs no new dependencies at all.
- **Files:** `apps/worker/package.json` (updated by pnpm)
- **Command:** `pnpm --filter @repo/worker add @langfuse/tracing @langfuse/otel @opentelemetry/sdk-node`
- **Verify:** `grep langfuse apps/worker/package.json` shows the packages.

#### 2.2. [x] Update `apps/worker/src/env.ts` — add optional Langfuse vars

- **What:** Add the three Langfuse env vars as optional. Note the correct name is `LANGFUSE_BASE_URL`.
- **Files:** `apps/worker/src/env.ts`

  Add to `envSchema`:
  ```ts
  LANGFUSE_PUBLIC_KEY: z.string().min(1, "LANGFUSE_PUBLIC_KEY is required"),
  LANGFUSE_SECRET_KEY: z.string().min(1, "LANGFUSE_SECRET_KEY is required"),
  LANGFUSE_BASE_URL: z.string().default("http://localhost:3001"),
  ```

- **Verify:** Worker fails to start with a clear error if Langfuse vars are absent.

#### 2.3. [x] Create `apps/worker/src/otel.ts` — OTEL SDK init

- **What:** Initialize the OTEL SDK with `LangfuseSpanProcessor` and export the processor for flushing. `LangfuseSpanProcessor` reads `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` from `process.env` automatically — no-ops silently if keys are absent.
- **Files:** `apps/worker/src/otel.ts` (create)

  ```ts
  import { LangfuseSpanProcessor } from "@langfuse/otel";
  import { NodeSDK } from "@opentelemetry/sdk-node";

  export const langfuseSpanProcessor = new LangfuseSpanProcessor();

  const sdk = new NodeSDK({
    spanProcessors: [langfuseSpanProcessor],
  });

  sdk.start();
  ```

- **Verify:** `pnpm typecheck` passes.

---

### Phase 3: Instrumentation

#### 3.1. [x] Update `apps/worker/src/index.ts` — import otel first

- **What:** `import "./otel"` must be the very first line so the SDK is registered before BullMQ workers initialize. The rest of the file is unchanged.
- **Files:** `apps/worker/src/index.ts`

  Prepend:
  ```ts
  import "./otel"; // must be first — registers LangfuseSpanProcessor
  ```

- **Verify:** Worker starts without errors.

#### 3.2. [x] Update `apply.worker.ts` — wrap job with `propagateAttributes`, flush after

- **What:** Wrap `processApplyJob` with `propagateAttributes()` to attach the Langfuse trace context (traceName, userId, jobId). Call `langfuseSpanProcessor.forceFlush()` in a `finally` block after each job so traces are sent before BullMQ marks the job done.
- **Files:** `apps/worker/src/workers/apply.worker.ts`

  Add imports:
  ```ts
  import { propagateAttributes } from "@langfuse/tracing";
  import { langfuseSpanProcessor } from "../otel";
  ```

  Wrap the `processApplyJob` call inside the existing try/catch with `propagateAttributes`, and add a `finally` for flush. The overall structure becomes:
  ```ts
  try {
    await propagateAttributes(
      {
        traceName: "apply-job",
        userId,
        metadata: { jobId, runId: run.id },
        tags: ["apply"],
      },
      async () => {
        await processApplyJob(db, jobId, userId, linkedinSessionJson, log);
      }
    );
    await updateApplyRun(db, run.id, { status: "completed", completedAt: new Date(), logs });
  } catch (err) {
    log(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    await updateApplyRun(db, run.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
      logs,
    });
    throw err;
  } finally {
    await langfuseSpanProcessor.forceFlush();
  }
  ```

- **Verify:** `pnpm typecheck` passes. Worker processes a job without errors.

#### 3.3. [x] Update `apply-agent.ts` — enable telemetry on `generateText`

- **What:** Add `experimental_telemetry: { isEnabled: true }` to the `generateText` call. This single line is the only change needed in `packages/ai` — the OTEL SDK registered in the worker process automatically intercepts all AI SDK spans and sends them to Langfuse.
- **Files:** `packages/ai/src/agents/apply-agent.ts`

  Add to the `generateText` options:
  ```ts
  experimental_telemetry: { isEnabled: true },
  ```

- **Verify:** `pnpm --filter @repo/ai exec vitest run` — all existing tests still pass (they mock `generateText` directly so `experimental_telemetry` has no effect on test outcomes).

#### 3.4. [x] Add Langfuse env vars to `apps/worker/.env`

- **What:** Add the pre-seeded API keys from `LANGFUSE_INIT_*` in the compose file. Local dev is zero-friction: start Docker, add three lines, restart worker.
- **Files:** `apps/worker/.env` (add lines — do not commit)

  ```
  LANGFUSE_PUBLIC_KEY=pk-lf-local-public-key
  LANGFUSE_SECRET_KEY=sk-lf-local-secret-key
  LANGFUSE_BASE_URL=http://localhost:3001
  ```

- **Verify:** Worker starts; no auth errors in stderr.

---

## Verification (End-to-End)

1. `docker compose up -d` — wait ~30s for all healthchecks to pass
2. `curl http://localhost:3001/api/public/health` → `{"status":"ok",...}`
3. Add Langfuse vars to `apps/worker/.env`
4. `pnpm --filter @repo/ai exec vitest run` → all tests pass
5. `pnpm typecheck` → zero errors
6. `pnpm turbo dev --filter=@repo/worker`
7. Trigger an apply job through the UI
8. Open `http://localhost:3001` → `admin@local.dev` / `admin123` → **Traces**
9. Confirm a trace named `apply-job` with:
   - `userId` matching the triggering user
   - metadata: `jobId`, `runId`
   - child generation for the `generateText` call with model, input prompt, output, token counts, and each Playwright tool-call step
10. Remove Langfuse vars, restart worker → job still completes (graceful no-op)

## Notes

- `ENCRYPTION_KEY` all-zeros is **local dev only**. Production: `openssl rand -hex 32`.
- `NEXTAUTH_SECRET` and `SALT` should also be regenerated for production: `openssl rand -base64 32`.
- `langfuse-worker` (Docker service) is Langfuse's internal ingestion worker — required for traces to appear in the UI. Separate from the app's BullMQ worker.
- Individual Playwright tool calls within each `generateText` step are automatically captured as child spans by the OTEL integration — no additional code needed beyond `experimental_telemetry: { isEnabled: true }`.
- To trace the job search pipeline later: add `experimental_telemetry: { isEnabled: true }` to any `generateText` calls in `packages/automation` and wrap the search worker with `propagateAttributes` the same way.

## Completed

- **Date:** 2026-05-27
- **All tasks executed successfully:** yes
- **Files changed:**
  - `docker-compose.yaml` — added langfuse-db, clickhouse, minio, langfuse-web (port 3001), langfuse-worker services + 3 volumes
  - `pnpm-workspace.yaml` — approved protobufjs build scripts (required by @langfuse/otel deps)
  - `apps/worker/package.json` — added @langfuse/tracing, @langfuse/otel, @opentelemetry/sdk-node
  - `apps/worker/src/env.ts` — added required LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, optional LANGFUSE_BASE_URL (default localhost:3001)
  - `apps/worker/src/otel.ts` — new: initializes NodeSDK with LangfuseSpanProcessor, exports processor
  - `apps/worker/src/index.ts` — import ./otel as first line
  - `apps/worker/src/workers/apply.worker.ts` — wrapped processApplyJob with propagateAttributes, added forceFlush() in finally
  - `packages/ai/src/agents/apply-agent.ts` — added experimental_telemetry: { isEnabled: true } to generateText
  - `apps/worker/.env` — added LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL (pre-seeded local keys)
- **How to test:**
  1. `docker compose up -d` (wait ~30s)
  2. `curl http://localhost:3001/api/public/health` → {"status":"ok"}
  3. `pnpm turbo dev --filter=@repo/worker`
  4. Trigger an apply job via the UI
  5. Open http://localhost:3001 → admin@local.dev / admin123 → Traces
- **Follow-up items:**
  - ENCRYPTION_KEY / NEXTAUTH_SECRET / SALT in docker-compose.yaml are placeholder values — replace before any non-local deployment
  - MinIO bucket 'langfuse' is auto-created by langfuse-web on first boot
  - Per-step Playwright tool-call tracing can be added via onStepFinish callback on generateText if more granularity is needed
