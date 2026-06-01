import { protectedProcedure, router } from "../trpc";
import { getDashboardStats } from "../services/dashboard.service";

export const dashboardRouter = router({
  getStats: protectedProcedure.query(({ ctx }) =>
    getDashboardStats(ctx.db, ctx.session.user.id),
  ),
});
