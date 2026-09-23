import { STRONG_MATCH_THRESHOLD } from "@repo/shared";
import { describe, expect, it } from "vitest";
import { BLOCKER_SCORE_CAP, type ScoreFacts, computeScore } from "./score-rubric";

const CLEAN_FACTS: ScoreFacts = {
  missingRequiredSkills: [],
  missingPreferredSkills: [],
  requiredYears: null,
  candidateYears: 5,
  titleLevel: "at-or-below",
  roleMatch: "same",
  industryMatch: "same-or-transferable",
  statedSalary: null,
  jobBlocksSponsorship: false,
};

type ScoreContext = Parameters<typeof computeScore>[1];

const NO_CONTEXT: ScoreContext = { minSalary: null, requiresSponsorship: false };

function scoreWith(overrides: Partial<ScoreFacts>, context: ScoreContext = NO_CONTEXT) {
  return computeScore({ ...CLEAN_FACTS, ...overrides }, context);
}

describe("computeScore", () => {
  it("returns 100 with no deductions when nothing fires", () => {
    expect(computeScore(CLEAN_FACTS, NO_CONTEXT)).toEqual({ score: 100, deductions: [] });
  });

  describe("missing skills", () => {
    it("deducts 8 per missing required skill", () => {
      expect(scoreWith({ missingRequiredSkills: ["Go"] }).score).toBe(92);
      expect(scoreWith({ missingRequiredSkills: ["Go", "Kafka", "Rust"] }).score).toBe(76);
    });

    it("caps required-skill deductions at 40", () => {
      const skills = ["a", "b", "c", "d", "e", "f", "g"];
      expect(scoreWith({ missingRequiredSkills: skills }).score).toBe(60);
    });

    it("counts duplicate skills (ignoring case and whitespace) once", () => {
      expect(scoreWith({ missingRequiredSkills: ["Kafka", " kafka ", "KAFKA"] }).score).toBe(92);
    });

    it("deducts 2 per missing preferred skill, capped at 10", () => {
      expect(scoreWith({ missingPreferredSkills: ["Go", "Rust"] }).score).toBe(96);
      const skills = ["a", "b", "c", "d", "e", "f", "g", "h"];
      expect(scoreWith({ missingPreferredSkills: skills }).score).toBe(90);
    });
  });

  describe("years-of-experience gap", () => {
    it.each([
      { requiredYears: 5, candidateYears: 4.5, expected: 100 },
      { requiredYears: 5, candidateYears: 4, expected: 96 },
      { requiredYears: 5, candidateYears: 2.1, expected: 96 },
      { requiredYears: 5, candidateYears: 2, expected: 91 },
      { requiredYears: 5, candidateYears: 0.1, expected: 91 },
      { requiredYears: 5, candidateYears: 0, expected: 85 },
      { requiredYears: 10, candidateYears: 3, expected: 85 },
      { requiredYears: 3, candidateYears: 8, expected: 100 },
    ])(
      "requires $requiredYears, candidate has $candidateYears -> $expected",
      ({ requiredYears, candidateYears, expected }) => {
        expect(scoreWith({ requiredYears, candidateYears }).score).toBe(expected);
      }
    );

    it("ignores the title level when a years requirement is stated", () => {
      const result = scoreWith({
        requiredYears: 3,
        candidateYears: 5,
        titleLevel: "two-or-more-above",
      });
      expect(result).toEqual({ score: 100, deductions: [] });
    });

    it("falls back to the title level when no years requirement is stated", () => {
      expect(scoreWith({ requiredYears: null, titleLevel: "one-level-above" }).score).toBe(92);
      expect(scoreWith({ requiredYears: null, titleLevel: "two-or-more-above" }).score).toBe(80);
    });

    it("does not penalise the title level twice when the years gap also fires", () => {
      const result = scoreWith({
        requiredYears: 10,
        candidateYears: 3,
        titleLevel: "two-or-more-above",
      });
      expect(result.deductions).toEqual([{ rule: "years-gap", points: 15 }]);
    });
  });

  describe("role and industry", () => {
    it("deducts for role mismatch", () => {
      expect(scoreWith({ roleMatch: "adjacent" }).score).toBe(90);
      expect(scoreWith({ roleMatch: "unrelated" }).score).toBe(75);
    });

    it("deducts 5 for a different industry", () => {
      expect(scoreWith({ industryMatch: "different" }).score).toBe(95);
    });
  });

  describe("salary", () => {
    const context = { minSalary: 130_000, requiresSponsorship: false };

    it("deducts 15 when the stated annual upper bound is below the minimum", () => {
      const result = scoreWith({ statedSalary: { amount: 120_000, period: "annual" } }, context);
      expect(result.score).toBe(85);
      expect(result.deductions).toEqual([{ rule: "salary-below-minimum", points: 15 }]);
    });

    it("annualises hourly pay at 2080 hours", () => {
      expect(scoreWith({ statedSalary: { amount: 50, period: "hourly" } }, context).score).toBe(85);
      expect(scoreWith({ statedSalary: { amount: 70, period: "hourly" } }, context).score).toBe(
        100
      );
    });

    it("annualises monthly and weekly pay", () => {
      expect(
        scoreWith({ statedSalary: { amount: 10_000, period: "monthly" } }, context).score
      ).toBe(85);
      expect(scoreWith({ statedSalary: { amount: 2_600, period: "weekly" } }, context).score).toBe(
        100
      );
    });

    it("does not deduct when the bound equals the minimum", () => {
      const result = scoreWith({ statedSalary: { amount: 130_000, period: "annual" } }, context);
      expect(result.score).toBe(100);
    });

    it("does not deduct when no salary is stated", () => {
      expect(scoreWith({ statedSalary: null }, context).score).toBe(100);
    });

    it("does not deduct when the candidate has no minimum", () => {
      const statedSalary = { amount: 1, period: "annual" } as const;
      expect(scoreWith({ statedSalary }, NO_CONTEXT).score).toBe(100);
      expect(
        scoreWith({ statedSalary }, { minSalary: undefined, requiresSponsorship: false }).score
      ).toBe(100);
    });
  });

  describe("work authorization blocker", () => {
    it("does nothing when the candidate does not need sponsorship", () => {
      const result = scoreWith({ jobBlocksSponsorship: true });
      expect(result).toEqual({ score: 100, deductions: [] });
    });

    it("does nothing when the job does not block sponsorship", () => {
      const result = scoreWith(
        { jobBlocksSponsorship: false },
        { minSalary: null, requiresSponsorship: true }
      );
      expect(result).toEqual({ score: 100, deductions: [] });
    });

    it("caps the score even when nothing else is deducted", () => {
      const result = scoreWith(
        { jobBlocksSponsorship: true },
        { minSalary: null, requiresSponsorship: true }
      );
      expect(result.score).toBe(BLOCKER_SCORE_CAP);
      expect(result.deductions).toEqual([{ rule: "work-authorization-blocker", points: 40 }]);
    });

    it("caps a score that would otherwise stay above the cap", () => {
      const result = scoreWith(
        { jobBlocksSponsorship: true, roleMatch: "adjacent" },
        { minSalary: null, requiresSponsorship: true }
      );
      expect(result.score).toBe(BLOCKER_SCORE_CAP);
    });

    it("does not raise a score that is already below the cap", () => {
      const result = scoreWith(
        {
          jobBlocksSponsorship: true,
          roleMatch: "unrelated",
          missingRequiredSkills: ["a", "b", "c", "d", "e"],
        },
        { minSalary: null, requiresSponsorship: true }
      );
      expect(result.score).toBe(0);
    });

    it("keeps the cap below the strong-match threshold", () => {
      expect(BLOCKER_SCORE_CAP).toBeLessThan(STRONG_MATCH_THRESHOLD);
    });
  });

  it("clamps the score at 0 when deductions exceed 100", () => {
    const result = scoreWith(
      {
        missingRequiredSkills: ["a", "b", "c", "d", "e"],
        missingPreferredSkills: ["f", "g", "h", "i", "j"],
        requiredYears: 12,
        candidateYears: 2,
        roleMatch: "unrelated",
        industryMatch: "different",
        statedSalary: { amount: 50_000, period: "annual" },
      },
      { minSalary: 200_000, requiresSponsorship: false }
    );
    expect(result.score).toBe(0);
  });

  it("lists only the rules that fired", () => {
    const result = scoreWith({
      missingRequiredSkills: ["Go", "Kafka"],
      roleMatch: "adjacent",
      requiredYears: 8,
      candidateYears: 3,
    });
    expect(result.deductions).toEqual([
      { rule: "missing-required-skills", points: 16 },
      { rule: "role-mismatch", points: 10 },
      { rule: "years-gap", points: 15 },
    ]);
    expect(result.score).toBe(59);
  });
});
