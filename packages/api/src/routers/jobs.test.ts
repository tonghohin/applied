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

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

vi.mock("@repo/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
  jobs: {},
  jobCriteria: { userId: "userId_col" },
  profiles: { userId: "userId_col" },
  jobStatusEnum: { enumValues: ["pending_review", "applied", "failed", "skipped"] },
}));

import { jobsRouter } from "./jobs.js";
import type { Context } from "../context.js";

function makeCtx(userId = "user_1") {
  return {
    db: mockDb as unknown as Context["db"],
    session: {
      user: { id: userId, email: "test@example.com", name: "Test", emailVerified: true, createdAt: new Date(), updatedAt: new Date(), image: null },
      session: { id: "sess_1", userId, token: "tok", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), ipAddress: null, userAgent: null },
    },
  };
}

describe("jobs.search", () => {
  it("returns { queued: true } immediately", async () => {
    const selectChain1 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ jobTitles: ["SWE"], locations: ["Remote"], remote: true, skills: [] }]) };
    const selectChain2 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
    mockDb.select.mockReturnValueOnce(selectChain1).mockReturnValueOnce(selectChain2);

    const caller = jobsRouter.createCaller(makeCtx());
    const result = await caller.search();

    expect(result).toEqual({ queued: true });
  });
});
