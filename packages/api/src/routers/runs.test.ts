import { describe, expect, it, vi } from "vitest";

const { mockListSearchRuns } = vi.hoisted(() => ({
  mockListSearchRuns: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  listSearchRuns: mockListSearchRuns,
}));

import type { Context } from "../context";
import { runsRouter } from "./runs";

function makeCtx(userId = "user_1") {
  return {
    db: {} as unknown as Context["db"],
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

const mockRun = {
  id: "run-1",
  userId: "user_1",
  platform: "linkedin" as const,
  status: "completed" as const,
  startedAt: new Date("2026-01-01T10:00:00Z"),
  completedAt: new Date("2026-01-01T10:05:00Z"),
  jobCount: 12,
  errorMessage: null,
  searchCriteria: null,
};

describe("runs.list", () => {
  it("returns the list of runs for the authenticated user", async () => {
    mockListSearchRuns.mockResolvedValueOnce([mockRun]);

    const caller = runsRouter.createCaller(makeCtx());
    const result = await caller.list();

    expect(result).toEqual([mockRun]);
    expect(mockListSearchRuns).toHaveBeenCalledWith({}, "user_1");
  });

  it("returns an empty array when no runs exist", async () => {
    mockListSearchRuns.mockResolvedValueOnce([]);

    const caller = runsRouter.createCaller(makeCtx());
    const result = await caller.list();

    expect(result).toEqual([]);
  });

  it("throws UNAUTHORIZED when session is null", async () => {
    const caller = runsRouter.createCaller({ db: {} as never, session: null } as never);
    await expect(caller.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
