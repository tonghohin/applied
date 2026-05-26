import { processApplyJob } from "@repo/ai";
import { db } from "@repo/db";
import { Worker } from "bullmq";
import { env } from "../env";

type ApplyJobData = { jobId: string; userId: string };

export const applyWorker = new Worker<ApplyJobData>(
  "apply",
  async (job) => {
    await processApplyJob(db, job.data.jobId, job.data.userId);
  },
  { connection: { url: env.REDIS_URL }, concurrency: 1, lockDuration: 10 * 60 * 1000 }
);

applyWorker.on("failed", (job, err) => {
  console.error(`[apply-worker] job ${job?.id} failed:`, err.message);
});
