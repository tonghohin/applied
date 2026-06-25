import { describe, expect, it, vi } from "vitest";

function resolves<T>(data: T) {
  const chain = Object.assign(Promise.resolve(data), {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
  });
  return chain;
}

const mockSelect = vi.fn();
const mockDb = { select: mockSelect } as never;

const { mockGetJobScheduler, mockGetSearchScheduleForUser } = vi.hoisted(() => ({
  mockGetJobScheduler: vi.fn().mockResolvedValue(undefined),
  mockGetSearchScheduleForUser: vi.fn().mockResolvedValue(null),
}));

vi.mock("../queues/index", () => ({
  getSearchQueue: () => ({ getJobScheduler: mockGetJobScheduler }),
}));

vi.mock("@repo/db", () => ({
  jobs: {
    userId: "userId",
    status: "status",
    fitTier: "fitTier",
    createdAt: "createdAt",
    appliedAt: "appliedAt",
    updatedAt: "updatedAt",
    id: "id",
    title: "title",
    company: "company",
  },
  listSearchRuns: vi.fn(),
  getSearchScheduleForUser: mockGetSearchScheduleForUser,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  desc: vi.fn(() => "desc"),
}));

import { listSearchRuns } from "@repo/db";
import { getDashboardStats } from "./dashboard.service";

type JobRow = {
  id: string;
  title: string;
  company: string;
  status: string;
  fitTier: string;
  createdAt: Date;
  appliedAt: Date | null;
  updatedAt: Date;
};

type SearchRunRow = {
  status: string;
  jobCount: number;
  completedAt: Date | null;
  startedAt: Date;
};

function setupMocks({
  jobRows = [] as JobRow[],
  searchRunRows = [] as SearchRunRow[],
} = {}) {
  mockSelect.mockReturnValueOnce(resolves(jobRows));
  vi.mocked(listSearchRuns).mockResolvedValueOnce(searchRunRows as never);
}

const mockJob = (overrides: Partial<JobRow> = {}): JobRow => ({
  id: "job-1",
  title: "Engineer",
  company: "Acme",
  status: "pending_review",
  fitTier: "strong",
  createdAt: new Date(),
  appliedAt: null,
  updatedAt: new Date(),
  ...overrides,
});

describe("getDashboardStats", () => {
  it("returns empty collections when DB is empty", async () => {
    setupMocks();

    const result = await getDashboardStats(mockDb, "user-1");

    expect(result.jobs).toHaveLength(0);
    expect(result.searchRuns).toHaveLength(0);
  });

  it("passes all job rows through to the frontend unchanged", async () => {
    const job = mockJob({ id: "job-1", status: "applied" });
    setupMocks({ jobRows: [job] });

    const result = await getDashboardStats(mockDb, "user-1");

    expect(result.jobs[0]).toEqual(job);
  });

  it("passes all search run rows through to the frontend unchanged", async () => {
    const run = { status: "completed", jobCount: 5, completedAt: new Date(), startedAt: new Date() };
    setupMocks({ searchRunRows: [run] });

    const result = await getDashboardStats(mockDb, "user-1");

    expect(result.searchRuns[0]).toMatchObject(run);
  });

  it("reports the schedule as disabled when no schedule row exists", async () => {
    setupMocks();
    mockGetSearchScheduleForUser.mockResolvedValueOnce(null);

    const result = await getDashboardStats(mockDb, "user-1");

    expect(result.searchSchedule).toEqual({ enabled: false, nextRunAt: null });
    expect(mockGetJobScheduler).not.toHaveBeenCalled();
  });

  it("maps the Redis scheduler's next millis to a Date when enabled", async () => {
    setupMocks();
    const nextMillis = Date.now() + 60 * 60 * 1000;
    mockGetSearchScheduleForUser.mockResolvedValueOnce({ enabled: true });
    mockGetJobScheduler.mockResolvedValueOnce({ next: nextMillis });

    const result = await getDashboardStats(mockDb, "user-1");

    expect(result.searchSchedule).toEqual({ enabled: true, nextRunAt: new Date(nextMillis) });
    expect(mockGetJobScheduler).toHaveBeenCalledWith("search-schedule:user-1");
  });

  it("returns a null nextRunAt when enabled but no Redis scheduler exists", async () => {
    setupMocks();
    mockGetSearchScheduleForUser.mockResolvedValueOnce({ enabled: true });
    mockGetJobScheduler.mockResolvedValueOnce(undefined);

    const result = await getDashboardStats(mockDb, "user-1");

    expect(result.searchSchedule).toEqual({ enabled: true, nextRunAt: null });
  });
});
