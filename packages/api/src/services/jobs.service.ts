import {
  getJobCriteriaForUser,
  jobCriteria,
  jobStatusEnum,
  jobs,
  listLatestApplyRunsByJobIds,
} from "@repo/db";
import { isExcluded } from "@repo/shared";
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

  return owned.filter((j) => j.status === "pending_review" || j.status === "failed");
}

export async function listJobs(db: Db, userId: string) {
  const jobRows = await db.select().from(jobs).where(eq(jobs.userId, userId));
  const applyRuns = await listLatestApplyRunsByJobIds(
    db,
    jobRows.map((j) => j.id)
  );
  const applyRunByJobId = new Map(applyRuns.map((r) => [r.jobId, r]));
  return jobRows.map((job) => ({ ...job, latestApplyRun: applyRunByJobId.get(job.id) ?? null }));
}

export const updateStatusSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(jobStatusEnum.enumValues),
});

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const excludeKeywordSchema = z.object({
  keyword: z.string().trim().min(2).max(50),
});

export type ExcludeKeywordInput = z.infer<typeof excludeKeywordSchema>;

export async function excludeKeyword(db: Db, userId: string, input: ExcludeKeywordInput) {
  const criteria = await getJobCriteriaForUser(db, userId);

  if (!criteria) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Set up job criteria first" });
  }

  const { keyword } = input;
  const alreadyExcluded = criteria.excludeKeywords.some(
    (existing) => existing.toLowerCase() === keyword.toLowerCase()
  );

  if (!alreadyExcluded) {
    await db
      .update(jobCriteria)
      .set({ excludeKeywords: [...criteria.excludeKeywords, keyword] })
      .where(eq(jobCriteria.userId, userId));
  }

  const skippable = await db
    .select({ id: jobs.id, title: jobs.title })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), inArray(jobs.status, ["pending_review", "failed"])));

  const matchingIds = skippable
    .filter((job) => isExcluded(job.title, [keyword]))
    .map((job) => job.id);

  if (matchingIds.length > 0) {
    await db
      .update(jobs)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(and(eq(jobs.userId, userId), inArray(jobs.id, matchingIds)));
  }

  return { keyword, skippedCount: matchingIds.length, alreadyExcluded };
}

export const excludeCompanySchema = z.object({
  company: z.string().trim().min(2).max(100),
});

export type ExcludeCompanyInput = z.infer<typeof excludeCompanySchema>;

export async function excludeCompany(db: Db, userId: string, input: ExcludeCompanyInput) {
  const criteria = await getJobCriteriaForUser(db, userId);

  if (!criteria) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Set up job criteria first" });
  }

  const { company } = input;
  const alreadyExcluded = criteria.excludeCompanies.some(
    (existing) => existing.toLowerCase() === company.toLowerCase()
  );

  if (!alreadyExcluded) {
    await db
      .update(jobCriteria)
      .set({ excludeCompanies: [...criteria.excludeCompanies, company] })
      .where(eq(jobCriteria.userId, userId));
  }

  const skippable = await db
    .select({ id: jobs.id, company: jobs.company })
    .from(jobs)
    .where(and(eq(jobs.userId, userId), inArray(jobs.status, ["pending_review", "failed"])));

  const matchingIds = skippable
    .filter((job) => isExcluded(job.company, [company]))
    .map((job) => job.id);

  if (matchingIds.length > 0) {
    await db
      .update(jobs)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(and(eq(jobs.userId, userId), inArray(jobs.id, matchingIds)));
  }

  return { company, skippedCount: matchingIds.length, alreadyExcluded };
}

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
