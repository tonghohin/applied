import { type Job, type SearchRun, jobs, listSearchRuns } from "@repo/db";
import { desc, eq } from "drizzle-orm";
import type { Context } from "../context";

type Db = Context["db"];

export type DashboardJob = Pick<
  Job,
  "id" | "title" | "company" | "status" | "fitTier" | "createdAt" | "appliedAt" | "updatedAt"
>;

export type DashboardStats = {
  jobs: DashboardJob[];
  searchRuns: SearchRun[];
};

export async function getDashboardStats(db: Db, userId: string): Promise<DashboardStats> {
  const [allJobs, allSearchRuns] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: jobs.company,
        status: jobs.status,
        fitTier: jobs.fitTier,
        createdAt: jobs.createdAt,
        appliedAt: jobs.appliedAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(eq(jobs.userId, userId))
      .orderBy(desc(jobs.createdAt)),

    listSearchRuns(db, userId),
  ]);

  return {
    jobs: allJobs,
    searchRuns: allSearchRuns,
  };
}
