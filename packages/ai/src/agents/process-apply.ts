import { rm } from "node:fs/promises";
import { type Db, getJobForUser, getProfileForUser, updateJobApplied, updateJobFailed } from "@repo/db";
import { applyToJob } from "./apply-agent";
import { generateResumePdf } from "./generate-resume-pdf";

export async function processApplyJob(db: Db, jobId: string, userId: string) {
  const [jobRow, profileRow] = await Promise.all([
    getJobForUser(db, jobId, userId),
    getProfileForUser(db, userId),
  ]);

  if (!jobRow) throw new Error(`Job ${jobId} not found`);
  if (!profileRow) throw new Error(`Profile for user ${userId} not found`);

  const resumePdfPath = await generateResumePdf(profileRow.resume);
  try {
    const result = await applyToJob(jobRow, profileRow, resumePdfPath);
    if (result.success) {
      await updateJobApplied(db, jobId);
    } else {
      await updateJobFailed(db, jobId, result.reason);
    }
  } finally {
    await rm(resumePdfPath, { recursive: true, force: true });
  }
}
