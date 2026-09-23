import { z } from "zod";

const TITLE_LEVELS = ["at-or-below", "one-level-above", "two-or-more-above"] as const;
const ROLE_MATCHES = ["same", "adjacent", "unrelated"] as const;
const INDUSTRY_MATCHES = ["same-or-transferable", "different"] as const;
const SALARY_PERIODS = ["hourly", "weekly", "monthly", "annual"] as const;

type TitleLevel = (typeof TITLE_LEVELS)[number];
type RoleMatch = (typeof ROLE_MATCHES)[number];
type IndustryMatch = (typeof INDUSTRY_MATCHES)[number];
type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const scoreFactsSchema = z.object({
  missingRequiredSkills: z
    .array(z.string())
    .describe(
      "Skills, tools, or hands-on experience the job description explicitly lists as required (or clearly mandatory) that the resume gives no evidence of. Short names, one entry per distinct requirement. Empty array if the resume covers them all. Never list something the job description does not state."
    ),
  missingPreferredSkills: z
    .array(z.string())
    .describe(
      "Skills, tools, or experience the job description explicitly lists as preferred, a plus, or nice to have that the resume gives no evidence of. Short names, one entry per distinct item. Empty array if none are missing."
    ),
  requiredYears: z
    .number()
    .nullable()
    .describe(
      "Minimum years of professional experience the job description explicitly requires, as a number (lower bound of a range like '5-7 years'; 10 for '10+ years'). null if the job description states no years requirement. Never infer it from the title."
    ),
  candidateYears: z
    .number()
    .describe(
      "The candidate's total years of relevant professional experience for this job's field, estimated from the dates in the resume up to today's date (a role ending 'Present' ends today). Overlapping roles count once."
    ),
  titleLevel: z
    .enum(TITLE_LEVELS)
    .describe(
      "Seniority level in the job title (junior/mid/senior/staff/principal/manager/etc.) relative to the candidate's current level: 'at-or-below' if it matches or is lower, 'one-level-above' if it is one step above, 'two-or-more-above' if it is two or more steps above."
    ),
  roleMatch: z
    .enum(ROLE_MATCHES)
    .describe(
      "How closely the job's role type matches the candidate's background: 'same' if it is the same kind of role they have done, 'adjacent' if related but a different focus, 'unrelated' if a different function."
    ),
  industryMatch: z
    .enum(INDUSTRY_MATCHES)
    .describe(
      "'same-or-transferable' if the job's industry is the candidate's industry or one their experience clearly carries over to, otherwise 'different'."
    ),
  statedSalary: z
    .object({
      amount: z.number(),
      period: z.enum(SALARY_PERIODS),
    })
    .nullable()
    .describe(
      "The upper bound of the salary or salary range explicitly stated in the job description, as a full number (120k is 120000) with the pay period it is quoted in. Do not convert it. null if no salary is stated. Never guess from typical rates for the role."
    ),
  jobBlocksSponsorship: z
    .boolean()
    .describe(
      "true only if the job description explicitly says it does not offer visa sponsorship, or requires existing work authorization, citizenship, or a security clearance. false if it does not address this."
    ),
});

export type ScoreFacts = z.infer<typeof scoreFactsSchema>;

export const BLOCKER_SCORE_CAP = 40;

const STARTING_SCORE = 100;

const MISSING_REQUIRED_SKILL = { pointsEach: 8, maxPoints: 40 } as const;
const MISSING_PREFERRED_SKILL = { pointsEach: 2, maxPoints: 10 } as const;

// Checked in order, so the first tier whose minimum gap is reached applies.
const YEARS_GAP_TIERS = [
  { minGap: 5, points: 15 },
  { minGap: 3, points: 9 },
  { minGap: 1, points: 4 },
] as const;

const TITLE_LEVEL_POINTS: Record<TitleLevel, number> = {
  "at-or-below": 0,
  "one-level-above": 8,
  "two-or-more-above": 20,
};

const ROLE_MATCH_POINTS: Record<RoleMatch, number> = {
  same: 0,
  adjacent: 10,
  unrelated: 25,
};

const INDUSTRY_MATCH_POINTS: Record<IndustryMatch, number> = {
  "same-or-transferable": 0,
  different: 5,
};

const ANNUALISATION_FACTORS: Record<SalaryPeriod, number> = {
  hourly: 2080,
  weekly: 52,
  monthly: 12,
  annual: 1,
};

const SALARY_BELOW_MINIMUM_POINTS = 15;
const WORK_AUTHORIZATION_BLOCKER_POINTS = 40;

export type Deduction = {
  rule:
    | "missing-required-skills"
    | "missing-preferred-skills"
    | "years-gap"
    | "title-level"
    | "role-mismatch"
    | "industry-mismatch"
    | "salary-below-minimum"
    | "work-authorization-blocker";
  points: number;
};

function countDistinct(entries: string[]): number {
  return new Set(entries.map((entry) => entry.trim().toLowerCase()).filter(Boolean)).size;
}

function skillPoints(
  entries: string[],
  { pointsEach, maxPoints }: { pointsEach: number; maxPoints: number }
): number {
  return Math.min(countDistinct(entries) * pointsEach, maxPoints);
}

export function computeScore(
  facts: ScoreFacts,
  context: { minSalary?: number | null; requiresSponsorship: boolean }
): { score: number; deductions: Deduction[] } {
  const candidates: Deduction[] = [
    {
      rule: "missing-required-skills",
      points: skillPoints(facts.missingRequiredSkills, MISSING_REQUIRED_SKILL),
    },
    {
      rule: "missing-preferred-skills",
      points: skillPoints(facts.missingPreferredSkills, MISSING_PREFERRED_SKILL),
    },
    { rule: "role-mismatch", points: ROLE_MATCH_POINTS[facts.roleMatch] },
    { rule: "industry-mismatch", points: INDUSTRY_MATCH_POINTS[facts.industryMatch] },
  ];

  // An explicit years requirement is the seniority signal; the title level is only a fallback,
  // so the same gap is never penalised twice.
  if (facts.requiredYears === null) {
    candidates.push({ rule: "title-level", points: TITLE_LEVEL_POINTS[facts.titleLevel] });
  } else {
    const gap = facts.requiredYears - facts.candidateYears;
    const tier = YEARS_GAP_TIERS.find((entry) => gap >= entry.minGap);
    candidates.push({ rule: "years-gap", points: tier?.points ?? 0 });
  }

  if (facts.statedSalary && context.minSalary) {
    const annualSalary =
      facts.statedSalary.amount * ANNUALISATION_FACTORS[facts.statedSalary.period];
    if (annualSalary < context.minSalary) {
      candidates.push({ rule: "salary-below-minimum", points: SALARY_BELOW_MINIMUM_POINTS });
    }
  }

  const blocked = context.requiresSponsorship && facts.jobBlocksSponsorship;
  if (blocked) {
    candidates.push({
      rule: "work-authorization-blocker",
      points: WORK_AUTHORIZATION_BLOCKER_POINTS,
    });
  }

  const deductions = candidates.filter((deduction) => deduction.points > 0);
  const totalPoints = deductions.reduce((total, deduction) => total + deduction.points, 0);
  const score = Math.max(0, STARTING_SCORE - totalPoints);

  return { score: blocked ? Math.min(score, BLOCKER_SCORE_CAP) : score, deductions };
}
