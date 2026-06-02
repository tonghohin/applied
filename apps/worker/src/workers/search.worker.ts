import { runSearch } from "@repo/automation";
import {
  clearLinkedInSession,
  db,
  getLinkedInAccount,
  saveLinkedInSession,
  updateSearchRun,
} from "@repo/db";
import { decrypt, encrypt } from "@repo/shared";
import { Worker } from "bullmq";
import { env } from "../env";
import { publishEvent } from "../redis";

type SearchJobData = { userId: string; runId: string };

async function processSearch(userId: string, runId: string) {
  const account = await getLinkedInAccount(db, userId);
  if (!account) throw new Error("LinkedIn credentials not configured");

  const password = decrypt(account.passwordEncrypted, env.LINKEDIN_ENCRYPTION_KEY);
  const existingSessionJson = account.sessionEncrypted
    ? decrypt(account.sessionEncrypted, env.LINKEDIN_ENCRYPTION_KEY)
    : undefined;

  const runningRun = await updateSearchRun(db, runId, { status: "running" });
  if (runningRun) publishEvent(userId, { type: "search-run:update", run: runningRun });

  try {
    const { jobCount, newSessionJson } = await runSearch(
      db,
      userId,
      account.email,
      password,
      runId,
      existingSessionJson
    );
    if (newSessionJson) {
      await saveLinkedInSession(db, userId, encrypt(newSessionJson, env.LINKEDIN_ENCRYPTION_KEY));
    }
    const completedRun = await updateSearchRun(db, runId, {
      status: "completed",
      completedAt: new Date(),
      jobCount,
    });
    if (completedRun) publishEvent(userId, { type: "search-run:update", run: completedRun });
  } catch (err) {
    const isCaptcha = err instanceof Error && err.message.toLowerCase().includes("captcha");
    const failedRun = await updateSearchRun(db, runId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    if (failedRun) publishEvent(userId, { type: "search-run:update", run: failedRun });
    if (isCaptcha) await clearLinkedInSession(db, userId);
    throw err;
  }
}

export const searchWorker = new Worker<SearchJobData>(
  "search",
  async (job) => {
    await processSearch(job.data.userId, job.data.runId);
  },
  { connection: { url: env.REDIS_URL }, concurrency: 1, lockDuration: 5 * 60 * 1000 }
);

searchWorker.on("failed", (job, err) => {
  console.error(`[search-worker] job ${job?.id} failed:`, err.message);
});
