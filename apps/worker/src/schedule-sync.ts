import { db, listScheduleSyncTargets } from "@repo/db";
import { buildSearchCronPattern } from "@repo/shared";
import { Queue } from "bullmq";
import { env } from "./env";

type SearchJobData = { userId: string; runId?: string };

// Local Queue instance — importing searchQueue from @repo/api's root would evaluate
// Better Auth config, which requires env vars the worker doesn't have.
export const searchSchedulerQueue = new Queue<SearchJobData>("search", {
  connection: { url: env.REDIS_URL },
});

export async function syncAllSearchSchedulers() {
  const targets = await listScheduleSyncTargets(db);
  for (const { schedule, hasCriteria, hasLinkedIn } of targets) {
    const schedulerId = `search-schedule:${schedule.userId}`;
    if (schedule.enabled && hasCriteria && hasLinkedIn) {
      await searchSchedulerQueue.upsertJobScheduler(
        schedulerId,
        { pattern: buildSearchCronPattern(schedule), tz: schedule.timezone },
        { name: "scheduled-search", data: { userId: schedule.userId } }
      );
    } else {
      await searchSchedulerQueue.removeJobScheduler(schedulerId);
    }
  }
}
