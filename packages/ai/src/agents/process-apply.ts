import { type Db, getJobForUser, getProfileForUser, updateJobApplied, updateJobFailed } from "@repo/db";
import { applyToJob } from "./apply-agent";

export async function processApplyJob(db: Db, jobId: string, userId: string) {
  const [jobRow, profileRow] = await Promise.all([
    getJobForUser(db, jobId, userId),
    getProfileForUser(db, userId),
  ]);

  if (!jobRow) throw new Error(`Job ${jobId} not found`);
  if (!profileRow) throw new Error(`Profile for user ${userId} not found`);

  const result = await applyToJob(jobRow, profileRow);

  if (result.success) {
    await updateJobApplied(db, jobId);
  } else {
    await updateJobFailed(db, jobId, result.reason);
  }
}
