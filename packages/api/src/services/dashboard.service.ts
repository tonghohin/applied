import { type Job, type SearchRun, getSearchScheduleForUser, jobs, listSearchRuns } from "@repo/db";
import { desc, eq } from "drizzle-orm";
import type { Context } from "../context";
import { getSearchQueue } from "../queues/index";
import { searchSchedulerId } from "./search-schedule.service";

type Db = Context["db"];

export type DashboardJob = Pick<
  Job,
  "id" | "title" | "company" | "status" | "fitTier" | "createdAt" | "appliedAt" | "updatedAt"
>;

export type DashboardSearchSchedule = {
  enabled: boolean;
  nextRunAt: Date | null;
};

export type DashboardStats = {
  jobs: DashboardJob[];
  searchRuns: SearchRun[];
  searchSchedule: DashboardSearchSchedule;
};

async function getSearchScheduleStatus(db: Db, userId: string): Promise<DashboardSearchSchedule> {
  const schedule = await getSearchScheduleForUser(db, userId);
  if (!schedule?.enabled) return { enabled: false, nextRunAt: null };

  const scheduler = await getSearchQueue().getJobScheduler(searchSchedulerId(userId));
  return { enabled: true, nextRunAt: scheduler?.next ? new Date(scheduler.next) : null };
}

export async function getDashboardStats(db: Db, userId: string): Promise<DashboardStats> {
  const [allJobs, allSearchRuns, searchSchedule] = await Promise.all([
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
    getSearchScheduleStatus(db, userId),
  ]);

  return {
    jobs: allJobs,
    searchRuns: allSearchRuns,
    searchSchedule,
  };
}
