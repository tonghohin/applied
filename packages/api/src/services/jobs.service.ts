import { jobStatusEnum, jobs } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "../context";

type Db = Context["db"];

export async function validateApplyJobs(db: Db, userId: string, jobIds: string[]) {
  const owned = await db
    .select()
    .from(jobs)
    .where(and(inArray(jobs.id, jobIds), eq(jobs.userId, userId)));

  if (owned.length !== jobIds.length) {
    throw new TRPCError({ code: "FORBIDDEN", message: "One or more jobs not found" });
  }

  return owned.filter((j) => j.status === "pending_review");
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
