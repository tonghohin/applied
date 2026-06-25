import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type Db,
  getJobCriteriaForUser,
  getJobForUser,
  getProfileWithEmailForUser,
  updateJobApplied,
  updateJobFailed,
} from "@repo/db";
import { applyToJob } from "./apply-agent";
import { generateResumePdf } from "./generate-resume-pdf";

export async function processApplyJob(
  db: Db,
  jobId: string,
  userId: string,
  apiKey: string,
  linkedinSessionJson?: string,
  log: (msg: string) => void = () => {}
) {
  log("Fetching job and profile");
  const [jobRow, profileRow, criteriaRow] = await Promise.all([
    getJobForUser(db, jobId, userId),
    getProfileWithEmailForUser(db, userId),
    getJobCriteriaForUser(db, userId),
  ]);

  if (!jobRow) throw new Error(`Job ${jobId} not found`);
  if (!profileRow) throw new Error(`Profile for user ${userId} not found`);
  if (!criteriaRow) throw new Error(`Criteria for user ${userId} not found`);

  log("Generating resume PDF");
  const resumePdfPath = await generateResumePdf(profileRow.resume);
  try {
    log("Launching AI agent");
    const result = await applyToJob(
      jobRow,
      profileRow,
      resumePdfPath,
      criteriaRow.minSalary,
      linkedinSessionJson,
      log,
      apiKey
    );
    if (result.success) {
      log("Application submitted successfully");
      await updateJobApplied(db, jobId);
    } else {
      log(`Application failed: ${result.reason}`);
      await updateJobFailed(db, jobId, result.reason ?? "Unknown error");
    }
    return result;
  } finally {
    await rm(dirname(resumePdfPath), { recursive: true, force: true });
  }
}
