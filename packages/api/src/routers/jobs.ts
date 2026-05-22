import { z } from "zod";
import {
  applyJobs,
  listJobs,
  runSearch,
  updateJobStatus,
  updateStatusSchema,
} from "../services/jobs.service.js";
import { protectedProcedure, router } from "../trpc.js";

export const jobsRouter = router({
  search: protectedProcedure.mutation(({ ctx }) => {
    const userId = ctx.session.user.id;

    runSearch(ctx.db, userId).catch((err) => {
      console.error("[jobs.search] background error:", err);
    });

    return { queued: true };
  }),

  list: protectedProcedure.query(({ ctx }) => listJobs(ctx.db, ctx.session.user.id)),

  updateStatus: protectedProcedure
    .input(updateStatusSchema)
    .mutation(({ ctx, input }) => updateJobStatus(ctx.db, ctx.session.user.id, input)),

  applyJobs: protectedProcedure
    .input(z.object({ jobIds: z.array(z.uuid()) }))
    .mutation(({ ctx, input }) => applyJobs(ctx.db, ctx.session.user.id, input.jobIds)),
});
