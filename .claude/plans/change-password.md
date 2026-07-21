# Plan: Change Password

> Lets a signed-in user change their account password from a new "Security" settings page.

## Research Summary

- **Stack:** Next.js 16 App Router, Better Auth (email/password), TypeScript, react-hook-form + Zod, shadcn/ui, Sonner toasts.
- **Relevant patterns:**
  - `apps/web/lib/auth-client.ts` — `authClient` (Better Auth client, no plugins needed for this feature). Better Auth's built-in `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })` endpoint (`/api/auth/change-password`) already exists server-side — **no new tRPC procedure or DB work needed**.
  - `apps/web/app/(auth)/sign-up/page.tsx` — existing strong-password Zod schema (min 8, upper/lower/number/special char) and the `{ error } = await authClient.X(...)` error-handling pattern to mirror.
  - `apps/web/components/settings/linkedin-form.tsx` — form pattern to mirror for a settings-page form: `Field`/`FieldLabel`/`FieldError`/`FieldDescription`, `PasswordInput`, Sonner toasts on success/failure, `useForm` + `zodResolver`.
  - `apps/web/components/ui/password-input.tsx` — reusable show/hide password input, already used by sign-up and LinkedIn credentials forms.
  - `apps/web/app/(dashboard)/settings/personal/page.tsx` — pattern for a settings page: server component, `getSession()` + redirect guard, wraps a client form in `PageLayout`.
  - `apps/web/components/nav/sidebar.tsx` — `SETTINGS_LINKS` array drives the settings sub-nav; add an entry here.
- **Key files:**
  - `apps/web/components/nav/sidebar.tsx` (nav link)
  - `apps/web/app/(dashboard)/settings/security/page.tsx` (new page)
  - `apps/web/components/settings/change-password-form.tsx` (new form)
  - `apps/web/app/(auth)/sign-up/page.tsx` (password schema to reuse/extract)
- **New dependencies:** none.
- **Risks/Considerations:**
  - **CLAUDE.md drift:** the architecture doc says auth uses "Google OAuth," but `packages/api/src/auth.ts` only configures `emailAndPassword: { enabled: true, minPasswordLength: 8 }` — there is no `socialProviders`/Google config anywhere in the repo (verified via grep). Every account therefore has a password already; there is no OAuth-only-account edge case to design around. Worth a one-line CLAUDE.md fix, called out as an optional task below.
  - Better Auth's `changePassword` throws `INVALID_PASSWORD` (wrong current password) and `PASSWORD_TOO_SHORT` error codes — the form should map these to friendly messages rather than a generic toast, matching how `sign-up/page.tsx` maps `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`.
  - Per user decision, `revokeOtherSessions: true` is always passed — other devices get logged out; the current session/device stays authenticated (Better Auth reissues a session token for the current device automatically).
  - Out of scope: logged-out "forgot password" (email reset link) flow — no email-sending infrastructure (Resend/nodemailer/etc.) exists in the codebase yet; that would be a separate, larger feature.
  - Out of scope: OAuth/social sign-in accounts, since none exist in this app.

## Tasks

### Phase 1: Change Password Feature

#### 1.1. [x] Add "Security" settings page
- **What:** Create `apps/web/app/(dashboard)/settings/security/page.tsx` as a server component: get session via `getSession()`, redirect to `/sign-in` if absent, render `<PageLayout title="Security" section="Settings"><ChangePasswordForm /></PageLayout>`. No profile data fetch needed — this page doesn't touch the `profiles` table.
- **Files:** `apps/web/app/(dashboard)/settings/security/page.tsx`
- **Verify:** `pnpm turbo dev --filter=web`, navigate to `/settings/security` while signed in — page renders without redirect.

#### 1.2. [x] Add sidebar nav entry
- **What:** Add `{ href: "/settings/security", label: "Security" }` to `SETTINGS_LINKS` in `apps/web/components/nav/sidebar.tsx`, placed after "Personal info" (before Documents/Job search/LinkedIn/AI, since it's account-level like Personal info).
- **Files:** `apps/web/components/nav/sidebar.tsx`
- **Verify:** Sidebar shows "Security" under the Settings collapsible; clicking it navigates to `/settings/security` and highlights as active.

#### 1.3. [x] Build `ChangePasswordForm`
- **What:** Client component with `currentPassword`, `newPassword`, `confirmPassword` fields using `Field`/`FieldLabel`/`PasswordInput`/`FieldError` (mirroring `linkedin-form.tsx`). Zod schema: `currentPassword` = `z.string().min(1, "Required")`; `newPassword` reuses the same strength rules as `sign-up/page.tsx` (min 8, upper/lower/number/special char); `confirmPassword` validated via `.refine()` to match `newPassword`, with the error attached to the `confirmPassword` path. On submit, call `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`. On `{ error }`: map `error.code === "INVALID_PASSWORD"` → `"Current password is incorrect"`, `error.code === "PASSWORD_TOO_SHORT"` → `"New password is too short"`, else fall back to `error.message ?? "Failed to change password"` — `toast.error(message)`. On success: `toast.success("Password changed. You've been signed out of other devices.")` and reset the form (clear all three fields so the old password isn't left in the DOM).
- **Files:** `apps/web/components/settings/change-password-form.tsx`
- **Verify:** Manually in-browser: (a) wrong current password shows "Current password is incorrect"; (b) mismatched confirm shows inline field error and does not submit; (c) weak new password shows the same inline strength errors as sign-up; (d) correct current password + valid new password shows success toast, form clears, and re-signing-in with the new password works.

#### 1.4. Wire the new page to the form
- **What:** Import `ChangePasswordForm` into `settings/security/page.tsx` (done as part of 1.1, listed separately here only if 1.1's page shell is built before the form exists — otherwise fold into 1.1).
- **Files:** `apps/web/app/(dashboard)/settings/security/page.tsx`
- **Verify:** Covered by 1.1's verify step once 1.3 is complete.

#### 1.5. [x] Verify session revocation end-to-end
- **What:** No code — a manual verification task. Sign in on two browsers/profiles (or one normal + one incognito) as the same user. Change the password from browser A. Confirm browser B's session is invalidated on its next request (redirected to `/sign-in`), while browser A remains signed in.
- **Files:** none
- **Verify:** Browser B gets redirected to sign-in after the change; browser A stays on `/settings/security`.

### Phase 2: Cleanup (optional)

#### 2.1. Fix CLAUDE.md auth description
- **What:** `CLAUDE.md`'s "### Auth" section currently says "Better Auth with Google OAuth" — update it to reflect that only `emailAndPassword` is configured (no `socialProviders` exist in `packages/api/src/auth.ts`), so future planning sessions don't design around a nonexistent OAuth path.
- **Files:** `CLAUDE.md`
- **Verify:** Read the updated section back; confirm it matches `packages/api/src/auth.ts`.

## Notes

- No DB migration, no tRPC router changes, no new env vars — this feature rides entirely on Better Auth's existing `change-password` endpoint.
- Extracting the password-strength Zod schema (currently only in `sign-up/page.tsx`) into a shared constant is tempting but not required — task 1.3 can inline a copy. Only extract if the builder notices it'd otherwise diverge; don't force a shared-utils file for two call sites.
- Per user decision during planning: a "forgot password" (logged-out, email-based) flow is explicitly out of scope for this plan since no email infrastructure exists yet. If that's wanted later, it needs its own plan covering an email provider, `sendResetPassword` in `packages/api/src/auth.ts`, and `/forgot-password` + `/reset-password` pages.
- Per user correction during planning: this app has no Google OAuth / social sign-in configured despite what CLAUDE.md says, so there's no "user has no password" edge case to design around — every account went through `emailAndPassword` sign-up.
