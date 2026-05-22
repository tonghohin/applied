import { applyToJob } from "@repo/ai";
import { browserManager, loginToLinkedIn, scoreJob, scrapeLinkedInJobs } from "@repo/automation";
import { jobCriteria, jobStatusEnum, jobs, profiles } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "../context.js";
import { decrypt } from "../lib/encrypt.js";

type Db = Context["db"];

export async function runSearch(db: Db, userId: string) {
  const [criteriaRow, profileRow] = await Promise.all([
    db
      .select()
      .from(jobCriteria)
      .where(eq(jobCriteria.userId, userId))
      .then((r) => r[0]),
    db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .then((r) => r[0]),
  ]);

  if (!criteriaRow) throw new Error("No job criteria found");
  if (!profileRow?.linkedinEmailEncrypted || !profileRow?.linkedinPasswordEncrypted) {
    throw new Error("LinkedIn credentials not set");
  }

  const email = decrypt(profileRow.linkedinEmailEncrypted);
  const password = decrypt(profileRow.linkedinPasswordEncrypted);

  const browser = await browserManager.getBrowser();
  const page = await browser.newPage();

  try {
    await loginToLinkedIn(page, email, password);

    const scraped = await scrapeLinkedInJobs(page, {
      jobTitles: criteriaRow.jobTitles,
      locations: criteriaRow.locations,
      remote: criteriaRow.remote,
    });

    if (scraped.length === 0) return;

    const rows = scraped.map((job) => ({
      userId,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      url: job.url,
      platform: job.platform,
      fitTier: scoreJob(job, { jobTitles: criteriaRow.jobTitles, skills: criteriaRow.skills }),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await db.insert(jobs).values(rows);
  } finally {
    await page.close();
  }
}

export async function listJobs(db: Db, userId: string) {
  return db.select().from(jobs).where(eq(jobs.userId, userId));
}

export const updateStatusSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(jobStatusEnum.enumValues),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export async function updateJobStatus(db: Db, userId: string, input: UpdateStatusInput) {
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, input.jobId), eq(jobs.userId, userId)));

  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  }

  const [row] = await db
    .update(jobs)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.userId, userId)))
    .returning();

  return row;
}

export async function applyJobs(db: Db, userId: string, jobIds: string[]) {
  const owned = await db
    .select()
    .from(jobs)
    .where(and(inArray(jobs.id, jobIds), eq(jobs.userId, userId)));

  if (owned.length !== jobIds.length) {
    throw new TRPCError({ code: "FORBIDDEN", message: "One or more jobs not found" });
  }

  const pending = owned.filter((j) => j.status === "pending_review");
  if (pending.length === 0) return { queued: true };

  const profileRow = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .then((r) => r[0]);

  if (!profileRow) throw new TRPCError({ code: "BAD_REQUEST", message: "Profile not set up" });

  for (const job of pending) {
    applyToJob(job, profileRow)
      .then(async (result) => {
        if (result.success) {
          await db
            .update(jobs)
            .set({ status: "applied", appliedAt: new Date(), updatedAt: new Date() })
            .where(eq(jobs.id, job.id));
        } else {
          await db
            .update(jobs)
            .set({ status: "failed", failureReason: result.reason, updatedAt: new Date() })
            .where(eq(jobs.id, job.id));
        }
      })
      .catch(async (err: unknown) => {
        const reason = err instanceof Error ? err.message : "Unknown error";
        console.error(`[applyJobs] error for job ${job.id}:`, err);
        await db
          .update(jobs)
          .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
          .where(eq(jobs.id, job.id));
      });
  }

  return { queued: true };
}
