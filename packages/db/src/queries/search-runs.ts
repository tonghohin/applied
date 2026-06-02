import { desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { searchRuns } from "../schema/search-runs";

export type NewSearchRun = typeof searchRuns.$inferInsert;
export type SearchRunUpdate = Partial<typeof searchRuns.$inferInsert>;

export async function insertSearchRun(db: Db, data: NewSearchRun) {
  return db
    .insert(searchRuns)
    .values(data)
    .returning()
    .then((r) => r[0]);
}

export async function updateSearchRun(db: Db, runId: string, updates: SearchRunUpdate) {
  return db
    .update(searchRuns)
    .set(updates)
    .where(eq(searchRuns.id, runId))
    .returning()
    .then((rows) => rows[0]);
}

export async function listSearchRuns(db: Db, userId: string) {
  return db
    .select()
    .from(searchRuns)
    .where(eq(searchRuns.userId, userId))
    .orderBy(desc(searchRuns.startedAt));
}
