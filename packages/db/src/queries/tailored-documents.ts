import type { TailoredDocumentKind } from "@repo/shared";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { tailoredDocuments } from "../schema/tailored-documents";

export type TailoredDocumentValues = Pick<
  typeof tailoredDocuments.$inferInsert,
  "userId" | "jobId" | "kind" | "content"
>;

export async function getTailoredDocumentsForJob(db: Db, jobId: string, userId: string) {
  return db
    .select()
    .from(tailoredDocuments)
    .where(and(eq(tailoredDocuments.jobId, jobId), eq(tailoredDocuments.userId, userId)));
}

export async function getTailoredDocument(
  db: Db,
  jobId: string,
  userId: string,
  kind: TailoredDocumentKind
) {
  return db
    .select()
    .from(tailoredDocuments)
    .where(
      and(
        eq(tailoredDocuments.jobId, jobId),
        eq(tailoredDocuments.userId, userId),
        eq(tailoredDocuments.kind, kind)
      )
    )
    .then((rows) => rows[0]);
}

export async function upsertTailoredDocument(db: Db, values: TailoredDocumentValues) {
  const updatedAt = new Date();
  return db
    .insert(tailoredDocuments)
    .values({ ...values, updatedAt })
    .onConflictDoUpdate({
      target: [tailoredDocuments.jobId, tailoredDocuments.kind],
      set: { content: values.content, updatedAt },
    })
    .returning()
    .then((rows) => rows[0]);
}

export async function deleteTailoredDocument(
  db: Db,
  jobId: string,
  userId: string,
  kind: TailoredDocumentKind
) {
  return db
    .delete(tailoredDocuments)
    .where(
      and(
        eq(tailoredDocuments.jobId, jobId),
        eq(tailoredDocuments.userId, userId),
        eq(tailoredDocuments.kind, kind)
      )
    )
    .returning()
    .then((rows) => rows[0]);
}
