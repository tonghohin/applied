import { pgEnum } from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", ["linkedin"]);
export const fitTierEnum = pgEnum("fit_tier", ["strong", "potential", "weak"]);
export const jobStatusEnum = pgEnum("job_status", [
  "pending_review",
  "applied",
  "failed",
  "skipped",
]);
export const searchRunStatusEnum = pgEnum("search_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);
export const applyRunStatusEnum = pgEnum("apply_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);
