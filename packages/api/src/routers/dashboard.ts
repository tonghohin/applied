import { getDashboardStats } from "../services/dashboard.service";
import { protectedProcedure, router } from "../trpc";

export const dashboardRouter = router({
  getStats: protectedProcedure.query(({ ctx }) => getDashboardStats(ctx.db, ctx.session.user.id)),
});
