import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  env: { LINKEDIN_ENCRYPTION_KEY: "a".repeat(64), REDIS_URL: "redis://localhost:6379" },
}));

const {
  mockUpsertJobScheduler,
  mockRemoveJobScheduler,
  mockGetSchedule,
  mockGetCriteria,
  mockGetLinkedInAccount,
  mockUpsertSearchSchedule,
} = vi.hoisted(() => ({
  mockUpsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  mockRemoveJobScheduler: vi.fn().mockResolvedValue(undefined),
  mockGetSchedule: vi.fn(),
  mockGetCriteria: vi.fn(),
  mockGetLinkedInAccount: vi.fn(),
  mockUpsertSearchSchedule: vi.fn(),
}));

vi.mock("../queues/index", () => ({
  searchQueue: {
    upsertJobScheduler: mockUpsertJobScheduler,
    removeJobScheduler: mockRemoveJobScheduler,
  },
}));

vi.mock("@repo/db", () => ({
  getSearchScheduleForUser: mockGetSchedule,
  getJobCriteriaForUser: mockGetCriteria,
  getLinkedInAccount: mockGetLinkedInAccount,
  upsertSearchSchedule: mockUpsertSearchSchedule,
}));

import { syncSearchScheduler, upsertSchedule, upsertScheduleSchema } from "./search-schedule.service";

const mockDb = {} as never;

const enabledSchedule = {
  id: "schedule-1",
  userId: "user_1",
  enabled: true,
  intervalHours: 2,
  startHour: 9,
  endHour: 17,
  days: [1, 2, 3, 4, 5],
  timezone: "America/Toronto",
};

const criteria = { id: "c1", userId: "user_1", jobTitle: "SWE" };
const linkedinAccount = { id: "la1", userId: "user_1", email: "jane@example.com" };

function resetMocks() {
  mockUpsertJobScheduler.mockClear();
  mockRemoveJobScheduler.mockClear();
}

describe("syncSearchScheduler", () => {
  it("upserts the job scheduler when enabled and eligible", async () => {
    resetMocks();
    mockGetSchedule.mockResolvedValueOnce(enabledSchedule);
    mockGetCriteria.mockResolvedValueOnce(criteria);
    mockGetLinkedInAccount.mockResolvedValueOnce(linkedinAccount);

    await syncSearchScheduler(mockDb, "user_1");

    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      "search-schedule:user_1",
      { pattern: "0 9-17/2 * * 1,2,3,4,5", tz: "America/Toronto" },
      { name: "scheduled-search", data: { userId: "user_1" } }
    );
    expect(mockRemoveJobScheduler).not.toHaveBeenCalled();
  });

  it("removes the scheduler when the schedule is disabled", async () => {
    resetMocks();
    mockGetSchedule.mockResolvedValueOnce({ ...enabledSchedule, enabled: false });
    mockGetCriteria.mockResolvedValueOnce(criteria);
    mockGetLinkedInAccount.mockResolvedValueOnce(linkedinAccount);

    await syncSearchScheduler(mockDb, "user_1");

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("search-schedule:user_1");
    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
  });

  it("removes the scheduler when no schedule row exists", async () => {
    resetMocks();
    mockGetSchedule.mockResolvedValueOnce(null);
    mockGetCriteria.mockResolvedValueOnce(criteria);
    mockGetLinkedInAccount.mockResolvedValueOnce(linkedinAccount);

    await syncSearchScheduler(mockDb, "user_1");

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("search-schedule:user_1");
    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
  });

  it("removes the scheduler when criteria are missing", async () => {
    resetMocks();
    mockGetSchedule.mockResolvedValueOnce(enabledSchedule);
    mockGetCriteria.mockResolvedValueOnce(undefined);
    mockGetLinkedInAccount.mockResolvedValueOnce(linkedinAccount);

    await syncSearchScheduler(mockDb, "user_1");

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("search-schedule:user_1");
    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
  });

  it("removes the scheduler when the LinkedIn account is missing", async () => {
    resetMocks();
    mockGetSchedule.mockResolvedValueOnce(enabledSchedule);
    mockGetCriteria.mockResolvedValueOnce(criteria);
    mockGetLinkedInAccount.mockResolvedValueOnce(undefined);

    await syncSearchScheduler(mockDb, "user_1");

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("search-schedule:user_1");
    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
  });
});

describe("upsertSchedule", () => {
  it("upserts the row then syncs the scheduler", async () => {
    resetMocks();
    const input = {
      enabled: true,
      intervalHours: 2,
      startHour: 9,
      endHour: 17,
      days: [1, 2, 3, 4, 5],
      timezone: "America/Toronto",
    };
    mockUpsertSearchSchedule.mockResolvedValueOnce(enabledSchedule);
    mockGetSchedule.mockResolvedValueOnce(enabledSchedule);
    mockGetCriteria.mockResolvedValueOnce(criteria);
    mockGetLinkedInAccount.mockResolvedValueOnce(linkedinAccount);

    const row = await upsertSchedule(mockDb, "user_1", input);

    expect(mockUpsertSearchSchedule).toHaveBeenCalledWith(mockDb, "user_1", input);
    expect(mockUpsertJobScheduler).toHaveBeenCalled();
    expect(row).toEqual(enabledSchedule);
  });
});

describe("upsertScheduleSchema", () => {
  const validInput = {
    enabled: true,
    intervalHours: 2,
    startHour: 9,
    endHour: 17,
    days: [1, 2, 3, 4, 5],
    timezone: "America/Toronto",
  };

  it("accepts a valid input", () => {
    expect(upsertScheduleSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects an invalid timezone", () => {
    const result = upsertScheduleSchema.safeParse({ ...validInput, timezone: "Not/AZone" });
    expect(result.success).toBe(false);
  });

  it("rejects startHour after endHour", () => {
    const result = upsertScheduleSchema.safeParse({ ...validInput, startHour: 18 });
    expect(result.success).toBe(false);
  });

  it("rejects empty days", () => {
    const result = upsertScheduleSchema.safeParse({ ...validInput, days: [] });
    expect(result.success).toBe(false);
  });
});
