# Plan: Sidebar Version Indicator

> Show the app's semantic version next to the sidebar logo, sourced from real GitHub releases, with a visual cue (dot + tooltip) when a newer release has been published to GHCR than the one currently running.

## Research Summary

- **Stack:** Next.js 16 App Router (`apps/web`), tRPC (`packages/api`), Turborepo/pnpm monorepo, GitHub Actions + GHCR for image publishing.
- **Relevant patterns:**
  - `SearchRunStatusIndicator` ([apps/web/components/nav/search-run-status-indicator.tsx](../../apps/web/components/nav/search-run-status-indicator.tsx)) is the existing template for a sidebar tRPC-polled indicator with a shadcn `Tooltip`.
  - `NEXT_PUBLIC_BASE_URL` in [apps/web/Dockerfile](../../apps/web/Dockerfile) and [apps/web/lib/env.ts](../../apps/web/lib/env.ts) is the existing pattern for baking a `NEXT_PUBLIC_*` value into the image at build time via `ARG`/`ENV`, validated with Zod at startup.
  - `packages/api/src/routers/runs.ts` + `runs.test.ts` is the template for a small protected-procedure router and its test (mocked dependency, `createCaller`, asserts `UNAUTHORIZED` when session is null).
  - Services live in `packages/api/src/services/*.service.ts` and are re-exported from `packages/api/src/index.ts` when consumed server-side; routers live in `packages/api/src/routers/*.ts` and are registered in `packages/api/src/router.ts`.
- **Key files:**
  - `.github/workflows/docker.yml` — build/push workflow; already converted to `on: workflow_call` with a required `version` input (unaffected by the release-please → semantic-release swap; any tool that can supply a `version` string can drive it).
  - `docker-compose.yml` — self-hosted compose file; `WEB_IMAGE`/`WORKER_IMAGE` default to `ghcr.io/tonghohin/applied-*:latest`.
  - `README.md` — already tells self-hosters to update via `docker compose pull && docker compose up -d` (line 77); today they have no way to know an update exists.
  - `apps/web/components/nav/sidebar.tsx` — `AppSidebar`, renders `AppliedIcon` + "Applied" text in `SidebarHeader`; this is where the version text/dot goes.
  - `apps/web/lib/env.ts`, `apps/web/Dockerfile` — env validation and build-arg injection pattern to extend for the new baked version.
  - `packages/api/src/router.ts`, `packages/api/src/trpc.ts` — router registration and `protectedProcedure`.
  - Root `package.json` — no `version` field, no `dependencies`/`private`-affecting fields beyond `"private": true`; `devDependencies` currently just `biome`/`turbo`/`typescript` — semantic-release and its plugins get added here.
  - `.github/workflows/test.yml` — existing CI pattern to match: `pnpm/action-setup@v4` + `actions/setup-node@v4` (`cache: pnpm`) + `pnpm install --frozen-lockfile`.
  - `semantic-release/semantic-release`'s own `.github/workflows/release.yml` (fetched directly from the repo as a reference) confirms the canonical pattern is a **plain `npx semantic-release` (here: `pnpm exec semantic-release`) shell step** — no third-party marketplace wrapper action.
  - `@semantic-release/exec`'s README confirms the documented pattern for exposing "did a release happen" / "what version" to a later GitHub Actions job: a `publishCmd` that echoes `key=value` lines to `$GITHUB_OUTPUT`, using the `nextRelease.gitTag` / `nextRelease.version` template variables. semantic-release's default `tagFormat` is `v${version}`, so `nextRelease.gitTag` is already `v`-prefixed — matches the existing `NEXT_PUBLIC_APP_VERSION` expectations with no extra config.
- **New dependencies (root `package.json` devDependencies):** `semantic-release`, `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/github`, `@semantic-release/exec`. Deliberately excludes `@semantic-release/npm` (this repo's root `package.json` is `"private": true` and not published; no version bump/publish needed there) and `@semantic-release/changelog` + `@semantic-release/git` (no committed changelog for now — user's explicit choice, keeps the plugin set minimal and avoids a bot-commit-back step needing extra push permissions).
- **Risks/Considerations:** see Notes — this plan changes CI release cadence (images only build on a cut release, not every commit). Switching to semantic-release additionally removes the human review gate release-please had: every qualifying commit (`feat:`/`fix:`) merged to `main` now releases immediately, with no Release PR to review first. Both tradeoffs were confirmed with the user.

---

## Tasks

### Phase 1: Release Automation (semantic-release + gated image publishing)

#### 1.1. [x] Add semantic-release config, dependencies, and the release workflow
**Replaces previous build:** Delete `.github/workflows/release-please.yml` (built in a previous revision of this plan) and replace it with `.github/workflows/release.yml`.
- **What:**
  - Add to root `package.json` `devDependencies`: `semantic-release`, `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/github`, `@semantic-release/exec` (e.g. via `pnpm add -D <packages>` from repo root).
  - Add root `.releaserc.json`:
    ```json
    {
      "branches": ["main"],
      "plugins": [
        "@semantic-release/commit-analyzer",
        "@semantic-release/release-notes-generator",
        "@semantic-release/github",
        [
          "@semantic-release/exec",
          {
            "publishCmd": "echo 'tag_name=${nextRelease.gitTag}' >> $GITHUB_OUTPUT && echo 'released=true' >> $GITHUB_OUTPUT"
          }
        ]
      ]
    }
    ```
    This parses the existing Conventional Commit history (`feat:`, `fix:`, etc.) on every push to `main` and, when a releasable change is found, immediately creates a GitHub Release + git tag (default `tagFormat` is `v${version}`) — no PR/review gate, unlike release-please.
  - Add `.github/workflows/release.yml`: a `release` job matching the existing `pnpm/action-setup@v4` + `actions/setup-node@v4` (`cache: pnpm`) + `pnpm install --frozen-lockfile` pattern from `test.yml`, with `permissions: contents: write, issues: write, pull-requests: write`, `checkout` using `fetch-depth: 0` (semantic-release needs full tag history, not a shallow clone), then a step `id: release` running `pnpm exec semantic-release` with `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Declare job `outputs: { release_created: steps.release.outputs.released, tag_name: steps.release.outputs.tag_name }` (the `@semantic-release/exec` `publishCmd` only runs when a release is actually published, so `released` is simply absent — falsy — on a no-op run).
  - Add a second job `docker` in the same file: `needs: release`, `if: ${{ needs.release.outputs.release_created }}`, `permissions: contents: read, packages: write`, `uses: ./.github/workflows/docker.yml` with `with: version: ${{ needs.release.outputs.tag_name }}`. This preserves the exact gating shape from the previous release-please build — chaining as a `needs:`-dependent job in the same workflow run avoids the well-known GitHub Actions gotcha where a tag created via the default `GITHUB_TOKEN` (which `@semantic-release/github` also uses) doesn't retrigger a new `push` event.
- **Files:** `.github/workflows/release-please.yml` (delete), `.github/workflows/release.yml` (new), `.releaserc.json` (new), `package.json` (root, add devDependencies)
- **Verify:** YAML valid (`actionlint` if available, otherwise a careful read); confirm `@semantic-release/exec`'s current README still documents `publishCmd` + `$GITHUB_OUTPUT` + `nextRelease.gitTag` the same way before relying on it — don't guess if it's moved on.

#### 1.2. [x] Remove release-please-era seed files
- **What:** Delete root `version.txt` and `CHANGELOG.md`. Both were added purely as release-please's `simple`-release-type tracking manifest; semantic-release derives the next version entirely from git tag history, so these files are now dead and would be misleading if left in place (nothing updates them, and no plugin reads them since `@semantic-release/changelog` was deliberately not added).
- **Files:** `version.txt` (delete), `CHANGELOG.md` (delete)
- **Verify:** `git status` shows both removed; `grep -rn "version.txt\|CHANGELOG.md" .github/workflows` returns no matches (nothing references them).

#### 1.3. [x] Convert `docker.yml` into a reusable, release-gated workflow
- **What:** Change the trigger from `on: push: branches: [main]` to `on: workflow_call: inputs: { version: { required: true, type: string } }` (keep `permissions: contents: read, packages: write` on the workflow). In the `merge` job's "Image tags" step, replace the current `type=raw,value=latest` + `type=sha,prefix=` tag list with `type=raw,value=latest` + `type=raw,value=${{ inputs.version }}` — so a release now moves `:latest` to the exact same image as the version tag (matching the user's chosen "latest = latest release only" behavior), and drops the per-commit SHA tag since builds no longer happen per-commit. In the `build` job's "Build and push by digest" step, pass `build-args: NEXT_PUBLIC_APP_VERSION=${{ inputs.version }}` for the `applied-web` image (harmless no-op for `applied-worker`, which doesn't declare that `ARG`).
- **Files:** `.github/workflows/docker.yml`
- **Verify:** YAML valid; re-read the diff to confirm no other job still assumes a `push` trigger context (e.g. nothing references `github.sha` for tagging anymore). Unaffected by the release-please → semantic-release swap — this task's build already stands and needs no rework, only re-verifying that its `version` input is still supplied correctly by the new task 1.1 job.

---

### Phase 2: Backend — expose current + latest version

#### 2.1. [x] Bake the running version into the web image
- **What:** Add `NEXT_PUBLIC_APP_VERSION` to `apps/web/lib/env.ts`'s Zod schema as `z.string().default("dev")` (so local `pnpm dev` / `docker build` without the arg still works). In `apps/web/Dockerfile`, add `ARG NEXT_PUBLIC_APP_VERSION=dev` and `ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION` next to the existing `NEXT_PUBLIC_BASE_URL` lines, before `pnpm turbo build --filter=web`.
- **Files:** `apps/web/lib/env.ts`, `apps/web/Dockerfile`
- **Verify:** `pnpm --filter web exec tsc --noEmit` (or `pnpm typecheck`) passes; `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_APP_VERSION=v1.2.3 -t applied-web-test .` succeeds locally if Docker is available.

#### 2.2. [x] Add a service to fetch the latest published release
- **What:** Add `packages/api/src/services/version.service.ts` exporting `getLatestReleaseVersion(): Promise<string | null>`. Fetches `https://api.github.com/repos/tonghohin/applied/releases/latest` with `Accept: application/vnd.github+json` and a `User-Agent` header (GitHub's API 403s without one), reads `tag_name` from the JSON body. Cache the result in a module-level variable with a ~30 minute TTL so repeated sidebar renders don't hit GitHub's unauthenticated rate limit (60 req/hour/IP) — this is safe because `apps/web` runs as a single long-lived Node process (`next start` standalone), not per-request serverless. On any fetch/parse error, fall back to the last successfully cached value, or `null` if there isn't one yet — this must never throw, since a stale/unreachable version check shouldn't break the sidebar.
- **Files:** `packages/api/src/services/version.service.ts` (new)
- **Verify:** Covered by the unit test in 2.4.

#### 2.3. [x] Expose it via tRPC
- **What:** Add `packages/api/src/routers/system.ts` with `systemRouter = router({ latestVersion: protectedProcedure.query(() => getLatestReleaseVersion()) })`. Register it in `packages/api/src/router.ts` as `system: systemRouter`.
- **Files:** `packages/api/src/routers/system.ts` (new), `packages/api/src/router.ts`
- **Verify:** Covered by the unit test in 2.4.

#### 2.4. [x] Unit tests
- **What:** `packages/api/src/services/version.test.ts` — mock global `fetch` (`vi.stubGlobal("fetch", ...)`); assert (a) it returns `tag_name` on success, (b) a second call within the TTL does not call `fetch` again, (c) on fetch failure it returns the previously cached value instead of throwing, (d) returns `null` (not a throw) if `fetch` fails before any successful call. `packages/api/src/routers/system.test.ts` — mirror `runs.test.ts`: mock the service, assert an authenticated caller gets the service's return value, and an unauthenticated caller gets `UNAUTHORIZED`.
- **Files:** `packages/api/src/services/version.test.ts` (new), `packages/api/src/routers/system.test.ts` (new)
- **Verify:** `pnpm --filter @repo/api exec vitest run`

---

### Phase 3: UI — sidebar indicator

#### 3.1. [x] Build the indicator component
- **What:** Add `apps/web/components/nav/app-version-indicator.tsx`, a client component modeled on `search-run-status-indicator.tsx`. Reads the running version from `env.NEXT_PUBLIC_APP_VERSION` (`@/lib/env`) and calls `trpc.system.latestVersion.useQuery(undefined, { staleTime: 30 * 60 * 1000 })`. Renders the version text (e.g. `v0.1.0`) in small muted text; when `latestVersion` is truthy and not equal to the running version, additionally render a small colored dot wrapped in the existing `Tooltip`/`TooltipTrigger`/`TooltipContent` pattern, with tooltip text like `New version available: {latestVersion} — run docker compose pull to update`. Version comparison is a plain string inequality (not semver range comparison) — sufficient since there's only ever one "latest release" to compare against.
- **Files:** `apps/web/components/nav/app-version-indicator.tsx` (new)
- **Verify:** Covered by manual check in 3.3 (no existing precedent for component tests in `apps/web` — none exist today, so none are added here).

#### 3.2. [x] Wire it into the sidebar header
- **What:** In `apps/web/components/nav/sidebar.tsx`, render `<AppVersionIndicator />` inside `SidebarHeader`, next to `AppliedIcon` and the "Applied" label.
- **Files:** `apps/web/components/nav/sidebar.tsx`
- **Verify:** Covered by manual check in 3.3.

#### 3.3. [x] Manual verification
- **What:** Run `pnpm turbo dev --filter=web`, sign in, confirm the version text renders next to the logo (will read "dev" locally since `NEXT_PUBLIC_APP_VERSION` isn't set outside Docker builds). Temporarily hardcode a different `latestVersion` value in the component (or stub the query response) to confirm the dot + tooltip render correctly, then revert. Also run `pnpm typecheck` and `pnpm lint` across the repo.
- **Files:** none (verification only)
- **Verify:** Dot appears only when versions differ; tooltip text is legible; no typecheck/lint errors.

---

## Notes

- **2026-09-17 — Revision:** Swapped release-please for semantic-release in Phase 1 (fully automatic releases, no manual Release PR merge). Cleared tasks 1.1 and the old 1.4 for rebuild under the new tool; added cleanup task 1.2 to delete the now-dead `version.txt`/`CHANGELOG.md`; task 1.3 (`docker.yml` reusable workflow) is unaffected.
- **This changes deploy cadence, by design.** Confirmed with the user: `:latest` currently moves on every push to `main`; after this change it only moves when a release is actually cut. Self-hosters following the README's `docker compose pull` will now always land on a released version instead of the latest commit.
- **semantic-release has no review gate — also by design.** Unlike release-please's Release PR, every qualifying commit (`feat:`/`fix:`) merged to `main` releases immediately in the same CI run: no PR to review, no chance to bundle multiple changes into one deliberate release before it ships. This was an explicit, informed tradeoff the user chose after being walked through how release-please's PR gate vs. semantic-release's fully-automatic flow differ.
- **Why chain `docker` as a job instead of a separate tag-triggered workflow:** tags created via the default `GITHUB_TOKEN` (which `@semantic-release/github` also uses) don't retrigger `on: push: tags` workflows — a well-known GitHub Actions limitation that normally requires a separate PAT/GitHub App token to work around. Chaining via `needs:`/`if: ${{ needs.release.outputs.release_created }}` inside the *same* workflow run sidesteps this entirely, at the cost of `docker.yml` no longer being independently push-triggered (task 1.3).
- **Verified against source, not guessed:** the "plain `pnpm exec semantic-release` shell step, no marketplace action" approach was confirmed by fetching `semantic-release/semantic-release`'s own dogfooded `.github/workflows/release.yml` directly — semantic-release's official docs recipes moved out of that repo's `docs/` folder (404s now) into a separate site, so the repo's own workflow was the more reliable source. The `@semantic-release/exec` `publishCmd` → `$GITHUB_OUTPUT` pattern was similarly confirmed against that plugin's current README rather than assumed.
- **Alternative considered and rejected:** `cycjimmy/semantic-release-action` (a third-party marketplace wrapper with built-in GitHub Actions outputs). Rejected once the semantic-release repo's own workflow showed the canonical/official pattern uses no wrapper at all — matching that keeps this repo's release mechanism as close to "upstream-documented" as possible, at the small cost of needing `@semantic-release/exec` to manually surface outputs.
- **Alternative considered and rejected:** keeping `@semantic-release/changelog` + `@semantic-release/git` for a committed `CHANGELOG.md`. Rejected per the user's explicit choice — it would require a bot commit back to `main` on every release (extra push permissions, `[skip ci]` handling to avoid loops) for a file nothing in this codebase reads.
- **GitHub REST API rate limit:** unauthenticated requests are capped at 60/hour per source IP. The 30-minute in-memory cache in `version.service.ts` keeps a single self-hosted instance far under that, but this assumption would break if `apps/web` were ever run as multiple replicas or on serverless (each cold start losing the cache) — out of scope for this self-hosted, single-container deployment model.
- **Alternative considered and rejected:** querying the GHCR registry manifest directly (anonymous token exchange + manifest inspection) instead of GitHub's Releases API. Rejected as unnecessarily complex now that real semver releases exist — the Releases API is a single unauthenticated call that returns exactly the tag to display.
- **Alternative considered and rejected:** keeping `:latest` as continuous-per-commit and adding semver tags as a parallel artifact. Rejected per the user's explicit choice — it would leave the "newer version available" cue comparing against unreleased commits instead of real releases.

## Completed

- **Date:** 2026-09-17
- **All tasks executed successfully:** yes
- **Files changed:**
  - `.github/workflows/release-please.yml` — deleted (superseded by `release.yml`)
  - `.github/workflows/release.yml` — new: `release` job runs `pnpm exec semantic-release` (config in `.releaserc.json`), exposing `release_created`/`tag_name` outputs via `@semantic-release/exec`'s `publishCmd` writing to `$GITHUB_OUTPUT`; a `docker` job gated on `release_created` calls the reusable `docker.yml` with the cut tag as `version`
  - `.releaserc.json` — new: `branches: ["main"]`, plugins `commit-analyzer` → `release-notes-generator` → `github` → `exec`
  - `package.json` (root) — added devDependencies: `semantic-release`, `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/github`, `@semantic-release/exec`
  - `version.txt`, `CHANGELOG.md` — deleted (release-please-era seed files; semantic-release reads git tag history directly, nothing reads these)
  - `.github/workflows/docker.yml` — converted `on: push` to `on: workflow_call` with a required `version` input; images now tagged `:latest` + `:vX.Y.Z` instead of `:latest` + bare SHA; `NEXT_PUBLIC_APP_VERSION` build-arg wired for the `applied-web` matrix entry only (unaffected by the release-please → semantic-release swap)
  - `apps/web/lib/env.ts` — added `NEXT_PUBLIC_APP_VERSION` (`z.string().default("dev")`)
  - `apps/web/Dockerfile` — added matching `ARG`/`ENV NEXT_PUBLIC_APP_VERSION` next to `NEXT_PUBLIC_BASE_URL`
  - `packages/api/src/services/version.service.ts` — new: fetches GitHub's latest release tag (Zod-validated), 30-min in-memory cache, never throws
  - `packages/api/src/routers/system.ts`, `packages/api/src/router.ts` — new `system.latestVersion` protected query
  - `packages/api/src/services/version.test.ts`, `packages/api/src/routers/system.test.ts` — new unit tests
  - `apps/web/components/nav/app-version-indicator.tsx` — new client component: a shadcn `Badge` (secondary, or warning + `RiDownloadCloud2Line` icon + tooltip when an update is available)
  - `apps/web/components/nav/sidebar.tsx` — wired `<AppVersionIndicator />` into `SidebarHeader`
- **How to test:**
  - `pnpm --filter @repo/api exec vitest run` — 52/52 passing
  - `pnpm typecheck` — clean, all 12 packages
  - `GITHUB_TOKEN=<dummy> pnpm exec semantic-release --dry-run --no-ci` from repo root — all 5 plugins resolve/load correctly; fails only at the (expected, dummy-token) GitHub auth check, confirming `.releaserc.json` itself is well-formed
  - `pnpm --filter web exec docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_APP_VERSION=v1.2.3 -t applied-web-test .` from repo root — succeeds
  - `pnpm turbo dev --filter=web`, sign in, confirm version badge next to the logo; verified live via Playwright against the running dev server (both the plain-badge "no update" state and the warning-badge "update available" state with working tooltip)
- **Follow-up items:**
  - **No review gate, by design:** every qualifying commit (`feat:`/`fix:`) merged to `main` now releases immediately in the same CI run — no Release PR to catch an unintended bump before it ships. Confirmed with the user as the explicit tradeoff of switching to semantic-release.
  - **Docs discrepancy worth knowing:** the plan's task 1.1 cited `@semantic-release/exec`'s README as documenting the `publishCmd` → `$GITHUB_OUTPUT` pattern. Checking the *actually-installed* v7.1.0 package's README, that specific `$GITHUB_OUTPUT` example is **not** literally present — the docs only confirm the general mechanism (a shell command with Lodash-templated access to `nextRelease.gitTag` etc., run during the publish step). Writing to `$GITHUB_OUTPUT` from that shell command is standard GitHub Actions practice, independent of this plugin, and the local dry-run confirms the config loads correctly — but this is a real end-to-end mechanism that has not yet been observed firing in an actual CI run.
  - `runs.test.ts`, `profile.service.ts`, `tsconfig.json`, and `apps/web/app/(dashboard)/settings/ai/page.tsx` have pre-existing `pnpm lint` failures unrelated to this feature (confirmed via `git status` — none are part of this diff).
  - `README.md` changed on disk during the original build session (removed a "no clone needed" note and the `BETTER_AUTH_SECRET`/`ENCRYPTION_KEY` security warning) — not made by this work; left untouched since it's outside this plan's scope, but worth double-checking that removal was intentional.
  - `actionlint` isn't installed locally; workflow YAML files were only validated via `python3 -c "import yaml; yaml.safe_load(...)"` plus manual read-through, not a full GitHub Actions schema check.
