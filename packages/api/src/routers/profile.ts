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
    .mutation(({ ctx, input }) => upsertLinkedIn(ctx.db, ctx.session.user.id, input)),

  upsertCriteria: protectedProcedure
    .input(upsertCriteriaSchema)
    .mutation(({ ctx, input }) => upsertCriteria(ctx.db, ctx.session.user.id, input)),
});
