import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { jobs } from "../schema/jobs";

export type NewJob = typeof jobs.$inferInsert;

export async function getJobForUser(db: Db, jobId: string, userId: string) {
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .then((r) => r[0]);
}

export async function insertJobs(db: Db, rows: NewJob[]) {
  const result = await db
    .insert(jobs)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: jobs.id });
  return result.length;
}

export async function getJobUrlsForUser(db: Db, userId: string) {
  const result = await db.select({ url: jobs.url }).from(jobs).where(eq(jobs.userId, userId));
  return result.map((row) => row.url);
}

export async function getJobIdentitiesForUser(db: Db, userId: string) {
  const result = await db
    .select({ company: jobs.company, title: jobs.title, location: jobs.location })
    .from(jobs)
    .where(eq(jobs.userId, userId));
  return result;
}

export async function updateJobApplying(db: Db, jobId: string) {
  await db
    .update(jobs)
    .set({ status: "applying", updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

export async function updateJobApplied(db: Db, jobId: string) {
  await db
    .update(jobs)
    .set({ status: "applied", appliedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}

export async function updateJobFailed(db: Db, jobId: string, reason: string) {
  await db
    .update(jobs)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
}
