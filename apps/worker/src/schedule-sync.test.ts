import { describe, expect, it, vi } from "vitest";

const { mockUpsertJobScheduler, mockRemoveJobScheduler, mockListScheduleSyncTargets } = vi.hoisted(
  () => ({
    mockUpsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    mockRemoveJobScheduler: vi.fn().mockResolvedValue(undefined),
    mockListScheduleSyncTargets: vi.fn(),
  })
);

vi.mock("bullmq", () => ({
  Queue: class {
    upsertJobScheduler = mockUpsertJobScheduler;
    removeJobScheduler = mockRemoveJobScheduler;
  },
}));

vi.mock("@repo/db", () => ({
  getDb: () => ({}),
  listScheduleSyncTargets: mockListScheduleSyncTargets,
}));

vi.mock("./env", () => ({
  env: { REDIS_URL: "redis://localhost:6379", LINKEDIN_ENCRYPTION_KEY: "test-key" },
}));

import { syncAllSearchSchedulers } from "./schedule-sync";

const baseSchedule = {
  id: "schedule-1",
  userId: "user-1",
  enabled: true,
  intervalHours: 2,
  startHour: 9,
  endHour: 17,
  days: [1, 2, 3, 4, 5],
  timezone: "America/Toronto",
};

describe("syncAllSearchSchedulers", () => {
  it("upserts schedulers for enabled eligible users and removes the rest", async () => {
    mockUpsertJobScheduler.mockClear();
    mockRemoveJobScheduler.mockClear();
    mockListScheduleSyncTargets.mockResolvedValueOnce([
      { schedule: baseSchedule, hasCriteria: true, hasLinkedIn: true },
      {
        schedule: { ...baseSchedule, id: "schedule-2", userId: "user-2", enabled: false },
        hasCriteria: true,
        hasLinkedIn: true,
      },
      {
        schedule: { ...baseSchedule, id: "schedule-3", userId: "user-3" },
        hasCriteria: false,
        hasLinkedIn: true,
      },
    ]);

    await syncAllSearchSchedulers();

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      "search-schedule:user-1",
      { pattern: "0 9-17/2 * * 1,2,3,4,5", tz: "America/Toronto" },
      { name: "scheduled-search", data: { userId: "user-1" } }
    );
    expect(mockRemoveJobScheduler).toHaveBeenCalledTimes(2);
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("search-schedule:user-2");
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("search-schedule:user-3");
  });

  it("does nothing when there are no schedule rows", async () => {
    mockUpsertJobScheduler.mockClear();
    mockRemoveJobScheduler.mockClear();
    mockListScheduleSyncTargets.mockResolvedValueOnce([]);

    await syncAllSearchSchedulers();

    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
    expect(mockRemoveJobScheduler).not.toHaveBeenCalled();
  });
});
