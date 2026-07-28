import type { Job, JobStatus } from "@/lib/trpc";
import type { WorkType } from "@repo/shared";

export const DEFAULT_VISIBLE_STATUSES: JobStatus[] = ["pending_review", "applying", "failed"];

export type JobSortBy = "score-desc" | "score-asc" | "newest" | "oldest";

export function filterAndSortJobs(
  jobs: Job[],
  {
    statuses,
    workplaceTypes,
    search,
    sortBy,
  }: {
    statuses: JobStatus[];
    workplaceTypes: WorkType[];
    search: string;
    sortBy: JobSortBy;
  }
): Job[] {
  const normalizedSearch = search.trim().toLowerCase();

  const filtered = jobs.filter((job) => {
    if (statuses.length > 0 && !statuses.includes(job.status)) return false;
    if (workplaceTypes.length > 0 && !workplaceTypes.includes(job.workplaceType)) return false;
    if (normalizedSearch.length > 0) {
      const haystack = `${job.title} ${job.company} ${job.location}`.toLowerCase();
      if (!haystack.includes(normalizedSearch)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    switch (sortBy) {
      case "score-desc":
        return b.score - a.score;
      case "score-asc":
        return a.score - b.score;
      case "newest":
        return b.createdAt.getTime() - a.createdAt.getTime();
      case "oldest":
        return a.createdAt.getTime() - b.createdAt.getTime();
      default:
        return 0;
    }
  });
}
