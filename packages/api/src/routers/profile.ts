import { isValidTimeZone } from "@repo/shared";
import { z } from "zod";
import {
  getProfile,
  upsertAiKey,
  upsertAiKeySchema,
  upsertCoverLetter,
  upsertCoverLetterSchema,
  upsertCriteria,
  upsertCriteriaSchema,
  upsertLinkedIn,
  upsertLinkedInSchema,
  upsertPersonal,
  upsertPersonalSchema,
  upsertResume,
  upsertResumeSchema,
} from "../services/profile.service";
import {
  createDefaultScheduleIfMissing,
  syncSearchScheduler,
  upsertSchedule,
  upsertScheduleSchema,
} from "../services/search-schedule.service";
import { protectedProcedure, router } from "../trpc";

export const profileRouter = router({
  getProfile: protectedProcedure.query(({ ctx }) => getProfile(ctx.db, ctx.session.user.id)),

  upsertPersonal: protectedProcedure
    .input(upsertPersonalSchema)
    .mutation(({ ctx, input }) => upsertPersonal(ctx.db, ctx.session.user.id, input)),

  upsertResume: protectedProcedure
    .input(upsertResumeSchema)
    .mutation(({ ctx, input }) => upsertResume(ctx.db, ctx.session.user.id, input)),

  upsertCoverLetter: protectedProcedure
    .input(upsertCoverLetterSchema)
    .mutation(({ ctx, input }) => upsertCoverLetter(ctx.db, ctx.session.user.id, input)),

  upsertLinkedIn: protectedProcedure
    .input(upsertLinkedInSchema)
    .mutation(async ({ ctx, input }) => {
      await upsertLinkedIn(ctx.db, ctx.session.user.id, input);
      await syncSearchScheduler(ctx.db, ctx.session.user.id);
    }),

  upsertCriteria: protectedProcedure
    .input(
      // Browser timezone rides along so the default schedule can be created on first save
      upsertCriteriaSchema.extend({
        timezone: z.string().refine(isValidTimeZone, "Invalid timezone"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { timezone, ...criteria } = input;
      const row = await upsertCriteria(ctx.db, ctx.session.user.id, criteria);
      await createDefaultScheduleIfMissing(ctx.db, ctx.session.user.id, timezone);
      await syncSearchScheduler(ctx.db, ctx.session.user.id);
      return row;
    }),

  upsertSchedule: protectedProcedure
    .input(upsertScheduleSchema)
    .mutation(({ ctx, input }) => upsertSchedule(ctx.db, ctx.session.user.id, input)),

  upsertAiKey: protectedProcedure
    .input(upsertAiKeySchema)
    .mutation(({ ctx, input }) => upsertAiKey(ctx.db, ctx.session.user.id, input)),
});
