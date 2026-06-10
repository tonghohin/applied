import { describe, expect, it, vi } from "vitest";

const {
  mockWorkerCtor,
  mockGetLinkedInAccount,
  mockUpdateApplyRun,
  mockUpdateJobFailed,
  mockProcessApplyJob,
  mockPublishEvent,
  mockForceFlush,
} = vi.hoisted(() => ({
  mockWorkerCtor: vi.fn(),
  mockGetLinkedInAccount: vi.fn().mockResolvedValue(null),
  mockUpdateApplyRun: vi.fn().mockResolvedValue(undefined),
  mockUpdateJobFailed: vi.fn().mockResolvedValue(undefined),
  mockProcessApplyJob: vi.fn(),
  mockPublishEvent: vi.fn(),
  mockForceFlush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("bullmq", () => ({
  Worker: class {
    constructor(...ctorArgs: unknown[]) {
      mockWorkerCtor(...ctorArgs);
    }
    on() {}
  },
}));

vi.mock("@repo/db", () => ({
  db: {},
  getLinkedInAccount: mockGetLinkedInAccount,
  updateApplyRun: mockUpdateApplyRun,
  updateJobFailed: mockUpdateJobFailed,
}));

vi.mock("@repo/ai", () => ({
  processApplyJob: mockProcessApplyJob,
}));

vi.mock("@repo/shared", () => ({
  decrypt: vi.fn().mockReturnValue("{}"),
}));

vi.mock("@langfuse/tracing", () => ({
  propagateAttributes: vi.fn((_attributes: unknown, callback: () => Promise<void>) => callback()),
}));

vi.mock("../env", () => ({
  env: { REDIS_URL: "redis://localhost:6379", LINKEDIN_ENCRYPTION_KEY: "test-key" },
}));

vi.mock("../otel", () => ({
  langfuseSpanProcessor: { forceFlush: mockForceFlush },
}));

vi.mock("../redis", () => ({
  publishEvent: mockPublishEvent,
}));

import "./apply.worker";

const workerCtorCall = mockWorkerCtor.mock.calls[0];
if (!workerCtorCall) throw new Error("Worker was never constructed");
const processor = workerCtorCall[1];
const jobData = { data: { jobId: "job-1", userId: "user-1", runId: "run-1" } };

describe("apply worker", () => {
  it("marks the job failed when processApplyJob throws", async () => {
    mockProcessApplyJob.mockRejectedValueOnce(new Error("gateway exploded"));

    await expect(processor(jobData)).rejects.toThrow("gateway exploded");

    expect(mockUpdateJobFailed).toHaveBeenCalledWith(
      expect.anything(),
      "job-1",
      "gateway exploded"
    );
    expect(mockUpdateApplyRun).toHaveBeenCalledWith(
      expect.anything(),
      "run-1",
      expect.objectContaining({ status: "failed", errorMessage: "gateway exploded" })
    );
  });

  it("does not touch the job row in the worker when processApplyJob resolves", async () => {
    mockUpdateJobFailed.mockClear();
    mockProcessApplyJob.mockResolvedValueOnce({ success: true });

    await processor(jobData);

    expect(mockUpdateJobFailed).not.toHaveBeenCalled();
    expect(mockUpdateApplyRun).toHaveBeenCalledWith(
      expect.anything(),
      "run-1",
      expect.objectContaining({ status: "completed" })
    );
  });
});
