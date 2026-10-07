import { beforeEach, describe, expect, it, vi } from "vitest";

// insert chain: insert().values().onConflictDoUpdate().returning() → Promise<row[]>
const returning = vi.fn();
const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
const insertValues = vi.fn().mockReturnValue({ onConflictDoUpdate });
const mockInsert = vi.fn().mockReturnValue({ values: insertValues });

// select chain: select().from().where() → Promise<row[]>
const selectWhere = vi.fn();
const from = vi.fn().mockReturnValue({ where: selectWhere });
const mockSelect = vi.fn().mockReturnValue({ from });

// delete chain: delete().where().returning() → Promise<row[]>
const deleteReturning = vi.fn();
const deleteWhere = vi.fn().mockReturnValue({ returning: deleteReturning });
const mockDelete = vi.fn().mockReturnValue({ where: deleteWhere });

const mockDb = { insert: mockInsert, select: mockSelect, delete: mockDelete } as never;

vi.mock("../schema/tailored-documents", () => ({
  tailoredDocuments: {
    jobId: "job_id_col",
    userId: "user_id_col",
    kind: "kind_col",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
}));

import {
  deleteTailoredDocument,
  getTailoredDocument,
  getTailoredDocumentsForJob,
  upsertTailoredDocument,
} from "./tailored-documents";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTailoredDocumentsForJob", () => {
  it("filters by both job id and user id", async () => {
    const rows = [{ id: "doc-1" }, { id: "doc-2" }];
    selectWhere.mockResolvedValueOnce(rows);

    const result = await getTailoredDocumentsForJob(mockDb, "job-1", "user-1");

    expect(selectWhere).toHaveBeenCalledWith({
      and: [
        { col: "job_id_col", val: "job-1" },
        { col: "user_id_col", val: "user-1" },
      ],
    });
    expect(result).toEqual(rows);
  });
});

describe("getTailoredDocument", () => {
  it("filters by job, user and kind and returns the first row", async () => {
    selectWhere.mockResolvedValueOnce([{ id: "doc-1" }]);

    const result = await getTailoredDocument(mockDb, "job-1", "user-1", "resume");

    expect(selectWhere).toHaveBeenCalledWith({
      and: [
        { col: "job_id_col", val: "job-1" },
        { col: "user_id_col", val: "user-1" },
        { col: "kind_col", val: "resume" },
      ],
    });
    expect(result).toEqual({ id: "doc-1" });
  });

  it("returns undefined when no row exists", async () => {
    selectWhere.mockResolvedValueOnce([]);

    const result = await getTailoredDocument(mockDb, "job-1", "user-1", "cover_letter");

    expect(result).toBeUndefined();
  });
});

describe("upsertTailoredDocument", () => {
  it("upserts on (jobId, kind) and refreshes content + updatedAt", async () => {
    const saved = { id: "doc-1", content: "# Jane" };
    returning.mockResolvedValueOnce([saved]);

    const result = await upsertTailoredDocument(mockDb, {
      userId: "user-1",
      jobId: "job-1",
      kind: "resume",
      content: "# Jane",
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", jobId: "job-1", content: "# Jane" })
    );
    const conflictArgs = onConflictDoUpdate.mock.calls[0]?.[0];
    expect(conflictArgs.target).toEqual(["job_id_col", "kind_col"]);
    expect(conflictArgs.set.content).toBe("# Jane");
    expect(conflictArgs.set.updatedAt).toBeInstanceOf(Date);
    expect(result).toEqual(saved);
  });
});

describe("deleteTailoredDocument", () => {
  it("deletes only the given user's document of that kind and returns it", async () => {
    deleteReturning.mockResolvedValueOnce([{ id: "doc-1" }]);

    const result = await deleteTailoredDocument(mockDb, "job-1", "user-1", "cover_letter");

    expect(deleteWhere).toHaveBeenCalledWith({
      and: [
        { col: "job_id_col", val: "job-1" },
        { col: "user_id_col", val: "user-1" },
        { col: "kind_col", val: "cover_letter" },
      ],
    });
    expect(result).toEqual({ id: "doc-1" });
  });

  it("returns undefined when there was nothing to delete", async () => {
    deleteReturning.mockResolvedValueOnce([]);

    expect(await deleteTailoredDocument(mockDb, "job-1", "user-1", "resume")).toBeUndefined();
  });
});
