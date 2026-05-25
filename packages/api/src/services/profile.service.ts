import { WORK_TYPES } from "@repo/shared";
import { jobCriteria, profiles } from "@repo/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "../context";
import { encrypt } from "../lib/encrypt";

type Db = Context["db"];

export const upsertProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  linkedinUrl: z.url().optional().or(z.literal("")),
  githubUrl: z.url().optional().or(z.literal("")),
  websiteUrl: z.url().optional().or(z.literal("")),
  resumeMarkdown: z.string().min(1),
  coverLetterMarkdown: z.string().min(1),
  linkedinEmail: z.email().optional().or(z.literal("")),
  linkedinPassword: z.string().optional(),
});

const locationEntrySchema = z.object({
  location: z.string().min(1),
  workTypes: z.array(z.enum(WORK_TYPES)).min(1),
});

export const upsertCriteriaSchema = z.object({
  jobTitles: z.array(z.string()),
  skills: z.array(z.string()),
  locations: z.array(locationEntrySchema),
  seniority: z.array(z.string()),
  minSalary: z.number().int().positive().optional(),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;
export type UpsertCriteriaInput = z.infer<typeof upsertCriteriaSchema>;

export async function getProfile(db: Db, userId: string) {
  const [profile, criteria] = await Promise.all([
    db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .then((r) => r[0] ?? null),
    db
      .select()
      .from(jobCriteria)
      .where(eq(jobCriteria.userId, userId))
      .then((r) => r[0] ?? null),
  ]);
  return { profile, criteria };
}

export async function upsertProfile(db: Db, userId: string, input: UpsertProfileInput) {
  const { linkedinEmail, linkedinPassword, ...rest } = input;

  const values = {
    ...rest,
    userId,
    linkedinEmailEncrypted: linkedinEmail ? encrypt(linkedinEmail) : null,
    linkedinPasswordEncrypted: linkedinPassword ? encrypt(linkedinPassword) : null,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(profiles)
    .values({ ...values, createdAt: new Date() })
    .onConflictDoUpdate({ target: profiles.userId, set: values })
    .returning();

  return row;
}

export async function upsertCriteria(db: Db, userId: string, input: UpsertCriteriaInput) {
  const values = { ...input, userId };

  const [row] = await db
    .insert(jobCriteria)
    .values(values)
    .onConflictDoUpdate({ target: jobCriteria.userId, set: input })
    .returning();

  return row;
}
