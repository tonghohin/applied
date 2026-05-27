import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { linkedinAccounts } from "../schema/linkedin-accounts";

export async function getLinkedInAccount(db: Db, userId: string) {
  return db
    .select()
    .from(linkedinAccounts)
    .where(eq(linkedinAccounts.userId, userId))
    .then((r) => r[0] ?? null);
}

export async function upsertLinkedInAccount(
  db: Db,
  userId: string,
  values: { email: string; passwordEncrypted: string }
): Promise<void> {
  await db
    .insert(linkedinAccounts)
    .values({ userId, ...values, createdAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: linkedinAccounts.userId,
      set: {
        email: values.email,
        passwordEncrypted: values.passwordEncrypted,
        updatedAt: new Date(),
      },
    });
}

export async function saveLinkedInSession(
  db: Db,
  userId: string,
  sessionEncrypted: string
): Promise<void> {
  await db
    .update(linkedinAccounts)
    .set({ sessionEncrypted, updatedAt: new Date() })
    .where(eq(linkedinAccounts.userId, userId));
}

export async function clearLinkedInSession(db: Db, userId: string): Promise<void> {
  await db
    .update(linkedinAccounts)
    .set({ sessionEncrypted: null, updatedAt: new Date() })
    .where(eq(linkedinAccounts.userId, userId));
}
