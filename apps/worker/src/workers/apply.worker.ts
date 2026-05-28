import { propagateAttributes } from "@langfuse/tracing";
import { processApplyJob } from "@repo/ai";
import { db, getLinkedInAccount, updateApplyRun } from "@repo/db";
import type { ApplyRunLog } from "@repo/db";
import { decrypt } from "@repo/shared";
import { Worker } from "bullmq";
import { env } from "../env";
import { langfuseSpanProcessor } from "../otel";

type ApplyJobData = { jobId: string; userId: string; runId: string };

export const applyWorker = new Worker<ApplyJobData>(
  "apply",
  async (job) => {
    const { jobId, userId, runId } = job.data;
    const account = await getLinkedInAccount(db, userId);
    const linkedinSessionJson = account?.sessionEncrypted
      ? decrypt(account.sessionEncrypted, env.LINKEDIN_ENCRYPTION_KEY)
      : undefined;

    const logs: ApplyRunLog[] = [];
    const log = (message: string) => logs.push({ timestamp: new Date().toISOString(), message });

    await updateApplyRun(db, runId, { status: "running" });

    try {
      await propagateAttributes(
        {
          traceName: "apply-job",
          userId,
          metadata: { jobId, runId },
          tags: ["apply"],
        },
        async () => {
          await processApplyJob(db, jobId, userId, linkedinSessionJson, log);
        }
      );
      await updateApplyRun(db, runId, {
        status: "completed",
        completedAt: new Date(),
        logs,
      });
    } catch (err) {
      log(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      await updateApplyRun(db, runId, {
        status: "failed",
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
        logs,
      });
      throw err;
    } finally {
      await langfuseSpanProcessor.forceFlush();
    }
  },
  { connection: { url: env.REDIS_URL }, concurrency: 1, lockDuration: 10 * 60 * 1000 }
);

applyWorker.on("failed", (job, err) => {
  console.error(`[apply-worker] job ${job?.id} failed:`, err.message);
});
