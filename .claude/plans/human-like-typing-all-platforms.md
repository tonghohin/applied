# Plan: Human-like typing on all ATS apply prompts

> Extend the LinkedIn-only per-keystroke typing simulation to BambooHR, Greenhouse, Lever, Ashby, and the generic apply prompt, without reintroducing the async pre-fill race that atomic `fill()` was chosen to avoid.

## Research Summary

- **Stack:** TypeScript monorepo (Turborepo + pnpm). `packages/ai` holds the Gemini-driven apply agent; prompts are plain template-string constants consumed by `generateText` (AI SDK) via `instructions:`.
- **Relevant patterns:**
  - `packages/ai/src/agents/apply-agent.ts` — one prompt constant per platform (`LINKEDIN_PROMPT`, `GREENHOUSE_PROMPT`, `LEVER_PROMPT`, `ASHBY_PROMPT`, `BAMBOOHR_PROMPT`, `GENERIC_PROMPT`), each `${FORM_FILLING_RULES}`-suffixed. `detectPlatform(job.url)` picks the prompt via `PROMPTS[platform]`.
  - `packages/ai/src/mcp.ts` — wires `@playwright/mcp`'s tool server into a stealth-launched Playwright context (`launchStealthBrowser`, `stealthContextOptions`, `stealthPatch` from `packages/automation/src/stealth.ts`). `browser_press_sequentially` and `browser_type` are both real, allowed MCP tools (`ALLOWED_TOOL_NAMES` at apply-agent.ts:250) — `browser_press_sequentially` dispatches real per-character keyboard events (Playwright's `pressSequentially()`), `browser_type` without `slowly` uses `locator.fill()` (atomic, no keyboard events).
  - `.claude/plans/anti-bot-detection.md` (prior plan, partially completed) explicitly notes at line 220 that apply-agent typing was "instantaneous... no clean fix without forking @playwright/mcp" and assumed "third-party ATS platforms typically have less sophisticated typing-pattern detection than LinkedIn itself." That assumption is now known to be wrong (BambooHR just triggered a captcha) — this plan corrects it, and the "no clean fix" note is stale: the LinkedIn-only override already proves `browser_press_sequentially` works today.
  - Lever's prompt already has a "settle" pattern to defend against async pre-fill: wait `time:3` + take a fresh snapshot before filling, because Lever's LinkedIn integration pre-fills name/email/phone asynchronously after page load. No other non-LinkedIn platform prompt has this.
- **Key files:**
  - `packages/ai/src/agents/apply-agent.ts` (all prompt constants + `FORM_FILLING_RULES`)
  - `packages/ai/src/agents/apply-agent.test.ts` (mocks `generateText` entirely — prompt *content* is not unit-tested here; confirmed no existing test asserts on prompt string contents)
- **New dependencies:** none — `browser_press_sequentially` and `browser_press_key` are already in `ALLOWED_TOOL_NAMES`.
- **Risks/Considerations:**
  - **Timeout budget:** each tool call has a 30s ceiling (`timeout: { toolMs: 30_000 }` at apply-agent.ts:317). At `delay:80`ms/char, a field over ~370 characters would blow the per-call timeout. Open-ended answers are instructed to stay to "2-4 sentences" (FORM_FILLING_RULES) which is normally safe, but cover letters (via `generate_cover_letter`) can run longer — flag this explicitly in the rule so the agent knows to chunk or fall back, rather than silently timing out.
  - **Race reintroduction:** slow-typing takes longer per field, which widens the window for async pre-fill/React re-renders to interfere mid-type. The user chose "settle-then-type" as the primary mitigation — add an explicit wait-and-fresh-snapshot step before filling begins on every platform (generalizing Lever's existing pattern), rather than a verify-and-retry loop per field.
  - **Where the rule lives:** the text field procedure is currently only in the shared `FORM_FILLING_RULES`, with LinkedIn overriding it in `LINKEDIN_PROMPT`. Moving the slow-typing behavior into `FORM_FILLING_RULES` itself (as the one default for every platform) removes the LinkedIn-only override entirely instead of duplicating it five times — simpler and matches "extend to all platforms."

## Tasks

### Phase 1: Consolidate slow typing as the shared default

#### 1.1. [x] Rewrite the shared text field procedure to use simulated keystrokes
- **What:** In `FORM_FILLING_RULES` (`apply-agent.ts`, the "Text field procedure" bullet, currently lines 50–54), replace the `browser_type` (no `slowly`) / `fill()` instruction with: hover → click to focus → `browser_press_key` with `"Control+a"` to select any existing content → `browser_press_sequentially` with `delay:80` to type the value. Keep steps 1–2 unchanged (read current value from snapshot; skip entirely if already correct — this remains the first line of defense against re-typing over pre-filled data). Add a line noting the 30s per-tool-call ceiling and instructing the agent to keep typed values reasonably short (it already keeps open-ended answers to 2–4 sentences; call out that longer cover-letter text should be checked against this budget).
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** Read the updated `FORM_FILLING_RULES` string and confirm no reference to plain `browser_type`/`fill()` remains as the default text-entry path.

#### 1.2. [x] Remove the now-redundant LinkedIn-only override
- **What:** Delete the "Easy Apply text field override" bullet from `LINKEDIN_PROMPT` (currently line 122) — the shared rule now covers it. Leave the rest of the LinkedIn-specific instructions (dialog scoping, modal wizard steps, Follow-checkbox handling) untouched.
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** Confirm `LINKEDIN_PROMPT` no longer mentions `browser_press_sequentially` directly (it's inherited from `FORM_FILLING_RULES`) and reads coherently standalone.
- **Note:** Found a second, undocumented override while re-reading the file: `LINKEDIN_PROMPT`'s step 3 (external-ATS-redirect handling) had its own Lever-specific bullet pinning to "browser_type WITHOUT slowly (uses fill(), atomic clear+set, no doubling)" — same category of stale override, not called out in the original plan. Removed that clause too so the Lever-via-LinkedIn-redirect path also falls through to the shared `FORM_FILLING_RULES` default.

### Phase 2: Settle-then-type — guard against async pre-fill races

#### 2.1. [x] Add a wait-and-fresh-snapshot step before filling begins, on every platform prompt that lacks one
- **What:** Mirror Lever's existing pattern (`browser_wait_for` `time:3` + fresh snapshot before filling any fields) in `GREENHOUSE_PROMPT`, `ASHBY_PROMPT`, and `BAMBOOHR_PROMPT` — insert it as an early instruction step, before "fill required fields," so any async pre-fill (saved profile data, OAuth autofill, etc.) resolves before the agent reads field values and starts typing. Use the same `time:3` wait Lever uses for consistency unless a platform's existing instructions imply a different load pattern.
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** Each of `GREENHOUSE_PROMPT`, `ASHBY_PROMPT`, `BAMBOOHR_PROMPT` contains an explicit wait + fresh-snapshot instruction before the "fill fields" step, worded consistently with Lever's.

#### 2.2. [x] Extend the settle pattern to multi-step transitions in the generic prompt
- **What:** `GENERIC_PROMPT` already instructs "for multi-step forms, complete each step in sequence" — add that after advancing to a new step (clicking Next/Continue), the agent should wait briefly and take a fresh snapshot before filling that step's fields, same rationale as 2.1 but applied per-step rather than once at page load.
- **Files:** `packages/ai/src/agents/apply-agent.ts`
- **Verify:** `GENERIC_PROMPT` explicitly calls out the settle wait on each step transition, not just once at the start.

### Phase 3: Live verification

#### 3.1. [ ] (skipped — see Completed) Live apply run against a real BambooHR posting
- **What:** Run the apply pipeline (via the worker, or `applyToJob` directly against a real BambooHR job URL you have access to) and watch the `log()` step output. Confirm: text fields are filled via `browser_press_key` (Control+a) + `browser_press_sequentially` rather than `browser_type`; no field ends up with doubled/garbled text from a pre-fill race; the application submits successfully with no captcha/spam challenge.
- **Files:** none (manual run against `packages/ai/src/agents/apply-agent.ts` as modified)
- **Verify:** Application reaches a confirmed success state (`output.success: true`, URL redirected to a thank-you/confirmation page per the agent's own verification rules) with no CAPTCHA in the logs.

#### 3.2. [ ] (skipped — see Completed) Live apply run against a second updated platform (Greenhouse, Lever, or Ashby)
- **What:** Repeat 3.1 against a job on one of the other newly-updated platforms to confirm the settle-then-type change didn't regress existing behavior (especially Lever, whose async pre-fill this change is specifically designed to coexist with) and stayed within the step budget (`isStepCount(150)`) and per-tool timeout (`toolMs: 30_000`).
- **Files:** none
- **Verify:** Application completes successfully; no field shows duplicated/raced text; no tool-call timeout in the logs.

## Notes

- This intentionally does not touch `packages/automation/src/stealth.ts`, `packages/ai/src/mcp.ts`, or click/hover timing (`time:1500` between checkboxes, `time:600` after each field) — those were addressed by the prior `anti-bot-detection.md` plan and are out of scope here. Only the *typing mechanism* and the *pre-fill settle timing* change.
- Considered but not chosen: per-field verify-and-fallback (slow-type, snapshot to check the result, fall back to atomic `fill()` on mismatch). The user explicitly picked settle-then-type as the primary/only guard for simplicity; if live testing in Phase 3 turns up races the wait doesn't cover, that fallback is the natural next step.
- The `.claude/plans/anti-bot-detection.md` note claiming "no clean fix without forking @playwright/mcp" for form typing is now stale/incorrect and worth a follow-up correction in that file once this plan lands, so future readers aren't misled by it.
- No unit tests are added — `apply-agent.test.ts` mocks `generateText` entirely and doesn't assert on prompt string contents (confirmed during research), and prompt-text correctness genuinely can't be verified by a unit test; live verification (Phase 3) is the only real signal here, per the user's explicit choice.

## Completed

- **Date:** 2026-07-28
- **All tasks executed successfully:** Partial — Phases 1–2 (the actual code change) are done and verified; Phase 3 (live verification) was explicitly skipped at the user's request without being run.
- **Files changed:**
  - `packages/ai/src/agents/apply-agent.ts` — shared `FORM_FILLING_RULES` text field procedure now uses `browser_press_key("Control+a")` + `browser_press_sequentially(delay:80)` (real per-keystroke events) instead of atomic `browser_type`/`fill()`, with a note on the 30s per-tool-call timeout budget. Removed the now-redundant LinkedIn-only "Easy Apply text field override," plus a second undocumented Lever-specific `browser_type` override buried in `LINKEDIN_PROMPT`'s external-ATS-redirect handling that wasn't called out in the original plan. Added a `browser_wait_for time:3` + fresh-snapshot "settle" step before filling begins to `GREENHOUSE_PROMPT`, `ASHBY_PROMPT`, and `BAMBOOHR_PROMPT` (matching Lever's existing pattern), and to `GENERIC_PROMPT` both at initial load and after every multi-step transition.
- **How to test:**
  - Automated: `pnpm --filter @repo/ai exec vitest run` (11/11 pass), `pnpm test` (full suite, 12/12 tasks pass), `pnpm typecheck` (clean), `pnpm exec biome check packages/ai/src/agents/apply-agent.ts` (clean).
  - Manual (not yet run): trigger a real apply job against a BambooHR posting (and one other updated platform) and watch worker logs for `browser_press_key`/`browser_press_sequentially` calls, no doubled field values, and a successful submission with no captcha.
- **Follow-up items:**
  - **Phase 3 live verification was never run.** This change has not been confirmed against a real BambooHR captcha in practice — the fix is plausible (grounded in the LinkedIn override already working) but unproven. Recommend running it before relying on this for real applications.
  - The `.claude/plans/anti-bot-detection.md` note claiming "no clean fix without forking @playwright/mcp" for form typing is now stale and should be corrected/removed there.
  - If live testing later turns up races the settle-wait doesn't fully cover, the verify-and-fallback approach considered and rejected in Notes above is the natural next step.
