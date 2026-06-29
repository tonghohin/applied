import { getAiGatewayKey } from "@repo/api";
import { runSearch } from "@repo/automation";
import type { ScrapedJob } from "@repo/automation";
import { scoreJob as scoreJobWithLLM } from "@repo/ai";
import {
  clearLinkedInSession,
  getDb,
  getJobCriteriaForUser,
  getLinkedInAccount,
  getProfileForUser,
  hasActiveSearchRun,
  insertSearchRun,
  saveLinkedInSession,
  updateSearchRun,
} from "@repo/db";
import { decrypt, encrypt, getMissingSearchFields } from "@repo/shared";
import { Worker } from "bullmq";
import { env } from "../env";
import { publishEvent } from "../redis";

type SearchJobData = { userId: string; runId?: string };

async function processSearch(userId: string, runId: string) {
  const runningRun = await updateSearchRun(getDb(), runId, { status: "running" });
  if (runningRun) publishEvent(userId, { type: "search-run:update", run: runningRun });

  try {
    const [account, profile, aiGatewayKey, criteria] = await Promise.all([
      getLinkedInAccount(getDb(), userId),
      getProfileForUser(getDb(), userId),
      getAiGatewayKey(getDb(), userId),
      getJobCriteriaForUser(getDb(), userId),
    ]);

    if (!account) throw new Error("LinkedIn credentials not configured");
    if (!profile?.resume) throw new Error("Resume is required to score jobs — add your resume in Profile settings.");
    if (!aiGatewayKey) throw new Error("AI Gateway API key not configured");

    const scorer = (job: ScrapedJob) =>
      scoreJobWithLLM(job, profile.resume, aiGatewayKey, criteria?.minSalary);

    const password = decrypt(account.passwordEncrypted, env.ENCRYPTION_KEY);
    const existingSessionJson = account.sessionEncrypted
      ? decrypt(account.sessionEncrypted, env.ENCRYPTION_KEY)
      : undefined;

    const { jobCount, newSessionJson } = await runSearch(
      getDb(),
      userId,
      account.email,
      password,
      runId,
      scorer,
      existingSessionJson
    );
    if (newSessionJson) {
      await saveLinkedInSession(getDb(), userId, encrypt(newSessionJson, env.ENCRYPTION_KEY));
    }
    const completedRun = await updateSearchRun(getDb(), runId, {
      status: "completed",
      completedAt: new Date(),
      jobCount,
    });
    if (completedRun) publishEvent(userId, { type: "search-run:update", run: completedRun });
  } catch (err) {
    const isCaptcha = err instanceof Error && err.message.toLowerCase().includes("captcha");
    const failedRun = await updateSearchRun(getDb(), runId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    if (failedRun) publishEvent(userId, { type: "search-run:update", run: failedRun });
    if (isCaptcha) await clearLinkedInSession(getDb(), userId);
    throw err;
  }
}

async function processScheduledTick(userId: string) {
  const [profile, criteria, account] = await Promise.all([
    getProfileForUser(getDb(), userId),
    getJobCriteriaForUser(getDb(), userId),
    getLinkedInAccount(getDb(), userId),
  ]);

  const missingFields = getMissingSearchFields(profile, criteria, account);
  if (missingFields.length > 0) {
    console.log(
      `[search-worker] scheduled search skipped for user ${userId}: missing ${missingFields.join(", ")}`
    );
    return;
  }

  if (await hasActiveSearchRun(getDb(), userId)) {
    console.log(
      `[search-worker] scheduled search skipped for user ${userId}: a run is already active`
    );
    return;
  }

  const run = await insertSearchRun(getDb(), {
    userId,
    platform: "linkedin",
    status: "pending",
    startedAt: new Date(),
  });
  if (!run) throw new Error("Failed to create search run");
  publishEvent(userId, { type: "search-run:update", run });

  await processSearch(userId, run.id);
}

export const searchWorker = new Worker<SearchJobData>(
  "search",
  async (job) => {
    if (job.data.runId) {
      await processSearch(job.data.userId, job.data.runId);
    } else {
      await processScheduledTick(job.data.userId);
    }
  },
  {
    connection: { url: env.REDIS_URL },
    concurrency: 1,
    // lockDuration bounds stall detection, not total run time — BullMQ renews the lock
    // every lockDuration/2 while the processor runs. A search run routinely exceeds 5
    // minutes (locations × workTypes × maxPages pages, with human-mimicry dwells per
    // job); that's fine as long as the event loop stays responsive so renewals fire.
    lockDuration: 5 * 60 * 1000,
  }
);

searchWorker.on("failed", (job, err) => {
  console.error(`[search-worker] job ${job?.id} failed:`, err.message);
});
