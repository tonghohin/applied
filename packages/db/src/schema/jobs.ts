import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { fitTierEnum, jobStatusEnum, platformEnum, workplaceTypeEnum } from "./enums";
import { searchRuns } from "./search-runs";

export { fitTierEnum, jobStatusEnum, platformEnum, workplaceTypeEnum };

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    description: text("description"),
    url: text("url").notNull(),
    platform: platformEnum("platform").notNull(),
    workplaceType: workplaceTypeEnum("workplace_type").notNull().default("on-site"),
    fitTier: fitTierEnum("fit_tier").notNull(),
    status: jobStatusEnum("status").notNull().default("pending_review"),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    appliedAt: timestamp("applied_at"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("jobs_user_id_url_unique").on(t.userId, t.url)]
);

export type Job = typeof jobs.$inferSelect;
