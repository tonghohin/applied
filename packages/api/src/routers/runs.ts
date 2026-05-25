import { listSearchRuns } from "@repo/db";
import { protectedProcedure, router } from "../trpc";

export const runsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listSearchRuns(ctx.db, ctx.session.user.id)),
});
