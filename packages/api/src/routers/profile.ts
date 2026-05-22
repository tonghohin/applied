import { profiles, jobCriteria } from "@repo/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { encrypt, decrypt } from "../lib/encrypt.js";
import { protectedProcedure, router } from "../trpc.js";

const upsertProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  githubUrl: z.string().url().optional().or(z.literal("")),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  resumeMarkdown: z.string().min(1),
  coverLetterMarkdown: z.string().min(1),
  linkedinEmail: z.string().email().optional().or(z.literal("")),
  linkedinPassword: z.string().optional(),
});

const upsertCriteriaSchema = z.object({
  jobTitles: z.array(z.string()),
  skills: z.array(z.string()),
  locations: z.array(z.string()),
  remote: z.boolean(),
  seniority: z.array(z.string()),
  minSalary: z.number().int().positive().optional(),
});

export const profileRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [profile, criteria] = await Promise.all([
      ctx.db.select().from(profiles).where(eq(profiles.userId, userId)).then((r) => r[0] ?? null),
      ctx.db.select().from(jobCriteria).where(eq(jobCriteria.userId, userId)).then((r) => r[0] ?? null),
    ]);
    return { profile, criteria };
  }),

  upsertProfile: protectedProcedure.input(upsertProfileSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const { linkedinEmail, linkedinPassword, ...rest } = input;

    const values = {
      ...rest,
      userId,
      linkedinEmailEncrypted: linkedinEmail ? encrypt(linkedinEmail) : null,
      linkedinPasswordEncrypted: linkedinPassword ? encrypt(linkedinPassword) : null,
      updatedAt: new Date(),
    };

    const [row] = await ctx.db
      .insert(profiles)
      .values({ ...values, createdAt: new Date() })
      .onConflictDoUpdate({ target: profiles.userId, set: values })
      .returning();

    return row;
  }),

  upsertCriteria: protectedProcedure.input(upsertCriteriaSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const values = { ...input, userId };

    const [row] = await ctx.db
      .insert(jobCriteria)
      .values(values)
      .onConflictDoUpdate({ target: jobCriteria.userId, set: input })
      .returning();

    return row;
  }),
});
