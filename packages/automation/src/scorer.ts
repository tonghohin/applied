import { fitTierEnum } from "@repo/db";
import type { ScrapedJob, SearchCriteria } from "./types";

export type FitTier = (typeof fitTierEnum.enumValues)[number];

const [STRONG, POTENTIAL, WEAK] = fitTierEnum.enumValues;

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function countMatches(haystack: string, needles: string[]): number {
  return needles.filter((n) => haystack.includes(normalize(n))).length;
}

export function scoreJob(
  job: ScrapedJob,
  // Note: with a single title, max title score is 2 pts (match = 2, no match = 0).
  // "strong" (≥7) therefore requires 1 title match + 5 skill matches.
  criteria: Pick<SearchCriteria, "jobTitle"> & { skills?: string[] },
): FitTier {
  const text = normalize(`${job.title} ${job.description}`);
  let score = 0;

  // Title match (worth 2 points)
  if (criteria.jobTitle && text.includes(normalize(criteria.jobTitle))) {
    score += 2;
  }

  // Skills match (worth up to 6 points)
  if (criteria.skills && criteria.skills.length > 0) {
    const skillMatches = countMatches(text, criteria.skills);
    score += Math.min(skillMatches, 6);
  }

  if (score >= 7) return STRONG;
  if (score >= 3) return POTENTIAL;
  return WEAK;
}
