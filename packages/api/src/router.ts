import { dashboardRouter } from "./routers/dashboard";
import { jobsRouter } from "./routers/jobs";
import { profileRouter } from "./routers/profile";
import { runsRouter } from "./routers/runs";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => "ok"),
  dashboard: dashboardRouter,
  profile: profileRouter,
  jobs: jobsRouter,
  runs: runsRouter,
});

export type AppRouter = typeof appRouter;
