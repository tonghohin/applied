import { processApplyJob } from "@repo/ai";
import { db, getLinkedInAccount } from "@repo/db";
import { Worker } from "bullmq";
import { decrypt } from "@repo/shared";
import { env } from "../env";

type ApplyJobData = { jobId: string; userId: string };

export const applyWorker = new Worker<ApplyJobData>(
  "apply",
  async (job) => {
    const { jobId, userId } = job.data;
    const account = await getLinkedInAccount(db, userId);
    const linkedinSessionJson = account?.sessionEncrypted
      ? decrypt(account.sessionEncrypted, env.LINKEDIN_ENCRYPTION_KEY)
      : undefined;
    await processApplyJob(db, jobId, userId, linkedinSessionJson);
  },
  { connection: { url: env.REDIS_URL }, concurrency: 1, lockDuration: 10 * 60 * 1000 }
);

applyWorker.on("failed", (job, err) => {
  console.error(`[apply-worker] job ${job?.id} failed:`, err.message);
});
