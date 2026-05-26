import { getJobCriteriaForUser, getLinkedInAccount, getProfileForUser } from "@repo/db";
import { getMissingSearchFields } from "@repo/shared";
import { TRPCError } from "@trpc/server";
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
    const userId = ctx.session.user.id;
    const [profile, criteria, linkedinAccount] = await Promise.all([
      getProfileForUser(ctx.db, userId),
      getJobCriteriaForUser(ctx.db, userId),
      getLinkedInAccount(ctx.db, userId),
    ]);

    const missingFields = getMissingSearchFields(profile, criteria, linkedinAccount);

    if (missingFields.length > 0) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: missingFields.join(", ") });
    }

    await searchQueue.add("search", { userId });
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
