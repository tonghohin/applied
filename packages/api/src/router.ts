import { dashboardRouter } from "./routers/dashboard";
import { eventsRouter } from "./routers/events";
import { jobsRouter } from "./routers/jobs";
import { profileRouter } from "./routers/profile";
import { runsRouter } from "./routers/runs";
import { systemRouter } from "./routers/system";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => "ok"),
  dashboard: dashboardRouter,
  events: eventsRouter,
  profile: profileRouter,
  jobs: jobsRouter,
  runs: runsRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
