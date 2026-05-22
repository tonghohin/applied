import { publicProcedure, router } from "./trpc.js";
import { profileRouter } from "./routers/profile.js";
import { jobsRouter } from "./routers/jobs.js";

export const appRouter = router({
  health: publicProcedure.query(() => "ok"),
  profile: profileRouter,
  jobs: jobsRouter,
});

export type AppRouter = typeof appRouter;
