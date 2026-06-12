import { describe, expect, it, vi } from "vitest";

const mockReturning = vi.fn();
const onConflictDoNothing = vi.fn().mockReturnValue({ returning: mockReturning });
const values = vi.fn().mockReturnValue({ onConflictDoNothing });
const mockInsert = vi.fn().mockReturnValue({ values });

const selectWhere = vi.fn();
const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: selectFrom });

const mockDb = {
  insert: mockInsert,
  select: mockSelect,
} as never;

vi.mock("../schema/jobs", () => ({
  jobs: { userId: "userId_col", url: "url_col" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
}));

import { getJobUrlsForUser, insertJobs } from "./jobs";
import type { NewJob } from "./jobs";

const baseJob: NewJob = {
  userId: "user-1",
  runId: "run-1",
  title: "Software Engineer",
  company: "Acme",
  location: "Toronto, ON",
  url: "https://www.linkedin.com/jobs/view/1/",
  platform: "linkedin",
  fitTier: "strong",
  status: "pending_review",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("insertJobs", () => {
  it("inserts rows with onConflictDoNothing and returning", async () => {
    mockReturning.mockResolvedValueOnce([{ id: "job-1" }]);

    await insertJobs(mockDb, [baseJob]);

    expect(mockInsert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith([baseJob]);
    expect(onConflictDoNothing).toHaveBeenCalled();
    expect(mockReturning).toHaveBeenCalled();
  });

  it("returns 0 when called with an empty array", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await insertJobs(mockDb, []);

    expect(values).toHaveBeenCalledWith([]);
    expect(result).toBe(0);
  });
});

describe("getJobUrlsForUser", () => {
  it("returns the urls of the user's jobs", async () => {
    selectWhere.mockResolvedValueOnce([
      { url: "https://www.linkedin.com/jobs/view/1/" },
      { url: "https://www.linkedin.com/jobs/view/2/" },
    ]);

    const result = await getJobUrlsForUser(mockDb, "user-1");

    expect(result).toEqual([
      "https://www.linkedin.com/jobs/view/1/",
      "https://www.linkedin.com/jobs/view/2/",
    ]);
  });

  it("returns an empty array when the user has no jobs", async () => {
    selectWhere.mockResolvedValueOnce([]);

    const result = await getJobUrlsForUser(mockDb, "user-1");

    expect(result).toEqual([]);
  });
});
