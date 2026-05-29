# Review: shadcn Field Component Convention Audit

## Context

Auditing all forms in the codebase against the shadcn Field component documentation conventions. The doc specifies:
- `FieldDescription` goes **after** the control, not before it
- `FieldError` renders nothing when errors is empty — no conditional wrapper needed
- Work-type checkboxes/switches should use `Field orientation="horizontal"` + `FieldLabel`, not raw `<Label>`
- `FieldLabel` should be a direct child of `Field`, not wrapped in layout divs

## Issues Found

### 1. `cover-letter-form.tsx` — `FieldDescription` before the control (deviation from convention)

**File:** `apps/web/components/profile/cover-letter-form.tsx` (lines 51–63)

The `FieldDescription` is placed between `FieldLabel` and `<Textarea>`. Convention is:
```
Field > FieldLabel > Input/Textarea > FieldDescription > FieldError
```

**Fix:** Move `<FieldDescription>` to after the `<Textarea>`.

---

### 2. `criteria-form.tsx` — Three issues in the Locations section

**File:** `apps/web/components/profile/criteria-form.tsx`

#### 2a. Raw `<Label>` instead of `FieldLabel` for the "Locations" header (line 132)
The "Locations" label uses `import { Label } from "@/components/ui/label"` — a raw HTML label outside any `Field`. Should use `FieldLabel` (and remove the `Label` import if it becomes unused).

#### 2b. Work-type checkboxes use raw `<div>` + `<Label>` (lines 166–179)
Each work type (`on-site`, `remote`, `hybrid`) is rendered as a raw `<div>` with a `Checkbox` and `<Label>`. Should use `Field orientation="horizontal"` + `FieldLabel` per the doc's checkbox pattern.

#### 2c. Manual conditional around root-level `FieldError` (lines 186–188)
```tsx
{typeof errors.locations?.message === "string" && (
  <FieldError errors={[errors.locations]} />
)}
```
`FieldError` already renders nothing when the errors array has no messages — the manual conditional is not needed.

---

### 3. `linkedin-form.tsx` — `FieldDescription` conditionally rendered (minor)

**File:** `apps/web/components/profile/linkedin-form.tsx` (lines 74–76)

```tsx
{!errors.linkedinPassword && (
  <FieldDescription>For security, saved passwords are never shown.</FieldDescription>
)}
```

The doc shows `FieldDescription` as always-rendered helper text. CLAUDE.md says "no conditional wrapper needed" (specifically for `FieldError`). This conditional hides the description when there's an error — it's a UX choice but diverges from the declarative pattern. Fix: render `FieldDescription` unconditionally (it will coexist with `FieldError` beneath the input).

---

### 4. `sign-in/page.tsx` — `FieldLabel` wrapped in a layout `<div>` (minor)

**File:** `apps/web/app/(auth)/sign-in/page.tsx` (lines 73–80)

```tsx
<Field data-invalid={!!errors.password}>
  <div className="flex items-center justify-between">
    <FieldLabel htmlFor="password">Password</FieldLabel>
    <Link href="/forgot-password" ...>Forgot your password?</Link>
  </div>
  ...
```

The link and label are co-located inside a layout `<div>` nested under `Field`. The conventional structure has `FieldLabel` as a direct child of `Field`. Fix: move the "Forgot password?" `<Link>` outside the `Field`, placing it after the `Button` or in a separate row — or keep it in the div if the UI layout demands it (this is the lowest-priority issue).

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/components/profile/cover-letter-form.tsx` | Move `FieldDescription` to after `<Textarea>` |
| `apps/web/components/profile/criteria-form.tsx` | Replace `Label` with `FieldLabel`; replace checkbox `div+Label` with `Field orientation="horizontal"` + `FieldLabel`; remove manual conditional on root `FieldError` |
| `apps/web/components/profile/linkedin-form.tsx` | Remove `{!errors.linkedinPassword && ...}` conditional from `FieldDescription` |
| `apps/web/app/(auth)/sign-in/page.tsx` | Move `<Link>` for "Forgot password?" outside the `Field` wrapper (or restructure to avoid wrapping `FieldLabel` in a layout div) |

## Tasks

- [x] Fix `cover-letter-form.tsx`: move `FieldDescription` after the `<Textarea>`
- [x] Fix `criteria-form.tsx`: replace raw `<Label>` for "Locations" header with `FieldLabel` (inside a `Field` or standalone with correct styling)
- [x] Fix `criteria-form.tsx`: replace work-type `<div>` + `<Label>` with `Field orientation="horizontal"` + `FieldLabel` pattern
- [x] Fix `criteria-form.tsx`: remove manual conditional from root-level `FieldError`
- [x] Fix `linkedin-form.tsx`: render `FieldDescription` unconditionally
- [x] Fix `sign-in/page.tsx`: restructure password field so `FieldLabel` is a direct child of `Field`, placing the "Forgot password?" link elsewhere

## Verification

After changes:
- Run `pnpm typecheck` — all form files should type-check cleanly
- Run `pnpm lint` — Biome should not flag any new issues
- Visually verify each changed form in the browser (`pnpm dev`) — field layouts, error states, and helper text should still render correctly
