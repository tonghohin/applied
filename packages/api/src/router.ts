import { publicProcedure, router } from "./trpc.js";
import { profileRouter } from "./routers/profile.js";

export const appRouter = router({
  health: publicProcedure.query(() => "ok"),
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
