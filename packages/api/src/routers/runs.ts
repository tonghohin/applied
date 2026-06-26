import { getLatestSearchRun } from "@repo/db";
import { protectedProcedure, router } from "../trpc";

export const runsRouter = router({
  latest: protectedProcedure.query(({ ctx }) => getLatestSearchRun(ctx.db, ctx.session.user.id)),
});
