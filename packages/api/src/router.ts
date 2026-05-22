import { publicProcedure, router } from "./trpc.js";

export const appRouter = router({
  health: publicProcedure.query(() => "ok"),
});

export type AppRouter = typeof appRouter;
