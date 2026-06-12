import { describe, expect, it, vi } from "vitest";

const limitMock = vi.fn();
const whereMock = vi.fn();
const secondLeftJoin = vi.fn();
const firstLeftJoin = vi.fn().mockReturnValue({ leftJoin: secondLeftJoin });
const fromMock = vi.fn().mockReturnValue({ where: whereMock, leftJoin: firstLeftJoin });
const selectMock = vi.fn().mockReturnValue({ from: fromMock });

const returningMock = vi.fn();
const onConflictDoUpdate = vi.fn().mockReturnValue({ returning: returningMock });
const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate });
const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

const mockDb = {
  select: selectMock,
  insert: insertMock,
} as never;

vi.mock("../schema/search-schedules", () => ({
  searchSchedules: { userId: "schedule_userId_col" },
}));

vi.mock("../schema/job-criteria", () => ({
  jobCriteria: { id: "criteria_id_col", userId: "criteria_userId_col" },
}));

vi.mock("../schema/linkedin-accounts", () => ({
  linkedinAccounts: { id: "linkedin_id_col", userId: "linkedin_userId_col" },
}));

vi.mock("../schema/search-runs", () => ({
  searchRuns: { id: "run_id_col", userId: "run_userId_col", status: "run_status_col" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
  desc: vi.fn((col: unknown) => col),
}));

import { hasActiveSearchRun } from "./search-runs";
import {
  getSearchScheduleForUser,
  listScheduleSyncTargets,
  upsertSearchSchedule,
} from "./search-schedules";
import type { SearchScheduleValues } from "./search-schedules";

const scheduleValues: SearchScheduleValues = {
  enabled: true,
  intervalHours: 2,
  startHour: 9,
  endHour: 17,
  days: [1, 2, 3, 4, 5],
  timezone: "America/Toronto",
};

describe("getSearchScheduleForUser", () => {
  it("returns the user's schedule row", async () => {
    const row = { id: "schedule-1", userId: "user-1", ...scheduleValues };
    whereMock.mockResolvedValueOnce([row]);

    const result = await getSearchScheduleForUser(mockDb, "user-1");

    expect(result).toEqual(row);
  });

  it("returns null when the user has no schedule", async () => {
    whereMock.mockResolvedValueOnce([]);

    const result = await getSearchScheduleForUser(mockDb, "user-1");

    expect(result).toBeNull();
  });
});

describe("upsertSearchSchedule", () => {
  it("inserts with onConflictDoUpdate on userId and returns the row", async () => {
    const row = { id: "schedule-1", userId: "user-1", ...scheduleValues };
    returningMock.mockResolvedValueOnce([row]);

    const result = await upsertSearchSchedule(mockDb, "user-1", scheduleValues);

    expect(valuesMock).toHaveBeenCalledWith({ ...scheduleValues, userId: "user-1" });
    expect(onConflictDoUpdate).toHaveBeenCalledWith({
      target: "schedule_userId_col",
      set: scheduleValues,
    });
    expect(result).toEqual(row);
  });
});

describe("listScheduleSyncTargets", () => {
  it("maps joined ids to hasCriteria/hasLinkedIn booleans", async () => {
    const schedule = { id: "schedule-1", userId: "user-1", ...scheduleValues };
    secondLeftJoin.mockResolvedValueOnce([
      { schedule, criteriaId: "criteria-1", linkedinAccountId: null },
      { schedule, criteriaId: null, linkedinAccountId: "linkedin-1" },
    ]);

    const result = await listScheduleSyncTargets(mockDb);

    expect(result).toEqual([
      { schedule, hasCriteria: true, hasLinkedIn: false },
      { schedule, hasCriteria: false, hasLinkedIn: true },
    ]);
  });

  it("returns an empty array when no schedules exist", async () => {
    secondLeftJoin.mockResolvedValueOnce([]);

    const result = await listScheduleSyncTargets(mockDb);

    expect(result).toEqual([]);
  });
});

describe("hasActiveSearchRun", () => {
  it("returns true when a pending or running run exists", async () => {
    whereMock.mockReturnValueOnce({ limit: limitMock });
    limitMock.mockResolvedValueOnce([{ id: "run-1" }]);

    const result = await hasActiveSearchRun(mockDb, "user-1");

    expect(result).toBe(true);
  });

  it("returns false when no active run exists", async () => {
    whereMock.mockReturnValueOnce({ limit: limitMock });
    limitMock.mockResolvedValueOnce([]);

    const result = await hasActiveSearchRun(mockDb, "user-1");

    expect(result).toBe(false);
  });
});
