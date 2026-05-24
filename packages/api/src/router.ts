import { jobsRouter } from "./routers/jobs";
import { profileRouter } from "./routers/profile";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => "ok"),
  profile: profileRouter,
  jobs: jobsRouter,
});

export type AppRouter = typeof appRouter;
