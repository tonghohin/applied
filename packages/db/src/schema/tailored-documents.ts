import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { tailoredDocumentKindEnum } from "./enums";
import { jobs } from "./jobs";

export { tailoredDocumentKindEnum };

export const tailoredDocuments = pgTable(
  "tailored_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: tailoredDocumentKindEnum("kind").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tailored_documents_job_id_kind_unique").on(t.jobId, t.kind)]
);

export type TailoredDocument = typeof tailoredDocuments.$inferSelect;
