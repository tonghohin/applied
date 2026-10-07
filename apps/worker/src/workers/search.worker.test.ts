import { describe, expect, it, vi } from "vitest";

const {
  mockWorkerCtor,
  mockRunSearch,
  mockGetLinkedInAccount,
  mockGetProfileForUser,
  mockGetJobCriteriaForUser,
  mockGetAiGatewayKey,
  mockScoreJob,
  mockHasActiveSearchRun,
  mockInsertSearchRun,
  mockUpdateSearchRun,
  mockSaveLinkedInSession,
  mockClearLinkedInSession,
  mockGetMissingSearchFields,
  mockPublishEvent,
} = vi.hoisted(() => ({
  mockWorkerCtor: vi.fn(),
  mockRunSearch: vi.fn().mockResolvedValue({ jobCount: 3, newSessionJson: undefined }),
  mockGetLinkedInAccount: vi.fn(),
  mockGetProfileForUser: vi.fn().mockResolvedValue({ id: "p1", resume: "My resume" }),
  mockGetJobCriteriaForUser: vi.fn().mockResolvedValue({ id: "c1" }),
  mockGetAiGatewayKey: vi.fn().mockResolvedValue("test-api-key"),
  mockScoreJob: vi.fn().mockResolvedValue({ score: 75, reasoning: "Strong skill overlap." }),
  mockHasActiveSearchRun: vi.fn().mockResolvedValue(false),
  mockInsertSearchRun: vi.fn(),
  mockUpdateSearchRun: vi
    .fn()
    .mockImplementation((_db: unknown, runId: string, updates: { status: string }) =>
      Promise.resolve({ id: runId, ...updates })
    ),
  mockSaveLinkedInSession: vi.fn().mockResolvedValue(undefined),
  mockClearLinkedInSession: vi.fn().mockResolvedValue(undefined),
  mockGetMissingSearchFields: vi.fn().mockReturnValue([]),
  mockPublishEvent: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(...ctorArgs: unknown[]) {
      mockWorkerCtor(...ctorArgs);
    }
    on() {}
  },
}));

vi.mock("@repo/automation", () => ({
  runSearch: mockRunSearch,
}));

vi.mock("@repo/api", () => ({
  getAiGatewayKey: mockGetAiGatewayKey,
}));

vi.mock("@repo/ai", async () => ({
  scoreJob: mockScoreJob,
  describeAiError: (await import("@repo/ai/errors")).describeAiError,
}));

vi.mock("@repo/db", () => ({
  getDb: () => ({}),
  clearLinkedInSession: mockClearLinkedInSession,
  getJobCriteriaForUser: mockGetJobCriteriaForUser,
  getLinkedInAccount: mockGetLinkedInAccount,
  getProfileForUser: mockGetProfileForUser,
  hasActiveSearchRun: mockHasActiveSearchRun,
  insertSearchRun: mockInsertSearchRun,
  saveLinkedInSession: mockSaveLinkedInSession,
  updateSearchRun: mockUpdateSearchRun,
}));

vi.mock("@repo/shared", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted"),
  encrypt: vi.fn().mockReturnValue("encrypted"),
  getMissingSearchFields: mockGetMissingSearchFields,
}));

vi.mock("../env", () => ({
  env: { REDIS_URL: "redis://localhost:6379", ENCRYPTION_KEY: "test-key" },
}));

vi.mock("../redis", () => ({
  publishEvent: mockPublishEvent,
}));

import "./search.worker";

const workerCtorCall = mockWorkerCtor.mock.calls[0];
if (!workerCtorCall) throw new Error("Worker was never constructed");
const processor = workerCtorCall[1] as (job: {
  data: { userId: string; runId?: string };
}) => Promise<void>;

const account = {
  id: "la1",
  userId: "user-1",
  email: "jane@example.com",
  passwordEncrypted: "enc",
  sessionEncrypted: null,
};

describe("search worker — manual run", () => {
  it("processes the provided run without creating a new one", async () => {
    mockGetLinkedInAccount.mockResolvedValueOnce(account);

    await processor({ data: { userId: "user-1", runId: "run-1" } });

    expect(mockInsertSearchRun).not.toHaveBeenCalled();
    expect(mockUpdateSearchRun).toHaveBeenCalledWith({}, "run-1", { status: "running" });
    expect(mockUpdateSearchRun).toHaveBeenCalledWith(
      {},
      "run-1",
      expect.objectContaining({ status: "completed", jobCount: 3 })
    );
  });
});

describe("search worker — scheduled tick", () => {
  it("skips when readiness fields are missing", async () => {
    mockInsertSearchRun.mockClear();
    mockRunSearch.mockClear();
    mockGetMissingSearchFields.mockReturnValueOnce(["Resume"]);

    await processor({ data: { userId: "user-1" } });

    expect(mockInsertSearchRun).not.toHaveBeenCalled();
    expect(mockRunSearch).not.toHaveBeenCalled();
  });

  it("skips when a run is already active", async () => {
    mockInsertSearchRun.mockClear();
    mockRunSearch.mockClear();
    mockGetLinkedInAccount.mockResolvedValueOnce(account);
    mockHasActiveSearchRun.mockResolvedValueOnce(true);

    await processor({ data: { userId: "user-1" } });

    expect(mockInsertSearchRun).not.toHaveBeenCalled();
    expect(mockRunSearch).not.toHaveBeenCalled();
  });

  it("creates a run, publishes it, and processes it when eligible", async () => {
    mockInsertSearchRun.mockClear();
    mockRunSearch.mockClear();
    const newRun = { id: "run-9", userId: "user-1", status: "pending" };
    mockInsertSearchRun.mockResolvedValueOnce(newRun);
    // first call: readiness check inside the tick; second call: processSearch itself
    mockGetLinkedInAccount.mockResolvedValueOnce(account).mockResolvedValueOnce(account);

    await processor({ data: { userId: "user-1" } });

    expect(mockInsertSearchRun).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: "user-1", platform: "linkedin", status: "pending" })
    );
    expect(mockPublishEvent).toHaveBeenCalledWith("user-1", {
      type: "search-run:update",
      run: newRun,
    });
    expect(mockRunSearch).toHaveBeenCalled();
    expect(mockUpdateSearchRun).toHaveBeenCalledWith(
      {},
      "run-9",
      expect.objectContaining({ status: "completed" })
    );
  });
});

describe("search worker — failures", () => {
  function failedRunUpdate() {
    return mockUpdateSearchRun.mock.calls.find(([, , values]) => values?.status === "failed")?.[2];
  }

  it("reports a rejected AI key during scoring as a Settings hint", async () => {
    mockUpdateSearchRun.mockClear();
    const keyError = new Error("\u001b[31mUnauthenticated request to AI Gateway.\u001b[0m");
    keyError.name = "GatewayAuthenticationError";
    mockRunSearch.mockRejectedValueOnce(keyError);
    mockGetLinkedInAccount.mockResolvedValueOnce(account);

    await expect(processor({ data: { userId: "user-1", runId: "run-1" } })).rejects.toThrow();

    expect(failedRunUpdate()).toMatchObject({
      errorMessage: "Your AI Gateway key was rejected. Check it in Settings → AI.",
    });
  });

  it("keeps other error messages and still clears the session on a captcha", async () => {
    mockUpdateSearchRun.mockClear();
    mockClearLinkedInSession.mockClear();
    mockRunSearch.mockRejectedValueOnce(new Error("LinkedIn showed a CAPTCHA challenge"));
    mockGetLinkedInAccount.mockResolvedValueOnce(account);

    await expect(processor({ data: { userId: "user-1", runId: "run-1" } })).rejects.toThrow();

    expect(failedRunUpdate()).toMatchObject({
      errorMessage: "LinkedIn showed a CAPTCHA challenge",
    });
    expect(mockClearLinkedInSession).toHaveBeenCalled();
  });
});
