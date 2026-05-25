import { runSearch } from "@repo/automation";
import { db, insertSearchRun, profiles, updateSearchRun } from "@repo/db";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { decrypt } from "../decrypt";
import { env } from "../env";

type SearchJobData = { userId: string };

async function processSearch(userId: string) {
  const profileRow = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .then((r) => r[0]);

  if (!profileRow?.linkedinEmail || !profileRow?.linkedinPasswordEncrypted) {
    throw new Error("LinkedIn credentials not set");
  }

  const email = profileRow.linkedinEmail;
  const password = decrypt(profileRow.linkedinPasswordEncrypted);

  const run = await insertSearchRun(db, {
    userId,
    platform: "linkedin",
    status: "pending",
    startedAt: new Date(),
  });
  if (!run) throw new Error("Failed to create search run");

  try {
    const jobCount = await runSearch(db, userId, email, password, run.id);
    await updateSearchRun(db, run.id, {
      status: "completed",
      completedAt: new Date(),
      jobCount,
    });
  } catch (err) {
    await updateSearchRun(db, run.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export const searchWorker = new Worker<SearchJobData>(
  "search",
  async (job) => {
    await processSearch(job.data.userId);
  },
  { connection: { url: env.REDIS_URL }, concurrency: 1 },
);

searchWorker.on("failed", (job, err) => {
  console.error(`[search-worker] job ${job?.id} failed:`, err.message);
});
