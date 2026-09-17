import { describe, expect, it, vi } from "vitest";

const { mockGetLatestReleaseVersion } = vi.hoisted(() => ({
  mockGetLatestReleaseVersion: vi.fn(),
}));

vi.mock("../services/version.service", () => ({
  getLatestReleaseVersion: mockGetLatestReleaseVersion,
}));

import type { Context } from "../context";
import { systemRouter } from "./system";

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

describe("system.latestVersion", () => {
  it("returns the latest release version for an authenticated caller", async () => {
    mockGetLatestReleaseVersion.mockResolvedValueOnce("v1.2.3");

    const caller = systemRouter.createCaller(makeCtx());
    const result = await caller.latestVersion();

    expect(result).toBe("v1.2.3");
  });

  it("throws UNAUTHORIZED when session is null", async () => {
    const caller = systemRouter.createCaller({ db: {} as never, session: null } as never);
    await expect(caller.latestVersion()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
