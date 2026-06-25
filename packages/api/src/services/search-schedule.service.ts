import {
  getJobCriteriaForUser,
  getLinkedInAccount,
  getSearchScheduleForUser,
  upsertSearchSchedule,
} from "@repo/db";
import { buildSearchCronPattern, isValidTimeZone } from "@repo/shared";
import { z } from "zod";
import type { Context } from "../context";
import { getSearchQueue } from "../queues/index";

type Db = Context["db"];

export const upsertScheduleSchema = z
  .object({
    enabled: z.boolean(),
    intervalHours: z.number().int().min(1).max(8),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    timezone: z.string().refine(isValidTimeZone, "Invalid timezone"),
  })
  .refine((schedule) => schedule.startHour <= schedule.endHour, {
    message: "Start hour must not be after end hour",
    path: ["startHour"],
  });

export type UpsertScheduleInput = z.infer<typeof upsertScheduleSchema>;

export function searchSchedulerId(userId: string) {
  return `search-schedule:${userId}`;
}

export async function syncSearchScheduler(db: Db, userId: string) {
  const [schedule, criteria, linkedinAccount] = await Promise.all([
    getSearchScheduleForUser(db, userId),
    getJobCriteriaForUser(db, userId),
    getLinkedInAccount(db, userId),
  ]);

  if (schedule?.enabled && criteria && linkedinAccount) {
    await getSearchQueue().upsertJobScheduler(
      searchSchedulerId(userId),
      { pattern: buildSearchCronPattern(schedule), tz: schedule.timezone },
      { name: "scheduled-search", data: { userId } }
    );
  } else {
    await getSearchQueue().removeJobScheduler(searchSchedulerId(userId));
  }
}

export async function upsertSchedule(db: Db, userId: string, input: UpsertScheduleInput) {
  const row = await upsertSearchSchedule(db, userId, input);
  await syncSearchScheduler(db, userId);
  return row;
}
