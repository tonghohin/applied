import { beforeEach, describe, expect, it, vi } from "vitest";

// select chain for listJobs: select().from().where() → Promise<row[]>
const selectWhere = vi.fn();
const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: selectFrom });

// update chain: update().set().where() → Promise
const updateWhere = vi.fn().mockResolvedValue(undefined);
const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: updateSet });

const mockDb = { select: mockSelect, update: mockUpdate } as never;

vi.mock("@repo/db", () => ({
  jobs: {
    userId: "userId_col",
    id: "id_col",
    status: "status_col",
    title: "title_col",
    company: "company_col",
  },
  jobCriteria: { userId: "criteria_userId_col" },
  jobStatusEnum: { enumValues: ["pending_review", "applied", "rejected", "failed", "skipped"] },
  getJobCriteriaForUser: vi.fn(),
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

import { getJobCriteriaForUser, jobCriteria, listLatestApplyRunsByJobIds } from "@repo/db";
import { excludeCompany, excludeKeyword, excludeKeywordSchema, listJobs } from "./jobs.service";

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

  it("counts applied and rejected jobs at the same company (case-insensitive)", async () => {
    const applied1 = { ...mockJob("job-1"), company: "Acme", status: "applied" as const };
    const applied2 = { ...mockJob("job-2"), company: "acme", status: "applied" as const };
    const rejected = { ...mockJob("job-3"), company: "Acme", status: "rejected" as const };
    const other = { ...mockJob("job-4"), company: "Other Co", status: "applied" as const };

    selectWhere.mockResolvedValueOnce([applied1, applied2, rejected, other]);
    vi.mocked(listLatestApplyRunsByJobIds).mockResolvedValueOnce([]);

    const result = await listJobs(mockDb, "user-1");

    expect(result.find((j) => j.id === "job-1")?.appliedCountAtCompany).toBe(3);
    expect(result.find((j) => j.id === "job-2")?.appliedCountAtCompany).toBe(3);
    expect(result.find((j) => j.id === "job-3")?.appliedCountAtCompany).toBe(3);
    expect(result.find((j) => j.id === "job-4")?.appliedCountAtCompany).toBe(1);

    expect(result.find((j) => j.id === "job-1")?.rejectedCountAtCompany).toBe(1);
    expect(result.find((j) => j.id === "job-2")?.rejectedCountAtCompany).toBe(1);
    expect(result.find((j) => j.id === "job-3")?.rejectedCountAtCompany).toBe(1);
    expect(result.find((j) => j.id === "job-4")?.rejectedCountAtCompany).toBe(0);
  });
});

const mockCriteria = (excludeKeywords: string[], excludeCompanies: string[] = []) => ({
  id: "criteria-1",
  userId: "user-1",
  jobTitle: "Engineer",
  skills: [],
  locations: [],
  seniority: [],
  excludeKeywords,
  excludeCompanies,
  minSalary: 1,
  skipDuplicateIdentity: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("excludeKeywordSchema", () => {
  it("trims the keyword before validating length", () => {
    expect(excludeKeywordSchema.parse({ keyword: "  java  " })).toEqual({ keyword: "java" });
    expect(() => excludeKeywordSchema.parse({ keyword: " j " })).toThrow();
  });
});

describe("excludeKeyword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws PRECONDITION_FAILED when the user has no criteria row", async () => {
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(undefined);

    await expect(excludeKeyword(mockDb, "user-1", { keyword: "java" })).rejects.toMatchObject({
      name: "PRECONDITION_FAILED",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("appends the keyword to excludeKeywords when it is not present", async () => {
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(mockCriteria(["php"]));
    selectWhere.mockResolvedValueOnce([]);

    const result = await excludeKeyword(mockDb, "user-1", { keyword: "java" });

    expect(mockUpdate).toHaveBeenCalledWith(jobCriteria);
    expect(updateSet).toHaveBeenCalledWith({ excludeKeywords: ["php", "java"] });
    expect(result).toEqual({ keyword: "java", skippedCount: 0, alreadyExcluded: false });
  });

  it("does not append when the keyword already exists case-insensitively", async () => {
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(mockCriteria(["Java"]));
    selectWhere.mockResolvedValueOnce([]);

    const result = await excludeKeyword(mockDb, "user-1", { keyword: "java" });

    expect(mockUpdate).not.toHaveBeenCalledWith(jobCriteria);
    expect(result.alreadyExcluded).toBe(true);
  });

  it("skips only jobs whose titles match the keyword on word boundaries", async () => {
    const { inArray } = await import("drizzle-orm");
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(mockCriteria([]));
    selectWhere.mockResolvedValueOnce([
      { id: "job-1", title: "Java Developer" },
      { id: "job-2", title: "JavaScript Engineer" },
      { id: "job-3", title: "Senior JAVA Engineer" },
    ]);

    const result = await excludeKeyword(mockDb, "user-1", { keyword: "java" });

    expect(inArray).toHaveBeenCalledWith("status_col", ["pending_review", "failed"]);
    expect(inArray).toHaveBeenCalledWith("id_col", ["job-1", "job-3"]);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", updatedAt: expect.any(Date) })
    );
    expect(result.skippedCount).toBe(2);
  });

  it("does not update jobs when nothing matches", async () => {
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(mockCriteria([]));
    selectWhere.mockResolvedValueOnce([{ id: "job-1", title: "Rust Developer" }]);

    const result = await excludeKeyword(mockDb, "user-1", { keyword: "java" });

    // only the criteria update ran, no jobs status update
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(jobCriteria);
    expect(result.skippedCount).toBe(0);
  });
});

describe("excludeCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws PRECONDITION_FAILED when the user has no criteria row", async () => {
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(undefined);

    await expect(excludeCompany(mockDb, "user-1", { company: "Globex" })).rejects.toMatchObject({
      name: "PRECONDITION_FAILED",
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("appends the company to excludeCompanies when it is not present", async () => {
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(mockCriteria([], ["Acme"]));
    selectWhere.mockResolvedValueOnce([]);

    const result = await excludeCompany(mockDb, "user-1", { company: "Globex" });

    expect(mockUpdate).toHaveBeenCalledWith(jobCriteria);
    expect(updateSet).toHaveBeenCalledWith({ excludeCompanies: ["Acme", "Globex"] });
    expect(result).toEqual({ company: "Globex", skippedCount: 0, alreadyExcluded: false });
  });

  it("does not append when the company already exists case-insensitively", async () => {
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(mockCriteria([], ["globex"]));
    selectWhere.mockResolvedValueOnce([]);

    const result = await excludeCompany(mockDb, "user-1", { company: "Globex" });

    expect(mockUpdate).not.toHaveBeenCalledWith(jobCriteria);
    expect(result.alreadyExcluded).toBe(true);
  });

  it("skips only jobs whose companies match on word boundaries", async () => {
    const { inArray } = await import("drizzle-orm");
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(mockCriteria([]));
    selectWhere.mockResolvedValueOnce([
      { id: "job-1", company: "Globex Inc" },
      { id: "job-2", company: "Globexia" },
      { id: "job-3", company: "GLOBEX" },
    ]);

    const result = await excludeCompany(mockDb, "user-1", { company: "globex" });

    expect(inArray).toHaveBeenCalledWith("status_col", ["pending_review", "failed"]);
    expect(inArray).toHaveBeenCalledWith("id_col", ["job-1", "job-3"]);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "skipped", updatedAt: expect.any(Date) })
    );
    expect(result.skippedCount).toBe(2);
  });

  it("does not update jobs when nothing matches", async () => {
    vi.mocked(getJobCriteriaForUser).mockResolvedValueOnce(mockCriteria([]));
    selectWhere.mockResolvedValueOnce([{ id: "job-1", company: "Initech" }]);

    const result = await excludeCompany(mockDb, "user-1", { company: "Globex" });

    // only the criteria update ran, no jobs status update
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(jobCriteria);
    expect(result.skippedCount).toBe(0);
  });
});
