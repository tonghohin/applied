import { Queue } from "bullmq";

export type SearchJobData = { userId: string; runId?: string };
export type ApplyJobData = { jobId: string; userId: string; runId: string };

function getConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");
  return { url };
}

let _searchQueue: Queue<SearchJobData> | undefined;
let _applyQueue: Queue<ApplyJobData> | undefined;

export function getSearchQueue(): Queue<SearchJobData> {
  if (!_searchQueue) _searchQueue = new Queue<SearchJobData>("search", { connection: getConnection() });
  return _searchQueue;
}

export function getApplyQueue(): Queue<ApplyJobData> {
  if (!_applyQueue) _applyQueue = new Queue<ApplyJobData>("apply", { connection: getConnection() });
  return _applyQueue;
}
