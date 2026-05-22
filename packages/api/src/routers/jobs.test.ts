import { describe, expect, it, vi } from "vitest";

vi.mock("../env.js", () => ({
  env: { LINKEDIN_ENCRYPTION_KEY: "a".repeat(64) },
}));

vi.mock("@repo/automation", () => ({
  browserManager: { getBrowser: vi.fn(), close: vi.fn() },
  loginToLinkedIn: vi.fn(),
  scrapeLinkedInJobs: vi.fn().mockResolvedValue([]),
  scoreJob: vi.fn().mockReturnValue("potential"),
}));

vi.mock("@repo/ai", () => ({
  applyToJob: vi.fn().mockResolvedValue({ success: true }),
}));

const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn().mockReturnValue(updateChain),
};

vi.mock("@repo/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
  jobs: { userId: "userId_col", id: "id_col" },
  jobCriteria: { userId: "userId_col" },
  profiles: { userId: "userId_col" },
  jobStatusEnum: { enumValues: ["pending_review", "applied", "failed", "skipped"] },
}));

import type { Context } from "../context.js";
import { jobsRouter } from "./jobs.js";

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
  it("returns { queued: true } immediately", async () => {
    const jobId = "550e8400-e29b-41d4-a716-446655440001";
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: jobId, userId: "user_1", status: "pending_review" }]),
    };
    const profileChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ id: "profile-1" }]),
    };
    mockDb.select.mockReturnValueOnce(selectChain).mockReturnValueOnce(profileChain);

    const caller = jobsRouter.createCaller(makeCtx());
    const result = await caller.applyJobs({ jobIds: [jobId] });

    expect(result).toEqual({ queued: true });
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
  it("returns { queued: true } immediately", async () => {
    const selectChain1 = {
      from: vi.fn().mockReturnThis(),
      where: vi
        .fn()
        .mockResolvedValue([
          { jobTitles: ["SWE"], locations: ["Remote"], remote: true, skills: [] },
        ]),
    };
    const selectChain2 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
    mockDb.select.mockReturnValueOnce(selectChain1).mockReturnValueOnce(selectChain2);

    const caller = jobsRouter.createCaller(makeCtx());
    const result = await caller.search();

    expect(result).toEqual({ queued: true });
  });
});
