import { runSearch } from "@repo/automation";
import {
  clearLinkedInSession,
  db,
  getLinkedInAccount,
  insertSearchRun,
  saveLinkedInSession,
  updateSearchRun,
} from "@repo/db";
import { Worker } from "bullmq";
import { decrypt, encrypt } from "@repo/shared";
import { env } from "../env";

type SearchJobData = { userId: string };

async function processSearch(userId: string) {
  const account = await getLinkedInAccount(db, userId);
  if (!account) throw new Error("LinkedIn credentials not configured");

  const password = decrypt(account.passwordEncrypted, env.LINKEDIN_ENCRYPTION_KEY);
  const existingSessionJson = account.sessionEncrypted
    ? decrypt(account.sessionEncrypted, env.LINKEDIN_ENCRYPTION_KEY)
    : undefined;

  const run = await insertSearchRun(db, {
    userId,
    platform: "linkedin",
    status: "pending",
    startedAt: new Date(),
  });
  if (!run) throw new Error("Failed to create search run");

  try {
    const { jobCount, newSessionJson } = await runSearch(
      db,
      userId,
      account.email,
      password,
      run.id,
      existingSessionJson
    );
    if (newSessionJson) {
      await saveLinkedInSession(db, userId, encrypt(newSessionJson, env.LINKEDIN_ENCRYPTION_KEY));
    }
    await updateSearchRun(db, run.id, {
      status: "completed",
      completedAt: new Date(),
      jobCount,
    });
  } catch (err) {
    const isCaptcha = err instanceof Error && err.message.toLowerCase().includes("captcha");
    await updateSearchRun(db, run.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    if (isCaptcha) await clearLinkedInSession(db, userId);
    throw err;
  }
}

export const searchWorker = new Worker<SearchJobData>(
  "search",
  async (job) => {
    await processSearch(job.data.userId);
  },
  { connection: { url: env.REDIS_URL }, concurrency: 1, lockDuration: 5 * 60 * 1000 }
);

searchWorker.on("failed", (job, err) => {
  console.error(`[search-worker] job ${job?.id} failed:`, err.message);
});
