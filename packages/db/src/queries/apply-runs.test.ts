import { describe, expect, it, vi } from "vitest";

// insert chain: insert().values().returning() → Promise<row[]>
const returning = vi.fn();
const insertValues = vi.fn().mockReturnValue({ returning });
const mockInsert = vi.fn().mockReturnValue({ values: insertValues });

// update chain: update().set().where() → Promise<void>
const updateWhere = vi.fn().mockResolvedValue(undefined);
const set = vi.fn().mockReturnValue({ where: updateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set });

// select chain: select().from().where().orderBy() → Promise<row[]>
const orderBy = vi.fn();
const selectWhere = vi.fn().mockReturnValue({ orderBy });
const from = vi.fn().mockReturnValue({ where: selectWhere });
const mockSelect = vi.fn().mockReturnValue({ from });

const mockDb = {
  insert: mockInsert,
  update: mockUpdate,
  select: mockSelect,
} as never;

vi.mock("../schema/apply-runs", () => ({
  applyRuns: { id: "id_col", jobId: "job_id_col" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
}));

import { insertApplyRun, listLatestApplyRunsByJobIds, updateApplyRun } from "./apply-runs";
import type { NewApplyRun } from "./apply-runs";

const baseRun: NewApplyRun = {
  jobId: "job-1",
  userId: "user-1",
  status: "running",
  startedAt: new Date("2025-05-26T10:00:00Z"),
};

describe("insertApplyRun", () => {
  it("inserts and returns the first row", async () => {
    const mockRow = { ...baseRun, id: "run-1" };
    returning.mockResolvedValueOnce([mockRow]);

    const result = await insertApplyRun(mockDb, baseRun);

    expect(mockInsert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(baseRun);
    expect(returning).toHaveBeenCalled();
    expect(result).toEqual(mockRow);
  });
});

describe("updateApplyRun", () => {
  it("calls update with the correct id and updates", async () => {
    const updates = { status: "completed" as const, completedAt: new Date() };

    await updateApplyRun(mockDb, "run-1", updates);

    expect(mockUpdate).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(updates);
    expect(updateWhere).toHaveBeenCalled();
  });
});

describe("listLatestApplyRunsByJobIds", () => {
  it("returns empty array immediately for empty jobIds without hitting DB", async () => {
    const result = await listLatestApplyRunsByJobIds(mockDb, []);

    expect(mockSelect).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("returns the most recent run per jobId when multiple runs exist", async () => {
    const run1New = { id: "run-2", jobId: "job-1", startedAt: new Date("2025-05-26T11:00:00Z") };
    const run1Old = { id: "run-1", jobId: "job-1", startedAt: new Date("2025-05-26T10:00:00Z") };
    const run2 = { id: "run-3", jobId: "job-2", startedAt: new Date("2025-05-26T10:30:00Z") };

    // rows arrive ordered by startedAt DESC (as the query would return them)
    orderBy.mockResolvedValueOnce([run1New, run1Old, run2]);

    const result = await listLatestApplyRunsByJobIds(mockDb, ["job-1", "job-2"]);

    expect(result).toHaveLength(2);
    // job-1 should have the newer run
    expect(result.find((r) => r.jobId === "job-1")).toEqual(run1New);
    // job-2 should have its only run
    expect(result.find((r) => r.jobId === "job-2")).toEqual(run2);
  });

  it("returns one result per jobId even when a job has many runs", async () => {
    const runs = [
      { id: "run-3", jobId: "job-1", startedAt: new Date("2025-05-26T12:00:00Z") },
      { id: "run-2", jobId: "job-1", startedAt: new Date("2025-05-26T11:00:00Z") },
      { id: "run-1", jobId: "job-1", startedAt: new Date("2025-05-26T10:00:00Z") },
    ];
    orderBy.mockResolvedValueOnce(runs);

    const result = await listLatestApplyRunsByJobIds(mockDb, ["job-1"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(runs[0]);
  });
});
