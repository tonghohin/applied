import {
  type Db,
  getJobForUser,
  getProfileForUser,
  updateJobApplied,
  updateJobFailed,
} from "@repo/db";
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { applyToJob } from "./apply-agent";
import { generateResumePdf } from "./generate-resume-pdf";

export async function processApplyJob(
  db: Db,
  jobId: string,
  userId: string,
  linkedinSessionJson?: string,
  log: (msg: string) => void = () => {},
) {
  log("Fetching job and profile");
  const [jobRow, profileRow] = await Promise.all([
    getJobForUser(db, jobId, userId),
    getProfileForUser(db, userId),
  ]);

  if (!jobRow) throw new Error(`Job ${jobId} not found`);
  if (!profileRow) throw new Error(`Profile for user ${userId} not found`);

  log("Generating resume PDF");
  const resumePdfPath = await generateResumePdf(profileRow.resume);
  try {
    log("Launching AI agent");
    const result = await applyToJob(
      jobRow,
      profileRow,
      resumePdfPath,
      linkedinSessionJson,
      log,
    );
    if (result.success) {
      log("Application submitted successfully");
      await updateJobApplied(db, jobId);
    } else {
      log(`Application failed: ${result.reason}`);
      await updateJobFailed(db, jobId, result.reason);
    }
    return result;
  } finally {
    await rm(dirname(resumePdfPath), { recursive: true, force: true });
  }
}
