import { describe, expect, it, vi } from "vitest";

// select chain for listJobs: select().from().where() → Promise<row[]>
const selectWhere = vi.fn();
const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: selectFrom });

const mockDb = { select: mockSelect } as never;

vi.mock("@repo/db", () => ({
  jobs: { userId: "userId_col", id: "id_col" },
  jobStatusEnum: { enumValues: ["pending_review", "applied", "failed", "skipped"] },
  listLatestApplyRunsByJobIds: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
}));

vi.mock("@trpc/server", () => ({
  TRPCError: class TRPCError extends Error {
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.name = code;
    }
  },
}));

import { listLatestApplyRunsByJobIds } from "@repo/db";
import { listJobs } from "./jobs.service";

const mockJob = (id: string) => ({
  id,
  userId: "user-1",
  title: "Engineer",
  company: "Acme",
  url: `https://example.com/${id}`,
  platform: "linkedin" as const,
  fitTier: "strong" as const,
  status: "pending_review" as const,
  runId: "run-1",
  listedAt: null,
  appliedAt: null,
  failureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const mockApplyRun = (jobId: string) => ({
  id: `apply-run-for-${jobId}`,
  jobId,
  userId: "user-1",
  status: "completed" as const,
  startedAt: new Date(),
  completedAt: new Date(),
  errorMessage: null,
  logs: [{ timestamp: "2025-05-26T10:00:00Z", message: "Done" }],
});

describe("listJobs", () => {
  it("attaches the latest apply run to jobs that have one", async () => {
    const job1 = mockJob("job-1");
    const job2 = mockJob("job-2");
    const applyRun = mockApplyRun("job-1");

    selectWhere.mockResolvedValueOnce([job1, job2]);
    vi.mocked(listLatestApplyRunsByJobIds).mockResolvedValueOnce([applyRun]);

    const result = await listJobs(mockDb, "user-1");

    expect(result).toHaveLength(2);
    expect(result.find((j) => j.id === "job-1")?.latestApplyRun).toEqual(applyRun);
    expect(result.find((j) => j.id === "job-2")?.latestApplyRun).toBeNull();
  });

  it("sets latestApplyRun to null for all jobs when there are no apply runs", async () => {
    const job = mockJob("job-1");
    selectWhere.mockResolvedValueOnce([job]);
    vi.mocked(listLatestApplyRunsByJobIds).mockResolvedValueOnce([]);

    const result = await listJobs(mockDb, "user-1");

    expect(result[0]?.latestApplyRun).toBeNull();
  });

  it("passes the correct job ids to listLatestApplyRunsByJobIds", async () => {
    const jobs = [mockJob("job-1"), mockJob("job-2"), mockJob("job-3")];
    selectWhere.mockResolvedValueOnce(jobs);
    vi.mocked(listLatestApplyRunsByJobIds).mockResolvedValueOnce([]);

    await listJobs(mockDb, "user-1");

    expect(listLatestApplyRunsByJobIds).toHaveBeenCalledWith(mockDb, ["job-1", "job-2", "job-3"]);
  });
});
