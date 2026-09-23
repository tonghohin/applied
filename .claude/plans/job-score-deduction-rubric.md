# Plan: Job Score Deduction Rubric

> Replace the weighted 0–100 scoring prompt with a strict deduct-from-100 rubric: the model extracts facts about the job/resume match, and code applies a fixed deduction table to compute the score.

## Research Summary

- **Stack:** Turborepo monorepo, `packages/ai` (AI SDK v7 `generateText` + `Output.object`, Zod v4, Gemini 2.5 Flash Lite via `createGateway`), Vitest with `vi.mock("ai", ...)`.
- **Relevant patterns:**
  - `scoreJob()` in `packages/ai/src/agents/score-job.ts` currently asks the model to compute a weighted score (skills 40 / seniority 20 / role+industry 20 / salary 10 / work auth 10) and returns `{ score, reasoning }`. The model does the arithmetic and the salary/years comparisons.
  - Callers only depend on the return shape `{ score: number; reasoning: string }`: `apps/worker/src/workers/search.worker.ts` (builds the `scorer` callback, passes `minSalary` and `requiresSponsorship`) → `packages/automation/src/search.ts` (`scoreJob` callback type). **None of these change.**
  - `score` (int) and `scoreReasoning` (text) already exist on `jobs`. No schema/migration changes.
  - The strong-match threshold (`>= 70`) is hardcoded in `apps/web/components/dashboard/stat-cards.tsx:26`. The new blocker cap must stay below it, so the number should become a shared constant.
  - `packages/shared` is already a dependency of `@repo/ai` and `apps/web`; `date-fns` is already used in `apps/web` and `packages/automation` (not yet in `packages/ai`).
- **Key files:**
  - `packages/ai/src/agents/score-job.ts`, `packages/ai/src/agents/score-job.test.ts`
  - `packages/ai/src/agents/score-rubric.ts` (new), `packages/ai/src/agents/score-rubric.test.ts` (new)
  - `packages/shared/src/index.ts` + new `packages/shared/src/job-score.ts`
  - `apps/web/components/dashboard/stat-cards.tsx`
  - `CLAUDE.md` (job search pipeline paragraph)
- **New dependencies:** `date-fns` in `@repo/ai` (already used elsewhere in the monorepo; needed to give the model today's date so it can compute "years of experience" for roles ending "Present").
- **Risks/Considerations:**
  - `packages/ai/src/agents/score-job.ts` has **uncommitted changes** (years-gap emphasis, salary/work-auth reasoning rule). The rewrite supersedes them, but their intent is kept (years gap is a tiered rule; salary/work-auth are only mentioned when a problem). Commit or stash first if the current diff is worth keeping.
  - Scores will shift for the same job/resume vs. the old rubric. The deduction values below are a first pass and need calibration against a few real jobs (Phase 3).
  - Nullable/nested Zod fields (`statedSalary`) must work with Gemini structured output through the gateway's Vertex route. Verify with one real call (task 3.2), not just mocks.
  - The model can still extract facts wrongly (e.g. flag a skill as missing that is in the resume). That's now a visible extraction error rather than an arithmetic drift, but it is not eliminated.

## Deduction table (the rubric)

Score = clamp(100 − Σ deductions, 0, 100), then, if a work-authorization blocker fired, `min(score, BLOCKER_SCORE_CAP)`. The model **never sees or outputs point values**; it only returns the facts in the middle column. All values live as `as const` constants in `score-rubric.ts` and are tunable there.

| Rule | Fact from model | Deduction | Cap |
|---|---|---|---|
| Missing required skill | `missingRequiredSkills: string[]` (explicit requirements in the JD with no support in the resume) | −8 each | −40 total |
| Missing preferred skill | `missingPreferredSkills: string[]` (explicit "nice to have" items with no support in the resume) | −2 each | −10 total |
| Years-of-experience gap | `requiredYears: number \| null`, `candidateYears: number` → code computes `gap = required − candidate` | gap < 1: 0; 1–<3: −8; 3–<5: −18; ≥ 5: −30 | — |
| Title level above candidate | `titleLevel: "at-or-below" \| "one-level-above" \| "two-or-more-above"`. **Only applied when `requiredYears` is null**, so the same gap is never penalised twice | 0 / −8 / −20 | — |
| Role mismatch | `roleMatch: "same" \| "adjacent" \| "unrelated"` | 0 / −10 / −25 | — |
| Industry mismatch | `industryMatch: "same-or-transferable" \| "different"` | 0 / −5 | — |
| Salary below minimum | `statedSalary: { amount: number; period: "hourly" \| "weekly" \| "monthly" \| "annual" } \| null` (upper bound of a stated range only, never inferred). Code annualises (×2080 / ×52 / ×12 / ×1) and compares to the candidate's `minSalary` | −15 if upper bound < minSalary; 0 if no salary stated, no minSalary set, or bound ≥ minSalary | — |
| Work authorization blocker | `jobBlocksSponsorship: boolean` (JD explicitly says no sponsorship, or requires existing authorization / citizenship / clearance). Code combines it with the candidate's `requiresSponsorship` flag; both must be true | −40 **and** final score capped at `BLOCKER_SCORE_CAP = 40` | — |

Sanity check: perfect match = 100; typical partial match (2 missing required, 2 missing preferred, role adjacent) = 100 − 16 − 4 − 10 = 70; a "10+ years required vs ~3 in resume" job with two missing skills = 100 − 30 − 16 = 54.

## Tasks

### Phase 1: Rubric as pure code

#### 1.1. [x] Share the strong-match threshold
- **What:** Add `STRONG_MATCH_THRESHOLD = 70` in a new `packages/shared/src/job-score.ts`, export it from `packages/shared/src/index.ts`, and replace the hardcoded `70` in `stat-cards.tsx` with it.
- **Files:** `packages/shared/src/job-score.ts` (new), `packages/shared/src/index.ts`, `apps/web/components/dashboard/stat-cards.tsx`
- **Verify:** `pnpm typecheck` passes; `grep -rn "score >= 70" apps packages` returns nothing.

#### 1.2. [x] Create the rubric module
- **What:** New `score-rubric.ts` containing (a) the Zod `scoreFactsSchema` for the fact fields in the table above, with `.describe()` on each field telling the model exactly what to extract and to base it only on what the JD explicitly says (unknown ≠ gap); (b) the deduction constants (`as const` objects for per-rule points, caps, salary period multipliers, and `BLOCKER_SCORE_CAP = 40`); (c) a pure `computeScore(facts, { minSalary, requiresSponsorship })` returning `{ score, deductions }`, where `deductions` is a list of `{ rule, points }`. No `any`, no casts; export `ScoreFacts = z.infer<typeof scoreFactsSchema>`.
- **Files:** `packages/ai/src/agents/score-rubric.ts` (new)
- **Verify:** `pnpm --filter @repo/ai exec tsc --noEmit`

#### 1.3. [x] Unit-test the rubric
- **What:** Table-driven Vitest cases for `computeScore`: no facts fire → 100; each rule individually deducts the table value; per-rule caps (e.g. 7 missing required skills → −40, not −56); years-gap tier boundaries (gap 0.5 / 1 / 3 / 5); `requiredYears` present → `titleLevel` ignored, `requiredYears` null → `titleLevel` applies; hourly salary annualised (×2080) and range upper bound used; bound exactly equal to `minSalary` → no deduction; no `minSalary` or no stated salary → no deduction; `jobBlocksSponsorship: true` with `requiresSponsorship: false` → no blocker; blocker fires → score ≤ 40 even when nothing else is deducted; total deductions past 100 clamp to 0; `BLOCKER_SCORE_CAP < STRONG_MATCH_THRESHOLD`.
- **Files:** `packages/ai/src/agents/score-rubric.test.ts` (new)
- **Verify:** `pnpm --filter @repo/ai exec vitest run score-rubric`

### Phase 2: Wire the rubric into `scoreJob`

#### 2.1. [x] Add `date-fns` to `@repo/ai`
- **What:** Add `date-fns` (same range as `packages/automation`: `^4.3.0`) to `packages/ai/package.json` dependencies and install.
- **Files:** `packages/ai/package.json`, `pnpm-lock.yaml`
- **Verify:** `pnpm install` succeeds; `pnpm --filter @repo/ai exec tsc --noEmit`

#### 2.2. [x] Rewrite `scoreJob` to extract facts and delegate scoring
- **What:** In `score-job.ts`, replace the local `scoreSchema` with `scoreFactsSchema.extend({ reasoning })`, with `reasoning` **last** in the schema so it's written after the facts are extracted. Rewrite `instructions` as a short extraction prompt: judge only what the JD explicitly says; how to fill each fact field (estimate `candidateYears` from resume dates using today's date, upper bound of salary range, etc.); reasoning rules unchanged from today (1–3 sentences, shown to the candidate, name only the key matches/gaps, lead with a large years gap, never mention points/weights/rubric). The model writes **all** of the reasoning, including salary and work authorization: mention salary only when the `statedSalary` it extracted, annualised, has an upper bound below the candidate's minimum; mention work authorization only when it set `jobBlocksSponsorship` and the candidate requires sponsorship; never say either is met, fine, or not a concern. Keep the minimum-salary line and the "Candidate requires visa sponsorship" line in the prompt so the model can make those two checks; the `minSalary` and `requiresSponsorship` arguments are also passed to `computeScore`. Add `Today's date: <yyyy-MM-dd>` (date-fns `format`) to the prompt. Call `computeScore` on the output and return `{ score: computed.score, reasoning: output.reasoning }` (no code-appended text). Keep the exported signature (`job, resume, apiKey, minSalary?, requiresSponsorship = false`) and model unchanged.
- **Files:** `packages/ai/src/agents/score-job.ts`
- **Verify:** `pnpm --filter @repo/ai exec tsc --noEmit`; `pnpm lint`; read the final prompt once end-to-end for contradictions.

#### 2.3. [x] Update the `scoreJob` unit tests
- **What:** Rewrite the existing test so the mocked `generateText` returns a facts object; assert `scoreJob` returns the code-computed score (not a model-supplied number) and the model's `reasoning` unchanged. Add a case where the model output has no `score` field at all, confirming nothing depends on it, and a case with `requiresSponsorship: true` + `jobBlocksSponsorship: true` asserting score ≤ 40. Assert the prompt passed to `generateText` contains the resume, job title/company/description, today's date, the minimum-salary line when `minSalary` is set, and the sponsorship line.
- **Files:** `packages/ai/src/agents/score-job.test.ts`
- **Verify:** `pnpm --filter @repo/ai exec vitest run`

### Phase 3: Docs and calibration

#### 3.1. [x] Update project docs
- **What:** In `CLAUDE.md`, update the "Job search pipeline" sentence about `scoreJob` (currently "Gemini Flash Lite, `Output.object`, 0–100 integer") and the `packages/ai` architecture line to say the model extracts facts and code applies the deduction table in `packages/ai/src/agents/score-rubric.ts` (start at 100, deduct, cap on work-authorization blockers).
- **Files:** `CLAUDE.md`
- **Verify:** Read the edited paragraphs; wording matches the code.

#### 3.2. Calibrate against real jobs
- **What:** Run a real search (or call `scoreJob` from a scratch script with a real gateway key and a real resume) on 5–10 jobs spanning: clear match, big years gap, wrong role, salary below minimum, no-sponsorship posting. Confirm the Vertex route accepts the nullable `statedSalary` schema, the facts extracted are sane, scores land where expected (clear match ≥ 70, years-gap job noticeably lower, blocker ≤ 40), and the reasoning agrees with the deductions (it mentions salary / work authorization exactly when those rules fired, and not otherwise). Tune constants in `score-rubric.ts` if not, and update the unit-test expectations that encode changed values.
- **Files:** `packages/ai/src/agents/score-rubric.ts` (constants only), matching tests
- **Verify:** `pnpm --filter @repo/ai exec vitest run` still passes after any tuning; recorded before/after scores for the sampled jobs are noted in the plan's Completed section.

## Notes

- **Design decision (made with the user):** code computes the score; the model only returns facts. The model never outputs points. This was chosen over "model starts at 100 and subtracts" for determinism, testability and tunability without prompt changes.
- **Reasoning consistency risk:** the model writes all reasoning, including the salary and work-authorization mentions, so the tooltip can disagree with the deductions code applied (e.g. it mentions salary when no deduction fired, or omits a sponsorship blocker). This is mitigated by ordering `reasoning` after the extracted facts and tying the mention rules to those facts in the prompt. Task 3.2 checks agreement on real jobs. If it's still flaky, the fallback is to have code append those two sentences.
- **2026-09-20 — Revision:** the model now writes all reasoning (salary and work-authorization included); removed code-appended `notes` from `computeScore`, and restored the minimum-salary and sponsorship lines and their mention rules in the prompt.
- **Not penalised (open question):** being *over*-qualified (e.g. 10 years applying to a junior role) does not deduct anything. The old rubric didn't either, in practice. Add a rule if you want it.
- **Out of scope:** persisting the deductions (no schema change; the breakdown is discarded), re-scoring existing jobs (they keep their old scores), changing the model, and any UI beyond swapping the `70` literal for the shared constant.
- **Possible follow-up:** enable `experimental_telemetry` on the scoring `generateText` call so fact extractions show up in Langfuse. It makes calibration much easier.

## Completed

- **Date:** 2026-09-20
- **All tasks executed successfully:** no. Task 3.2 (real-model calibration) was deliberately left for the user, since it needs a live AI Gateway key.
- **Files changed:**
  - `packages/ai/src/agents/score-rubric.ts` (new): fact schema, deduction constants, `computeScore()`
  - `packages/ai/src/agents/score-rubric.test.ts` (new): 32 unit tests for every rule, cap and boundary
  - `packages/ai/src/agents/score-job.ts`: model extracts facts + writes all reasoning; code computes the score
  - `packages/ai/src/agents/score-job.test.ts`: rewritten for the new flow (7 tests)
  - `packages/ai/package.json`, `pnpm-lock.yaml`: added `date-fns`
  - `packages/shared/src/job-score.ts` (new), `packages/shared/src/index.ts`: `STRONG_MATCH_THRESHOLD`
  - `apps/web/components/dashboard/stat-cards.tsx`: uses the shared threshold
  - `CLAUDE.md`: scoring description updated
- **How to test:** `pnpm test`, `pnpm lint` and `pnpm typecheck` all pass. For the real model, run a search from the app and inspect the scores and tooltip reasoning on new jobs.
- **Follow-up items:**
  - **Task 3.2 (calibration), still open.** Check on real jobs that: Gemini accepts the schema (especially nullable `statedSalary`); a clear match scores >= 70; a large years gap scores noticeably lower; a no-sponsorship posting scores <= 40 when the profile requires sponsorship; and the reasoning mentions salary / work authorization exactly when those deductions fired. Tune the constants in `score-rubric.ts` (and the matching test expectations) if scores feel off.
  - The deduction values are a first pass.
  - If reasoning and deductions disagree on real jobs, fall back to having code append the salary / work-authorization sentences.
  - Over-qualification is not penalised.
  - Optional: enable `experimental_telemetry` on the scoring call so extractions show up in Langfuse.
