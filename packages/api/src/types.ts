import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "./router.js";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
