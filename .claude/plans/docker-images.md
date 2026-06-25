# Plan: Docker Images

> Containerise web and worker for self-hosted deployment via `docker compose up`, publishing images to GHCR.

## Research Summary

- **Stack:** Next.js 16 (App Router), Node.js worker with Playwright, pnpm 11 monorepo, Turborepo
- **Relevant patterns:** `turbo prune --docker` for minimal build contexts; Next.js `output: 'standalone'` for self-contained runner images; Playwright requires Chromium + system libs in the worker image
- **Key files:**
  - `apps/web/next.config.ts` — needs `output: 'standalone'`
  - `apps/worker/src/index.ts` — entry point; uses `tsx` for dev, will use `node --import tsx` in Docker
  - `docker-compose.yaml` — currently only postgres + redis; needs web + worker services added
  - `docker-compose.langfuse.yml` — Langfuse stack; will be pulled in via Docker Compose `include`
  - `pnpm-workspace.yaml` — defines workspace; needed in pruner stage
- **New dependencies:** none (turbo already installed; tsx already in worker devDeps)
- **Risks/Considerations:**
  - Worker image will be large (~1–2 GB) due to Chromium — expected and unavoidable
  - Langfuse compose already defines services named `postgres` and `redis`; app services in prod compose must use distinct names (`db`, `cache`) to avoid conflicts
  - `DATABASE_URL` and `REDIS_URL` values change from `localhost:*` to `db:5432` / `cache:6379` in Docker — document clearly
  - Docker Compose `include` requires Compose v2.20+ (ships with Docker Desktop 4.22+, July 2023)
  - `turbo prune` must run from the repo root; Docker build context must be repo root for both Dockerfiles
  - Worker has no TypeScript emit step (`tsc --noEmit` only); run in Docker with `node --import tsx/esm src/index.ts` (tsx is in devDeps, install all deps in image)

---

## Tasks

### Phase 1: Next.js Standalone Config

#### 1.1. [x] Enable standalone output in Next.js
- **What:** Add `output: 'standalone'` to `next.config.ts`. This makes `next build` emit a self-contained `apps/web/.next/standalone/` directory that includes the minimal Node.js server — no `node_modules` needed in the runner image.
- **Files:** `apps/web/next.config.ts`
- **Verify:** Run `pnpm turbo build --filter=web` and confirm `.next/standalone/` is created.

---

### Phase 2: Dockerfiles

#### 2.1. [x] Root `.dockerignore`
- **What:** Create a root `.dockerignore` to exclude `node_modules`, `.next`, `.turbo`, `.git`, and per-app `.env*` files from the Docker build context. This keeps build contexts small and prevents local env files leaking into images.
- **Files:** `.dockerignore` (new, repo root)
- **Verify:** Context size is reasonable when building (no multi-GB uploads).

#### 2.2. [x] `apps/web/Dockerfile`
- **What:** Four-stage build using `turbo prune`:
  1. **pruner** (`node:20-alpine`) — `npm install -g turbo`, copy repo, `turbo prune web --docker`
  2. **installer** (`node:20-alpine`) — `corepack enable`, copy `out/json` + `out/pnpm-lock.yaml`, `pnpm install --frozen-lockfile`
  3. **builder** — copy `out/full`, `pnpm turbo build --filter=web`
  4. **runner** (`node:20-alpine`, non-root user `nodejs`) — copy `.next/standalone`, `.next/static`, `public`; expose port 3000; `CMD ["node", "server.js"]`
- **Files:** `apps/web/Dockerfile` (new)
- **Verify:** `docker build -f apps/web/Dockerfile -t applied-web .` from repo root succeeds and `docker run -p 3000:3000 applied-web` serves the app.

#### 2.3. [x] `apps/worker/Dockerfile`
- **What:** Three-stage build:
  1. **pruner** (`node:20-slim`) — install turbo, copy repo, `turbo prune @repo/worker --docker`
  2. **installer** (`node:20-slim`) — `corepack enable`, install deps (all, including devDeps for tsx), `playwright install chromium --with-deps`
  3. **runner** (`node:20-slim`, non-root user `nodejs`) — copy source from `out/full`, set `NODE_ENV=production`; `CMD ["node", "--import", "tsx/esm", "apps/worker/src/index.ts"]`

  Use `node:20-slim` (Debian-based) rather than Alpine — Playwright's Chromium requires glibc.
- **Files:** `apps/worker/Dockerfile` (new)
- **Verify:** `docker build -f apps/worker/Dockerfile -t applied-worker .` from repo root succeeds.

---

### Phase 3: Production Docker Compose

#### 3.1. [x] Create `docker-compose.prod.yml`
- **What:** A single compose file self-hosters run to get the full stack. Uses Docker Compose `include` to pull in `docker-compose.langfuse.yml`. Defines:
  - `db` — postgres:16 (renamed from `postgres` to avoid conflict with Langfuse's `postgres`)
  - `cache` — redis:7-alpine (renamed from `redis` to avoid conflict with Langfuse's `redis`)
  - `web` — image `ghcr.io/${GITHUB_REPOSITORY_OWNER}/applied-web:latest`, build fallback `apps/web`, depends on `db` + `cache`, env from root `.env`, port 3000
  - `worker` — image `ghcr.io/${GITHUB_REPOSITORY_OWNER}/applied-worker:latest`, build fallback `apps/worker`, depends on `db` + `cache`, env from root `.env`
  - Both `web` and `worker` get `LANGFUSE_BASE_URL=http://langfuse-web:3000` (internal service name from included Langfuse compose)

  Keep the existing `docker-compose.yaml` unchanged (still used for `pnpm dev`).
- **Files:** `docker-compose.prod.yml` (new)
- **Verify:** `docker compose -f docker-compose.prod.yml config` validates without errors.

#### 3.2. [x] Create root `.env.example` for Docker deployment
- **What:** A root `.env.example` for the Docker path (distinct from the per-app examples used with `pnpm dev`). Contains all vars consumed by `docker-compose.prod.yml`: `DATABASE_URL` (pointing at `db:5432`), `REDIS_URL` (pointing at `cache:6379`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_BASE_URL`, `LINKEDIN_ENCRYPTION_KEY`, `AI_GATEWAY_API_KEY`, and Langfuse vars. Pre-fill infrastructure values; add `# CHANGEME` comments on secrets.

  Note: `DATABASE_URL` here must use `db` as hostname (not `localhost`), and `REDIS_URL` must use `cache` (not `localhost`).
- **Files:** `.env.example` (new, repo root)
- **Verify:** File exists with all required vars; `docker compose -f docker-compose.prod.yml --env-file .env config` resolves all variables.

---

### Phase 4: GHCR Publishing Workflow

#### 4.1. [x] Add `docker.yml` GitHub Actions workflow
- **What:** Builds and pushes both images to GHCR on every push to `main`. Steps:
  1. Checkout
  2. Set up QEMU (for multi-platform builds — `linux/amd64,linux/arm64`)
  3. Set up Docker Buildx
  4. Log in to GHCR using `secrets.GITHUB_TOKEN`
  5. Build and push `applied-web` image with tags `:latest` and `:<sha>`
  6. Build and push `applied-worker` image with tags `:latest` and `:<sha>`
  
  Both build steps use `context: .` (repo root) and `file: apps/<app>/Dockerfile`. Use `docker/build-push-action@v6` and `docker/metadata-action@v5` for tag management.
- **Files:** `.github/workflows/docker.yml` (new)
- **Verify:** Workflow file is valid YAML; after merging to main, both packages appear under the repo's Packages tab on GitHub.

---

### Phase 5: README

#### 5.1. [x] Restructure README with two setup paths
- **What:** Split the "Getting started" section into two clearly labelled paths:

  **Self-hosting (Docker)** — for people who just want to run the app:
  1. Clone
  2. `cp .env.example .env`, fill in `AI_GATEWAY_API_KEY` + any secrets
  3. `docker compose -f docker-compose.prod.yml up -d`
  4. Open `http://localhost:3000` and create an account
  
  Note: first run pulls images from GHCR; Langfuse UI at `http://localhost:3001`.

  **Local development (pnpm)** — for contributors:
  - Existing pnpm dev steps, unchanged

  Also remove or update any `localhost` references in env var docs that no longer apply to Docker path.
- **Files:** `README.md`
- **Verify:** README clearly distinguishes the two paths; no stale references.

---

## Completed

- **Date:** 2026-06-24
- **All tasks executed successfully:** yes
- **Files changed:**
  - `apps/web/next.config.ts` — Added `output: "standalone"`
  - `.dockerignore` — Excludes node_modules, .next, .turbo, .git, env files
  - `apps/web/Dockerfile` — Four-stage build with turbo prune + Next.js standalone runner
  - `apps/worker/Dockerfile` — Two-stage build with Playwright Chromium + tsx runner (node:20-slim)
  - `docker-compose.prod.yml` — Full prod stack: includes Langfuse, adds db/cache services, wires web+worker
  - `.env.example` — Root env template for Docker path
  - `.github/workflows/docker.yml` — GHCR publishing workflow (push to main, multi-platform)
  - `README.md` — Two-path setup: Docker self-hosting + pnpm dev
- **How to test:**
  1. `cp .env.example .env` and fill in `WEB_IMAGE`, `WORKER_IMAGE`, `AI_GATEWAY_API_KEY`
  2. `docker compose -f docker-compose.prod.yml up -d`
  3. Run migrations, open http://localhost:3000
- **Follow-up items:**
  - `NEXT_PUBLIC_BASE_URL` is baked in at build time — self-hosters on a real domain must build their own image with `--build-arg NEXT_PUBLIC_BASE_URL=https://their-domain.com` (documented in README)
  - Swap `AI_GATEWAY_API_KEY` / Vercel AI Gateway for direct Google API (`@ai-sdk/google` + `GOOGLE_API_KEY`) to remove the Vercel account requirement for contributors
  - Worker image size: ~1–2 GB due to Chromium — expected and unavoidable

## Notes

- **Worker image size:** Expect 1–2 GB due to Chromium. This is normal for Playwright-based workers. Multi-platform builds (`linux/amd64` + `linux/arm64`) will double CI build time.
- **Langfuse internal URL:** The included `docker-compose.langfuse.yml` exposes `langfuse-web` on host port 3001 but the service is named differently internally. Verify the exact internal service name when implementing task 3.1 (check the full langfuse compose).
- **`NEXT_PUBLIC_BASE_URL`:** This is baked into the Next.js standalone build at build time, not at runtime. Self-hosters running on a non-localhost domain need to set this correctly before building — document this clearly in the README.
- **Build args vs env vars:** `NEXT_PUBLIC_*` vars must be passed as Docker build args (`ARG` / `--build-arg`) in the web Dockerfile, not just runtime env vars, because Next.js embeds them at build time.
- **`tsx` in production:** Running the worker with `node --import tsx/esm` is a known pattern and adds negligible overhead for a long-running background process. No TypeScript compilation step needed.
- **Alternative considered:** Building the worker to plain JS (`tsc --outDir dist`) would produce a smaller image (no tsx, no ts source). Skipped because it requires tsconfig changes and path alias resolution setup, adding complexity without clear benefit for a self-hosted tool.
