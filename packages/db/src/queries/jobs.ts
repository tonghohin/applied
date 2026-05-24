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
  await db.insert(jobs).values(rows);
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
