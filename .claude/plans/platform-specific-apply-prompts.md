# Plan: Platform-Specific Apply Agent Prompts

## Context

The current apply agent uses a single generic `SYSTEM_PROMPT` that blends LinkedIn Easy Apply instructions with vague guidance for external ATSes. This wastes steps (out of the 100-step limit) as the agent reads irrelevant instructions, and gives imprecise guidance for each platform's actual UX. The fix: detect the platform from `job.url` before calling `generateText` and supply a focused, platform-specific system prompt instead.

Platforms in scope (no account creation required):
- **LinkedIn** — Easy Apply modal wizard (may redirect to external ATS after clicking Apply)
- **Greenhouse** — `boards.greenhouse.io/*` single/multi-page form
- **Lever** — `jobs.lever.co/*` single-page form
- **Ashby** — `jobs.ashbyhq.com/*` single-page form
- **Generic** — fallback for unrecognised URLs

**Known limitation:** `detectPlatform` matches on known hostnames only. Companies using custom career-page domains (e.g. `careers.stripe.com` backed by Greenhouse) will fall through to `generic`. This is acceptable for now.

## Changes

### 1. `packages/db/src/queries/profiles.ts`

Add a `getProfileWithEmailForUser` query that joins `profiles` with `users` and returns `{ ...profile, email: string }`. The `users` table (Better Auth) has the `email` column; `profiles` does not. This is needed because Greenhouse, Lever, and Ashby all require an email address as a mandatory field.

Reuse existing imports: `profiles` from `../schema/profiles`, `users` from `../schema/auth`.

### 2. `packages/db/src/index.ts`

Export `getProfileWithEmailForUser` so it is available to `packages/ai`.

### 3. `packages/ai/src/agents/process-apply.ts`

Replace the `getProfileForUser` call with `getProfileWithEmailForUser`. The returned object now includes `email`; pass it through to `applyToJob` (which already receives the full profile object — no signature change needed there, since the email will live on the profile object itself).

### 4. `packages/ai/src/agents/apply-agent.ts`

#### a) Platform detection utility
```ts
type ApplyPlatform = "linkedin" | "greenhouse" | "lever" | "ashby" | "generic";

function detectPlatform(url: string): ApplyPlatform {
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("greenhouse.io")) return "greenhouse";
  if (url.includes("lever.co")) return "lever";
  if (url.includes("ashbyhq.com")) return "ashby";
  return "generic";
}
```

#### b) Shared `FORM_FILLING_RULES` constant (appended to every platform prompt)
- Use resume content for experience/skills/education questions
- Cover letter: write a personalised one per job if required; follow `COVER LETTER INSTRUCTIONS` if provided
- Work authorisation → assume Yes; sponsorship → assume No
- Unknown required fields → use a reasonable placeholder
- Resume PDF → upload only when a file upload field exists AND `resumePdfPath` is provided
- Respond with exactly `SUCCESS` or `FAILURE:<reason>`; nothing else

#### c) Platform-specific prompt constants

**`LINKEDIN_PROMPT`**
- Navigate to the LinkedIn job page
- If "Easy Apply" button: click → multi-step modal wizard → snapshot between steps → fill required fields → click Next/Review until final step → click "Submit application"
- If only "Apply" button: click → page redirects to an external ATS. After redirect, snapshot and apply the appropriate section below:
  - Greenhouse (`greenhouse.io`): fill name, email, phone, resume upload, LinkedIn URL, cover letter, custom questions; submit at bottom
  - Lever (`lever.co`): fill name, email, phone, current company, resume upload, LinkedIn URL, cover letter, custom questions; click Apply
  - Ashby (`ashbyhq.com`): fill personal info, resume upload, custom questions; click submit
  - Other: fill required fields only and submit
- CAPTCHA → `FAILURE:CAPTCHA detected`
- Append `FORM_FILLING_RULES`

**`GREENHOUSE_PROMPT`**
- Navigate directly to the Greenhouse page (`boards.greenhouse.io`)
- No login required — fill the form directly
- Typical field order: name, email, phone, resume upload, LinkedIn URL, website, cover letter textarea, custom questions at the bottom
- Fill required fields only — skip optional fields
- Do not snapshot after every keystroke — batch related fields and snapshot only when needed
- Snapshot before submitting to confirm required fields are filled; click the submit button at the bottom
- If account creation is required → `FAILURE:account creation required`
- Append `FORM_FILLING_RULES`

**`LEVER_PROMPT`**
- Navigate directly to the Lever job page (`jobs.lever.co`)
- No login required — single-page form
- Fields: full name, email, phone, current company, resume upload, LinkedIn URL, social links, cover letter textarea, custom questions
- Fill required fields only — skip optional fields
- Do not snapshot after every keystroke — batch related fields and snapshot only when needed
- Snapshot before clicking Apply to confirm fields
- If account creation is required → `FAILURE:account creation required`
- Append `FORM_FILLING_RULES`

**`ASHBY_PROMPT`**
- Navigate directly to the Ashby job page (`jobs.ashbyhq.com`)
- No login required — single-page form
- Fields: personal info (name, email, phone), resume upload, custom questions
- Fill required fields only — skip optional fields
- Do not snapshot after every keystroke — batch related fields and snapshot only when needed
- Snapshot before submitting to confirm required fields are filled; click submit
- If account creation is required → `FAILURE:account creation required`
- Append `FORM_FILLING_RULES`

**`GENERIC_PROMPT`**
- Navigate to the URL and snapshot to assess the form
- Fill required fields only; skip optional fields
- For multi-step forms, complete each step in sequence
- Do not snapshot after every keystroke — batch related fields and snapshot only when needed
- If account creation is required → `FAILURE:account creation required`
- If you reach a page that requires information you cannot supply (e.g. a work permit number, background check consent gate, or government ID) → `FAILURE:<specific blocker>`
- Append `FORM_FILLING_RULES`

#### d) Update `profileSummary` to include email
Add `Email: ${profile.email}` to the `profileSummary` string array in `applyToJob`. This is required by all non-LinkedIn platforms.

#### e) Wire up platform detection in `applyToJob`
Replace `system: SYSTEM_PROMPT` with:
```ts
const platform = detectPlatform(job.url);
log(`Platform detected: ${platform}`);
// ...
system: PROMPTS[platform],
```
The `log(...)` line is a permanent addition (useful for Langfuse tracing and worker logs).

Also update the existing `log("AI agent running (up to 100 steps)")` message to `log(\`AI agent running on ${platform}\`)`.

## Files to modify
- `packages/db/src/queries/profiles.ts` — add `getProfileWithEmailForUser`
- `packages/db/src/index.ts` — export the new query
- `packages/ai/src/agents/process-apply.ts` — swap to `getProfileWithEmailForUser`
- `packages/ai/src/agents/apply-agent.ts` — all prompt + detection changes

## Verification
1. `pnpm typecheck` — no new type errors
2. Manually trigger `applyJobs` with a LinkedIn Easy Apply job → confirm `SUCCESS` and worker log shows `Platform detected: linkedin`
3. Manually trigger with a Greenhouse or Lever URL → confirm log shows correct platform and the agent fills the email field
4. Unit test `detectPlatform` with representative URLs for each platform (including an unrecognised URL that should return `"generic"`)

## Notes

- **2026-05-29 — Revision:** Added email gap fix (getProfileWithEmailForUser join + profileSummary update); strengthened LinkedIn prompt with per-ATS redirect guidance; added custom-domain limitation note; clarified log line as permanent; expanded Files to modify.

## Completed

- **Date:** 2026-05-29
- **All tasks executed successfully:** yes
- **Files changed:**
  - `packages/db/src/queries/profiles.ts` — added `getProfileWithEmailForUser` (two parallel queries merged with spread)
  - `packages/ai/src/agents/process-apply.ts` — swapped `getProfileForUser` → `getProfileWithEmailForUser`
  - `packages/ai/src/agents/apply-agent.ts` — replaced single `SYSTEM_PROMPT` with `detectPlatform` + five platform-specific prompts (`LINKEDIN_PROMPT`, `GREENHOUSE_PROMPT`, `LEVER_PROMPT`, `ASHBY_PROMPT`, `GENERIC_PROMPT`) and shared `FORM_FILLING_RULES`; added `Email` to `profileSummary`; exported `ProfileWithEmail` type
  - `packages/ai/src/agents/apply-agent.test.ts` — updated `mockProfile` fixture to include `email`, updated `satisfies` annotation to `ProfileWithEmail`
- **How to test:** Trigger `applyJobs` for a LinkedIn job and confirm worker log shows `Platform detected: linkedin`. Trigger with a Greenhouse/Lever URL and confirm the correct platform is logged and the email field is filled.
- **Follow-up items:** `detectPlatform` does not catch custom-domain ATS instances (e.g. `careers.stripe.com`); these fall through to `generic`.
