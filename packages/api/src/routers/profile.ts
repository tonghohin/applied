import {
  syncSearchScheduler,
  upsertSchedule,
  upsertScheduleSchema,
} from "../services/search-schedule.service";
import {
  getProfile,
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
    .input(upsertCriteriaSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await upsertCriteria(ctx.db, ctx.session.user.id, input);
      await syncSearchScheduler(ctx.db, ctx.session.user.id);
      return row;
    }),

  upsertSchedule: protectedProcedure
    .input(upsertScheduleSchema)
    .mutation(({ ctx, input }) => upsertSchedule(ctx.db, ctx.session.user.id, input)),
});
