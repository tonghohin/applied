import type { ApplyRun, ApplyRunLog, Job, SearchRun } from "@repo/db";

export type SseEvent =
  | ({ type: "job:status"; jobId: string } & Pick<Job, "status" | "appliedAt" | "failureReason" | "updatedAt">)
  | { type: "apply-run:update"; jobId: string; run: ApplyRun }
  | { type: "apply-run:log"; jobId: string; runId: string; log: ApplyRunLog }
  | { type: "search-run:update"; run: SearchRun };
