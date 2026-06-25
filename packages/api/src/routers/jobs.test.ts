import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  env: { LINKEDIN_ENCRYPTION_KEY: "a".repeat(64), REDIS_URL: "redis://localhost:6379" },
}));

const {
  mockSearchAdd,
  mockApplyAdd,
  mockGetProfile,
  mockGetCriteria,
  mockGetLinkedInAccount,
  mockInsertApplyRun,
  mockInsertSearchRun,
  mockUpdateJobApplying,
} = vi.hoisted(() => ({
  mockSearchAdd: vi.fn().mockResolvedValue(undefined),
  mockApplyAdd: vi.fn().mockResolvedValue(undefined),
  mockGetProfile: vi.fn(),
  mockGetCriteria: vi.fn(),
  mockGetLinkedInAccount: vi.fn(),
  mockInsertApplyRun: vi.fn().mockImplementation((_db: unknown, data: { jobId: string; userId: string }) =>
    Promise.resolve({ id: "run-1", jobId: data.jobId, userId: data.userId, status: "pending" })
  ),
  mockInsertSearchRun: vi.fn().mockResolvedValue({ id: "run-1", userId: "user_1", status: "pending" }),
  mockUpdateJobApplying: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../queues/index", () => ({
  searchQueue: { add: mockSearchAdd },
  applyQueue: { add: mockApplyAdd },
}));

const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn().mockReturnValue(updateChain),
};

const completeProfile = {
  id: "p1",
  userId: "user_1",
  firstName: "Jane",
  lastName: "Doe",
  phone: "555",
  address: "123 Main",
  resume: "Resume",
  coverLetterInstructions: null,
};

const completeLinkedInAccount = {
  id: "la1",
  userId: "user_1",
  email: "jane@example.com",
  passwordEncrypted: "enc_pass",
  sessionEncrypted: null,
};

const completeCriteria = {
  id: "c1",
  userId: "user_1",
  jobTitle: "SWE",
  skills: ["TypeScript"],
  locations: [{ location: "Toronto", workTypes: ["remote"] }],
};

vi.mock("@repo/db", () => ({
  getDb: () => ({ select: vi.fn(), insert: vi.fn() }),
  jobs: { userId: "userId_col", id: "id_col" },
  jobCriteria: { userId: "userId_col" },
  profiles: { userId: "userId_col" },
  jobStatusEnum: { enumValues: ["pending_review", "applied", "rejected", "failed", "skipped"] },
  getProfileForUser: mockGetProfile,
  getJobCriteriaForUser: mockGetCriteria,
  getLinkedInAccount: mockGetLinkedInAccount,
  insertApplyRun: mockInsertApplyRun,
  insertSearchRun: mockInsertSearchRun,
  updateJobApplying: mockUpdateJobApplying,
}));

import type { Context } from "../context";
import { jobsRouter } from "./jobs";

function makeCtx(userId = "user_1") {
  return {
    db: mockDb as unknown as Context["db"],
    session: {
      user: {
        id: userId,
        email: "test@example.com",
        name: "Test",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
      },
      session: {
        id: "sess_1",
        userId,
        token: "tok",
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
      },
    },
  };
}

describe("jobs.applyJobs", () => {
  it("enqueues apply jobs and returns { queued: true }", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440001";
    mockApplyAdd.mockClear();

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: jobId, userId: "user_1", status: "pending_review" }]),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    const caller = jobsRouter.createCaller(makeCtx());
    const result = await caller.applyJobs({ jobIds: [jobId] });

    expect(result).toEqual({ queued: true });
    expect(mockApplyAdd).toHaveBeenCalledOnce();
    expect(mockApplyAdd).toHaveBeenCalledWith("apply", { jobId, userId: "user_1", runId: "run-1" });
  });

  it("enqueues apply job for a failed job", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440003";
    mockApplyAdd.mockClear();

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: jobId, userId: "user_1", status: "failed" }]),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    const caller = jobsRouter.createCaller(makeCtx());
    const result = await caller.applyJobs({ jobIds: [jobId] });

    expect(result).toEqual({ queued: true });
    expect(mockApplyAdd).toHaveBeenCalledOnce();
    expect(mockApplyAdd).toHaveBeenCalledWith("apply", { jobId, userId: "user_1", runId: "run-1" });
  });

  it("throws FORBIDDEN when job belongs to another user", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440002";
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    };
    mockDb.select.mockReturnValueOnce(selectChain);

    const caller = jobsRouter.createCaller(makeCtx());
    await expect(caller.applyJobs({ jobIds: [jobId] })).rejects.toThrow();
  });
});

describe("jobs.search", () => {
  it("enqueues a search job and returns { queued: true } when profile is complete", async () => {
    mockSearchAdd.mockClear();
    mockGetProfile.mockResolvedValue(completeProfile);
    mockGetCriteria.mockResolvedValue(completeCriteria);
    mockGetLinkedInAccount.mockResolvedValue(completeLinkedInAccount);

    const caller = jobsRouter.createCaller(makeCtx());
    const result = await caller.search();

    expect(result).toEqual({ queued: true });
    expect(mockSearchAdd).toHaveBeenCalledOnce();
    expect(mockSearchAdd).toHaveBeenCalledWith("search", { userId: "user_1", runId: "run-1" });
  });

  it("throws PRECONDITION_FAILED when required fields are missing", async () => {
    mockSearchAdd.mockClear();
    mockGetProfile.mockResolvedValue(null);
    mockGetCriteria.mockResolvedValue(null);
    mockGetLinkedInAccount.mockResolvedValue(null);

    const caller = jobsRouter.createCaller(makeCtx());
    await expect(caller.search()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockSearchAdd).not.toHaveBeenCalled();
  });
});
