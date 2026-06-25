import { propagateAttributes } from "@langfuse/tracing";
import { processApplyJob } from "@repo/ai";
import { getAiGatewayKey } from "@repo/api";
import { getDb, getLinkedInAccount, updateApplyRun, updateJobFailed } from "@repo/db";
import type { ApplyRunLog } from "@repo/db";
import { decrypt } from "@repo/shared";
import { Worker } from "bullmq";
import { env } from "../env";
import { langfuseSpanProcessor } from "../instrumentation";
import { publishEvent } from "../redis";

type ApplyJobData = { jobId: string; userId: string; runId: string };

export const applyWorker = new Worker<ApplyJobData>(
  "apply",
  async (job) => {
    const { jobId, userId, runId } = job.data;
    const account = await getLinkedInAccount(getDb(), userId);
    const aiGatewayKey = await getAiGatewayKey(getDb(), userId);
    if (!aiGatewayKey)
      throw new Error("AI Gateway API key not configured — add it in Settings → AI");
    const linkedinSessionJson = account?.sessionEncrypted
      ? decrypt(account.sessionEncrypted, env.ENCRYPTION_KEY)
      : undefined;

    const logs: ApplyRunLog[] = [];
    const log = (message: string) => {
      const entry: ApplyRunLog = { timestamp: new Date().toISOString(), message };
      logs.push(entry);
      publishEvent(userId, { type: "apply-run:log", jobId, runId, log: entry });
    };

    const runningRun = await updateApplyRun(getDb(), runId, { status: "running" });
    if (runningRun) publishEvent(userId, { type: "apply-run:update", jobId, run: runningRun });

    try {
      let applyResult: Awaited<ReturnType<typeof processApplyJob>> | undefined;
      await propagateAttributes(
        {
          traceName: "apply-job",
          userId,
          metadata: { jobId, runId },
          tags: ["apply"],
        },
        async () => {
          applyResult = await processApplyJob(getDb(), jobId, userId, aiGatewayKey, linkedinSessionJson, log);
        }
      );
      const completedAt = new Date();
      const completedRun = await updateApplyRun(getDb(), runId, {
        status: "completed",
        completedAt,
        logs,
      });
      if (completedRun)
        publishEvent(userId, { type: "apply-run:update", jobId, run: completedRun });
      if (applyResult?.success) {
        publishEvent(userId, {
          type: "job:status",
          jobId,
          status: "applied",
          appliedAt: completedAt,
          failureReason: null,
          updatedAt: completedAt,
        });
      } else {
        publishEvent(userId, {
          type: "job:status",
          jobId,
          status: "failed",
          appliedAt: null,
          failureReason:
            applyResult?.success === false
              ? (applyResult.reason ?? "Unknown error")
              : "Unknown error",
          updatedAt: completedAt,
        });
      }
    } catch (err) {
      log(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      const completedAt = new Date();
      const failureReason = err instanceof Error ? err.message : String(err);
      // processApplyJob only updates the job row when applyToJob returns; on a thrown
      // error the job would otherwise stay in "applying" forever.
      await updateJobFailed(getDb(), jobId, failureReason);
      const failedRun = await updateApplyRun(getDb(), runId, {
        status: "failed",
        completedAt,
        errorMessage: failureReason,
        logs,
      });
      if (failedRun) publishEvent(userId, { type: "apply-run:update", jobId, run: failedRun });
      publishEvent(userId, {
        type: "job:status",
        jobId,
        status: "failed",
        appliedAt: null,
        failureReason,
        updatedAt: completedAt,
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
