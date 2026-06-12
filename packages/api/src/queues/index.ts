import { Queue } from "bullmq";
import { env } from "../env";

export type SearchJobData = { userId: string; runId?: string };
export type ApplyJobData = { jobId: string; userId: string; runId: string };

const connection = { url: env.REDIS_URL };

export const searchQueue = new Queue<SearchJobData>("search", { connection });
export const applyQueue = new Queue<ApplyJobData>("apply", { connection });
