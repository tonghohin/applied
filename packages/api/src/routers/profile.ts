import {
  getProfile,
  upsertCriteria,
  upsertCriteriaSchema,
  upsertProfile,
  upsertProfileSchema,
} from "../services/profile.service";
import { protectedProcedure, router } from "../trpc";

export const profileRouter = router({
  getProfile: protectedProcedure.query(({ ctx }) => getProfile(ctx.db, ctx.session.user.id)),

  upsertProfile: protectedProcedure
    .input(upsertProfileSchema)
    .mutation(({ ctx, input }) => upsertProfile(ctx.db, ctx.session.user.id, input)),

  upsertCriteria: protectedProcedure
    .input(upsertCriteriaSchema)
    .mutation(({ ctx, input }) => upsertCriteria(ctx.db, ctx.session.user.id, input)),
});
