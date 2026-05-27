import { processApplyJob } from "@repo/ai";
import { db, getLinkedInAccount, insertApplyRun, updateApplyRun } from "@repo/db";
import type { ApplyRunLog } from "@repo/db";
import { decrypt } from "@repo/shared";
import { Worker } from "bullmq";
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

    const logs: ApplyRunLog[] = [];
    const log = (message: string) => logs.push({ timestamp: new Date().toISOString(), message });

    const run = await insertApplyRun(db, {
      jobId,
      userId,
      status: "running",
      startedAt: new Date(),
    });
    if (!run) throw new Error("Failed to create apply run");

    try {
      await processApplyJob(db, jobId, userId, linkedinSessionJson, log);
      await updateApplyRun(db, run.id, {
        status: "completed",
        completedAt: new Date(),
        logs,
      });
    } catch (err) {
      log(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      await updateApplyRun(db, run.id, {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
        logs,
      });
      throw err;
    }
  },
  { connection: { url: env.REDIS_URL }, concurrency: 1, lockDuration: 10 * 60 * 1000 }
);

applyWorker.on("failed", (job, err) => {
  console.error(`[apply-worker] job ${job?.id} failed:`, err.message);
});
