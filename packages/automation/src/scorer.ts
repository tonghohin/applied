import { fitTierEnum } from "@repo/db";
import type { ScrapedJob } from "./types";

export type FitTier = (typeof fitTierEnum.enumValues)[number];

const [STRONG, POTENTIAL, WEAK] = fitTierEnum.enumValues;

const MAX_SKILL_POINTS = 6;
const POTENTIAL_THRESHOLD = 2;

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function countMatches(haystack: string, needles: string[]): number {
  return needles.filter((needle) => {
    const escaped = normalize(needle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(haystack);
  }).length;
}

export function scoreJob(job: ScrapedJob, skills: string[]): FitTier {
  if (skills.length === 0) return WEAK;

  const text = normalize(`${job.title} ${job.description}`);
  const score = Math.min(countMatches(text, skills), MAX_SKILL_POINTS);

  // Strong threshold scales with the number of skills saved: requires matching
  // all but one (up to the MAX_SKILL_POINTS cap), so it's reachable regardless
  // of how many skills the user listed.
  const strongThreshold = Math.max(2, Math.min(skills.length, MAX_SKILL_POINTS) - 1);

  if (score >= strongThreshold) return STRONG;
  if (score >= POTENTIAL_THRESHOLD) return POTENTIAL;
  return WEAK;
}
