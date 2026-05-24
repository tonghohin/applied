import { runSearch } from "@repo/automation";
import { db, profiles } from "@repo/db";
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

  if (!profileRow?.linkedinEmailEncrypted || !profileRow?.linkedinPasswordEncrypted) {
    throw new Error("LinkedIn credentials not set");
  }

  const email = decrypt(profileRow.linkedinEmailEncrypted);
  const password = decrypt(profileRow.linkedinPasswordEncrypted);

  await runSearch(db, userId, email, password);
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
