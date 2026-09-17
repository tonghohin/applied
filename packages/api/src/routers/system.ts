import { getLatestReleaseVersion } from "../services/version.service";
import { protectedProcedure, router } from "../trpc";

export const systemRouter = router({
  latestVersion: protectedProcedure.query(() => getLatestReleaseVersion()),
});
