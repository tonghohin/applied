import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  env: { LINKEDIN_ENCRYPTION_KEY: "a".repeat(64) },
}));

const {
  mockGetLinkedInAccount,
  mockUpsertLinkedInAccount,
} = vi.hoisted(() => ({
  mockGetLinkedInAccount: vi.fn().mockResolvedValue(null),
  mockUpsertLinkedInAccount: vi.fn().mockResolvedValue(undefined),
}));

const mockInsertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};

const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn(),
};

const mockDb = {
  select: vi.fn(() => mockSelectChain),
  insert: vi.fn(() => mockInsertChain),
};

vi.mock("@repo/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  profiles: { userId: "userId_col" },
  jobCriteria: { userId: "userId_col" },
  WORK_TYPES: ["on-site", "remote", "hybrid"],
  getLinkedInAccount: mockGetLinkedInAccount,
  upsertLinkedInAccount: mockUpsertLinkedInAccount,
}));

import { decrypt } from "@repo/shared";
import type { Context } from "../context";
import { profileRouter } from "./profile";

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

describe("profile.getProfile", () => {
  it("returns profile and criteria for the user", async () => {
    const fakeProfile = { id: "p1", userId: "user_1", firstName: "Jane" };
    const fakeCriteria = { id: "c1", userId: "user_1", jobTitles: ["SWE"] };
    const fakeAccount = { id: "la1", userId: "user_1", email: "jane@example.com" };

    const selectChain1 = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([fakeProfile]),
    };
    const selectChain2 = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([fakeCriteria]),
    };
    mockDb.select.mockReturnValueOnce(selectChain1).mockReturnValueOnce(selectChain2);
    mockGetLinkedInAccount.mockResolvedValueOnce(fakeAccount);

    const caller = profileRouter.createCaller(makeCtx());
    const result = await caller.getProfile();

    expect(result.profile).toMatchObject({ firstName: "Jane" });
    expect(result.criteria).toMatchObject({ jobTitles: ["SWE"] });
    expect(result.linkedinAccount).toMatchObject({ email: "jane@example.com" });
  });

  it("returns null when no data exists", async () => {
    const empty1 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
    const empty2 = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
    mockDb.select.mockReturnValueOnce(empty1).mockReturnValueOnce(empty2);
    mockGetLinkedInAccount.mockResolvedValueOnce(null);

    const caller = profileRouter.createCaller(makeCtx());
    const result = await caller.getProfile();

    expect(result.profile).toBeNull();
    expect(result.criteria).toBeNull();
    expect(result.linkedinAccount).toBeNull();
  });
});

describe("profile.upsertLinkedIn", () => {
  it("encrypts linkedin credentials before storing", async () => {
    mockUpsertLinkedInAccount.mockClear();

    const caller = profileRouter.createCaller(makeCtx());
    await caller.upsertLinkedIn({
      linkedinEmail: "jane@example.com",
      linkedinPassword: "secret",
    });

    expect(mockUpsertLinkedInAccount).toHaveBeenCalledOnce();
    const [, , { email, passwordEncrypted }] = mockUpsertLinkedInAccount.mock.calls[0] as [
      unknown,
      unknown,
      { email: string; passwordEncrypted: string },
    ];
    expect(email).toBe("jane@example.com");
    expect(decrypt(passwordEncrypted, "a".repeat(64))).toBe("secret");
  });
});

describe("profile.upsertCriteria", () => {
  it("stores job criteria for the user", async () => {
    const chain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "c1", userId: "user_1" }]),
    };
    mockDb.insert.mockReturnValueOnce(chain);

    const caller = profileRouter.createCaller(makeCtx());
    const result = await caller.upsertCriteria({
      jobTitles: ["Software Engineer"],
      skills: ["TypeScript"],
      locations: [{ location: "Toronto", workTypes: ["hybrid", "remote"] }],
      seniority: ["Senior"],
      minSalary: 120000,
    });

    expect(result).toMatchObject({ id: "c1" });
  });
});
