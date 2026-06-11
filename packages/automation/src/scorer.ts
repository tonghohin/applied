import { fitTierEnum } from "@repo/db";
import type { ScrapedJob, SearchCriteria } from "./types";

export type FitTier = (typeof fitTierEnum.enumValues)[number];

const [STRONG, POTENTIAL, WEAK] = fitTierEnum.enumValues;

// Scoring weights — these interact: with a single title, max title score is
// TITLE_POINTS, so "strong" requires a title match plus
// (STRONG_THRESHOLD - TITLE_POINTS) skill matches.
const TITLE_POINTS = 2;
const MAX_SKILL_POINTS = 6;
const STRONG_THRESHOLD = 7;
const POTENTIAL_THRESHOLD = 3;

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function countMatches(haystack: string, needles: string[]): number {
  return needles.filter((n) => haystack.includes(normalize(n))).length;
}

export function scoreJob(
  job: ScrapedJob,
  criteria: Pick<SearchCriteria, "jobTitle"> & { skills?: string[] }
): FitTier {
  const text = normalize(`${job.title} ${job.description}`);
  let score = 0;

  if (criteria.jobTitle && text.includes(normalize(criteria.jobTitle))) {
    score += TITLE_POINTS;
  }

  if (criteria.skills && criteria.skills.length > 0) {
    const skillMatches = countMatches(text, criteria.skills);
    score += Math.min(skillMatches, MAX_SKILL_POINTS);
  }

  if (score >= STRONG_THRESHOLD) return STRONG;
  if (score >= POTENTIAL_THRESHOLD) return POTENTIAL;
  return WEAK;
}
