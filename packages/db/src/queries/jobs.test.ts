import { describe, expect, it, vi } from "vitest";

const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
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
  jobs: { userId: "userId_col", listedAt: "listed_at_col" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  max: vi.fn((col: unknown) => ({ max: col })),
}));

import { getLatestListedAtForUser, insertJobs } from "./jobs";
import type { NewJob } from "./jobs";

const baseJob: NewJob = {
  userId: "user-1",
  runId: "run-1",
  title: "Software Engineer",
  company: "Acme",
  url: "https://www.linkedin.com/jobs/view/1/",
  platform: "linkedin",
  fitTier: "strong",
  status: "pending_review",
  listedAt: new Date("2025-05-24T10:00:00Z"),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("insertJobs", () => {
  it("inserts rows with onConflictDoNothing", async () => {
    await insertJobs(mockDb, [baseJob]);

    expect(mockInsert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith([baseJob]);
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it("does not throw when called with an empty array", async () => {
    await expect(insertJobs(mockDb, [])).resolves.toBeUndefined();
    expect(values).toHaveBeenCalledWith([]);
  });

  it("includes listedAt in the inserted values", async () => {
    const job = { ...baseJob, listedAt: new Date("2025-05-01T00:00:00Z") };
    await insertJobs(mockDb, [job]);

    const [insertedRows] = values.mock.lastCall as [NewJob[]];
    expect(insertedRows[0]?.listedAt).toEqual(new Date("2025-05-01T00:00:00Z"));
  });
});

describe("getLatestListedAtForUser", () => {
  it("returns the latest listedAt date when jobs exist", async () => {
    const date = new Date("2025-05-24T10:00:00Z");
    selectWhere.mockResolvedValueOnce([{ latest: date }]);

    const result = await getLatestListedAtForUser(mockDb, "user-1");

    expect(result).toEqual(date);
  });

  it("returns null when no jobs exist for the user", async () => {
    selectWhere.mockResolvedValueOnce([{ latest: null }]);

    const result = await getLatestListedAtForUser(mockDb, "user-1");

    expect(result).toBeNull();
  });
});
