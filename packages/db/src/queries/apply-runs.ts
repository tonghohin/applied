import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { applyRuns } from "../schema/apply-runs";

export type NewApplyRun = typeof applyRuns.$inferInsert;
export type ApplyRunUpdate = Partial<typeof applyRuns.$inferInsert>;

export async function insertApplyRun(db: Db, data: NewApplyRun) {
  return db
    .insert(applyRuns)
    .values(data)
    .returning()
    .then((r) => r[0]);
}

export async function updateApplyRun(db: Db, runId: string, updates: ApplyRunUpdate) {
  return db
    .update(applyRuns)
    .set(updates)
    .where(eq(applyRuns.id, runId))
    .returning()
    .then((rows) => rows[0]);
}

export async function listLatestApplyRunsByJobIds(db: Db, jobIds: string[]) {
  if (jobIds.length === 0) return [];
  const rows = await db
    .select()
    .from(applyRuns)
    .where(inArray(applyRuns.jobId, jobIds))
    .orderBy(desc(applyRuns.startedAt));

  const latest = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    if (!latest.has(row.jobId)) latest.set(row.jobId, row);
  }
  return [...latest.values()];
}
