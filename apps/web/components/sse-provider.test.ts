import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: { useUtils: vi.fn() },
}));

vi.mock("react", () => ({
  useRef: vi.fn(() => ({ current: false })),
}));

import type { SseEvent } from "@repo/api";
import type { RouterOutputs } from "@repo/api";
import {
  applyApplyRunLogEvent,
  applyApplyRunUpdateEvent,
  applyDashboardJobStatusEvent,
  applyDashboardSearchRunUpdateEvent,
  applyJobStatusEvent,
} from "./sse-provider";

type JobList = RouterOutputs["jobs"]["list"];
type Stats = RouterOutputs["dashboard"]["getStats"];

const baseJob = {
  id: "job-1",
  userId: "user-1",
  title: "Software Engineer",
  company: "Acme",
  location: "Toronto, ON",
  description: null,
  url: "https://example.com",
  platform: "linkedin" as const,
  workplaceType: "on-site" as const,
  score: 80,
  status: "pending_review" as const,
  runId: "run-1",
  appliedAt: null,
  failureReason: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  latestApplyRun: null,
  appliedCountAtCompany: 0,
  rejectedCountAtCompany: 0,
  appliedTitlesAtCompany: [],
};

const otherJob = { ...baseJob, id: "job-2", title: "Backend Engineer" };

const baseApplyRun = {
  id: "apply-1",
  jobId: "job-1",
  userId: "user-1",
  status: "running" as const,
  startedAt: new Date("2026-01-01T10:00:00Z"),
  completedAt: null,
  errorMessage: null,
  logs: [],
};

const baseRun = {
  id: "run-1",
  userId: "user-1",
  platform: "linkedin" as const,
  status: "running" as const,
  startedAt: new Date("2026-01-01"),
  completedAt: null,
  jobCount: 0,
  errorMessage: null,
  searchCriteria: null,
};

describe("applyJobStatusEvent", () => {
  it("updates the matching job's status fields", () => {
    const jobs: JobList = [baseJob, otherJob];
    const updatedAt = new Date("2026-01-02");
    const event = {
      type: "job:status" as const,
      jobId: "job-1",
      status: "applied" as const,
      appliedAt: updatedAt,
      failureReason: null,
      updatedAt,
    };
    const result = applyJobStatusEvent(jobs, event);
    expect(result[0].status).toBe("applied");
    expect(result[0].appliedAt).toBe(updatedAt);
    expect(result[1]).toBe(otherJob);
  });

  it("leaves non-matching jobs untouched", () => {
    const jobs: JobList = [baseJob, otherJob];
    const event = {
      type: "job:status" as const,
      jobId: "job-99",
      status: "failed" as const,
      appliedAt: null,
      failureReason: "error",
      updatedAt: new Date(),
    };
    const result = applyJobStatusEvent(jobs, event);
    expect(result).toEqual(jobs);
  });
});

describe("applyDashboardJobStatusEvent", () => {
  it("patches only status, appliedAt, updatedAt in dashboard jobs", () => {
    const updatedAt = new Date("2026-01-02");
    const stats: Stats = {
      jobs: [
        {
          id: "job-1",
          title: "SE",
          company: "Acme",
          status: "applying",
          score: 80,
          createdAt: new Date(),
          appliedAt: null,
          updatedAt: new Date(),
        },
      ],
      searchRuns: [],
      searchSchedule: { enabled: false, nextRunAt: null },
    };
    const event = {
      type: "job:status" as const,
      jobId: "job-1",
      status: "applied" as const,
      appliedAt: updatedAt,
      failureReason: null,
      updatedAt,
    };
    const result = applyDashboardJobStatusEvent(stats, event);
    expect(result.jobs[0].status).toBe("applied");
    expect(result.jobs[0].appliedAt).toBe(updatedAt);
    expect(result.searchRuns).toEqual([]);
  });
});

describe("applyApplyRunUpdateEvent", () => {
  it("replaces latestApplyRun on the matching job", () => {
    const jobs: JobList = [baseJob, otherJob];
    const event: Extract<SseEvent, { type: "apply-run:update" }> = {
      type: "apply-run:update",
      jobId: "job-1",
      run: baseApplyRun,
    };
    const result = applyApplyRunUpdateEvent(jobs, event);
    expect(result[0].latestApplyRun).toBe(baseApplyRun);
    expect(result[1].latestApplyRun).toBeNull();
  });
});

describe("applyApplyRunLogEvent", () => {
  it("appends the log entry to latestApplyRun.logs", () => {
    const jobWithRun = { ...baseJob, latestApplyRun: { ...baseApplyRun, logs: [] } };
    const jobs: JobList = [jobWithRun, otherJob];
    const newLog = { timestamp: "2026-01-01T10:01:00.000Z", message: "Step 1" };
    const event: Extract<SseEvent, { type: "apply-run:log" }> = {
      type: "apply-run:log",
      jobId: "job-1",
      runId: "apply-1",
      log: newLog,
    };
    const result = applyApplyRunLogEvent(jobs, event);
    expect(result[0].latestApplyRun?.logs).toEqual([newLog]);
    expect(result[1]).toBe(otherJob);
  });

  it("does not mutate jobs without a latestApplyRun", () => {
    const jobs: JobList = [baseJob];
    const event: Extract<SseEvent, { type: "apply-run:log" }> = {
      type: "apply-run:log",
      jobId: "job-1",
      runId: "apply-1",
      log: { timestamp: "2026-01-01T10:01:00.000Z", message: "Step 1" },
    };
    const result = applyApplyRunLogEvent(jobs, event);
    expect(result[0]).toBe(baseJob);
  });
});

describe("applyDashboardSearchRunUpdateEvent", () => {
  it("replaces the matching run in stats.searchRuns", () => {
    const stats: Stats = {
      jobs: [],
      searchRuns: [baseRun],
      searchSchedule: { enabled: false, nextRunAt: null },
    };
    const updatedRun = { ...baseRun, status: "completed" as const, jobCount: 5 };
    const event: Extract<SseEvent, { type: "search-run:update" }> = {
      type: "search-run:update",
      run: updatedRun,
    };
    const result = applyDashboardSearchRunUpdateEvent(stats, event);
    expect(result.searchRuns[0]).toBe(updatedRun);
    expect(result.jobs).toEqual([]);
  });

  it("prepends a run that is not in stats.searchRuns yet", () => {
    const stats: Stats = {
      jobs: [],
      searchRuns: [baseRun],
      searchSchedule: { enabled: false, nextRunAt: null },
    };
    const newRun = { ...baseRun, id: "run-new", status: "pending" as const };
    const event: Extract<SseEvent, { type: "search-run:update" }> = {
      type: "search-run:update",
      run: newRun,
    };
    const result = applyDashboardSearchRunUpdateEvent(stats, event);
    expect(result.searchRuns).toHaveLength(2);
    expect(result.searchRuns[0]).toBe(newRun);
    expect(result.searchRuns[1]).toBe(baseRun);
  });
});
