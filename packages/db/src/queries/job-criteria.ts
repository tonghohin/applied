import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { jobCriteria } from "../schema/job-criteria";

export async function getJobCriteriaForUser(db: Db, userId: string) {
  return db
    .select()
    .from(jobCriteria)
    .where(eq(jobCriteria.userId, userId))
    .then((r) => r[0]);
}
