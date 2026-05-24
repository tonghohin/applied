import { z } from "zod";
import { applyQueue, searchQueue } from "../queues/index";
import {
  listJobs,
  updateJobStatus,
  updateStatusSchema,
  validateApplyJobs,
} from "../services/jobs.service";
import { protectedProcedure, router } from "../trpc";

export const jobsRouter = router({
  search: protectedProcedure.mutation(async ({ ctx }) => {
    await searchQueue.add("search", { userId: ctx.session.user.id });
    return { queued: true };
  }),

  list: protectedProcedure.query(({ ctx }) => listJobs(ctx.db, ctx.session.user.id)),

  updateStatus: protectedProcedure
    .input(updateStatusSchema)
    .mutation(({ ctx, input }) => updateJobStatus(ctx.db, ctx.session.user.id, input)),

  applyJobs: protectedProcedure
    .input(z.object({ jobIds: z.array(z.uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const pending = await validateApplyJobs(ctx.db, userId, input.jobIds);
      await Promise.all(pending.map((j) => applyQueue.add("apply", { jobId: j.id, userId })));
      return { queued: true };
    }),
});
