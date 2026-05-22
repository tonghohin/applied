import { fitTierEnum } from "@repo/db";
import type { ScrapedJob, SearchCriteria } from "./types.js";

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
  criteria: Pick<SearchCriteria, "jobTitles"> & { skills?: string[] }
): FitTier {
  const text = normalize(`${job.title} ${job.description}`);
  let score = 0;

  // Title match (worth 4 points)
  if (criteria.jobTitles.length > 0) {
    const titleMatches = countMatches(text, criteria.jobTitles);
    score += Math.min(titleMatches * 2, 4);
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
