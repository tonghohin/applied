import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const platformEnum = pgEnum("platform", ["linkedin"]);
export const fitTierEnum = pgEnum("fit_tier", ["strong", "potential", "weak"]);
export const jobStatusEnum = pgEnum("job_status", [
  "pending_review",
  "applied",
  "failed",
  "skipped",
]);

export const jobs = pgTable("jobs", {
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
  fitTier: fitTierEnum("fit_tier").notNull(),
  status: jobStatusEnum("status").notNull().default("pending_review"),
  appliedAt: timestamp("applied_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Job = typeof jobs.$inferSelect;
