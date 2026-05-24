import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { profiles } from "../schema/profiles";

export async function getProfileForUser(db: Db, userId: string) {
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .then((r) => r[0]);
}
