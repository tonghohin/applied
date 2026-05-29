import { getLinkedInAccount, jobCriteria, profiles, upsertLinkedInAccount } from "@repo/db";
import { WORK_TYPES, encrypt } from "@repo/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "../context";
import { env } from "../env";

type Db = Context["db"];

export const upsertPersonalSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  linkedinUrl: z.url().optional().or(z.literal("")),
  githubUrl: z.url().optional().or(z.literal("")),
  websiteUrl: z.url().optional().or(z.literal("")),
  requiresSponsorship: z.boolean(),
});

export const upsertResumeSchema = z.object({
  resume: z.string().min(1),
});

export const upsertCoverLetterSchema = z.object({
  coverLetterInstructions: z.string().optional(),
});

export const upsertLinkedInSchema = z.object({
  linkedinEmail: z.email(),
  linkedinPassword: z.string().min(1),
});

const locationEntrySchema = z.object({
  location: z.string().min(1),
  workTypes: z.array(z.enum(WORK_TYPES)).min(1),
});

export const upsertCriteriaSchema = z.object({
  jobTitle: z.string().min(1, "Required"),
  skills: z.array(z.string()),
  locations: z.array(locationEntrySchema),
  seniority: z.array(z.string()),
  minSalary: z.number().int().positive().optional(),
});

export type UpsertPersonalInput = z.infer<typeof upsertPersonalSchema>;
export type UpsertResumeInput = z.infer<typeof upsertResumeSchema>;
export type UpsertCoverLetterInput = z.infer<typeof upsertCoverLetterSchema>;
export type UpsertLinkedInInput = z.infer<typeof upsertLinkedInSchema>;
export type UpsertCriteriaInput = z.infer<typeof upsertCriteriaSchema>;

export async function getProfile(db: Db, userId: string) {
  const [profile, criteria, linkedinAccount] = await Promise.all([
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
    getLinkedInAccount(db, userId),
  ]);
  return { profile, criteria, linkedinAccount };
}

export async function upsertPersonal(db: Db, userId: string, input: UpsertPersonalInput) {
  const set = { ...input, updatedAt: new Date() };
  const [row] = await db
    .insert(profiles)
    .values({ ...set, userId, resume: "", createdAt: new Date() })
    .onConflictDoUpdate({ target: profiles.userId, set })
    .returning();
  return row;
}

export async function upsertResume(db: Db, userId: string, input: UpsertResumeInput) {
  const set = { ...input, updatedAt: new Date() };
  const [row] = await db
    .insert(profiles)
    .values({
      ...set,
      userId,
      firstName: "",
      lastName: "",
      phone: "",
      address: "",
      createdAt: new Date(),
    })
    .onConflictDoUpdate({ target: profiles.userId, set })
    .returning();
  return row;
}

export async function upsertCoverLetter(db: Db, userId: string, input: UpsertCoverLetterInput) {
  const set = { ...input, updatedAt: new Date() };
  const [row] = await db
    .insert(profiles)
    .values({
      ...set,
      userId,
      firstName: "",
      lastName: "",
      phone: "",
      address: "",
      resume: "",
      createdAt: new Date(),
    })
    .onConflictDoUpdate({ target: profiles.userId, set })
    .returning();
  return row;
}

export async function upsertLinkedIn(db: Db, userId: string, input: UpsertLinkedInInput) {
  const { linkedinEmail, linkedinPassword } = input;
  await upsertLinkedInAccount(db, userId, {
    email: linkedinEmail,
    passwordEncrypted: encrypt(linkedinPassword, env.LINKEDIN_ENCRYPTION_KEY),
  });
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
