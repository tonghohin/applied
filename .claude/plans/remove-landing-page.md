# Plan: Remove Landing Page

> Delete the marketing landing page at `/` and everything only it uses; `/` becomes a redirect to `/jobs`.

## Research Summary

- **Stack:** Next.js 16 App Router (Turbopack), TypeScript, Tailwind, shadcn/base-ui, pnpm + Turborepo, Biome
- **Relevant patterns:** `apps/web/proxy.ts` already guards `/dashboard`, `/jobs`, `/runs`, `/settings` and redirects signed-out users to `/sign-in`; signed-in users on `/sign-in` or `/sign-up` go to `/jobs`. So `/` → `/jobs` covers both cases with no auth logic in the page.
- **Key files:**
  - `apps/web/app/page.tsx` — the landing page (rewrite to a redirect)
  - `apps/web/components/landing/landing-nav.tsx`, `apps/web/components/landing/scroll-reveal.tsx` — landing-only
  - `apps/web/components/ui/container.tsx`, `apps/web/components/ui/kicker.tsx` — only imported by the landing page/nav
  - `apps/web/package.json` — `motion` dependency, only used by `scroll-reveal.tsx`
  - `apps/web/components/applied-logo.tsx`, `README.md` — still use the lockup/icon SVGs (keep them)
- **New dependencies:** none (removes `motion`)
- **Risks/Considerations:**
  - Verified with `git grep` (tracked files only): nothing outside `app/page.tsx` and `components/landing/` imports `Container`, `Kicker`, `Reveal` or `LandingNav`.
  - `public/lockup.svg`, `lockup-on-dark.svg` and `icon.svg` are **kept** — `applied-logo.tsx` and the README reference them. All other files in `public/` are referenced by `app/layout.tsx` metadata.
  - `motion` appears only in `apps/web/package.json` and `scroll-reveal.tsx`, so it can be dropped. This touches `pnpm-lock.yaml`.
  - The footer links to `/privacy`, `/terms`, `/contact` never had pages, so deleting the footer removes dead links and needs no route cleanup.
  - Working tree is clean and there are no in-flight changes to these files (last touched by `2cdbf88`).

## Tasks

### Phase 1: Remove landing page

#### 1.1. [x] Replace the root page with a redirect
- **What:** Rewrite `apps/web/app/page.tsx` to a server component that calls `redirect("/jobs")` from `next/navigation`. The proxy handles signed-out users.
- **Files:** `apps/web/app/page.tsx`
- **Verify:** With `pnpm turbo dev --filter=web`, `curl -sI http://localhost:3000/` returns a redirect (307) with `location: /jobs`. In a private window (signed out), opening `/` ends up on `/sign-in`.

#### 1.2. [x] Delete landing-only components
- **What:** Delete `components/landing/` (both files), `components/ui/kicker.tsx` and `components/ui/container.tsx`. Re-run `git grep -nE "ui/container|ui/kicker|components/landing"` first to confirm nothing else imports them.
- **Files:** `apps/web/components/landing/landing-nav.tsx`, `apps/web/components/landing/scroll-reveal.tsx`, `apps/web/components/ui/kicker.tsx`, `apps/web/components/ui/container.tsx`
- **Verify:** `pnpm typecheck` passes (no dangling imports).

#### 1.3. [x] Drop the unused `motion` dependency
- **What:** Remove `motion` from `apps/web` with `pnpm --filter web remove motion` so `pnpm-lock.yaml` updates too. Confirm with `git grep -n "motion" -- 'apps/*' 'packages/*'` that nothing else references it.
- **Files:** `apps/web/package.json`, `pnpm-lock.yaml`
- **Verify:** `pnpm install --frozen-lockfile` succeeds and `pnpm typecheck` still passes.

#### 1.4. [x] Full check and single commit
- **What:** Run lint, typecheck and the web build to confirm nothing broke, then commit everything together.
- **Files:** none
- **Verify:** `pnpm lint`, `pnpm typecheck` and `pnpm turbo build --filter=web` all pass. `git status` shows only the deletions, the rewritten `page.tsx`, and the `package.json` / `pnpm-lock.yaml` changes. Commit message: `refactor: remove landing page`.

## Notes

- **No new tests.** The redirect is trivial glue and there are no existing tests for the landing page. Verification is the typecheck/lint/build plus the manual redirect check in 1.1.
- **README unchanged** (per decision). The landing copy (hero, Scrape → Score → Apply, features) is only preserved in git history.
- **Left alone on purpose, decide separately:** `apps/web/app/layout.tsx` metadata is not landing-only (it applies to every page), but it still carries landing-era branding: title "Applied — Stop applying. Start arriving.", the OG description, `metadataBase: new URL("https://applied.cv")`, and `og-image.png`. For a self-hosted tool the hardcoded `applied.cv` base URL is the one most worth revisiting, since it's wrong on anyone else's instance. That's a follow-up, not part of this plan.

## Completed

- **Date:** 2026-09-18
- **All tasks executed successfully:** yes
- **Files changed:**
  - `apps/web/app/page.tsx` — replaced the landing page with `redirect("/jobs")`
  - `apps/web/components/landing/landing-nav.tsx`, `apps/web/components/landing/scroll-reveal.tsx` — deleted
  - `apps/web/components/ui/kicker.tsx`, `apps/web/components/ui/container.tsx` — deleted (only the landing page used them)
  - `apps/web/package.json`, `pnpm-lock.yaml` — removed the unused `motion` dependency
- **How to test:** `curl -sI http://localhost:3000/` returns 307 with `location: /jobs`; signed out, `/jobs` then redirects to `/sign-in`. `pnpm lint`, `pnpm typecheck` and `pnpm turbo build --filter=web` pass.
- **Follow-up items:** `apps/web/app/layout.tsx` metadata still carries landing-era branding (title/OG tagline, hardcoded `metadataBase` of `https://applied.cv`, `og-image.png`). The `applied.cv` base URL would be wrong on other people's instances.
