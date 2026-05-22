import { jobs, jobCriteria, profiles, jobStatusEnum } from "@repo/db";
import { browserManager, loginToLinkedIn, scrapeLinkedInJobs, scoreJob } from "@repo/automation";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { decrypt } from "../lib/encrypt.js";
import type { Context } from "../context.js";

type Db = Context["db"];

export async function runSearch(db: Db, userId: string) {
  const [criteriaRow, profileRow] = await Promise.all([
    db.select().from(jobCriteria).where(eq(jobCriteria.userId, userId)).then((r) => r[0]),
    db.select().from(profiles).where(eq(profiles.userId, userId)).then((r) => r[0]),
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
