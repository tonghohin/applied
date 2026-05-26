# Plan: Dark Mode

> Add system-aware dark mode with a manual toggle in the site footer, using next-themes for SSR-safe theme switching.

## Research Summary

- **Stack:** Next.js App Router, TypeScript, Tailwind CSS v4, shadcn/ui (base-ui), `next-themes` (new dependency)
- **Relevant patterns:** Root layout wraps providers in `TRPCProvider` → `TooltipProvider`; all UI components use CSS custom properties; `cn()` from `lib/utils.ts` for class merging
- **Key files:**
  - `apps/web/app/globals.css` — `.dark` CSS variables already fully defined; just need `.dark` applied to `<html>`
  - `apps/web/app/layout.tsx` — root layout; wrap with `ThemeProvider`, add `suppressHydrationWarning` to `<html>`, add `<Footer />`
  - `apps/web/components/nav/sidebar.tsx` — reference for icon/button patterns (`@remixicon/react`)
  - `apps/web/components/ui/button.tsx` — Button component to reuse in toggle
- **New dependencies:** `next-themes`
- **Risks/Considerations:**
  - FOUC (flash of unstyled/wrong theme) — `next-themes` handles this via an inline script injected before render; `suppressHydrationWarning` on `<html>` is required to silence React's hydration mismatch warning
  - Footer in root layout is visible on auth pages (sign-in/sign-up) and the landing page as well as dashboard pages — acceptable, keeps implementation simple
  - Dashboard layout uses `SidebarProvider`; the root-layout footer will appear below the sidebar+content block. The sidebar is not fixed/sticky by default in the shadcn system so the footer flows naturally below it

## Tasks

### Phase 1: Theme Provider

#### 1.1. [x] Install next-themes
- **What:** Add `next-themes` to `apps/web` dependencies.
- **Files:** `apps/web/package.json` (via `pnpm add next-themes --filter web`)
- **Verify:** `pnpm --filter web exec tsc --noEmit` passes; `next-themes` appears in `apps/web/package.json` dependencies.

#### 1.2. [x] Create ThemeProvider wrapper component
- **What:** Create a thin client component `apps/web/components/theme/theme-provider.tsx` that re-exports `next-themes`'s `ThemeProvider` pre-configured with `attribute="class"` (applies `dark` class to `<html>`), `defaultTheme="system"`, and `enableSystem`. This wrapper exists so we can set defaults once rather than repeating props everywhere.
- **Files:** `apps/web/components/theme/theme-provider.tsx` (new)
- **Verify:** File imports and re-exports without TypeScript errors.

#### 1.3. [x] Update root layout to use ThemeProvider
- **What:** In `apps/web/app/layout.tsx`, wrap the existing provider tree with `<ThemeProvider>`. Add `suppressHydrationWarning` to `<html>` to silence React hydration mismatch (next-themes modifies the class server→client). The `ThemeProvider` should be the outermost wrapper inside `<body>`.
- **Files:** `apps/web/app/layout.tsx`
- **Verify:** Dev server starts without errors; opening the app does not produce a hydration warning in the browser console.

### Phase 2: Theme Toggle + Footer

#### 2.1. [x] Create ThemeToggle component
- **What:** Create `apps/web/components/theme/theme-toggle.tsx` — a client component using `useTheme()` from `next-themes`. The button cycles through three states: `system` → `light` → `dark` → `system`. Show an appropriate Remix icon for each state: `RiComputerLine` (system), `RiSunLine` (light), `RiMoonLine` (dark). Use the existing `Button` component with a ghost/icon variant. Add a tooltip via the existing `Tooltip` component showing the current theme label ("System", "Light", "Dark").
- **Files:** `apps/web/components/theme/theme-toggle.tsx` (new)
- **Verify:** Clicking the button cycles icons; the `.dark` class toggles on `<html>` in DevTools; page colors switch correctly.

#### 2.2. [x] Create Footer component
- **What:** Create `apps/web/components/footer.tsx`. Layout: full-width, `border-t bg-background` container. Inside: a single flex row with `justify-between items-center` padding. Left side: `© 2026 Applied` in `text-sm text-muted-foreground`. Right side: `<ThemeToggle />`. This satisfies the user's requirement of the control at bottom-right without the footer looking blank.
- **Files:** `apps/web/components/footer.tsx` (new)
- **Verify:** Footer renders with correct layout at the bottom of every page.

#### 2.3. [x] Add Footer to root layout
- **What:** Import and render `<Footer />` inside `<body>` in `apps/web/app/layout.tsx`, after the `{children}` / `<Toaster>` block. Because the body is already `flex flex-col min-h-full`, adding `mt-auto` to the footer (or wrapping content in `flex-1`) will pin the footer to the bottom of the viewport on short pages.
- **Files:** `apps/web/app/layout.tsx`
- **Verify:** Footer appears at bottom of the sign-in page (short page); footer appears below the dashboard content when scrolled; theme toggle works on every page.

## Completed

- **Date:** 2026-05-25
- **All tasks executed successfully:** yes
- **Files changed:**
  - `apps/web/package.json` — added `next-themes` dependency
  - `apps/web/components/theme/theme-provider.tsx` — new ThemeProvider wrapper (attribute="class", defaultTheme="system", enableSystem)
  - `apps/web/components/theme/theme-toggle.tsx` — new ThemeToggle cycling system→light→dark with Remix icons and tooltip
  - `apps/web/components/footer.tsx` — new Footer with copyright left, ThemeToggle right
  - `apps/web/app/layout.tsx` — wrapped body with ThemeProvider, added suppressHydrationWarning to html, rendered Footer below children
- **How to test:** `pnpm dev`, open http://localhost:3000, check footer at the bottom — toggle cycles Sun/Moon/Computer icons and switches the page between light and dark. Refresh to confirm localStorage persistence. Change OS dark mode setting to verify system default.
- **Follow-up items:** Pre-existing Biome lint failures in other packages (@repo/shared, @repo/worker, @repo/automation, @repo/api, @repo/web non-dark-mode files) are unrelated to this feature.

## Notes

- **No tests needed:** This feature is purely presentational (CSS class toggle + localStorage). There's no business logic, data, or API surface to unit-test.
- **`suppressHydrationWarning` scope:** Add it only to `<html>`, not to `<body>` or children — it suppresses the attribute mismatch next-themes introduces for that element only.
- **Tailwind v4 note:** Dark mode in Tailwind v4 with CSS custom properties works via the `.dark` class on any ancestor (default: `html`). No changes to `globals.css` or Tailwind config are needed — the `.dark { ... }` block is already defined.
- **next-themes version:** Use the latest stable release; it supports Next.js App Router natively.
