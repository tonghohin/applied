import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { jobCriteria } from "../schema/job-criteria";
import { linkedinAccounts } from "../schema/linkedin-accounts";
import { type SearchSchedule, searchSchedules } from "../schema/search-schedules";

export type SearchScheduleValues = Omit<typeof searchSchedules.$inferInsert, "id" | "userId">;

export async function getSearchScheduleForUser(db: Db, userId: string) {
  return db
    .select()
    .from(searchSchedules)
    .where(eq(searchSchedules.userId, userId))
    .then((rows) => rows[0] ?? null);
}

export async function upsertSearchSchedule(db: Db, userId: string, values: SearchScheduleValues) {
  return db
    .insert(searchSchedules)
    .values({ ...values, userId })
    .onConflictDoUpdate({ target: searchSchedules.userId, set: values })
    .returning()
    .then((rows) => rows[0]);
}

export type ScheduleSyncTarget = {
  schedule: SearchSchedule;
  hasCriteria: boolean;
  hasLinkedIn: boolean;
};

export async function listScheduleSyncTargets(db: Db): Promise<ScheduleSyncTarget[]> {
  const rows = await db
    .select({
      schedule: searchSchedules,
      criteriaId: jobCriteria.id,
      linkedinAccountId: linkedinAccounts.id,
    })
    .from(searchSchedules)
    .leftJoin(jobCriteria, eq(jobCriteria.userId, searchSchedules.userId))
    .leftJoin(linkedinAccounts, eq(linkedinAccounts.userId, searchSchedules.userId));

  return rows.map((row) => ({
    schedule: row.schedule,
    hasCriteria: row.criteriaId !== null,
    hasLinkedIn: row.linkedinAccountId !== null,
  }));
}
